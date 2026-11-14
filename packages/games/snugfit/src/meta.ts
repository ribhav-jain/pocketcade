import { SDK_API_VERSION, type GameMeta } from '@pocketcade/sdk';

export const meta = {
  id: 'snugfit',
  apiVersion: SDK_API_VERSION,
  version: '1.0.0',
  inputs: ['pointer', 'touch', 'keyboard'],
  orientation: 'any',
  // The layout follows the frame: stacked when tall, quilt between score and tray when wide.
  aspectRatio: { min: 9 / 16, max: 16 / 9 },
  minSize: { width: 280, height: 360 },
  saveSchemaVersion: 1,
  leaderboards: [{ id: 'best-score', label: 'Best score', order: 'desc', format: 'integer' }],
  pauseKeys: ['Escape'],
} as const satisfies GameMeta;
