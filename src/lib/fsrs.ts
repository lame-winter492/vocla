// FSRS-6 memory model, ported from the reference implementation (open-spaced-repetition/py-fsrs).
// It tracks, per card, stability S (days until recall probability falls to 90%) and difficulty D (1–10),
// and schedules the next review when predicted recall drops to the desired retention.
import type { Ease } from "./types";

export const FSRS_DEFAULT_PARAMS = [
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483,
  0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
];

const S_MIN = 0.001;
const clampD = (d: number) => Math.min(10, Math.max(1, d));

export interface Memory {
  stability: number;
  difficulty: number;
}

export class FSRS {
  private decay: number;
  private factor: number;
  constructor(private w: number[] = FSRS_DEFAULT_PARAMS) {
    this.decay = -w[20];
    this.factor = 0.9 ** (1 / this.decay) - 1;
  }

  /** Probability of recall after `elapsedDays` for a memory of stability `s`. */
  retrievability(elapsedDays: number, s: number): number {
    if (s <= 0) return 0;
    return (1 + (this.factor * Math.max(0, elapsedDays)) / s) ** this.decay;
  }

  initialStability(r: Ease): number {
    return Math.max(this.w[r - 1], S_MIN);
  }

  initialDifficulty(r: Ease, clamp = true): number {
    const d = this.w[4] - Math.exp(this.w[5] * (r - 1)) + 1;
    return clamp ? clampD(d) : d;
  }

  nextDifficulty(d: number, r: Ease): number {
    const target = this.initialDifficulty(4, false);
    const delta = -(this.w[6] * (r - 3));
    const damped = d + ((10 - d) * delta) / 9;
    return clampD(this.w[7] * target + (1 - this.w[7]) * damped);
  }

  shortTermStability(s: number, r: Ease): number {
    let inc = Math.exp(this.w[17] * (r - 3 + this.w[18])) * s ** -this.w[19];
    if (r >= 2) inc = Math.max(inc, 1);
    return Math.max(s * inc, S_MIN);
  }

  recallStability(d: number, s: number, R: number, r: Ease): number {
    const hard = r === 2 ? this.w[15] : 1;
    const easy = r === 4 ? this.w[16] : 1;
    return Math.max(
      s * (1 + Math.exp(this.w[8]) * (11 - d) * s ** -this.w[9] * (Math.exp((1 - R) * this.w[10]) - 1) * hard * easy),
      S_MIN,
    );
  }

  forgetStability(d: number, s: number, R: number): number {
    const long = this.w[11] * d ** -this.w[12] * ((s + 1) ** this.w[13] - 1) * Math.exp((1 - R) * this.w[14]);
    const short = s / Math.exp(this.w[17] * this.w[18]);
    return Math.max(Math.min(long, short), S_MIN);
  }

  /** New memory state after answering `r`, given the old state (null = never reviewed) and days since last review. */
  next(mem: Memory | null, r: Ease, elapsedDays: number): Memory {
    if (!mem) return { stability: this.initialStability(r), difficulty: this.initialDifficulty(r) };
    let s: number;
    if (elapsedDays < 1) s = this.shortTermStability(mem.stability, r);
    else {
      const R = this.retrievability(elapsedDays, mem.stability);
      s = r === 1 ? this.forgetStability(mem.difficulty, mem.stability, R) : this.recallStability(mem.difficulty, mem.stability, R, r);
    }
    return { stability: s, difficulty: this.nextDifficulty(mem.difficulty, r) };
  }

  /** Days until predicted recall falls to `retention` (unfuzzed, unrounded). */
  interval(s: number, retention: number): number {
    return (s / this.factor) * (retention ** (1 / this.decay) - 1);
  }
}

export const fsrs = new FSRS();

/** Rough memory state for a card that was scheduled by SM-2 before FSRS was turned on. */
export function memoryFromSm2(ivl: number, factor: number): Memory {
  const ease = (factor || 2500) / 1000;
  return { stability: Math.max(ivl, 0.5), difficulty: clampD(10 - ((ease - 1.3) * 5) / 1.2) };
}
