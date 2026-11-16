// Every player-facing string.
import { defineStrings, type HowToStep } from '@pocketcade/toolkit';

export const strings = defineStrings({
  title: 'Pop Reef',
  score: 'Score',
  level: 'Level',
  levelN: 'Level {n}',
  zone0: 'Sunlit Shallows',
  zone1: 'Kelp Forest',
  zone2: 'Coral Garden',
  zone3: 'Twilight Trench',
  goalClear: 'Pop every bubble',
  goalRescue: 'Free all {n} fish',
  parLine: '3 stars: clear it in {n} shots',
  next: 'Next',
  readyKeyboard: 'Aim with ← →, puff with Space',
  readyPointer: 'Aim with the mouse, click to puff',
  readyTouch: 'Drag to aim, let go to puff',
  tipMatch: 'Match 3 of a colour to pop them',
  tipDrop: 'Cut bubbles loose: they drop for double points',
  tipRainbow: 'Pop on 4 shots in a row to win a rainbow bubble',
  tipStone: 'Stones never pop. Pop what holds them up!',
  tipFish: 'Free the fish: pop or drop their bubbles',
  tipUrchin: 'Land a bubble beside an urchin: boom!',
  points: '+{n}',
  streak: '{n} in a row! ×{m}',
  rainbow: 'Rainbow bubble!',
  splash: 'Splash!',
  bigSplash: 'Super splash!',
  boom: 'Boom!',
  freed: 'Free!',
  sinking: 'The reef sinks!',
  starLost: 'Star lost',
  cleared: 'Level {n} clear!',
  bonus: 'Star bonus +{n}',
  cardScore: 'Score {n}',
  nextLevel: 'Next level',
  replay: 'Replay',
  cardKeys: 'Space: next level · R: replay',
  restartConfirm: 'Restart this level? Your run score resets.',
  over: 'The bubbles reached Puff!',
});

const pop = 'Match 3 or more of a colour to pop them. Bubbles left hanging drop for double points.';
const goal = "Reach each level's goal in few shots to earn up to 3 stars.";
const sink =
  'Shots that pop nothing make the ceiling sink. Keep the bubbles above the dashed line!';

export const howToSteps: readonly HowToStep[] = [
  {
    icon: 'arrows',
    keyboard: 'Aim with ← and →, puff a bubble with Space. X swaps it with the next one.',
    pointer: 'Move the mouse to aim, click to puff a bubble. Click the next bubble to swap.',
    touch: 'Drag to aim, let go to puff a bubble. Tap the next bubble to swap.',
  },
  { icon: 'trophy', keyboard: pop, pointer: pop, touch: pop },
  { icon: 'info', keyboard: goal, pointer: goal, touch: goal },
  { icon: 'info', keyboard: sink, pointer: sink, touch: sink },
];
