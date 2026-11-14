import { describe, expect, it } from 'vitest';
import {
  SDK_API_VERSION,
  aspectRange,
  defineGame,
  validateMeta,
  type GameDefinition,
  type GameMeta,
} from '../src/index.ts';

const valid: GameMeta = {
  id: 'test-game',
  apiVersion: SDK_API_VERSION,
  version: '1.0.0',
  inputs: ['keyboard', 'touch'],
  orientation: 'any',
  aspectRatio: 1,
  minSize: { width: 280, height: 280 },
  saveSchemaVersion: 1,
  leaderboards: [{ id: 'best-score', label: 'Best score', order: 'desc', format: 'integer' }],
  pauseKeys: ['Escape'],
};

function withPatch(patch: Record<string, unknown>): unknown {
  return { ...valid, ...patch };
}

const board = valid.leaderboards[0]!;
const fixtures: Array<[code: string, meta: unknown]> = [
  ['id_format', withPatch({ id: 'Bad_Id' })],
  ['id_format', withPatch({ id: 'a'.repeat(33) })],
  ['api_version', withPatch({ apiVersion: 2 })],
  ['version_semver', withPatch({ version: '1.0' })],
  ['inputs_empty', withPatch({ inputs: [] })],
  ['inputs_unknown', withPatch({ inputs: ['gamepad'] })],
  ['inputs_duplicate', withPatch({ inputs: ['touch', 'touch'] })],
  ['orientation_unknown', withPatch({ orientation: 'upside-down' })],
  ['aspect_ratio', withPatch({ aspectRatio: 5 })],
  ['aspect_ratio', withPatch({ aspectRatio: Number.NaN })],
  ['aspect_ratio', withPatch({ aspectRatio: { min: 1.5, max: 1 } })],
  ['aspect_ratio', withPatch({ aspectRatio: { min: 0.1, max: 1 } })],
  ['aspect_ratio', withPatch({ aspectRatio: { min: 1 } })],
  ['min_size', withPatch({ minSize: { width: 0, height: 280 } })],
  ['min_size', withPatch({ minSize: { width: 280.5, height: 280 } })],
  ['save_schema_version', withPatch({ saveSchemaVersion: 0 })],
  ['leaderboard_id', withPatch({ leaderboards: [{ ...board, id: 'Best Score' }] })],
  ['leaderboard_duplicate', withPatch({ leaderboards: [board, board] })],
  ['leaderboard_label', withPatch({ leaderboards: [{ ...board, label: '' }] })],
  ['leaderboard_order', withPatch({ leaderboards: [{ ...board, order: 'up' }] })],
  ['leaderboard_format', withPatch({ leaderboards: [{ ...board, format: 'float' }] })],
  [
    'leaderboards_too_many',
    withPatch({ leaderboards: Array.from({ length: 9 }, (_, i) => ({ ...board, id: `b${i}` })) }),
  ],
  ['pause_keys', withPatch({ pauseKeys: [''] })],
];

describe('validateMeta', () => {
  it('accepts a valid meta', () => {
    expect(validateMeta(valid)).toEqual([]);
  });

  it.each(fixtures)('rejects the %s fixture', (code, meta) => {
    const issues = validateMeta(meta);
    expect(issues.map((i) => i.code)).toContain(code);
  });

  it('accepts aspectRatio fill, a { min, max } range, and an absent pauseKeys', () => {
    const { pauseKeys: _pk, ...rest } = valid;
    expect(validateMeta({ ...rest, aspectRatio: 'fill' })).toEqual([]);
    expect(validateMeta({ ...rest, aspectRatio: { min: 0.5, max: 16 / 9 } })).toEqual([]);
    expect(validateMeta({ ...rest, aspectRatio: { min: 1, max: 1 } })).toEqual([]);
  });

  it('reports a value that is not an object at all', () => {
    expect(validateMeta(null).length).toBeGreaterThan(0);
  });
});

describe('aspectRange', () => {
  it('turns every aspectRatio form into a min/max pair, or null when any shape fits', () => {
    expect(aspectRange(16 / 9)).toEqual({ min: 16 / 9, max: 16 / 9 });
    expect(aspectRange({ min: 0.5, max: 1.25 })).toEqual({ min: 0.5, max: 1.25 });
    expect(aspectRange('fill')).toBeNull();
  });
});

describe('defineGame', () => {
  it('returns the same object', () => {
    const def: GameDefinition = {
      meta: valid,
      create: () => ({ mount: async () => {}, unmount: async () => {}, pause() {}, resume() {} }),
    };
    expect(defineGame(def)).toBe(def);
  });

  it('throws InvalidGameMeta listing every issue (in non-production builds)', () => {
    const def = {
      meta: withPatch({ id: 'X', version: 'x' }),
      create: undefined,
    } as unknown as GameDefinition;
    let caught: unknown;
    try {
      defineGame(def);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    const err = caught as Error;
    expect(err.name).toBe('InvalidGameMeta');
    expect(err.message).toMatch(/id_format/);
    expect(err.message).toMatch(/version_semver/);
    expect(err.message).toMatch(/create_missing/);
  });
});
