// @vitest-environment node
// Rules checks: the difficulty curve, judgement bands and scoring, lockout, passed stars, fair star placement,
// drifting stars, pause and resume, the clock probe, the save guard, and the pinned attract reel.
import { readFileSync } from 'node:fs';
import { createRng } from '@pocketcade/toolkit';
import { describe, expect, it } from 'vitest';
import {
  ATTRACT_LAST_HIT,
  ATTRACT_SEED,
  ATTRACT_START,
  ATTRACT_STILL_STEP,
  attract,
  attractPressStep,
} from '../src/attract.ts';
import {
  clockGranularity,
  createRun,
  judge,
  lapMs,
  leadRange,
  LOCKOUT_MS,
  MIN_LEAD_MS,
  PASS_GRACE_MS,
  perfectMs,
  REVERSE_LEAD_MS,
  runSeed,
  windowMs,
  ZONE_HITS,
  type Run,
  type RunEvent,
} from '../src/rules.ts';
import { isStats, scoreMeta, statsDefaults, withRun } from '../src/save.ts';

const STEP = 1000 / 60;
const mod360 = (a: number) => ((a % 360) + 360) % 360;

describe('difficulty curve', () => {
  it('speeds up and tightens to a floor', () => {
    const rows: Array<[number, number, number, number]> = [
      [0, 2400, 110, 37],
      [10, 1863, 81, 28],
      [20, 1446, 60, 20],
      [26, 1250, 55, 19],
      [80, 1250, 55, 19],
    ];
    for (const [n, T, W, P] of rows)
      expect([lapMs(n), windowMs(n), perfectMs(n)]).toEqual([T, W, P]);
  });

  it('a coarse clock raises the Perfect floor but never past the window', () => {
    let i = 0;
    const g = clockGranularity(() => Math.floor(i++ / 7) * 16.67);
    expect(g).toBeCloseTo(16.67, 5);
    expect(perfectMs(80, 30)).toBe(30);
    for (let n = 0; n < 100; n++) expect(perfectMs(n, 80)).toBeLessThanOrEqual(windowMs(n));
  });

  it('judges by bands', () => {
    expect([
      judge(0, 0),
      judge(37, 0),
      judge(-38, 0),
      judge(110, 0),
      judge(-111, 0),
      judge(111, 0),
    ]).toEqual(['perfect', 'perfect', 'good', 'good', 'early', 'late']);
  });

  it('a new star is always far enough away in time to react to', () => {
    for (let n = 0; n < 100; n++) {
      for (const reversed of [false, true]) {
        const [lo, hi] = leadRange(n, reversed);
        expect((lo * lapMs(n)) / 360).toBeGreaterThanOrEqual(
          reversed ? REVERSE_LEAD_MS : MIN_LEAD_MS,
        );
        expect(lo).toBeLessThan(hi);
      }
    }
  });
});

/** Presses `offset` ms from each arrival, judging hit by hit. */
const pressAt = (run: Run, offset: number): RunEvent[] => run.press(run.arrival() + offset);

describe('a run', () => {
  const fresh = (seed = 'tap:test') => {
    const run = createRun(createRng(seed));
    run.press(1000); // the first input starts the run without a judgement
    return run;
  };

  it('starts with Pip at 0° and the first star at 180°, arriving after half a lap', () => {
    const run = fresh();
    expect(run.phase).toBe('running');
    expect(run.dotAngle).toBe(180);
    expect(run.arrival()).toBe(1000 + 1200);
    expect(run.pipAt(1600)).toBeCloseTo(90, 9);
  });

  it('scores P, P, P, P, P, G, P as 22 with a longest chain of 5', () => {
    const run = fresh();
    for (const off of [0, 0, 0, 0, 0, windowMs(5) - 1, 0])
      expect(pressAt(run, off)[0]?.type).toBe('hit');
    expect(run.score).toBe(22);
    expect(run.longestChain).toBe(5);
    expect(run.n).toBe(7);
  });

  it('ignores presses inside the lockout; an early press after it ends the run', () => {
    const run = fresh();
    const hitAt = run.arrival();
    run.press(hitAt);
    expect(run.press(hitAt + LOCKOUT_MS - 1)).toEqual([]);
    expect(run.press(hitAt + LOCKOUT_MS)).toEqual([
      { type: 'miss', end: 'early', dt: expect.any(Number) },
    ]);
    expect(run.phase).toBe('missed');
    expect(run.press(hitAt + 5000)).toEqual([]);
  });

  it('declares a passed star only after the window plus the grace', () => {
    const run = fresh();
    const late = run.arrival() + windowMs(0) + PASS_GRACE_MS;
    expect(run.tick(late)).toEqual([]);
    expect(run.tick(late + 1)[0]).toMatchObject({ type: 'miss', end: 'passed' });
    expect(run.end).toBe('passed');
  });

  it('a late press stamped inside the window still counts', () => {
    const run = fresh();
    expect(pressAt(run, windowMs(0))[0]).toMatchObject({ type: 'hit', judgement: 'good' });
  });

  it('pausing freezes Pip and the star; resuming re-bases and moves a near star 180° ahead', () => {
    const run = fresh();
    const near = run.arrival() - 100;
    const angle = run.pipAt(near);
    expect(run.freeze(near)).toBe(true);
    expect(run.press(near + 10)).toEqual([]);
    expect(run.pipAt(near + 60_000)).toBe(angle);
    expect(run.dotAt(near + 60_000)).toBe(180);
    run.unfreeze(near + 60_000);
    expect(run.pipAt(near + 60_000)).toBeCloseTo(angle, 9);
    expect(run.dotAngle).toBeCloseTo((angle + 180) % 360, 9);
    expect(run.arrival() - (near + 60_000)).toBeGreaterThanOrEqual(MIN_LEAD_MS);
  });

  it('places every star a fair time ahead, reverses only after the first zone and never twice in a row', () => {
    for (const seed of ['tap:a', 'tap:b', 'tap:c']) {
      const run = fresh(seed);
      const flips: number[] = [];
      let drifting = 0;
      for (let i = 0; i < 120; i++) {
        const hitAt = run.arrival();
        const [e] = run.press(hitAt);
        if (e?.type !== 'hit') throw new Error('expected a hit');
        expect(e.zoneUp).toBe(run.n % ZONE_HITS === 0);
        if (e.reversed) flips.push(run.n);
        const lead = run.arrival() - hitAt;
        expect(lead).toBeGreaterThanOrEqual((e.reversed ? REVERSE_LEAD_MS : MIN_LEAD_MS) - 1e-6);
        expect(lead).toBeLessThan(lapMs(run.n));
        if (run.drift !== 0) {
          drifting++;
          expect(run.n).toBeGreaterThanOrEqual(2 * ZONE_HITS);
          expect(e.reversed).toBe(false);
          // the star starts ahead of Pip, not right behind it, and reaches the meeting point on time
          const gap = mod360((run.dotAt(hitAt) - run.pipAt(hitAt)) * run.dir);
          expect(gap).toBeGreaterThan(45);
          expect(gap).toBeLessThanOrEqual(300.001);
          const meet = run.arrival();
          expect(mod360(run.dotAt(meet) - run.pipAt(meet) + 180) - 180).toBeCloseTo(0, 6);
        }
      }
      expect(flips.length).toBeGreaterThan(0);
      expect(Math.min(...flips)).toBeGreaterThanOrEqual(ZONE_HITS);
      for (let i = 1; i < flips.length; i++) expect(flips[i]! - flips[i - 1]!).toBeGreaterThan(1);
      expect(drifting).toBeGreaterThan(0);
    }
  });

  it('a drifting star stops where it is when the game is paused and resumed', () => {
    const run = fresh('tap:a');
    while (run.drift === 0) pressAt(run, 0);
    const t = run.arrival() - 500;
    const star = run.dotAt(t);
    run.freeze(t);
    expect(run.dotAt(t + 9000)).toBe(star);
    run.unfreeze(t + 9000);
    expect(run.drift).toBe(0);
    expect(run.arrival() - (t + 9000)).toBeGreaterThanOrEqual(MIN_LEAD_MS);
  });
});

describe('save', () => {
  it('validates defaults and the fixture; folds a run into the stats', () => {
    expect(isStats(statsDefaults())).toBe(true);
    const fixture = JSON.parse(
      readFileSync(new URL('./fixtures/save/stats.v1.json', import.meta.url), 'utf8'),
    );
    expect(isStats(fixture)).toBe(true);
    expect(isStats({ ...fixture, lastRun: { ...fixture.lastRun, meanOffsetMs: 1001 } })).toBe(
      false,
    );
    const s = withRun(statsDefaults(), {
      score: 22,
      hits: 25,
      perfects: 6,
      longestChain: 5,
      meanOffsetMs: -3,
      end: 'late',
    });
    expect(s).toMatchObject({ best: 22, bestHits: 25, runs: 1, lastRun: { end: 'late' } });
    expect(isStats(s)).toBe(true);
  });

  it('drops per-hit offsets when the score data would pass 2 KiB', () => {
    const run = { hits: 300, perfects: 0, longestChain: 0 };
    const worst = scoreMeta('0123456789abcdef', { ...run, dts: Array(300).fill(-110) });
    expect(JSON.stringify(worst).length).toBeLessThanOrEqual(2048);
    expect(
      scoreMeta('0123456789abcdef', { ...run, dts: Array(300).fill(-123456) }),
    ).not.toHaveProperty('dt');
    expect(
      scoreMeta('0123456789abcdef', { hits: 2, perfects: 1, longestChain: 1, dts: [3, -9] }),
    ).toHaveProperty('dt', [3, -9]);
  });
});

/** The attract reel as the scene runs it: a seeded run from 16 hits in, on the step clock. */
function reel(seed: string, steps: number) {
  const run = createRun(createRng(runSeed(createRng(seed))), { from: ATTRACT_START });
  run.start(0);
  let hits = 0;
  const log: Array<{ step: number; e: RunEvent }> = [];
  const gapAt: number[] = [];
  for (let step = 0; step < steps && run.phase === 'running'; step++) {
    const view = { arrivalStep: Math.round((run.arrival() * 60) / 1000), hits };
    if (step === attractPressStep(view)) {
      for (const e of run.press(step * STEP)) {
        log.push({ step, e });
        if (e.type === 'hit') hits++;
      }
    }
    const t = (step + 1) * STEP;
    for (const e of run.tick(t)) log.push({ step, e });
    gapAt[step + 1] = mod360((run.dotAt(t) - run.pipAt(t)) * run.dir);
  }
  return { log, hits, gapAt };
}

describe('attract reel', () => {
  it('the clip shows Perfect and Good hits, a reversal and a new zone; the still has Pip just short of the star', () => {
    expect(attract.seed).toBe(ATTRACT_SEED);
    const { log, hits, gapAt } = reel(ATTRACT_SEED, 10_000);
    const clip = log.flatMap((l) =>
      l.step >= 60 && l.step < 240 && l.e.type === 'hit' ? l.e : [],
    );
    expect(clip.length).toBeGreaterThanOrEqual(3);
    expect(clip.some((e) => e.judgement === 'perfect')).toBe(true);
    expect(clip.some((e) => e.judgement === 'good')).toBe(true);
    expect(clip.some((e) => e.reversed)).toBe(true);
    expect(clip.some((e) => e.zoneUp)).toBe(true);
    expect(gapAt[ATTRACT_STILL_STEP]).toBeGreaterThan(10);
    expect(gapAt[ATTRACT_STILL_STEP]).toBeLessThan(24);
    expect(hits).toBe(ATTRACT_LAST_HIT);
    expect(log.at(-1)?.e).toMatchObject({ type: 'miss', end: 'early' });
  });
});
