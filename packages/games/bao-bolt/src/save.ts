// What is saved: lifetime stats and bests. A run in progress is not saved.
import type { Json } from '@pocketcade/sdk';
import { isCount, isInt, isRecord } from '@pocketcade/toolkit';

export type RunStatsV1 = {
  runs: number;
  bestPoints: number;
  bestMetres: number;
  /** 1..5 */
  bestMultiplier: number;
  totalMetres: number;
  totalCrumbs: number;
  lastRunAt: string | null;
};

export const DEFAULT_STATS: RunStatsV1 = {
  runs: 0,
  bestPoints: 0,
  bestMetres: 0,
  bestMultiplier: 1,
  totalMetres: 0,
  totalCrumbs: 0,
  lastRunAt: null,
};

export function isStatsV1(v: Json): v is RunStatsV1 {
  return (
    isRecord(v) &&
    isCount(v.runs) &&
    isCount(v.bestPoints) &&
    isCount(v.bestMetres) &&
    isInt(v.bestMultiplier, 1, 5) &&
    isCount(v.totalMetres) &&
    isCount(v.totalCrumbs) &&
    (v.lastRunAt === null || typeof v.lastRunAt === 'string')
  );
}

const add = (a: number, b: number) => Math.min(Number.MAX_SAFE_INTEGER, a + b);

/** Stats after one completed run. */
export function withRun(
  s: RunStatsV1,
  run: { points: number; metres: number; crumbs: number; maxMultiplier: number; at: string },
): RunStatsV1 {
  return {
    runs: add(s.runs, 1),
    bestPoints: Math.max(s.bestPoints, run.points),
    bestMetres: Math.max(s.bestMetres, run.metres),
    bestMultiplier: Math.max(s.bestMultiplier, run.maxMultiplier),
    totalMetres: add(s.totalMetres, run.metres),
    totalCrumbs: add(s.totalCrumbs, run.crumbs),
    lastRunAt: run.at,
  };
}
