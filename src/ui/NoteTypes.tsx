import { askChoice, askConfirm, askText } from "./dialog";
import { useState } from "react";
import { newId, STOCK_NAMES, stockNoteType, type StockKind } from "../lib/stock";
import { store, useCol } from "../lib/store";
import type { ID, NoteType } from "../lib/types";
import { CardView } from "./CardView";
import { useNav } from "./nav";

export function NoteTypes() {
  const col = useCol();
  const { toast } = useNav();
  const [sel, setSel] = useState<ID | null>(col.notetypes()[0]?.id ?? null);
  const [editing, setEditing] = useState<null | "fields" | "cards">(null);
  const nt = sel ? col.notetype(sel) : undefined;

  if (editing && nt) return <NoteTypeEditor key={nt.id} nt={nt} mode={editing} onDone={() => setEditing(null)} />;

  const add = async () => {
    const choices = [...Object.values(STOCK_NAMES).map((v) => `Add: ${v}`), ...col.notetypes().map((n) => `Clone: ${n.name}`)];
    const idx = await askChoice("Start the new note type from:", choices);
    if (idx === null) return;
    const stockKeys = Object.keys(STOCK_NAMES) as StockKind[];
    const baseName = idx < stockKeys.length ? STOCK_NAMES[stockKeys[idx]] : col.notetypes()[idx - stockKeys.length].name + " copy";
    const name = await askText("Name:", baseName);
    if (!name) return;
    const created = store.update("Add Note Type", (c) => {
      const n: NoteType =
        idx < stockKeys.length
          ? stockNoteType(stockKeys[idx], name)
          : { ...structuredClone(c.notetypes()[idx - stockKeys.length]), id: newId(), name, mod: Date.now() };
      c.d.notetypes[n.id] = n;
      return n;
    });
    setSel(created.id);
  };

  return (
    <div className="page">
      <h2>Note Types</h2>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <select size={12} style={{ minWidth: 280 }} value={sel ?? ""} onChange={(e) => setSel(Number(e.target.value))}>
          {col.notetypes().map((n) => (
            <option key={n.id} value={n.id}>
              {n.name} [{col.useCount(n.id)} notes]
            </option>
          ))}
        </select>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <button onClick={add}>Add</button>
          <button
            disabled={!nt}
            onClick={async () => {
              const name = nt && await askText("Rename:", nt.name);
              if (nt && name) store.update("Rename Note Type", (c) => (c.d.notetypes[nt.id].name = name));
            }}
          >
            Rename
          </button>
          <button disabled={!nt} onClick={() => setEditing("fields")}>
            Fields…
          </button>
          <button disabled={!nt} onClick={() => setEditing("cards")}>
            Cards…
          </button>
          <button
            disabled={!nt}
            onClick={async () => {
              if (!nt) return;
              if (col.notetypes().length <= 1) return toast("You need at least one note type.");
              if (!await askConfirm(`Delete "${nt.name}" and its ${col.useCount(nt.id)} notes?`)) return;
              store.update("Delete Note Type", (c) => c.removeNoteType(nt.id));
              setSel(col.notetypes()[0]?.id ?? null);
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function renameRefs(tpl: string, oldName: string, newName: string): string {
  const esc = oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return tpl.replace(new RegExp(`\\{\\{([#^/]?)((?:[^{}]*?:)*)\\s*${esc}\\s*\\}\\}`, "g"), (_m, pre, filters) => `{{${pre}${filters}${newName}}}`);
}

function NoteTypeEditor({ nt: orig, mode, onDone }: { nt: NoteType; mode: "fields" | "cards"; onDone: () => void }) {
  const col = useCol();
  const { toast } = useNav();
  const [nt, setNt] = useState<NoteType>(() => structuredClone(orig));
  const [fieldOrig, setFieldOrig] = useState<number[]>(() => orig.fields.map((_, i) => i));
  const [tmplOrig, setTmplOrig] = useState<number[]>(() => orig.templates.map((_, i) => i));
  const [fsel, setFsel] = useState(0);
  const [tsel, setTsel] = useState(0);
  const [side, setSide] = useState<"qfmt" | "afmt" | "css">("qfmt");
  const [previewBack, setPreviewBack] = useState(false);

  const save = () => {
    store.update("Edit Note Type", (c) => c.updateNoteType(nt, fieldOrig, tmplOrig));
    toast("Saved.");
    onDone();
  };

  const upd = (fn: (n: NoteType) => void) =>
    setNt((o) => {
      const n = structuredClone(o);
      fn(n);
      return n;
    });

  if (mode === "fields") {
    const move = (dir: number) => {
      const j = fsel + dir;
      if (j < 0 || j >= nt.fields.length) return;
      upd((n) => {
        [n.fields[fsel], n.fields[j]] = [n.fields[j], n.fields[fsel]];
        if (n.sortField === fsel) n.sortField = j;
        else if (n.sortField === j) n.sortField = fsel;
      });
      const fo = [...fieldOrig];
      [fo[fsel], fo[j]] = [fo[j], fo[fsel]];
      setFieldOrig(fo);
      setFsel(j);
    };
    return (
      <div className="page">
        <h2>Fields for {nt.name}</h2>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <select size={10} style={{ minWidth: 240 }} value={fsel} onChange={(e) => setFsel(Number(e.target.value))}>
            {nt.fields.map((f, i) => (
              <option key={i} value={i}>
                {i + 1}: {f.name}
              </option>
            ))}
          </select>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <button
              onClick={async () => {
                const name = await askText("Field name:");
                if (!name) return;
                if (nt.fields.some((f) => f.name === name)) return toast("That field name is already used.");
                upd((n) => n.fields.push({ name }));
                setFieldOrig([...fieldOrig, -1]);
              }}
            >
              Add
            </button>
            <button
              onClick={async () => {
                if (nt.fields.length <= 1) return toast("A note type needs at least one field.");
                if (!await askConfirm(`Delete field "${nt.fields[fsel].name}"? Its content will be lost.`)) return;
                upd((n) => {
                  n.fields.splice(fsel, 1);
                  if (n.sortField >= n.fields.length) n.sortField = 0;
                });
                setFieldOrig(fieldOrig.filter((_, i) => i !== fsel));
                setFsel(0);
              }}
            >
              Delete
            </button>
            <button
              onClick={async () => {
                const old = nt.fields[fsel].name;
                const name = await askText("New name:", old);
                if (!name || name === old) return;
                if (nt.fields.some((f) => f.name === name)) return toast("That field name is already used.");
                upd((n) => {
                  n.fields[fsel].name = name;
                  for (const t of n.templates) {
                    t.qfmt = renameRefs(t.qfmt, old, name);
                    t.afmt = renameRefs(t.afmt, old, name);
                  }
                });
              }}
            >
              Rename
            </button>
            <button onClick={() => move(-1)}>Move Up</button>
            <button onClick={() => move(1)}>Move Down</button>
          </div>
        </div>
        <label>
          <input type="radio" checked={nt.sortField === fsel} onChange={() => upd((n) => (n.sortField = fsel))} /> Sort by this field in the browser
        </label>
        <div className="row">
          <button onClick={save}>Save</button>
          <button onClick={onDone}>Cancel</button>
        </div>
      </div>
    );
  }

  // card templates
  const tpl = nt.templates[tsel];
  const sample = sampleCard(col, nt, tsel);
  return (
    <div className="page wide">
      <h2>Card Types for {nt.name}</h2>
      <div className="row" style={{ marginBottom: 8 }}>
        <select value={tsel} onChange={(e) => setTsel(Number(e.target.value))}>
          {nt.templates.map((t, i) => (
            <option key={i} value={i}>
              {i + 1}: {t.name}
            </option>
          ))}
        </select>
        {nt.kind === "standard" && (
          <>
            <button
              onClick={() => {
                upd((n) => n.templates.push({ name: `Card ${n.templates.length + 1}`, qfmt: n.templates[0]?.qfmt ?? "", afmt: n.templates[0]?.afmt ?? "" }));
                setTmplOrig([...tmplOrig, -1]);
                setTsel(nt.templates.length);
              }}
            >
              Add Card Type
            </button>
            <button
              onClick={async () => {
                if (nt.templates.length <= 1) return toast("At least one card type is required.");
                if (!await askConfirm(`Delete "${tpl.name}" and all cards using it?`)) return;
                upd((n) => n.templates.splice(tsel, 1));
                setTmplOrig(tmplOrig.filter((_, i) => i !== tsel));
                setTsel(0);
              }}
            >
              Remove
            </button>
            <button
              onClick={async () => {
                const name = await askText("Card type name:", tpl.name);
                if (name) upd((n) => (n.templates[tsel].name = name));
              }}
            >
              Rename
            </button>
            <button
              onClick={() => {
                const j = tsel + 1 < nt.templates.length ? tsel + 1 : tsel - 1;
                if (j < 0) return;
                upd((n) => ([n.templates[tsel], n.templates[j]] = [n.templates[j], n.templates[tsel]]));
                const to = [...tmplOrig];
                [to[tsel], to[j]] = [to[j], to[tsel]];
                setTmplOrig(to);
                setTsel(j);
              }}
            >
              Reposition
            </button>
          </>
        )}
      </div>
      <div className="grid2 tmpl">
        <div>
          <div className="row">
            {(["qfmt", "afmt", "css"] as const).map((s) => (
              <label key={s}>
                <input type="radio" checked={side === s} onChange={() => setSide(s)} /> {s === "qfmt" ? "Front Template" : s === "afmt" ? "Back Template" : "Styling"}
              </label>
            ))}
          </div>
          <textarea
            rows={22}
            value={side === "css" ? nt.css : tpl[side]}
            onChange={(e) =>
              upd((n) => {
                if (side === "css") n.css = e.target.value;
                else n.templates[tsel][side] = e.target.value;
              })
            }
          />
          <div className="small muted">
            Fields: {nt.fields.map((f) => `{{${f.name}}}`).join(" ")} · Special: {"{{FrontSide}} {{Tags}} {{Deck}} {{Card}} {{type:Field}} {{hint:Field}} {{text:Field}} {{tts en_US:Field}} {{#Field}}…{{/Field}}"}
          </div>
        </div>
        <div>
          <label>
            <input type="checkbox" checked={previewBack} onChange={(e) => setPreviewBack(e.target.checked)} /> Preview back side
          </label>
          <div style={{ border: "1px solid var(--line)" }}>
            <CardView html={previewBack ? sample(nt).a : sample(nt).q} css={nt.css} cardClass={`card card${tsel + 1}`} />
          </div>
        </div>
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <button onClick={save}>Save</button>
        <button onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
}

/** Renders a preview using an existing note of this type, or placeholder field names. */
function sampleCard(col: ReturnType<typeof useCol>, orig: NoteType, tsel: number) {
  const existing = Object.values(col.d.notes).find((n) => n.ntid === orig.id);
  return (nt: NoteType) => {
    const fields = nt.fields.map((f, i) => existing?.fields[i] || (nt.kind === "cloze" && i === 0 ? `{{c1::(${f.name})}}` : `(${f.name})`));
    const tmp = { ...col.d, notetypes: { ...col.d.notetypes, [nt.id]: nt }, notes: { ...col.d.notes, [-1]: { id: -1, guid: "", ntid: nt.id, fields, tags: [], mod: 0 } } };
    const C = col.constructor as new (d: typeof col.d) => typeof col;
    const c = new C(tmp);
    return c.renderCard({ id: -1, nid: -1, did: 1, odid: 0, ord: nt.kind === "cloze" ? 0 : tsel, mod: 0, type: 0, queue: 0, due: 0, odue: 0, ivl: 0, factor: 0, reps: 0, lapses: 0, step: 0, flags: 0 });
  };
}
