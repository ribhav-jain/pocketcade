// Every player-facing string.
import { defineStrings, type HowToStep } from '@pocketcade/toolkit';

export const strings = defineStrings({
  title: 'Comet Crush',
  score: 'Score',
  wall: 'Wall {n}',
  ships: 'Ships',
  launchKeyboard: 'Press Space to launch',
  launchPointer: 'Click to launch',
  launchTouch: 'Tap to launch',
  wingspan: 'Wingspan',
  scatter: 'Scatter',
  stasis: 'Stasis',
  seconds: '{s}s',
  wallDown: 'Wall {n} shattered!',
  clearBonus: 'Clear +1,000',
  speedBonus: 'Speed +{n}',
  cleanBonus: 'Flawless +500',
  shipRepaired: 'Ship repaired +1',
  continuing: 'Continuing wall {n}',
  continueFrom: 'Continue from wall {n}',
  outOfShips: 'Out of ships',
  everyWall: 'Every wall cleared!',
});

const aim = 'Hit the comet with a wing to angle it sideways; mid-ship sends it straight up.';
const goal =
  'Shatter every crystal; alloy plates never break. Catch falling pods for Wingspan, Scatter and Stasis.';

export const howToSteps: readonly HowToStep[] = [
  {
    icon: 'drag',
    keyboard: 'Steer the Skiff with ← → or A D. Hold Shift to fine-tune.',
    pointer: 'Move the mouse to steer the Skiff.',
    touch: 'Drag anywhere to steer the Skiff.',
  },
  {
    icon: 'tap',
    keyboard: 'Press Space to launch the comet.',
    pointer: 'Click to launch the comet.',
    touch: 'Tap to launch the comet.',
  },
  { icon: 'info', keyboard: aim, touch: aim },
  { icon: 'trophy', keyboard: goal, touch: goal },
];
