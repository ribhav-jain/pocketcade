// Every player-facing string.
import { defineStrings, type HowToStep } from '@pocketcade/toolkit';

export const strings = defineStrings({
  title: 'Pebble Post',
  score: 'Score',
  best: 'Best',
  newBest: 'New best',
  newBestPop: 'New best!',
  letters: 'Letters',
  pause: 'Pause',
  ready: 'Ready…',
  go: 'Go!',
  secs: '{n} s',
  scarf: 'Scarf',
  bell: 'Mail bell',
  scarfGot: 'Scarf on!',
  bellGot: 'Mail bell!',
  scarfSaved: 'Scarf saved you!',
  bonusHop: 'Hop +{n}',
  bonusTuck: 'Tuck +{n}',
  bonusClose: 'Close call +{n}',
  zone0: 'Snowy Canyon',
  zone1: 'Aurora Night',
  zone2: 'Crystal Cave',
  zoneSub: '{n} m',
  over: 'Bonk! · {n} letters delivered',
  overOne: 'Bonk! · 1 letter delivered',
  hintKeyboard: '← → change lane\n↑ or Space hop · ↓ tuck',
  hintTouch: 'Swipe to change lane, hop and tuck',
  hintPointer: 'Drag to change lane, hop and tuck',
  hintLane: 'Lane',
  hintHop: 'Hop',
  hintTuck: 'Tuck',
});

export const zoneName = (zone: number) => [strings.zone0, strings.zone1, strings.zone2][zone % 3]!;

const moves =
  'Snow drifts and logs are low: hop over them. Icicle arches and mail banners are open underneath: tuck under them. Ice pillars and mail sleds block the lane: go around.';
const post =
  'You score 1 a metre, 5 a letter and 10 for each obstacle you hop, tuck under or dodge late. A scarf takes one hit for you; a mail bell pulls in letters from every lane.';

export const howToSteps: readonly HowToStep[] = [
  {
    icon: 'swipe',
    keyboard:
      'Pebble slides on her own. ← → or A D change lane, ↑ W or Space hop, ↓ or S tuck (in the air, it drops her fast).',
    pointer:
      'Pebble slides on her own. Drag left or right to change lane, up to hop and down to tuck (in the air, it drops her fast).',
    touch:
      'Pebble slides on her own. Swipe left or right to change lane, up to hop and down to tuck (in the air, it drops her fast).',
  },
  { icon: 'info', keyboard: moves, pointer: moves, touch: moves },
  { icon: 'trophy', keyboard: post, pointer: post, touch: post },
];
