import { SDK_API_VERSION, type GameMeta } from '@pocketcade/sdk';

export const meta = {
  id: 'hue-brew',
  apiVersion: SDK_API_VERSION,
  version: '1.0.0',
  inputs: ['pointer', 'touch', 'keyboard'],
  orientation: 'any',
  // The shelves follow the frame: one long row when wide, two or three rows when tall.
  aspectRatio: { min: 9 / 16, max: 16 / 9 },
  minSize: { width: 280, height: 360 },
  saveSchemaVersion: 1,
  leaderboards: [{ id: 'levels-solved', label: 'Levels solved', order: 'desc', format: 'integer' }],
  pauseKeys: ['Escape'],
} as const satisfies GameMeta;
