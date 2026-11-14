// Saves: `run` is a snapshot taken when a piece settles, `stats` holds lifetime counters.
import type { Json } from '@pocketcade/sdk';
import { isCount, isInt, isRecord } from '@pocketcade/toolkit';
import { PIECE_IDS, type PieceId } from './pieces.ts';
import { COLS, decodeBoard, enterPiece, HIDDEN_ROWS, MAX_LEVEL, ROWS } from './sim.ts';

/** Key 'run'; `null` = no run in progress. A type alias (not an interface) so it is assignable to Json. */
export type RunSaveV1 = {
  /** one char per cell, row-major from row 0; '.' empty, 'a'..'r' = PIECE_IDS index */
  board: string;
  current: PieceId;
  next: [PieceId, PieceId, PieceId];
  stash: PieceId | null;
  stashUsed: boolean;
  score: number;
  lines: number;
  streak: number;
  pieces: number;
  playMs: number;
  seed: string;
  rng: [number, number, number, number];
  /** the Tumbler: what is left of the current load, and how many loads were dealt */
  load: PieceId[];
  loads: number;
};

export type StatsSaveV1 = {
  runs: number;
  lines: number;
  fives: number;
  sweeps: number;
  bestLevel: number;
};
export const zeroStats = (): StatsSaveV1 => ({
  runs: 0,
  lines: 0,
  fives: 0,
  sweeps: 0,
  bestLevel: 1,
});

const isId = (v: unknown): v is PieceId =>
  typeof v === 'string' && (PIECE_IDS as readonly string[]).includes(v);
const BOARD = new RegExp(`^[.a-r]{${COLS * ROWS}}$`);

export function isRunOrNull(v: Json): v is RunSaveV1 | null {
  if (v === null) return true;
  if (!isRecord(v)) return false;
  const { board, next, rng, load } = v;
  if (
    typeof board !== 'string' ||
    !BOARD.test(board) ||
    board.slice(0, HIDDEN_ROWS * COLS) !== '.'.repeat(HIDDEN_ROWS * COLS)
  )
    return false;
  for (let y = 0; y < ROWS; y++)
    if (!board.slice(y * COLS, y * COLS + COLS).includes('.')) return false;
  if (
    !isId(v.current) ||
    !Array.isArray(next) ||
    next.length !== 3 ||
    !next.every(isId) ||
    !(v.stash === null || isId(v.stash))
  )
    return false;
  if (
    typeof v.stashUsed !== 'boolean' ||
    ![v.score, v.lines, v.streak, v.pieces, v.playMs, v.loads].every(isCount)
  )
    return false;
  if (typeof v.seed !== 'string' || !/^[0-9a-f]{16}$/.test(v.seed)) return false;
  if (!Array.isArray(rng) || rng.length !== 4 || !rng.every((n) => isInt(n, 0, 0xffffffff)))
    return false;
  if (!Array.isArray(load) || load.length > PIECE_IDS.length + 1 || !load.every(isId)) return false;
  return enterPiece(decodeBoard(board), v.current) !== null;
}

export function isStatsV1(v: Json): v is StatsSaveV1 {
  return (
    isRecord(v) &&
    [v.runs, v.lines, v.fives, v.sweeps].every(isCount) &&
    isInt(v.bestLevel, 1, MAX_LEVEL)
  );
}

const add = (a: number, b: number) => Math.min(Number.MAX_SAFE_INTEGER, a + b);
export const withRun = (
  s: StatsSaveV1,
  r: { lines: number; fives: number; sweeps: number; level: number },
): StatsSaveV1 => ({
  runs: add(s.runs, 1),
  lines: add(s.lines, r.lines),
  fives: add(s.fives, r.fives),
  sweeps: add(s.sweeps, r.sweeps),
  bestLevel: Math.max(s.bestLevel, r.level),
});
