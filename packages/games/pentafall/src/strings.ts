// Every player-facing string. Vocabulary: jelly pieces, the neon well, crest, stash, streak, Full Five.
import { defineStrings, type HowToStep } from '@pocketcade/toolkit';

export const strings = defineStrings({
  title: 'Pentafall',
  stash: 'STASH',
  next: 'NEXT',
  score: 'Score',
  levelLabel: 'Level',
  lines: 'Lines',
  ready: 'Move or turn to start',
  readyTouch: 'Tap or drag to start',
  continuing: 'Continuing your last run',
  keyHint: '← → move · ↑ turn · ↓ faster · Space drop · C stash',
  keyList: '← →  move\n↑  turn\n↓  faster\nSpace  drop\nC  stash',
  turnLeft: 'Turn left',
  stashButton: 'Stash',
  drop: 'Drop',
  levelUp: 'Level {n}',
  newShapes: 'New jellies: {letters}',
  fullFive: 'Full Five!',
  sweep: 'Clean sweep!',
  wellFull: 'Well full',
});

export const howToSteps: readonly HowToStep[] = [
  {
    icon: 'arrows',
    keyboard: '← → move · ↓ drops faster',
    touch: 'Drag sideways to move · drag down to drop faster',
  },
  {
    icon: 'tap',
    keyboard: '↑ or X turns right · Z turns left',
    touch: 'Tap to turn · the Turn left button turns the other way',
  },
  {
    icon: 'swipe',
    keyboard: 'Space drops now · C stashes a piece',
    touch: 'Flick down to drop now · swipe up to stash',
  },
  {
    icon: 'info',
    keyboard: 'Fill all 12 cells of a row to clear it. Keep the pile below the dashed crest.',
    touch: 'Fill all 12 cells of a row to clear it. Keep the pile below the dashed crest.',
  },
];
