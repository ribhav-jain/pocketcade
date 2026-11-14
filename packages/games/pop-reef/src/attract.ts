// Attract mode: an AI plays through the same inputs a player uses. When a new bubble is loaded it tries AI_ANGLES
// aims through the sim (trace + resolve), scores each by what it pops, drops and frees (plus a little for landing
// next to its own colour, high on the board, and a pinch of randomness), then turns the aim with the arrow keys and
// fires with a tap at the chosen angle (so the shot is exact even when frames skip).
import { createRng, type AttractScript, type Rng, type VirtualInput } from '@pocketcade/toolkit';
import {
  MAX_AIM,
  MIN_AIM,
  SHOOT_X,
  SHOOT_Y,
  neighbours,
  resolve,
  rowOf,
  trace,
  type Run,
} from './sim.ts';

/** What the AI reads (the live level). */
export type AttractView = Pick<
  Run,
  'phase' | 'aim' | 'cells' | 'fish' | 'shift' | 'current' | 'shots'
>;

export const AI_ANGLES = 60;
/** steps the AI "thinks" before turning (so the reel is watchable) */
const THINK_STEPS = 14;
/** close enough to tap-fire at the exact angle */
const AIM_TOLERANCE = (3 * Math.PI) / 180;
const TAP_DIST = 240;

/** The aim with the best outcome for the loaded bubble; `rnd` (0..1) adds slight randomness. */
export function chooseAim(v: AttractView, rnd: () => number): number {
  let best = Math.PI / 2;
  let bestScore = -Infinity;
  for (let i = 0; i < AI_ANGLES; i++) {
    const a = MIN_AIM + ((MAX_AIM - MIN_AIM) * i) / (AI_ANGLES - 1);
    const { cell } = trace(v.cells, v.shift, a);
    if (cell < 0) continue;
    const { popped, dropped } = resolve(v.cells, v.shift, cell, v.current);
    let freed = 0;
    for (const p of popped) freed += v.fish[p]!;
    for (const d of dropped) freed += v.fish[d]!;
    const friends = neighbours(cell, v.shift).filter((n) => v.cells[n] === v.current).length;
    const score =
      (popped.length + dropped.length) * 10 + freed * 40 + friends * 3 - rowOf(cell) + rnd() * 4;
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return best;
}

interface Plan {
  shots: number;
  angle: number;
  wait: number;
  rng: Rng;
}
/** One plan per level (keyed by the run object, so mounts never share state). */
const plans = new WeakMap<AttractView, Plan>();

const hold = (dir: 'left' | 'right' | null): VirtualInput[] => [
  { action: 'left', phase: dir === 'left' ? 'press' : 'release' },
  { action: 'right', phase: dir === 'right' ? 'press' : 'release' },
];

export const attract: AttractScript<AttractView> = {
  seed: 'pop-reef:attract',
  drive(_step, view) {
    if (!view || view.phase !== 'aim') return hold(null);
    let p = plans.get(view);
    if (!p) {
      p = { shots: -1, angle: Math.PI / 2, wait: 0, rng: createRng('pop-reef:ai') };
      plans.set(view, p);
    }
    if (p.shots !== view.shots) {
      const rng = p.rng;
      p.shots = view.shots;
      p.angle = chooseAim(view, () => rng.next());
      p.wait = THINK_STEPS;
    }
    if (p.wait > 0) {
      p.wait--;
      return hold(null);
    }
    const d = p.angle - view.aim;
    if (Math.abs(d) > AIM_TOLERANCE) return hold(d > 0 ? 'left' : 'right');
    return [
      ...hold(null),
      {
        gesture: 'tap',
        x: SHOOT_X + Math.cos(p.angle) * TAP_DIST,
        y: SHOOT_Y - Math.sin(p.angle) * TAP_DIST,
      },
    ];
  },
  clip: { startStep: 90, durationMs: 3000 },
  still: { atStep: 360, holdMs: 600 },
  restartDelayMs: 1000,
};
