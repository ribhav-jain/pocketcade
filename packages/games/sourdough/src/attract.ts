// Attract script: Draw 1 on a seeded claim; every 24 steps after the deal it taps the source card of the current
// hint, else the deck. Taps go through tap-to-move like real input. The scene publishes the tap point; the seed is
// pinned by test/rules.test.ts (the clip shows a run move, a flip and a banked card).
import type { AttractScript } from '@pocketcade/toolkit';
import { hint, STOCK, type State } from './klondike.ts';

export interface AttractView {
  /** design-unit centre of the card or deck to tap next */
  x: number;
  y: number;
}

export const ATTRACT_SEED = 'sourdough:attract:v51';
const ATTRACT_FIRST_STEP = 96;
const ATTRACT_EVERY = 24;

/** What the script taps next: the hint's source card, else the deck. */
export function attractTarget(s: State): { pile: number; index: number } {
  const h = hint(s);
  if (h?.type === 'move') return { pile: h.from, index: s.piles[h.from]!.length - h.count };
  return { pile: STOCK, index: 0 };
}

export const attract: AttractScript<AttractView> = {
  seed: ATTRACT_SEED,
  drive(step, view) {
    if (!view || step < ATTRACT_FIRST_STEP || step % ATTRACT_EVERY) return;
    return [{ gesture: 'tap', x: view.x, y: view.y }];
  },
  clip: { startStep: 90, durationMs: 3000 },
  still: { atStep: 480, holdMs: 600 },
  restartDelayMs: 1000,
};
