// @vitest-environment node
// Rules: placement, flood fill, the solver, no-guess generation, hints that always lead to a win, bitsets, the
// save guard and stats.
import { readFileSync } from 'node:fs';
import { createRng } from '@pocketcade/toolkit';
import { describe, expect, it } from 'vitest';
import {
  acceptable,
  createGenerator,
  deduce,
  dig,
  fromBits,
  hint,
  makeBoard,
  neighbours,
  placeMoles,
  popcount,
  SIZE_IDS,
  SIZES,
  solve,
  toBits,
  type SizeId,
} from '../src/logic.ts';
import { isPrefsV1, isRunOrNull, isStatsV1, freshStats, withOutcome } from '../src/save.ts';

const generate = (size: SizeId, start: number, seed: string) => {
  const g = createGenerator(size, start, createRng(seed), null);
  for (;;) {
    const r = g.step(0);
    if (r) return r;
  }
};

describe('sizes and placement', () => {
  it('matches the size table', () => {
    expect(SIZE_IDS.map((s) => [SIZES[s].cols * SIZES[s].rows, SIZES[s].moles])).toEqual([
      [80, 12],
      [192, 32],
      [384, 70],
    ]);
    const nb = neighbours('garden');
    expect([nb[0]!.length, nb[1]!.length, nb[9]!.length]).toEqual([3, 5, 8]);
  });

  it('never places a mole on the first dig or around it', () => {
    for (let k = 0; k < 50; k++) {
      const start = k % 80;
      const m = placeMoles('garden', start, createRng(`p${k}`));
      expect(popcount(m)).toBe(12);
      for (const c of [start, ...neighbours('garden')[start]!]) expect(m[c]).toBe(0);
    }
  });

  it('a dug 0 floods its connected zeros and their numbered border', () => {
    const moles = new Uint8Array(80);
    moles[79] = 1; // bottom-right corner
    const b = makeBoard('garden', moles);
    const dug = new Uint8Array(80);
    expect(dig(b, dug, 0)).toHaveLength(79);
    expect(dig(b, dug, 79)).toEqual([]); // moles are never dug by dig()
  });
});

describe('solver', () => {
  it('solves a deducible board; a true 50/50 corner is stuck', () => {
    // 12 moles: column 0 rows 0–7, a wall at 62, 63, 70, and one of the corner pair 71 / 79.
    const layout = (corner: number) => {
      const m = new Uint8Array(80);
      for (const c of [0, 8, 16, 24, 32, 40, 48, 56, 62, 63, 70, corner]) m[c] = 1;
      return m;
    };
    // Only cell 78 touches the pair and it counts one mole between them: no rule can tell 71 from 79.
    expect(solve(makeBoard('garden', layout(79)), 36).solved).toBe(false);
    expect(solve(makeBoard('garden', layout(71)), 36).solved).toBe(false);
    const easy = new Uint8Array(80);
    for (const c of [0, 8, 16, 24, 32, 40, 48, 56, 62, 63, 70, 79]) easy[c] = 1;
    easy[79] = 0;
    easy[7] = 1; // a corner mole proved by its neighbours
    expect(solve(makeBoard('garden', easy), 36).solved).toBe(true);
  });

  it('deduce never marks a safe cell as a mole or a mole as safe', () => {
    for (let k = 0; k < 20; k++) {
      const size: SizeId = SIZE_IDS[k % 3]!;
      const n = SIZES[size].cols * SIZES[size].rows;
      const start = Math.floor(n / 2);
      const b = makeBoard(size, placeMoles(size, start, createRng(`d${k}`)));
      const dug = new Uint8Array(n);
      const known = new Uint8Array(n);
      dig(b, dug, start);
      for (let round = 0; round < 200; round++) {
        const d = deduce(b, dug, known, true);
        if (!d) break;
        for (const s of d.safe) {
          expect(b.moles[s]).toBe(0);
          dig(b, dug, s);
        }
        for (let i = 0; i < n; i++) if (known[i]) expect(b.moles[i]).toBe(1);
      }
    }
  });
});

describe('generation (no guess needed)', () => {
  it.each(SIZE_IDS)('%s boards pass the quality gates and are reproducible', (size) => {
    const n = SIZES[size].cols * SIZES[size].rows;
    for (const seed of ['a', 'b', 'c']) {
      const start = Math.floor(n / 2) + 1;
      const g = generate(size, start, seed);
      expect(g.origin.src).toBe('gen');
      expect(acceptable(makeBoard(size, g.moles), start)).toBe(true);
      expect(generate(size, start, seed).moles).toEqual(g.moles);
    }
  });

  it('hints alone win every generated board (the solver always has a move)', () => {
    for (const size of SIZE_IDS) {
      const n = SIZES[size].cols * SIZES[size].rows;
      const g = generate(size, 5, `h-${size}`);
      const b = makeBoard(size, g.moles);
      const dug = new Uint8Array(n);
      const flowers = new Uint8Array(n);
      dig(b, dug, 5);
      for (let step = 0; step < 2 * n && popcount(dug) < n - SIZES[size].moles; step++) {
        const h = hint(b, dug, flowers)!;
        expect(h).not.toBeNull();
        if (h.kind === 'dig') {
          expect(b.moles[h.cell]).toBe(0);
          dig(b, dug, h.cell);
        } else {
          expect([h.kind, b.moles[h.cell]]).toEqual(['flower', 1]);
          flowers[h.cell] = 1;
        }
      }
      expect(popcount(dug)).toBe(n - SIZES[size].moles);
    }
  });

  it('a wrong flower is pointed out first', () => {
    const g = generate('garden', 40, 'w');
    const b = makeBoard('garden', g.moles);
    const dug = new Uint8Array(80);
    dig(b, dug, 40);
    const flowers = new Uint8Array(80);
    const safeCovered = [...Array(80).keys()].find((i) => !dug[i] && !b.moles[i])!;
    flowers[safeCovered] = 1;
    expect(hint(b, dug, flowers)).toEqual({ cell: safeCovered, kind: 'misplaced' });
  });
});

describe('save', () => {
  it('bitsets round-trip; wrong lengths and stray high bits are rejected', () => {
    const a = placeMoles('field', 0, createRng('bits'));
    expect(fromBits(toBits(a), a.length)).toEqual(a);
    expect(fromBits(toBits(a), a.length + 8)).toBeNull();
    const garden = new Uint8Array(80);
    garden[79] = 1;
    expect(fromBits(toBits(garden), 79)).toBeNull();
  });

  it('validates runs; the fixtures load; stats track streaks', () => {
    const read = (f: string) =>
      JSON.parse(readFileSync(new URL(`./fixtures/save/${f}`, import.meta.url), 'utf8'));
    const run = read('run.v1.json');
    expect(isRunOrNull(run)).toBe(true);
    expect(isRunOrNull({ ...run, cols: 9 })).toBe(false);
    expect(isRunOrNull({ ...run, dug: run.moles })).toBe(false);
    expect(isStatsV1(read('stats.v1.json'))).toBe(true);
    expect(isPrefsV1(read('prefs.v1.json'))).toBe(true);
    let s = withOutcome(freshStats(), 'field', 'played');
    s = withOutcome(withOutcome(s, 'field', 'won', 90_000), 'field', 'won', 120_000);
    expect(s.field).toMatchObject({ played: 1, won: 2, streak: 2, bestStreak: 2, bestMs: 90_000 });
    expect(withOutcome(s, 'field', 'won', 60_000).field.bestMs).toBe(60_000);
    expect(withOutcome(s, 'field', 'abandoned').field).toMatchObject({
      abandoned: 1,
      streak: 0,
      bestStreak: 2,
    });
  });
});
