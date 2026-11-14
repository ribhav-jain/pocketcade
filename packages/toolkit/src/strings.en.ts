// Toolkit UI strings. Games override any key through the adapter's `strings` option.
export const toolkitStrings = {
  title: 'Game',
  play: 'Play',
  back: 'Back',
  howTo: 'How to play',
  paused: 'Paused',
  resume: 'Resume',
  restart: 'Restart',
  restartConfirm: 'Restart? This game ends.',
  gameSound: 'Game sound',
  on: 'On',
  off: 'Off',
  mutedBySite: 'Muted by site',
  pause: 'Pause',
  playAgain: 'Play again',
  saving: 'Saving score…',
  newBest: 'New best! #{rank} on this device',
  ranked: '#{rank} on this device',
  best: 'Best: {best}',
  unavailable: "Scores can't be saved in this browser session.",
  saveFailed: "Couldn't save your progress.",
};

export type ToolkitStrings = typeof toolkitStrings;

export function fill(text: string, params: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? ''));
}
