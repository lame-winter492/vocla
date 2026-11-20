// Digits that roll when a number changes, like SwiftUI's .contentTransition(.numericText()).
// Only the digits that changed animate; they roll up when the number grows and down when it shrinks.
// Cells are recomputed only when the value changes, so unrelated re-renders never restart a roll.
import { useRef } from "react";

interface Cell {
  ch: string;
  key: string;
  cls: string;
}

let seq = 0;

export function RollingNumber({ value, className }: { value: number | string; className?: string }) {
  const text = String(value);
  const state = useRef<{ text: string; cells: Cell[] } | null>(null);
  if (!state.current) {
    state.current = { text, cells: [...text].map((ch, i) => ({ ch, key: `${i}-${seq++}`, cls: "digit" })) };
  } else if (state.current.text !== text) {
    const old = state.current.text;
    const a = Number(old.replace(/[^\d.-]/g, ""));
    const b = Number(text.replace(/[^\d.-]/g, ""));
    const dir = !isNaN(a) && !isNaN(b) && b < a ? "down" : "up";
    const prevCells = state.current.cells;
    state.current = {
      text,
      cells: [...text].map((ch, i) => {
        // align from the right so the ones digits line up
        const j = old.length - text.length + i;
        const prevCell = j >= 0 ? prevCells[j] : undefined;
        if (prevCell && prevCell.ch === ch) return prevCell;
        return { ch, key: `${i}-${seq++}`, cls: `digit roll-${dir}` };
      }),
    };
  }
  return (
    <span className={`rolling ${className ?? ""}`} aria-label={text}>
      {state.current.cells.map((c) => (
        <span key={c.key} className={c.cls} aria-hidden="true">
          {c.ch}
        </span>
      ))}
    </span>
  );
}
