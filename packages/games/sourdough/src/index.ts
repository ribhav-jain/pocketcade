// Side-effect free; Phaser is imported as types only.
import { definePhaserGame } from '@pocketcade/toolkit/phaser';
import { attract } from './attract.ts';
import { meta } from './meta.ts';
import { createScenes } from './scene.ts';
import { howToSteps, strings } from './strings.ts';

/** Card sounds; attack/sustain/decay in ms. */
const CARD_PLACE = {
  wave: 'noise',
  freq: 0,
  attackMs: 0,
  sustainMs: 8,
  decayMs: 70,
  volume: 0.35,
  lowpass: 2200,
  lowpassEnd: 700,
} as const;
const CARD_FLIP = {
  wave: 'noise',
  freq: 0,
  attackMs: 0,
  sustainMs: 5,
  decayMs: 45,
  volume: 0.22,
  lowpass: 5000,
  lowpassEnd: 1800,
} as const;
const RIFFLE = {
  wave: 'noise',
  freq: 0,
  attackMs: 10,
  sustainMs: 140,
  decayMs: 220,
  volume: 0.28,
  lowpass: 3200,
  lowpassEnd: 900,
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
      'hit',
      'win',
      { name: 'cardPlace', params: CARD_PLACE },
      { name: 'cardFlip', params: CARD_FLIP },
      { name: 'riffle', params: RIFFLE },
    ],
    overlays: { howTo: { steps: howToSteps }, pauseButton: 'never', confirmRestart: true },
    attract,
    strings: { title: strings.title },
  },
});
