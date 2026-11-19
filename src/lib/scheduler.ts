// SM-2 scheduler modelled on Anki's v3 scheduler.
import { CardType, Queue, type Card, type Deck, type DeckConfig, type Ease } from "./types";

export interface SchedCtx {
  now: number; // epoch ms
  today: number; // day number
  conf: DeckConfig;
  /** Set when the card is in a filtered deck. */
  filtered?: Deck;
}

export interface AnswerResult {
  card: Card;
  /** revlog interval: positive days or negative seconds */
  logIvl: number;
  logType: 0 | 1 | 2 | 3;
  leech: boolean;
  /** card should leave the filtered deck and go back to its home deck */
  returnHome: boolean;
  /** preview "Easy"/finished: restore original scheduling untouched */
  restoreOriginal: boolean;
}

// ---------- fuzz ----------

function hashUnit(seed: number): number {
  // deterministic pseudo-random in [0,1)
  let x = Math.floor(seed) % 2147483647;
  if (x <= 0) x += 2147483646;
  for (let i = 0; i < 3; i++) x = (x * 48271) % 2147483647;
  return (x - 1) / 2147483646;
}

const FUZZ_RANGES = [
  { start: 2.5, end: 7.0, factor: 0.15 },
  { start: 7.0, end: 20.0, factor: 0.1 },
  { start: 20.0, end: Infinity, factor: 0.05 },
];

export function fuzzBounds(ivl: number, min: number, max: number): [number, number] {
  if (ivl < 2.5) {
    const v = Math.min(Math.max(Math.round(ivl), min), max);
    return [v, v];
  }
  let delta = 1.0;
  for (const r of FUZZ_RANGES) delta += r.factor * Math.max(Math.min(ivl, r.end) - r.start, 0);
  let lower = Math.round(ivl - delta);
  let upper = Math.round(ivl + delta);
  lower = Math.min(Math.max(lower, min), max);
  upper = Math.min(Math.max(upper, min), max);
  if (upper === lower && upper > 2 && upper < max) upper = lower + 1;
  return [lower, upper];
}

function fuzzed(ivl: number, min: number, max: number, seed: number): number {
  const [lo, hi] = fuzzBounds(ivl, min, max);
  return Math.floor(lo + hashUnit(seed) * (1 + hi - lo));
}

// ---------- helpers ----------

function hardDelayMins(steps: number[], idx: number): number {
  if (idx === 0) {
    if (steps.length > 1) return (steps[0] + steps[1]) / 2;
    return Math.min(steps[0] * 1.5, steps[0] + 1440);
  }
  return steps[Math.min(idx, steps.length - 1)];
}

function scheduleLearning(card: Card, delaySecs: number, ctx: SchedCtx): void {
  if (delaySecs >= 86400) {
    card.queue = Queue.DayLearn;
    card.due = ctx.today + Math.round(delaySecs / 86400);
  } else {
    card.queue = Queue.Learn;
    // small fuzz like Anki: up to 25% of delay, capped at 5 minutes
    const fuzz = Math.floor(hashUnit(card.id + card.reps) * Math.min(delaySecs * 0.25, 300));
    card.due = ctx.now + (delaySecs + fuzz) * 1000;
  }
}

function graduate(card: Card, ivl: number, ctx: SchedCtx): void {
  const max = ctx.conf.rev.maxIvl;
  card.type = CardType.Review;
  card.queue = Queue.Review;
  card.ivl = fuzzed(ivl, 1, max, card.id + card.reps);
  card.due = ctx.today + card.ivl;
  card.step = 0;
}

function constrain(ivl: number, minimum: number, ctx: SchedCtx, seed: number): number {
  const max = ctx.conf.rev.maxIvl;
  const min = Math.min(Math.max(minimum, 1), max);
  return fuzzed(ivl * ctx.conf.rev.ivlModifier, min, max, seed);
}

/** Intervals in days for hard/good/easy on a review card (after fuzz). */
export function reviewIntervals(card: Card, ctx: SchedCtx): { hard: number; good: number; easy: number } {
  const { rev } = ctx.conf;
  const ease = card.factor / 1000;
  const scheduled = card.ivl;
  const daysLate = ctx.today - card.due;
  const seed = card.id + card.reps;
  if (daysLate < 0 && ctx.filtered) {
    // early review in a filtered deck
    const elapsed = Math.max(scheduled + daysLate, 0);
    const hardRaw = Math.max(elapsed * rev.hardFactor, scheduled * (rev.hardFactor / 2));
    const goodRaw = Math.max(elapsed * ease, scheduled);
    const easyRaw = Math.max(elapsed * ease, scheduled) * (rev.easyBonus - (rev.easyBonus - 1) / 2);
    const hard = constrain(hardRaw, 0, ctx, seed);
    const good = constrain(goodRaw, hard + 1, ctx, seed);
    const easy = constrain(easyRaw, good + 1, ctx, seed);
    return { hard, good, easy };
  }
  const late = Math.max(daysLate, 0);
  const hardMin = rev.hardFactor <= 1 ? 0 : scheduled + 1;
  const hard = constrain(scheduled * rev.hardFactor, hardMin, ctx, seed);
  const goodMin = rev.hardFactor <= 1 ? scheduled + 1 : hard + 1;
  const good = constrain((scheduled + late / 2) * ease, goodMin, ctx, seed);
  const easy = constrain((scheduled + late) * ease * rev.easyBonus, good + 1, ctx, seed);
  return { hard, good, easy };
}

function lapseIvl(card: Card, ctx: SchedCtx): number {
  const { lapse, rev } = ctx.conf;
  return Math.min(Math.max(Math.round(card.ivl * lapse.mult), lapse.minIvl, 1), rev.maxIvl);
}

function isLeech(lapses: number, threshold: number): boolean {
  if (threshold <= 0 || lapses < threshold) return false;
  return (lapses - threshold) % Math.max(1, Math.ceil(threshold / 2)) === 0;
}

// ---------- answer ----------

export function answerCard(orig: Card, ease: Ease, ctx: SchedCtx): AnswerResult {
  const card: Card = { ...orig };
  const res: AnswerResult = { card, logIvl: 0, logType: 0, leech: false, returnHome: false, restoreOriginal: false };
  const f = ctx.filtered;

  // preview mode in filtered decks with rescheduling disabled
  if (f && !f.resched) {
    res.logType = 3;
    const secs = ease === 1 ? f.previewAgainSecs ?? 60 : ease === 2 ? f.previewHardSecs ?? 600 : ease === 3 ? f.previewGoodSecs ?? 0 : 0;
    if (ease === 4 || secs <= 0) {
      res.returnHome = true;
      res.restoreOriginal = true;
    } else {
      card.queue = Queue.Preview;
      card.due = ctx.now + secs * 1000;
      res.logIvl = -secs;
    }
    return res;
  }

  card.reps += 1;
  const { conf } = ctx;

  if (card.type === CardType.New) {
    card.type = CardType.Learn;
    card.step = 0;
    card.factor = conf.new.initialFactor;
    // fall through to learning
  }

  if (card.type === CardType.Learn) {
    res.logType = 0;
    const steps = conf.new.steps;
    const grad = () => {
      graduate(card, ease === 4 ? conf.new.easyIvl : conf.new.graduatingIvl, ctx);
      res.logIvl = card.ivl;
    };
    if (ease === 4 || steps.length === 0) grad();
    else if (ease === 1) {
      card.step = 0;
      scheduleLearning(card, steps[0] * 60, ctx);
      res.logIvl = -steps[0] * 60;
    } else if (ease === 2) {
      const mins = hardDelayMins(steps, card.step);
      scheduleLearning(card, mins * 60, ctx);
      res.logIvl = -Math.round(mins * 60);
    } else {
      const next = card.step + 1;
      if (next >= steps.length) grad();
      else {
        card.step = next;
        scheduleLearning(card, steps[next] * 60, ctx);
        res.logIvl = -steps[next] * 60;
      }
    }
  } else if (card.type === CardType.Relearn) {
    res.logType = 2;
    const steps = conf.lapse.steps;
    const back = (ivl: number) => {
      card.type = CardType.Review;
      card.queue = Queue.Review;
      card.ivl = Math.min(Math.max(ivl, 1), conf.rev.maxIvl);
      card.due = ctx.today + card.ivl;
      card.step = 0;
      res.logIvl = card.ivl;
    };
    if (ease === 4) back(card.ivl + 1);
    else if (steps.length === 0) back(card.ivl);
    else if (ease === 1) {
      card.step = 0;
      scheduleLearning(card, steps[0] * 60, ctx);
      res.logIvl = -steps[0] * 60;
    } else if (ease === 2) {
      const mins = hardDelayMins(steps, card.step);
      scheduleLearning(card, mins * 60, ctx);
      res.logIvl = -Math.round(mins * 60);
    } else {
      const next = card.step + 1;
      if (next >= steps.length) back(card.ivl);
      else {
        card.step = next;
        scheduleLearning(card, steps[next] * 60, ctx);
        res.logIvl = -steps[next] * 60;
      }
    }
  } else {
    // review
    res.logType = f ? 3 : 1;
    if (ease === 1) {
      card.lapses += 1;
      card.factor = Math.max(1300, card.factor - 200);
      card.ivl = lapseIvl(card, ctx);
      res.leech = isLeech(card.lapses, conf.lapse.leechThreshold);
      if (conf.lapse.steps.length > 0) {
        card.type = CardType.Relearn;
        card.step = 0;
        scheduleLearning(card, conf.lapse.steps[0] * 60, ctx);
        res.logIvl = -conf.lapse.steps[0] * 60;
      } else {
        card.queue = Queue.Review;
        card.due = ctx.today + card.ivl;
        res.logIvl = card.ivl;
      }
    } else {
      const ivls = reviewIntervals(orig, ctx);
      const ivl = ease === 2 ? ivls.hard : ease === 3 ? ivls.good : ivls.easy;
      if (ease === 2) card.factor = Math.max(1300, card.factor - 150);
      if (ease === 4) card.factor += 150;
      card.ivl = ivl;
      card.due = ctx.today + ivl;
      card.queue = Queue.Review;
      res.logIvl = ivl;
    }
  }

  // cards answered in a filtered deck go home once out of (re)learning
  if (f && card.queue !== Queue.Learn && card.queue !== Queue.DayLearn) res.returnHome = true;
  return res;
}

/** Seconds until next review for each button (for showing on answer buttons). */
export function nextIntervalSecs(card: Card, ctx: SchedCtx): Record<Ease, number> {
  const out = {} as Record<Ease, number>;
  for (const e of [1, 2, 3, 4] as Ease[]) {
    const r = answerCard(card, e, ctx);
    if (r.restoreOriginal) out[e] = 0;
    else if (r.card.queue === Queue.Learn || r.card.queue === Queue.Preview) out[e] = Math.max(0, Math.round((r.card.due - ctx.now) / 1000));
    else out[e] = Math.max(0, r.card.due - ctx.today) * 86400;
  }
  return out;
}
