// @pocketcade/game-sunset-sprint: importing this has no side effects; Phaser is imported as types only.
import { definePhaserGame } from '@pocketcade/toolkit/phaser';
import { attract } from './attract.ts';
import { meta } from './meta.ts';
import { createScenes } from './scene.ts';
import { howToSteps, strings } from './strings.ts';

export default definePhaserGame({
  meta,
  scenes: createScenes,
  config: {
    designSize: { width: 960, height: 720 },
    loop: 'realtime',
    backgroundColor: 'bg',
    touchAction: 'none',
    sfx: ['hit', 'coin', 'win', 'lose', 'click'],
    // Pause lives in the HUD: the floating touch button would cover the top-right of the road view on phones.
    overlays: { howTo: { steps: howToSteps }, pauseButton: 'never', confirmRestart: true },
    attract,
    strings: { title: strings.title },
  },
});
