import { useRef } from "react";
import { clozeNumbers } from "../lib/template";
import type { Note, NoteType } from "../lib/types";

/** Plain field editor: one textarea per field (HTML allowed) + tags. */
export function NoteEditor({
  note,
  nt,
  onChange,
  dupe,
  autoFocus,
  allTags,
}: {
  note: Note;
  nt: NoteType;
  onChange: (n: Note) => void;
  dupe?: boolean;
  autoFocus?: boolean;
  allTags?: string[];
}) {
  const refs = useRef<(HTMLTextAreaElement | null)[]>([]);

  const setField = (i: number, v: string) => {
    const fields = [...note.fields];
    fields[i] = v;
    onChange({ ...note, fields });
  };

  const wrap = (i: number, before: string, after: string) => {
    const ta = refs.current[i];
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e, value } = ta;
    const nv = value.slice(0, s) + before + value.slice(s, e) + after + value.slice(e);
    setField(i, nv);
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = s + before.length;
      ta.selectionEnd = e + before.length;
    });
  };

  const cloze = (i: number, same: boolean) => {
    const nums = note.fields.flatMap((f) => clozeNumbers(f));
    const max = nums.length ? Math.max(...nums) : 0;
    const n = same ? Math.max(max, 1) : max + 1;
    wrap(i, `{{c${n}::`, "}}");
  };

  const onKey = (i: number, e: React.KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    const k = e.key.toLowerCase();
    if (e.shiftKey && k === "c") {
      e.preventDefault();
      cloze(i, e.altKey);
    } else if (!e.shiftKey && k === "b") {
      e.preventDefault();
      wrap(i, "<b>", "</b>");
    } else if (!e.shiftKey && k === "i") {
      e.preventDefault();
      wrap(i, "<i>", "</i>");
    } else if (!e.shiftKey && k === "u") {
      e.preventDefault();
      wrap(i, "<u>", "</u>");
    }
  };

  return (
    <div className="editor">
      {nt.fields.map((f, i) => (
        <div className="field" key={i}>
          <div className="row name">
            <span>{f.name}</span>
            <span className="spacer" style={{ flex: 1 }} />
            <a className="small" onClick={() => wrap(i, "<b>", "</b>")} title="Bold (Ctrl+B)">B</a>
            <a className="small" onClick={() => wrap(i, "<i>", "</i>")} title="Italic (Ctrl+I)">I</a>
            <a className="small" onClick={() => wrap(i, "<u>", "</u>")} title="Underline (Ctrl+U)">U</a>
            {nt.kind === "cloze" && (
              <a className="small" onClick={() => cloze(i, false)} title="Cloze (Ctrl+Shift+C)">[...]</a>
            )}
          </div>
          <textarea
            ref={(el) => {
              refs.current[i] = el;
            }}
            className={i === 0 && dupe ? "dupe" : ""}
            rows={Math.min(8, Math.max(2, (note.fields[i] ?? "").split("\n").length + 1))}
            value={note.fields[i] ?? ""}
            autoFocus={autoFocus && i === 0}
            onChange={(e) => setField(i, e.target.value)}
            onKeyDown={(e) => onKey(i, e)}
          />
          {i === 0 && dupe && <div className="small error">Duplicate: a note with this first field already exists.</div>}
        </div>
      ))}
      <div className="field">
        <div className="name">Tags (space separated)</div>
        <input
          style={{ width: "100%" }}
          list="all-tags"
          value={note.tags.join(" ")}
          onChange={(e) => onChange({ ...note, tags: e.target.value.split(" ") })}
        />
        {allTags && (
          <datalist id="all-tags">
            {allTags.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        )}
      </div>
    </div>
  );
}
