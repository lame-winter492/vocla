// In-app replacements for prompt()/confirm()/alert(). Native dialogs are blocked in some
// embedded viewers (e.g. Claude Artifacts) and look out of place anyway.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Modal } from "./Modal";

type Req =
  | { kind: "text"; message: string; value: string; resolve: (v: string | null) => void }
  | { kind: "confirm"; message: string; resolve: (v: boolean) => void }
  | { kind: "choice"; message: string; options: string[]; resolve: (v: number | null) => void }
  | { kind: "message"; message: string; resolve: () => void };

let current: Req | null = null;
let seq = 0; // new id per request, so the view remounts only for a new dialog
const listeners = new Set<() => void>();
const set = (r: Req | null) => {
  current = r;
  seq++;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Ask for a line of text. Resolves to null when cancelled. */
export function askText(message: string, value = ""): Promise<string | null> {
  return new Promise((resolve) => set({ kind: "text", message, value, resolve }));
}
/** Ask yes/no. */
export function askConfirm(message: string): Promise<boolean> {
  return new Promise((resolve) => set({ kind: "confirm", message, resolve }));
}
/** Pick one of several options. Resolves to the index, or null when cancelled. */
export function askChoice(message: string, options: string[]): Promise<number | null> {
  return new Promise((resolve) => set({ kind: "choice", message, options, resolve }));
}
/** Show a message with an OK button. */
export function showMessage(message: string): Promise<void> {
  return new Promise((resolve) => set({ kind: "message", message, resolve }));
}

/** True while any modal or dialog is open (global shortcuts should stand down). */
export const modalOpen = () => typeof document !== "undefined" && !!document.querySelector(".modal-bg");

/** Mount once near the root of the app. */
export function DialogHost() {
  const req = useSyncExternalStore(subscribe, () => current);
  if (!req) return null;
  return <DialogView key={seq} req={req} />;
}

function DialogView({ req }: { req: Req }) {
  const [text, setText] = useState(req.kind === "text" ? req.value : "");
  const [choice, setChoice] = useState(0);
  const okRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (req.kind !== "text") okRef.current?.focus();
  }, [req]);

  const finish = (ok: boolean) => {
    set(null);
    if (req.kind === "text") req.resolve(ok ? text : null);
    else if (req.kind === "confirm") req.resolve(ok);
    else if (req.kind === "choice") req.resolve(ok ? choice : null);
    else req.resolve();
  };

  return (
    <Modal onClose={() => finish(false)}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          finish(true);
        }}
        style={{ display: "flex", flexDirection: "column", gap: 10 }}
      >
        <div style={{ whiteSpace: "pre-wrap" }}>{req.message}</div>
        {req.kind === "text" && (
          <input id="dialog-text" autoFocus value={text} onChange={(e) => setText(e.target.value)} onFocus={(e) => e.target.select()} />
        )}
        {req.kind === "choice" && (
          <select id="dialog-choice" size={Math.min(10, req.options.length)} value={choice} onChange={(e) => setChoice(Number(e.target.value))}>
            {req.options.map((o, i) => (
              <option key={i} value={i}>
                {o}
              </option>
            ))}
          </select>
        )}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          {req.kind !== "message" && (
            <button type="button" onClick={() => finish(false)}>
              Cancel
            </button>
          )}
          <button type="submit" ref={okRef}>
            OK
          </button>
        </div>
      </form>
    </Modal>
  );
}
