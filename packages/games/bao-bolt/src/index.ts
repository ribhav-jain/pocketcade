// @pocketcade/game-bao-bolt. Importing this module does no work; Phaser is only loaded when the game mounts.
import { definePhaserGame } from '@pocketcade/toolkit/phaser';
import { attract } from './attract.ts';
import { meta } from './meta.ts';
import { createScenes } from './scene.ts';
import { howToSteps, strings } from './strings.ts';

/** Sounds the toolkit bank does not have: the multiplier chime, the slide scrape and Gulp's squawk. */
const MULT = {
  wave: 'square',
  duty: 0.25,
  freq: 659,
  attackMs: 0,
  sustainMs: 80,
  decayMs: 160,
  volume: 0.35,
  arp: [
    { atMs: 50, ratio: 1.26 },
    { atMs: 100, ratio: 1.498 },
  ],
} as const;
const SLIDE = {
  wave: 'noise',
  freq: 0,
  attackMs: 0,
  sustainMs: 120,
  decayMs: 180,
  volume: 0.35,
  lowpass: 1800,
  lowpassEnd: 300,
} as const;
const SQUAWK = {
  wave: 'saw',
  freq: 520,
  freqEnd: 380,
  attackMs: 5,
  sustainMs: 120,
  decayMs: 160,
  volume: 0.4,
  vibrato: { hz: 18, cents: 80 },
  lowpass: 3000,
} as const;

export default definePhaserGame({
  meta,
  scenes: createScenes,
  config: {
    designSize: { width: 960, height: 540 },
    loop: 'realtime',
    sfx: [
      'jump',
      'coin',
      'hit',
      'lose',
      'click',
      { name: 'mult', params: MULT },
      { name: 'slide', params: SLIDE },
      { name: 'squawk', params: SQUAWK },
    ],
    overlays: { howTo: { steps: howToSteps }, pauseButton: 'auto', confirmRestart: true },
    attract,
    strings: { title: strings.title },
  },
});
