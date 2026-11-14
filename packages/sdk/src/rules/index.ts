// @pocketcade/sdk/rules — storage, score and daily-key behaviour shared by @pocketcade/host and the test kit's mock
// host, so the two cannot drift. Games never import this entry.
export { createMemoryBackend, type StorageBackend } from './backend.ts';
export {
  createScoresAdmin,
  type LeaderboardRecord,
  type RankedScore,
  type ScoresAdmin,
} from './scores.ts';
export { createStorageAdmin, type Clock, type StorageAdmin } from './storage.ts';

/** local calendar date YYYY-MM-DD from the local getters, never toISOString(). */
export function localDateKey(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
