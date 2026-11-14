import { SDK_API_VERSION, type GameMeta } from '@pocketcade/sdk';

export const meta = {
  id: 'sunset-sprint',
  apiVersion: SDK_API_VERSION,
  version: '1.0.0',
  inputs: ['keyboard', 'pointer', 'touch'],
  orientation: 'any',
  // The design area is 960 × 720 (4:3). A wider frame shows more roadside; a taller one more sky and near road.
  aspectRatio: { min: 3 / 4, max: 16 / 9 },
  minSize: { width: 320, height: 300 },
  saveSchemaVersion: 1,
  leaderboards: [{ id: 'distance', label: 'Best distance', order: 'desc', format: 'integer' }],
  pauseKeys: ['Escape', 'KeyP'],
} as const satisfies GameMeta;
