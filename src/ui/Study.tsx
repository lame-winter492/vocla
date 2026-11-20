import { askConfirm, modalOpen } from "./dialog";
import { useCallback, useEffect, useRef, useState } from "react";
import { ALL_DECKS, type QueuedCard } from "../lib/col";
import { store, useCol } from "../lib/store";
import { formatIvlSecs } from "../lib/time";
import type { Ease, ID, Note } from "../lib/types";
import { CardInfo } from "./CardInfo";
import { CardView, readTyped } from "./CardView";
import { Modal } from "./Modal";
import { useNav } from "./nav";
import { NoteEditor } from "./NoteEditor";
import { haptic } from "./haptics";

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
  const [answered, setAnswered] = useState(0); // cards answered this session (for the progress line)
  const [tools, setTools] = useState(false);
  const leave = () => go(did === ALL_DECKS ? { name: "decks" } : { name: "overview", did });

  const next = useCallback(() => {
    const q = store.col.getNextCard(did, lastCid.current);
    setCurrent(q);
    setDone(!q);
    setShowAnswer(false);
    setTyped(undefined);
    setStarted(Date.now());
  }, [did]);

  useEffect(() => {
    if (did !== ALL_DECKS) store.mutate((c) => (c.d.prefs.currentDeck = did));
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
    haptic("tap");
    setTyped(readTyped(viewRef.current));
    setShowAnswer(true);
  };

  // ---- touch: tap the card to reveal, then swipe right = Good, left = Again ----
  const drag = useRef<{ x: number; y: number; dx: number; active: boolean } | null>(null);
  const SWIPE = 90;
  const cardEl = () => viewRef.current?.querySelector<HTMLElement>(".cardview") ?? null;
  const setSwipeVisual = (dx: number, animate: boolean) => {
    const el = cardEl();
    const root = viewRef.current?.closest<HTMLElement>(".reviewer");
    if (el) {
      el.style.transition = animate ? "transform .28s cubic-bezier(.2,.9,.3,1.2)" : "none";
      el.style.transform = dx ? `translateX(${dx}px) rotate(${dx / 30}deg)` : "";
    }
    if (root) {
      root.dataset.swipe = dx > 24 ? "good" : dx < -24 ? "again" : "";
      root.style.setProperty("--swipe", String(Math.min(1, Math.abs(dx) / SWIPE)));
    }
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (!showAnswer || e.pointerType === "mouse") return;
    drag.current = { x: e.clientX, y: e.clientY, dx: 0, active: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.active && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.3) d.active = true;
    if (!d.active) return;
    if (Math.abs(d.dx) < SWIPE && Math.abs(dx) >= SWIPE) haptic("tap"); // crossing the threshold
    d.dx = dx;
    setSwipeVisual(dx, false);
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d?.active) return;
    if (d.dx >= SWIPE) answer(3);
    else if (d.dx <= -SWIPE) answer(1);
    setSwipeVisual(0, true);
  };
  const onCardClick = (e: React.MouseEvent) => {
    if (showAnswer) return;
    // ignore taps on things inside the card (audio buttons, the type-in box, links)
    const path = e.nativeEvent.composedPath() as HTMLElement[];
    if (path.some((el) => el.tagName && ["BUTTON", "INPUT", "A", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
    reveal();
  };

  const answer = (ease: Ease) => {
    if (!card || !showAnswer) return;
    haptic(ease === 1 ? "error" : "tap");
    const { leech } = store.update("Review", (c) => c.answer(card.id, ease, Date.now() - started));
    if (leech)
      toast(
        conf.lapse.leechAction === "suspend"
          ? "This card keeps slipping, so it's suspended. Try adding an example sentence or a memory hook, then unsuspend it."
          : "This card keeps slipping (tagged leech). An example sentence or a memory hook usually helps.",
      );
    lastCid.current = card.id;
    setAnswered((n) => n + 1);
    next();
  };

  const undo = () => {
    const l = store.undo();
    if (l) {
      toast(`Undo: ${l}`);
      if (l === "Review") setAnswered((n) => Math.max(0, n - 1));
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
    if (k === "Escape") return tools ? setTools(false) : leave();
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
      <div className="page narrow review-done">
        <div className="hero">
          <div className="muted">{answered > 0 ? `${answered} cards reviewed this session` : "Nothing to study here right now"}</div>
          <div className="big-number">
            <b>Done</b>
            <span>for now</span>
          </div>
          {nextLearn && (
            <div className="breakdown">Next learning card in {formatIvlSecs(Math.max(0, (nextLearn - Date.now()) / 1000), false)}. This screen picks it up automatically.</div>
          )}
        </div>
        <div className="row">
          <button className="primary big" onClick={() => go({ name: "decks" })}>
            Back to Today
          </button>
          {did !== ALL_DECKS && !col.deck(did)?.dyn && (
            <button className="big" onClick={() => go({ name: "custom", did })}>
              Custom study
            </button>
          )}
          {store.undoLabel() === "Review" && (
            <button className="big ghost" onClick={undo}>
              Undo last answer
            </button>
          )}
        </div>
      </div>
    );
  }

  const { q, a, css } = col.renderCard(card, typed);
  const note = col.d.notes[card.nid];
  const marked = note?.tags.some((t) => t.toLowerCase() === "marked");
  const counts = col.studyCounts(did);
  const remaining = counts.newCount + counts.learnCount + counts.reviewCount;
  const sessionTotal = answered + remaining;
  const ivls = showAnswer ? col.nextIntervals(card) : null;
  const elapsed = Math.floor((Date.now() - started) / 1000);
  const deckName = col.deck(card.odid || card.did)?.name ?? "";
  const tool = (label: string, key: string, fn: () => void, cls = "") => (
    <button
      className={cls}
      onClick={() => {
        setTools(false);
        fn();
      }}
    >
      {label} <span className="kbd">{key}</span>
    </button>
  );

  return (
    <div className="reviewer">
      <header className="review-head">
        <button className="ghost icon" aria-label="End session (Esc)" onClick={leave}>
          ✕
        </button>
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={sessionTotal} aria-valuenow={answered}>
          <div style={{ width: `${sessionTotal ? (answered / sessionTotal) * 100 : 0}%` }} />
        </div>
        <span className="review-count">
          {answered}/{sessionTotal}
        </span>
        <button className="ghost icon" aria-label="Card actions" aria-expanded={tools} onClick={() => setTools(!tools)}>
          ⋯
        </button>
        {tools && (
          <div className="menu" style={{ right: 16, top: "calc(100% - 4px)" }} onMouseLeave={() => setTools(false)}>
            {tool("Edit note", "e", () => setEditing(structuredClone(col.d.notes[card.nid])))}
            {tool(marked ? "Unmark" : "Mark", "*", () => store.update("Mark", (c) => c.toggleMark([card.nid])))}
            {tool(card.flags ? "Remove flag" : "Flag red", "^1", () => store.update("Flag", (c) => c.setFlag([card.id], card.flags ? 0 : 1)))}
            {tool("Replay audio", "r", () => replay())}
            {tool("Card info", "i", () => setInfo(true))}
            <hr />
            {tool("Bury card", "-", () => noteAction("Bury", () => store.col.buryCards([card.id]), "Card buried."))}
            {tool("Bury note", "=", () => noteAction("Bury Note", () => store.col.buryCards(store.col.cardsOfNote(card.nid).map((c) => c.id)), "Note buried."))}
            {tool("Suspend card", "@", () => noteAction("Suspend", () => store.col.suspendCards([card.id]), "Card suspended."))}
            {tool("Suspend note", "!", () =>
              noteAction("Suspend Note", () => store.col.suspendCards(store.col.cardsOfNote(card.nid).map((c) => c.id)), "Note suspended."),
            )}
            <hr />
            {tool("Undo", "z", undo)}
            {tool("Deck options", "o", () => go({ name: "options", did: card.odid || card.did }))}
            {tool(
              "Delete note",
              "^Del",
              async () => {
                if (await askConfirm("Delete this note and all its cards?")) noteAction("Delete Note", () => store.col.removeNotes([card.nid]), "Note deleted.");
              },
              "danger",
            )}
          </div>
        )}
      </header>
      <div
        className="cardarea"
        ref={viewRef}
        onClick={onCardClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="swipe-hint again" aria-hidden="true">
          Again
        </div>
        <div className="swipe-hint good" aria-hidden="true">
          Good
        </div>
        <div className="row meta">
          <span>{deckName}</span>
          {marked && <span>★ marked</span>}
          {card.flags > 0 && <span className={`flagchip flag${card.flags}`}>flag {card.flags}</span>}
          <span style={{ flex: 1 }} />
          {conf.showTimer && <span className="mono">{Math.min(elapsed, conf.maxAnswerSecs)}s</span>}
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
          <div className="remaining" aria-label="Remaining: new, learning, review">
            <span className={`c-new ${current.kind === "new" ? "current-count" : ""}`}>{counts.newCount}</span> ·{" "}
            <span className={`c-learn ${current.kind === "learn" ? "current-count" : ""}`}>{counts.learnCount}</span> ·{" "}
            <span className={`c-rev ${current.kind === "review" ? "current-count" : ""}`}>{counts.reviewCount}</span>
          </div>
        )}
        {!showAnswer ? (
          <button className="primary big reveal" onClick={reveal}>
            Show answer
          </button>
        ) : (
          <div className="answer-buttons">
            {([1, 2, 3, 4] as Ease[]).map((e) => (
              <button key={e} className={`ease${e}`} onClick={() => answer(e)} title={`Shortcut: ${e}`}>
                <span className="label">{["Again", "Hard", "Good", "Easy"][e - 1]}</span>
                {col.d.prefs.showIntervalsOnButtons && ivls && <span className="ivl">{ivls[e] === 0 ? "end" : formatIvlSecs(ivls[e])}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      {editing && (
        <Modal onClose={() => setEditing(null)}>
          <h3>Edit</h3>
          <NoteEditor note={editing} nt={col.d.notetypes[editing.ntid]} onChange={setEditing} autoFocus allTags={col.allTags()} />
          <div className="row">
            <button
              className="primary"
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
