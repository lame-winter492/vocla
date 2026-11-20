import { useState } from "react";
import { store, useCol } from "../lib/store";
import type { FilterOrder, FilterTerm, ID } from "../lib/types";
import { useNav } from "./nav";

const ORDERS: [FilterOrder, string][] = [
  ["oldestSeen", "Oldest seen first"],
  ["random", "Random"],
  ["ivlAsc", "Increasing intervals"],
  ["ivlDesc", "Decreasing intervals"],
  ["mostLapses", "Most lapses"],
  ["added", "Order added"],
  ["due", "Order due"],
  ["latestAdded", "Latest added first"],
  ["relativeOverdue", "Relative overdueness"],
];

/** Create or edit a filtered deck. */
export function FilteredDeck({ did, search, search2, resched }: { did?: ID; search?: string; search2?: string; resched?: boolean }) {
  const col = useCol();
  const { go, toast } = useNav();
  const existing = did ? col.deck(did) : undefined;
  const cur = col.deck(col.d.prefs.currentDeck);
  const [name, setName] = useState(() => {
    if (existing) return existing.name;
    let i = 1;
    while (col.deckByName(`Filtered Deck ${i}`)) i++;
    return `Filtered Deck ${i}`;
  });
  const [terms, setTerms] = useState<FilterTerm[]>(
    existing?.terms ?? [{ search: search ?? (cur && !cur.dyn ? `"deck:${cur.name}" is:due` : "is:due"), limit: 100, order: "random" }],
  );
  const [second, setSecond] = useState(!!(existing?.terms && existing.terms.length > 1) || !!search2);
  const [term2, setTerm2] = useState<FilterTerm>(existing?.terms?.[1] ?? { search: search2 ?? "", limit: 20, order: "due" });
  const [rs, setRs] = useState(existing?.resched ?? resched ?? true);
  const [again, setAgain] = useState(existing?.previewAgainSecs ?? 60);
  const [hard, setHard] = useState(existing?.previewHardSecs ?? 600);
  const [good, setGood] = useState(existing?.previewGoodSecs ?? 0);

  const save = () => {
    try {
      const n = store.update(existing ? "Update Filtered Deck" : "Create Filtered Deck", (c) => {
        const deck = existing ? c.d.decks[existing.id] : c.addDeck(name, true);
        if (!deck.dyn) throw new Error("A normal deck with that name already exists.");
        if (existing && name !== existing.name) c.renameDeck(deck.id, name);
        deck.terms = second ? [terms[0], term2] : [terms[0]];
        deck.resched = rs;
        deck.previewAgainSecs = again;
        deck.previewHardSecs = hard;
        deck.previewGoodSecs = good;
        c.d.prefs.currentDeck = deck.id;
        return { count: c.rebuildFiltered(deck.id), id: deck.id };
      });
      if (n.count === 0) toast("No cards matched the criteria you provided.");
      go({ name: "overview", did: n.id });
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const termEditor = (t: FilterTerm, set: (t: FilterTerm) => void) => (
    <>
      <label>
        Search <input style={{ width: "100%" }} value={t.search} onChange={(e) => set({ ...t, search: e.target.value })} />
      </label>
      <div className="row">
        <label>
          Limit to <input type="number" style={{ width: 80 }} value={t.limit} onChange={(e) => set({ ...t, limit: Number(e.target.value) })} /> cards
        </label>
        <label>
          selected by{" "}
          <select value={t.order} onChange={(e) => set({ ...t, order: e.target.value as FilterOrder })}>
            {ORDERS.map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>
    </>
  );

  return (
    <div className="page narrow">
      <h2>{existing ? "Filtered Deck Options" : "Create Filtered Deck"}</h2>
      <label>
        Name <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <fieldset>
        <legend>Filter</legend>
        {termEditor(terms[0], (t) => setTerms([t]))}
      </fieldset>
      <label>
        <input type="checkbox" checked={second} onChange={(e) => setSecond(e.target.checked)} /> Second filter
      </label>
      {second && <fieldset>{termEditor(term2, setTerm2)}</fieldset>}
      <fieldset>
        <legend>Options</legend>
        <label>
          <input type="checkbox" checked={rs} onChange={(e) => setRs(e.target.checked)} /> Reschedule cards based on my answers in this deck
        </label>
        {!rs && (
          <div>
            <div className="muted small">Preview delays (seconds; 0 returns the card to its original deck):</div>
            <div className="row">
              <label>
                Again <input type="number" style={{ width: 70 }} value={again} onChange={(e) => setAgain(Number(e.target.value))} />
              </label>
              <label>
                Hard <input type="number" style={{ width: 70 }} value={hard} onChange={(e) => setHard(Number(e.target.value))} />
              </label>
              <label>
                Good <input type="number" style={{ width: 70 }} value={good} onChange={(e) => setGood(Number(e.target.value))} />
              </label>
            </div>
          </div>
        )}
      </fieldset>
      <div className="row">
        <button className="primary" onClick={save}>
          {existing ? "Rebuild" : "Build"}
        </button>
        <button onClick={() => go(existing ? { name: "overview", did: existing.id } : { name: "decks" })}>Cancel</button>
      </div>
    </div>
  );
}
