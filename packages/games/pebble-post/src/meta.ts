import { SDK_API_VERSION, type GameMeta } from '@pocketcade/sdk';

export const meta = {
  id: 'pebble-post',
  apiVersion: SDK_API_VERSION,
  version: '1.0.0',
  inputs: ['keyboard', 'pointer', 'touch'],
  orientation: 'any',
  // The three lanes fill a tall 9:16 design area (540 × 960), which fits a phone held upright. A wider frame shows
  // more of the canyon to each side, up to 16:9 on a desktop.
  aspectRatio: { min: 9 / 16, max: 16 / 9 },
  minSize: { width: 270, height: 400 },
  saveSchemaVersion: 1,
  leaderboards: [{ id: 'score', label: 'Best score', order: 'desc', format: 'integer' }],
  pauseKeys: ['Escape', 'KeyP'],
} as const satisfies GameMeta;
