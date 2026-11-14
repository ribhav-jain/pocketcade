// The seeded RNG. Saved runs and daily puzzles depend on its exact output, so the vectors below are fixed:
// a change to the algorithm must fail here.
import { describe, expect, it } from 'vitest';
import { createRng, isRngState, randomSeedHex, seedFromString } from '../src/rng.ts';

const GOLDEN: Record<string, number[]> = {
  pocketcade: [
    1310306433, 3872941440, 3717658560, 2890371158, 100448770, 3767878853, 34507727, 2989932270,
    3366742538, 730166340,
  ],
  'sumslide:test': [
    4137292262, 3662023476, 2599160792, 1788255503, 3579190877, 4038074060, 2223175137, 2605659766,
    808323626, 96577174,
  ],
  '': [
    1390569742, 365678437, 1855664522, 506031373, 1127730536, 1537085242, 104032049, 1143494291,
    2749718644, 2409756871,
  ],
};

describe('createRng', () => {
  it.each(Object.entries(GOLDEN))('produces the fixed sequence for seed %j', (seed, expected) => {
    const r = createRng(seed);
    expect(Array.from({ length: 10 }, () => r.nextUint32())).toEqual(expected);
  });

  it('derives the same four-word state from a seed string every time', () => {
    expect(seedFromString('pocketcade')).toEqual([1854001597, 1348995999, 3537388342, 1280347668]);
  });

  it('resumes exactly from a saved state', () => {
    const a = createRng('resume');
    a.next();
    a.next();
    const state = a.state();
    expect(isRngState(state)).toBe(true);
    const b = createRng(state);
    expect(Array.from({ length: 5 }, () => b.nextUint32())).toEqual(
      Array.from({ length: 5 }, () => a.nextUint32()),
    );
  });

  it('int() stays in range, hits both ends and is roughly uniform', () => {
    const r = createRng('int');
    const counts = new Array(6).fill(0) as number[];
    for (let i = 0; i < 60000; i++) {
      const v = r.int(1, 6);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      counts[v - 1]!++;
    }
    for (const c of counts) expect(Math.abs(c - 10000)).toBeLessThan(500);
    expect(() => r.int(3, 2)).toThrow(RangeError);
  });

  it('fork() depends on the root seed and label, not on the position', () => {
    const a = createRng('root');
    const fa = a.fork('x').nextUint32();
    a.next();
    a.next();
    expect(a.fork('x').nextUint32()).toBe(fa);
    expect(a.fork('y').nextUint32()).not.toBe(fa);
  });

  it('shuffle, pick, chance and weighted are deterministic', () => {
    const run = () => {
      const r = createRng('helpers');
      return [
        r.shuffle([1, 2, 3, 4, 5]),
        r.pick(['a', 'b', 'c']),
        r.chance(0.5),
        r.weighted([
          ['x', 1],
          ['y', 3],
        ] as const),
      ];
    };
    expect(run()).toEqual(run());
  });

  it('randomSeedHex returns 16 hex chars', () => {
    expect(randomSeedHex()).toMatch(/^[0-9a-f]{16}$/);
  });
});
