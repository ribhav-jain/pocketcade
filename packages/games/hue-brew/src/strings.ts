// Every player-facing string.
import { defineStrings, type HowToStep } from '@pocketcade/toolkit';

export const strings = defineStrings({
  title: 'Hue Brew',
  level: 'Level {n}',
  moves: '{moves} · par {par}',
  undo: 'Undo',
  restart: 'Restart',
  restartSure: 'Sure?',
  hint: 'Hint',
  bottle: 'Bottle',
  restartConfirm: 'Restart this level?',
  clearTitle: 'Level {n} served!',
  clearMoves: '{moves} moves · par {par}',
  clearOneMove: '1 move · par {par}',
  usedHint: 'With a hint',
  usedBottle: 'With the extra bottle',
  usedBoth: 'With a hint and the extra bottle',
  starsSoFar: '{n} stars so far',
  oneStar: '1 star so far',
  next: 'Tap for the next level',
  nextKey: 'Press Enter for the next level',
  stuck: 'No way through from here. Undo a few pours or restart.',
  bottleUsed: 'One extra bottle per level.',
  mysteryIntro: 'Mystery layers show their flavour once uncovered.',
  themeLantern: 'Lantern evening',
  themeRain: 'Rainy window',
  themeDawn: 'Early dawn',
  themeFestival: 'Festival lights',
});

export const howToSteps: readonly HowToStep[] = [
  {
    icon: 'tap',
    keyboard: 'Move with the arrow keys. Enter lifts a bottle, and Enter on another bottle pours.',
    touch: 'Tap a bottle to lift it, then tap another bottle to pour into it.',
    pointer: 'Click a bottle to lift it, then click another bottle to pour into it.',
  },
  {
    icon: 'info',
    keyboard: 'A drink pours only onto the same flavour or into an empty bottle.',
    touch: 'A drink pours only onto the same flavour or into an empty bottle.',
  },
  {
    icon: 'trophy',
    keyboard: 'Fill every bottle with one flavour. Fewer pours earn more stars.',
    touch: 'Fill every bottle with one flavour. Fewer pours earn more stars.',
  },
  {
    icon: 'restart',
    keyboard: 'U takes a pour back, H gives a hint and B adds one spare bottle, all free.',
    touch: 'Undo, Hint and one extra Bottle are free to use whenever you like.',
  },
];
