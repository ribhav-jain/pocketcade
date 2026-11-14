// Every player-facing string. A sunny garden: moles snooze in nightcaps and wake up grumpy; nothing explodes.
import { defineStrings, type HowToStep } from '@pocketcade/toolkit';

export const strings = defineStrings({
  title: 'Molehills',
  garden: 'Garden',
  field: 'Field',
  meadow: 'Meadow',
  sizeLabel: '{name} {cols}×{rows}',
  tab: '{n} {name}',
  ready: 'Dig any patch to start',
  firstFlower: 'Dig your first patch before planting daisies.',
  misplaced: 'This daisy may be on a safe patch.',
  cleared: '{name} cleared!',
  woke: 'A mole woke up!',
  changeSize: 'Change size',
  viewBoard: 'View board',
  newBoard: 'New board',
  hint: 'Hint',
  zoom: 'Zoom',
  dig: 'Dig',
  plant: 'Plant',
  streak: 'Snooze streak: {n}',
  molesLabel: 'Moles left',
  boardLabel: 'Garden bed',
  timeLabel: 'Time',
  bestLabel: 'Best {time}',
  newBest: 'New best time!',
  bigger: 'Ready for a bigger garden?',
});

export const howToSteps: readonly HowToStep[] = [
  {
    icon: 'tap',
    keyboard: 'Arrow keys move. Space digs a patch. Your first dig is always safe.',
    pointer: 'Click a patch to dig. Your first dig is always safe.',
    touch: 'Tap a patch to dig. Your first dig is always safe.',
  },
  {
    icon: 'info',
    keyboard: 'A number counts the moles napping in the 8 patches around it.',
    touch: 'A number counts the moles napping in the 8 patches around it.',
  },
  {
    icon: 'tap',
    keyboard:
      'Press F to plant a daisy where you know a mole sleeps. Daisies stop you digging there.',
    pointer: 'Right-click (or hold, or switch to Plant) to put a daisy on a sleeping mole.',
    touch: 'Hold a patch, or switch to Plant, to put a daisy on a sleeping mole.',
  },
  {
    icon: 'trophy',
    keyboard:
      'Dig every safe patch to clear the garden. Space on a number with all its daisies digs the rest.',
    pointer:
      'Dig every safe patch to clear the garden. Click a number with all its daisies to dig the rest.',
    touch:
      'Dig every safe patch to clear the garden. Tap a number with all its daisies to dig the rest.',
  },
];
