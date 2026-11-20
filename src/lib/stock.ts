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
  font-family: "Geist", system-ui, sans-serif;
  font-size: 26px;
  text-align: center;
}
`;

export const CLOZE_CSS = DEFAULT_CSS + `.cloze {
  font-weight: 600;
  color: #f2b84b;
}
`;

export const VOCAB_CSS = DEFAULT_CSS + `.word {
  font-size: 40px;
  font-weight: 600;
  letter-spacing: -0.02em;
}
.meaning { font-size: 24px; }
.example { font-size: 18px; margin-top: 22px; opacity: 0.85; }
.example-tr { font-size: 16px; margin-top: 6px; opacity: 0.6; }
.notes { font-size: 15px; margin-top: 16px; opacity: 0.6; }
`;

/** Earlier stock styling; note types still using it unchanged are upgraded on load. */
export const LEGACY_DEFAULT_CSS = `.card {
  font-family: arial;
  font-size: 20px;
  text-align: center;
  color: black;
  background-color: white;
}
`;
export const LEGACY_CLOZE_CSS = LEGACY_DEFAULT_CSS + `.cloze {
  font-weight: bold;
  color: blue;
}
`;

export type StockKind = "vocabulary" | "basic" | "basicReversed" | "basicOptionalReversed" | "basicTyping" | "cloze";

export const STOCK_NAMES: Record<StockKind, string> = {
  vocabulary: "Vocabulary",
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
    case "vocabulary":
      // Two directions (recognise + recall), an example sentence for context, audio via TTS.
      return {
        ...base,
        kind: "standard",
        css: VOCAB_CSS,
        fields: [{ name: "Word" }, { name: "Meaning" }, { name: "Example" }, { name: "Example translation" }, { name: "Notes" }],
        templates: [
          {
            name: "Recognise",
            qfmt: '<div class="word">{{Word}}</div>\n{{tts auto:Word}}',
            afmt:
              '{{FrontSide}}\n\n<hr id=answer>\n\n<div class="meaning">{{Meaning}}</div>\n{{#Example}}<div class="example">{{Example}}</div>{{/Example}}\n{{#Example translation}}<div class="example-tr">{{Example translation}}</div>{{/Example translation}}\n{{#Notes}}<div class="notes">{{Notes}}</div>{{/Notes}}',
          },
          {
            name: "Recall",
            qfmt: '<div class="meaning">{{Meaning}}</div>\n{{#Example translation}}<div class="example-tr">{{Example translation}}</div>{{/Example translation}}',
            afmt:
              '{{FrontSide}}\n\n<hr id=answer>\n\n<div class="word">{{Word}}</div>\n{{tts auto:Word}}\n{{#Example}}<div class="example">{{Example}}</div>{{/Example}}\n{{#Notes}}<div class="notes">{{Notes}}</div>{{/Notes}}',
          },
        ],
      };
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
    // siblings (e.g. word→meaning and meaning→word) are buried so one doesn't give away the other the same day
    new: { perDay: 20, steps: [1, 10], graduatingIvl: 1, easyIvl: 4, initialFactor: 2500, order: "added", bury: true },
    rev: { perDay: 200, easyBonus: 1.3, hardFactor: 1.2, ivlModifier: 1, maxIvl: 36500, bury: true },
    lapse: { steps: [10], mult: 0, minIvl: 1, leechThreshold: 8, leechAction: "tag" },
    newMix: "mix",
    fsrs: { enabled: true, desiredRetention: 0.9 },
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
  const nts = (["vocabulary", "basic", "basicReversed", "basicOptionalReversed", "basicTyping", "cloze"] as StockKind[]).map((k) =>
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
      targetLang: "es-ES",
      haptics: true,
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
