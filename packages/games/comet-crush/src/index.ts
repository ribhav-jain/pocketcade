// @pocketcade/game-comet-crush: side-effect free; Phaser is imported as types only.
import { definePhaserGame } from '@pocketcade/toolkit/phaser';
import { attract } from './attract.ts';
import { meta } from './meta.ts';
import { createScenes } from './scene.ts';
import { howToSteps, strings } from './strings.ts';

/** Custom sounds: a shield "bwip", crystal chimes, an alloy clank, a fading power-down and a falling lost-ship tone. */
const BAT = {
  wave: 'sine',
  freq: 520,
  freqEnd: 820,
  attackMs: 2,
  sustainMs: 30,
  decayMs: 90,
  volume: 0.35,
} as const;
const CRUMBLE = {
  wave: 'triangle',
  freq: 1320,
  attackMs: 0,
  sustainMs: 20,
  decayMs: 200,
  volume: 0.32,
  arp: [
    { atMs: 35, ratio: 1.5 },
    { atMs: 70, ratio: 2 },
  ],
} as const;
const CLANK = {
  wave: 'square',
  freq: 210,
  freqEnd: 170,
  attackMs: 0,
  sustainMs: 20,
  decayMs: 110,
  volume: 0.22,
  duty: 0.25,
  lowpass: 2200,
  lowpassEnd: 700,
} as const;
const FADE = {
  wave: 'sine',
  freq: 660,
  freqEnd: 330,
  attackMs: 0,
  sustainMs: 80,
  decayMs: 160,
  volume: 0.3,
} as const;
const DROP = {
  wave: 'saw',
  freq: 300,
  freqEnd: 110,
  attackMs: 5,
  sustainMs: 120,
  decayMs: 260,
  volume: 0.35,
  lowpass: 1800,
} as const;

export default definePhaserGame({
  meta,
  scenes: createScenes,
  config: {
    designSize: { width: 960, height: 720 },
    loop: 'realtime',
    sfx: [
      'jump',
      'click',
      'hit',
      'coin',
      'explode',
      'win',
      'lose',
      { name: 'bat', params: BAT },
      { name: 'crumble', params: CRUMBLE },
      { name: 'clank', params: CLANK },
      { name: 'fade', params: FADE },
      { name: 'drop', params: DROP },
    ],
    overlays: { howTo: { steps: howToSteps }, pauseButton: 'always', confirmRestart: true },
    attract,
    strings: { title: strings.title },
  },
});
