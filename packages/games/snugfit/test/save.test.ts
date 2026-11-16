// The save validators accept the fixtures and reject corrupt games; the attract opening is a legal quilt.
import { readFileSync } from 'node:fs';
import type { Json } from '@pocketcade/sdk';
import { describe, expect, it } from 'vitest';
import { OPENING } from '../src/attract.ts';
import { CELLS, SHAPES, bestMove, linesAfter } from '../src/logic.ts';
// Named gameMeta: Vite's SSR transform mis-rewrites import.meta when a binding is called meta.
import { meta as gameMeta } from '../src/meta.ts';
import { isProfileV1, isRunV1 } from '../src/save.ts';

const fixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/save/${name}`, import.meta.url), 'utf8')) as {
    v: number;
    data: { [key: string]: Json };
  };

describe('save fixtures', () => {
  it('run.v1.json and profile.v1.json pass validation', () => {
    const run = fixture('run.v1.json');
    const profile = fixture('profile.v1.json');
    expect(isRunV1(run.data)).toBe(true);
    expect(run.v).toBe(gameMeta.saveSchemaVersion);
    expect(isProfileV1(profile.data)).toBe(true);
  });

  it('rejects corrupt games', () => {
    const run = fixture('run.v1.json').data;
    const board = run.board as number[];
    const hand = run.hand as Json[];
    expect(isRunV1({ ...run, board: board.slice(1) })).toBe(false);
    expect(isRunV1({ ...run, board: [9, ...board.slice(1)] })).toBe(false);
    expect(isRunV1({ ...run, hand: [null, null, null] })).toBe(false);
    expect(isRunV1({ ...run, hand: [{ shape: SHAPES.length, colour: 1 }, ...hand.slice(1)] })).toBe(
      false,
    );
    expect(isRunV1({ ...run, score: -1 })).toBe(false);
    expect(isRunV1({ ...run, rng: [1, 2, 3] })).toBe(false);
    expect(isRunV1({ ...run, phase: 'done' })).toBe(false);
    expect(isProfileV1({ best: -5 })).toBe(false);
  });
});

describe('attract opening', () => {
  it('is a legal quilt whose first greedy move stitches three rows at once', () => {
    expect(OPENING.board).toHaveLength(CELLS);
    const move = bestMove(OPENING)!;
    const shape = SHAPES[OPENING.hand[move.slot]!.shape]!;
    expect(linesAfter(OPENING.board, shape, move.col, move.row).rows).toEqual([5, 6, 7]);
  });
});
