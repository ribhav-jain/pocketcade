// Every player-facing string.
import { defineStrings, type HowToStep } from '@pocketcade/toolkit';

export const strings = defineStrings({
  title: 'On the Dot',
  readyKeyboard: 'Press any key to launch Pip',
  readyPointer: 'Click to launch Pip',
  readyTouch: 'Tap to launch Pip',
  best: 'Best',
  newBest: 'New best',
  newBestPop: 'New best!',
  combo: 'Combo ×{k}',
  points: '+{n}',
  perfect: 'Perfect',
  goodEarly: 'Good · {ms} ms early',
  goodLate: 'Good · {ms} ms late',
  early: 'Early by {ms} ms',
  late: 'Late by {ms} ms',
  missed: 'Missed',
  reverse: 'Reverse!',
  coarseTimer: 'This browser limits timer precision, so timing may feel less exact.',
  zoneSunset: 'Sunset',
  zoneDusk: 'Dusk',
  zoneNight: 'Night',
  zoneAurora: 'Aurora',
  zoneDawn: 'Dawn',
});

const centre =
  'Hit the gold centre for a Perfect; Perfects in a row score more. One miss ends the run.';
const journey =
  'Every 10 hits the sky changes. Later Pip reverses and some stars drift along the ring.';

export const howToSteps: readonly HowToStep[] = [
  {
    icon: 'tap',
    keyboard:
      'Pip zips around the neon ring. Press any key the moment Pip crosses the glowing star.',
    pointer:
      'Pip zips around the neon ring. Click anywhere the moment Pip crosses the glowing star.',
    touch: 'Pip zips around the neon ring. Tap anywhere the moment Pip crosses the glowing star.',
  },
  { icon: 'trophy', keyboard: centre, pointer: centre, touch: centre },
  { icon: 'info', keyboard: journey, pointer: journey, touch: journey },
];
