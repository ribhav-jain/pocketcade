// Attract script: 15 scripted moves, You first. Moves 1–8 are placed at once; 9–15 drop
// every 24 steps from step 30. You build two threats at once (row 2 at column 5, and the diagonal above it);
// Rowdy blocks the row, which opens the diagonal, and move 15 wins it. No AI search runs.
import type { AttractScript } from '@pocketcade/toolkit';

export interface AttractView {
  /** attract step at which the round started */
  startStep: number;
}

/** Columns 0–6 in play order (You on odd moves). */
export const ATTRACT_MOVES = [1, 2, 2, 3, 4, 3, 3, 4, 2, 5, 5, 6, 5, 4, 4] as const;
export const ATTRACT_INSTANT = 8;
const ATTRACT_FIRST_STEP = 30;
const ATTRACT_EVERY = 24;

export const attract: AttractScript<AttractView> = {
  drive(step, view) {
    if (!view) return;
    const k = step - view.startStep - ATTRACT_FIRST_STEP;
    if (k < 0 || k % ATTRACT_EVERY) return;
    const col = ATTRACT_MOVES[ATTRACT_INSTANT + k / ATTRACT_EVERY];
    return col === undefined ? undefined : [{ action: `select${col + 1}`, phase: 'press' }];
  },
  clip: { startStep: 30, durationMs: 3000 },
  still: { atStep: 240, holdMs: 600 },
  restartDelayMs: 1000,
};
