// The self-playing demo: the scene starts it on wall 7 with three comets. The Skiff steers to where the lowest
// falling comet will land (wall bounces included), offset so the bounce heads for the fullest column.
import type { AttractScript, VirtualInput } from '@pocketcade/toolkit';
import { GRID, R, WALL_L, WALL_R } from './sim.ts';

export interface AttractView {
  batX: number;
  batWidth: number;
  balls: ReadonlyArray<{ x: number; y: number; vx: number; vy: number }>;
  /** breakable hit points left per grid column */
  hpByColumn: readonly number[];
  ready: boolean;
  /** the comet's resting line just above the Skiff */
  restY: number;
}

/** Where a falling comet's centre reaches the Skiff's shield line, with wall bounces reflected. */
function landingX(b: { x: number; y: number; vx: number; vy: number }, restY: number): number {
  const L = WALL_L + R;
  const span = WALL_R - R - L;
  const t = (restY - b.y) / b.vy;
  const x = (((b.x + b.vx * t - L) % (2 * span)) + 2 * span) % (2 * span);
  return L + (x > span ? 2 * span - x : x);
}

/** The Skiff position that sends the lowest falling comet towards the column with the most hit points left. */
export function autopilotTarget(view: AttractView): number | null {
  const falling = view.balls.filter((b) => b.vy > 0);
  if (!falling.length) return null;
  const lowest = falling.reduce((a, b) => (b.y > a.y ? b : a));
  const land = landingX(lowest, view.restY);
  const best = view.hpByColumn.reduce((bi, hp, i, a) => (hp > a[bi]! ? i : bi), 0);
  const columnX = GRID.x + (best + 0.5) * GRID.cellW;
  const o = Math.max(-0.6, Math.min(0.6, (columnX - land) / 400));
  return land - (o * view.batWidth) / 2;
}

const hold = (want: 'left' | 'right' | null): VirtualInput[] => [
  { action: 'left', phase: want === 'left' ? 'press' : 'release' },
  { action: 'right', phase: want === 'right' ? 'press' : 'release' },
];

export const attract: AttractScript<AttractView> = {
  seed: 'comet-crush:attract',
  drive(step, view) {
    if (!view) return;
    if (view.ready) return step % 60 === 30 ? [{ action: 'launch', phase: 'press' }] : hold(null);
    const target = autopilotTarget(view);
    if (target === null) return hold(null);
    return hold(view.batX < target - 6 ? 'right' : view.batX > target + 6 ? 'left' : null);
  },
  clip: { startStep: 150, durationMs: 3000 },
  still: { atStep: 360, holdMs: 600 },
  restartDelayMs: 1000,
};
