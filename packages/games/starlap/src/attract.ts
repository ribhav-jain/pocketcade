// Attract script: a run already 16 hits in, on the step clock. Scripted hit k is pressed at the arrival step plus
// [0, +1, 0, −1, +2][k mod 5] (a mix of Perfect and Good); after 30 hits the next press comes 20 steps early, an
// Early miss, and the toolkit restarts the reel. The seed and the still step are pinned by test/rules.test.ts.
import type { AttractScript, VirtualInput } from '@pocketcade/toolkit';

export interface AttractView {
  /** the 60 Hz step at which Pip reaches the star */
  arrivalStep: number;
  /** scripted hits so far in this attract run */
  hits: number;
}

export const ATTRACT_SEED = 'starlap:attract:11';
/** Late in the second zone, so the reel soon shows the sky change. */
export const ATTRACT_START = { n: 16, score: 30 } as const;
const ATTRACT_OFFSETS = [0, 1, 0, -1, 2] as const;
export const ATTRACT_LAST_HIT = 30;

const TAP: readonly VirtualInput[] = [
  { action: 'tap', phase: 'press' },
  { action: 'tap', phase: 'release' },
];

/** The step at which the attract script presses for the current star. */
export const attractPressStep = (v: AttractView) =>
  v.hits >= ATTRACT_LAST_HIT
    ? v.arrivalStep - 20
    : v.arrivalStep + ATTRACT_OFFSETS[v.hits % ATTRACT_OFFSETS.length]!;

/** A frame with Pip just short of the star. */
export const ATTRACT_STILL_STEP = 250;

export const attract: AttractScript<AttractView> = {
  seed: ATTRACT_SEED,
  drive(step, view) {
    if (view && step === attractPressStep(view)) return TAP;
  },
  clip: { startStep: 60, durationMs: 3000 },
  still: { atStep: ATTRACT_STILL_STEP, holdMs: 600 },
  restartDelayMs: 1000,
};
