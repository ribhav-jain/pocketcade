// Saved stats. A run lasts a minute or two, so nothing is saved mid-run.
import type { Json } from '@pocketcade/sdk';
import { isCount, isInt, isRecord } from '@pocketcade/toolkit';
import type { MissEnd } from './rules.ts';

export type TapStats = {
  best: number;
  bestHits: number;
  runs: number;
  hits: number;
  perfects: number;
  longestChain: number;
  lastRun: null | {
    score: number;
    hits: number;
    perfects: number;
    meanOffsetMs: number;
    end: MissEnd;
  };
};

export const statsDefaults = (): TapStats => ({
  best: 0,
  bestHits: 0,
  runs: 0,
  hits: 0,
  perfects: 0,
  longestChain: 0,
  lastRun: null,
});

export function isStats(v: Json): v is TapStats {
  if (!isRecord(v)) return false;
  if (![v.best, v.bestHits, v.runs, v.hits, v.perfects, v.longestChain].every(isCount))
    return false;
  const r = v.lastRun;
  if (r === null) return true;
  return (
    isRecord(r) &&
    isCount(r.score) &&
    isCount(r.hits) &&
    isCount(r.perfects) &&
    isInt(r.meanOffsetMs, -1000, 1000) &&
    (r.end === 'early' || r.end === 'late' || r.end === 'passed')
  );
}

const add = (a: number, b: number) => Math.min(Number.MAX_SAFE_INTEGER, a + b);

export interface RunSummary {
  score: number;
  hits: number;
  perfects: number;
  longestChain: number;
  meanOffsetMs: number;
  end: MissEnd;
}

/** Stats after one run that reached game over. */
export function withRun(s: TapStats, r: RunSummary): TapStats {
  return {
    best: Math.max(s.best, r.score),
    bestHits: Math.max(s.bestHits, r.hits),
    runs: add(s.runs, 1),
    hits: add(s.hits, r.hits),
    perfects: add(s.perfects, r.perfects),
    longestChain: Math.max(s.longestChain, r.longestChain),
    lastRun: {
      score: r.score,
      hits: r.hits,
      perfects: r.perfects,
      meanOffsetMs: r.meanOffsetMs,
      end: r.end,
    },
  };
}

/** Data stored with a submitted score (never shown). The per-hit offsets are dropped if it would pass 2,048 bytes. */
export function scoreMeta(
  seed: string,
  r: { hits: number; perfects: number; longestChain: number; dts: readonly number[] },
): Json {
  const base = { v: 1, seed, hits: r.hits, perfects: r.perfects, chain: r.longestChain };
  const full = { ...base, dt: [...r.dts] };
  return JSON.stringify(full).length <= 2048 ? full : base;
}
