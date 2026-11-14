// The self-playing demo: a mid-game tray, then one move every 0.3 s chosen by the demo player.
import type { AttractScript } from '@pocketcade/toolkit';
import { attractPolicy } from './logic.ts';

export interface AttractView {
  cells: readonly number[];
}

/** `5 10 5 _ / 20 40 10 _ / 80 40 20 5 / 160 E 80 10` as levels (E = Echo = -1), two goals in. */
export const OPENING = {
  cells: [1, 2, 1, 0, 3, 4, 2, 0, 5, 4, 3, 1, 6, -1, 5, 2],
  score: 1240,
  rung: 2,
  maxLevel: 6,
  echoCharge: 0,
} as const;

export const attract: AttractScript<AttractView> = {
  seed: 'sumslide:attract',
  drive(step, view) {
    if (!view || step % 18 !== 0) return;
    return [{ gesture: 'swipe', dir: attractPolicy(view.cells) }];
  },
  clip: { startStep: 60, durationMs: 3000 },
  still: { atStep: 310, holdMs: 600 },
  restartDelayMs: 1000,
};
