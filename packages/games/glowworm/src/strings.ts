// Every player-facing string.
import { defineStrings, type HowToStep } from '@pocketcade/toolkit';

export const strings = defineStrings({
  title: 'Glowworm',
  score: 'Score',
  best: 'Best',
  newBest: 'New best',
  newBestPop: 'New best!',
  cave: 'Cave {n}',
  combo: 'Combo',
  comboValue: '×{n}',
  pause: 'Pause',
  readyKeyboard: 'Press an arrow key to start',
  readyPointer: 'Click or drag to start',
  readyTouch: 'Swipe or tap to start',
  goal: 'Eat {n} glowberries to light the way to the next cave.',
  getReady: 'Ready…',
  points: '+{n}',
  golden: 'Golden berry!',
  cleared: 'Cave aglow! +{n}',
  edgesOpen: 'The edges wrap around',
  edgesGates: 'Glowing tunnels wrap around',
  edgesSides: 'The sides wrap around',
  edgesWalls: 'Mind the walls',
  self: 'Ouch, tail bite!',
  wall: 'Bonk! The cave wall',
  crystalHit: 'Bonk! A crystal',
  won: 'Every cell aglow!',
});

/** Cave names, one per palette. */
export const biomeNames = [
  'Amethyst Hollow',
  'Lagoon Grotto',
  'Ember Vault',
  'Sapphire Deep',
  'Sunstone Hall',
] as const;

const grow =
  'Gobble glowberries to grow: +10 each, more for quick pickups in a row. Golden berries give +50 but fade fast.';
const caves =
  "Eight berries light the way to the next cave. Don't bite your tail or bonk into walls and crystals; glowing tunnels wrap around.";

export const howToSteps: readonly HowToStep[] = [
  {
    icon: 'arrows',
    keyboard: 'Steer Wick the glowworm with the arrow keys or WASD.',
    pointer: 'Drag to steer Wick the glowworm, or click beside Wick to turn that way.',
    touch: 'Swipe anywhere to steer Wick the glowworm, or tap beside Wick to turn that way.',
  },
  { icon: 'trophy', keyboard: grow, pointer: grow, touch: grow },
  { icon: 'info', keyboard: caves, pointer: caves, touch: caves },
];
