import { askConfirm } from "./dialog";
import { useEffect, useMemo, useState } from "react";
import { store, useCol } from "../lib/store";
import { stripHtml } from "../lib/template";
import type { ID, Note } from "../lib/types";
import { useNav } from "./nav";
import { NoteEditor } from "./NoteEditor";

export function AddNote({ did: initialDid }: { did?: ID }) {
  const col = useCol();
  const { toast, go } = useNav();
  const prefs = col.d.prefs;
  const [ntid, setNtid] = useState<ID>(col.notetype(prefs.lastNoteType) ? prefs.lastNoteType : col.notetypes()[0].id);
  const [did, setDid] = useState<ID>(initialDid ?? (col.deck(prefs.lastAddDeck) && !col.deck(prefs.lastAddDeck)!.dyn ? prefs.lastAddDeck : 1));
  const nt = col.notetype(ntid) ?? col.notetypes()[0];
  const [note, setNote] = useState<Note>(() => col.newNote(nt));
  const [history, setHistory] = useState<ID[]>([]);

  useEffect(() => {
    // keep tags (sticky like Anki) when switching type
    setNote((old) => ({ ...col.newNote(nt), tags: old.tags, fields: nt.fields.map((_, i) => old.fields[i] ?? "") }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ntid]);

  const dupe = useMemo(() => col.findDupes(note).length > 0, [col, note]);

  const add = async () => {
    if (!stripHtml(note.fields[0] ?? "").trim() && !note.fields[0]?.includes("<img")) {
      toast("The first field is empty.");
      return;
    }
    if (nt.kind === "cloze" && !note.fields.some((f) => /\{\{c\d+::/.test(f))) {
      if (!await askConfirm("You have a cloze note type but have not made any cloze deletions. Proceed?")) return;
    }
    const n = store.update("Add Note", (c) => {
      c.d.prefs.lastNoteType = ntid;
      c.d.prefs.lastAddDeck = did;
      return c.addNote(structuredClone(note), did);
    });
    if (n === 0) {
      toast("The current input would produce no cards.");
      return;
    }
    setHistory((h) => [note.id || Date.now(), ...h].slice(0, 20));
    setNote({ ...col.newNote(nt), tags: note.tags });
    toast(`Added (${n} card${n > 1 ? "s" : ""}).`);
  };

  return (
    <div
      className="page narrow"
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
          e.preventDefault();
          add();
        }
      }}
    >
      <h2>Add</h2>
      <div className="row" style={{ marginBottom: 12 }}>
        <label>
          Type{" "}
          <select value={ntid} onChange={(e) => setNtid(Number(e.target.value))}>
            {col.notetypes().map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Deck{" "}
          <select value={did} onChange={(e) => setDid(Number(e.target.value))}>
            {col
              .decks()
              .filter((d) => !d.dyn)
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
          </select>
        </label>
      </div>
      {nt.name === "Vocabulary" && (
        <p className="small muted" style={{ marginTop: -4 }}>
          Makes two cards: recognise (word → meaning) and recall (meaning → word). An example sentence gives the word context, which makes it
          stick.
        </p>
      )}
      <NoteEditor key={ntid} note={note} nt={nt} onChange={setNote} dupe={dupe} autoFocus allTags={col.allTags()} />
      <div className="row">
        <button className="primary" onClick={add} title="Ctrl+Enter">
          Add
        </button>
        <button onClick={() => go({ name: "browse", query: "added:1" })}>History ({history.length})</button>
      </div>
    </div>
  );
}
