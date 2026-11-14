import { SDK_API_VERSION, type GameMeta } from '@pocketcade/sdk';

export const meta = {
  id: 'pop-reef',
  apiVersion: SDK_API_VERSION,
  version: '1.0.0',
  inputs: ['pointer', 'touch', 'keyboard'],
  orientation: 'any',
  // The play field is a 3:4 column (design 720 × 960); wider and taller frames show more reef around it.
  aspectRatio: { min: 9 / 16, max: 16 / 9 },
  minSize: { width: 300, height: 400 },
  saveSchemaVersion: 1,
  leaderboards: [{ id: 'score', label: 'Best score', order: 'desc', format: 'integer' }],
  pauseKeys: ['Escape', 'KeyP'],
} as const satisfies GameMeta;
