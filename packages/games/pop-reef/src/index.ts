// @pocketcade/game-pop-reef: importing it does no work; Phaser is imported as types only.
import { definePhaserGame } from '@pocketcade/toolkit/phaser';
import { attract } from './attract.ts';
import { meta } from './meta.ts';
import { createScenes } from './scene.ts';
import { howToSteps, strings } from './strings.ts';

export default definePhaserGame({
  meta,
  scenes: createScenes,
  config: {
    designSize: { width: 720, height: 960 },
    loop: 'realtime',
    backgroundColor: 'bg',
    touchAction: 'none',
    sfx: [
      'hit',
      'coin',
      'win',
      'lose',
      'click',
      'explode',
      {
        name: 'pop',
        params: {
          wave: 'sine',
          freq: 520,
          freqEnd: 1040,
          attackMs: 2,
          sustainMs: 20,
          decayMs: 70,
          volume: 0.5,
        },
      },
      {
        name: 'puff',
        params: {
          wave: 'noise',
          freq: 0,
          attackMs: 4,
          sustainMs: 30,
          decayMs: 90,
          volume: 0.35,
          lowpass: 2600,
          lowpassEnd: 500,
        },
      },
    ],
    // Pause lives in the HUD: on phones the floating button would cover the top-right corner of the reef.
    overlays: { howTo: { steps: howToSteps }, pauseButton: 'never', confirmRestart: true },
    attract,
    strings: { title: strings.title, restartConfirm: strings.restartConfirm },
  },
});
