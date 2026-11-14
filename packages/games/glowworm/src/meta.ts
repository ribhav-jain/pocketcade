import { SDK_API_VERSION, type GameMeta } from '@pocketcade/sdk';

export const meta = {
  id: 'glowworm',
  apiVersion: SDK_API_VERSION,
  version: '1.0.0',
  inputs: ['keyboard', 'pointer', 'touch'],
  orientation: 'any',
  // The board is square; cave scenery fills whatever the frame adds beside or above it.
  aspectRatio: { min: 3 / 4, max: 16 / 9 },
  minSize: { width: 320, height: 320 },
  saveSchemaVersion: 1,
  leaderboards: [{ id: 'score', label: 'Best score', order: 'desc', format: 'integer' }],
  pauseKeys: ['Escape', 'KeyP'],
} as const satisfies GameMeta;
