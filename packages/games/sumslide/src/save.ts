// The saved run and its validator. Type aliases, not interfaces, so they satisfy Json.
import type { Json } from '@pocketcade/sdk';
import { isCount, isInt, isRecord, type RngState } from '@pocketcade/toolkit';
import { ECHO, ECHO_CHARGE_MAX, GOAL_COUNT, MAX_LEVEL, SIZE } from './logic.ts';

export type RunSnapshot = {
  /** 16 cell codes, row by row from the top-left: 0 empty, -1 the Echo (at most one), 1..30 a tile level */
  cells: number[];
  score: number;
  moves: number;
  /** the biggest level made this run; never below any level in cells */
  maxLevel: number;
  /** 0..40; stays 0 while an Echo is on the tray */
  echoCharge: number;
  /** Echo merges this run */
  echoes: number;
  /** goals reached this run */
  rung: number;
  /** run RNG state after the last spawn */
  rng: RngState;
};

export type RunSave = RunSnapshot & {
  phase: 'playing' | 'over';
  seed: string;
  /** `prev` is the state before the last move, or null when there is nothing to take back */
  undo: { left: number; prev: RunSnapshot | null };
};

function isSnapshot(v: unknown): v is RunSnapshot {
  if (!isRecord(v)) return false;
  const { cells, score, moves, maxLevel, echoCharge, echoes, rung, rng } = v;
  if (!Array.isArray(cells) || cells.length !== SIZE * SIZE) return false;
  if (!cells.every((c) => c === 0 || c === ECHO || isInt(c, 1, MAX_LEVEL))) return false;
  const echoCount = cells.filter((c) => c === ECHO).length;
  if (echoCount > 1 || !cells.some((c) => c !== 0)) return false;
  if (!isCount(score) || !isCount(moves) || !isCount(echoes) || !isInt(rung, 0, GOAL_COUNT))
    return false;
  if (!isInt(maxLevel, 1, MAX_LEVEL) || cells.some((c) => (c as number) > maxLevel)) return false;
  if (!isInt(echoCharge, 0, ECHO_CHARGE_MAX) || (echoCount === 1 && echoCharge !== 0)) return false;
  return Array.isArray(rng) && rng.length === 4 && rng.every((n) => isInt(n, 0, 0xffffffff));
}

export function isRun(data: Json): data is RunSave {
  if (!isSnapshot(data)) return false;
  const d = data as Record<string, unknown>;
  if (d.phase !== 'playing' && d.phase !== 'over') return false;
  if (typeof d.seed !== 'string' || d.seed.length < 1 || d.seed.length > 64) return false;
  const undo = d.undo;
  if (!isRecord(undo) || !isInt(undo.left, 0, 99)) return false;
  return undo.prev === null || isSnapshot(undo.prev);
}
