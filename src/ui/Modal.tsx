// Modal sheet / dialog.
// Phone: an inset glass sheet that rises with a spring and can be dragged down to dismiss
// (rubber-band resistance upward; dismiss past a distance or on a quick downward flick, else spring back).
// Desktop: a centered dialog that pops in. Closing always animates out before unmounting.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { reducedMotion } from "./motion";

const phone = () => typeof matchMedia !== "undefined" && matchMedia("(max-width: 760px)").matches;

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

  // ---- drag to dismiss (phone sheets, from the grabber area at the top) ----
  const drag = useRef<{ y: number; t: number; dy: number; v: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    const el = sheet.current;
    if (!el || !phone() || closing) return;
    const top = el.getBoundingClientRect().top;
    if (e.clientY - top > 64 && el.scrollTop > 0) return;
    if (e.clientY - top > 64 && (e.target as HTMLElement).closest("input, textarea, select, button, a")) return;
    drag.current = { y: e.clientY, t: performance.now(), dy: 0, v: 0 };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const el = sheet.current;
    if (!d || !el) return;
    let dy = e.clientY - d.y;
    if (Math.abs(dy) < 6 && d.dy === 0) return;
    if (dy < 0) dy = -Math.sqrt(-dy) * 3; // rubber band when pulled up
    const now = performance.now();
    d.v = (dy - d.dy) / Math.max(1, now - d.t);
    d.t = now;
    d.dy = dy;
    el.style.transition = "none";
    el.style.animation = "none";
    el.style.transform = `translateY(${dy}px)`;
  };
  const onPointerUp = () => {
    const d = drag.current;
    const el = sheet.current;
    drag.current = null;
    if (!d || !el || d.dy === 0) return;
    if (d.dy > 110 || d.v > 0.6) {
      el.style.transition = "transform 0.22s cubic-bezier(0.3, 0, 0.8, 0.15)";
      el.style.transform = "translateY(110%)";
      setTimeout(() => closeRef.current(), 200);
    } else {
      el.style.transition = "transform var(--dur-snappy) var(--ease-snappy)";
      el.style.transform = "";
    }
  };

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
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {children}
      </div>
    </div>
  );
}
