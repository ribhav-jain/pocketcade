// @vitest-environment node
// Rules, rating, streak and daily selection, plus the save guards.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COMMON, WORDS } from '../src/data/words.gen.ts';
import { DAILY_EPOCH } from '../src/daily.ts';
import {
  addDays,
  currentStreak,
  dailySlot,
  daysBetween,
  indexOf,
  makeDict,
  rate,
  revealPath,
  shortestPath,
  trimHistory,
  validateHop,
} from '../src/logic.ts';
import { isDailyV1, isPracticeV1, isSettingsV1 } from '../src/save.ts';
import type { DailyEntryV1 } from '../src/save.ts';

const dict = makeDict(WORDS, Uint8Array.from(Buffer.from(COMMON, 'base64')));

describe('hop validation (first failure wins)', () => {
  const ladder = ['cold', 'cord'];
  it.each([
    ['co1d', 'format'],
    ['CORD', 'same'],
    ['ward', 'one_letter'],
    ['cold', 'repeat'],
    ['corx', 'unknown'],
  ] as const)('%s → %s', (input, code) => {
    expect(validateHop(dict, input, 'cord', ladder)).toEqual({ ok: false, code });
  });
  it('accepts a dictionary word one letter away and reports the changed position', () => {
    expect(validateHop(dict, ' Card ', 'cord', ladder)).toEqual({
      ok: true,
      word: 'card',
      changedAt: 1,
    });
  });
  it('blocklisted words are simply unknown', () => {
    expect(indexOf(dict, 'shit')).toBe(-1);
  });
});

describe('rating', () => {
  it.each([
    [4, 4, 'On par', 3],
    [5, 4, 'Close', 2],
    [6, 4, 'Close', 2],
    [7, 4, 'Made it', 1],
    [9, 4, 'Made it', 1],
    [10, 4, 'Scenic route', 0],
  ] as const)('%i hops at par %i → %s', (hops, par, label, marks) => {
    expect(rate(hops, par, 'solved')).toEqual({ label, marks });
  });
  it('revealed and out of hops have no marks', () => {
    expect(rate(3, 4, 'revealed')).toEqual({ label: 'Shown the way', marks: null });
    expect(rate(50, 4, 'out_of_hops')).toEqual({ label: 'Out of rungs', marks: null });
  });
});

describe('dates, daily slot and streak', () => {
  it('epoch is a Monday and slots follow the weekday curve', () => {
    expect(new Date(`${DAILY_EPOCH}T00:00:00Z`).getUTCDay()).toBe(1);
    expect(dailySlot(DAILY_EPOCH, DAILY_EPOCH, 728)).toEqual({ day: 1, index: 0 });
    expect(dailySlot(addDays(DAILY_EPOCH, 6), DAILY_EPOCH, 728)).toEqual({ day: 7, index: 6 });
    expect(dailySlot(addDays(DAILY_EPOCH, -1), DAILY_EPOCH, 728)).toEqual({ day: 0, index: 727 });
    expect(dailySlot(addDays(DAILY_EPOCH, 728), DAILY_EPOCH, 728).index).toBe(0);
  });
  it('day arithmetic ignores DST', () => {
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
    expect(addDays('2026-10-31', 2)).toBe('2026-11-02');
  });
  it('streak counts consecutive solved days ending today or yesterday ', () => {
    const e = (s: DailyEntryV1['s']): DailyEntryV1 => ({ h: 5, p: 4, s });
    const history = {
      '2026-11-07': e('solved'),
      '2026-11-08': e('solved'),
      '2026-11-09': e('solved'),
      '2026-11-05': e('revealed'),
    };
    expect(currentStreak(history, '2026-11-09')).toBe(3);
    expect(currentStreak(history, '2026-11-10')).toBe(3);
    expect(currentStreak(history, '2026-11-11')).toBe(0);
    expect(currentStreak({ ...history, '2026-11-08': e('expired') }, '2026-11-09')).toBe(1);
  });
  it('history keeps the newest 1,000 entries', () => {
    const many = Object.fromEntries(
      Array.from({ length: 1005 }, (_, i) => [
        addDays('2020-01-01', i),
        { h: 4, p: 4, s: 'solved' as const },
      ]),
    );
    const kept = Object.keys(trimHistory(many));
    expect(kept).toHaveLength(1000);
    expect(kept[0]).toBe(addDays('2020-01-01', 5));
  });
});

describe('paths', () => {
  it('cold → warm, the attract puzzle, has a 4-hop ladder', () => {
    expect(shortestPath(dict, 'cold', 'warm')).toHaveLength(5);
    expect(revealPath(dict, 'cold', 'warm', 4)).toHaveLength(5);
  });
  it('every word the attract demo plays is in the word list', () => {
    for (const w of ['cold', 'cord', 'card', 'ward', 'warm'])
      expect(indexOf(dict, w)).toBeGreaterThanOrEqual(0);
  });
});

describe('save guards and committed fixtures', () => {
  const fixture = (name: string) =>
    JSON.parse(readFileSync(new URL(`./fixtures/save/${name}.v1.json`, import.meta.url), 'utf8'));
  it('accepts the v1 fixtures', () => {
    expect(isDailyV1(fixture('daily'))).toBe(true);
    expect(isPracticeV1(fixture('practice'))).toBe(true);
    expect(isSettingsV1(fixture('settings'))).toBe(true);
  });
  it('rejects malformed data', () => {
    expect(
      isDailyV1({ current: null, history: { bad: { h: 1, p: 4, s: 'solved' } }, bestStreak: 0 }),
    ).toBe(false);
    expect(isSettingsV1({ entry: 'voice' })).toBe(false);
  });
});
