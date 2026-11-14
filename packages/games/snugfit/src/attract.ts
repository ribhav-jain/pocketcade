// Attract script: the demo opens on a half-sewn quilt and, every MOVE_EVERY steps, taps the patch the greedy
// policy chose and then the spot on the quilt where it goes. Taps go through tap-to-place like real input; the
// scene publishes both points.
import type { AttractScript } from '@pocketcade/toolkit';
import type { Piece } from './logic.ts';

export interface AttractView {
  /** design-unit centre of the tray slot to tap */
  pick: { x: number; y: number };
  /** design-unit point on the quilt where the patch's centre goes */
  drop: { x: number; y: number };
}

const ROWS = [
  '........',
  '........',
  '........',
  '1.......',
  '11..3.44',
  '5566.244',
  '3552.223',
  '3316.221',
];

/** The demo's first quilt and hand: an upright bar of three, a 2 × 2 square and an L. */
export const OPENING: { board: number[]; hand: Piece[] } = {
  board: ROWS.flatMap((row) => [...row].map((ch) => (ch === '.' ? 0 : Number(ch)))),
  hand: [
    { shape: 4, colour: 4 },
    { shape: 9, colour: 1 },
    { shape: 19, colour: 3 },
  ],
};

const FIRST_STEP = 40;
const MOVE_EVERY = 46;
const DROP_AFTER = 18;

export const attract: AttractScript<AttractView> = {
  seed: 'snugfit:attract',
  drive(step, view) {
    if (!view || step < FIRST_STEP) return;
    const k = (step - FIRST_STEP) % MOVE_EVERY;
    if (k === 0) return [{ gesture: 'tap', ...view.pick }];
    if (k === DROP_AFTER) return [{ gesture: 'tap', ...view.drop }];
  },
  clip: { startStep: 30, durationMs: 3000 },
  still: { atStep: 330, holdMs: 600 },
  restartDelayMs: 1000,
};
