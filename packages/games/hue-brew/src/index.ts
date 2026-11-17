// @pocketcade/game-hue-brew — side-effect free; Phaser is imported as types only.
import { definePhaserGame } from '@pocketcade/toolkit/phaser';
import { attract } from './attract.ts';
import { DESIGN } from './layout.ts';
import { meta } from './meta.ts';
import { createScenes } from './scene.ts';
import { howToSteps, strings } from './strings.ts';

/** A bottle lifted off the shelf. */
const LIFT = {
  wave: 'sine',
  freq: 540,
  freqEnd: 800,
  attackMs: 2,
  sustainMs: 18,
  decayMs: 70,
  volume: 0.26,
} as const;
/** A bottle set back down. */
const SET = {
  wave: 'triangle',
  freq: 330,
  freqEnd: 240,
  attackMs: 1,
  sustainMs: 12,
  decayMs: 60,
  volume: 0.3,
  lowpass: 2000,
} as const;
/** One layer of drink going in; played higher for each layer the bottle already holds. */
const GLUG = {
  wave: 'sine',
  freq: 210,
  freqEnd: 430,
  attackMs: 6,
  sustainMs: 26,
  decayMs: 70,
  volume: 0.55,
  vibrato: { hz: 28, cents: 90 },
} as const;
/** The cork going into a finished bottle. */
const POP = {
  wave: 'triangle',
  freq: 980,
  freqEnd: 260,
  attackMs: 0,
  sustainMs: 8,
  decayMs: 70,
  volume: 0.5,
} as const;
const CHIME = {
  wave: 'sine',
  freq: 1175,
  attackMs: 3,
  sustainMs: 90,
  decayMs: 420,
  volume: 0.3,
  arp: [{ atMs: 90, ratio: 1.5 }],
} as const;
/** A pour that is not allowed. */
const NOPE = {
  wave: 'triangle',
  freq: 210,
  freqEnd: 150,
  attackMs: 2,
  sustainMs: 40,
  decayMs: 90,
  volume: 0.32,
} as const;
const UNDO = {
  wave: 'sine',
  freq: 620,
  freqEnd: 360,
  attackMs: 2,
  sustainMs: 30,
  decayMs: 90,
  volume: 0.3,
} as const;
const HINT = {
  wave: 'sine',
  freq: 880,
  attackMs: 2,
  sustainMs: 70,
  decayMs: 160,
  volume: 0.26,
  arp: [{ atMs: 70, ratio: 1.26 }],
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
      'click',
      { name: 'lift', params: LIFT },
      { name: 'set', params: SET },
      { name: 'glug', params: GLUG },
      { name: 'pop', params: POP },
      { name: 'chime', params: CHIME },
      { name: 'nope', params: NOPE },
      { name: 'undo', params: UNDO },
      { name: 'hint', params: HINT },
    ],
    overlays: { howTo: { steps: howToSteps }, pauseButton: 'always', confirmRestart: true },
    attract,
    strings: { title: strings.title },
  },
});
