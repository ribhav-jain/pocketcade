// @pocketcade/game-snugfit — side-effect free; Phaser is imported as types only.
import { definePhaserGame } from '@pocketcade/toolkit/phaser';
import { attract } from './attract.ts';
import { DESIGN } from './layout.ts';
import { meta } from './meta.ts';
import { createScenes } from './scene.ts';
import { howToSteps, strings } from './strings.ts';

/** A patch lifted off the tray. */
const LIFT = {
  wave: 'sine',
  freq: 520,
  freqEnd: 780,
  attackMs: 2,
  sustainMs: 20,
  decayMs: 70,
  volume: 0.28,
} as const;
/** A patch pressed onto the quilt: a soft, low pat. */
const PAT = {
  wave: 'triangle',
  freq: 260,
  freqEnd: 130,
  attackMs: 1,
  sustainMs: 24,
  decayMs: 90,
  volume: 0.5,
  lowpass: 1800,
} as const;
/** The needle zipping along a full line. */
const ZIP = {
  wave: 'saw',
  freq: 380,
  freqEnd: 1500,
  attackMs: 4,
  sustainMs: 110,
  decayMs: 90,
  volume: 0.2,
  lowpass: 2600,
} as const;
/** A patch that has nowhere to go. */
const NOPE = {
  wave: 'triangle',
  freq: 210,
  freqEnd: 150,
  attackMs: 2,
  sustainMs: 40,
  decayMs: 90,
  volume: 0.32,
} as const;

export default definePhaserGame({
  meta,
  scenes: createScenes,
  config: {
    designSize: DESIGN,
    loop: 'turn-based',
    sfx: [
      'coin',
      'win',
      'lose',
      { name: 'lift', params: LIFT },
      { name: 'pat', params: PAT },
      { name: 'zip', params: ZIP },
      { name: 'nope', params: NOPE },
    ],
    overlays: { howTo: { steps: howToSteps }, pauseButton: 'always', confirmRestart: true },
    attract,
    strings: { title: strings.title },
  },
});
