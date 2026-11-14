// Letterhop rules: word lookup, hop validation, ladder search, rating, dates and streaks. Pure: no DOM, no storage.
import type { AttemptStatus, DailyEntryV1 } from './save.ts';

const LENGTH = 4;
export const HOP_CAP = 50;
export const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';

/** `words`: sorted, concatenated 4-letter words. `common`: a bitset over word indices marking familiar words. */
export interface Dict {
  readonly words: string;
  readonly count: number;
  readonly common: Uint8Array;
}

export function makeDict(words: string, common: Uint8Array): Dict {
  return { words, count: words.length / LENGTH, common };
}

export const wordAt = (d: Dict, i: number): string =>
  d.words.slice(i * LENGTH, i * LENGTH + LENGTH);
export const isCommon = (d: Dict, i: number): boolean =>
  ((d.common[i >> 3] ?? 0) & (1 << (i & 7))) !== 0;

/** Binary search; -1 when absent. */
export function indexOf(d: Dict, w: string): number {
  let lo = 0;
  let hi = d.count - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const m = wordAt(d, mid);
    if (m === w) return mid;
    if (m < w) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

/** Neighbour indices in ascending (alphabetical) order. */
function neighbours(d: Dict, i: number): number[] {
  const w = wordAt(d, i);
  const out: number[] = [];
  for (let p = 0; p < LENGTH; p++)
    for (const ch of ALPHABET) {
      if (ch === w[p]) continue;
      const j = indexOf(d, w.slice(0, p) + ch + w.slice(p + 1));
      if (j >= 0) out.push(j);
    }
  return out.sort((a, b) => a - b);
}

/** Shortest path from `from` to `to` (inclusive), deterministic: neighbours are explored alphabetically. */
export function shortestPath(
  d: Dict,
  from: string,
  to: string,
  commonOnly = false,
): string[] | null {
  const s = indexOf(d, from);
  const g = indexOf(d, to);
  if (s < 0 || g < 0) return null;
  const prev = new Map<number, number>([[s, -1]]);
  const q = [s];
  for (let h = 0; h < q.length; h++) {
    const u = q[h]!;
    if (u === g) break;
    for (const v of neighbours(d, u)) {
      if (prev.has(v) || (commonOnly && v !== g && !isCommon(d, v))) continue;
      prev.set(v, u);
      q.push(v);
    }
  }
  if (!prev.has(g)) return null;
  const path: string[] = [];
  for (let n = g; n !== -1; n = prev.get(n)!) path.push(wordAt(d, n));
  return path.reverse();
}

/** The ladder shown to the player: over common words if that is as short as par, else over the full dictionary. */
export function revealPath(d: Dict, from: string, to: string, par: number): string[] {
  const common = shortestPath(d, from, to, true);
  if (common && common.length - 1 === par) return common;
  return shortestPath(d, from, to) ?? [from, to];
}

export type HopResult =
  | { ok: true; word: string; changedAt: number }
  | { ok: false; code: 'format' | 'same' | 'one_letter' | 'repeat' | 'unknown' };

/** Checks a typed word as the next hop; the first failing rule wins. `ladder` holds every word on the ladder, start included. */
export function validateHop(
  d: Dict,
  input: string,
  top: string,
  ladder: readonly string[],
): HopResult {
  const c = input.trim().toLowerCase();
  if (!/^[a-z]{4}$/.test(c)) return { ok: false, code: 'format' };
  if (c === top) return { ok: false, code: 'same' };
  const diff = [...c].map((ch, i) => (ch === top[i] ? -1 : i)).filter((i) => i >= 0);
  if (diff.length !== 1) return { ok: false, code: 'one_letter' };
  if (ladder.includes(c)) return { ok: false, code: 'repeat' };
  if (indexOf(d, c) < 0) return { ok: false, code: 'unknown' };
  return { ok: true, word: c, changedAt: diff[0]! };
}

export interface Rating {
  label: 'On par' | 'Close' | 'Made it' | 'Scenic route' | 'Shown the way' | 'Out of rungs';
  marks: number | null;
}

/** Rating by hops over par. `hops < par` means bad puzzle data: it is rated On par (the caller reports it). */
export function rate(hops: number, par: number, status: Exclude<AttemptStatus, 'playing'>): Rating {
  if (status === 'revealed') return { label: 'Shown the way', marks: null };
  if (status === 'out_of_hops') return { label: 'Out of rungs', marks: null };
  const over = hops - par;
  if (over <= 0) return { label: 'On par', marks: 3 };
  if (over <= 2) return { label: 'Close', marks: 2 };
  if (over <= 5) return { label: 'Made it', marks: 1 };
  return { label: 'Scenic route', marks: 0 };
}

// ─── dates (all through Date.UTC on YYYY-MM-DD parts, so DST and time zones never shift a day) ───

const utc = (key: string): number => {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
};
export const daysBetween = (a: string, b: string): number =>
  Math.round((utc(b) - utc(a)) / 86_400_000);
export function addDays(key: string, n: number): string {
  return new Date(utc(key) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Day number counted from the epoch (#1 on the epoch) and the puzzle list index it maps to. */
export function dailySlot(
  key: string,
  epoch: string,
  length: number,
): { day: number; index: number } {
  const day = daysBetween(epoch, key) + 1;
  return { day, index: (((day - 1) % length) + length) % length };
}

/** The run of solved dates ending at the latest solved date, if that is today or yesterday. */
export function currentStreak(
  history: Readonly<Record<string, DailyEntryV1>>,
  today: string,
): number {
  const solved = Object.keys(history)
    .filter((k) => history[k]!.s === 'solved')
    .sort();
  const last = solved.at(-1);
  if (!last || daysBetween(last, today) > 1) return 0;
  let n = 1;
  for (let k = addDays(last, -1); history[k]?.s === 'solved'; k = addDays(k, -1)) n++;
  return n;
}

/** Keeps the newest `max` entries. */
export function trimHistory(
  history: Record<string, DailyEntryV1>,
  max = 1000,
): Record<string, DailyEntryV1> {
  const keys = Object.keys(history).sort();
  return Object.fromEntries(
    keys.slice(Math.max(0, keys.length - max)).map((k) => [k, history[k]!]),
  );
}

/** Spelled-out letters for announcements ("c o l d"). */
export const spell = (w: string): string => [...w].join(' ');
