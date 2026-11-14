// @pocketcade/game-glowworm: side-effect free; Phaser is imported as types only.
import { definePhaserGame } from '@pocketcade/toolkit/phaser';
import { H, W } from './art.ts';
import { attract } from './attract.ts';
import { meta } from './meta.ts';
import { createScenes } from './scene.ts';
import { howToSteps, strings } from './strings.ts';

export default definePhaserGame({
  meta,
  scenes: createScenes,
  config: {
    designSize: { width: W, height: H },
    loop: 'realtime',
    backgroundColor: 'bg',
    touchAction: 'none',
    sfx: [
      'coin',
      'win',
      'lose',
      'hit',
      'click',
      {
        name: 'gold',
        params: {
          wave: 'triangle',
          freq: 1175,
          attackMs: 0,
          sustainMs: 150,
          decayMs: 320,
          volume: 0.45,
          arp: [
            { atMs: 70, ratio: 1.26 },
            { atMs: 140, ratio: 1.498 },
            { atMs: 210, ratio: 2 },
          ],
        },
      },
      {
        name: 'whoosh',
        params: {
          wave: 'noise',
          freq: 0,
          attackMs: 140,
          sustainMs: 60,
          decayMs: 320,
          volume: 0.3,
          lowpass: 400,
          lowpassEnd: 2600,
        },
      },
    ],
    // Pause lives in the HUD: on phones the floating button would cover the top-right corner of the board.
    overlays: { howTo: { steps: howToSteps }, pauseButton: 'never', confirmRestart: true },
    attract,
    strings: { title: strings.title },
  },
});
