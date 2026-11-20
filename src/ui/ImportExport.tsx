import { askConfirm } from "./dialog";
import { useState } from "react";
import {
  download,
  exportDeckPackage,
  exportNotesText,
  importDeckPackage,
  importRows,
  parseDelimited,
  type DeckPackage,
  type TextParse,
} from "../lib/importexport";
import { searchNotes } from "../lib/search";
import { store, useCol } from "../lib/store";
import type { Collection, ID } from "../lib/types";
import { useNav } from "./nav";

export function ImportPage() {
  const col = useCol();
  const { toast, go } = useNav();
  const [text, setText] = useState<{ name: string; raw: string; parsed: TextParse } | null>(null);
  const [delim, setDelim] = useState<string | undefined>(undefined);
  const [ntid, setNtid] = useState<ID>(col.d.prefs.lastNoteType);
  const [did, setDid] = useState<ID>(col.d.prefs.currentDeck);
  const [html, setHtml] = useState(false);
  const [dupes, setDupes] = useState<"update" | "ignore" | "duplicate">("update");
  const [mapping, setMapping] = useState<number[]>([]);
  const [extraTags, setExtraTags] = useState("");

  const nt = col.notetype(ntid) ?? col.notetypes()[0];

  const defaultMapping = (p: TextParse, n = nt) => {
    const cols = Math.max(0, ...p.rows.map((r) => r.length));
    return Array.from({ length: cols }, (_, i) => (p.tagsColumn === i + 1 ? -2 : i < n.fields.length ? i : -1));
  };

  const onFile = async (f: File) => {
    const raw = await f.text();
    if (/\.json$/i.test(f.name)) {
      let data: unknown;
      try {
        data = JSON.parse(raw);
      } catch {
        return toast("Invalid JSON file.");
      }
      const d = data as Partial<DeckPackage & Collection>;
      if (d.format === "vocla-deck") {
        const r = store.update("Import", (c) => importDeckPackage(c, d as DeckPackage));
        toast(`Imported ${r.notes} notes (${r.cards} cards), updated ${r.updated}.`);
        return go({ name: "decks" });
      }
      if (d.cards && d.notes && d.decks && d.notetypes) {
        if (!await askConfirm("This is a full collection backup. Importing it will REPLACE your entire collection. Continue?")) return;
        store.replace(d as Collection);
        toast("Collection restored.");
        return go({ name: "decks" });
      }
      return toast("Unrecognized JSON file.");
    }
    if (/\.(apkg|colpkg)$/i.test(f.name)) return toast("Anki .apkg files aren't supported yet. Export from Anki as 'Notes in Plain Text' instead.");
    const parsed = parseDelimited(raw);
    setDelim(undefined);
    setHtml(parsed.html);
    let n = nt;
    if (parsed.notetype) {
      const m = col.notetypes().find((x) => x.name.toLowerCase() === parsed.notetype!.toLowerCase());
      if (m) {
        setNtid(m.id);
        n = m;
      }
    }
    if (parsed.deck) {
      const dk = col.deckByName(parsed.deck);
      if (dk) setDid(dk.id);
    }
    setMapping(defaultMapping(parsed, n));
    setText({ name: f.name, raw, parsed });
  };

  const reparse = (d: string | undefined) => {
    if (!text) return;
    const parsed = parseDelimited(text.raw, d);
    setDelim(d);
    setText({ ...text, parsed });
    setMapping(defaultMapping(parsed));
  };

  const doImport = () => {
    if (!text) return;
    let targetDid = did;
    const r = store.update("Import", (c) => {
      if (text.parsed.deck && !c.deckByName(text.parsed.deck)) targetDid = c.addDeck(text.parsed.deck).id;
      return importRows(c, text.parsed.rows, { ntid: nt.id, did: targetDid, mapping, html, dupes, extraTags: extraTags.split(/\s+/).filter(Boolean) });
    });
    toast(`${r.added} notes added, ${r.updated} updated, ${r.skipped} skipped.`);
    setText(null);
  };

  return (
    <div className="page">
      <h2>Import</h2>
      <p className="muted">
        Supported: plain text (.txt, .csv, .tsv — one note per line, fields separated by tab/comma/semicolon), Vocla deck packages (.json) and
        full collection backups (.json).
      </p>
      <input type="file" accept=".txt,.csv,.tsv,.json,.apkg" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      {text && (
        <div style={{ marginTop: 16 }}>
          <h3>
            {text.name} — {text.parsed.rows.length} rows
          </h3>
          <div className="row">
            <label>
              Field separator{" "}
              <select value={delim ?? text.parsed.delimiter} onChange={(e) => reparse(e.target.value)}>
                <option value={"\t"}>Tab</option>
                <option value=",">Comma</option>
                <option value=";">Semicolon</option>
                <option value="|">Pipe</option>
                <option value=":">Colon</option>
                <option value=" ">Space</option>
              </select>
            </label>
            <label>
              <input type="checkbox" checked={html} onChange={(e) => setHtml(e.target.checked)} /> Allow HTML in fields
            </label>
          </div>
          <div className="row">
            <label>
              Note type{" "}
              <select
                value={nt.id}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  setNtid(id);
                  setMapping(defaultMapping(text.parsed, col.notetype(id)));
                }}
              >
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
            <label>
              Existing notes (same first field){" "}
              <select value={dupes} onChange={(e) => setDupes(e.target.value as typeof dupes)}>
                <option value="update">Update</option>
                <option value="ignore">Preserve (skip)</option>
                <option value="duplicate">Duplicate</option>
              </select>
            </label>
          </div>
          <label>
            Extra tags <input value={extraTags} onChange={(e) => setExtraTags(e.target.value)} />
          </label>
          <h3>Field Mapping</h3>
          <table>
            <tbody>
              {mapping.map((m, i) => (
                <tr key={i}>
                  <td>
                    Column {i + 1} <span className="muted small">e.g. "{(text.parsed.rows[0]?.[i] ?? "").slice(0, 40)}"</span>
                  </td>
                  <td>
                    →{" "}
                    <select value={m} onChange={(e) => setMapping(mapping.map((v, j) => (j === i ? Number(e.target.value) : v)))}>
                      <option value={-1}>(ignore)</option>
                      <option value={-2}>Tags</option>
                      {nt.fields.map((f, fi) => (
                        <option key={fi} value={fi}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row" style={{ marginTop: 12 }}>
            <button onClick={doImport}>Import</button>
            <button onClick={() => setText(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ExportPage({ did: initial }: { did?: ID }) {
  const col = useCol();
  const { toast } = useNav();
  const [format, setFormat] = useState<"deck" | "text" | "backup">("deck");
  const [did, setDid] = useState<ID | 0>(initial ?? 0);
  const [sched, setSched] = useState(true);
  const [html, setHtml] = useState(true);
  const [tags, setTags] = useState(true);
  const [deckCol, setDeckCol] = useState(false);
  const [ntCol, setNtCol] = useState(false);

  const deckName = did ? col.deck(did)?.name ?? "deck" : "All Decks";
  const safe = deckName.replace(/[^\w\- ]+/g, "_");
  const stamp = new Date().toISOString().slice(0, 10);

  const run = () => {
    if (format === "backup") download(`vocla-backup-${stamp}.json`, JSON.stringify(col.d));
    else if (format === "deck") download(`${safe}.vocla.json`, JSON.stringify(exportDeckPackage(col, did || null, sched)));
    else {
      const nids = searchNotes(col, did ? `"deck:${deckName}"` : "deck:*");
      download(`${safe}.txt`, exportNotesText(col, nids, { html, tags, deckCol, ntCol }), "text/plain");
    }
    toast("Exported.");
  };

  return (
    <div className="page">
      <h2>Export</h2>
      <label>
        Format{" "}
        <select value={format} onChange={(e) => setFormat(e.target.value as typeof format)}>
          <option value="deck">Deck package (.vocla.json)</option>
          <option value="text">Notes in plain text (.txt)</option>
          <option value="backup">Full collection backup (.json)</option>
        </select>
      </label>
      {format !== "backup" && (
        <label>
          Include{" "}
          <select value={did} onChange={(e) => setDid(Number(e.target.value))}>
            <option value={0}>All Decks</option>
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
      )}
      {format === "deck" && (
        <label>
          <input type="checkbox" checked={sched} onChange={(e) => setSched(e.target.checked)} /> Include scheduling information
        </label>
      )}
      {format === "text" && (
        <>
          <label>
            <input type="checkbox" checked={html} onChange={(e) => setHtml(e.target.checked)} /> Include HTML
          </label>
          <label>
            <input type="checkbox" checked={tags} onChange={(e) => setTags(e.target.checked)} /> Include tags
          </label>
          <label>
            <input type="checkbox" checked={deckCol} onChange={(e) => setDeckCol(e.target.checked)} /> Include deck name
          </label>
          <label>
            <input type="checkbox" checked={ntCol} onChange={(e) => setNtCol(e.target.checked)} /> Include note type name
          </label>
        </>
      )}
      <button onClick={run} style={{ marginTop: 12 }}>
        Export
      </button>
    </div>
  );
}
