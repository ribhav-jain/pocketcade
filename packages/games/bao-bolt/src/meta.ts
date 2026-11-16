import { SDK_API_VERSION, type GameMeta } from '@pocketcade/sdk';

export const meta = {
  id: 'bao-bolt',
  apiVersion: SDK_API_VERSION,
  version: '1.0.0',
  inputs: ['keyboard', 'pointer', 'touch'],
  orientation: 'any',
  aspectRatio: { min: 3 / 4, max: 2 },
  minSize: { width: 320, height: 240 },
  saveSchemaVersion: 1,
  leaderboards: [{ id: 'distance', label: 'Best score', order: 'desc', format: 'integer' }],
  pauseKeys: ['Escape', 'KeyP'],
} as const satisfies GameMeta;
