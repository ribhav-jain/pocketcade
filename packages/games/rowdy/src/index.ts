// Side-effect free: Phaser is imported as types only and loaded by the toolkit at mount.
import { definePhaserGame } from '@pocketcade/toolkit/phaser';
import { attract } from './attract.ts';
import { meta } from './meta.ts';
import { createScenes } from './scene.ts';
import { howToSteps, strings } from './strings.ts';

/** Custom sounds; attack/sustain/decay in ms. */
const DROP = {
  wave: 'triangle',
  freq: 180,
  freqEnd: 90,
  attackMs: 0,
  sustainMs: 25,
  decayMs: 140,
  volume: 0.5,
  lowpass: 1600,
} as const;
const DRAW = {
  wave: 'triangle',
  freq: 330,
  freqEnd: 262,
  attackMs: 5,
  sustainMs: 120,
  decayMs: 260,
  volume: 0.35,
} as const;

export default definePhaserGame({
  meta,
  scenes: createScenes,
  config: {
    designSize: { width: 720, height: 720 },
    loop: 'turn-based',
    sfx: [
      'click',
      'hit',
      'win',
      'lose',
      'coin',
      { name: 'drop', params: DROP },
      { name: 'draw', params: DRAW },
    ],
    overlays: { howTo: { steps: howToSteps }, pauseButton: 'auto', confirmRestart: true },
    attract,
    strings: { title: strings.title, restartConfirm: strings.restartConfirm },
  },
});
