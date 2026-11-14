// Save shapes for the daily, practice and settings saves. Type aliases (not interfaces) so they satisfy Json.
import type { Json } from '@pocketcade/sdk';
import { isInt, isRecord } from '@pocketcade/toolkit';

/** 'YYYY-MM-DD', the env.dailyKey format */
export type DateKey = string;
export type AttemptStatus = 'playing' | 'solved' | 'revealed' | 'out_of_hops';
export type Tier = 'short' | 'medium' | 'long';

export type AttemptV1 = {
  /** daily 'd4-0056' (list index); practice 'p4-m-0123' */
  puzzleId: string;
  length: 4;
  start: string;
  goal: string;
  /** 4..7, copied from the puzzle when the attempt starts */
  par: number;
  /** rungs above the start word, oldest first; last === goal when solved */
  ladder: string[];
  /** 0..50; climb-downs never refund */
  hops: number;
  climbs: number;
  startedAt: string;
  status: AttemptStatus;
};

export type DailyEntryV1 = {
  h: number;
  p: number;
  s: Exclude<AttemptStatus, 'playing'> | 'expired';
};

export type DailySaveV1 = {
  current: (AttemptV1 & { dailyKey: DateKey; day: number }) | null;
  history: { [dailyKey: string]: DailyEntryV1 };
  bestStreak: number;
};

export type PracticeOrderV1 = { seed: string; next: number; cycle: number };

export type PracticeSaveV1 = {
  tier: Tier;
  orders: { short: PracticeOrderV1; medium: PracticeOrderV1; long: PracticeOrderV1 };
  current: { short: AttemptV1 | null; medium: AttemptV1 | null; long: AttemptV1 | null };
  totals: { solved: number; onPar: number; revealed: number };
};

export type SettingsSaveV1 = { entry: 'auto' | 'type' | 'picker' };

// ─── validation guards ───

const word = (v: unknown): v is string => typeof v === 'string' && /^[a-z]{4}$/.test(v);
const KEY = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = ['playing', 'solved', 'revealed', 'out_of_hops'];
const TIERS = ['short', 'medium', 'long'] as const;

function isAttemptV1(v: unknown): v is AttemptV1 {
  return (
    isRecord(v) &&
    typeof v.puzzleId === 'string' &&
    v.length === 4 &&
    word(v.start) &&
    word(v.goal) &&
    isInt(v.par, 1, 50) &&
    Array.isArray(v.ladder) &&
    v.ladder.length <= 50 &&
    v.ladder.every(word) &&
    isInt(v.hops, 0, 50) &&
    isInt(v.climbs, 0, 10_000) &&
    typeof v.startedAt === 'string' &&
    STATUSES.includes(v.status as string)
  );
}

export function isDailyV1(v: Json): v is DailySaveV1 {
  if (!isRecord(v) || !isInt(v.bestStreak, 0, 100_000) || !isRecord(v.history)) return false;
  const cur = v.current;
  if (
    cur !== null &&
    !(
      isRecord(cur) &&
      typeof cur.dailyKey === 'string' &&
      isInt(cur.day, -1e6, 1e6) &&
      isAttemptV1(cur)
    )
  )
    return false;
  return Object.entries(v.history).every(
    ([k, e]) =>
      KEY.test(k) &&
      isRecord(e) &&
      isInt(e.h, 0, 50) &&
      isInt(e.p, 1, 50) &&
      ['solved', 'revealed', 'out_of_hops', 'expired'].includes(e.s as string),
  );
}

export function isPracticeV1(v: Json): v is PracticeSaveV1 {
  if (
    !isRecord(v) ||
    !TIERS.includes(v.tier as never) ||
    !isRecord(v.orders) ||
    !isRecord(v.current) ||
    !isRecord(v.totals)
  )
    return false;
  const { orders, current, totals } = v;
  return (
    TIERS.every((t) => {
      const o = orders[t];
      return (
        isRecord(o) && typeof o.seed === 'string' && isInt(o.next, 0, 1e6) && isInt(o.cycle, 0, 1e6)
      );
    }) &&
    TIERS.every((t) => current[t] === null || isAttemptV1(current[t])) &&
    ['solved', 'onPar', 'revealed'].every((k) => isInt(totals[k], 0, 1e9))
  );
}

export function isSettingsV1(v: Json): v is SettingsSaveV1 {
  return isRecord(v) && ['auto', 'type', 'picker'].includes(v.entry as string);
}
