// Attract script: the demo follows the solver. Every MOVE_EVERY steps it taps the bottle to pour from and, a
// moment later, the bottle to pour into, through the same tap handling as a player. The scene publishes both
// points; after a level is solved the taps move the demo on to the next one.
import type { AttractScript } from '@pocketcade/toolkit';

export interface AttractView {
  /** design-unit point on the bottle to lift */
  from: { x: number; y: number };
  /** design-unit point on the bottle to pour into */
  to: { x: number; y: number };
}

/** The level the demo opens on: seven bottles, solved in about a dozen pours. */
export const ATTRACT_LEVEL = 8;

const FIRST_STEP = 36;
const MOVE_EVERY = 54;
const POUR_AFTER = 18;

export const attract: AttractScript<AttractView> = {
  seed: 'hue-brew:attract',
  drive(step, view) {
    if (!view || step < FIRST_STEP) return;
    const k = (step - FIRST_STEP) % MOVE_EVERY;
    if (k === 0) return [{ gesture: 'tap', ...view.from }];
    if (k === POUR_AFTER) return [{ gesture: 'tap', ...view.to }];
  },
  clip: { startStep: 30, durationMs: 3000 },
  still: { atStep: 300, holdMs: 600 },
  restartDelayMs: 1000,
};
