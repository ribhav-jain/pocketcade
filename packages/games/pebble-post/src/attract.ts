// Attract mode: an autopilot slides Pebble through the same keys a player uses. Each 60 Hz step it looks at the next
// row it hasn't reached, keeps to the lanes it can still reach in time (and hop or tuck through), prefers the one with
// letters or a power-up ahead, changes lane once the row it is passing is behind it, and hops or tucks just in time.
// The course guarantees a way through from every lane it can pass, so it survives a long time.
import type { AttractScript } from '@pocketcade/toolkit';
import {
  BODY,
  EMPTY,
  FAST_FALL,
  FULL,
  GRAVITY,
  HIGH,
  HIGH_GAP,
  HOP_S,
  HOP_V,
  LANE_S,
  LOW,
  LOW_TOP,
  type Move,
  type Run,
} from './sim.ts';

/** What the autopilot reads (the live run). */
export type AutopilotView = Pick<
  Run,
  | 'phase'
  | 'z'
  | 'lane'
  | 'laneT'
  | 'y'
  | 'vy'
  | 'airborne'
  | 'tucked'
  | 'tuckS'
  | 'speed'
  | 'course'
>;

/** When a hop is above a low obstacle's top: from CLEAR[0] to CLEAR[1] seconds after take-off. */
const disc = Math.sqrt(HOP_V * HOP_V - 2 * GRAVITY * LOW_TOP);
const CLEAR = [(HOP_V - disc) / GRAVITY, (HOP_V + disc) / GRAVITY] as const;
/** Tuck this long (s) before a high obstacle's front. */
const TUCK_AT = 0.2;

/** Seconds until Pebble lands (0 on the ice). */
function landIn(v: AutopilotView): number {
  if (!v.airborne) return 0;
  return (v.vy + Math.sqrt(v.vy * v.vy + 2 * GRAVITY * v.y)) / GRAVITY;
}

/** The autopilot's move for this step, or null. */
export function autopilot(v: AutopilotView): Move | null {
  if (v.phase !== 'run') return null;
  const { rows, letters, pickups } = v.course;
  const sp = v.speed;
  const nose = v.z + BODY.halfLen;
  const tail = v.z - BODY.halfLen;
  // the next row not reached yet, and the one before it (being passed, or behind)
  let t = 0;
  while (t < rows.length && rows[t]!.front <= nose) t++;
  const row = rows[t];
  if (!row) return null;
  const prev = t > 0 ? rows[t - 1] : undefined;
  const wait = prev && prev.back + 0.1 > tail ? (prev.back + 0.1 - tail) / sp : 0;
  const slide = (1 - v.laneT) * LANE_S;
  const ahead = row.back + 8;

  // the lane to take through it (ties stay put)
  let best = -1;
  let bestScore = -Infinity;
  for (let j = 0; j < 3; j++) {
    const s = row.slots[j]!;
    if (s === FULL) continue;
    const toFront = (row.z - row.halfLen[j]! - nose) / sp;
    const toBack = (row.z + row.halfLen[j]! - tail) / sp;
    const k = Math.abs(j - v.lane);
    const moved = (k ? wait : 0) + slide + k * LANE_S * 1.1;
    if (moved > (row.front - nose) / sp - 0.02) continue;
    if (s === LOW && Math.max(landIn(v), toBack - CLEAR[1]) > toFront - CLEAR[0]) continue;
    let score = -0.4 * k + (s === EMPTY ? 0.3 : 0) + (k ? 0 : 0.01);
    for (const l of letters)
      if (!l.taken && l.z > v.z && l.z < ahead && Math.abs(l.x - j) < 0.5) score++;
    for (const p of pickups) if (!p.taken && p.lane === j && p.z > v.z && p.z < ahead) score += 6;
    if (score > bestScore) [best, bestScore] = [j, score];
  }
  if (best < 0) return null;

  if (best !== v.lane) return wait > 0 || v.laneT < 1 ? null : best < v.lane ? 'left' : 'right';
  const s = row.slots[best]!;
  if (s === LOW && !v.airborne && (row.z - v.z) / sp <= HOP_S / 2) return 'hop';
  if (s === HIGH) {
    const toFront = (row.z - row.halfLen[best]! - nose) / sp;
    const toBack = (row.z + row.halfLen[best]! - tail) / sp;
    // in the air, allow for the drop until she is low enough to pass tucked
    const drop = v.airborne ? Math.max(0, v.y - (HIGH_GAP - BODY.tuck)) / FAST_FALL : 0;
    const covered = v.tucked && (v.airborne || v.tuckS > toBack + 0.05);
    if (toFront <= TUCK_AT + drop && !covered) return 'tuck';
  }
  return null;
}

export const attract: AttractScript<AutopilotView> = {
  seed: 'pebble-post:attract',
  drive(_step, view) {
    const m = view ? autopilot(view) : null;
    if (!m) return;
    return [
      { action: m, phase: 'press' },
      { action: m, phase: 'release' },
    ];
  },
  clip: { startStep: 240, durationMs: 3000 },
  still: { atStep: 560, holdMs: 600 },
  restartDelayMs: 1000,
};
