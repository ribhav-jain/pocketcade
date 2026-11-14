// On the Dot rules: pure and clock-driven. Every time is in ms on the one clock the caller passes in:
// performance.now() in play, the attract step clock in attract. Pip's angle is an analytic function of time,
// re-based on start, hit and resume; never accumulated per frame.
import type { Rng } from '@pocketcade/toolkit';

/** presses this soon after a hit are ignored, so a double tap cannot end the run */
export const LOCKOUT_MS = 120;
/** how long a miss is shown before the game-over card */
export const FREEZE_MS = 600;
/** a tap delivered this late after the window closed still gets judged before the star counts as passed */
export const PASS_GRACE_MS = 50;
export const COUNTDOWN_MS = 1200;
/** a new star is never closer than this in time; after a reversal the player gets longer to re-read the ring */
export const MIN_LEAD_MS = 600;
export const REVERSE_LEAD_MS = 800;
/** hits per zone; the scenery changes with every zone */
export const ZONE_HITS = 10;
const MAX_LEAD = 320;
/** a drifting star never starts further ahead than this, so it cannot appear right behind Pip */
const MAX_GAP = 300;
const MAX_DT = 300;

/** Lap period after `n` hits. */
export const lapMs = (n: number) => Math.max(1250, Math.round(2400 * 0.975 ** n));
/** Hit half-window after `n` hits. */
export const windowMs = (n: number) => Math.max(55, Math.round(110 * 0.97 ** n));
/** Perfect half-window; `g` is the measured clock granularity, which the window never goes below. */
export function perfectMs(n: number, g = 0): number {
  const w = windowMs(n);
  return Math.min(w, Math.max(18, Math.ceil(g), Math.round(0.34 * w)));
}
export const zoneOf = (n: number) => Math.floor(n / ZONE_HITS);
/** Chance that Pip reverses after hit number `n`. */
const reverseChance = (n: number) => (n < ZONE_HITS ? 0 : n < 3 * ZONE_HITS ? 0.25 : 0.4);
/** Chance that the star placed after hit number `n` drifts along the ring. */
const driftChance = (n: number) => (n < 2 * ZONE_HITS ? 0 : n < 4 * ZONE_HITS ? 0.3 : 0.45);

/** How far ahead of Pip (degrees) a new star may meet it: far enough in time to react, less than a full lap. */
export function leadRange(n: number, reversed = false): [number, number] {
  const ms = reversed ? REVERSE_LEAD_MS : MIN_LEAD_MS;
  return [Math.max(90, Math.ceil((360 * ms) / lapMs(n))), MAX_LEAD];
}

export type Judgement = 'perfect' | 'good' | 'early' | 'late';

export function judge(dt: number, n: number, g = 0): Judgement {
  const a = Math.abs(dt);
  if (a <= perfectMs(n, g)) return 'perfect';
  if (a <= windowMs(n)) return 'good';
  return dt < 0 ? 'early' : 'late';
}

/** Points for a hit: `chain` is the Perfect chain including this hit, 0 for a Good. */
export const points = (chain: number) => 1 + Math.min(chain, 4);

/** Clock granularity from 20 observed changes of `now()` (the smallest step seen). */
export function clockGranularity(now: () => number, samples = 20, maxSpins = 2_000_000): number {
  let last = now();
  let min = Infinity;
  for (let i = 0, seen = 0; i < maxSpins && seen < samples; i++) {
    const t = now();
    if (t === last) continue;
    min = Math.min(min, t - last);
    last = t;
    seen++;
  }
  return Number.isFinite(min) ? min : 100;
}

/** A run seed: 16 lowercase hex chars from two draws of the mount's main RNG. */
export const runSeed = (main: Rng) =>
  [main.nextUint32(), main.nextUint32()].map((x) => x.toString(16).padStart(8, '0')).join('');

const mod360 = (a: number) => ((a % 360) + 360) % 360;

export type MissEnd = 'early' | 'late' | 'passed';
export type RunEvent =
  | { type: 'start' }
  | {
      type: 'hit';
      judgement: 'perfect' | 'good';
      dt: number;
      points: number;
      chain: number;
      /** where Pip was when the tap landed */
      angle: number;
      reversed: boolean;
      /** this hit completed a zone */
      zoneUp: boolean;
    }
  | { type: 'miss'; end: MissEnd; dt: number };

export type RunPhase = 'ready' | 'running' | 'frozen' | 'missed';

export interface Run {
  readonly phase: RunPhase;
  /** hits so far */
  readonly n: number;
  readonly score: number;
  readonly chain: number;
  readonly longestChain: number;
  readonly perfects: number;
  readonly dir: 1 | -1;
  /** where Pip meets the star */
  readonly dotAngle: number;
  /** the star's speed along the ring as a fraction of Pip's, signed in Pip's direction; 0 for a still star */
  readonly drift: number;
  readonly end: MissEnd | null;
  readonly missAt: number;
  /** per-hit offsets in integer ms (first 300) */
  readonly dts: readonly number[];
  readonly meanOffsetMs: number;
  /** Pip's angle at `t` in [0, 360): 0° is 12 o'clock, clockwise positive */
  pipAt(t: number): number;
  /** the star's angle at `t` (it reaches `dotAngle` exactly at `arrival()`) */
  dotAt(t: number): number;
  /** next time Pip reaches the star */
  arrival(): number;
  /** Ready → running without judging (the first input; attract starts here directly) */
  start(t: number): RunEvent[];
  press(t: number): RunEvent[];
  /** declares a passed star once the window plus the late-delivery grace is over */
  tick(t: number): RunEvent[];
  /** pause: hold Pip and the star where they are; true when a running run was frozen */
  freeze(t: number): boolean;
  /** after the resume countdown: re-base; the star stops drifting, and one too close to react to moves 180° ahead */
  unfreeze(t: number): void;
}

/** `from` starts mid-run (attract) with `n` hits and `score`. */
export function createRun(
  rng: Rng,
  opts: { g?: number; from?: { n: number; score: number } } = {},
): Run {
  const dots = rng.fork('dots');
  const reverse = rng.fork('reverse');
  const drifts = rng.fork('drift');
  const g = opts.g ?? 0;
  let phase: RunPhase = 'ready';
  let n = opts.from?.n ?? 0;
  let score = opts.from?.score ?? 0;
  let chain = 0;
  let longestChain = 0;
  let perfects = 0;
  let dir: 1 | -1 = 1;
  let ts = 0;
  let thetaS = 0;
  let thetaD = opts.from ? dots.int(...leadRange(n)) : 180;
  let drift = 0;
  let lockUntil = -Infinity;
  let reversedLast = false;
  let frozenPip = 0;
  let frozenDot = thetaD;
  let end: MissEnd | null = null;
  let missAt = 0;
  let dtSum = 0;
  let hits = 0;
  const dts: number[] = [];

  const angle = (t: number) => thetaS + (dir * 360 * (t - ts)) / lapMs(n);
  const arrival = () => ts + (mod360((thetaD - thetaS) * dir) * lapMs(n)) / 360;
  const star = (t: number) => mod360(thetaD + (dir * drift * 360 * (t - arrival())) / lapMs(n));
  const hold = (t: number) => {
    frozenPip = mod360(angle(t));
    frozenDot = star(t);
  };
  const miss = (t: number, kind: MissEnd, dt: number): RunEvent[] => {
    hold(t);
    phase = 'missed';
    end = kind;
    missAt = t;
    return [{ type: 'miss', end: kind, dt: Math.round(dt) }];
  };
  /** Places the next star from Pip's new start angle. One new thing at a time: a reversal never also drifts. */
  const place = (reversed: boolean) => {
    const [lo, hi] = leadRange(n, reversed);
    let lead = dots.int(lo, hi);
    const p = driftChance(n);
    drift = 0;
    if (!reversed && p > 0 && drifts.chance(p)) {
      // running away from Pip, or (more gently, as the two close faster) coming toward it
      drift = drifts.chance(0.5) ? drifts.float(0.2, 0.4) : -drifts.float(0.15, 0.25);
      // a star coming toward Pip starts further away than the meeting point
      if (drift < 0) lead = Math.min(lead, Math.floor(MAX_GAP / (1 - drift)));
    }
    thetaD = mod360(thetaS + dir * lead);
  };

  return {
    get phase() {
      return phase;
    },
    get n() {
      return n;
    },
    get score() {
      return score;
    },
    get chain() {
      return chain;
    },
    get longestChain() {
      return longestChain;
    },
    get perfects() {
      return perfects;
    },
    get dir() {
      return dir;
    },
    get dotAngle() {
      return thetaD;
    },
    get drift() {
      return drift;
    },
    get end() {
      return end;
    },
    get missAt() {
      return missAt;
    },
    dts,
    get meanOffsetMs() {
      return hits ? Math.max(-1000, Math.min(1000, Math.round(dtSum / hits))) : 0;
    },
    pipAt(t) {
      if (phase === 'ready') return thetaS;
      if (phase === 'running') return mod360(angle(t));
      return frozenPip;
    },
    dotAt(t) {
      if (phase === 'ready') return thetaD;
      if (phase === 'running') return star(t);
      return frozenDot;
    },
    arrival,
    start(t) {
      if (phase !== 'ready') return [];
      phase = 'running';
      ts = t;
      return [{ type: 'start' }];
    },
    press(t) {
      if (phase === 'ready') return this.start(t);
      if (phase !== 'running' || t < lockUntil || t < ts) return [];
      const dt = t - arrival();
      const j = judge(dt, n, g);
      if (j === 'early' || j === 'late') return miss(t, j, dt);
      chain = j === 'perfect' ? chain + 1 : 0;
      longestChain = Math.max(longestChain, chain);
      if (j === 'perfect') perfects++;
      const pts = j === 'perfect' ? points(chain) : 1;
      score += pts;
      hits++;
      dtSum += dt;
      if (dts.length < MAX_DT) dts.push(Math.round(dt));
      thetaS = mod360(angle(t));
      ts = t;
      n++;
      const p = reverseChance(n);
      const reversed = !reversedLast && p > 0 && reverse.chance(p);
      if (reversed) dir = dir === 1 ? -1 : 1;
      reversedLast = reversed;
      place(reversed);
      lockUntil = t + LOCKOUT_MS;
      return [
        {
          type: 'hit',
          judgement: j,
          dt: Math.round(dt),
          points: pts,
          chain,
          angle: thetaS,
          reversed,
          zoneUp: n % ZONE_HITS === 0,
        },
      ];
    },
    tick(t) {
      if (phase !== 'running' || t <= arrival() + windowMs(n) + PASS_GRACE_MS) return [];
      return miss(t, 'passed', t - arrival());
    },
    freeze(t) {
      if (phase !== 'running') return false;
      hold(t);
      phase = 'frozen';
      return true;
    },
    unfreeze(t) {
      if (phase !== 'frozen') return;
      phase = 'running';
      ts = t;
      thetaS = frozenPip;
      thetaD = frozenDot;
      drift = 0;
      if (arrival() - t < MIN_LEAD_MS) thetaD = mod360(thetaS + dir * 180);
    },
  };
}
