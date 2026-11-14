import { SDK_API_VERSION, type GameMeta } from '@pocketcade/sdk';

export const meta = {
  id: 'sumslide',
  apiVersion: SDK_API_VERSION,
  version: '1.0.0',
  inputs: ['keyboard', 'pointer', 'touch'],
  orientation: 'any',
  aspectRatio: { min: 9 / 16, max: 16 / 9 },
  minSize: { width: 280, height: 280 },
  saveSchemaVersion: 1,
  leaderboards: [
    { id: 'best-score', label: 'Best score', order: 'desc', format: 'integer' },
    { id: 'best-tile', label: 'Best tile', order: 'desc', format: 'integer' },
  ],
  pauseKeys: ['Escape'],
} as const satisfies GameMeta;
