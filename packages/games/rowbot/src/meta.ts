import { SDK_API_VERSION, type GameMeta } from '@pocketcade/sdk';

export const meta = {
  id: 'rowbot',
  apiVersion: SDK_API_VERSION,
  version: '1.0.0',
  inputs: ['pointer', 'touch', 'keyboard'],
  orientation: 'any',
  aspectRatio: { min: 9 / 16, max: 16 / 9 },
  minSize: { width: 300, height: 300 },
  saveSchemaVersion: 1,
  leaderboards: [{ id: 'win-streak', label: 'Best win streak', order: 'desc', format: 'integer' }],
} as const satisfies GameMeta;
