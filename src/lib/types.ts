// Core data model. Modelled closely on Anki's collection structure.
import type { Course, CourseProgress } from "./courses";

export type ID = number;

export interface Field {
  name: string;
}

export interface CardTemplate {
  name: string;
  qfmt: string; // front template
  afmt: string; // back template
}

export interface NoteType {
  id: ID;
  name: string;
  kind: "standard" | "cloze";
  fields: Field[];
  templates: CardTemplate[];
  css: string;
  sortField: number; // index of field shown in browser
  mod: number;
}

export interface Note {
  id: ID;
  guid: string;
  ntid: ID;
  fields: string[];
  tags: string[];
  mod: number;
}

/** Card type: what kind of card it is, regardless of where it sits. */
export enum CardType {
  New = 0,
  Learn = 1,
  Review = 2,
  Relearn = 3,
}

/** Queue: where the card currently sits for scheduling. */
export enum Queue {
  UserBuried = -3,
  SchedBuried = -2,
  Suspended = -1,
  New = 0,
  Learn = 1, // intraday learning, due = epoch ms
  Review = 2, // due = day number
  DayLearn = 3, // interday learning, due = day number
  Preview = 4, // filtered-deck preview, due = epoch ms
}

export interface Card {
  id: ID;
  nid: ID;
  did: ID;
  odid: ID; // original deck when in filtered deck (0 = none)
  ord: number; // template index (or cloze number - 1)
  mod: number;
  type: CardType;
  queue: Queue;
  /** New: position. Learn/Preview: epoch ms. Review/DayLearn: day number. */
  due: number;
  odue: number; // original due when in filtered deck
  ivl: number; // days
  factor: number; // ease in permille, e.g. 2500
  reps: number;
  lapses: number;
  step: number; // current learning/relearning step index
  flags: number; // 0-7
  // FSRS memory state (absent until the card is first answered with FSRS on)
  stability?: number; // days until recall probability drops to 90%
  difficulty?: number; // 1 (easy) – 10 (hard)
  lastReview?: number; // epoch ms
}

export interface RevlogEntry {
  id: number; // epoch ms of review
  cid: ID;
  ease: 1 | 2 | 3 | 4 | 0; // 0 = manual
  ivl: number; // positive days, negative seconds
  lastIvl: number;
  factor: number;
  time: number; // ms taken
  type: 0 | 1 | 2 | 3 | 4; // learn, review, relearn, filtered, manual
}

export interface DeckToday {
  day: number;
  newDone: number;
  revDone: number;
  newExtra: number; // custom study: extra new today
  revExtra: number;
}

export interface FilterTerm {
  search: string;
  limit: number;
  order: FilterOrder;
}

export type FilterOrder =
  | "oldestSeen"
  | "random"
  | "ivlAsc"
  | "ivlDesc"
  | "mostLapses"
  | "added"
  | "due"
  | "latestAdded"
  | "relativeOverdue";

export interface Deck {
  id: ID;
  name: string; // "Parent::Child"
  description: string;
  confId: ID;
  collapsed: boolean;
  today: DeckToday;
  mod: number;
  dyn: boolean;
  // filtered deck settings
  terms?: FilterTerm[];
  resched?: boolean;
  previewAgainSecs?: number;
  previewHardSecs?: number;
  previewGoodSecs?: number;
}

export type NewMix = "mix" | "after" | "before";

export interface DeckConfig {
  id: ID;
  name: string;
  mod: number;
  new: {
    perDay: number;
    steps: number[]; // minutes
    graduatingIvl: number;
    easyIvl: number;
    initialFactor: number; // permille
    order: "added" | "random";
    bury: boolean;
  };
  rev: {
    perDay: number;
    easyBonus: number;
    hardFactor: number;
    ivlModifier: number;
    maxIvl: number;
    bury: boolean;
  };
  lapse: {
    steps: number[]; // minutes
    mult: number; // new interval multiplier
    minIvl: number;
    leechThreshold: number;
    leechAction: "suspend" | "tag";
  };
  newMix: NewMix;
  fsrs: { enabled: boolean; desiredRetention: number };
  maxAnswerSecs: number;
  showTimer: boolean;
  autoplay: boolean; // speak TTS automatically
}

export interface Prefs {
  rolloverHour: number;
  learnAheadMins: number;
  showIntervalsOnButtons: boolean;
  showRemaining: boolean;
  currentDeck: ID;
  lastUnburied: number; // day number
  lastNoteType: ID;
  lastAddDeck: ID;
  targetLang: string; // BCP-47 language used by {{tts auto:Field}}
  haptics: boolean;
}

export interface Collection {
  version: number;
  crt: number;
  mod: number;
  prefs: Prefs;
  decks: Record<ID, Deck>;
  dconf: Record<ID, DeckConfig>;
  notetypes: Record<ID, NoteType>;
  notes: Record<ID, Note>;
  cards: Record<ID, Card>;
  revlog: RevlogEntry[];
  nextPos: number;
  savedSearches: Record<string, string>;
  courses: Record<string, Course>;
  courseProgress: CourseProgress;
}

export type Ease = 1 | 2 | 3 | 4;
