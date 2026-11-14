import { SDK_API_VERSION, type GameMeta } from '@pocketcade/sdk';

export const meta = {
  id: 'letterhop',
  apiVersion: SDK_API_VERSION,
  version: '0.1.0',
  inputs: ['keyboard', 'pointer', 'touch'],
  orientation: 'any',
  aspectRatio: 'fill',
  minSize: { width: 300, height: 320 },
  saveSchemaVersion: 1,
  leaderboards: [
    { id: 'daily-moves', label: 'Fewest hops (daily)', order: 'asc', format: 'moves' },
    { id: 'streak', label: 'Daily streak', order: 'desc', format: 'integer' },
  ],
} as const satisfies GameMeta;
