// @vitest-environment node
// Rules checks for the pure simulation: the fixed track and its lookups, the projection, the countdown, speed and
// steering (curve push, off-road), traffic, crashes and the ghost window, overtakes, checkpoints and the clock, the
// autopilot on the fixed track, and the save guards.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRng } from '@pocketcade/toolkit';
import { describe, expect, it } from 'vitest';
import { autopilot } from '../src/attract.ts';
import { freshStats, isStatsV1, withRun } from '../src/save.ts';
import {
  CAR_LEN,
  COUNTDOWN_MS,
  CRASH_KEEP,
  GHOST_MS,
  LANE_CHANGE_MS,
  HIT_X,
  MAX_SPEED,
  OFFROAD_SPEED,
  START_TIME_MS,
  STEP_MS,
  TRAFFIC_MAX,
  WOBBLE_MS,
  X_LIMIT,
  bonusMs,
  createRun,
  type Car,
  type Run,
  type SimEvent,
} from '../src/sim.ts';
import {
  CAM_H,
  DRAW,
  LANE_X,
  LEG,
  LINE_CP,
  LINE_START,
  PLAYER_DIST,
  ROAD_HALF,
  SEG,
  START_Z,
  VIEW,
  checkpointZ,
  createTrack,
  curveAt,
  heightAt,
  project,
  segmentAt,
  stageOfLeg,
  themeAtZ,
  type Track,
} from '../src/track.ts';

const track = createTrack();
const run = (seed = 't') => createRun(createRng(seed), track);
/** A run past the countdown. */
function racing(seed = 't'): Run {
  const r = run(seed);
  while (r.phase === 'countdown') r.step(0, false);
  return r;
}
/** Steps n times with fixed inputs; returns every event. */
function steps(r: Run, n: number, steer = 0, brake = false): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < n; i++) all.push(...r.step(steer, brake));
  return all;
}
const types = (events: SimEvent[]) => events.map((e) => e.type);
/**
 * Moves a racing run to z with the next checkpoint the first one ahead, steps once (so traffic spawns from there,
 * far ahead) and clears the traffic.
 */
function at(r: Run, z: number): Run {
  r.z = z;
  r.nextCp = 0;
  while (checkpointZ(r.nextCp) <= z) r.nextCp++;
  r.stage = stageOfLeg(r.nextCp);
  r.step(0, true);
  for (const c of r.cars) c.on = false;
  return r;
}
/** z of a straight, flat stretch at least `len` m long, after `from`. */
function straightAt(t: Track, from: number, len = 120): number {
  for (let z = from; ; z += SEG) {
    let ok = true;
    for (let d = 0; d < len && ok; d += SEG) ok = curveAt(t, z + d) === 0;
    if (ok) return z;
  }
}
/** The first car slot, set up as given. */
function car(r: Run, c: Partial<Car>): Car {
  const k = r.cars[0]!;
  Object.assign(k, {
    on: true,
    z: r.z + 20,
    x: 0,
    speed: 30,
    cruise: 30,
    kind: 0,
    from: 1,
    to: 1,
    t: 1,
    next: 9999,
    passed: false,
    hit: false,
    minDx: 9,
    ...c,
  });
  return k;
}

describe('track', () => {
  it('is the same on every build (fixed seed)', () => {
    const b = createTrack();
    expect(b.n).toBe(track.n);
    expect(Array.from(b.curve)).toEqual(Array.from(track.curve));
    expect(Array.from(b.y)).toEqual(Array.from(track.y));
    expect(Array.from(b.prop)).toEqual(Array.from(track.prop));
    expect(Array.from(b.propX)).toEqual(Array.from(track.propX));
  });

  it('has straights, curves of every sharpness both ways, hills and dips', () => {
    const c = Array.from(track.curve);
    expect(c.every((v) => Math.abs(v) <= 3)).toBe(true);
    for (const k of [1, 2, 3]) {
      expect(c.some((v) => v === k)).toBe(true);
      expect(c.some((v) => v === -k)).toBe(true);
    }
    expect(c.filter((v) => v === 0).length).toBeGreaterThan(track.n * 0.15);
    const y = Array.from(track.y);
    expect(Math.max(...y)).toBeGreaterThan(10);
    expect(Math.min(...y)).toBeLessThan(-5);
    expect(Math.max(...y.map(Math.abs))).toBeLessThanOrEqual(26);
  });

  it('starts straight and flat, and every hill eases in and out', () => {
    for (let z = 0; z < START_Z + 150; z += SEG) {
      expect(curveAt(track, z)).toBe(0);
      expect(heightAt(track, z)).toBe(0);
    }
    // no cliffs: the slope stays gentle
    for (let i = 0; i < track.n; i++)
      expect(Math.abs(track.y[i + 1]! - track.y[i]!)).toBeLessThan(SEG * 0.5);
  });

  it('marks the start line and every checkpoint with a two-row checkered line', () => {
    const at = (z: number) => segmentAt(track, z);
    expect(track.line[at(START_Z)]).toBe(LINE_START);
    expect(track.line[at(START_Z) + 1]).toBe(LINE_START + 1);
    for (const k of [0, 1, 5]) {
      expect(track.line[at(checkpointZ(k))]).toBe(LINE_CP);
      expect(track.line[at(checkpointZ(k)) + 1]).toBe(LINE_CP + 1);
    }
    expect(checkpointZ(1) - checkpointZ(0)).toBe(LEG);
  });

  it('cycles coast → canyon → city every two checkpoints', () => {
    expect(themeAtZ(START_Z)).toBe(0);
    expect(themeAtZ(checkpointZ(0) + 1)).toBe(0);
    expect(themeAtZ(checkpointZ(1) + 1)).toBe(1);
    expect(themeAtZ(checkpointZ(3) + 1)).toBe(2);
    expect(themeAtZ(checkpointZ(5) + 1)).toBe(0);
    expect(themeAtZ(checkpointZ(1) - 1)).toBe(0);
    // props follow the theme: cacti only in the canyon, streetlights only in the city
    for (let i = 0; i < 4000; i++) {
      const kinds = [track.prop[i * 2], track.prop[i * 2 + 1]];
      if (kinds.includes(5)) expect(track.theme[i]).toBe(1);
      if (kinds.includes(9)) expect(track.theme[i]).toBe(2);
    }
  });

  it('keeps props off the drivable road', () => {
    for (let i = 0; i < track.n * 2; i++)
      if (track.prop[i]) expect(Math.abs(track.propX[i]!)).toBeGreaterThan(X_LIMIT + 0.3);
  });
});

describe('segment lookup and projection', () => {
  it('finds the segment at z, wrapping past the end and before the start', () => {
    expect(segmentAt(track, 0)).toBe(0);
    expect(segmentAt(track, SEG * 3 + 0.5)).toBe(3);
    expect(segmentAt(track, track.n * SEG + SEG * 2)).toBe(2);
    expect(segmentAt(track, -SEG / 2)).toBe(track.n - 1);
  });

  it('interpolates the height between a segment’s edges', () => {
    const i = track.y.findIndex((v, k) => v !== track.y[k + 1]);
    const z = i * SEG + SEG / 4;
    expect(heightAt(track, z)).toBeCloseTo(track.y[i]! * 0.75 + track.y[i + 1]! * 0.25, 5);
  });

  it('puts the road under the car at the bottom of the view, as wide as the projection says', () => {
    const p = project({ x: 0, y: 0, w: 0, s: 0 }, 0, 0, PLAYER_DIST, 0, CAM_H);
    expect(p.s).toBeCloseTo(1 / CAM_H, 6);
    expect(p.x).toBeCloseTo(VIEW.w / 2, 6);
    expect(p.y).toBeCloseTo(VIEW.horizon + VIEW.h / 2, 6);
    expect(p.w).toBeCloseTo((ROAD_HALF / CAM_H) * (VIEW.w / 2), 6);
  });

  it('shrinks with distance toward the horizon, and shifts with the camera and the road', () => {
    const near = project({ x: 0, y: 0, w: 0, s: 0 }, 0, 0, 10, 0, CAM_H);
    const far = project({ x: 0, y: 0, w: 0, s: 0 }, 0, 0, 20, 0, CAM_H);
    expect(far.w).toBeCloseTo(near.w / 2, 6);
    expect(far.y - VIEW.horizon).toBeCloseTo((near.y - VIEW.horizon) / 2, 6);
    const horizon = project({ x: 0, y: 0, w: 0, s: 0 }, 0, 0, DRAW * SEG * 1000, 0, CAM_H);
    expect(horizon.y).toBeCloseTo(VIEW.horizon, 1);
    // the camera moved right: the road slides left; a hill ahead rises on screen
    expect(project({ x: 0, y: 0, w: 0, s: 0 }, 0, 0, 10, 3, CAM_H).x).toBeLessThan(VIEW.w / 2);
    expect(project({ x: 0, y: 0, w: 0, s: 0 }, 0, 5, 10, 0, CAM_H).y).toBeLessThan(near.y);
  });
});

describe('countdown and speed', () => {
  it('counts 3, 2, 1, then Go after the countdown, without moving', () => {
    const r = run();
    const ev = steps(r, Math.ceil(COUNTDOWN_MS / STEP_MS) - 1);
    expect(ev.filter((e) => e.type === 'count').map((e) => (e as { n: number }).n)).toEqual([
      3, 2, 1,
    ]);
    expect(r.phase).toBe('countdown');
    expect(r.z).toBe(START_Z);
    expect(types(steps(r, 2))).toContain('go');
    expect(r.phase).toBe('racing');
    expect(r.timeLeftMs).toBeGreaterThan(START_TIME_MS - 100);
  });

  it('auto-throttles up to top speed, and the brake slows down', () => {
    const r = racing();
    for (let i = 0; i < 60 * 8; i++) {
      for (const c of r.cars) c.on = false;
      r.step(autopilot(r).steer, false);
    }
    expect(r.speed).toBe(MAX_SPEED);
    steps(r, 30, 0, true);
    expect(r.speed).toBeLessThan(MAX_SPEED * 0.75);
    expect(r.braking).toBe(true);
  });

  it('steers faster at speed', () => {
    const slow = at(racing(), straightAt(track, 5000));
    slow.speed = MAX_SPEED / 4;
    steps(slow, 10, 1, true);
    const fast = at(racing(), straightAt(track, 5000));
    fast.speed = MAX_SPEED;
    steps(fast, 10, 1);
    expect(fast.x).toBeGreaterThan(slow.x * 3);
  });
});

describe('curves and off-road', () => {
  /** z inside a held section of curve `c`. */
  function curveZ(c: number): number {
    for (let z = 2000; ; z += SEG)
      if (curveAt(track, z) === c && curveAt(track, z + 20) === c) return z;
  }

  it('pushes the car outward in a curve, in proportion to speed²', () => {
    const push = (c: number, speed: number) => {
      const r = at(racing(), curveZ(c));
      r.x = 0;
      r.speed = speed;
      r.step(0, true); // braking: the speed stays put for the comparison
      return r.x;
    };
    expect(push(2, MAX_SPEED)).toBeLessThan(0); // a right bend pushes left
    expect(push(-2, MAX_SPEED)).toBeGreaterThan(0);
    const full = push(3, MAX_SPEED);
    const half = push(3, MAX_SPEED / 2);
    expect(half / full).toBeCloseTo(0.25, 1);
    expect(Math.abs(push(3, MAX_SPEED))).toBeGreaterThan(Math.abs(push(1, MAX_SPEED)));
  });

  it('slows down gently off the road to a low cap, and keeps the car near the road', () => {
    const r = at(racing(), straightAt(track, 3000));
    r.speed = MAX_SPEED;
    r.x = 1.4;
    r.step(0, false);
    expect(r.offroad).toBe(true);
    expect(r.speed).toBeGreaterThan(MAX_SPEED - 1);
    steps(r, 60);
    expect(r.speed).toBeLessThan(MAX_SPEED * 0.7);
    steps(r, 120);
    expect(r.speed).toBe(OFFROAD_SPEED);
    steps(r, 120, 1);
    expect(r.x).toBe(X_LIMIT);
    // back on the road the throttle takes over again
    r.x = 0.5;
    steps(r, 60);
    expect(r.offroad).toBe(false);
    expect(r.speed).toBeGreaterThan(OFFROAD_SPEED + 5);
  });
});

describe('traffic', () => {
  it('drives forward in lanes slower than Miso’s top speed, spawned from the run seed', () => {
    const a = run('x');
    const b = run('x');
    const on = (r: Run) => r.cars.filter((c) => c.on).map((c) => [c.z, c.x, c.kind, c.cruise]);
    expect(on(a)).toEqual(on(b));
    expect(on(a)).not.toEqual(on(run('y')));
    const r = racing();
    expect(r.cars.filter((c) => c.on).length).toBeGreaterThan(2);
    for (const c of r.cars.filter((c) => c.on)) {
      if (c.t >= 1) expect(LANE_X).toContain(c.x);
      expect(c.cruise).toBeLessThanOrEqual(TRAFFIC_MAX);
      expect(c.z).toBeGreaterThan(r.z);
      const z = c.z;
      r.step(0, true);
      if (c.on) expect(c.z).toBeGreaterThan(z);
    }
  });

  it('changes lanes now and then, smoothly, and rarely walls off the road, never for long', () => {
    let changes = 0;
    let longest = 0;
    let walled = 0;
    let total = 0;
    for (const seed of ['l1', 'l2', 'l3']) {
      const r = racing(seed);
      let wall = 0;
      for (let i = 0; i < 60 * 90 && r.phase !== 'over'; i++, total++) {
        const d = autopilot(r);
        r.step(d.steer, d.brake);
        for (const c of r.cars)
          if (c.on && c.t > 0 && c.t < 1) {
            if (c.t < STEP_MS / LANE_CHANGE_MS + 1e-9) changes++;
            expect(Math.abs(c.x)).toBeLessThanOrEqual(LANE_X[2]);
          }
        // three cars across the road within a car length of each other, ahead of Miso
        const on = r.cars.filter((c) => c.on && c.z > r.z);
        const isWall = on.some(
          (a) =>
            new Set(on.filter((b) => Math.abs(b.z - a.z) < CAR_LEN).map((b) => b.to)).size === 3,
        );
        wall = isWall ? wall + 1 : 0;
        if (isWall) walled++;
        longest = Math.max(longest, wall);
      }
    }
    expect(changes).toBeGreaterThan(10);
    // a wall breaks up within a few seconds, and Miso always sees it coming (it forms ahead)
    expect(walled / total).toBeLessThan(0.02);
    expect(longest * STEP_MS).toBeLessThan(3500);
  });

  it('slows behind a slower car in its lane', () => {
    const r = at(racing(), 5000);
    const lead = car(r, { z: r.z + 200, speed: 24, cruise: 24 });
    const k = r.cars[1]!;
    Object.assign(k, { ...lead, z: lead.z - 10, cruise: 38, speed: 38, next: 9999 });
    steps(r, 5);
    expect(k.speed).toBe(24);
  });
});

describe('crashes and overtakes', () => {
  /** A racing run at top speed on a straight with one car in the middle lane just ahead. */
  function setup(dz = 3, x = 0): { r: Run; c: Car } {
    const r = at(racing(), straightAt(track, 4000));
    r.speed = MAX_SPEED;
    r.x = x;
    const c = car(r, { z: r.z + dz });
    return { r, c };
  }

  it('cuts speed to 30 %, wobbles without steering, then is a ghost for about a second', () => {
    const { r, c } = setup();
    const ev = r.step(0, false);
    expect(types([...ev])).toContain('crash');
    expect(r.speed).toBeCloseTo(MAX_SPEED * CRASH_KEEP, 5);
    expect(r.crashes).toBe(1);
    expect(c.hit).toBe(true);
    expect(r.wobbleMs).toBeGreaterThan(WOBBLE_MS - 20);
    // no steering and no throttle while wobbling
    const x = r.x;
    const v = r.speed;
    r.step(1, false);
    expect(r.x).toBeCloseTo(x, 5);
    expect(r.speed).toBeLessThanOrEqual(v);
    expect(r.steer).toBe(0);
    // a second car during the ghost window: no crash
    steps(r, Math.ceil(WOBBLE_MS / STEP_MS));
    const other = car(r, { z: r.z + 1, x: r.x });
    expect(types(steps(r, 3))).not.toContain('crash');
    expect(r.ghostMs).toBeGreaterThan(0);
    other.on = false;
    // once the ghost window is over, a car hits again
    steps(r, Math.ceil(GHOST_MS / STEP_MS));
    expect(r.ghostMs).toBe(0);
    car(r, { z: r.z + 1, x: r.x });
    expect(types(steps(r, 2))).toContain('crash');
    expect(r.crashes).toBe(2);
  });

  it('only crashes when the cars overlap across the road', () => {
    const { r } = setup(3, HIT_X + 0.05);
    expect(types(steps(r, 5))).not.toContain('crash');
  });

  it('counts a clean pass as an overtake, a close one as a near miss', () => {
    const near = setup(20, 0.4);
    const ev = steps(near.r, 120);
    expect(ev).toContainEqual({ type: 'overtake', near: true });
    expect(near.r.overtakes).toBe(1);
    expect(near.r.nearMisses).toBe(1);
    const wide = setup(20, -0.66);
    wide.c.x = 0.66;
    expect(steps(wide.r, 120)).toContainEqual({ type: 'overtake', near: false });
    const hit = setup(3);
    steps(hit.r, 200);
    expect(hit.r.overtakes).toBe(0);
  });

  it('a passed car never catches back up', () => {
    const { r, c } = setup(20, 0.66);
    c.x = 0;
    c.cruise = c.speed = 38;
    steps(r, 90);
    expect(c.passed).toBe(true);
    r.speed = 5;
    steps(r, 30, 0, true);
    if (c.on) expect(c.z).toBeLessThan(r.z);
  });
});

describe('checkpoints and the clock', () => {
  it('adds time at each checkpoint, a little less each stage, and moves the stage on every second one', () => {
    const r = at(racing(), checkpointZ(0) - 0.5);
    r.speed = MAX_SPEED;
    const t0 = r.timeLeftMs;
    const ev = r.step(0, false);
    expect(ev).toContainEqual({
      type: 'checkpoint',
      index: 0,
      bonusMs: 30_000,
      stage: 0,
      newStage: false,
    });
    expect(r.timeLeftMs).toBeCloseTo(t0 - STEP_MS + 30_000, 5);
    expect(r.nextCp).toBe(1);
    r.z = checkpointZ(1) - 1;
    expect(r.step(0, false)).toContainEqual({
      type: 'checkpoint',
      index: 1,
      bonusMs: 27_000,
      stage: 1,
      newStage: true,
    });
    expect(r.stage).toBe(1);
    expect([0, 1, 2, 3, 4, 5, 6].map(bonusMs)).toEqual([
      30_000, 27_000, 24_000, 21_000, 18_000, 15_000, 15_000,
    ]);
  });

  it('warns in the last 5 seconds, then rolls to a stop and ends', () => {
    const r = at(racing(), checkpointZ(2) + 50);
    r.speed = MAX_SPEED;
    r.timeLeftMs = 5500;
    const ev = steps(r, Math.ceil(5500 / STEP_MS) + 1);
    expect(
      ev.filter((e) => e.type === 'warn').map((e) => (e as { seconds: number }).seconds),
    ).toEqual([5, 4, 3, 2, 1]);
    expect(types(ev)).toContain('timeout');
    expect(r.phase).toBe('stopping');
    // it rolls on for a moment, then stops
    const z = r.z;
    const v = r.speed;
    const rest = steps(r, 60 * 5);
    expect(v).toBeGreaterThan(0);
    expect(r.z).toBeGreaterThan(z + (v * v) / (2 * 60));
    expect(types(rest)).toContain('over');
    expect(r.phase).toBe('over');
    expect(r.speed).toBe(0);
    expect(r.step(1, false)).toEqual([]);
  });

  it('rolling under an arch after the clock runs out still counts', () => {
    const r = at(racing(), checkpointZ(0) - 12);
    r.speed = MAX_SPEED;
    r.timeLeftMs = STEP_MS;
    expect(types(steps(r, 2))).toContain('timeout');
    expect(r.phase).toBe('stopping');
    expect(types(steps(r, 30))).toContain('checkpoint');
    expect(r.phase).toBe('racing');
    expect(r.timeLeftMs).toBeGreaterThan(29_000);
  });

  it('distance is metres from the start line', () => {
    const r = racing();
    expect(r.distance).toBe(0);
    r.z = START_Z + 1234.9;
    expect(r.distance).toBe(1234);
  });
});

describe('autopilot', () => {
  /** Drives a whole run with `drive`; returns the run. */
  function race(seed: string, drive: (r: Run) => { steer: number; brake: boolean }): Run {
    const r = run(seed);
    while (r.phase !== 'over' && r.steps < 60 * 600) {
      const d = drive(r);
      r.step(d.steer, d.brake);
    }
    return r;
  }

  it('passes at least 2 checkpoints on the fixed track, with time to spare at the first', () => {
    for (const seed of ['a', 'b', 'c']) {
      const r = run(seed);
      let leftAtFirst = 0;
      while (r.phase !== 'over' && r.nextCp < 2) {
        const d = autopilot(r);
        for (const e of r.step(d.steer, d.brake))
          if (e.type === 'checkpoint' && e.index === 0) leftAtFirst = r.timeLeftMs - e.bonusMs;
      }
      expect(r.nextCp).toBeGreaterThanOrEqual(2);
      expect(leftAtFirst).toBeGreaterThan(4000);
    }
  });

  it('is deterministic for a seed', () => {
    const a = race('d', autopilot);
    const b = race('d', autopilot);
    expect([a.distance, a.overtakes, a.crashes]).toEqual([b.distance, b.overtakes, b.crashes]);
  });

  it('a driver who never steers runs off the road and misses the first checkpoint', () => {
    const r = race('e', () => ({ steer: 0, brake: false }));
    expect(r.nextCp).toBe(0);
    expect(r.distance).toBeLessThan(checkpointZ(0) - START_Z);
  });
});

describe('save guards', () => {
  const fixture = (name: string) =>
    JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures/save', name), 'utf8')) as never;

  it('accepts the committed fixture and the defaults', () => {
    expect(isStatsV1(fixture('stats.v1.json'))).toBe(true);
    expect(isStatsV1(freshStats())).toBe(true);
  });

  it('rejects bad shapes', () => {
    for (const bad of [
      null,
      [],
      { best: -1, runs: 0, bestStage: 0 },
      { best: 1.5, runs: 0, bestStage: 0 },
      { best: 1, runs: 0, bestStage: 1000 },
      { best: 1, runs: '2', bestStage: 1 },
      { best: 1, bestStage: 1 },
    ])
      expect(isStatsV1(bad as never)).toBe(false);
  });

  it('records a finished run', () => {
    const s = withRun(withRun(freshStats(), { distance: 4200, stage: 2 }), {
      distance: 3000,
      stage: 3,
    });
    expect(s).toEqual({ best: 4200, runs: 2, bestStage: 3 });
    expect(isStatsV1(s)).toBe(true);
  });
});
