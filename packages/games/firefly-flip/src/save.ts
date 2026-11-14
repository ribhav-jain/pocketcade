// Save schema v1, key 'save'. Follow runs are never saved mid-run.
import type { Json } from '@pocketcade/sdk';
import { isCount, isInt, isRecord } from '@pocketcade/toolkit';
import { GRIDS, MOTIFS, type GridId } from './pairs.ts';

type PairsBoardV1 = {
  seed: string;
  faces: number[];
  matched: boolean[];
  moves: number;
  elapsedMs: number;
  log: number[] | null;
};
type PairsBestV1 = { moves: number; timeMs: number; at: string };
export type FlipFollowSaveV1 = {
  prefs: { lastMode: 'pairs' | 'follow'; lastGrid: GridId };
  boards: Record<GridId, PairsBoardV1 | null>;
  bests: {
    pairs: Record<GridId, PairsBestV1 | null>;
    follow: { length: number; at: string } | null;
  };
  stats: { boardsCleared: Record<GridId, number>; followRuns: number };
};

export const GRID_IDS: readonly GridId[] = ['4x4', '4x5', '6x6'];

export const defaultSave = (): FlipFollowSaveV1 => ({
  prefs: { lastMode: 'pairs', lastGrid: '4x4' },
  boards: { '4x4': null, '4x5': null, '6x6': null },
  bests: { pairs: { '4x4': null, '4x5': null, '6x6': null }, follow: null },
  stats: { boardsCleared: { '4x4': 0, '4x5': 0, '6x6': 0 }, followRuns: 0 },
});

export function isBoardV1(v: unknown, grid: GridId): v is PairsBoardV1 {
  if (!isRecord(v) || typeof v.seed !== 'string' || !/^[0-9a-f]{16}$/.test(v.seed)) return false;
  const { faces, matched } = v;
  const cells = GRIDS[grid].pairs * 2;
  if (
    !Array.isArray(faces) ||
    faces.length !== cells ||
    !faces.every((f) => isInt(f, 0, MOTIFS - 1))
  )
    return false;
  const counts = new Map<number, number>();
  for (const f of faces as number[]) counts.set(f, (counts.get(f) ?? 0) + 1);
  if ([...counts.values()].some((n) => n !== 2) || counts.size !== GRIDS[grid].pairs) return false;
  if (
    !Array.isArray(matched) ||
    matched.length !== cells ||
    !matched.every((m) => typeof m === 'boolean')
  )
    return false;
  for (let i = 0; i < cells; i++)
    for (let j = i + 1; j < cells; j++)
      if (faces[i] === faces[j] && matched[i] !== matched[j]) return false;
  const pairsMatched = (matched as boolean[]).filter(Boolean).length / 2;
  const logOk =
    v.log === null ||
    (Array.isArray(v.log) && v.log.length <= 400 && v.log.every((c) => isInt(c, 0, cells - 1)));
  return isInt(v.moves, pairsMatched) && isInt(v.elapsedMs, 0, 359_999_999) && logOk;
}

export function isSaveV1(v: Json): v is FlipFollowSaveV1 {
  if (
    !isRecord(v) ||
    !isRecord(v.prefs) ||
    !isRecord(v.boards) ||
    !isRecord(v.bests) ||
    !isRecord(v.stats)
  )
    return false;
  const { prefs, boards, bests, stats } = v;
  if (
    !['pairs', 'follow'].includes(prefs.lastMode as string) ||
    !GRID_IDS.includes(prefs.lastGrid as GridId)
  )
    return false;
  if (!GRID_IDS.every((g) => boards[g] === null || isBoardV1(boards[g], g))) return false;
  const pb = bests.pairs;
  const bestOk = (g: GridId) => {
    const b = isRecord(pb) ? pb[g] : undefined;
    return b === null || (isRecord(b) && isInt(b.moves, GRIDS[g].pairs) && isCount(b.timeMs));
  };
  if (!GRID_IDS.every(bestOk)) return false;
  const f = bests.follow;
  if (f !== null && !(isRecord(f) && isInt(f.length, 1, 99) && typeof f.at === 'string'))
    return false;
  const bc = stats.boardsCleared;
  return isRecord(bc) && GRID_IDS.every((g) => isCount(bc[g])) && isCount(stats.followRuns);
}

/** Device best per grid: fewer moves, then lower time. */
export function betterPairs(prev: PairsBestV1 | null, moves: number, timeMs: number): boolean {
  return !prev || moves < prev.moves || (moves === prev.moves && timeMs < prev.timeMs);
}
