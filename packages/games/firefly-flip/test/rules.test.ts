// @vitest-environment node
// Rules checks: the deal, the Pairs open/match/mismatch/shortcut rules, the Follow tempo and round flow with one
// second look, and the save guard.
import { createRng } from '@pocketcade/toolkit';
import { describe, expect, it } from 'vitest';
import { createFollow, tempo, timeline, type Follow, type FollowEvent } from '../src/follow.ts';
import { createPairs, deal, GRIDS, HOLD_MS, SHORTCUT_MS, TURN_MS } from '../src/pairs.ts';
import { defaultSave, isBoardV1, isSaveV1 } from '../src/save.ts';

describe('Pairs', () => {
  it('deals each of P distinct motifs exactly twice, the same for the same seed', () => {
    for (const g of ['4x4', '4x5', '6x6'] as const) {
      const faces = deal(createRng('pairs:00000000000000aa'), g);
      expect(faces).toHaveLength(GRIDS[g].pairs * 2);
      const counts = new Map<number, number>();
      for (const f of faces) counts.set(f, (counts.get(f) ?? 0) + 1);
      expect([...counts.values()].every((n) => n === 2)).toBe(true);
      expect(counts.size).toBe(GRIDS[g].pairs);
    }
    expect(deal(createRng('s'), '6x6')).toEqual(deal(createRng('s'), '6x6'));
  });

  const board = () => {
    const faces = [0, 1, 0, 1, 2, 3, 2, 3, 4, 5, 4, 5, 6, 7, 6, 7];
    return createPairs({ faces, matched: faces.map(() => false), moves: 0 });
  };

  it('a match locks both cards and counts one move', () => {
    const p = board();
    p.tap(0, 0);
    const ev = p.tap(2, 100);
    expect(ev.map((e) => e.type)).toEqual(['open', 'match']);
    expect(p.moves).toBe(1);
    expect(p.tap(0, 200)).toEqual([]); // matched cards ignore taps
  });

  it('a mismatch holds, ignores early taps, honours the shortcut, and closes on time', () => {
    const p = board();
    p.tap(0, 0);
    expect(p.tap(1, 0).at(-1)?.type).toBe('mismatch');
    expect(p.tap(4, TURN_MS + SHORTCUT_MS - 1)).toEqual([]); // too early: ignored, not queued
    expect(p.tick(TURN_MS + HOLD_MS - 1)).toEqual([]);
    expect(p.tick(TURN_MS + HOLD_MS)).toEqual([{ type: 'close', cells: [0, 1] }]);

    const q = board();
    q.tap(0, 0);
    q.tap(1, 0);
    expect(q.tap(4, TURN_MS + SHORTCUT_MS).map((e) => e.type)).toEqual(['close', 'open']); // shortcut opens the new card
    expect(q.open).toEqual([4]);
    expect(q.moves).toBe(1);
  });

  it('clears when every pair is matched', () => {
    const p = board();
    let last: string | undefined;
    for (let m = 0; m < 8; m++) {
      const a = [0, 1, 4, 5, 8, 9, 12, 13][m]!;
      p.tap(a, m * 10);
      last = p.tap(a + 2, m * 10).at(-1)?.type;
    }
    expect(last).toBe('cleared');
    expect(p.moves).toBe(8);
  });
});

describe('Follow', () => {
  it('tempo never exceeds 2 highlights per second and repeats get a visible gap', () => {
    for (const L of [1, 5, 6, 10, 14, 99]) {
      const { on, gap } = tempo(L);
      expect(on).toBeGreaterThanOrEqual(350);
      expect(on + gap).toBeGreaterThanOrEqual(500);
    }
    const t = timeline([0, 0, 1]);
    expect(t[1]!.on - t[0]!.off).toBe(250);
  });

  /** Runs the clock until the pattern is ready for input, then returns the pattern. */
  function toRepeat(f: Follow, now: { t: number }, events: FollowEvent[]): readonly number[] {
    while (f.phase !== 'repeat' && f.phase !== 'over') {
      now.t += 10;
      events.push(...f.tick(now.t));
    }
    return f.pattern;
  }

  it('grows one step per cleared round; the first mistake gives a second look, the second ends the run', () => {
    const f = createFollow(createRng('follow:test'));
    const now = { t: 0 };
    const ev: FollowEvent[] = [...f.begin(0)];
    for (let round = 1; round <= 3; round++) {
      const pattern = toRepeat(f, now, ev);
      expect(pattern).toHaveLength(round);
      for (const l of pattern) ev.push(...f.press(l, (now.t += 50)));
      expect(f.phase).toBe('cleared');
      for (let i = 0; i < 100; i++) ev.push(...f.tick((now.t += 10)));
    }
    expect(ev.filter((e) => e.type === 'tone').length).toBeGreaterThanOrEqual(1 + 2 + 3);
    // Round 4: a wrong press uses the second look and replays the same length.
    let pattern = toRepeat(f, now, ev);
    ev.push(...f.press((pattern[0]! + 1) % 4, (now.t += 50)));
    for (let i = 0; i < 100; i++) ev.push(...f.tick((now.t += 10)));
    expect(f.secondLookLeft).toBe(false);
    pattern = toRepeat(f, now, ev);
    expect(pattern).toHaveLength(4);
    ev.push(...f.press((pattern[0]! + 1) % 4, (now.t += 50)));
    for (let i = 0; i < 100; i++) ev.push(...f.tick((now.t += 10)));
    expect(f.phase).toBe('over');
    expect(ev.at(-1)).toEqual({ type: 'over', score: 3 });
  });

  it('never plays the same lantern three times in a row', () => {
    const f = createFollow(createRng('follow:runs'));
    f.begin(0);
    let t = 0;
    for (let round = 0; round < 40 && f.phase !== 'over'; round++) {
      while (f.phase !== 'repeat') f.tick((t += 10));
      for (const l of f.pattern) f.press(l, (t += 10));
      for (let i = 0; i < 100; i++) f.tick((t += 10));
    }
    const p = f.pattern;
    for (let i = 2; i < p.length; i++) expect(p[i] === p[i - 1] && p[i] === p[i - 2]).toBe(false);
    expect(p.length).toBeGreaterThan(30);
  });
});

describe('save', () => {
  it('defaults validate; a board must hold each motif exactly twice', () => {
    expect(isSaveV1(defaultSave())).toBe(true);
    const faces = deal(createRng('x'), '4x4');
    const ok = {
      seed: '0123456789abcdef',
      faces,
      matched: faces.map(() => false),
      moves: 0,
      elapsedMs: 0,
      log: [],
    };
    expect(isBoardV1(ok, '4x4')).toBe(true);
    expect(isBoardV1({ ...ok, faces: [...faces.slice(0, 15), faces[0]!] }, '4x4')).toBe(false);
    expect(isBoardV1(ok, '6x6')).toBe(false);
  });
});
