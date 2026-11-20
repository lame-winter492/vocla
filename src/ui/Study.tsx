import { askConfirm, modalOpen } from "./dialog";
import { useCallback, useEffect, useRef, useState } from "react";
import type { QueuedCard } from "../lib/col";
import { store, useCol } from "../lib/store";
import { formatIvlSecs } from "../lib/time";
import type { Ease, ID, Note } from "../lib/types";
import { CardInfo } from "./CardInfo";
import { CardView, readTyped } from "./CardView";
import { Modal } from "./Modal";
import { useNav } from "./nav";
import { NoteEditor } from "./NoteEditor";

export function Study({ did }: { did: ID }) {
  const col = useCol();
  const { go, toast } = useNav();
  const [current, setCurrent] = useState<QueuedCard | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [typed, setTyped] = useState<string | undefined>(undefined);
  const [started, setStarted] = useState(Date.now());
  const [editing, setEditing] = useState<Note | null>(null);
  const [info, setInfo] = useState(false);
  const [, tick] = useState(0);
  const lastCid = useRef<ID | undefined>(undefined);
  const viewRef = useRef<HTMLDivElement>(null);
  const [done, setDone] = useState(false);

  const next = useCallback(() => {
    const q = store.col.getNextCard(did, lastCid.current);
    setCurrent(q);
    setDone(!q);
    setShowAnswer(false);
    setTyped(undefined);
    setStarted(Date.now());
  }, [did]);

  useEffect(() => {
    store.mutate((c) => (c.d.prefs.currentDeck = did));
    next();
  }, [did, next]);

  // when waiting for learning cards, check periodically; also drives the timer
  useEffect(() => {
    const t = setInterval(() => {
      if (done && store.col.getNextCard(did)) next();
      tick((x) => x + 1);
    }, 1000);
    return () => clearInterval(t);
  }, [done, did, next]);

  const card = current ? col.d.cards[current.card.id] : undefined;
  const conf = card ? col.confForCard(card) : col.confFor(did);

  const reveal = () => {
    if (!card || showAnswer) return;
    setTyped(readTyped(viewRef.current));
    setShowAnswer(true);
  };

  const answer = (ease: Ease) => {
    if (!card || !showAnswer) return;
    const { leech } = store.update("Review", (c) => c.answer(card.id, ease, Date.now() - started));
    if (leech) toast(conf.lapse.leechAction === "suspend" ? "Card was a leech and has been suspended." : "Card was marked as a leech.");
    lastCid.current = card.id;
    next();
  };

  const undo = () => {
    const l = store.undo();
    if (l) {
      toast(`Undo: ${l}`);
      lastCid.current = undefined;
      next();
    }
  };

  const noteAction = (label: string, fn: () => void, msg: string) => {
    store.update(label, fn);
    toast(msg);
    lastCid.current = card?.id;
    next();
  };

  const onKey = (e: KeyboardEvent) => {
    if (editing || info || modalOpen()) return;
    const t = e.target as HTMLElement;
    if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT") return;
    const k = e.key;
    if (k === "Escape") return go({ name: "overview", did });
    if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === "z") {
      e.preventDefault();
      e.stopPropagation();
      return undo();
    }
    if (!card) return;
    if ((e.ctrlKey || e.metaKey) && /^[0-7]$/.test(k)) {
      e.preventDefault();
      const f = Number(k);
      store.update("Flag", (c) => c.setFlag([card.id], card.flags === f ? 0 : f));
      return;
    }
    if ((e.ctrlKey || e.metaKey) && k === "Delete") {
      e.preventDefault();
      return noteAction("Delete Note", () => store.col.removeNotes([card.nid]), "Note deleted.");
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (k === " " || k === "Enter") {
      e.preventDefault();
      if (!showAnswer) reveal();
      else answer(3);
    } else if (showAnswer && ["1", "2", "3", "4"].includes(k)) {
      e.preventDefault(); // don't let the key leak into the next card's type-in box
      answer(Number(k) as Ease);
    }
    else if (k === "e") setEditing(structuredClone(col.d.notes[card.nid]));
    else if (k === "*") store.update("Mark", (c) => c.toggleMark([card.nid]));
    else if (k === "-") noteAction("Bury", () => store.col.buryCards([card.id]), "Card buried.");
    else if (k === "=") noteAction("Bury Note", () => store.col.buryCards(store.col.cardsOfNote(card.nid).map((c) => c.id)), "Note buried.");
    else if (k === "@") noteAction("Suspend", () => store.col.suspendCards([card.id]), "Card suspended.");
    else if (k === "!") noteAction("Suspend Note", () => store.col.suspendCards(store.col.cardsOfNote(card.nid).map((c) => c.id)), "Note suspended.");
    else if (k === "i") setInfo(true);
    else if (k === "r") replay();
    else if (k === "o") go({ name: "options", did: card.odid || card.did });
    else if (k === "z") undo();
  };
  const keyRef = useRef(onKey);
  keyRef.current = onKey;
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const replay = () => {
    const host = viewRef.current?.querySelector("div.cardview")?.shadowRoot;
    speechSynthesis?.cancel();
    host?.querySelectorAll<HTMLButtonElement>("button.tts").forEach((b) => b.click());
  };

  if (!card || !current) {
    const nextLearn = col.nextLearnDue(did);
    return (
      <div className="page narrow overview">
        <h2>Congratulations! You have finished this deck for now.</h2>
        {nextLearn && <p>The next learning card will be ready in {formatIvlSecs(Math.max(0, (nextLearn - Date.now()) / 1000), false)}.</p>}
        <div className="row" style={{ justifyContent: "center" }}>
          <button className="primary" onClick={() => go({ name: "decks" })}>
            Decks
          </button>
          {!col.deck(did)?.dyn && <button onClick={() => go({ name: "custom", did })}>Custom Study</button>}
          {store.undoLabel() === "Review" && <button onClick={undo}>Undo Review</button>}
        </div>
      </div>
    );
  }

  const { q, a, css } = col.renderCard(card, typed);
  const note = col.d.notes[card.nid];
  const marked = note?.tags.some((t) => t.toLowerCase() === "marked");
  const counts = col.studyCounts(did);
  const ivls = showAnswer ? col.nextIntervals(card) : null;
  const elapsed = Math.floor((Date.now() - started) / 1000);
  const deckName = col.deck(card.odid || card.did)?.name ?? "";

  return (
    <div className="reviewer">
      <div className="cardarea" ref={viewRef} onDoubleClick={() => !showAnswer && reveal()}>
        <div className="row meta">
          <span>{deckName}</span>
          {marked && <span>★ marked</span>}
          {card.flags > 0 && <span className={`flagchip flag${card.flags}`}>flag {card.flags}</span>}
          <span style={{ flex: 1 }} />
          {conf.showTimer && <span>{Math.min(elapsed, conf.maxAnswerSecs)}s</span>}
        </div>
        <CardView
          key={`${card.id}-${showAnswer}`}
          html={showAnswer ? a : q}
          css={css}
          cardClass={`card card${card.ord + 1}`}
          onTypeEnter={reveal}
          autoplay={conf.autoplay}
        />
      </div>
      <div className="bottom">
        {col.d.prefs.showRemaining && (
          <div className="remaining">
            <span className={`c-new ${current.kind === "new" ? "current-count" : ""}`}>{counts.newCount}</span> +{" "}
            <span className={`c-learn ${current.kind === "learn" ? "current-count" : ""}`}>{counts.learnCount}</span> +{" "}
            <span className={`c-rev ${current.kind === "review" ? "current-count" : ""}`}>{counts.reviewCount}</span>
          </div>
        )}
        {!showAnswer ? (
          <button className="primary big reveal" onClick={reveal}>
            Show Answer
          </button>
        ) : (
          <div className="answer-buttons">
            {([1, 2, 3, 4] as Ease[]).map((e) => (
              <button key={e} className={`ease${e}`} onClick={() => answer(e)} title={`Shortcut: ${e}`}>
                {col.d.prefs.showIntervalsOnButtons && ivls && <span className="ivl">{ivls[e] === 0 ? "end" : formatIvlSecs(ivls[e])}</span>}
                <span className="label">{["Again", "Hard", "Good", "Easy"][e - 1]}</span>
              </button>
            ))}
          </div>
        )}
        <div className="tools">
          <button onClick={() => setEditing(structuredClone(col.d.notes[card.nid]))}>
            Edit <span className="kbd">e</span>
          </button>
          <button onClick={() => store.update("Mark", (c) => c.toggleMark([card.nid]))}>{marked ? "Unmark" : "Mark"} <span className="kbd">*</span></button>
          <select
            value={card.flags}
            onChange={(e) => store.update("Flag", (c) => c.setFlag([card.id], Number(e.target.value)))}
            title="Flag (Ctrl+1-7)"
          >
            <option value={0}>No flag</option>
            {[1, 2, 3, 4, 5, 6, 7].map((f) => (
              <option key={f} value={f}>
                Flag {f} ({["Red", "Orange", "Green", "Blue", "Pink", "Turquoise", "Purple"][f - 1]})
              </option>
            ))}
          </select>
          <button onClick={() => noteAction("Bury", () => store.col.buryCards([card.id]), "Card buried.")}>
            Bury <span className="kbd">-</span>
          </button>
          <button onClick={() => noteAction("Bury Note", () => store.col.buryCards(store.col.cardsOfNote(card.nid).map((c) => c.id)), "Note buried.")}>
            Bury Note <span className="kbd">=</span>
          </button>
          <button onClick={() => noteAction("Suspend", () => store.col.suspendCards([card.id]), "Card suspended.")}>
            Suspend <span className="kbd">@</span>
          </button>
          <button
            onClick={() =>
              noteAction("Suspend Note", () => store.col.suspendCards(store.col.cardsOfNote(card.nid).map((c) => c.id)), "Note suspended.")
            }
          >
            Suspend Note <span className="kbd">!</span>
          </button>
          <button
            className="danger"
            onClick={async () => {
              if (await askConfirm("Delete this note and all its cards?")) noteAction("Delete Note", () => store.col.removeNotes([card.nid]), "Note deleted.");
            }}
          >
            Delete
          </button>
          <button onClick={() => setInfo(true)}>
            Info <span className="kbd">i</span>
          </button>
          <button onClick={replay}>
            Replay <span className="kbd">r</span>
          </button>
          <button onClick={undo} disabled={!store.undoLabel()}>
            Undo <span className="kbd">z</span>
          </button>
          <button onClick={() => go({ name: "options", did: card.odid || card.did })}>
            Options <span className="kbd">o</span>
          </button>
        </div>
      </div>
      {editing && (
        <Modal onClose={() => setEditing(null)}>
          <h3>Edit</h3>
          <NoteEditor note={editing} nt={col.d.notetypes[editing.ntid]} onChange={setEditing} autoFocus allTags={col.allTags()} />
          <div className="row">
            <button
              onClick={() => {
                store.update("Edit Note", (c) => c.updateNote(editing));
                setEditing(null);
              }}
            >
              Save
            </button>
            <button onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </Modal>
      )}
      {info && (
        <Modal onClose={() => setInfo(false)}>
          <CardInfo cid={card.id} />
        </Modal>
      )}
    </div>
  );
}
