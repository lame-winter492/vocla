// Modal sheet / dialog.
// Phone: an inset glass sheet that rises with a spring and can be dragged down to dismiss, like an iOS
// sheet: pull from the top edge, or pull down on the content while it's scrolled to the top. Rubber-band
// resistance upward; dismiss past a distance or on a quick downward flick, else spring back.
// Desktop: a centered dialog that pops in. Closing always animates out before unmounting.
//
// Touch goes through non-passive touch listeners rather than pointer events: the sheet scrolls
// vertically (touch-action: pan-y), so the browser would claim a vertical pan and cancel the pointer
// stream before we could decide. Here we decide on the first move and preventDefault only when the
// gesture is ours. Mouse drags (the iOS preview on desktop) use pointer events.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { phoneLayout as phone, reducedMotion } from "./motion";
const GRAB = 64; // the top edge of the sheet always drags

type Drag = { y: number; t: number; dy: number; v: number; fromTop: boolean; decided: boolean };

export function Modal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const [closing, setClosing] = useState(false);
  const sheet = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const closingRef = useRef(false);
  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    setTimeout(() => closeRef.current(), reducedMotion() ? 120 : 220);
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        requestClose();
      }
    };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [requestClose]);

  // ---- drag to dismiss ----
  const drag = useRef<Drag | null>(null);

  const start = (clientY: number, target: EventTarget | null): void => {
    const el = sheet.current;
    if (!el || !phone() || closingRef.current) return;
    const fromTop = clientY - el.getBoundingClientRect().top <= GRAB;
    if (!fromTop && (target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable]")) return;
    drag.current = { y: clientY, t: performance.now(), dy: 0, v: 0, fromTop, decided: false };
  };
  /** returns true while the gesture belongs to the sheet (the caller then blocks scrolling) */
  const move = (clientY: number): boolean => {
    const d = drag.current;
    const el = sheet.current;
    if (!d || !el) return false;
    let dy = clientY - d.y;
    if (!d.decided) {
      if (Math.abs(dy) < 6) return true;
      // from the content: only a downward pull while scrolled to the top moves the sheet; anything else scrolls
      if (!d.fromTop && (dy < 0 || el.scrollTop > 0)) {
        drag.current = null;
        return false;
      }
      d.decided = true;
      d.y = clientY; // no jump by the 6px dead zone
      dy = 0;
    }
    if (dy < 0) dy = -Math.sqrt(-dy) * 3; // rubber band when pulled up
    const now = performance.now();
    d.v = (dy - d.dy) / Math.max(1, now - d.t);
    d.t = now;
    d.dy = dy;
    el.style.transition = "none";
    el.style.animation = "none";
    el.style.transform = `translateY(${dy}px)`;
    return true;
  };
  const end = (): void => {
    const d = drag.current;
    const el = sheet.current;
    drag.current = null;
    if (!d || !el || !d.decided) return;
    // a drag that began on a button must not also click it when the mouse is released
    const block = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); };
    window.addEventListener("click", block, { capture: true, once: true });
    setTimeout(() => window.removeEventListener("click", block, true), 60);
    if (d.dy === 0) return;
    if (d.dy > 110 || d.v > 0.6) {
      closingRef.current = true;
      el.style.transition = "transform 0.22s cubic-bezier(0.3, 0, 0.8, 0.15)";
      el.style.transform = "translateY(110%)";
      el.parentElement?.classList.add("closing"); // the dimming fades with it
      setTimeout(() => closeRef.current(), 200);
    } else {
      el.style.transition = "transform var(--dur-snappy) var(--ease-snappy)";
      el.style.transform = "";
    }
  };

  // touch: native listeners so touchmove can be cancelled
  useEffect(() => {
    const el = sheet.current;
    if (!el) return;
    const ts = (e: TouchEvent) => e.touches.length === 1 && start(e.touches[0].clientY, e.target);
    const tm = (e: TouchEvent) => {
      if (!drag.current) return;
      if (move(e.touches[0].clientY) && e.cancelable) e.preventDefault();
    };
    const te = () => end();
    el.addEventListener("touchstart", ts, { passive: true });
    el.addEventListener("touchmove", tm, { passive: false });
    el.addEventListener("touchend", te);
    el.addEventListener("touchcancel", te);
    return () => {
      el.removeEventListener("touchstart", ts);
      el.removeEventListener("touchmove", tm);
      el.removeEventListener("touchend", te);
      el.removeEventListener("touchcancel", te);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={`modal-bg${closing ? " closing" : ""}`}
      onMouseDown={(e) => e.target === e.currentTarget && requestClose()}
    >
      <div
        ref={sheet}
        className={`modal${closing ? " closing" : ""}`}
        role="dialog"
        aria-modal="true"
        onPointerDown={(e) => e.pointerType === "mouse" && start(e.clientY, e.target)}
        onPointerMove={(e) => e.pointerType === "mouse" && move(e.clientY)}
        onPointerUp={(e) => e.pointerType === "mouse" && end()}
        onPointerCancel={(e) => e.pointerType === "mouse" && end()}
      >
        {children}
      </div>
    </div>
  );
}
