// Collection operations: decks, notes, cards, study queues.
import { answerCard, nextIntervalSecs, type SchedCtx } from "./scheduler";
import { searchCards } from "./search";
import { defaultDeckConfig, newDeck, newFilteredDeck, newGuid, newId } from "./stock";
import type { VocabItem } from "./courses";
import { clozeNumbers, escapeHtml, render, stripHtml, templateNonEmpty } from "./template";
import { dayNumber } from "./time";
import {
  CardType,
  Queue,
  type Card,
  type Collection,
  type Deck,
  type DeckConfig,
  type Ease,
  type ID,
  type Note,
  type NoteType,
  type RevlogEntry,
} from "./types";

export interface DeckCounts {
  newCount: number;
  learnCount: number;
  reviewCount: number;
}

export interface DeckTreeNode {
  deck: Deck;
  name: string; // last component
  depth: number;
  children: DeckTreeNode[];
  counts: DeckCounts;
}

export interface QueuedCard {
  card: Card;
  kind: "new" | "learn" | "review";
}

/** Virtual deck id meaning "all regular decks" (the Today screen's study session). */
export const ALL_DECKS = 0;

export class Col {
  constructor(public d: Collection) {}

  // ---------- time ----------
  now(): number {
    return Date.now();
  }
  today(): number {
    return dayNumber(this.now(), this.d.prefs.rolloverHour);
  }

  // ---------- decks ----------
  decks(): Deck[] {
    return Object.values(this.d.decks).sort((a, b) => a.name.localeCompare(b.name));
  }
  deck(id: ID): Deck | undefined {
    return this.d.decks[id];
  }
  deckByName(name: string): Deck | undefined {
    const lower = name.toLowerCase();
    return Object.values(this.d.decks).find((d) => d.name.toLowerCase() === lower);
  }
  /** Deck plus all descendants. `ALL_DECKS` (0) = every regular deck. */
  deckAndChildren(id: ID): Deck[] {
    if (id === ALL_DECKS) return Object.values(this.d.decks).filter((d) => !d.dyn);
    const deck = this.d.decks[id];
    if (!deck) return [];
    const prefix = deck.name + "::";
    return Object.values(this.d.decks).filter((d) => d.id === id || d.name.startsWith(prefix));
  }
  parents(deck: Deck): Deck[] {
    const parts = deck.name.split("::");
    const out: Deck[] = [];
    for (let i = 1; i < parts.length; i++) {
      const p = this.deckByName(parts.slice(0, i).join("::"));
      if (p) out.push(p);
    }
    return out;
  }
  addDeck(name: string, filtered = false): Deck {
    name = normalizeDeckName(name);
    const existing = this.deckByName(name);
    if (existing) return existing;
    // ensure parents exist
    const parts = name.split("::");
    for (let i = 1; i < parts.length; i++) this.addDeck(parts.slice(0, i).join("::"));
    const id = newId();
    const deck = filtered ? newFilteredDeck(id, name, "") : newDeck(id, name);
    this.d.decks[id] = deck;
    return deck;
  }
  renameDeck(id: ID, newName: string): void {
    const deck = this.d.decks[id];
    newName = normalizeDeckName(newName);
    if (!deck || !newName) return;
    const other = this.deckByName(newName);
    if (other && other.id !== id) throw new Error("A deck with that name already exists.");
    if (newName.toLowerCase().startsWith(deck.name.toLowerCase() + "::")) throw new Error("Can't move a deck into itself.");
    const old = deck.name;
    for (const d of this.deckAndChildren(id)) d.name = newName + d.name.slice(old.length);
    const parts = newName.split("::");
    for (let i = 1; i < parts.length; i++) this.addDeck(parts.slice(0, i).join("::"));
  }
  removeDeck(id: ID): void {
    const decks = this.deckAndChildren(id);
    const ids = new Set(decks.map((d) => d.id));
    for (const d of decks) if (d.dyn) this.emptyFiltered(d.id);
    const cids = Object.values(this.d.cards)
      .filter((c) => ids.has(c.did))
      .map((c) => c.id);
    this.removeCards(cids);
    for (const did of ids) delete this.d.decks[did];
    if (Object.keys(this.d.decks).length === 0 || !this.d.decks[1]) {
      if (!this.d.decks[1]) this.d.decks[1] = newDeck(1, "Default");
    }
    if (ids.has(this.d.prefs.currentDeck)) this.d.prefs.currentDeck = 1;
  }
  confFor(did: ID): DeckConfig {
    const deck = this.d.decks[did];
    if (deck?.dyn) return defaultDeckConfig();
    const conf = deck ? this.d.dconf[deck.confId] : undefined;
    return conf ?? this.d.dconf[1] ?? defaultDeckConfig();
  }
  /** Config to use for a card (home deck's config when in filtered deck). */
  confForCard(card: Card): DeckConfig {
    return this.confFor(card.odid || card.did);
  }
  addConfig(name: string, cloneFrom?: DeckConfig): DeckConfig {
    const base = cloneFrom ? structuredClone(cloneFrom) : defaultDeckConfig();
    const conf = { ...base, id: newId(), name, mod: Date.now() };
    this.d.dconf[conf.id] = conf;
    return conf;
  }
  removeConfig(id: ID): void {
    if (id === 1) throw new Error("The default preset can't be removed.");
    delete this.d.dconf[id];
    for (const d of Object.values(this.d.decks)) if (d.confId === id) d.confId = 1;
  }

  // ---------- today counters ----------
  deckToday(deck: Deck) {
    const today = this.today();
    if (deck.today.day !== today) deck.today = { day: today, newDone: 0, revDone: 0, newExtra: 0, revExtra: 0 };
    return deck.today;
  }
  newLimitRemaining(deck: Deck): number {
    if (deck.dyn) return Infinity;
    const t = this.deckToday(deck);
    return Math.max(0, this.confFor(deck.id).new.perDay + t.newExtra - t.newDone);
  }
  revLimitRemaining(deck: Deck): number {
    if (deck.dyn) return Infinity;
    const t = this.deckToday(deck);
    return Math.max(0, this.confFor(deck.id).rev.perDay + t.revExtra - t.revDone);
  }
  extendLimits(did: ID, newExtra: number, revExtra: number): void {
    const deck = this.d.decks[did];
    if (!deck) return;
    const t = this.deckToday(deck);
    t.newExtra += newExtra;
    t.revExtra += revExtra;
  }

  // ---------- note types ----------
  notetypes(): NoteType[] {
    return Object.values(this.d.notetypes).sort((a, b) => a.name.localeCompare(b.name));
  }
  notetype(id: ID): NoteType | undefined {
    return this.d.notetypes[id];
  }
  fieldMap(note: Note, nt?: NoteType): Record<string, string> {
    nt = nt ?? this.d.notetypes[note.ntid];
    const out: Record<string, string> = {};
    nt?.fields.forEach((f, i) => (out[f.name] = note.fields[i] ?? ""));
    return out;
  }
  /** Card ordinals a note should have given its current content. */
  wantedOrds(note: Note, nt: NoteType): number[] {
    if (nt.kind === "cloze") {
      const nums = new Set<number>();
      for (const f of note.fields) for (const n of clozeNumbers(f)) nums.add(n);
      const ords = [...nums].map((n) => n - 1).filter((o) => o >= 0);
      return ords.length ? ords : [0];
    }
    const fm = this.fieldMap(note, nt);
    const ords: number[] = [];
    nt.templates.forEach((t, i) => {
      if (templateNonEmpty(t.qfmt, fm)) ords.push(i);
    });
    return ords;
  }

  // ---------- notes & cards ----------
  cardsOfNote(nid: ID): Card[] {
    return Object.values(this.d.cards)
      .filter((c) => c.nid === nid)
      .sort((a, b) => a.ord - b.ord);
  }
  newNote(nt: NoteType): Note {
    return { id: 0, guid: newGuid(), ntid: nt.id, fields: nt.fields.map(() => ""), tags: [], mod: Date.now() };
  }
  /** Adds a note and its cards. Returns number of cards created. */
  addNote(note: Note, did: ID): number {
    const nt = this.d.notetypes[note.ntid];
    if (!nt) throw new Error("Missing note type");
    const ords = this.wantedOrds(note, nt);
    if (ords.length === 0) return 0;
    note.id = note.id || newId();
    note.mod = Date.now();
    note.tags = normalizeTags(note.tags);
    this.d.notes[note.id] = note;
    const pos = this.d.nextPos++;
    for (const ord of ords) this.makeCard(note, ord, did, pos);
    return ords.length;
  }
  private makeCard(note: Note, ord: number, did: ID, pos: number): Card {
    const deck = this.d.decks[did];
    if (!deck || deck.dyn) did = 1;
    const card: Card = {
      id: newId(),
      nid: note.id,
      did,
      odid: 0,
      ord,
      mod: Date.now(),
      type: CardType.New,
      queue: Queue.New,
      due: pos,
      odue: 0,
      ivl: 0,
      factor: 0,
      reps: 0,
      lapses: 0,
      step: 0,
      flags: 0,
    };
    if (this.confFor(did).new.order === "random") card.due = Math.floor(Math.random() * 1_000_000);
    this.d.cards[card.id] = card;
    return card;
  }
  /** Save note edits; generates any newly-required cards. */
  updateNote(note: Note): void {
    note.mod = Date.now();
    note.tags = normalizeTags(note.tags);
    this.d.notes[note.id] = note;
    this.generateCards(note);
  }
  generateCards(note: Note): number {
    const nt = this.d.notetypes[note.ntid];
    if (!nt) return 0;
    const existing = this.cardsOfNote(note.id);
    if (existing.length === 0) return 0;
    const have = new Set(existing.map((c) => c.ord));
    const did = existing[0].odid || existing[0].did;
    const pos = existing.find((c) => c.type === CardType.New)?.due ?? this.d.nextPos++;
    let n = 0;
    for (const ord of this.wantedOrds(note, nt))
      if (!have.has(ord)) {
        this.makeCard(note, ord, did, pos);
        n++;
      }
    return n;
  }
  removeNotes(nids: ID[]): void {
    const set = new Set(nids);
    for (const c of Object.values(this.d.cards)) if (set.has(c.nid)) delete this.d.cards[c.id];
    for (const nid of nids) delete this.d.notes[nid];
  }
  removeCards(cids: ID[]): void {
    const nids = new Set<ID>();
    for (const cid of cids) {
      const c = this.d.cards[cid];
      if (c) {
        nids.add(c.nid);
        delete this.d.cards[cid];
      }
    }
    // remove notes left without cards
    const stillUsed = new Set(Object.values(this.d.cards).map((c) => c.nid));
    for (const nid of nids) if (!stillUsed.has(nid)) delete this.d.notes[nid];
  }
  /** Find notes of the same type whose first field matches. */
  findDupes(note: Note): Note[] {
    const key = stripHtml(note.fields[0] ?? "").trim().toLowerCase();
    if (!key) return [];
    return Object.values(this.d.notes).filter(
      (n) => n.id !== note.id && n.ntid === note.ntid && stripHtml(n.fields[0] ?? "").trim().toLowerCase() === key,
    );
  }
  allTags(): string[] {
    const set = new Set<string>();
    for (const n of Object.values(this.d.notes)) for (const t of n.tags) set.add(t);
    return [...set].sort((a, b) => a.localeCompare(b));
  }

  // ---------- rendering ----------
  renderCard(card: Card, typed?: string): { q: string; a: string; css: string } {
    const note = this.d.notes[card.nid];
    const nt = this.d.notetypes[note?.ntid];
    if (!note || !nt) return { q: "(missing note)", a: "", css: "" };
    const tpl = nt.kind === "cloze" ? nt.templates[0] : nt.templates[card.ord];
    if (!tpl) return { q: "(missing template)", a: "", css: nt.css };
    const deck = this.d.decks[card.odid || card.did];
    const ctx = {
      fields: this.fieldMap(note, nt),
      tags: note.tags,
      deck: deck?.name ?? "",
      notetype: nt.name,
      cardName: nt.kind === "cloze" ? `Cloze ${card.ord + 1}` : tpl.name,
      flag: card.flags,
      ord: card.ord,
    };
    const q = render(tpl.qfmt, { ...ctx, question: true });
    const a = render(tpl.afmt, { ...ctx, question: false, frontSide: stripTypeInput(q), typed });
    return { q, a, css: nt.css };
  }
  cardTemplateName(card: Card): string {
    const nt = this.d.notetypes[this.d.notes[card.nid]?.ntid];
    if (!nt) return "";
    return nt.kind === "cloze" ? `Cloze ${card.ord + 1}` : nt.templates[card.ord]?.name ?? `Card ${card.ord + 1}`;
  }

  // ---------- burying ----------
  unburyIfNewDay(): void {
    const today = this.today();
    if (this.d.prefs.lastUnburied >= today) return;
    for (const c of Object.values(this.d.cards)) if (c.queue === Queue.SchedBuried || c.queue === Queue.UserBuried) this.restoreQueue(c);
    this.d.prefs.lastUnburied = today;
  }
  restoreQueue(c: Card): void {
    if (c.type === CardType.New) c.queue = Queue.New;
    else if (c.type === CardType.Review) c.queue = Queue.Review;
    else c.queue = c.due > 1_000_000_000 ? Queue.Learn : Queue.DayLearn;
  }
  buryCards(cids: ID[], user = true): void {
    for (const cid of cids) {
      const c = this.d.cards[cid];
      if (c && c.queue >= 0) {
        c.queue = user ? Queue.UserBuried : Queue.SchedBuried;
        c.mod = Date.now();
      }
    }
  }
  unburyCards(cids: ID[]): void {
    for (const cid of cids) {
      const c = this.d.cards[cid];
      if (c && (c.queue === Queue.SchedBuried || c.queue === Queue.UserBuried)) this.restoreQueue(c);
    }
  }
  suspendCards(cids: ID[]): void {
    for (const cid of cids) {
      const c = this.d.cards[cid];
      if (c) {
        c.queue = Queue.Suspended;
        c.mod = Date.now();
      }
    }
  }
  unsuspendCards(cids: ID[]): void {
    for (const cid of cids) {
      const c = this.d.cards[cid];
      if (c && c.queue === Queue.Suspended) this.restoreQueue(c);
    }
  }
  setFlag(cids: ID[], flag: number): void {
    for (const cid of cids) {
      const c = this.d.cards[cid];
      if (c) c.flags = flag;
    }
  }
  toggleMark(nids: ID[]): void {
    const notes = nids.map((n) => this.d.notes[n]).filter(Boolean);
    const allMarked = notes.every((n) => n.tags.some((t) => t.toLowerCase() === "marked"));
    for (const n of notes) {
      if (allMarked) n.tags = n.tags.filter((t) => t.toLowerCase() !== "marked");
      else if (!n.tags.some((t) => t.toLowerCase() === "marked")) n.tags.push("marked");
      n.mod = Date.now();
    }
  }
  addTags(nids: ID[], tags: string[]): void {
    for (const nid of nids) {
      const n = this.d.notes[nid];
      if (n) {
        n.tags = normalizeTags([...n.tags, ...tags]);
        n.mod = Date.now();
      }
    }
  }
  removeTags(nids: ID[], tags: string[]): void {
    const rm = new Set(tags.map((t) => t.toLowerCase()));
    for (const nid of nids) {
      const n = this.d.notes[nid];
      if (n) {
        n.tags = n.tags.filter((t) => !rm.has(t.toLowerCase()));
        n.mod = Date.now();
      }
    }
  }
  /** Reset cards to new. */
  forgetCards(cids: ID[], resetCounts = true): void {
    for (const cid of cids) {
      const c = this.d.cards[cid];
      if (!c) continue;
      if (c.odid) this.returnHome(c, false);
      c.type = CardType.New;
      c.queue = Queue.New;
      c.due = this.d.nextPos++;
      c.ivl = 0;
      c.factor = 0;
      c.step = 0;
      if (resetCounts) {
        c.reps = 0;
        c.lapses = 0;
      }
      c.mod = Date.now();
      this.logManual(c);
    }
  }
  /** Anki "Set Due Date": spec like "0", "3", "1-7", "5!" (! also sets interval). */
  setDueDate(cids: ID[], spec: string): void {
    const m = spec.trim().match(/^(\d+)(?:-(\d+))?(!)?$/);
    if (!m) throw new Error("Invalid due date. Use e.g. 0, 3, 1-7 or 5!");
    const lo = parseInt(m[1], 10);
    const hi = m[2] ? parseInt(m[2], 10) : lo;
    const today = this.today();
    for (const cid of cids) {
      const c = this.d.cards[cid];
      if (!c) continue;
      if (c.odid) this.returnHome(c, false);
      const days = lo + Math.floor(Math.random() * (hi - lo + 1));
      if (c.type !== CardType.Review) {
        c.factor = c.factor || this.confForCard(c).new.initialFactor;
        c.ivl = Math.max(1, days);
      } else if (m[3]) c.ivl = Math.max(1, days);
      c.type = CardType.Review;
      c.queue = Queue.Review;
      c.due = today + days;
      c.step = 0;
      c.mod = Date.now();
      this.logManual(c);
    }
  }
  /** Reposition new cards. */
  reposition(cids: ID[], start: number, step: number, shift: boolean): void {
    const cards = cids.map((id) => this.d.cards[id]).filter((c) => c && c.type === CardType.New);
    cards.sort((a, b) => a.due - b.due);
    if (shift) {
      const span = cards.length * step;
      const ids = new Set(cards.map((c) => c.id));
      for (const c of Object.values(this.d.cards)) if (c.type === CardType.New && !ids.has(c.id) && c.due >= start) c.due += span;
    }
    cards.forEach((c, i) => (c.due = start + i * step));
    this.d.nextPos = Math.max(this.d.nextPos, ...Object.values(this.d.cards).filter((c) => c.type === CardType.New).map((c) => c.due + 1));
  }
  changeDeck(cids: ID[], did: ID): void {
    const deck = this.d.decks[did];
    if (!deck || deck.dyn) throw new Error("Can't move cards into a filtered deck.");
    for (const cid of cids) {
      const c = this.d.cards[cid];
      if (!c) continue;
      if (c.odid) c.odid = did;
      else c.did = did;
      c.mod = Date.now();
    }
  }
  private logManual(c: Card): void {
    this.d.revlog.push({ id: this.uniqueRevlogId(), cid: c.id, ease: 0, ivl: c.ivl, lastIvl: c.ivl, factor: c.factor, time: 0, type: 4 });
  }
  private lastRevlogId = 0;
  private uniqueRevlogId(): number {
    let id = Date.now();
    if (id <= this.lastRevlogId) id = this.lastRevlogId + 1;
    this.lastRevlogId = id;
    return id;
  }

  // ---------- study queues ----------
  private cardsInDecks(dids: Set<ID>): Card[] {
    return Object.values(this.d.cards).filter((c) => dids.has(c.did));
  }

  /** Builds the study queues for a deck (with subdecks), respecting limits. */
  buildQueues(did: ID): { learn: Card[]; dayLearn: Card[]; review: Card[]; newCards: Card[]; learnAheadCutoff: number } {
    this.unburyIfNewDay();
    const root = this.d.decks[did];
    const decks = this.deckAndChildren(did);
    const dids = new Set(decks.map((d) => d.id));
    const now = this.now();
    const today = this.today();
    const cutoff = now + this.d.prefs.learnAheadMins * 60_000;
    const cards = this.cardsInDecks(dids);

    const learn = cards.filter((c) => (c.queue === Queue.Learn || c.queue === Queue.Preview) && c.due <= cutoff).sort((a, b) => a.due - b.due);
    const dayLearn = cards.filter((c) => c.queue === Queue.DayLearn && c.due <= today).sort((a, b) => a.due - b.due || a.id - b.id);

    if (!root && did !== ALL_DECKS) return { learn, dayLearn, review: [], newCards: [], learnAheadCutoff: cutoff };

    // remaining limits for each deck, capped by ancestors up to root
    const remaining = new Map<ID, { n: number; r: number }>();
    for (const d of decks) remaining.set(d.id, { n: this.newLimitRemaining(d), r: this.revLimitRemaining(d) });
    const chain = (deckId: ID): ID[] => {
      const deck = this.d.decks[deckId];
      const out = [deckId];
      if (!deck || deckId === did) return out;
      for (const p of this.parents(deck)) if (dids.has(p.id)) out.push(p.id);
      return out;
    };

    const isDyn = !!root?.dyn;
    // reviews
    const revCands = cards
      .filter((c) => c.queue === Queue.Review && (isDyn || c.due <= today || (c.odid !== 0 && this.d.decks[c.did]?.dyn)))
      .sort((a, b) => a.due - b.due || hashOrder(a.id, today) - hashOrder(b.id, today));
    const review: Card[] = [];
    for (const c of revCands) {
      const ch = chain(c.did);
      if (ch.every((id) => (remaining.get(id)?.r ?? 0) > 0)) {
        review.push(c);
        for (const id of ch) remaining.get(id)!.r--;
      }
    }
    // new cards: gathered in deck order, then by position
    const newCands = cards
      .filter((c) => c.queue === Queue.New)
      .sort((a, b) => {
        const da = this.d.decks[a.did]?.name ?? "";
        const db = this.d.decks[b.did]?.name ?? "";
        return da.localeCompare(db) || a.due - b.due || a.ord - b.ord;
      });
    const newCards: Card[] = [];
    const seenNotes = new Set<ID>();
    for (const c of newCands) {
      const ch = chain(c.did);
      // when burying new siblings, only take one card per note per day
      if (this.confForCard(c).new.bury && seenNotes.has(c.nid)) continue;
      if (ch.every((id) => (remaining.get(id)?.n ?? 0) > 0)) {
        newCards.push(c);
        seenNotes.add(c.nid);
        for (const id of ch) remaining.get(id)!.n--;
      }
    }
    newCards.sort((a, b) => a.due - b.due || a.ord - b.ord);
    return { learn, dayLearn, review, newCards, learnAheadCutoff: cutoff };
  }

  counts(did: ID): DeckCounts {
    const q = this.buildQueues(did);
    const now = this.now();
    return {
      newCount: q.newCards.length,
      learnCount: q.learn.filter((c) => c.due <= now).length + q.dayLearn.length,
      reviewCount: q.review.length,
    };
  }

  /** Counts as shown during study: learning cards within learn-ahead count once main queue is empty. */
  studyCounts(did: ID): DeckCounts {
    const q = this.buildQueues(did);
    return { newCount: q.newCards.length, learnCount: q.learn.length + q.dayLearn.length, reviewCount: q.review.length };
  }

  getNextCard(did: ID, lastCid?: ID): QueuedCard | null {
    const q = this.buildQueues(did);
    const now = this.now();
    const conf = this.confFor(did);
    const learnDue = q.learn.filter((c) => c.due <= now);
    const mainAvailable = q.dayLearn.length + q.review.length + q.newCards.length > 0;

    if (learnDue.length) {
      const pick = learnDue[0].id === lastCid && (learnDue.length > 1 || mainAvailable) ? (learnDue[1] ?? null) : learnDue[0];
      if (pick) return { card: pick, kind: "learn" };
    }
    // main queue
    const pickMain = (): QueuedCard | null => {
      if (q.dayLearn.length) return { card: q.dayLearn[0], kind: "learn" };
      const hasRev = q.review.length > 0;
      const hasNew = q.newCards.length > 0;
      if (!hasRev && !hasNew) return null;
      let takeNew: boolean;
      if (!hasRev) takeNew = true;
      else if (!hasNew) takeNew = false;
      else if (conf.newMix === "before") takeNew = true;
      else if (conf.newMix === "after") takeNew = false;
      else {
        // spread new cards evenly through reviews
        const total = q.review.length + q.newCards.length;
        const doneIn = (d: Deck) => this.deckToday(d).revDone + this.deckToday(d).newDone;
        const root = this.d.decks[did];
        const done = root ? doneIn(root) : this.decks().filter((d) => !d.dyn && !d.name.includes("::")).reduce((s, d) => s + doneIn(d), 0);
        const every = Math.max(1, Math.floor(total / q.newCards.length));
        takeNew = (done + 1) % every === 0;
      }
      return takeNew ? { card: q.newCards[0], kind: "new" } : { card: q.review[0], kind: "review" };
    };
    const main = pickMain();
    if (main) return main;
    // learn ahead
    if (q.learn.length) return { card: q.learn[0], kind: "learn" };
    return null;
  }

  /** When does the next learning card become due (ms), if any today. */
  nextLearnDue(did: ID): number | null {
    const dids = new Set(this.deckAndChildren(did).map((d) => d.id));
    const due = Object.values(this.d.cards)
      .filter((c) => dids.has(c.did) && (c.queue === Queue.Learn || c.queue === Queue.Preview))
      .map((c) => c.due);
    return due.length ? Math.min(...due) : null;
  }

  schedCtx(card: Card): SchedCtx {
    const deck = this.d.decks[card.did];
    return { now: this.now(), today: this.today(), conf: this.confForCard(card), filtered: deck?.dyn ? deck : undefined };
  }
  nextIntervals(card: Card): Record<Ease, number> {
    return nextIntervalSecs(card, this.schedCtx(card));
  }

  /** Answer a card. Returns true if the card became a leech. */
  answer(cid: ID, ease: Ease, timeMs: number): { leech: boolean } {
    const orig = this.d.cards[cid];
    if (!orig) return { leech: false };
    const ctx = this.schedCtx(orig);
    const res = answerCard(orig, ease, ctx);
    const card = res.card;
    card.mod = Date.now();

    // update daily counts on the card's deck and its parents
    const homeDeck = this.d.decks[orig.did];
    if (homeDeck) {
      for (const d of [homeDeck, ...this.parents(homeDeck)]) {
        const t = this.deckToday(d);
        if (orig.type === CardType.New) t.newDone++;
        else if (orig.queue === Queue.Review) t.revDone++;
      }
    }

    const log: RevlogEntry = {
      id: this.uniqueRevlogId(),
      cid,
      ease,
      ivl: res.logIvl,
      lastIvl: orig.type === CardType.Review || orig.type === CardType.Relearn ? orig.ivl : 0,
      factor: card.factor,
      time: Math.min(timeMs, ctx.conf.maxAnswerSecs * 1000),
      type: res.logType,
    };
    if (!(ctx.filtered && !ctx.filtered.resched && res.restoreOriginal)) this.d.revlog.push(log);
    else this.d.revlog.push({ ...log, ivl: 0 });

    if (ctx.filtered?.resched) card.odue = 0;
    this.d.cards[cid] = card;
    if (res.returnHome) {
      if (res.restoreOriginal) {
        // preview: put card back exactly as it was
        Object.assign(card, { ...orig, mod: Date.now() });
        this.returnHome(card, true);
      } else this.returnHome(card, false);
    }

    // leech handling
    if (res.leech) {
      const note = this.d.notes[card.nid];
      if (note && !note.tags.some((t) => t.toLowerCase() === "leech")) note.tags.push("leech");
      if (ctx.conf.lapse.leechAction === "suspend") card.queue = Queue.Suspended;
    }

    // bury siblings
    const conf = ctx.conf;
    if (conf.new.bury || conf.rev.bury) {
      const today = this.today();
      for (const s of this.cardsOfNote(card.nid)) {
        if (s.id === card.id) continue;
        if ((conf.new.bury && s.queue === Queue.New) || (conf.rev.bury && s.queue === Queue.Review && s.due <= today))
          s.queue = Queue.SchedBuried;
      }
    }
    return { leech: res.leech };
  }

  /** Move a card from a filtered deck back to its home deck. */
  returnHome(card: Card, restoreDue: boolean): void {
    if (!card.odid) return;
    card.did = card.odid;
    card.odid = 0;
    if (restoreDue && card.odue) card.due = card.odue;
    card.odue = 0;
    if (card.queue === Queue.Preview || restoreDue) this.restoreQueue(card);
    if (card.queue === Queue.Learn && card.type === CardType.New) card.queue = Queue.New;
  }

  // ---------- filtered decks ----------
  rebuildFiltered(did: ID): number {
    const deck = this.d.decks[did];
    if (!deck?.dyn) return 0;
    this.emptyFiltered(did);
    const taken = new Set<ID>();
    let total = 0;
    for (const term of deck.terms ?? []) {
      if (!term.search.trim() && (deck.terms?.length ?? 0) > 1) continue;
      let cids = searchCards(this, term.search);
      let cards = cids
        .map((id) => this.d.cards[id])
        .filter((c) => c && !taken.has(c.id) && !c.odid && c.queue >= 0 && !this.d.decks[c.did]?.dyn);
      cards = orderForFilter(cards, term.order, this.today(), this.d.revlog);
      cards = cards.slice(0, term.limit);
      for (const c of cards) {
        taken.add(c.id);
        c.odid = c.did;
        c.did = did;
        c.odue = c.due;
        if (!deck.resched && c.queue !== Queue.New) {
          // preview mode shows everything immediately
          c.queue = Queue.Preview;
          c.due = 0;
        } else if (c.queue === Queue.Review || c.queue === Queue.DayLearn) {
          // reviews/day-learning are shown even if not yet due (review ahead)
        }
        c.mod = Date.now();
        total++;
      }
    }
    return total;
  }
  emptyFiltered(did: ID): void {
    for (const c of Object.values(this.d.cards)) if (c.did === did && c.odid) this.returnHome(c, true);
  }

  // ---------- note type editing ----------
  /** Apply note type changes; `fieldMap[i]` = old index of new field i (or -1 for new). Same for templates. */
  updateNoteType(nt: NoteType, fieldMap?: number[], tmplMap?: number[]): void {
    const old = this.d.notetypes[nt.id];
    nt.mod = Date.now();
    this.d.notetypes[nt.id] = nt;
    if (!old) return;
    const notes = Object.values(this.d.notes).filter((n) => n.ntid === nt.id);
    if (fieldMap) for (const n of notes) n.fields = fieldMap.map((oi) => (oi >= 0 ? n.fields[oi] ?? "" : ""));
    if (tmplMap && nt.kind === "standard") {
      const oldToNew = new Map<number, number>();
      tmplMap.forEach((oi, ni) => oi >= 0 && oldToNew.set(oi, ni));
      const nids = new Set(notes.map((n) => n.id));
      for (const c of Object.values(this.d.cards)) {
        if (!nids.has(c.nid)) continue;
        const ni = oldToNew.get(c.ord);
        if (ni === undefined) delete this.d.cards[c.id];
        else c.ord = ni;
      }
    }
    for (const n of notes) this.generateCards(n);
  }
  removeNoteType(id: ID): void {
    const nids = Object.values(this.d.notes)
      .filter((n) => n.ntid === id)
      .map((n) => n.id);
    this.removeNotes(nids);
    delete this.d.notetypes[id];
  }
  useCount(ntid: ID): number {
    return Object.values(this.d.notes).filter((n) => n.ntid === ntid).length;
  }

  /** Change notes to a different note type, mapping fields and templates by index. */
  changeNoteType(nids: ID[], newNtid: ID, fieldMap: number[], tmplMap: number[]): void {
    const nt = this.d.notetypes[newNtid];
    if (!nt) return;
    for (const nid of nids) {
      const n = this.d.notes[nid];
      if (!n) continue;
      const oldFields = n.fields;
      n.fields = fieldMap.map((oi) => (oi >= 0 ? oldFields[oi] ?? "" : ""));
      const wasCloze = this.d.notetypes[n.ntid]?.kind === "cloze";
      n.ntid = newNtid;
      n.mod = Date.now();
      for (const c of this.cardsOfNote(nid)) {
        if (nt.kind === "cloze" || wasCloze) continue;
        const ni = tmplMap.indexOf(c.ord);
        if (ni < 0) delete this.d.cards[c.id];
        else c.ord = ni;
      }
      if (this.cardsOfNote(nid).length === 0) delete this.d.notes[nid];
      else this.generateCards(n);
    }
  }

  /** Find & replace in note fields. Returns number of notes changed. */
  findReplace(nids: ID[], find: string, replace: string, opts: { regex: boolean; matchCase: boolean; field: string | null }): number {
    const flags = opts.matchCase ? "g" : "gi";
    const re = new RegExp(opts.regex ? find : find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags);
    let changed = 0;
    for (const nid of nids) {
      const n = this.d.notes[nid];
      const nt = n && this.d.notetypes[n.ntid];
      if (!n || !nt) continue;
      let did = false;
      n.fields = n.fields.map((f, i) => {
        if (opts.field && nt.fields[i]?.name !== opts.field) return f;
        const nf = f.replace(re, replace);
        if (nf !== f) did = true;
        return nf;
      });
      if (did) {
        n.mod = Date.now();
        changed++;
      }
    }
    return changed;
  }

  /** Cards whose template would now render empty. */
  emptyCards(): ID[] {
    const out: ID[] = [];
    for (const n of Object.values(this.d.notes)) {
      const nt = this.d.notetypes[n.ntid];
      if (!nt) continue;
      const want = new Set(this.wantedOrds(n, nt));
      const cards = this.cardsOfNote(n.id);
      const empties = cards.filter((c) => !want.has(c.ord));
      // never delete all cards of a note
      if (empties.length === cards.length) empties.shift();
      out.push(...empties.map((c) => c.id));
    }
    return out;
  }

  /** Repair inconsistencies. Returns a list of messages. */
  checkDatabase(): string[] {
    const msgs: string[] = [];
    let n = 0;
    for (const c of Object.values(this.d.cards)) {
      if (!this.d.notes[c.nid]) {
        delete this.d.cards[c.id];
        n++;
      } else if (!this.d.decks[c.did]) {
        c.did = 1;
        msgs.push(`Moved card ${c.id} with missing deck to Default.`);
      } else if (c.odid && !this.d.decks[c.odid]) c.odid = 1;
    }
    if (n) msgs.push(`Deleted ${n} cards with missing notes.`);
    let m = 0;
    const used = new Set(Object.values(this.d.cards).map((c) => c.nid));
    for (const note of Object.values(this.d.notes)) {
      const nt = this.d.notetypes[note.ntid];
      if (!nt || !used.has(note.id)) {
        delete this.d.notes[note.id];
        m++;
        continue;
      }
      if (note.fields.length !== nt.fields.length) {
        note.fields = nt.fields.map((_, i) => note.fields[i] ?? "");
        msgs.push(`Fixed field count for note ${note.id}.`);
      }
    }
    if (m) msgs.push(`Deleted ${m} notes with no cards or missing note type.`);
    for (const d of Object.values(this.d.decks)) if (!d.dyn && !this.d.dconf[d.confId]) d.confId = 1;
    if (!msgs.length) msgs.push("Database rebuilt and optimized. No problems found.");
    return msgs;
  }

  // ---------- courses ----------
  /** Record a finished lesson. Returns XP earned. */
  completeLesson(courseId: string, lessonId: string, accuracy: number): number {
    const p = this.d.courseProgress;
    const byCourse = (p.lessons[courseId] ??= {});
    const prev = byCourse[lessonId];
    const xp = Math.round(10 + 5 * accuracy) + (prev ? 0 : 5);
    byCourse[lessonId] = { best: Math.max(prev?.best ?? 0, accuracy), times: (prev?.times ?? 0) + 1, last: this.now() };
    p.xp += xp;
    const today = this.today();
    if (!p.days.includes(today)) p.days.push(today);
    return xp;
  }

  /** Add a lesson's vocab to "Courses::<course>" as two-way cards. Skips words already there. */
  addVocabToDeck(courseTitle: string, vocab: VocabItem[], tag: string): number {
    const nt =
      this.notetypes().find((n) => n.name === "Vocabulary") ??
      this.notetypes().find((n) => n.name === "Basic (and reversed card)") ??
      this.notetypes().find((n) => n.kind === "standard");
    if (!nt) return 0;
    const deck = this.addDeck(`Courses::${courseTitle}`);
    const have = new Set(
      Object.values(this.d.notes)
        .filter((n) => n.ntid === nt.id)
        .map((n) => stripHtml(n.fields[0] ?? "").trim().toLowerCase()),
    );
    let added = 0;
    for (const v of vocab) {
      if (have.has(v.word.trim().toLowerCase())) continue;
      const note = this.newNote(nt);
      note.fields[0] = escapeHtml(v.word);
      if (nt.name === "Vocabulary") {
        note.fields[1] = escapeHtml(v.translation);
        if (v.note) note.fields[4] = escapeHtml(v.note);
      } else note.fields[1] = escapeHtml(v.translation) + (v.note ? `<br><small>${escapeHtml(v.note)}</small>` : "");
      note.tags = [tag];
      if (this.addNote(note, deck.id)) {
        added++;
        have.add(v.word.trim().toLowerCase());
      }
    }
    return added;
  }

  // ---------- deck tree ----------
  deckTree(): DeckTreeNode[] {
    const nodes = new Map<string, DeckTreeNode>();
    const roots: DeckTreeNode[] = [];
    for (const deck of this.decks()) {
      const parts = deck.name.split("::");
      const node: DeckTreeNode = { deck, name: parts[parts.length - 1], depth: parts.length - 1, children: [], counts: this.counts(deck.id) };
      nodes.set(deck.name.toLowerCase(), node);
      const parent = nodes.get(parts.slice(0, -1).join("::").toLowerCase());
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    // hide the empty Default deck like Anki does when other decks exist
    return roots.filter(
      (r) => !(r.deck.id === 1 && roots.length > 1 && r.children.length === 0 && !Object.values(this.d.cards).some((c) => c.did === 1)),
    );
  }
}

function hashOrder(id: number, salt: number): number {
  let x = (id ^ (salt * 2654435761)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 2246822507) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 3266489909) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

export function normalizeDeckName(name: string): string {
  return name
    .split("::")
    .map((p) => p.trim())
    .filter(Boolean)
    .join("::");
}

export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags.flatMap((t) => t.split(/\s+/))) {
    const tt = t.trim();
    if (tt && !seen.has(tt.toLowerCase())) {
      seen.add(tt.toLowerCase());
      out.push(tt);
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

function stripTypeInput(q: string): string {
  return q.replace(/<input type="text" id="typeans"[^>]*>/g, "");
}

function orderForFilter(cards: Card[], order: string, today: number, revlog: RevlogEntry[]): Card[] {
  const arr = [...cards];
  switch (order) {
    case "random":
      return arr.sort(() => Math.random() - 0.5);
    case "ivlAsc":
      return arr.sort((a, b) => a.ivl - b.ivl);
    case "ivlDesc":
      return arr.sort((a, b) => b.ivl - a.ivl);
    case "mostLapses":
      return arr.sort((a, b) => b.lapses - a.lapses);
    case "added":
      return arr.sort((a, b) => a.nid - b.nid || a.ord - b.ord);
    case "latestAdded":
      return arr.sort((a, b) => b.nid - a.nid || a.ord - b.ord);
    case "due":
      return arr.sort((a, b) => a.type - b.type || a.due - b.due);
    case "relativeOverdue":
      return arr.sort((a, b) => (today - b.due) / Math.max(b.ivl, 1) - (today - a.due) / Math.max(a.ivl, 1));
    case "oldestSeen": {
      const last = new Map<ID, number>();
      for (const r of revlog) last.set(r.cid, r.id);
      return arr.sort((a, b) => (last.get(a.id) ?? 0) - (last.get(b.id) ?? 0));
    }
  }
  return arr;
}
