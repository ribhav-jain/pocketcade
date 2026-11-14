import { SDK_API_VERSION, type GameMeta } from '@pocketcade/sdk';

export const meta = {
  id: 'on-the-dot',
  apiVersion: SDK_API_VERSION,
  version: '1.0.0',
  inputs: ['keyboard', 'pointer', 'touch'],
  orientation: 'any',
  aspectRatio: { min: 9 / 16, max: 16 / 9 },
  minSize: { width: 270, height: 270 },
  saveSchemaVersion: 1,
  leaderboards: [{ id: 'score', label: 'Best score', order: 'desc', format: 'integer' }],
  pauseKeys: ['Escape'],
} as const satisfies GameMeta;
