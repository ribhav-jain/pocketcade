// Attract script: Pairs 4×4 with a fixed seed; three pairs in the warm-up, a deliberate mismatch in the clip,
// more pairs, one open card at the still, then the board is cleared and the run restarts.
import type { AttractScript, VirtualInput } from '@pocketcade/toolkit';

export interface AttractView {
  faces: readonly number[];
  matched: readonly boolean[];
  open: readonly number[];
  /** card centres in design units */
  centres: ReadonlyArray<readonly [number, number]>;
}

const tap = (view: AttractView, cell: number | undefined): VirtualInput[] | undefined => {
  if (cell === undefined || cell < 0) return;
  const [x, y] = view.centres[cell]!;
  return [{ gesture: 'tap', x, y }];
};
const firstUnmatched = (v: AttractView) => v.matched.findIndex((m, i) => !m && !v.open.includes(i));
const mateOf = (v: AttractView, cell: number) =>
  v.faces.findIndex((f, i) => i !== cell && f === v.faces[cell] && !v.matched[i]);

/** Steps where the first card of a pair opens; its mate follows 15 steps later. */
const PAIR_STARTS = new Set([0, 30, 60, 180, 210, 240, 315, 345]);

export const attract: AttractScript<AttractView> = {
  seed: 'flip-and-follow:attract',
  drive(step, view) {
    if (!view) return;
    if (step === 96 || step === 282 || PAIR_STARTS.has(step))
      return tap(view, firstUnmatched(view));
    if (step === 111) {
      const a = view.open[0];
      if (a === undefined) return;
      return tap(
        view,
        view.faces.findIndex((f, i) => i !== a && f !== view.faces[a] && !view.matched[i]),
      ); // a mismatch
    }
    if (PAIR_STARTS.has(step - 15) || step === 300) {
      const a = view.open[0];
      return a === undefined ? undefined : tap(view, mateOf(view, a));
    }
  },
  clip: { startStep: 96, durationMs: 3000 },
  still: { atStep: 290, holdMs: 600 },
  restartDelayMs: 1000,
};
