import { SDK_API_VERSION, type GameMeta } from '@pocketcade/sdk';

export const meta = {
  id: 'molehills',
  apiVersion: SDK_API_VERSION,
  version: '0.1.0',
  inputs: ['pointer', 'touch', 'keyboard'],
  orientation: 'any',
  // Square design area; the frame may be wide or tall and the scene lays the board out across the whole view.
  aspectRatio: { min: 9 / 16, max: 16 / 9 },
  minSize: { width: 320, height: 320 },
  saveSchemaVersion: 1,
  leaderboards: [
    { id: 'time-garden', label: 'Garden 8×10 best time', order: 'asc', format: 'duration_ms' },
    { id: 'time-field', label: 'Field 12×16 best time', order: 'asc', format: 'duration_ms' },
    { id: 'time-meadow', label: 'Meadow 16×24 best time', order: 'asc', format: 'duration_ms' },
  ],
} as const satisfies GameMeta;
