import { definePhaserGame } from '@pocketcade/toolkit/phaser';
import { attract } from './attract.ts';
import { meta } from './meta.ts';
import { createScenes } from './scene.ts';
import { howToSteps, strings } from './strings.ts';

/** Lantern tones A4, C5, E5, G5: 350 ms, never longer than the shortest highlight. */
const pad = (freq: number) =>
  ({
    wave: 'triangle',
    freq,
    attackMs: 5,
    sustainMs: 220,
    decayMs: 125,
    volume: 0.45,
    lowpass: 4000,
  }) as const;

export default definePhaserGame({
  meta,
  scenes: createScenes,
  config: {
    designSize: { width: 720, height: 720 },
    loop: 'turn-based',
    sfx: [
      'click',
      'coin',
      'hit',
      'win',
      'lose',
      ...[440, 523.25, 659.25, 783.99].map((f, i) => ({ name: `pad${i + 1}`, params: pad(f) })),
    ],
    overlays: { howTo: { steps: howToSteps }, pauseButton: 'always', confirmRestart: true },
    attract,
    strings: { title: strings.title },
  },
});
