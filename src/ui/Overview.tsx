import { askText } from "./dialog";
import { store, useCol } from "../lib/store";
import { formatIvlSecs } from "../lib/time";
import { useNav } from "./nav";

export function Overview({ did }: { did: number }) {
  const col = useCol();
  const { go, toast } = useNav();
  const deck = col.deck(did);
  if (!deck) return <div className="page">Deck not found.</div>;
  const c = col.counts(did);
  const total = c.newCount + c.learnCount + c.reviewCount;
  const nextLearn = col.nextLearnDue(did);

  return (
    <div className="page narrow overview">
      <h2>{deck.name}</h2>
      <div className="counts">
        <span className="muted">New</span>
        <span className="num c-new">{c.newCount}</span>
        <span className="muted">Learning</span>
        <span className="num c-learn">{c.learnCount}</span>
        <span className="muted">To review</span>
        <span className="num c-rev">{c.reviewCount}</span>
      </div>
      <p>
        {total > 0 ? (
          <button className="primary big" autoFocus onClick={() => go({ name: "study", did })}>
            Study Now
          </button>
        ) : (
          <span>
            Congratulations! You have finished this deck for now.
            {nextLearn && <><br />The next learning card will be ready in {formatIvlSecs(Math.max(0, (nextLearn - Date.now()) / 1000), false)}.</>}
          </span>
        )}
      </p>
      {deck.description && <div className="muted" dangerouslySetInnerHTML={{ __html: deck.description }} />}
      <div className="row" style={{ justifyContent: "center", marginTop: 16 }}>
        {deck.dyn ? (
          <>
            <button onClick={() => go({ name: "filtered", did })}>Options</button>
            <button
              onClick={() => {
                const n = store.update("Rebuild", (cc) => cc.rebuildFiltered(did));
                toast(`${n} cards in deck.`);
              }}
            >
              Rebuild
            </button>
            <button onClick={() => store.update("Empty", (cc) => cc.emptyFiltered(did))}>Empty</button>
          </>
        ) : (
          <>
            <button onClick={() => go({ name: "options", did })}>Options</button>
            <button onClick={() => go({ name: "custom", did })}>Custom Study</button>
            <button
              onClick={async () => {
                const d = await askText("Deck description (HTML allowed):", deck.description);
                if (d !== null) store.update("Description", (cc) => (cc.d.decks[did].description = d));
              }}
            >
              Description
            </button>
          </>
        )}
        <button
          onClick={() => {
            const ids = col.deckAndChildren(did).map((d) => d.id);
            const n = Object.values(col.d.cards).filter((x) => ids.includes(x.did) && x.queue < -1).length;
            if (!n) return toast("No buried cards.");
            store.update("Unbury", (cc) => cc.unburyCards(Object.values(cc.d.cards).filter((x) => ids.includes(x.did)).map((x) => x.id)));
            toast(`Unburied ${n} cards.`);
          }}
        >
          Unbury
        </button>
        <button onClick={() => go({ name: "browse", query: `"deck:${deck.name}"` })}>Browse</button>
        <button onClick={() => go({ name: "add", did })}>Add</button>
      </div>
    </div>
  );
}
