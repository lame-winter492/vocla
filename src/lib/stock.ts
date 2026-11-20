import type { Collection, Deck, DeckConfig, NoteType } from "./types";
import { dayNumber } from "./time";
import { emptyProgress, SAMPLE_COURSE } from "./courses";

let lastId = 0;
/** Unique, roughly time-ordered ids (like Anki's). */
export function newId(): number {
  let id = Date.now();
  if (id <= lastId) id = lastId + 1;
  lastId = id;
  return id;
}

export function newGuid(): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%&()*+,-./:;<=>?@[]^_`{|}~";
  let s = "";
  for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export const DEFAULT_CSS = `.card {
  font-family: arial;
  font-size: 20px;
  text-align: center;
  color: black;
  background-color: white;
}
`;

export const CLOZE_CSS = DEFAULT_CSS + `.cloze {
  font-weight: bold;
  color: blue;
}
`;

export type StockKind = "basic" | "basicReversed" | "basicOptionalReversed" | "basicTyping" | "cloze";

export const STOCK_NAMES: Record<StockKind, string> = {
  basic: "Basic",
  basicReversed: "Basic (and reversed card)",
  basicOptionalReversed: "Basic (optional reversed card)",
  basicTyping: "Basic (type in the answer)",
  cloze: "Cloze",
};

export function stockNoteType(kind: StockKind, name?: string): NoteType {
  const base = { id: newId(), name: name ?? STOCK_NAMES[kind], css: DEFAULT_CSS, sortField: 0, mod: Date.now() };
  const back = "{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}";
  const card1 = { name: "Card 1", qfmt: "{{Front}}", afmt: back };
  switch (kind) {
    case "basic":
      return { ...base, kind: "standard", fields: [{ name: "Front" }, { name: "Back" }], templates: [card1] };
    case "basicReversed":
      return {
        ...base,
        kind: "standard",
        fields: [{ name: "Front" }, { name: "Back" }],
        templates: [card1, { name: "Card 2", qfmt: "{{Back}}", afmt: "{{FrontSide}}\n\n<hr id=answer>\n\n{{Front}}" }],
      };
    case "basicOptionalReversed":
      return {
        ...base,
        kind: "standard",
        fields: [{ name: "Front" }, { name: "Back" }, { name: "Add Reverse" }],
        templates: [
          card1,
          { name: "Card 2", qfmt: "{{#Add Reverse}}{{Back}}{{/Add Reverse}}", afmt: "{{FrontSide}}\n\n<hr id=answer>\n\n{{Front}}" },
        ],
      };
    case "basicTyping":
      return {
        ...base,
        kind: "standard",
        fields: [{ name: "Front" }, { name: "Back" }],
        templates: [{ name: "Card 1", qfmt: "{{Front}}\n\n{{type:Back}}", afmt: "{{Front}}\n\n<hr id=answer>\n\n{{type:Back}}" }],
      };
    case "cloze":
      return {
        ...base,
        kind: "cloze",
        css: CLOZE_CSS,
        fields: [{ name: "Text" }, { name: "Back Extra" }],
        templates: [{ name: "Cloze", qfmt: "{{cloze:Text}}", afmt: "{{cloze:Text}}<br>\n{{Back Extra}}" }],
      };
  }
}

export function defaultDeckConfig(id = 1, name = "Default"): DeckConfig {
  return {
    id,
    name,
    mod: Date.now(),
    new: { perDay: 20, steps: [1, 10], graduatingIvl: 1, easyIvl: 4, initialFactor: 2500, order: "added", bury: false },
    rev: { perDay: 200, easyBonus: 1.3, hardFactor: 1.2, ivlModifier: 1, maxIvl: 36500, bury: false },
    lapse: { steps: [10], mult: 0, minIvl: 1, leechThreshold: 8, leechAction: "tag" },
    newMix: "mix",
    maxAnswerSecs: 60,
    showTimer: false,
    autoplay: true,
  };
}

export function newDeck(id: number, name: string, confId = 1): Deck {
  return {
    id,
    name,
    description: "",
    confId,
    collapsed: false,
    today: { day: 0, newDone: 0, revDone: 0, newExtra: 0, revExtra: 0 },
    mod: Date.now(),
    dyn: false,
  };
}

export function newFilteredDeck(id: number, name: string, search: string): Deck {
  return {
    ...newDeck(id, name, 0),
    dyn: true,
    terms: [{ search, limit: 100, order: "random" }],
    resched: true,
    previewAgainSecs: 60,
    previewHardSecs: 600,
    previewGoodSecs: 0,
  };
}

export function emptyCollection(): Collection {
  const now = Date.now();
  const nts = (["basic", "basicReversed", "basicOptionalReversed", "basicTyping", "cloze"] as StockKind[]).map((k) =>
    stockNoteType(k),
  );
  const notetypes: Collection["notetypes"] = {};
  for (const nt of nts) notetypes[nt.id] = nt;
  return {
    version: 1,
    crt: now,
    mod: now,
    prefs: {
      rolloverHour: 4,
      learnAheadMins: 20,
      showIntervalsOnButtons: true,
      showRemaining: true,
      currentDeck: 1,
      lastUnburied: dayNumber(now, 4),
      lastNoteType: nts[0].id,
      lastAddDeck: 1,
    },
    decks: { 1: newDeck(1, "Default") },
    dconf: { 1: defaultDeckConfig() },
    notetypes,
    notes: {},
    cards: {},
    revlog: [],
    nextPos: 1,
    savedSearches: {},
    courses: { [SAMPLE_COURSE.id]: structuredClone(SAMPLE_COURSE) },
    courseProgress: emptyProgress(),
  };
}
