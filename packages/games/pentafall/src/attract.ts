// Attract script: a start pile with an empty right-hand column, a scripted opening (P, Lm, then an upright bar
// for a Full Five, then U stashed), then the AI. The scene publishes each piece's action list; drive() presses
// one action every 4 steps (press, release next step).
import type { AttractScript } from '@pocketcade/toolkit';
import { pieceIndex, type PieceId } from './pieces.ts';
import { COLS, ROWS, type Action } from './sim.ts';

export interface AttractView {
  actions: readonly Action[];
  /** the attract step of the first action */
  startStep: number;
}

export const ATTRACT_QUEUE: readonly PieceId[] = ['P', 'Lm', 'I', 'U'];
export const OPENING: readonly (readonly Action[])[] = [
  ['left', 'left', 'left', 'left', 'slam'],
  ['right', 'slam'],
  ['turnRight', 'right', 'right', 'right', 'right', 'right', 'right', 'slam'],
  ['stash'],
];

/** The bottom five rows filled in columns 0–10 with mixed colours; column 11 is the open shaft. */
function startPile(): string {
  const rows = [
    [5, 6],
    [3, 4, 4],
    [6, 5],
    [4, 3, 4],
    [5, 6],
  ];
  const kinds: PieceId[] = ['L', 'P', 'Y', 'N', 'T', 'Z', 'U', 'F', 'V', 'I', 'Pm', 'Ym'];
  let k = 0;
  const filled = rows.map(
    (runs) =>
      runs
        .map((len) => String.fromCharCode(97 + pieceIndex(kinds[k++ % kinds.length]!)).repeat(len))
        .join('') + '.',
  );
  return '.'.repeat(COLS * (ROWS - rows.length)) + filled.join('');
}
export const ATTRACT_PILE = startPile();

export const attract: AttractScript<AttractView> = {
  drive(step, view) {
    if (!view) return;
    const k = step - view.startStep;
    const action = view.actions[Math.floor(k / 4)];
    if (k < 0 || k % 4 > 1 || !action) return;
    return [{ action, phase: k % 4 === 0 ? 'press' : 'release' }];
  },
  clip: { startStep: 30, durationMs: 3000 },
  still: { atStep: 240, holdMs: 600 },
  restartDelayMs: 1000,
};
