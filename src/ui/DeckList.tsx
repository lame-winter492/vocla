import { askText, askConfirm } from "./dialog";
import { useState, type ReactNode } from "react";
import { dayNumber } from "../lib/time";
import type { DeckTreeNode } from "../lib/col";
import { store, useCol } from "../lib/store";
import { useNav } from "./nav";

export function DeckList() {
  const col = useCol();
  const { go, toast } = useNav();
  const tree = col.deckTree();
  const [menu, setMenu] = useState<number | null>(null);

  const createDeck = async () => {
    const name = await askText("New deck name (use :: for subdecks):");
    if (!name?.trim()) return;
    store.update("Add Deck", (c) => c.addDeck(name));
  };

  const rows: ReactNode[] = [];
  const walk = (nodes: DeckTreeNode[]) => {
    for (const n of nodes) {
      const d = n.deck;
      rows.push(
        <tr key={d.id}>
          <td style={{ paddingLeft: 8 + n.depth * 18 }}>
            {n.children.length > 0 ? (
              <a onClick={() => store.mutate(() => (d.collapsed = !d.collapsed))} style={{ display: "inline-block", width: 14 }}>
                {d.collapsed ? "+" : "−"}
              </a>
            ) : (
              <span style={{ display: "inline-block", width: 14 }} />
            )}
            <a
              onClick={() => {
                store.mutate((c) => (c.d.prefs.currentDeck = d.id));
                go({ name: "overview", did: d.id });
              }}
              style={{ fontStyle: d.dyn ? "italic" : undefined, fontWeight: col.d.prefs.currentDeck === d.id ? "bold" : undefined }}
            >
              {n.name}
            </a>
          </td>
          <td className="num c-new">{n.counts.newCount || <span className="muted">0</span>}</td>
          <td className="num c-learn">{n.counts.learnCount || <span className="muted">0</span>}</td>
          <td className="num c-rev">{n.counts.reviewCount || <span className="muted">0</span>}</td>
          <td style={{ position: "relative", width: 40 }}>
            <button onClick={() => setMenu(menu === d.id ? null : d.id)}>⚙</button>
            {menu === d.id && (
              <div
                style={{ position: "absolute", right: 0, top: 28, background: "var(--bg)", border: "1px solid var(--line)", zIndex: 10, display: "flex", flexDirection: "column" }}
                onMouseLeave={() => setMenu(null)}
              >
                <button
                  onClick={async () => {
                    const name = await askText("Rename deck:", d.name);
                    if (name)
                      try {
                        store.update("Rename Deck", (c) => c.renameDeck(d.id, name));
                      } catch (e) {
                        toast((e as Error).message);
                      }
                    setMenu(null);
                  }}
                >
                  Rename
                </button>
                {d.dyn ? (
                  <button onClick={() => go({ name: "filtered", did: d.id })}>Options</button>
                ) : (
                  <button onClick={() => go({ name: "options", did: d.id })}>Options</button>
                )}
                <button onClick={() => go({ name: "export", did: d.id })}>Export</button>
                <button
                  onClick={async () => {
                    const n = col.deckAndChildren(d.id).length;
                    const cards = Object.values(col.d.cards).filter((c) => col.deckAndChildren(d.id).some((x) => x.id === c.did)).length;
                    if (await askConfirm(`Delete "${d.name}"${n > 1 ? ` and ${n - 1} subdecks` : ""}${d.dyn ? "" : ` with ${cards} cards`}?`)) {
                      store.update("Delete Deck", (c) => c.removeDeck(d.id));
                      toast("Deck deleted.");
                    }
                    setMenu(null);
                  }}
                >
                  Delete
                </button>
              </div>
            )}
          </td>
        </tr>,
      );
      if (!d.collapsed) walk(n.children);
    }
  };
  walk(tree);

  const today = col.today();
  const studied = col.d.revlog.filter((r) => r.ease > 0 && dayNumber(r.id, col.d.prefs.rolloverHour) === today);
  const secs = Math.round(studied.reduce((s, r) => s + r.time, 0) / 1000);

  return (
    <div className="page">
      <table className="decks" style={{ width: "100%" }}>
        <thead>
          <tr>
            <th>Deck</th>
            <th className="num">New</th>
            <th className="num">Learn</th>
            <th className="num">Due</th>
            <th />
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
      <p className="muted">
        Studied {studied.length} cards in {Math.round(secs / 60)} minutes today.
      </p>
      <div className="row">
        <button onClick={createDeck}>Create Deck</button>
        <button onClick={() => go({ name: "filtered" })}>Create Filtered Deck</button>
        <button onClick={() => go({ name: "import" })}>Import File</button>
      </div>
    </div>
  );
}
