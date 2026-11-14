import { SDK_API_VERSION, type GameMeta } from '@pocketcade/sdk';

export const meta = {
  id: 'firefly-flip',
  apiVersion: SDK_API_VERSION,
  version: '0.1.0',
  inputs: ['pointer', 'touch', 'keyboard'],
  orientation: 'any',
  aspectRatio: { min: 9 / 16, max: 16 / 9 },
  minSize: { width: 360, height: 360 },
  saveSchemaVersion: 1,
  leaderboards: [
    { id: 'pairs-moves', label: 'Fewest moves (Pairs 6×6)', order: 'asc', format: 'moves' },
    { id: 'sequence-length', label: 'Longest pattern (Follow)', order: 'desc', format: 'integer' },
  ],
} as const satisfies GameMeta;
