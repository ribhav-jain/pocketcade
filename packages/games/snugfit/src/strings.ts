// Every player-facing string.
import { defineStrings, type HowToStep } from '@pocketcade/toolkit';

export const strings = defineStrings({
  title: 'Snugfit',
  score: 'Score',
  best: 'Best',
  noBest: '—',
  nextStreak: 'Next stitch ×{n}',
  gameOverTitle: 'No room left',
  popStreak: 'Streak ×{n}',
  popDouble: 'Double stitch!',
  popTriple: 'Triple stitch!',
  popMega: 'Mega stitch!',
  popClean: 'Clean quilt!',
  toastAfternoon: 'Afternoon sun',
  toastGolden: 'Golden hour',
  toastNight: 'Lamplight',
});

export const howToSteps: readonly HowToStep[] = [
  {
    icon: 'drag',
    keyboard: 'Pick a patch with 1, 2 or 3, move it with the arrow keys, sew it on with Enter.',
    touch: 'Drag a patch onto the quilt and drop it where it fits.',
    pointer: 'Drag a patch onto the quilt and drop it where it fits.',
  },
  {
    icon: 'info',
    keyboard: 'Fill a whole row or column to stitch it up and clear it.',
    touch: 'Fill a whole row or column to stitch it up and clear it.',
  },
  {
    icon: 'trophy',
    keyboard: 'Stitch several lines at once, or on patches in a row, to multiply your score.',
    touch: 'Stitch several lines at once, or on patches in a row, to multiply your score.',
  },
  {
    icon: 'info',
    keyboard: 'The game ends when no waiting patch fits. Your quilt is saved as you go.',
    touch: 'The game ends when no waiting patch fits. Your quilt is saved as you go.',
  },
];
