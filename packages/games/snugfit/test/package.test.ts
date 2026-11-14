// @vitest-environment node
// The package imports without a DOM, timers or Phaser; the rules module stays pure; the save fixtures validate.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { OPENING } from '../src/attract.ts';
import { CELLS, SHAPES, bestMove, linesAfter } from '../src/logic.ts';
// Named gameMeta: Vite's SSR transform mis-rewrites import.meta when a binding is called meta.
import { meta as gameMeta } from '../src/meta.ts';
import { isProfileV1, isRunV1 } from '../src/save.ts';

vi.mock('phaser', () => {
  throw new Error('phaser must not be imported at module load');
});

const root = fileURLToPath(new URL('..', import.meta.url));

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

const fixture = (name: string) =>
  JSON.parse(readFileSync(join(root, 'test/fixtures/save', name), 'utf8')) as {
    v: number;
    data: Record<string, unknown>;
  };

describe('package import', () => {
  it('imports in Node without a DOM, timers or Phaser, and exposes meta', async () => {
    expect(typeof (globalThis as { window?: unknown }).window).toBe('undefined');
    const timers = vi.spyOn(globalThis, 'setTimeout');
    const mod = await import('../src/index.ts');
    expect(timers).not.toHaveBeenCalled();
    expect(mod.default.meta).toEqual(gameMeta);
    expect(typeof mod.default.create).toBe('function');
  });

  it('logic.ts has only type imports and no DOM globals', () => {
    const src = readFileSync(join(root, 'src', 'logic.ts'), 'utf8');
    for (const line of src.split('\n').filter((l) => l.startsWith('import ')))
      expect(line).toMatch(/^import type /);
    expect(src).not.toMatch(/\b(window|document|localStorage|navigator)\b/);
  });

  it('every phaser import in src is type-only', () => {
    for (const f of files(join(root, 'src'))) {
      for (const line of readFileSync(f, 'utf8').split('\n')) {
        if (/from 'phaser'/.test(line)) expect(line).toMatch(/^import type /);
      }
    }
  });
});

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
    const hand = run.hand as unknown[];
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
