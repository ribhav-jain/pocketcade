// Save shapes and their validators. Type aliases, not interfaces, so they satisfy Json.
import type { Json } from '@pocketcade/sdk';
import { isCount, isInt, isRecord } from '@pocketcade/toolkit';
import { CAP, FLAVOURS, MAX_BOTTLES, type Pour } from './logic.ts';

/** Progress across levels. */
export type ProgressV1 = {
  /** the highest level solved; 0 before the first */
  furthest: number;
  /** the level on the shelves now */
  level: number;
  /** stars earned over every level solved */
  stars: number;
};

/** The level in progress, written after every pour. */
export type RunV1 = {
  level: number;
  /** each bottle's layers, bottom first */
  bottles: number[][];
  /** mystery layers left at the bottom of each bottle */
  veil: number[];
  /** pours made and not undone */
  moves: number;
  /** the most recent pours, oldest first, five numbers each: from, to, layers, and the two veils before */
  history: number[];
  hint: boolean;
  extra: boolean;
};

/** Undo steps kept in the save; a session keeps them all. */
export const HISTORY_SAVED = 200;
const LEVEL_MAX = 99_999;

export function isProgressV1(data: Json): data is ProgressV1 {
  if (!isRecord(data)) return false;
  const { furthest, level, stars } = data;
  if (!isInt(furthest, 0, LEVEL_MAX) || !isInt(level, 1, LEVEL_MAX)) return false;
  return isInt(stars, 0, furthest * 3) && level <= furthest + 1;
}

export function isRunV1(data: Json): data is RunV1 {
  if (!isRecord(data)) return false;
  const { level, bottles, veil, moves, history, hint, extra } = data;
  if (!isInt(level, 1, LEVEL_MAX) || !isCount(moves)) return false;
  if (typeof hint !== 'boolean' || typeof extra !== 'boolean') return false;
  if (!Array.isArray(bottles) || bottles.length < 1 || bottles.length > MAX_BOTTLES) return false;
  const count = bottles.length;
  for (const b of bottles) {
    if (!Array.isArray(b) || b.length > CAP) return false;
    if (!b.every((f) => isInt(f, 1, FLAVOURS))) return false;
  }
  if (!Array.isArray(veil) || veil.length !== count) return false;
  if (!veil.every((v) => isInt(v, 0, CAP - 1))) return false;
  if (!Array.isArray(history) || history.length % 5 !== 0) return false;
  if (history.length > HISTORY_SAVED * 5) return false;
  return history.every((v, i) =>
    i % 5 < 2 ? isInt(v, 0, count - 1) : i % 5 === 2 ? isInt(v, 1, CAP) : isInt(v, 0, CAP - 1),
  );
}

export function packHistory(history: readonly Pour[]): number[] {
  return history.slice(-HISTORY_SAVED).flatMap((p) => [p.from, p.to, p.n, p.veilFrom, p.veilTo]);
}

export function unpackHistory(flat: readonly number[]): Pour[] {
  const out: Pour[] = [];
  for (let i = 0; i + 4 < flat.length; i += 5)
    out.push({
      from: flat[i]!,
      to: flat[i + 1]!,
      n: flat[i + 2]!,
      veilFrom: flat[i + 3]!,
      veilTo: flat[i + 4]!,
    });
  return out;
}
