// Local top-10 leaderboards.
import {
  INITIALS_PATTERN,
  LEADERBOARD_SIZE,
  SCORE_META_MAX_BYTES,
  type GameMeta,
  type Json,
  type LeaderboardDef,
  type ScoreEntry,
  type ScoresAPI,
  type SubmitResult,
} from '../index.ts';
import type { StorageBackend } from './backend.ts';
import { jsonIssue, utf8Bytes } from './json.ts';
import type { Clock } from './storage.ts';

/** Value of pocketcade:v1:lb:<gameId>:<boardId>. */
export interface LeaderboardRecord {
  v: 1;
  order: 'desc' | 'asc';
  format: 'integer' | 'duration_ms' | 'moves';
  entries: Array<{ id: string; value: number; initials: string; achievedAt: string; meta?: Json }>;
}
type Entry = LeaderboardRecord['entries'][number];

export interface RankedScore {
  board: string;
  value: number;
  rank: number;
  entryId: string;
  personalBest: boolean;
}

export interface ScoresAdmin {
  /** Scores namespaced to one game; used by the runner. `onRanked` fires when an entry enters the top 10. */
  forGame(
    meta: GameMeta,
    opts: { readOnly: boolean; onRanked?: (s: RankedScore) => void },
  ): ScoresAPI;
  /** Game-page table without loading the game chunk. */
  top(gameId: string, def: LeaderboardDef, limit?: number): Promise<ScoreEntry[]>;
  /** Portal initials prompt: rename one stored entry. */
  setInitials(
    gameId: string,
    board: string,
    entryId: string,
    initials: string,
  ): Promise<{ ok: boolean }>;
  /** Entry ids currently stored for a board, in rank order (the sheet marks "(new)" entries). */
  entryIds(gameId: string, def: LeaderboardDef): Promise<string[]>;
  setDefaultInitials(initials: string): void;
}

const rejected = (reason: SubmitResult['reason']): SubmitResult => ({
  accepted: false,
  rank: null,
  personalBest: false,
  reason,
});
const UNAVAILABLE = rejected('unavailable');

/** Validation per score format. */
function isValidScore(format: LeaderboardDef['format'], v: unknown): v is number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v)) return false;
  if (format === 'integer') return v >= 0;
  if (format === 'duration_ms') return v >= 1 && v <= 359_999_999;
  return v >= 1 && v <= 999_999;
}

/** Sort comparator: by order, then earlier achievedAt wins; Array#sort is stable so stored entries win full ties. */
function compare(order: 'asc' | 'desc') {
  return (a: Entry, b: Entry) =>
    (order === 'desc' ? b.value - a.value : a.value - b.value) ||
    (a.achievedAt < b.achievedAt ? -1 : a.achievedAt > b.achievedAt ? 1 : 0);
}

function isEntry(e: unknown): e is Entry {
  if (typeof e !== 'object' || e === null) return false;
  const x = e as Record<string, unknown>;
  return (
    typeof x.id === 'string' &&
    typeof x.value === 'number' &&
    typeof x.initials === 'string' &&
    INITIALS_PATTERN.test(x.initials) &&
    typeof x.achievedAt === 'string'
  );
}

function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createScoresAdmin(backend: StorageBackend, clock: Clock): ScoresAdmin {
  let defaultInitials = 'AAA';
  const keyOf = (gameId: string, board: string) => `pocketcade:v1:lb:${gameId}:${board}`;

  /** Read and repair a record against the current definition. Throws if the backend throws. */
  function read(gameId: string, def: LeaderboardDef): Entry[] {
    const raw = backend.getItem(keyOf(gameId, def.id));
    if (raw === null) return [];
    let entries: unknown[] = [];
    try {
      const parsed = JSON.parse(raw) as Partial<LeaderboardRecord>;
      if (Array.isArray(parsed.entries)) entries = parsed.entries;
    } catch {
      return [];
    }
    return entries
      .filter(isEntry)
      .filter((e) => isValidScore(def.format, e.value))
      .sort(compare(def.order))
      .slice(0, LEADERBOARD_SIZE);
  }

  function clampLimit(limit: unknown): number {
    if (typeof limit !== 'number' || !Number.isInteger(limit)) return LEADERBOARD_SIZE;
    return Math.min(LEADERBOARD_SIZE, Math.max(1, limit));
  }

  async function top(gameId: string, def: LeaderboardDef, limit?: number): Promise<ScoreEntry[]> {
    try {
      return read(gameId, def)
        .slice(0, clampLimit(limit))
        .map((e, i) => {
          const entry: ScoreEntry = {
            rank: i + 1,
            value: e.value,
            initials: e.initials,
            achievedAt: e.achievedAt,
          };
          if (e.meta !== undefined) entry.meta = JSON.parse(JSON.stringify(e.meta)) as Json;
          return entry;
        });
    } catch {
      return [];
    }
  }

  function forGame(
    meta: GameMeta,
    opts: { readOnly: boolean; onRanked?: (s: RankedScore) => void },
  ): ScoresAPI {
    const boards = new Map(meta.leaderboards.map((b) => [b.id, b]));
    return {
      async submit(s) {
        if (opts.readOnly) return UNAVAILABLE;
        const def = boards.get(s?.board);
        if (!def) return rejected('unknown_board');
        const badMeta =
          s.meta !== undefined &&
          (jsonIssue(s.meta) !== null || utf8Bytes(JSON.stringify(s.meta)) > SCORE_META_MAX_BYTES);
        if (!isValidScore(def.format, s.value) || badMeta) return rejected('invalid_value');
        // One synchronous task: read, repair, insert, trim, write.
        let entries: Entry[];
        try {
          entries = read(meta.id, def);
        } catch {
          return UNAVAILABLE;
        }
        const best = entries[0];
        const personalBest =
          !best || (def.order === 'desc' ? s.value > best.value : s.value < best.value);
        const entry: Entry = {
          id: newId(),
          value: s.value,
          initials: defaultInitials,
          achievedAt: new Date(clock.now()).toISOString(),
        };
        if (s.meta !== undefined) entry.meta = s.meta;
        entries.push(entry);
        entries.sort(compare(def.order));
        entries = entries.slice(0, LEADERBOARD_SIZE);
        const idx = entries.indexOf(entry);
        const record: LeaderboardRecord = { v: 1, order: def.order, format: def.format, entries };
        try {
          backend.setItem(keyOf(meta.id, def.id), JSON.stringify(record));
        } catch {
          return UNAVAILABLE;
        }
        const rank = idx === -1 ? null : idx + 1;
        if (rank !== null)
          opts.onRanked?.({ board: def.id, value: s.value, rank, entryId: entry.id, personalBest });
        return { accepted: true, rank, personalBest };
      },
      async top(board, limit) {
        if (opts.readOnly) return [];
        const def = boards.get(board);
        return def ? top(meta.id, def, limit) : [];
      },
    };
  }

  return {
    forGame,
    top,
    async setInitials(gameId, board, entryId, initials) {
      if (!INITIALS_PATTERN.test(initials)) return { ok: false };
      try {
        const raw = backend.getItem(keyOf(gameId, board));
        if (raw === null) return { ok: false };
        const record = JSON.parse(raw) as LeaderboardRecord;
        const entry = record.entries?.find((e) => e.id === entryId);
        if (!entry) return { ok: false };
        entry.initials = initials;
        backend.setItem(keyOf(gameId, board), JSON.stringify(record));
        return { ok: true };
      } catch {
        return { ok: false };
      }
    },
    async entryIds(gameId, def) {
      try {
        return read(gameId, def).map((e) => e.id);
      } catch {
        return [];
      }
    },
    setDefaultInitials(initials) {
      if (INITIALS_PATTERN.test(initials)) defaultInitials = initials;
    },
  };
}
