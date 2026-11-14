import { SDK_API_VERSION, type GameMeta } from '@pocketcade/sdk';

export const meta = {
  id: 'sourdough',
  apiVersion: SDK_API_VERSION,
  version: '1.0.0',
  inputs: ['pointer', 'touch', 'keyboard'],
  orientation: 'any',
  // The table re-lays itself out for the view (layout.ts): side columns when wide, longer columns when tall.
  aspectRatio: { min: 9 / 16, max: 16 / 9 },
  minSize: { width: 320, height: 320 },
  saveSchemaVersion: 1,
  leaderboards: [
    { id: 'time', label: 'Fastest win', order: 'asc', format: 'duration_ms' },
    { id: 'wins', label: 'Total wins', order: 'desc', format: 'integer' },
  ],
  pauseKeys: ['Escape', 'KeyP'],
} as const satisfies GameMeta;
