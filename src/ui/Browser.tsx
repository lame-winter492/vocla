import { askText, askConfirm } from "./dialog";
import { useEffect, useMemo, useRef, useState } from "react";
import { searchCards } from "../lib/search";
import { store, useCol } from "../lib/store";
import { stripHtml } from "../lib/template";
import { formatDate, formatDays } from "../lib/time";
import { CardType, Queue, type Card, type ID, type Note } from "../lib/types";
import { CardInfo } from "./CardInfo";
import { CardView } from "./CardView";
import { Modal } from "./Modal";
import { useNav } from "./nav";
import { NoteEditor } from "./NoteEditor";
import { GLYPH, hueOf, Monogram } from "./icons";
import { phoneLayout as phone, transition } from "./motion";

// flag colours, as the coloured tag dots in Files
const FLAG_COLORS = ["", "#ff3b30", "#ff9500", "#34c759", "#007aff", "#ff2d55", "#30b0c7", "#af52de"];

type Mode = "cards" | "notes";
type ColKey = "sort" | "card" | "deck" | "due" | "ivl" | "ease" | "reps" | "lapses" | "created" | "notetype" | "tags" | "cards" | "edited";

const CARD_COLS: ColKey[] = ["sort", "card", "deck", "due", "ivl", "ease", "reps", "lapses", "created"];
const NOTE_COLS: ColKey[] = ["sort", "notetype", "cards", "tags", "created", "edited"];
const COL_NAMES: Record<ColKey, string> = {
  sort: "Sort Field",
  card: "Card",
  deck: "Deck",
  due: "Due",
  ivl: "Interval",
  ease: "Ease",
  reps: "Reviews",
  lapses: "Lapses",
  created: "Created",
  notetype: "Note",
  tags: "Tags",
  cards: "Cards",
  edited: "Edited",
};

export function Browser({ initialQuery }: { initialQuery?: string }) {
  const col = useCol();
  const { toast } = useNav();
  const [input, setInput] = useState(initialQuery ?? "deck:current");
  const [query, setQuery] = useState(initialQuery ?? "deck:current");
  const [mode, setMode] = useState<Mode>("cards");
  const [sort, setSort] = useState<{ key: ColKey; desc: boolean }>({ key: "created", desc: false });
  const [selected, setSelected] = useState<Set<ID>>(new Set());
  const anchor = useRef<ID | null>(null);
  const [draft, setDraft] = useState<Note | null>(null);
  const [modal, setModal] = useState<null | "info" | "preview" | "findreplace" | "changent" | "deck" | "reposition">(null);
  const view = col.d.prefs.browserView ?? "list";
  const [viewMenu, setViewMenu] = useState(false);
  const viewMenuRef = useRef<HTMLDivElement>(null);
  // sidebar sections fold like the sections in Files' Browse screen (on phones most start folded)
  const [folded, setFolded] = useState<Set<string>>(() => new Set(phone() ? ["Saved Searches", "Card State", "Flags", "Note Types", "Tags"] : []));
  const toggleSection = (name: string) =>
    setFolded((f) => {
      const n = new Set(f);
      if (n.has(name)) n.delete(name);
      else n.add(name);
      return n;
    });

  // a pull-down menu closes when you tap anywhere else
  useEffect(() => {
    if (!viewMenu) return;
    const close = (e: PointerEvent) => !viewMenuRef.current?.contains(e.target as Node) && setViewMenu(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setViewMenu(false);
    document.addEventListener("pointerdown", close, true);
    window.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      window.removeEventListener("keydown", esc);
    };
  }, [viewMenu]);
  const setView = (v: "list" | "icons") => {
    setViewMenu(false);
    if (v !== view) transition("tab", () => store.mutate((c) => (c.d.prefs.browserView = v)));
  };

  useEffect(() => {
    if (initialQuery !== undefined) {
      setInput(initialQuery);
      setQuery(initialQuery);
    }
  }, [initialQuery]);

  const today = col.today();

  // rows: card ids or note ids
  const rows = useMemo(() => {
    let cids: ID[];
    try {
      cids = searchCards(col, query);
    } catch {
      cids = [];
    }
    let ids: ID[];
    if (mode === "cards") ids = cids;
    else {
      const seen = new Set<ID>();
      ids = [];
      for (const cid of cids) {
        const nid = col.d.cards[cid].nid;
        if (!seen.has(nid)) {
          seen.add(nid);
          ids.push(nid);
        }
      }
    }
    const key = (id: ID): string | number => {
      const card = mode === "cards" ? col.d.cards[id] : col.cardsOfNote(id)[0];
      const note = mode === "cards" ? col.d.notes[card.nid] : col.d.notes[id];
      const nt = col.d.notetypes[note.ntid];
      switch (sort.key) {
        case "sort":
          return stripHtml(note.fields[nt?.sortField ?? 0] ?? "").toLowerCase();
        case "card":
          return col.cardTemplateName(card);
        case "deck":
          return col.deck(card.did)?.name ?? "";
        case "due":
          return dueSortKey(card, today);
        case "ivl":
          return card.type === CardType.Review ? card.ivl : -1;
        case "ease":
          return card.factor;
        case "reps":
          return card.reps;
        case "lapses":
          return card.lapses;
        case "created":
          return mode === "cards" ? note.id * 100 + card.ord : note.id;
        case "notetype":
          return nt?.name ?? "";
        case "tags":
          return note.tags.join(" ");
        case "cards":
          return col.cardsOfNote(note.id).length;
        case "edited":
          return note.mod;
      }
    };
    const keyed = ids.map((id) => [key(id), id] as const);
    keyed.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0) * (sort.desc ? -1 : 1));
    return keyed.map((k) => k[1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [col, store.version, query, mode, sort, today]);

  // selection helpers
  const selCardIds = (): ID[] => {
    if (mode === "cards") return [...selected].filter((id) => col.d.cards[id]);
    return [...selected].flatMap((nid) => col.cardsOfNote(nid).map((c) => c.id));
  };
  const selNoteIds = (): ID[] => {
    if (mode === "notes") return [...selected].filter((id) => col.d.notes[id]);
    return [...new Set([...selected].map((cid) => col.d.cards[cid]?.nid).filter(Boolean))];
  };
  const singleNoteId = selected.size === 1 ? selNoteIds()[0] : undefined;
  const singleCardId = selected.size === 1 ? selCardIds()[0] : undefined;

  // keep editor draft in sync with selection
  const draftRef = useRef<Note | null>(null);
  draftRef.current = draft;
  const dirty = useRef(false);
  const editDraft = (n: Note) => {
    dirty.current = true;
    setDraft(n);
  };
  // pick up external changes (undo, actions) when there are no unsaved edits
  useEffect(() => {
    if (dirty.current || !draftRef.current) return;
    const fresh = store.col.d.notes[draftRef.current.id];
    setDraft(fresh ? structuredClone(fresh) : null);
  }, [store.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const saveDraft = () => {
    const d = draftRef.current;
    if (!d || !dirty.current) return;
    dirty.current = false;
    const orig = store.col.d.notes[d.id];
    if (orig && (JSON.stringify(orig.fields) !== JSON.stringify(d.fields) || orig.tags.join(" ") !== d.tags.join(" "))) {
      store.update("Edit Note", (c) => c.updateNote(structuredClone(d)));
    }
  };
  useEffect(() => {
    dirty.current = false;
    setDraft(singleNoteId && col.d.notes[singleNoteId] ? structuredClone(col.d.notes[singleNoteId]) : null);
    return () => saveDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [singleNoteId]);

  const clickRow = (id: ID, e: React.MouseEvent) => {
    saveDraft();
    if (e.shiftKey && anchor.current !== null) {
      const a = rows.indexOf(anchor.current);
      const b = rows.indexOf(id);
      const [lo, hi] = a < b ? [a, b] : [b, a];
      setSelected(new Set(rows.slice(lo, hi + 1)));
    } else if (e.ctrlKey || e.metaKey) {
      const s = new Set(selected);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      setSelected(s);
      anchor.current = id;
    } else {
      setSelected(new Set([id]));
      anchor.current = id;
    }
  };

  const search = (q: string) => {
    saveDraft();
    setInput(q);
    setQuery(q);
    setSelected(new Set());
  };

  const act = (label: string, fn: () => void, msg?: string) => {
    if (selected.size === 0) return toast("Nothing selected.");
    saveDraft();
    try {
      store.update(label, fn);
      if (msg) toast(msg);

    } catch (e) {
      toast((e as Error).message);
    }
  };

  const cards = selCardIds().map((id) => col.d.cards[id]);
  const allSuspended = cards.length > 0 && cards.every((c) => c.queue === Queue.Suspended);
  const allBuried = cards.length > 0 && cards.every((c) => c.queue < -1);

  const cell = (id: ID, key: ColKey): string => {
    const card = mode === "cards" ? col.d.cards[id] : col.cardsOfNote(id)[0];
    const note = col.d.notes[card?.nid ?? id];
    if (!card || !note) return "";
    const nt = col.d.notetypes[note.ntid];
    switch (key) {
      case "sort":
        return stripHtml(note.fields[nt?.sortField ?? 0] ?? "");
      case "card":
        return col.cardTemplateName(card);
      case "deck":
        return (col.deck(card.did)?.name ?? "") + (card.odid ? ` (${col.deck(card.odid)?.name})` : "");
      case "due":
        return dueText(card, today);
      case "ivl":
        return card.type === CardType.Review || card.type === CardType.Relearn ? formatDays(card.ivl) : card.type === CardType.New ? "(new)" : "(learning)";
      case "ease":
        return card.type === CardType.New ? "(new)" : card.type === CardType.Learn ? "(learning)" : `${card.factor / 10}%`;
      case "reps":
        return String(card.reps);
      case "lapses":
        return String(card.lapses);
      case "created":
        return formatDate(note.id);
      case "notetype":
        return nt?.name ?? "";
      case "tags":
        return note.tags.join(" ");
      case "cards":
        return String(col.cardsOfNote(note.id).length);
      case "edited":
        return formatDate(note.mod);
    }
  };

  const cols = mode === "cards" ? CARD_COLS : NOTE_COLS;

  const sidebarItem = (label: string, q: string, indent = 0, icon?: React.ReactNode) => (
    <div key={label + q} className={`side-item${query === q ? " on" : ""}`} style={{ paddingLeft: 8 + indent * 12 }} onClick={() => search(q)} title={q}>
      {icon}
      <span className="side-label">{label}</span>
    </div>
  );
  // a foldable sidebar section with a chevron that turns (Files)
  const section = (name: string, items: React.ReactNode[]) => {
    if (items.length === 0) return null;
    const open = !folded.has(name);
    return (
      <div className={`side-section${open ? " open" : ""}`} key={name}>
        <button className="side-head" aria-expanded={open} onClick={() => toggleSection(name)}>
          {name}
          {GLYPH.chevron}
        </button>
        <div className="side-items">
          <div>{items}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="page wide browser">
      <h2 className="browse-title">Browse</h2>
      <div className="sidebar">
        {section(
          "Saved Searches",
          Object.entries(col.d.savedSearches).map(([name, q]) => (
            <div key={name} className={`side-item${query === q ? " on" : ""}`} onClick={() => search(q)} title={q}>
              <span className="side-label">{name}</span>
              <a
                className="small side-x"
                onClick={(e) => {
                  e.stopPropagation();
                  store.update("Delete Saved Search", (c) => delete c.d.savedSearches[name]);
                }}
                title="Delete"
              >
                ×
              </a>
            </div>
          )),
        )}
        {section("Today", [sidebarItem("Added Today", "added:1"), sidebarItem("Studied Today", "rated:1"), sidebarItem("Again Today", "rated:1:1")])}
        {section("Card State", [
          sidebarItem("New", "is:new"),
          sidebarItem("Learning", "is:learn"),
          sidebarItem("Review", "is:review"),
          sidebarItem("Due", "is:due"),
          sidebarItem("Suspended", "is:suspended"),
          sidebarItem("Buried", "is:buried"),
          sidebarItem("Marked", "tag:marked"),
          sidebarItem("Leech", "tag:leech"),
        ])}
        {section(
          "Flags",
          [1, 2, 3, 4, 5, 6, 7].map((f) => sidebarItem(`Flag ${f}`, `flag:${f}`, 0, <i className="dot" style={{ background: FLAG_COLORS[f] }} />)),
        )}
        {section("Decks", [
          sidebarItem("All", "deck:*"),
          ...col.decks().map((d) => {
            const leaf = d.name.split("::").pop()!;
            const depth = d.name.split("::").length - 1;
            return sidebarItem(leaf, `"deck:${d.name}"`, depth, <Monogram name={leaf} size="sm" />);
          }),
        ])}
        {section("Note Types", col.notetypes().map((nt) => sidebarItem(nt.name, `"note:${nt.name}"`)))}
        {section("Tags", [
          sidebarItem("(untagged)", "tag:none"),
          ...col.allTags().map((t) => sidebarItem(t, `"tag:${t}"`, 0, <i className="dot" style={{ background: `hsl(${hueOf(t)} 65% 55%)` }} />)),
        ])}
      </div>

      <div>
        <div className="row" style={{ marginBottom: 10 }}>
          <input
            style={{ flex: 1, minWidth: 200 }}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search(input)}
            placeholder="Search (Anki syntax)"
          />
          <button className="primary" onClick={() => search(input)}>
            Search
          </button>
          <button
            onClick={async () => {
              const name = await askText("Name for saved search:");
              if (name) store.update("Save Search", (c) => (c.d.savedSearches[name] = input));
            }}
          >
            Save
          </button>
          <select
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as Mode);
              setSelected(new Set());
            }}
          >
            <option value="cards">Cards</option>
            <option value="notes">Notes</option>
          </select>
          <div className="view-menu-anchor" ref={viewMenuRef}>
            <button className="icon view-btn" aria-label="View options" aria-haspopup="menu" aria-expanded={viewMenu} onClick={() => setViewMenu(!viewMenu)}>
              {GLYPH.more}
            </button>
            {viewMenu && (
              // Files-style pull-down: view switch on top, then sort with a checkmark and the direction
              <div className="menu view-menu" role="menu">
                <div className="seg" role="group" aria-label="View as">
                  <button role="menuitemradio" aria-checked={view === "icons"} className={view === "icons" ? "on" : ""} onClick={() => setView("icons")}>
                    {GLYPH.grid}
                    <span>Icons</span>
                  </button>
                  <button role="menuitemradio" aria-checked={view === "list"} className={view === "list" ? "on" : ""} onClick={() => setView("list")}>
                    {GLYPH.list}
                    <span>List</span>
                  </button>
                </div>
                <hr />
                <div className="menu-title">Sort by</div>
                {cols.map((k) => (
                  <button
                    key={k}
                    role="menuitemradio"
                    aria-checked={sort.key === k}
                    className="radio"
                    onClick={() => {
                      setSort((s) => ({ key: k, desc: s.key === k ? !s.desc : false }));
                      setViewMenu(false);
                    }}
                  >
                    <span className="lead">{sort.key === k && GLYPH.check}</span>
                    <span className="grow">{COL_NAMES[k]}</span>
                    {sort.key === k && (sort.desc ? GLYPH.down : GLYPH.up)}
                  </button>
                ))}
                <hr />
                {(["cards", "notes"] as Mode[]).map((m) => (
                  <button
                    key={m}
                    role="menuitemradio"
                    aria-checked={mode === m}
                    className="radio"
                    onClick={() => {
                      setMode(m);
                      setSelected(new Set());
                      setViewMenu(false);
                    }}
                  >
                    <span className="lead">{mode === m && GLYPH.check}</span>
                    <span className="grow">{m === "cards" ? "Cards" : "Notes"}</span>
                  </button>
                ))}
                <hr />
                <button
                  onClick={() => {
                    setSelected(new Set(rows));
                    setViewMenu(false);
                  }}
                >
                  Select All {GLYPH.select}
                </button>
              </div>
            )}
          </div>
          <span className="muted">
            {rows.length} {mode} shown, {selected.size} selected
          </span>
        </div>

        <div className="row actions">
          <button onClick={() => setSelected(new Set(rows))}>Select All</button>
          <button onClick={() => setModal("deck")}>Change Deck</button>
          <button
            onClick={async () => {
              const spec = await askText("Set due date. Examples: 0 = today, 1! = tomorrow + change interval to 1, 3-7 = random 3-7 days", "0");
              if (spec !== null) act("Set Due Date", () => store.col.setDueDate(selCardIds(), spec));
            }}
          >
            Set Due Date
          </button>
          <button onClick={async () => await askConfirm("Reset selected cards to new?") && act("Forget", () => store.col.forgetCards(selCardIds()), "Cards reset.")}>
            Forget
          </button>
          <button onClick={() => setModal("reposition")}>Reposition</button>
          <button
            onClick={() =>
              act(allSuspended ? "Unsuspend" : "Suspend", () =>
                allSuspended ? store.col.unsuspendCards(selCardIds()) : store.col.suspendCards(selCardIds()),
              )
            }
          >
            {allSuspended ? "Unsuspend" : "Suspend"}
          </button>
          <button
            onClick={() =>
              act(allBuried ? "Unbury" : "Bury", () => (allBuried ? store.col.unburyCards(selCardIds()) : store.col.buryCards(selCardIds())))
            }
          >
            {allBuried ? "Unbury" : "Bury"}
          </button>
          <select value="" onChange={(e) => act("Flag", () => store.col.setFlag(selCardIds(), Number(e.target.value)))}>
            <option value="" disabled>
              Flag…
            </option>
            <option value={0}>Clear flag</option>
            {[1, 2, 3, 4, 5, 6, 7].map((f) => (
              <option key={f} value={f}>
                Flag {f}
              </option>
            ))}
          </select>
          <button onClick={() => act("Toggle Mark", () => store.col.toggleMark(selNoteIds()))}>Mark</button>
          <button
            onClick={async () => {
              const t = await askText("Add tags (space separated):");
              if (t) act("Add Tags", () => store.col.addTags(selNoteIds(), t.split(/\s+/)));
            }}
          >
            Add Tags
          </button>
          <button
            onClick={async () => {
              const t = await askText("Remove tags (space separated):");
              if (t) act("Remove Tags", () => store.col.removeTags(selNoteIds(), t.split(/\s+/)));
            }}
          >
            Remove Tags
          </button>
          <button onClick={() => setModal("findreplace")}>Find & Replace</button>
          <button onClick={() => (selected.size ? setModal("changent") : toast("Nothing selected."))}>Change Note Type</button>
          <button onClick={() => singleCardId && setModal("info")} disabled={!singleCardId}>
            Info
          </button>
          <button onClick={() => singleCardId && setModal("preview")} disabled={!singleCardId}>
            Preview
          </button>
          <button
            className="danger"
            onClick={async () => {
              const nids = selNoteIds();
              if (nids.length && await askConfirm(`Delete ${nids.length} note(s) and their cards?`)) {
                act("Delete Notes", () => store.col.removeNotes(nids), `${nids.length} notes deleted.`);
                setSelected(new Set());
              }
            }}
          >
            Delete
          </button>
        </div>

        {view === "icons" ? (
          // icons: rounded thumbnails of each card's front, name and details below (Files icons / Safari tab overview)
          <div className="tablewrap tile-grid" role="listbox" aria-multiselectable="true" aria-label={mode}>
            {rows.slice(0, 400).map((id) => {
              const card = mode === "cards" ? col.d.cards[id] : col.cardsOfNote(id)[0];
              const front = cell(id, "sort");
              const sel = selected.has(id);
              return (
                <div
                  key={id}
                  role="option"
                  aria-selected={sel}
                  className={`tile-card${sel ? " sel" : ""}${card && card.queue === Queue.Suspended ? " susp" : ""}`}
                  onMouseDown={(e) => clickRow(id, e)}
                >
                  <div className="thumb">
                    <span>{front || "—"}</span>
                    {card && card.flags > 0 && <i className="dot flag-dot" style={{ background: FLAG_COLORS[card.flags] }} />}
                    {sel && <span className="sel-badge">{GLYPH.check}</span>}
                  </div>
                  <div className="tile-name">{mode === "cards" ? cell(id, "card") : cell(id, "notetype")}</div>
                  <div className="tile-meta">{mode === "cards" ? `${cell(id, "deck").split("::").pop()} · ${cell(id, "due")}` : `${cell(id, "cards")} cards · ${cell(id, "created")}`}</div>
                </div>
              );
            })}
            {rows.length > 400 && <div className="muted small tile-more">Showing the first 400. Refine your search.</div>}
          </div>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  {cols.map((k) => (
                    <th key={k} onClick={() => setSort((s) => ({ key: k, desc: s.key === k ? !s.desc : false }))}>
                      {COL_NAMES[k]}
                      {sort.key === k ? (sort.desc ? " ▼" : " ▲") : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 2000).map((id) => {
                  const card = mode === "cards" ? col.d.cards[id] : undefined;
                  const cls = [
                    selected.has(id) ? "sel" : "",
                    card && card.queue === Queue.Suspended ? "susp" : "",
                    card && card.flags && !selected.has(id) ? `flag${card.flags}` : "",
                  ].join(" ");
                  return (
                    <tr key={id} className={cls} onMouseDown={(e) => clickRow(id, e)}>
                      {cols.map((k) => (
                        <td key={k}>{cell(id, k)}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rows.length > 2000 && <div className="muted small">Showing first 2000 rows. Refine your search.</div>}
          </div>
        )}

        {draft && col.d.notetypes[draft.ntid] && (
          <div className="panel editpane">
            <NoteEditor note={draft} nt={col.d.notetypes[draft.ntid]} onChange={editDraft} allTags={col.allTags()} />
            <button className="primary" onClick={saveDraft}>
              Save
            </button>
          </div>
        )}
      </div>

      {modal === "info" && singleCardId && (
        <Modal onClose={() => setModal(null)}>
          <CardInfo cid={singleCardId} />
        </Modal>
      )}
      {modal === "preview" && singleCardId && (
        <Modal onClose={() => setModal(null)}>
          <Preview card={col.d.cards[singleCardId]} />
        </Modal>
      )}
      {modal === "deck" && (
        <Modal onClose={() => setModal(null)}>
          <ChangeDeck
            onPick={(did) => {
              act("Change Deck", () => store.col.changeDeck(selCardIds(), did));
              setModal(null);
            }}
          />
        </Modal>
      )}
      {modal === "reposition" && (
        <Modal onClose={() => setModal(null)}>
          <Reposition
            onDone={(start, step, shift) => {
              act("Reposition", () => store.col.reposition(selCardIds(), start, step, shift));
              setModal(null);
            }}
          />
        </Modal>
      )}
      {modal === "findreplace" && (
        <Modal onClose={() => setModal(null)}>
          <FindReplace
            nids={selected.size ? selNoteIds() : [...new Set(rows.map((id) => (mode === "cards" ? col.d.cards[id].nid : id)))]}
            onClose={() => setModal(null)}
          />
        </Modal>
      )}
      {modal === "changent" && (
        <Modal onClose={() => setModal(null)}>
          <ChangeNoteType nids={selNoteIds()} onClose={() => setModal(null)} />
        </Modal>
      )}
    </div>
  );
}

function dueSortKey(card: Card, today: number): number {
  if (card.queue === Queue.Suspended || card.queue < -1) return 1e15;
  if (card.type === CardType.New) return 1e12 + card.due;
  if (card.queue === Queue.Learn) return (card.due - Date.now()) / 86400e3 + today;
  return card.due;
}

function dueText(card: Card, today: number): string {
  let s: string;
  if (card.odid) s = "(filtered)";
  else if (card.type === CardType.New) s = `New #${card.due}`;
  else if (card.queue === Queue.Learn) s = formatDate(card.due);
  else s = formatDate(Date.now() + (card.due - today) * 86400e3);
  if (card.queue === Queue.Suspended) s = `(${s})`;
  if (card.queue < -1) s = `[${s}]`;
  return s;
}

function Preview({ card }: { card: Card }) {
  const col = useCol();
  const [back, setBack] = useState(false);
  const r = col.renderCard(card);
  return (
    <div>
      <CardView html={back ? r.a : r.q} css={r.css} cardClass={`card card${card.ord + 1}`} />
      <div className="row">
        <button onClick={() => setBack(!back)}>{back ? "Show Front" : "Show Back"}</button>
      </div>
    </div>
  );
}

function ChangeDeck({ onPick }: { onPick: (did: ID) => void }) {
  const col = useCol();
  const decks = col.decks().filter((d) => !d.dyn);
  const [did, setDid] = useState(decks[0]?.id);
  return (
    <div>
      <h3>Change Deck</h3>
      <select size={10} style={{ width: "100%" }} value={did} onChange={(e) => setDid(Number(e.target.value))}>
        {decks.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
      <div className="row">
        <button onClick={() => did && onPick(did)}>Move</button>
        <button
          onClick={async () => {
            const name = await askText("New deck name:");
            if (name) onPick(store.update("Add Deck", (c) => c.addDeck(name)).id);
          }}
        >
          New Deck…
        </button>
      </div>
    </div>
  );
}

function Reposition({ onDone }: { onDone: (start: number, step: number, shift: boolean) => void }) {
  const [start, setStart] = useState(0);
  const [step, setStep] = useState(1);
  const [shift, setShift] = useState(false);
  return (
    <div>
      <h3>Reposition New Cards</h3>
      <label>
        Start position <input type="number" value={start} onChange={(e) => setStart(Number(e.target.value))} />
      </label>
      <label>
        Step <input type="number" min={1} value={step} onChange={(e) => setStep(Number(e.target.value))} />
      </label>
      <label>
        <input type="checkbox" checked={shift} onChange={(e) => setShift(e.target.checked)} /> Shift position of existing cards
      </label>
      <button onClick={() => onDone(start, Math.max(1, step), shift)}>OK</button>
    </div>
  );
}

function FindReplace({ nids, onClose }: { nids: ID[]; onClose: () => void }) {
  const col = useCol();
  const { toast } = useNav();
  const [find, setFind] = useState("");
  const [repl, setRepl] = useState("");
  const [field, setField] = useState("");
  const [regex, setRegex] = useState(false);
  const [matchCase, setMatchCase] = useState(false);
  const fieldNames = [...new Set(nids.flatMap((n) => col.d.notetypes[col.d.notes[n]?.ntid]?.fields.map((f) => f.name) ?? []))];
  return (
    <div>
      <h3>Find and Replace ({nids.length} notes)</h3>
      <label>
        Find <input value={find} onChange={(e) => setFind(e.target.value)} autoFocus />
      </label>
      <label>
        Replace with <input value={repl} onChange={(e) => setRepl(e.target.value)} />
      </label>
      <label>
        In{" "}
        <select value={field} onChange={(e) => setField(e.target.value)}>
          <option value="">All fields</option>
          {fieldNames.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
      </label>
      <label>
        <input type="checkbox" checked={regex} onChange={(e) => setRegex(e.target.checked)} /> Treat input as regular expression
      </label>
      <label>
        <input type="checkbox" checked={matchCase} onChange={(e) => setMatchCase(e.target.checked)} /> Match case
      </label>
      <button
        onClick={() => {
          try {
            const n = store.update("Find and Replace", (c) => c.findReplace(nids, find, repl, { regex, matchCase, field: field || null }));
            toast(`${n} notes updated.`);
            onClose();
          } catch (e) {
            toast((e as Error).message);
          }
        }}
        disabled={!find}
      >
        Replace
      </button>
    </div>
  );
}

function ChangeNoteType({ nids, onClose }: { nids: ID[]; onClose: () => void }) {
  const col = useCol();
  const { toast } = useNav();
  const oldNt = col.d.notetypes[col.d.notes[nids[0]]?.ntid];
  const sameType = nids.every((n) => col.d.notes[n]?.ntid === oldNt?.id);
  const [ntid, setNtid] = useState(oldNt?.id);
  const nt = col.d.notetypes[ntid ?? 0];
  const [fmap, setFmap] = useState<number[]>([]);
  const [tmap, setTmap] = useState<number[]>([]);
  useEffect(() => {
    if (!nt || !oldNt) return;
    setFmap(nt.fields.map((f, i) => {
      const byName = oldNt.fields.findIndex((o) => o.name === f.name);
      return byName >= 0 ? byName : i < oldNt.fields.length ? i : -1;
    }));
    setTmap(nt.templates.map((_, i) => (i < oldNt.templates.length ? i : -1)));
  }, [ntid]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!oldNt || !sameType) return <div>Please select notes of a single note type.</div>;
  return (
    <div>
      <h3>Change Note Type</h3>
      <label>
        New type{" "}
        <select value={ntid} onChange={(e) => setNtid(Number(e.target.value))}>
          {col.notetypes().map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      {nt && (
        <>
          <h3>Fields</h3>
          {nt.fields.map((f, i) => (
            <label key={i}>
              {f.name} ←{" "}
              <select value={fmap[i] ?? -1} onChange={(e) => setFmap(fmap.map((v, j) => (j === i ? Number(e.target.value) : v)))}>
                <option value={-1}>(nothing)</option>
                {oldNt.fields.map((o, oi) => (
                  <option key={oi} value={oi}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
          {nt.kind === "standard" && oldNt.kind === "standard" && (
            <>
              <h3>Templates</h3>
              {nt.templates.map((t, i) => (
                <label key={i}>
                  {t.name} ←{" "}
                  <select value={tmap[i] ?? -1} onChange={(e) => setTmap(tmap.map((v, j) => (j === i ? Number(e.target.value) : v)))}>
                    <option value={-1}>(nothing)</option>
                    {oldNt.templates.map((o, oi) => (
                      <option key={oi} value={oi}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </>
          )}
          <p className="small muted">Cards from unmapped templates will be deleted.</p>
          <button
            onClick={() => {
              store.update("Change Note Type", (c) => c.changeNoteType(nids, nt.id, fmap, tmap));
              toast("Note type changed.");
              onClose();
            }}
          >
            OK
          </button>
        </>
      )}
    </div>
  );
}
