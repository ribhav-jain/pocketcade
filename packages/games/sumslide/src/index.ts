// @pocketcade/game-sumslide. Importing this module does no work; Phaser is imported as types only.
import type { SfxParams } from '@pocketcade/toolkit';
import { definePhaserGame } from '@pocketcade/toolkit/phaser';
import { attract } from './attract.ts';
import { meta } from './meta.ts';
import { createScenes } from './scene.ts';
import { howToSteps, strings } from './strings.ts';

/** A soft thud for a slide with no merge. */
const SLIDE: SfxParams = {
  wave: 'triangle',
  freq: 240,
  freqEnd: 150,
  attackMs: 0,
  sustainMs: 8,
  decayMs: 55,
  volume: 0.3,
};
/** A two-note pop for a merge; the scene raises its pitch with the tile's value. */
const MERGE: SfxParams = {
  wave: 'triangle',
  freq: 523,
  attackMs: 2,
  sustainMs: 40,
  decayMs: 170,
  volume: 0.5,
  arp: [{ atMs: 45, ratio: 1.5 }],
};
const ECHO: SfxParams = {
  wave: 'sine',
  freq: 523,
  freqEnd: 1046,
  attackMs: 5,
  sustainMs: 90,
  decayMs: 200,
  volume: 0.35,
  vibrato: { hz: 6, cents: 20 },
};
const UNDO: SfxParams = {
  wave: 'triangle',
  freq: 560,
  freqEnd: 280,
  attackMs: 0,
  sustainMs: 30,
  decayMs: 90,
  volume: 0.35,
};

export default definePhaserGame({
  meta,
  scenes: createScenes,
  config: {
    designSize: { width: 720, height: 720 },
    loop: 'turn-based',
    sfx: [
      'click',
      'win',
      'lose',
      { name: 'slide', params: SLIDE },
      { name: 'merge', params: MERGE },
      { name: 'echo', params: ECHO },
      { name: 'undo', params: UNDO },
    ],
    overlays: { howTo: { steps: howToSteps }, pauseButton: 'always', confirmRestart: true },
    attract,
    strings: { title: strings.title },
  },
});
