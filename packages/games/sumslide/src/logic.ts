// Sumslide rules. Pure: no Phaser, DOM or host imports, so the whole game can be simulated in a unit test.
import type { Rng } from '@pocketcade/toolkit';
import type { RunSnapshot } from './save.ts';

export type Dir = 'up' | 'down' | 'left' | 'right';
export const SIZE = 4;
/** Cell code of the Echo wildcard. Number tiles are 1..MAX_LEVEL, an empty cell is 0. */
export const ECHO = -1;
/** Moves it takes to charge the next Echo. The charge pauses while an Echo is on the tray. */
export const ECHO_CHARGE_MAX = 40;
export const MAX_LEVEL = 30;
/** The first goal tile is 80; every goal after it is the next doubling. */
const FIRST_GOAL_LEVEL = 5;
export const GOAL_COUNT = MAX_LEVEL - FIRST_GOAL_LEVEL + 1;
export const DIRS: readonly Dir[] = ['up', 'down', 'left', 'right'];

/** 5 × 2^(level − 1): 5, 10, 20, 40 … */
export function valueOf(level: number): number {
  return 5 * 2 ** (level - 1);
}

/** Tile label: '5' … '5120', then compact '10.2k', '41k', '164k'. */
export function labelOf(level: number): string {
  const v = valueOf(level);
  if (v < 10_000) return String(v);
  if (v < 100_000) return `${(Math.round(v / 100) / 10).toFixed(1).replace(/\.0$/, '')}k`;
  return `${Math.round(v / 1000)}k`;
}

/** The goal tile's level after `rung` goals have been reached, or null when every goal is done. */
export function goalLevel(rung: number): number | null {
  return rung < GOAL_COUNT ? FIRST_GOAL_LEVEL + rung : null;
}

/**
 * How close the tray is to the next goal, 0..1. Merging never changes the sum of the tiles, so the sum is the
 * material available for the goal tile; it is measured from the previous goal's value so each goal starts low.
 */
export function goalProgress(cells: readonly number[], rung: number): number {
  const level = goalLevel(rung);
  if (level === null) return 1;
  const target = valueOf(level);
  const base = rung === 0 ? 0 : target / 2;
  const total = cells.reduce((sum, c) => sum + (c > 0 ? valueOf(c) : 0), 0);
  return Math.min(1, Math.max(0, (total - base) / (target - base)));
}

/**
 * Undos left after taking back a move. The undo itself costs one, and an undo earned by the move being taken
 * back (it reached a goal) goes with it, so undoing and replaying a goal cannot farm undos.
 */
export function undosAfterUndo(left: number, rungNow: number, rungBefore: number): number {
  return Math.max(0, left - 1 - (rungNow - rungBefore));
}

/** Chance that a new tile is a 10 instead of a 5; it rises as the run's biggest tile grows. */
export function p10(maxLevel: number): number {
  if (maxLevel <= 6) return 0.1;
  if (maxLevel <= 8) return 0.15;
  return 0.2;
}

/** Cell indices of each line, ordered from the leading edge of the slide. */
function lines(dir: Dir): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < SIZE; i++) {
    const line: number[] = [];
    for (let j = 0; j < SIZE; j++) {
      if (dir === 'left') line.push(i * SIZE + j);
      else if (dir === 'right') line.push(i * SIZE + (SIZE - 1 - j));
      else if (dir === 'up') line.push(j * SIZE + i);
      else line.push((SIZE - 1 - j) * SIZE + i);
    }
    out.push(line);
  }
  return out;
}

function mergeable(a: number, b: number): boolean {
  return (a > 0 && a === b) || (a === ECHO && b > 0) || (b === ECHO && a > 0);
}

function merged(a: number, b: number): number {
  return (a === ECHO ? b : a) + 1;
}

interface Track {
  from: number;
  to: number;
  merged: boolean;
}
export interface Merge {
  at: number;
  level: number;
  echo: boolean;
}

export function slide(
  cells: readonly number[],
  dir: Dir,
): { cells: number[]; moved: boolean; tracks: readonly Track[]; merges: readonly Merge[] } {
  const next = new Array<number>(SIZE * SIZE).fill(0);
  const tracks: Track[] = [];
  const merges: Merge[] = [];
  for (const line of lines(dir)) {
    const tiles = line.map((idx) => ({ idx, code: cells[idx]! })).filter((t) => t.code !== 0);
    let p = 0;
    for (let i = 0; i < tiles.length; i++) {
      const a = tiles[i]!;
      const b = tiles[i + 1];
      const to = line[p]!;
      if (b && mergeable(a.code, b.code)) {
        const level = merged(a.code, b.code);
        next[to] = level;
        merges.push({ at: to, level, echo: a.code === ECHO || b.code === ECHO });
        if (a.idx !== to) tracks.push({ from: a.idx, to, merged: true });
        tracks.push({ from: b.idx, to, merged: true });
        i++;
      } else {
        next[to] = a.code;
        if (a.idx !== to) tracks.push({ from: a.idx, to, merged: false });
      }
      p++;
    }
  }
  const moved = next.some((c, i) => c !== cells[i]);
  return { cells: next, moved, tracks, merges };
}

/** False when the tray is full, no neighbours are equal and there is no Echo: the game is over. */
export function canMove(cells: readonly number[]): boolean {
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]!;
    if (c === 0 || c === ECHO) return true;
    const right = i % SIZE < SIZE - 1 ? cells[i + 1] : undefined;
    const down = i + SIZE < cells.length ? cells[i + SIZE] : undefined;
    if (c === right || c === down) return true;
  }
  return false;
}

/** Picks an empty cell, then the new tile: the Echo when it is fully charged, otherwise a 5 or a 10. */
export function spawnTile(
  cells: number[],
  charge: number,
  maxLevel: number,
  rng: Rng,
): { at: number; code: number; charge: number } {
  const empties: number[] = [];
  cells.forEach((c, i) => c === 0 && empties.push(i));
  const at = empties[rng.int(0, empties.length - 1)]!;
  if (charge === ECHO_CHARGE_MAX && !cells.includes(ECHO)) return { at, code: ECHO, charge: 0 };
  return { at, code: rng.chance(p10(maxLevel)) ? 2 : 1, charge };
}

/** A new run starts with two tiles. */
export function newRun(rng: Rng): RunSnapshot {
  const cells = new Array<number>(SIZE * SIZE).fill(0);
  let maxLevel = 1;
  for (let i = 0; i < 2; i++) {
    const s = spawnTile(cells, 0, maxLevel, rng);
    cells[s.at] = s.code;
    maxLevel = Math.max(maxLevel, s.code);
  }
  return {
    cells,
    score: 0,
    moves: 0,
    maxLevel,
    echoCharge: 0,
    echoes: 0,
    rung: 0,
    rng: rng.state(),
  };
}

export interface MoveOutcome {
  next: RunSnapshot;
  moved: boolean;
  tracks: readonly Track[];
  merges: readonly Merge[];
  spawn: { at: number; code: number } | null;
  /** merge points plus goal bonuses */
  gained: number;
  /** levels of the goal tiles first reached by this move */
  goals: readonly number[];
  over: boolean;
}

/**
 * One move: slide and merge, score each merge at the new tile's value, pay each newly reached goal its value
 * again as a bonus, charge the Echo, then spawn one tile. A move that shifts nothing changes nothing.
 */
export function applyMove(state: RunSnapshot, dir: Dir, rng: Rng): MoveOutcome {
  const s = slide(state.cells, dir);
  if (!s.moved) {
    return {
      next: state,
      moved: false,
      tracks: [],
      merges: [],
      spawn: null,
      gained: 0,
      goals: [],
      over: !canMove(state.cells),
    };
  }
  const cells = s.cells;
  let gained = 0;
  let maxLevel = state.maxLevel;
  let echoes = state.echoes;
  for (const m of s.merges) {
    gained += valueOf(m.level);
    maxLevel = Math.max(maxLevel, m.level);
    if (m.echo) echoes++;
  }
  const goals: number[] = [];
  let rung = state.rung;
  for (let goal = goalLevel(rung); goal !== null && goal <= maxLevel; goal = goalLevel(rung)) {
    gained += valueOf(goal);
    goals.push(goal);
    rung++;
  }
  let charge = state.echoCharge;
  if (!cells.includes(ECHO)) charge = Math.min(ECHO_CHARGE_MAX, charge + 1);
  const sp = spawnTile(cells, charge, maxLevel, rng);
  cells[sp.at] = sp.code;
  charge = sp.charge;
  maxLevel = Math.max(maxLevel, sp.code);
  const next: RunSnapshot = {
    cells,
    score: state.score + gained,
    moves: state.moves + 1,
    maxLevel,
    echoCharge: charge,
    echoes,
    rung,
    rng: rng.state(),
  };
  return {
    next,
    moved: true,
    tracks: s.tracks,
    merges: s.merges,
    spawn: { at: sp.at, code: sp.code },
    gained,
    goals,
    over: !canMove(cells),
  };
}

/** The demo player: one move ahead, preferring merge points, empty cells and the biggest tile in a corner. */
export function attractPolicy(cells: readonly number[]): Dir {
  let best: Dir = 'left';
  let bestScore = -Infinity;
  for (const dir of ['left', 'down', 'right', 'up'] as const) {
    const s = slide(cells, dir);
    if (!s.moved) continue;
    const empties = s.cells.filter((c) => c === 0).length;
    const top = Math.max(...s.cells);
    const corner = s.cells[(SIZE - 1) * SIZE] === top && top > 0 ? 40 : 0;
    const mergePoints = s.merges.reduce((sum, m) => sum + valueOf(m.level), 0);
    const score = mergePoints + 8 * empties + corner;
    if (score > bestScore) {
      bestScore = score;
      best = dir;
    }
  }
  return best;
}
