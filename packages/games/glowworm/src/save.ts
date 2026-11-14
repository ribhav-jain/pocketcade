// Saved stats. A run lasts a few minutes, so there is no mid-run save.
import type { Json } from '@pocketcade/sdk';
import { isCount, isRecord } from '@pocketcade/toolkit';
import { CELLS } from './sim.ts';

/** `deepest` is the highest cave number reached. */
export type StatsV1 = { best: number; played: number; longest: number; deepest: number };

export const freshStats = (): StatsV1 => ({ best: 0, played: 0, longest: 0, deepest: 0 });

export const isStatsV1 = (v: Json): v is StatsV1 =>
  isRecord(v) &&
  isCount(v.best) &&
  isCount(v.played) &&
  isCount(v.longest) &&
  v.longest <= CELLS &&
  isCount(v.deepest);

/** Stats after a finished run. */
export function withRun(s: StatsV1, r: { score: number; length: number; depth: number }): StatsV1 {
  return {
    best: Math.max(s.best, r.score),
    played: Math.min(Number.MAX_SAFE_INTEGER, s.played + 1),
    longest: Math.max(s.longest, Math.min(CELLS, r.length)),
    deepest: Math.max(s.deepest, r.depth),
  };
}
