// Motion helpers: Apple-style screen transitions (View Transitions API) and interactive glass.
//
// Screen transitions follow iOS navigation:
//   push  – a deeper screen slides in from the right, the old one slides left by a third and dims (parallax)
//   pop   – the reverse
//   tab   – switching top-level sections: a quick crossfade (tabs don't slide on iOS)
//   sheet – a modal screen (Add) rises from the bottom; "unsheet" sinks back down
//   zoom  – "Start session" expands into the full-screen reviewer (iOS 18 zoom transition)
//   card  – reviewer: the answered card leaves in the direction of the answer, the next card rises in
// With Reduce Motion every kind becomes a short crossfade (Apple: replace motion with a dissolve).
import { flushSync } from "react-dom";

export type NavKind = "push" | "pop" | "tab" | "sheet" | "unsheet" | "zoom" | "unzoom" | "card-good" | "card-again" | "card";

export const reducedMotion = (): boolean =>
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

type VTDocument = Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void>; skipTransition: () => void } };

let running: { skipTransition: () => void } | null = null;

/** Run a state change as an animated screen transition (falls back to an instant change). */
export function transition(kind: NavKind, update: () => void): void {
  const doc = document as VTDocument;
  if (!doc.startViewTransition) {
    update();
    return;
  }
  // a new transition interrupts the old one immediately (never make people wait)
  running?.skipTransition();
  const root = document.documentElement;
  root.dataset.nav = reducedMotion() ? "fade" : kind;
  try {
    const vt = doc.startViewTransition(() => flushSync(update));
    running = vt;
    vt.finished.finally(() => {
      if (running === vt) {
        running = null;
        delete root.dataset.nav;
      }
    });
  } catch {
    update();
  }
}

// ---------- interactive glass ----------
// Liquid Glass "illuminates from within, starting right under your fingertip" and flexes on touch.
// We set --px/--py (pointer position inside the control) and a .pressed class; CSS does the rest.
const INTERACTIVE = "button, .rail-item, .option, .tile, .decklist tr, .course-card";

function local(el: HTMLElement, e: PointerEvent) {
  const r = el.getBoundingClientRect();
  el.style.setProperty("--px", `${e.clientX - r.left}px`);
  el.style.setProperty("--py", `${e.clientY - r.top}px`);
}

export function installInteractiveGlass(): void {
  let pressed: HTMLElement | null = null;
  const release = () => {
    if (!pressed) return;
    const el = pressed;
    pressed = null;
    el.classList.remove("pressed");
    el.classList.add("released"); // spring back with a little overshoot
    setTimeout(() => el.classList.remove("released"), 450);
  };
  document.addEventListener(
    "pointerdown",
    (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>(INTERACTIVE);
      if (!el || (el as HTMLButtonElement).disabled) return;
      local(el, e);
      pressed = el;
      el.classList.remove("released");
      el.classList.add("pressed");
    },
    { passive: true },
  );
  document.addEventListener("pointerup", release, { passive: true });
  document.addEventListener("pointercancel", release, { passive: true });
  // pointer devices: the specular highlight follows the cursor over glass controls
  document.addEventListener(
    "pointermove",
    (e) => {
      if (e.pointerType !== "mouse") return;
      const el = (e.target as HTMLElement).closest<HTMLElement>("button");
      if (el) local(el, e);
    },
    { passive: true },
  );
}

/** Long press (≈0.5 s, as iOS) that is cancelled by movement or an early release. */
export function longPress(onFire: (x: number, y: number) => void, ms = 480) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let start: { x: number; y: number } | null = null;
  const cancel = () => {
    clearTimeout(timer);
    start = null;
  };
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      start = { x: e.clientX, y: e.clientY };
      const { clientX, clientY } = e;
      timer = setTimeout(() => {
        start = null;
        onFire(clientX, clientY);
      }, ms);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    onContextMenu: (e: React.MouseEvent) => {
      // right-click / two-finger click opens the same menu on desktop
      e.preventDefault();
      cancel();
      onFire(e.clientX, e.clientY);
    },
  };
}
