// @pocketcade/game-pebble-post: side-effect free; Phaser is imported as types only.
import { definePhaserGame } from '@pocketcade/toolkit/phaser';
import { attract } from './attract.ts';
import { meta } from './meta.ts';
import { createScenes } from './scene.ts';
import { howToSteps, strings } from './strings.ts';

export default definePhaserGame({
  meta,
  scenes: createScenes,
  config: {
    designSize: { width: 540, height: 960 },
    loop: 'realtime',
    backgroundColor: 'bg',
    touchAction: 'none',
    sfx: [
      'hit',
      'coin',
      'jump',
      'win',
      'lose',
      'click',
      // the power-up chime: a bright rising bell
      {
        name: 'power',
        params: {
          wave: 'sine',
          freq: 1046,
          attackMs: 2,
          sustainMs: 160,
          decayMs: 420,
          volume: 0.5,
          arp: [
            { atMs: 70, ratio: 1.26 },
            { atMs: 140, ratio: 1.5 },
            { atMs: 210, ratio: 2 },
          ],
          vibrato: { hz: 7, cents: 25 },
        },
      },
    ],
    // Pause lives in the HUD: the floating touch button would cover the top-right of the HUD row on phones.
    overlays: { howTo: { steps: howToSteps }, pauseButton: 'never', confirmRestart: true },
    attract,
    strings: { title: strings.title },
  },
});
