import { useState } from "react";
import { store, useCol } from "../lib/store";
import type { ID } from "../lib/types";
import { useNav } from "./nav";

type Kind = "newLimit" | "revLimit" | "forgotten" | "ahead" | "preview" | "state" | "tags";

export function CustomStudy({ did }: { did: ID }) {
  const col = useCol();
  const { go, toast } = useNav();
  const deck = col.deck(did);
  const [kind, setKind] = useState<Kind>("newLimit");
  const [n, setN] = useState(10);
  const [state, setState] = useState("is:due");
  const [tags, setTags] = useState("");
  if (!deck) return null;
  const d = `"deck:${deck.name}"`;

  const run = () => {
    switch (kind) {
      case "newLimit":
        store.update("Custom Study", (c) => c.extendLimits(did, n, 0));
        toast(`New card limit increased by ${n} for today.`);
        return go({ name: "overview", did });
      case "revLimit":
        store.update("Custom Study", (c) => c.extendLimits(did, 0, n));
        toast(`Review limit increased by ${n} for today.`);
        return go({ name: "overview", did });
    }
    let search = "";
    let resched = true;
    let limit = 100;
    if (kind === "forgotten") search = `${d} rated:${n}:1`;
    else if (kind === "ahead") search = `${d} prop:due<=${n} -is:due is:review`;
    else if (kind === "preview") {
      search = `${d} is:new added:${n}`;
      resched = false;
    } else if (kind === "state") {
      search = `${d} ${state}`;
      limit = n;
      resched = state !== "";
    } else if (kind === "tags") search = `${d} ${tags.split(/\s+/).filter(Boolean).map((t) => `tag:${t}`).join(" or ") || ""}`;
    const res = store.update("Custom Study Session", (c) => {
      let fd = c.deckByName("Custom Study Session");
      if (fd && !fd.dyn) throw new Error("A normal deck named 'Custom Study Session' exists.");
      if (fd) c.emptyFiltered(fd.id);
      else fd = c.addDeck("Custom Study Session", true);
      fd.terms = [{ search, limit, order: kind === "state" ? "random" : "due" }];
      fd.resched = resched;
      c.d.prefs.currentDeck = fd.id;
      return { id: fd.id, count: c.rebuildFiltered(fd.id) };
    });
    if (!res.count) toast("No cards matched the criteria you provided.");
    go({ name: "overview", did: res.id });
  };

  const opt = (k: Kind, label: string) => (
    <label>
      <input type="radio" checked={kind === k} onChange={() => setKind(k)} /> {label}
    </label>
  );

  return (
    <div className="page narrow">
      <h2>Custom Study — {deck.name}</h2>
      {opt("newLimit", "Increase today's new card limit")}
      {opt("revLimit", "Increase today's review card limit")}
      {opt("forgotten", "Review forgotten cards")}
      {opt("ahead", "Review ahead")}
      {opt("preview", "Preview new cards")}
      {opt("state", "Study by card state or tag")}
      {opt("tags", "Study cards with specific tags")}
      <div style={{ margin: "12px 0" }}>
        {kind === "newLimit" || kind === "revLimit" ? (
          <label>
            Increase by <input type="number" value={n} onChange={(e) => setN(Number(e.target.value))} /> cards
          </label>
        ) : kind === "forgotten" ? (
          <label>
            Review cards forgotten in last <input type="number" value={n} onChange={(e) => setN(Number(e.target.value))} /> days
          </label>
        ) : kind === "ahead" ? (
          <label>
            Review ahead by <input type="number" value={n} onChange={(e) => setN(Number(e.target.value))} /> days
          </label>
        ) : kind === "preview" ? (
          <label>
            Preview new cards added in the last <input type="number" value={n} onChange={(e) => setN(Number(e.target.value))} /> days
          </label>
        ) : kind === "state" ? (
          <>
            <label>
              Select{" "}
              <select value={state} onChange={(e) => setState(e.target.value)}>
                <option value="is:new">New cards only</option>
                <option value="is:due">Due cards only</option>
                <option value="-is:new">All review cards in random order</option>
                <option value="">All cards in random order (don't reschedule)</option>
              </select>
            </label>
            <label>
              Limit to <input type="number" value={n} onChange={(e) => setN(Number(e.target.value))} /> cards
            </label>
          </>
        ) : (
          <label>
            Tags <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="space separated" />
          </label>
        )}
      </div>
      <p className="muted small">{col.counts(did).newCount} new cards available today in this deck.</p>
      <div className="row">
        <button className="primary" onClick={run}>
          OK
        </button>
        <button onClick={() => go({ name: "overview", did })}>Cancel</button>
      </div>
    </div>
  );
}
