// @pocketcade/game-molehills: side-effect free; Phaser is imported as types only.
import { definePhaserGame } from '@pocketcade/toolkit/phaser';
import { attract } from './attract.ts';
import { meta } from './meta.ts';
import { createScenes } from './scene.ts';
import { howToSteps, strings } from './strings.ts';

/** Custom sounds; attack/sustain/decay in ms. Moles yawn; nothing explodes. */
const PLANT = {
  wave: 'sine',
  freq: 660,
  freqEnd: 990,
  attackMs: 2,
  sustainMs: 30,
  decayMs: 90,
  volume: 0.35,
} as const;
const UNPLANT = {
  wave: 'sine',
  freq: 990,
  freqEnd: 660,
  attackMs: 2,
  sustainMs: 20,
  decayMs: 80,
  volume: 0.3,
} as const;
const YAWN = {
  wave: 'triangle',
  freq: 330,
  freqEnd: 165,
  attackMs: 40,
  sustainMs: 300,
  decayMs: 400,
  volume: 0.4,
  vibrato: { hz: 5, cents: 40 },
  lowpass: 1800,
  lowpassEnd: 600,
} as const;

export default definePhaserGame({
  meta,
  scenes: createScenes,
  config: {
    designSize: { width: 1000, height: 1000 },
    loop: 'turn-based',
    backgroundColor: 'bg',
    touchAction: 'none',
    sfx: [
      'click',
      'coin',
      'win',
      'lose',
      { name: 'plant', params: PLANT },
      { name: 'unplant', params: UNPLANT },
      { name: 'yawn', params: YAWN },
    ],
    overlays: { howTo: { steps: howToSteps }, pauseButton: 'auto', confirmRestart: true },
    attract,
    strings: { title: strings.title },
  },
});
