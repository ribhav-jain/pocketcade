// Every player-facing string. Theme words (claim, vaults) in copy only; the how-to stays plain.
import { defineStrings, type HowToStep } from '@pocketcade/toolkit';

export const strings = defineStrings({
  title: 'Sourdough Solitaire',
  restored: 'Your claim is where you left it',
  draw: 'Draw {n}',
  nextClaim: 'Next claim: Draw {n}',
  time: 'Time',
  moves: 'Moves',
  hint: 'Hint',
  undo: 'Undo',
  newClaim: 'New',
  pause: 'Pause',
  confirmNew: 'Press New again to start a new claim',
  noMoves: 'No useful moves left. Try Undo or a new claim.',
  won: 'Struck it rich!',
  replay: 'Replay this claim',
  switchTo: 'Switch to Draw {n}',
});

export const howToSteps: readonly HowToStep[] = [
  {
    icon: 'drag',
    keyboard:
      'Move cards with the arrow keys and Space, or press Enter to send a card to its best spot.',
    pointer: 'Drag cards, or click one to send it to its best spot.',
    touch: 'Drag cards, or tap one to send it to its best spot.',
  },
  {
    icon: 'info',
    keyboard:
      'Build the seven columns down in alternating colours. Only a King goes on an empty column.',
    touch:
      'Build the seven columns down in alternating colours. Only a King goes on an empty column.',
  },
  {
    icon: 'trophy',
    keyboard: 'Bank every suit in the vaults from Ace to King to win.',
    touch: 'Bank every suit in the vaults from Ace to King to win.',
  },
  {
    icon: 'key',
    keyboard: 'D draws · U undoes · H hints · N starts a new claim · M switches Draw 1 / Draw 3.',
    pointer:
      'Click the deck to draw. Use the buttons to get a hint, undo, deal a new claim or pause.',
    touch: 'Tap the deck to draw. Use the buttons to get a hint, undo, deal a new claim or pause.',
  },
];
