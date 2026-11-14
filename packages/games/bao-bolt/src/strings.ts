// Every player-facing string.
import { defineStrings, type HowToStep } from '@pocketcade/toolkit';

export const strings = defineStrings({
  title: 'Bao Bolt',
  stageLabel: 'Bao Bolt. Jump with Space, slide with Down.',
  readyKeyboard: 'Press Space to run',
  readyPointer: 'Click to run',
  readyTouch: 'Tap to run',
  best: 'Best: {best}',
  scoreLabel: 'Score',
  scoreLabelBest: 'Score · Best {best}',
  distanceLabel: 'Distance',
  coinsLabel: 'Coins',
  metres: '{m} m',
  gulpClose: 'Gulp is close!',
  squawk: 'Squawk!',
  max: 'MAX',
  pastBest: 'Past your best!',
  entering: 'Now entering',
  gameOver: 'Gulped at {m} m · {crumbs} coins',
});

/** District names, in route order (one per entry of THEMES). */
export const districts = ['Dumpling Alley', 'Neon Row', 'Crane Harbour', 'Temple Gardens'] as const;

export const howToSteps: readonly HowToStep[] = [
  {
    icon: 'key',
    keyboard: 'Space, ↑ or W to jump steamer stacks and crabs. Hold for a higher jump.',
    pointer: 'Click to jump steamer stacks and crabs. Hold for a higher jump.',
    touch: 'Tap to jump steamer stacks and crabs. Hold for a higher jump.',
  },
  {
    icon: 'swipe',
    keyboard: '↓ or S to slide under hanging shop signs.',
    pointer: 'Right-click to slide under hanging shop signs.',
    touch: 'Swipe down to slide under hanging shop signs.',
  },
  {
    icon: 'trophy',
    keyboard: 'Grab sesame coins. Every 10 in a row raise your multiplier, up to ×5.',
    touch: 'Grab sesame coins. Every 10 in a row raise your multiplier, up to ×5.',
  },
  {
    icon: 'info',
    keyboard:
      "Bump into something and Gulp the gull swoops in. Bump again before he leaves and you're lunch. Coins shoo him off sooner.",
    touch:
      "Bump into something and Gulp the gull swoops in. Bump again before he leaves and you're lunch. Coins shoo him off sooner.",
  },
];
