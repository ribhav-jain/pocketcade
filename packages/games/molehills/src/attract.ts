// Attract script: a Field board. The first dig taps canonical cell (row 8, col 6) at step 20; then every 10 steps
// the solver's next move: a safe patch is tapped; a mole gets Plant mode on, a tap, and Plant mode off on three
// consecutive steps. The scene publishes the next move and where it is on screen.
import type { AttractScript, VirtualInput } from '@pocketcade/toolkit';

export interface AttractView {
  /** attract step at which this run began */
  startStep: number;
  /** design-unit centre of the next patch and what to do there */
  next: { kind: 'dig' | 'flower'; x: number; y: number } | null;
  flowerMode: boolean;
}

export const ATTRACT_SIZE = 'field';
export const ATTRACT_FIRST = { row: 8, col: 6 };
export const ATTRACT_FIRST_STEP = 20;
const ATTRACT_EVERY = 10;

const mode: VirtualInput = { action: 'flowerMode', phase: 'press' };

export const attract: AttractScript<AttractView> = {
  drive(step, view) {
    if (!view?.next) return;
    const k = step - view.startStep - ATTRACT_FIRST_STEP;
    if (k < 0 || k % ATTRACT_EVERY > 2) return;
    const tap: VirtualInput = { gesture: 'tap', x: view.next.x, y: view.next.y };
    const phase = k % ATTRACT_EVERY;
    const dig = view.next.kind === 'dig';
    if (phase === 0)
      return dig ? [view.flowerMode ? mode : tap] : view.flowerMode ? undefined : [mode];
    if (phase === 1) return !dig && view.flowerMode ? [tap] : undefined;
    return view.flowerMode ? [mode] : undefined;
  },
  clip: { startStep: 20, durationMs: 3000 },
  still: { atStep: 480, holdMs: 600 },
  restartDelayMs: 1000,
};
