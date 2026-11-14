// The save: stars and best score for every cleared level, and the best run score. A level takes a minute or two,
// so there is no mid-level save.
import type { Json } from '@pocketcade/sdk';
import { isCount, isInt, isRecord } from '@pocketcade/toolkit';
import { MAX_LEVEL } from './levels.ts';

/** `stars[i]` and `scores[i]` belong to level i + 1; levels are cleared in order, so the lists have no gaps. */
export type ProgressV1 = { stars: number[]; scores: number[]; best: number };

export const freshProgress = (): ProgressV1 => ({ stars: [], scores: [], best: 0 });

export const isProgressV1 = (v: Json): v is ProgressV1 =>
  isRecord(v) &&
  Array.isArray(v.stars) &&
  Array.isArray(v.scores) &&
  v.stars.length <= MAX_LEVEL &&
  v.stars.length === v.scores.length &&
  v.stars.every((s) => isInt(s, 1, 3)) &&
  v.scores.every((s) => isCount(s)) &&
  isCount(v.best);

/** The first level not cleared yet: where Continue starts. */
export const furthest = (p: ProgressV1) => Math.min(MAX_LEVEL, p.stars.length + 1);

/** Progress after clearing `level` (at most the furthest one): keeps the better stars and score. */
export function withLevel(
  p: ProgressV1,
  level: number,
  r: { stars: number; score: number },
): ProgressV1 {
  const i = level - 1;
  if (i < 0 || i > p.stars.length || i >= MAX_LEVEL) return p;
  const stars = [...p.stars];
  const scores = [...p.scores];
  stars[i] = Math.max(stars[i] ?? 0, r.stars);
  scores[i] = Math.max(scores[i] ?? 0, r.score);
  return { ...p, stars, scores };
}

/** Progress after a run (one sitting of levels) that scored `score`. */
export const withRun = (p: ProgressV1, score: number): ProgressV1 => ({
  ...p,
  best: Math.max(p.best, score),
});
