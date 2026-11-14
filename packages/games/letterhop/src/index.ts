// @pocketcade/game-letterhop — side-effect free; the word data loads inside mount().
import { defineDomGame } from '@pocketcade/toolkit/dom';
import { attract } from './attract.ts';
import { mountLetterhop } from './game.ts';
import { meta } from './meta.ts';
import { howToSteps, strings } from './strings.ts';
import { styles } from './styles.ts';

export default defineDomGame({
  meta,
  styles,
  touchAction: 'manipulation',
  sfx: ['click', 'hit', 'win', 'lose'],
  overlays: { howTo: { steps: howToSteps }, pauseButton: 'auto', confirmRestart: true },
  attract,
  strings: { title: strings.title, playAgain: strings.seeResults },
  mount: mountLetterhop,
});
