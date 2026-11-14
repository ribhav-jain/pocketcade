// Save shapes and their validators. Type aliases, not interfaces, so they satisfy Json.
import type { Json } from '@pocketcade/sdk';
import { isCount, isInt, isRecord, isRngState, type RngState } from '@pocketcade/toolkit';
import { CELLS, COLOURS, HAND, SHAPES } from './logic.ts';

export type PieceV1 = { shape: number; colour: number };

/** The game in progress, written after every placement. */
export type RunSaveV1 = {
  /** 64 colour codes, row-major from the top-left; 0 = empty */
  board: number[];
  /** three slots; null once that patch has been placed */
  hand: (PieceV1 | null)[];
  score: number;
  streak: number;
  placed: number;
  lines: number;
  /** RNG state after the last deal */
  rng: RngState;
  phase: 'playing' | 'over';
  /** 'snugfit:run:<16 hex>' */
  seed: string;
  /** ISO 8601 UTC */
  startedAt: string;
};

export type ProfileV1 = {
  /** highest score reached on this device */
  best: number;
};

const isPiece = (v: unknown): v is PieceV1 =>
  isRecord(v) && isInt(v.shape, 0, SHAPES.length - 1) && isInt(v.colour, 1, COLOURS);

export function isRunV1(data: Json): data is RunSaveV1 {
  if (!isRecord(data)) return false;
  const { board, hand, score, streak, placed, lines, rng, phase, seed, startedAt } = data;
  if (!Array.isArray(board) || board.length !== CELLS) return false;
  if (!board.every((c) => isInt(c, 0, COLOURS))) return false;
  if (!Array.isArray(hand) || hand.length !== HAND) return false;
  if (!hand.every((p) => p === null || isPiece(p)) || hand.every((p) => p === null)) return false;
  if (!isCount(score) || !isCount(streak) || !isCount(placed) || !isCount(lines)) return false;
  if (!isRngState(rng)) return false;
  if (phase !== 'playing' && phase !== 'over') return false;
  if (typeof seed !== 'string' || seed.length < 1 || seed.length > 64) return false;
  return typeof startedAt === 'string';
}

export function isProfileV1(data: Json): data is ProfileV1 {
  return isRecord(data) && isCount(data.best);
}
