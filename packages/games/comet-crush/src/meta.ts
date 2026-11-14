import { SDK_API_VERSION, type GameMeta } from '@pocketcade/sdk';

export const meta = {
  id: 'comet-crush',
  apiVersion: SDK_API_VERSION,
  version: '0.1.0',
  inputs: ['pointer', 'touch', 'keyboard'],
  orientation: 'any',
  aspectRatio: { min: 9 / 16, max: 16 / 9 },
  minSize: { width: 320, height: 320 },
  saveSchemaVersion: 1,
  leaderboards: [{ id: 'score', label: 'Best score', order: 'desc', format: 'integer' }],
  pauseKeys: ['Escape', 'KeyP'],
} as const satisfies GameMeta;
