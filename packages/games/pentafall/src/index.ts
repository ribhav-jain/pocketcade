// @pocketcade/game-pentafall — side-effect free; Phaser is imported as types only.
import { definePhaserGame } from '@pocketcade/toolkit/phaser';
import { attract } from './attract.ts';
import { meta } from './meta.ts';
import { createScenes } from './scene.ts';
import { howToSteps, strings } from './strings.ts';

/** Custom sounds; attack/sustain/decay in ms. */
const SHIFT = {
  wave: 'triangle',
  freq: 700,
  attackMs: 0,
  sustainMs: 6,
  decayMs: 28,
  volume: 0.16,
} as const;
const TURN = {
  wave: 'square',
  duty: 0.25,
  freq: 520,
  freqEnd: 780,
  attackMs: 0,
  sustainMs: 12,
  decayMs: 60,
  volume: 0.2,
} as const;
const BUMP = {
  wave: 'triangle',
  freq: 180,
  attackMs: 0,
  sustainMs: 10,
  decayMs: 60,
  volume: 0.2,
  lowpass: 1200,
} as const;
const THUNK = {
  wave: 'sine',
  freq: 150,
  freqEnd: 70,
  attackMs: 0,
  sustainMs: 20,
  decayMs: 140,
  volume: 0.5,
  lowpass: 900,
} as const;
const RISE = {
  wave: 'square',
  duty: 0.5,
  freq: 392,
  freqEnd: 784,
  attackMs: 5,
  sustainMs: 120,
  decayMs: 160,
  volume: 0.3,
} as const;

export default definePhaserGame({
  meta,
  scenes: createScenes,
  config: {
    designSize: { width: 720, height: 720 },
    loop: 'realtime',
    backgroundColor: 'bg',
    touchAction: 'none',
    sfx: [
      'hit',
      'coin',
      'win',
      'click',
      'lose',
      { name: 'shift', params: SHIFT },
      { name: 'turn', params: TURN },
      { name: 'bump', params: BUMP },
      { name: 'thunk', params: THUNK },
      { name: 'rise', params: RISE },
    ],
    overlays: { howTo: { steps: howToSteps }, pauseButton: 'auto', confirmRestart: true },
    attract,
    strings: { title: strings.title },
  },
});
