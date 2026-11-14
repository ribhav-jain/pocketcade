// Every player-facing string.
import { defineStrings, type HowToStep } from '@pocketcade/toolkit';

export const strings = defineStrings({
  title: 'Sumslide',
  score: 'SCORE',
  best: 'Best {value}',
  goal: 'GOAL',
  goalsDone: 'All done!',
  echoIn: 'ECHO IN',
  echoMoves: '{n} moves',
  echoOneMove: '1 move',
  echoOnTray: 'ECHO',
  echoReady: 'On the tray',
  echoLabel: '×2',
  undo: 'Undo',
  gameOverTitle: 'No moves left',
  popGoal: 'Goal! +{bonus}',
  popBestTile: 'New best tile! +{bonus}',
  popEcho: 'Echo!',
});

const ECHO_STEP =
  'The rainbow Echo doubles any tile it touches. The Echo meter shows how many moves until the next one.';

export const howToSteps: readonly HowToStep[] = [
  {
    icon: 'arrows',
    keyboard: 'Arrow keys or WASD slide every tile.',
    touch: 'Swipe to slide every tile, or tap near an edge.',
    pointer: 'Drag, or click near an edge, to slide every tile.',
  },
  {
    icon: 'info',
    keyboard: 'Equal numbers that collide merge into their sum, and you score that sum.',
    touch: 'Equal numbers that collide merge into their sum, and you score that sum.',
  },
  { icon: 'info', keyboard: ECHO_STEP, touch: ECHO_STEP },
  {
    icon: 'trophy',
    keyboard: 'Make the Goal tile for a bonus and an extra Undo. Z takes back your last move.',
    touch: 'Make the Goal tile for a bonus and an extra Undo. Undo takes back your last move.',
  },
];
