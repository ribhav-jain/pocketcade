// @vitest-environment node
// Basic rules checks for the pure simulation (05 §7): jump arcs, hitboxes, Gulp's two-strike rule, scoring,
// chunk library shape, and an autopilot that must survive 4 minutes of seeded runs (a cheap solvability check).
import { createRng } from '@pocketcade/toolkit';
import { describe, expect, it } from 'vitest';
import { CHUNKS } from '../src/chunks.ts';
import { DEFAULT_STATS, isStatsV1, withRun } from '../src/save.ts';
import { createSim, obstacleBox, type Intents, type Sim } from '../src/sim.ts';
import { SLIDE, STAND, HITBOX } from '../src/tuning.ts';

const started = (seed = 'test') => {
  const sim = createSim(createRng(seed));
  sim.step({ jumpDown: true }); // the first intent only starts the run
  return sim;
};

function apex(holdSteps: number): number {
  const sim = createSim(createRng('apex'), { reel: ['w0', 'b1', 'b2', 'b3', 'b1', 'b2'] });
  sim.step({ slide: true });
  let top = 0;
  sim.step({ jumpDown: true });
  for (let i = 0; i < 80; i++) {
    sim.step(i === holdSteps ? { jumpUp: true } : {});
    top = Math.max(top, sim.h);
  }
  return top;
}

/** The attract policy without its scripted fumbles. */
function autopilot(sim: Sim): Intents {
  const next = sim.next();
  if (sim.move === 'airborne') return next?.kind === 'tins' ? {} : { jumpUp: true };
  if (!next || sim.move === 'fastdrop') return {};
  const at = { pin: 0.16, tins: 0.3, shelf: 0.05 }[next.kind];
  if (next.ttcS > at || next.ttcS <= at - 0.05) return {};
  return next.kind === 'shelf' ? { slide: true } : { jumpDown: true };
}

describe('movement', () => {
  it('jump apex follows the hold: ≈1.53 wu at 80 ms, ≈2.55 wu at 280 ms', () => {
    expect(apex(0)).toBeCloseTo(1.53, 1);
    expect(apex(30)).toBeCloseTo(2.55, 1);
  });
  it('only the sliding hitbox fits under a shelf', () => {
    expect(SLIDE.h).toBeLessThan(HITBOX.shelf.bottom);
    expect(STAND.h).toBeGreaterThan(HITBOX.shelf.bottom);
  });
});

describe('hits and Gulp', () => {
  it('a hit stumbles and resets the multiplier; a second hit while Gulp is near (after invulnerability) is eaten', () => {
    const sim = started();
    const events: string[] = [];
    for (let i = 0; i < 60 * 30 && sim.phase === 'running'; i++)
      for (const e of sim.step({})) events.push(e.type);
    expect(events).toContain('stumble');
    expect(events).toContain('eaten');
    const s = events.indexOf('stumble');
    expect(events.indexOf('eaten')).toBeGreaterThan(s);
  });
  it('eaten ends in "over" after the gulp animation', () => {
    const sim = started();
    let over = false;
    for (let i = 0; i < 60 * 60 && !over; i++) over = sim.step({}).some((e) => e.type === 'over');
    expect(over).toBe(true);
    expect(sim.phase).toBe('over');
  });
});

describe('autopilot survives seeded runs (chunk solvability smoke test)', () => {
  it.each(['a', 'b', 'c'])(
    'seed %s: 4 minutes without a stumble, crumbs and multiplier grow',
    (seed) => {
      const sim = started(seed);
      let stumbles = 0;
      for (let i = 0; i < 60 * 240; i++)
        for (const e of sim.step(autopilot(sim))) if (e.type === 'stumble') stumbles++;
      expect(stumbles).toBe(0);
      expect(sim.metres).toBeGreaterThan(2400);
      expect(sim.crumbs).toBeGreaterThan(50);
      expect(sim.points).toBeGreaterThan(sim.metres);
    },
  );
});

describe('chunk library', () => {
  it('has the PRD mix: 30 obstacle chunks, warm-up and 3 breathers', () => {
    const byDifficulty = [1, 2, 3, 4, 5].map(
      (d) => CHUNKS.filter((c) => c.difficulty === d).length,
    );
    expect(byDifficulty).toEqual([6, 7, 7, 6, 4]);
    expect(CHUNKS.filter((c) => c.difficulty === 0).map((c) => c.id)).toEqual([
      'w0',
      'b1',
      'b2',
      'b3',
    ]);
  });
  it('tins only appear from tier 2', () => {
    for (const c of CHUNKS)
      if (c.obstacles.some((o) => o.kind === 'tins'))
        expect(c.minTier, c.id).toBeGreaterThanOrEqual(2);
  });
  it('obstacle hitboxes are narrower than their visuals', () => {
    for (const kind of ['pin', 'tins'] as const) {
      const b = obstacleBox({ id: 0, kind, x: 0, w: HITBOX[kind].visualW, knocked: false });
      expect(b.x1 - b.x0).toBeLessThan(HITBOX[kind].visualW);
    }
  });
});

describe('stats save', () => {
  it('folds a run into the device stats', () => {
    const s = withRun(DEFAULT_STATS, {
      points: 900,
      metres: 400,
      crumbs: 30,
      maxMultiplier: 3,
      at: '2026-11-10T00:00:00.000Z',
    });
    expect(s).toMatchObject({
      runs: 1,
      bestPoints: 900,
      bestMetres: 400,
      bestMultiplier: 3,
      totalCrumbs: 30,
    });
    expect(isStatsV1(s)).toBe(true);
    expect(isStatsV1({ ...s, bestMultiplier: 6 })).toBe(false);
  });
});
