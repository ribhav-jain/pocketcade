// Attract mode: an autopilot drives Miso through the same keys a player uses (held ← → and ↓). Each 60 Hz step it
// picks the lane with the most clear road ahead (staying put on ties), steers toward it while leaning into the
// curve's push, and brakes only when a car is about to fill the gap ahead. The toolkit restarts after a run ends.
import type { AttractScript, VirtualInput } from '@pocketcade/toolkit';
import { CAR_LEN, HIT_X, MAX_SPEED, PUSH, type Run } from './sim.ts';
import { LANE_X, curveAt } from './track.ts';

/** What the autopilot reads (the live run). */
export type AutopilotView = Pick<Run, 'phase' | 'z' | 'x' | 'speed' | 'cars' | 'track'>;
export interface Drive {
  steer: -1 | 0 | 1;
  brake: boolean;
}

/** how far ahead the autopilot looks for traffic (m) */
const LOOK = 110;
/** how far ahead it reads the curve (m), and how far ahead it predicts its drift (s) */
const CURVE_AHEAD = 12;
const LEAD_S = 0.2;
const DEADBAND = 0.05;
/** every half-width of road to cross costs this many metres of clear road */
const MOVE_COST = 24;
/** the middle lane is open to cross when its nearest car is this far ahead (m) */
const CROSS_GAP = 10;

/** Clear road ahead (m) in the lane centred on `lx` (0 with a car alongside). */
function clearAhead(v: AutopilotView, lx: number): number {
  let clear = LOOK;
  for (const c of v.cars) {
    if (!c.on || c.passed) continue;
    const dz = c.z - v.z;
    if (dz < -CAR_LEN || dz > LOOK) continue;
    if (Math.abs(c.x - lx) < 0.45) clear = Math.min(clear, Math.max(0, dz));
  }
  return clear;
}

/** The autopilot's inputs for the next step. */
export function autopilot(v: AutopilotView): Drive {
  if (v.phase !== 'racing' && v.phase !== 'stopping') return { steer: 0, brake: false };
  const here = clearAhead(v, v.x);
  // crossing the middle lane needs it clear alongside and just ahead
  const middleOpen = clearAhead(v, 0) > CROSS_GAP;
  // stuck behind a car, moving over is worth more
  const cost = here < 40 ? MOVE_COST / 2 : MOVE_COST;
  let target = v.x;
  let best = -Infinity;
  let dropBack = false;
  for (const lx of LANE_X) {
    let clear = clearAhead(v, lx);
    if (Math.abs(lx - v.x) > 1 && !middleOpen) {
      // the far lane is better but a middle-lane car is in the way: drop back behind it, then cross
      if (clear - cost * 1.3 > here + 30) dropBack = true;
      clear = 0;
    }
    const score = clear - Math.abs(lx - v.x) * cost;
    if (score > best) [best, target] = [score, lx];
  }
  const sp = v.speed / MAX_SPEED;
  const drift = PUSH * sp * sp * curveAt(v.track, v.z + CURVE_AHEAD);
  const err = target - (v.x - drift * LEAD_S);
  const steer = err > DEADBAND ? 1 : err < -DEADBAND ? -1 : 0;
  // brake for a car right ahead that we can't steer around in time
  let brake = dropBack && here < 40;
  for (const c of v.cars) {
    if (!c.on || c.passed || c.speed >= v.speed) continue;
    const dz = c.z - v.z;
    const dx = Math.abs(c.x - v.x);
    if (dz > 0 && dz < 14 + (v.speed - c.speed) * 0.25 && dx < HIT_X + 0.1) brake = true;
  }
  return { steer, brake };
}

const hold = (d: Drive): VirtualInput[] => [
  { action: 'left', phase: d.steer < 0 ? 'press' : 'release' },
  { action: 'right', phase: d.steer > 0 ? 'press' : 'release' },
  { action: 'brake', phase: d.brake ? 'press' : 'release' },
];

export const attract: AttractScript<AutopilotView> = {
  seed: 'sunset-sprint:attract',
  drive(_step, view) {
    return hold(view ? autopilot(view) : { steer: 0, brake: false });
  },
  clip: { startStep: 330, durationMs: 3000 },
  still: { atStep: 700, holdMs: 600 },
  restartDelayMs: 1000,
};
