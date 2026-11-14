// The save: stats only. A run lasts a few minutes, so there is no mid-run save.
import type { Json } from '@pocketcade/sdk';
import { isCount, isInt, isRecord } from '@pocketcade/toolkit';

/** best distance (m), finished runs, and the best stage reached (1 = Coast Road; 0 before any run) */
export type StatsV1 = { best: number; runs: number; bestStage: number };

/** a sane cap for a saved stage (a run never gets near it) */
export const MAX_STAGE = 999;

export const freshStats = (): StatsV1 => ({ best: 0, runs: 0, bestStage: 0 });

export const isStatsV1 = (v: Json): v is StatsV1 =>
  isRecord(v) && isCount(v.best) && isCount(v.runs) && isInt(v.bestStage, 0, MAX_STAGE);

const add = (a: number, b: number) => Math.min(Number.MAX_SAFE_INTEGER, a + b);

/** Stats after a finished run that drove `distance` metres and reached `stage` (1-based). */
export function withRun(s: StatsV1, r: { distance: number; stage: number }): StatsV1 {
  return {
    best: Math.max(s.best, r.distance),
    runs: add(s.runs, 1),
    bestStage: Math.max(s.bestStage, Math.min(MAX_STAGE, r.stage)),
  };
}
