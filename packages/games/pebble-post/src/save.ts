// Save schema v1: stats only. A run lasts a few minutes, so there is no mid-run save.
import type { Json } from '@pocketcade/sdk';
import { isCount, isRecord } from '@pocketcade/toolkit';

/** best score, finished runs, best distance (m) and every letter ever delivered */
export type StatsV1 = { best: number; runs: number; bestDistance: number; letters: number };

export const freshStats = (): StatsV1 => ({ best: 0, runs: 0, bestDistance: 0, letters: 0 });

export const isStatsV1 = (v: Json): v is StatsV1 =>
  isRecord(v) &&
  isCount(v.best) &&
  isCount(v.runs) &&
  isCount(v.bestDistance) &&
  isCount(v.letters);

const add = (a: number, b: number) => Math.min(Number.MAX_SAFE_INTEGER, a + b);

/** Stats after a finished run. */
export function withRun(
  s: StatsV1,
  r: { score: number; distance: number; letters: number },
): StatsV1 {
  return {
    best: Math.max(s.best, r.score),
    runs: add(s.runs, 1),
    bestDistance: Math.max(s.bestDistance, r.distance),
    letters: add(s.letters, r.letters),
  };
}
