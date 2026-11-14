// Save shapes: the run in progress, per-size stats (with best time) and prefs.
import type { Json } from '@pocketcade/sdk';
import { isCount, isInt, isRecord } from '@pocketcade/toolkit';
import { fromBits, GEN_VERSION, popcount, SIZES, type BoardOrigin, type SizeId } from './logic.ts';

export type RunV1 = {
  size: SizeId;
  cols: number;
  rows: number;
  moles: string;
  dug: string;
  flowers: string;
  start: number;
  origin: BoardOrigin;
  gen: number;
  elapsedMs: number;
  hints: number;
  cursor: number;
  view: { zoom: 'fit' | 'close'; cx: number; cy: number };
  startedAt: string;
};
type SizeStatsV1 = {
  played: number;
  won: number;
  abandoned: number;
  streak: number;
  bestStreak: number;
  /** fastest win in ms, 0 when the size has never been cleared */
  bestMs: number;
};
export type StatsV1 = { garden: SizeStatsV1; field: SizeStatsV1; meadow: SizeStatsV1 };
export type PrefsV1 = { size: SizeId; flowerMode: boolean; suggested: ('field' | 'meadow')[] };

const zero = (): SizeStatsV1 => ({
  played: 0,
  won: 0,
  abandoned: 0,
  streak: 0,
  bestStreak: 0,
  bestMs: 0,
});
export const freshStats = (): StatsV1 => ({ garden: zero(), field: zero(), meadow: zero() });
export const freshPrefs = (): PrefsV1 => ({ size: 'garden', flowerMode: false, suggested: [] });

const isSize = (v: unknown): v is SizeId => v === 'garden' || v === 'field' || v === 'meadow';

export function isRunOrNull(v: Json): v is RunV1 | null {
  if (v === null) return true;
  if (!isRecord(v) || !isSize(v.size)) return false;
  const s = SIZES[v.size];
  const n = s.cols * s.rows;
  if (v.cols !== s.cols || v.rows !== s.rows) return false;
  const [moles, dug, flowers] = [v.moles, v.dug, v.flowers].map((b) =>
    typeof b === 'string' ? fromBits(b, n) : null,
  );
  if (!moles || !dug || !flowers || popcount(moles) !== s.moles) return false;
  for (let i = 0; i < n; i++) if ((dug[i] && moles[i]) || (flowers[i] && dug[i])) return false;
  if (!isInt(v.start, 0, n - 1) || !dug[v.start] || !isInt(v.cursor, 0, n - 1)) return false;
  if (
    !isInt(v.elapsedMs, 0, 359_999_999) ||
    !isInt(v.hints, 0, 999) ||
    !isInt(v.gen, 1, GEN_VERSION)
  )
    return false;
  const o = v.origin;
  if (!isRecord(o) || (o.src !== 'gen' && o.src !== 'unverified') || typeof o.seed !== 'string')
    return false;
  const view = v.view;
  return (
    isRecord(view) &&
    (view.zoom === 'fit' || view.zoom === 'close') &&
    typeof view.cx === 'number' &&
    typeof view.cy === 'number' &&
    typeof v.startedAt === 'string'
  );
}

const isSizeStats = (v: unknown) =>
  isRecord(v) && [v.played, v.won, v.abandoned, v.streak, v.bestStreak, v.bestMs].every(isCount);
export const isStatsV1 = (v: Json): v is StatsV1 =>
  isRecord(v) && isSizeStats(v.garden) && isSizeStats(v.field) && isSizeStats(v.meadow);
export const isPrefsV1 = (v: Json): v is PrefsV1 =>
  isRecord(v) &&
  isSize(v.size) &&
  typeof v.flowerMode === 'boolean' &&
  Array.isArray(v.suggested) &&
  v.suggested.every((x) => x === 'field' || x === 'meadow');

type Outcome = 'played' | 'won' | 'lost' | 'abandoned';
/**
 * Stats after an event for `size`: played at the first dig; a win extends the streak and may set a best time
 * (`ms`); a loss or abandon ends the streak.
 */
export function withOutcome(s: StatsV1, size: SizeId, o: Outcome, ms = 0): StatsV1 {
  const x = { ...s[size] };
  if (o === 'played') x.played++;
  else if (o === 'won') {
    x.won++;
    x.streak++;
    x.bestStreak = Math.max(x.bestStreak, x.streak);
    if (ms > 0 && (!x.bestMs || ms < x.bestMs)) x.bestMs = ms;
  } else {
    if (o === 'abandoned') x.abandoned++;
    x.streak = 0;
  }
  return { ...s, [size]: x };
}
