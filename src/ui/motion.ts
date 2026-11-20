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

type VT = { finished: Promise<void>; ready: Promise<void>; updateCallbackDone: Promise<void>; skipTransition: () => void };
type VTDocument = Document & { startViewTransition?: (cb: () => void) => VT };

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
    // an interrupted transition rejects `ready` ("Transition was skipped"): expected, not an error
    vt.ready.catch(() => {});
    vt.updateCallbackDone.catch(() => {});
    vt.finished
      .catch(() => {})
      .finally(() => {
        if (running === vt) {
          running = null;
          delete root.dataset.nav;
        }
      });
  } catch {
    update();
  }
}

// ---------- input is never blocked by a transition ----------
// While a view transition runs, browsers hit-test every press to <html> (the snapshots cover the page), so
// a tap during the ~0.3–0.6 s animation would be lost. Apple: animations are interruptible and never make
// people wait. So a press that lands on the root mid-transition finishes the transition at once and is
// handed to the element really under the finger; the click the browser then aims at <html> is redirected too.
export function installTapThrough(): void {
  const root = document.documentElement;
  let redirected: { el: Element; id: number } | null = null;
  // the browser chose touch-action from <html> ("auto": it may pan anything); honour the real element's instead
  let block: { mode: "x" | "all"; x: number; y: number } | null = null;
  const touchActionOf = (el: Element): "x" | "all" | null => {
    for (let n: Element | null = el; n; n = n.parentElement) {
      const ta = getComputedStyle(n).touchAction;
      if (ta === "none") return "all";
      if (ta.includes("pan-y") && !ta.includes("pan-x")) return "x"; // horizontal moves belong to the app
      if (ta.includes("pan-x") && !ta.includes("pan-y")) return "all";
    }
    return null;
  };
  window.addEventListener(
    "pointerdown",
    (e) => {
      if (!running || e.target !== root) return;
      running.skipTransition(); // synchronous: the live page is hit-testable again
      running = null;
      delete root.dataset.nav;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || el === root) return;
      e.stopImmediatePropagation();
      redirected = { el, id: e.pointerId };
      el.dispatchEvent(new PointerEvent("pointerdown", e));
      // touch is implicitly captured by the element first pressed (<html> here): move that to the real one
      if (e.pointerType !== "mouse") {
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          /* pointer already released */
        }
        const mode = touchActionOf(el);
        block = mode ? { mode, x: e.clientX, y: e.clientY } : null;
      }
    },
    true,
  );
  window.addEventListener(
    "touchmove",
    (e) => {
      if (!block || !e.cancelable || e.touches.length !== 1) return;
      const t = e.touches[0];
      if (block.mode === "all" || Math.abs(t.clientX - block.x) > Math.abs(t.clientY - block.y)) e.preventDefault();
    },
    { passive: false },
  );
  const endTouch = () => (block = null);
  window.addEventListener("touchend", endTouch, true);
  window.addEventListener("touchcancel", endTouch, true);
  window.addEventListener("pointercancel", (e) => redirected?.id === e.pointerId && (redirected = null), true);
  window.addEventListener(
    "click",
    (e) => {
      const r = redirected;
      redirected = null;
      if (!r || e.target !== root) return;
      const at = document.elementFromPoint(e.clientX, e.clientY);
      if (!at || !(at === r.el || r.el.contains(at) || at.contains(r.el))) return; // moved off: no click, like a real tap
      e.stopImmediatePropagation();
      r.el.dispatchEvent(new MouseEvent("click", e));
    },
    true,
  );
}

// ---------- interactive glass ----------
// Liquid Glass "illuminates from within, starting right under your fingertip" and flexes on touch.
// We set --px/--py (pointer position inside the control) and a .pressed class; CSS does the rest.
const INTERACTIVE = "button, .rail-item, .option, .tile, .decklist tr, .course-card, .hero.story, .tile-card, .side-item";

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

/** Which design to show: the saved preference, else a page-level default (the iOS preview sets one), else Focus. */
export function currentDesign(pref?: "focus" | "glass"): "focus" | "glass" {
  return pref ?? ((window as unknown as { __voclaDefaultDesign?: "focus" | "glass" }).__voclaDefaultDesign ?? "focus");
}

/** Phone layout: a narrow screen, or the iOS preview page (an iPhone frame shown on a desktop browser). */
export function phoneLayout(): boolean {
  return (
    (typeof matchMedia !== "undefined" && matchMedia("(max-width: 760px)").matches) ||
    document.documentElement.classList.contains("ios-preview")
  );
}
