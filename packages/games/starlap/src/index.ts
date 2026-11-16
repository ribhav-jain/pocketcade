// @pocketcade/game-starlap. Importing this module does no work; Phaser is imported as types only.
import { definePhaserGame } from '@pocketcade/toolkit/phaser';
import { attract } from './attract.ts';
import { meta } from './meta.ts';
import { createScenes } from './scene.ts';
import { howToSteps, strings } from './strings.ts';

export default definePhaserGame({
  meta,
  scenes: createScenes,
  config: {
    // The ring fills a square; the frame may be anything from 9:16 to 16:9 and scenery covers the rest.
    designSize: { width: 600, height: 600 },
    loop: 'realtime',
    backgroundColor: 'bg',
    touchAction: 'none',
    sfx: [
      'click',
      'jump',
      'coin',
      'hit',
      'win',
      'lose',
      // a Good: one soft low blip, nothing like the bright two-note Perfect chime
      {
        name: 'good',
        params: {
          wave: 'triangle',
          freq: 392,
          freqEnd: 440,
          attackMs: 2,
          sustainMs: 30,
          decayMs: 90,
          volume: 0.45,
        },
      },
      // Pip turns around
      {
        name: 'swish',
        params: {
          wave: 'noise',
          freq: 0,
          attackMs: 20,
          sustainMs: 30,
          decayMs: 170,
          volume: 0.3,
          lowpass: 500,
          lowpassEnd: 3200,
        },
      },
    ],
    overlays: { howTo: { steps: howToSteps }, pauseButton: 'always', confirmRestart: true },
    attract,
    strings: { title: strings.title },
  },
});
