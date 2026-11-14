// Sunset Sprint's race as a pure simulation. Phaser only draws it.
// Miso's car moves along the fixed track (track.ts) in 60 Hz steps: auto-throttle, steering, the curve push, off-road
// slowdown, seeded traffic, crashes, overtakes, checkpoints and the clock. Events tell the scene what to draw.
import type { Rng } from '@pocketcade/toolkit';
import {
  LANE_X,
  PLAYER_DIST,
  START_Z,
  checkpointZ,
  createTrack,
  curveAt,
  stageOfLeg,
  type Track,
} from './track.ts';

export const STEP_MS = 1000 / 60;
const DT = 1 / 60;
/** Speeds in m/s, rates in m/s². */
export const MAX_SPEED = 64;
export const ACCEL = 11;
export const BRAKE = 45;
export const OFFROAD_SPEED = 22;
export const OFFROAD_DECEL = 30;
/** after the clock runs out the car rolls to a stop */
export const COAST_DECEL = 24;
/** Sideways speed at top speed (road half-widths per second), scaled by speed. */
export const STEER = 2;
/** The curve's outward push per unit of curve at top speed, scaled by speed². */
export const PUSH = 0.55;
/** How far past the road edge the car can go. */
export const X_LIMIT = 1.75;
export const START_TIME_MS = 45_000;
export const COUNTDOWN_MS = 2400;
/** Checkpoint bonus for the stage the next leg is in: 30 s, 3 s less per stage, never under 15 s. */
export const bonusMs = (stage: number) => Math.max(15_000, 30_000 - 3_000 * stage);
/** Cars overlap when their centres are this close along the road (m) and across it (half-widths). */
export const CAR_LEN = 4.4;
export const HIT_X = 0.27;
/** An overtake this close across is a near miss ("Close one!"). */
export const NEAR_X = 0.46;
/** A crash keeps this much speed, wobbles, then the car is a ghost (no crashes) until GHOST_MS after the hit. */
export const CRASH_KEEP = 0.3;
export const WOBBLE_MS = 600;
export const GHOST_MS = 1500;
/** Traffic. */
export const MAX_CARS = 14;
export const CAR_KINDS = 4;
export const TRAFFIC_MIN = 22;
export const TRAFFIC_MAX = 40;
/** Cars spawn this far ahead (just past the drawn road) and leave once behind the camera or far ahead. */
const SPAWN_AHEAD = 380;
const SPAWN_NEAR = 90;
const DESPAWN_AHEAD = 520;
/** Cars don't start a lane change within this distance ahead of the player. */
const CHANGE_CLEAR = 30;
export const LANE_CHANGE_MS = 1400;
/** A car slows to the speed of a slower car this close ahead in its lane. */
const FOLLOW_GAP = 18;
/** Three cars across the road this close together (m) wall it off; they change speed by WALL_EASE to break up. */
const WALL_GAP = 12;
const WALL_EASE = 6;

export type Phase = 'countdown' | 'racing' | 'stopping' | 'over';

export interface Car {
  on: boolean;
  /** position along the track (m) and across it (half-widths) */
  z: number;
  x: number;
  speed: number;
  /** cruising speed */
  cruise: number;
  kind: number;
  /** lane change: from lane → to lane, progress t (1 = done) */
  from: number;
  to: number;
  t: number;
  /** steps until the next lane-change decision */
  next: number;
  passed: boolean;
  hit: boolean;
  /** closest lateral gap to the player while alongside */
  minDx: number;
}

export type SimEvent =
  | { type: 'count'; n: number }
  | { type: 'go' }
  | { type: 'checkpoint'; index: number; bonusMs: number; stage: number; newStage: boolean }
  | { type: 'crash'; car: Car }
  | { type: 'overtake'; near: boolean }
  | { type: 'warn'; seconds: number }
  | { type: 'timeout' }
  | { type: 'over' };

const smooth = (t: number) => t * t * (3 - 2 * t);

export type Run = ReturnType<typeof createRun>;

/** A new race on `track` (default: the fixed track). `rng` seeds the traffic. */
export function createRun(rng: Rng, track: Track = createTrack()) {
  const traffic = rng.fork('traffic');
  const events: SimEvent[] = [];
  const cars: Car[] = Array.from({ length: MAX_CARS }, () => ({
    on: false,
    z: 0,
    x: 0,
    speed: 0,
    cruise: 0,
    kind: 0,
    from: 0,
    to: 0,
    t: 1,
    next: 0,
    passed: false,
    hit: false,
    minDx: 9,
  }));
  let nextSpawn = 0;
  let lastCount = 0;

  const run = {
    track,
    cars,
    phase: 'countdown' as Phase,
    countdownMs: COUNTDOWN_MS,
    /** track position (m), lateral position (half-widths), speed (m/s) */
    z: START_Z,
    x: 0,
    speed: 0,
    /** the inputs of the last step (for drawing): −1 left, 1 right */
    steer: 0,
    braking: false,
    offroad: false,
    timeLeftMs: START_TIME_MS,
    wobbleMs: 0,
    ghostMs: 0,
    /** the next checkpoint (0-based); also the leg being driven */
    nextCp: 0,
    stage: 0,
    overtakes: 0,
    nearMisses: 0,
    crashes: 0,
    steps: 0,
    /** metres from the start line */
    get distance(): number {
      return Math.max(0, Math.floor(run.z - START_Z));
    },
    step,
  };

  function laneBusy(lane: number, z: number, gap: number, self: Car | null): boolean {
    for (const c of cars)
      if (c.on && c !== self && Math.abs(c.z - z) < gap && (c.to === lane || c.from === lane))
        return true;
    return false;
  }

  function spawn(z: number): void {
    const car = cars.find((c) => !c.on);
    if (!car) return;
    const first = traffic.int(0, 2);
    let lane = -1;
    for (let k = 0; k < 3 && lane < 0; k++) {
      const l = (first + k) % 3;
      if (!laneBusy(l, z, 26, null)) lane = l;
    }
    // never wall off all three lanes
    const others = [0, 1, 2].filter((l) => l !== lane && laneBusy(l, z, 34, null)).length;
    if (lane < 0 || others >= 2) return;
    const cruise = traffic.float(TRAFFIC_MIN, TRAFFIC_MAX);
    Object.assign(car, {
      on: true,
      z,
      x: LANE_X[lane],
      speed: cruise,
      cruise,
      kind: traffic.int(0, CAR_KINDS - 1),
      from: lane,
      to: lane,
      t: 1,
      next: traffic.int(90, 300),
      passed: false,
      hit: false,
      minDx: 9,
    });
  }

  /** −1 if the car is the rearmost of three cars across the road, 1 if the front one, else 0. */
  function wallRank(car: Car): number {
    let lanes = 0;
    let ahead = false;
    let behind = false;
    for (const o of cars) {
      if (!o.on || o === car || o.to === car.to || Math.abs(o.z - car.z) >= WALL_GAP) continue;
      lanes |= 1 << o.to;
      if (o.z > car.z) ahead = true;
      else behind = true;
    }
    // both other lanes taken
    if ((lanes & (lanes - 1)) === 0) return 0;
    return !behind ? -1 : !ahead ? 1 : 0;
  }

  /** Gap to the next car: shrinks 6 % per stage, down to 70 %. */
  const gap = () => traffic.float(60, 110) * (1 - 0.06 * Math.min(5, run.stage));

  function moveTraffic(): void {
    for (const car of cars) {
      if (!car.on) continue;
      let v = car.cruise;
      for (const o of cars)
        if (
          o.on &&
          o !== car &&
          o.z > car.z &&
          o.z - car.z < FOLLOW_GAP &&
          Math.abs(o.x - car.x) < 0.4
        )
          v = Math.min(v, o.speed);
      // a car stuck behind a slower one looks for a way past soon
      if (v < car.cruise - 1 && car.t >= 1) car.next = Math.min(car.next, 20);
      // three across the road: the rearmost eases off and the front one pulls ahead, so the wall breaks up
      const rank = wallRank(car);
      if (rank < 0) v = Math.max(0, v - WALL_EASE);
      else if (rank > 0 && v === car.cruise) v += WALL_EASE;
      // a car Miso has passed never catches back up
      if (car.passed) v = Math.min(v, run.speed * 0.9);
      car.speed = v;
      car.z += v * DT;
      if (car.t < 1) {
        car.t = Math.min(1, car.t + STEP_MS / LANE_CHANGE_MS);
        car.x = LANE_X[car.from]! + (LANE_X[car.to]! - LANE_X[car.from]!) * smooth(car.t);
      } else if (--car.next <= 0) {
        const stuck = car.speed < car.cruise - 1;
        car.next = traffic.int(120, 360);
        if (car.z - run.z > CHANGE_CLEAR && (stuck || traffic.chance(0.5))) {
          const to = car.to === 1 ? (traffic.chance(0.5) ? 0 : 2) : 1;
          // never into a busy lane, nor into the last open gap across the road
          const wall = [0, 1, 2].every((l) => l === to || laneBusy(l, car.z, WALL_GAP, car));
          if (!laneBusy(to, car.z, 22, car) && !wall) {
            car.from = car.to;
            car.to = to;
            car.t = 0;
          }
        }
      }
      if (car.z < run.z - PLAYER_DIST - 4 || car.z > run.z + DESPAWN_AHEAD) car.on = false;
    }
    spawnAhead();
  }

  /** Spawns cars up to SPAWN_AHEAD, never closer than SPAWN_NEAR (in play the next spot is always far ahead). */
  function spawnAhead(): void {
    nextSpawn = Math.max(nextSpawn, run.z + SPAWN_NEAR);
    while (nextSpawn < run.z + SPAWN_AHEAD) {
      spawn(nextSpawn);
      nextSpawn += gap();
    }
  }

  function crash(car: Car): void {
    run.speed *= CRASH_KEEP;
    run.wobbleMs = WOBBLE_MS;
    run.ghostMs = GHOST_MS;
    run.crashes++;
    car.hit = true;
    // knocked a little away from the car
    run.x += (run.x >= car.x ? 1 : -1) * 0.12;
    events.push({ type: 'crash', car });
  }

  /** One 60 Hz step. `steer`: −1 left, 0, 1 right. The returned array is reused by the next step. */
  function step(steer: number, brake: boolean): readonly SimEvent[] {
    events.length = 0;
    if (run.phase === 'over') return events;
    run.steps++;
    if (run.phase === 'countdown') {
      run.countdownMs -= STEP_MS;
      const n = Math.max(0, Math.ceil(run.countdownMs / (COUNTDOWN_MS / 3)));
      if (n !== lastCount && n > 0) events.push({ type: 'count', n });
      lastCount = n;
      if (run.countdownMs <= 0) {
        run.phase = 'racing';
        events.push({ type: 'go' });
      }
      moveTraffic();
      return events;
    }

    // the clock
    if (run.phase === 'racing') {
      const before = Math.ceil(run.timeLeftMs / 1000);
      run.timeLeftMs = Math.max(0, run.timeLeftMs - STEP_MS);
      const after = Math.ceil(run.timeLeftMs / 1000);
      if (after < before && after > 0 && after <= 5) events.push({ type: 'warn', seconds: after });
      if (run.timeLeftMs <= 0) {
        run.phase = 'stopping';
        events.push({ type: 'timeout' });
      }
    }
    run.wobbleMs = Math.max(0, run.wobbleMs - STEP_MS);
    run.ghostMs = Math.max(0, run.ghostMs - STEP_MS);

    // speed: auto-throttle (off while wobbling), brake, or roll to a stop once the time is up
    run.braking = brake;
    if (run.phase === 'stopping') run.speed = Math.max(0, run.speed - COAST_DECEL * DT);
    if (brake) run.speed = Math.max(0, run.speed - BRAKE * DT);
    else if (run.phase === 'racing' && run.wobbleMs <= 0)
      run.speed = Math.min(MAX_SPEED, run.speed + ACCEL * DT);

    // steering (not while wobbling) and the curve's push outward
    const sp = run.speed / MAX_SPEED;
    run.steer = run.wobbleMs > 0 ? 0 : Math.sign(steer);
    run.x += DT * STEER * sp * run.steer;
    run.x -= DT * PUSH * sp * sp * curveAt(track, run.z);
    run.x = Math.max(-X_LIMIT, Math.min(X_LIMIT, run.x));
    run.offroad = Math.abs(run.x) > 1;
    if (run.offroad && run.speed > OFFROAD_SPEED)
      run.speed = Math.max(OFFROAD_SPEED, run.speed - OFFROAD_DECEL * DT);
    run.z += run.speed * DT;

    // checkpoints (one reached while rolling to a stop still counts)
    while (run.z >= checkpointZ(run.nextCp)) {
      const index = run.nextCp++;
      const stage = stageOfLeg(run.nextCp);
      const bonus = bonusMs(stage);
      const newStage = stage !== run.stage;
      run.stage = stage;
      run.timeLeftMs += bonus;
      run.phase = 'racing';
      events.push({ type: 'checkpoint', index, bonusMs: bonus, stage, newStage });
    }

    moveTraffic();

    // crashes, overtakes and near misses
    for (const car of cars) {
      if (!car.on) continue;
      const dz = car.z - run.z;
      if (Math.abs(dz) < CAR_LEN) {
        const dx = Math.abs(car.x - run.x);
        car.minDx = Math.min(car.minDx, dx);
        if (dx < HIT_X && run.ghostMs <= 0 && !car.hit && run.speed > 0) crash(car);
      }
      if (!car.passed && dz < -CAR_LEN) {
        car.passed = true;
        if (!car.hit && car.minDx >= HIT_X) {
          run.overtakes++;
          const near = car.minDx < NEAR_X && run.ghostMs <= 0;
          if (near) run.nearMisses++;
          events.push({ type: 'overtake', near });
        }
      }
    }

    if (run.phase === 'stopping' && run.speed <= 0) {
      run.phase = 'over';
      events.push({ type: 'over' });
    }
    return events;
  }

  spawnAhead();
  return run;
}
