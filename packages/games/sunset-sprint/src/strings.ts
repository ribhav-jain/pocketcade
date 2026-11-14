// Every player-facing string.
import { defineStrings, type HowToStep } from '@pocketcade/toolkit';

export const strings = defineStrings({
  title: 'Sunset Sprint',
  time: 'Time',
  speed: 'Speed',
  distance: 'Distance',
  best: 'Best',
  newBest: 'New best',
  newBestPop: 'New best!',
  pause: 'Pause',
  kmh: '{n} km/h',
  metres: '{n} m',
  go: 'Go!',
  ready: 'Ready…',
  checkpoint: 'Checkpoint! +{n} s',
  /** painted on the arch */
  arch: 'CHECKPOINT',
  stage0: 'Coast Road',
  stage1: 'Red Canyon',
  stage2: 'Night City',
  closeOne: 'Close one!',
  timeUp: "Time's up!",
  over: 'Out of time · {n} overtakes',
  overOne: 'Out of time · 1 overtake',
  hintKeyboard: '← → or A D to steer · ↓ or S to brake',
  hintPointer: 'Hold the left or right side to steer',
  hintPointerBrake: 'Hold both sides, or here, to brake',
});

export const stageName = (stage: number) =>
  [strings.stage0, strings.stage1, strings.stage2][stage % 3]!;

const road =
  'Weave through traffic: a crash costs most of your speed. Sand, rock and kerbs off the road slow you right down, and curves push you wide, so steer into them.';
const clock =
  'Reach each checkpoint arch before the clock runs out to win more time. Your score is how far you drive.';

export const howToSteps: readonly HowToStep[] = [
  {
    icon: 'arrows',
    keyboard: 'Miso speeds up on her own. Steer with ← → or A D, and brake with ↓ or S.',
    pointer:
      'Miso speeds up on her own. Hold the left or right half to steer. Hold both halves, or the bottom middle, to brake.',
    touch:
      'Miso speeds up on her own. Hold the left or right half to steer. Hold both halves, or the bottom middle, to brake.',
  },
  { icon: 'info', keyboard: road, pointer: road, touch: road },
  { icon: 'trophy', keyboard: clock, pointer: clock, touch: clock },
];
