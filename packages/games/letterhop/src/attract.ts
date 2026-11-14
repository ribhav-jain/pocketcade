// Attract script: plays cold → cord → card → ward → warm in the letter picker.
// Virtual input uses named actions ("bead:2", "key:r", "hop") instead of screen taps, so it never depends on layout.
import type { AttractScript, VirtualInput } from '@pocketcade/toolkit';

export const ATTRACT_PUZZLE = { start: 'cold', goal: 'warm', par: 4 } as const;

/** [hop start step, bead index, letter] (letters 3, 2, 1, 4 change l→r, o→a, c→w, d→m). */
const HOPS = [
  [36, 2, 'r'],
  [72, 1, 'a'],
  [108, 0, 'w'],
  [144, 3, 'm'],
] as const;

const press = (action: string): VirtualInput[] => [
  { action, phase: 'press' },
  { action, phase: 'release' },
];

export const attract: AttractScript = {
  seed: 'letterhop:attract',
  drive(step) {
    for (const [s, bead, letter] of HOPS) {
      if (step === s) return press(`bead:${bead}`);
      if (step === s + 12) return press(`key:${letter}`);
      if (step === s + 24) return press('hop');
    }
  },
  clip: { startStep: 30, durationMs: 3000 },
  still: { atStep: 240, holdMs: 600 },
  restartDelayMs: 1000,
};
