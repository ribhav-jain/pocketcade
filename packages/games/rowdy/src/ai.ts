// Rowdy's AI: pure TypeScript with an injected clock. Easy looks one move ahead and picks by weight, Medium is a
// shallow alpha-beta search that sometimes plays its second-best move, Hard an iterative-deepening alpha-beta with
// a transposition table. Hard is time-sliced: each step() searches for at most `maxMs`; a depth cut short is
// resumed next step and the table makes the re-search cheap, so no slice blocks a frame.
import { createRng, type Rng } from '@pocketcade/toolkit';
import {
  BOT,
  canPlay,
  COLS,
  drop,
  LINES,
  lift,
  lineThrough,
  ROWS,
  winsAt,
  YOU,
  type Board,
} from './rules.ts';

export type Level = 'easy' | 'medium' | 'hard';
export type Sharpness = 0 | 1 | 2 | 3 | 4;

/**
 * How each level sharpens with the win streak (index = sharpness). Easy blocks your three more often and leans
 * to the centre; Medium searches deeper and slips less; Hard searches deeper but never the whole game, so a
 * long-range plan can still beat it.
 */
export const RAMP = {
  pBlock: [0.6, 0.7, 0.8, 0.9, 1],
  centreWeight: [1, 1.25, 1.5, 1.75, 2],
  mediumDepth: [2, 2, 3, 3, 4],
  blunder: [0.3, 0.25, 0.2, 0.12, 0.05],
  hardDepthCap: [6, 7, 8, 10, 12],
} as const;
const HARD_COMPUTE_MS = 150;
/** centre-out move order */
export const ORDER = [3, 2, 4, 1, 5, 0, 6] as const;
const WIN = 1000;
const INF = 30000;

/** Heuristic for `me` (1 or 2): open lines of 2 and 3, plus the centre column. */
function evaluate(b: Board, me: number): number {
  let score = 0;
  for (const line of LINES) {
    let mine = 0;
    let theirs = 0;
    for (const [c, r] of line) {
      const v = b.cells[c * ROWS + r]!;
      if (v === me) mine++;
      else if (v !== 0) theirs++;
    }
    if (mine && theirs) continue;
    if (mine === 2) score += 2;
    else if (mine === 3) score += 5;
    else if (theirs === 2) score -= 2;
    else if (theirs === 3) score -= 6;
  }
  for (let r = 0; r < ROWS; r++) {
    const v = b.cells[3 * ROWS + r]!;
    if (v === me) score += 3;
    else if (v !== 0) score -= 3;
  }
  return score;
}

/** Transposition table: 2^19 entries, check word + packed value. */
export interface Table {
  keys: Uint32Array;
  vals: Uint32Array;
  zLo: Uint32Array;
  zHi: Uint32Array;
}
const TT_BITS = 19;
export function createTable(): Table {
  const z = createRng('rowdy:zobrist');
  const zLo = new Uint32Array(COLS * ROWS * 2);
  const zHi = new Uint32Array(COLS * ROWS * 2);
  for (let i = 0; i < zLo.length; i++) {
    zLo[i] = z.nextUint32();
    zHi[i] = z.nextUint32();
  }
  return { keys: new Uint32Array(1 << TT_BITS), vals: new Uint32Array(1 << TT_BITS), zLo, zHi };
}
const EXACT = 0;
const LOWER = 1;
const UPPER = 2;

interface Searcher {
  nodes: number;
  aborted: boolean;
  /** best move and score at the root for `depth` plies (null if aborted) */
  root(depth: number, first: number): { move: number; score: number } | null;
  /** exact score of each legal root move at `depth` (full window) */
  rootScores(depth: number): Array<{ move: number; score: number }>;
}

/** Negamax with alpha-beta over a private copy of the board; `stop()` is polled every 256 nodes. */
function createSearcher(
  start: Board,
  me: number,
  stop: () => boolean,
  tt: Table | null,
  age: number,
): Searcher {
  const b: Board = {
    cells: start.cells.slice(),
    heights: start.heights.slice(),
    count: start.count,
  };
  let lo = 0;
  let hi = 0;
  const toggle = (cell: number, v: number) => {
    if (!tt) return;
    lo ^= tt.zLo[cell * 2 + v - 1]!;
    hi ^= tt.zHi[cell * 2 + v - 1]!;
  };
  for (let i = 0; i < b.cells.length; i++) if (b.cells[i]) toggle(i, b.cells[i]!);
  const s = { nodes: 0, aborted: false } as Searcher;
  const play = (c: number, v: number) => toggle(c * ROWS + drop(b, c, v), v);
  const unplay = (c: number, v: number) => {
    lift(b, c);
    toggle(c * ROWS + b.heights[c]!, v);
  };

  function negamax(depth: number, alpha: number, beta: number, v: number, ply: number): number {
    s.nodes++;
    if ((s.nodes & 255) === 0 && stop()) s.aborted = true;
    if (s.aborted) return 0;
    for (const c of ORDER) if (winsAt(b, c, v)) return WIN - ply;
    if (b.count === COLS * ROWS) return 0;
    if (depth === 0) return evaluate(b, v);
    const a0 = alpha;
    let ttMove = -1;
    const idx = lo & ((1 << TT_BITS) - 1);
    if (tt && tt.vals[idx] && tt.keys[idx] === hi) {
      const p = tt.vals[idx]!;
      const score = (p & 2047) - 1024;
      const d = (p >>> 11) & 63;
      const flag = (p >>> 17) & 3;
      ttMove = (p >>> 19) & 7;
      if (
        d >= depth &&
        (flag === EXACT || (flag === LOWER && score >= beta) || (flag === UPPER && score <= alpha))
      )
        return score;
    }
    let best = -INF;
    let bestMove = ORDER[0] as number;
    const w = v === YOU ? BOT : YOU;
    for (let i = -1; i < ORDER.length; i++) {
      const c = i < 0 ? ttMove : ORDER[i]!;
      if ((i >= 0 && c === ttMove) || c < 0 || !canPlay(b, c)) continue;
      play(c, v);
      const score = -negamax(depth - 1, -beta, -alpha, w, ply + 1);
      unplay(c, v);
      if (s.aborted) return 0;
      if (score > best) [best, bestMove] = [score, c];
      alpha = Math.max(alpha, score);
      if (alpha >= beta) break;
    }
    if (tt) {
      const p = tt.vals[idx]!;
      const oldDepth = (p >>> 11) & 63;
      const oldAge = (p >>> 22) & 255;
      if (!p || depth >= oldDepth || oldAge !== (age & 255)) {
        const flag = best <= a0 ? UPPER : best >= beta ? LOWER : EXACT;
        tt.keys[idx] = hi;
        tt.vals[idx] =
          (Math.max(-1023, Math.min(1023, best)) + 1024) |
          (Math.min(depth, 63) << 11) |
          (flag << 17) |
          (bestMove << 19) |
          ((age & 255) << 22);
      }
    }
    return best;
  }

  s.root = (depth, first) => {
    let best: { move: number; score: number } | null = null;
    let alpha = -INF;
    for (const c of [first, ...ORDER.filter((x) => x !== first)]) {
      if (!canPlay(b, c)) continue;
      play(c, me);
      const score = lineThrough(b, c, b.heights[c]! - 1)
        ? WIN
        : -negamax(depth - 1, -INF, -alpha, me === YOU ? BOT : YOU, 1);
      unplay(c, me);
      if (s.aborted) return null;
      if (!best || score > best.score) best = { move: c, score };
      alpha = Math.max(alpha, score);
    }
    return best;
  };
  s.rootScores = (depth) =>
    ORDER.filter((c) => canPlay(b, c)).map((c) => {
      play(c, me);
      const score = lineThrough(b, c, b.heights[c]! - 1)
        ? WIN
        : -negamax(depth - 1, -INF, INF, me === YOU ? BOT : YOU, 1);
      unplay(c, me);
      return { move: c, score };
    });
  return s;
}

const centrality = (c: number) => Math.abs(c - 3);

export function easyMove(b: Board, s: Sharpness, rng: Rng): number {
  for (const c of ORDER) if (winsAt(b, c, BOT)) return c;
  const block = ORDER.find((c) => winsAt(b, c, YOU));
  if (block !== undefined && rng.chance(RAMP.pBlock[s])) return block;
  const w = RAMP.centreWeight[s];
  return rng.weighted(
    ORDER.filter((c) => canPlay(b, c)).map((c) => [c, w ** (3 - centrality(c))] as const),
  );
}

export function mediumMove(b: Board, s: Sharpness, rng: Rng): number {
  const scored = createSearcher(b, BOT, () => false, null, 0).rootScores(RAMP.mediumDepth[s]);
  const top = Math.max(...scored.map((m) => m.score));
  const ties = scored.filter((m) => m.score === top);
  const near = Math.min(...ties.map((m) => centrality(m.move)));
  const central = ties.filter((m) => centrality(m.move) === near);
  const best = central.length > 1 && rng.chance(0.5) ? central[1]! : central[0]!;
  if (!rng.chance(RAMP.blunder[s])) return best.move;
  const rest = scored
    .filter((m) => m !== best)
    .sort((x, y) => y.score - x.score || centrality(x.move) - centrality(y.move));
  const second = rest[0];
  if (!second) return best.move;
  // A blunder never hands you an immediate win.
  drop(b, second.move, BOT);
  const givesWin = ORDER.some((c) => winsAt(b, c, YOU));
  lift(b, second.move);
  return givesWin ? best.move : second.move;
}

export interface Search {
  /** search for up to `maxMs`; the column once decided, else null */
  step(maxMs: number): number | null;
  /** answer now with the best move found so far */
  finish(): number;
  readonly depth: number;
  readonly nodes: number;
}

/** A search for Rowdy's move. Easy and Medium answer in the first step; Hard runs iterative deepening. */
export function createSearch(
  b: Board,
  job: { level: Level; sharpness: Sharpness; rng: Rng; age: number },
  opts: { now: () => number; nodeBudget?: number; table?: Table | null },
): Search {
  if (job.level !== 'hard') {
    const move =
      job.level === 'easy'
        ? easyMove(b, job.sharpness, job.rng)
        : mediumMove(b, job.sharpness, job.rng);
    const depth = job.level === 'easy' ? 1 : RAMP.mediumDepth[job.sharpness];
    return { step: () => move, finish: () => move, depth, nodes: 0 };
  }
  // Rowdy's first disc varies a little, so Hard rounds do not all open the same way.
  if (b.count <= 1) {
    const move = job.rng.pick([2, 3, 3, 4]);
    return { step: () => move, finish: () => move, depth: 0, nodes: 0 };
  }
  const cap = Math.min(RAMP.hardDepthCap[job.sharpness], COLS * ROWS - b.count);
  let completed = 0;
  let best: number = ORDER.find((c) => canPlay(b, c)) ?? 0;
  let computeMs = 0;
  let done = false;
  let sliceEnd = 0;
  let sliceStart = 0;
  const stop = () => {
    if (completed < 2) return false; // never answer before depth 2
    if (opts.nodeBudget !== undefined) return searcher.nodes >= opts.nodeBudget;
    const t = opts.now();
    return t >= sliceEnd || computeMs + (t - sliceStart) >= HARD_COMPUTE_MS;
  };
  const searcher = createSearcher(b, BOT, stop, opts.table ?? null, job.age);
  return {
    get depth() {
      return completed;
    },
    get nodes() {
      return searcher.nodes;
    },
    finish: () => best,
    step(maxMs) {
      if (done) return best;
      sliceStart = opts.now();
      sliceEnd = sliceStart + maxMs;
      while (!done) {
        searcher.aborted = false;
        const r = searcher.root(completed + 1, best);
        if (!r) break;
        [best, completed] = [r.move, completed + 1];
        if (Math.abs(r.score) >= WIN - 42 || completed >= cap) done = true;
      }
      computeMs += opts.now() - sliceStart;
      if (
        opts.nodeBudget !== undefined
          ? searcher.nodes >= opts.nodeBudget
          : computeMs >= HARD_COMPUTE_MS
      )
        done = true;
      return done ? best : null;
    },
  };
}
