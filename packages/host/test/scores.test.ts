// Local leaderboards: validation, ranking, the top-10 cut, personal bests and initials.
import { SDK_API_VERSION, type GameMeta, type ScoresAPI } from '@pocketcade/sdk';
import { describe, expect, it } from 'vitest';
import { createMemoryBackend, type StorageBackend } from '../src/backend.ts';
import { createScoresAdmin, type RankedScore } from '@pocketcade/sdk/rules';

const meta: GameMeta = {
  id: 'sumslide',
  apiVersion: SDK_API_VERSION,
  version: '1.0.0',
  inputs: ['keyboard'],
  orientation: 'any',
  aspectRatio: 1,
  minSize: { width: 280, height: 280 },
  saveSchemaVersion: 1,
  leaderboards: [
    { id: 'best-score', label: 'Best score', order: 'desc', format: 'integer' },
    { id: 'fastest', label: 'Fastest', order: 'asc', format: 'duration_ms' },
    { id: 'fewest', label: 'Fewest moves', order: 'asc', format: 'moves' },
  ],
};

function setup(backend: StorageBackend = createMemoryBackend()) {
  let t = Date.UTC(2026, 10, 10);
  const clock = { now: () => t };
  const ranked: RankedScore[] = [];
  const admin = createScoresAdmin(backend, clock);
  const scores = admin.forGame(meta, { readOnly: false, onRanked: (s) => ranked.push(s) });
  return { backend, admin, scores, ranked, tick: (ms = 1) => (t += ms) };
}

async function values(scores: ScoresAPI, board: string) {
  return (await scores.top(board)).map((e) => e.value);
}

describe('scores.submit validation', () => {
  it('rejects unknown boards and invalid values per format', async () => {
    const { scores } = setup();
    expect(await scores.submit({ board: 'nope', value: 1 })).toEqual({
      accepted: false,
      rank: null,
      personalBest: false,
      reason: 'unknown_board',
    });
    const invalid = { accepted: false, rank: null, personalBest: false, reason: 'invalid_value' };
    expect(await scores.submit({ board: 'best-score', value: -1 })).toEqual(invalid);
    expect(await scores.submit({ board: 'best-score', value: 1.5 })).toEqual(invalid);
    expect(await scores.submit({ board: 'fastest', value: 0 })).toEqual(invalid);
    expect(await scores.submit({ board: 'fastest', value: 360_000_000 })).toEqual(invalid);
    expect(await scores.submit({ board: 'fewest', value: 1_000_000 })).toEqual(invalid);
    expect(
      await scores.submit({ board: 'best-score', value: 5, meta: { blob: 'x'.repeat(2100) } }),
    ).toEqual(invalid);
  });

  it('accepts a valid entry with default initials AAA and the host clock', async () => {
    const { scores, backend, ranked } = setup();
    expect(await scores.submit({ board: 'best-score', value: 100, meta: { moves: 3 } })).toEqual({
      accepted: true,
      rank: 1,
      personalBest: true,
    });
    const record = JSON.parse(backend.getItem('pocketcade:v1:lb:sumslide:best-score')!);
    expect(record).toMatchObject({ v: 1, order: 'desc', format: 'integer' });
    expect(record.entries[0]).toMatchObject({
      value: 100,
      initials: 'AAA',
      achievedAt: '2026-11-10T00:00:00.000Z',
      meta: { moves: 3 },
    });
    expect(ranked).toEqual([
      {
        board: 'best-score',
        value: 100,
        rank: 1,
        entryId: record.entries[0].id,
        personalBest: true,
      },
    ]);
  });
});

describe('ranking and trimming', () => {
  it('ranks desc boards high-first and asc boards low-first', async () => {
    const { scores, tick } = setup();
    for (const v of [50, 200, 100]) {
      await scores.submit({ board: 'best-score', value: v });
      await scores.submit({ board: 'fastest', value: v });
      tick();
    }
    expect(await values(scores, 'best-score')).toEqual([200, 100, 50]);
    expect(await values(scores, 'fastest')).toEqual([50, 100, 200]);
  });

  it('breaks ties by earlier achievedAt, then keeps the stored entry first', async () => {
    const { scores, tick } = setup();
    await scores.submit({ board: 'best-score', value: 10, meta: 'first' });
    tick();
    const later = await scores.submit({ board: 'best-score', value: 10, meta: 'second' });
    expect(later.rank).toBe(2);
    const sameMs = await scores.submit({ board: 'best-score', value: 10, meta: 'third' });
    expect(sameMs.rank).toBe(3);
    expect((await scores.top('best-score')).map((e) => e.meta)).toEqual([
      'first',
      'second',
      'third',
    ]);
  });

  it('keeps the top 10; an entry outside it is accepted with rank null and not stored', async () => {
    const { scores, tick } = setup();
    for (let v = 10; v >= 1; v--) {
      await scores.submit({ board: 'best-score', value: v * 10 });
      tick();
    }
    expect(await scores.submit({ board: 'best-score', value: 5 })).toEqual({
      accepted: true,
      rank: null,
      personalBest: false,
    });
    expect(await values(scores, 'best-score')).toEqual([100, 90, 80, 70, 60, 50, 40, 30, 20, 10]);
    expect(await scores.submit({ board: 'best-score', value: 55 })).toMatchObject({ rank: 6 });
    expect(await values(scores, 'best-score')).toHaveLength(10);
  });

  it('personalBest: empty board, strictly better than rank 1; a tie is not a personal best', async () => {
    const { scores, tick } = setup();
    expect((await scores.submit({ board: 'best-score', value: 10 })).personalBest).toBe(true);
    tick();
    expect((await scores.submit({ board: 'best-score', value: 10 })).personalBest).toBe(false);
    expect((await scores.submit({ board: 'best-score', value: 11 })).personalBest).toBe(true);
    expect((await scores.submit({ board: 'fastest', value: 500 })).personalBest).toBe(true);
    expect((await scores.submit({ board: 'fastest', value: 400 })).personalBest).toBe(true);
    expect((await scores.submit({ board: 'fastest', value: 450 })).personalBest).toBe(false);
  });
});

describe('scores.top', () => {
  it('clamps limit and returns copies in rank order', async () => {
    const { scores } = setup();
    for (const v of [1, 2, 3]) await scores.submit({ board: 'best-score', value: v, meta: { v } });
    expect(await scores.top('best-score', 0)).toHaveLength(1);
    expect(await scores.top('best-score', Number.NaN)).toHaveLength(3);
    expect(await scores.top('best-score', 99)).toHaveLength(3);
    expect(await scores.top('unknown')).toEqual([]);
    const first = await scores.top('best-score');
    expect(first.map((e) => e.rank)).toEqual([1, 2, 3]);
    (first[0]!.meta as { v: number }).v = 999;
    first[0]!.value = 999;
    expect((await scores.top('best-score'))[0]).toMatchObject({ value: 3, meta: { v: 3 } });
  });

  it('re-sorts and re-validates stored entries when the board definition has changed', async () => {
    const { scores, backend } = setup();
    backend.setItem(
      'pocketcade:v1:lb:sumslide:fastest',
      JSON.stringify({
        v: 1,
        order: 'desc',
        format: 'integer',
        entries: [
          { id: 'a', value: 900, initials: 'AAA', achievedAt: '2026-01-01T00:00:00.000Z' },
          { id: 'b', value: 0, initials: 'AAA', achievedAt: '2026-01-01T00:00:00.000Z' },
          { id: 'c', value: 100, initials: 'AAA', achievedAt: '2026-01-01T00:00:00.000Z' },
        ],
      }),
    );
    expect(await values(scores, 'fastest')).toEqual([100, 900]);
  });

  it('the portal reads a board without a mounted game; new entries take the default initials', async () => {
    const { admin, scores } = setup();
    admin.setDefaultInitials('XYZ');
    admin.setDefaultInitials('bad');
    await scores.submit({ board: 'best-score', value: 7 });
    expect(await admin.top('sumslide', meta.leaderboards[0]!)).toMatchObject([
      { rank: 1, value: 7, initials: 'XYZ' },
    ]);
  });
});

describe('scores when storage is unavailable or read-only', () => {
  it('never rejects over a backend whose every method throws', async () => {
    const fail = () => {
      throw new Error('blocked');
    };
    const { scores } = setup({
      persistent: true,
      getItem: fail,
      setItem: fail,
      removeItem: fail,
      keys: fail,
    });
    await expect(scores.submit({ board: 'best-score', value: 1 })).resolves.toEqual({
      accepted: false,
      rank: null,
      personalBest: false,
      reason: 'unavailable',
    });
    await expect(scores.top('best-score')).resolves.toEqual([]);
  });

  it('attract submissions are unavailable and top is empty', async () => {
    const { admin, scores } = setup();
    await scores.submit({ board: 'best-score', value: 1 });
    const attract = admin.forGame(meta, { readOnly: true });
    expect(await attract.submit({ board: 'best-score', value: 9 })).toMatchObject({
      accepted: false,
      reason: 'unavailable',
    });
    expect(await attract.top('best-score')).toEqual([]);
  });
});

describe('initials', () => {
  it('renames a stored entry by id and rejects anything but three letters or digits', async () => {
    const { admin, scores, ranked } = setup();
    const board = meta.leaderboards[0]!;
    await scores.submit({ board: 'best-score', value: 10 });
    const { entryId } = ranked[0]!;
    expect(await admin.entryIds('sumslide', board)).toEqual([entryId]);
    expect(await admin.setInitials('sumslide', 'best-score', entryId, 'ABC')).toEqual({ ok: true });
    expect(await admin.setInitials('sumslide', 'best-score', entryId, 'ab')).toEqual({ ok: false });
    expect(await admin.top('sumslide', board)).toMatchObject([{ initials: 'ABC', value: 10 }]);
  });
});
