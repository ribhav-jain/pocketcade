// Save validation: a damaged or foreign save is rejected, and the undo history survives a round trip.
import { describe, expect, it } from 'vitest';
import { makeLevel, pour, type Pour } from '../src/logic.ts';
import {
  HISTORY_SAVED,
  isProgressV1,
  isRunV1,
  packHistory,
  unpackHistory,
  type RunV1,
} from '../src/save.ts';

function runOf(level: number): RunV1 {
  const lv = makeLevel(level);
  const out = pour(lv.brew, 0, lv.flavours)!;
  return {
    level,
    bottles: out.brew.bottles,
    veil: out.brew.veil,
    moves: 1,
    history: packHistory([out.pour]),
    hint: false,
    extra: false,
  };
}

describe('progress save', () => {
  it('accepts a fresh and a long-running profile', () => {
    expect(isProgressV1({ furthest: 0, level: 1, stars: 0 })).toBe(true);
    expect(isProgressV1({ furthest: 41, level: 42, stars: 97 })).toBe(true);
  });

  it('rejects impossible values', () => {
    expect(isProgressV1({ furthest: 3, level: 9, stars: 4 })).toBe(false);
    expect(isProgressV1({ furthest: 3, level: 4, stars: 10 })).toBe(false);
    expect(isProgressV1({ furthest: -1, level: 1, stars: 0 })).toBe(false);
    expect(isProgressV1({ furthest: 0, level: 0, stars: 0 })).toBe(false);
    expect(isProgressV1(null)).toBe(false);
  });
});

describe('run save', () => {
  it('accepts a level in progress', () => {
    expect(isRunV1(runOf(1))).toBe(true);
    expect(isRunV1(runOf(60))).toBe(true);
  });

  it('rejects damaged shapes', () => {
    const run = runOf(8);
    expect(isRunV1({ ...run, bottles: [[1, 2, 3, 4, 5]], veil: [0] })).toBe(false);
    expect(isRunV1({ ...run, bottles: run.bottles.map((b) => b.map(() => 13)) })).toBe(false);
    expect(isRunV1({ ...run, veil: run.veil.slice(1) })).toBe(false);
    expect(isRunV1({ ...run, history: [0, 1, 2] })).toBe(false);
    expect(isRunV1({ ...run, history: [0, 99, 1, 0, 0] })).toBe(false);
    expect(isRunV1({ ...run, moves: -1 })).toBe(false);
    expect(isRunV1({ ...run, hint: 'no' })).toBe(false);
    expect(isRunV1([])).toBe(false);
  });
});

describe('undo history', () => {
  it('survives packing, and keeps only the most recent pours', () => {
    const pours: Pour[] = Array.from({ length: HISTORY_SAVED + 30 }, (_, i) => ({
      from: i % 5,
      to: (i + 1) % 5,
      n: 1 + (i % 4),
      veilFrom: i % 3,
      veilTo: 0,
    }));
    expect(unpackHistory(packHistory(pours.slice(0, 7)))).toEqual(pours.slice(0, 7));
    const kept = unpackHistory(packHistory(pours));
    expect(kept).toHaveLength(HISTORY_SAVED);
    expect(kept[kept.length - 1]).toEqual(pours[pours.length - 1]);
  });
});
