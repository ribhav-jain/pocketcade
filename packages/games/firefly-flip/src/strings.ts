// Every player-facing string.
import { defineStrings, type HowToStep } from '@pocketcade/toolkit';

export const strings = defineStrings({
  title: 'Firefly Flip',
  pairs: 'Pairs',
  pairsBlurb: 'Match the glowing jars',
  follow: 'Follow',
  followBlurb: 'Sing back the lantern song',
  chipNew: 'New',
  chipResume: 'Resume',
  chipBest: 'Best {n}',
  play: 'Play',
  bestLength: 'Best length {n}',
  modes: 'Modes',
  moves: 'Moves',
  found: 'Pairs',
  time: 'Time',
  length: 'Length',
  best: 'Best',
  secondLookReady: 'Second look: ready',
  secondLookUsed: 'Second look: used',
  secondLookNow: 'Second look!',
  watch: 'Watch…',
  yourTurn: 'Your turn!',
  bright: 'Bright!',
  allAglow: 'All aglow!',
  quitHint: 'Press Modes again to end this run',
  cleared: 'Cleared in {moves} moves',
  followOver: 'Length {n}',
  changeMode: 'Change mode',
});

export const howToSteps: readonly HowToStep[] = [
  {
    icon: 'tap',
    keyboard:
      'Pairs: move with the arrow keys and press Space to peek into a jar. Match every pair of glowing glyphs.',
    pointer:
      'Pairs: click two jars to peek inside. Match every pair of glowing glyphs in as few moves as you can.',
    touch:
      'Pairs: tap two jars to peek inside. Match every pair of glowing glyphs in as few moves as you can.',
  },
  {
    icon: 'key',
    keyboard:
      'Follow: watch the lanterns sing, then press 1 to 4 in the same order. The song grows each round.',
    pointer:
      'Follow: watch the lanterns sing, then click them in the same order. The song grows each round.',
    touch:
      'Follow: watch the lanterns sing, then tap them in the same order. The song grows each round.',
  },
  {
    icon: 'info',
    keyboard: 'One slip per Follow run is forgiven: Lumi gives you a second look at the same song.',
    touch: 'One slip per Follow run is forgiven: Lumi gives you a second look at the same song.',
  },
];
