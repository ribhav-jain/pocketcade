// Every player-facing string, including Rowdy's speech-bubble lines and the restart-confirm text.
import { defineStrings, type HowToStep } from '@pocketcade/toolkit';

export const strings = defineStrings({
  title: 'Rowbot',
  rowdy: 'Rowdy',
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  pickLevel: 'Pick Rowdy’s level',
  record: 'Best {best} · {wins} W {losses} L',
  roundInProgress: 'Round in progress',
  continue: 'Continue',
  forfeit: 'Forfeit',
  nextRound: 'Next round',
  bankStreak: 'Bank streak',
  changeLevel: 'Change level',
  yourTurn: 'Your turn',
  thinking: 'Rowdy is thinking…',
  youWin: 'You win!',
  rowdyWins: 'Rowdy wins',
  draw: 'Draw',
  columnFull: 'Column {n} is full',
  streak: 'Streak',
  best: 'Best',
  forfeited: 'Round forfeited',
  banked: 'Streak banked',
  restoreFailed: 'Couldn’t restore your last round.',
  restartConfirm: 'Restart? This round counts as a loss.',
  hintKeyboard: '← → then Enter, or 1–7',
  hintPointer: 'Click a column',
  hintTouch: 'Touch, slide, lift',
  powerUp: 'Nice streak! Powering up.',
  fullPower: 'Full power. Bring it on!',
});

/** Said now and then after Rowdy's own move. */
export const QUIPS = [
  'Bold move.',
  'I saw that coming.',
  'Hmm. Tricky.',
  'My circuits approve.',
  'Was that a trap?',
  'Not bad, human.',
  'Beep. Recalculating.',
  'Ooh, spicy column.',
  'I’m warming up.',
  'You’re making me sweat.',
] as const;

/** Rowdy's lines for key moments, picked in turn. */
export const REACTIONS = {
  three: ['Three in a row… just saying.', 'Heh. Watch this.', 'Feeling lucky, human?'],
  blocked: ['Hey! I needed that!', 'Whoa! Blocked?!', 'Rude. Very rude.'],
  win: ['Beep boop. Victory!', 'Four for me!', 'Shiny! I win!'],
  lose: ['Does… not… compute…', 'You got me, human.', 'Best two out of three?'],
  draw: ['A tie? Fair and square.', 'Stalemate. Nice moves.'],
} as const;

export const howToSteps: readonly HowToStep[] = [
  {
    icon: 'arrows',
    keyboard: 'Aim with ← → and drop with Enter, or press 1–7.',
    pointer: 'Click a column to drop a disc.',
    touch: 'Touch a column, slide to aim, lift to drop.',
  },
  {
    icon: 'info',
    keyboard: 'Line up four of your discs across, up or diagonally before Rowdy does.',
    touch: 'Line up four of your discs across, up or diagonally before Rowdy does.',
  },
  {
    icon: 'trophy',
    keyboard: 'Each win adds to your streak and powers Rowdy up. A loss ends the streak.',
    touch: 'Each win adds to your streak and powers Rowdy up. A loss ends the streak.',
  },
];
