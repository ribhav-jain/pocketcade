// Game storage and portal-owned keys.
import {
  STORAGE_KEY_PATTERN,
  STORAGE_MAX_GAME_BYTES,
  STORAGE_MAX_VALUE_BYTES,
  type GameMeta,
  type Json,
  type SaveEnvelope,
  type StorageAPI,
  type StorageResult,
} from '../index.ts';
import type { StorageBackend } from './backend.ts';
import { jsonIssue, utf8Bytes } from './json.ts';

export interface Clock {
  /** ms since epoch; default Date.now */
  now(): number;
}

export interface StorageAdmin {
  readonly persistent: boolean;
  /** Storage namespaced to one game; used by the runner. */
  forGame(meta: GameMeta, opts: { readOnly: boolean }): StorageAPI;
  /** pocketcade:v1:p:* only */
  portal: {
    get(key: string): Json | null;
    set(key: string, value: Json): { ok: boolean };
  };
}

export const GAME_PREFIX = 'pocketcade:v1:g:';
const PORTAL_PREFIX = 'pocketcade:v1:p:';

function isEnvelope(v: unknown): v is SaveEnvelope {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.v === 'number' &&
    Number.isInteger(e.v) &&
    e.v >= 1 &&
    typeof e.savedAt === 'string' &&
    'data' in e
  );
}

function isQuotaError(e: unknown): boolean {
  return (
    e instanceof Error &&
    (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')
  );
}

export function createStorageAdmin(
  backend: StorageBackend,
  clock: Clock,
  dev: boolean,
): StorageAdmin {
  // gameId → (physical key → bytes); computed once per game, then kept current on writes.
  const usage = new Map<string, Map<string, number>>();

  function usageFor(gameId: string): Map<string, number> {
    let m = usage.get(gameId);
    if (!m) {
      m = new Map();
      try {
        for (const k of backend.keys(`${GAME_PREFIX}${gameId}:`)) {
          const raw = backend.getItem(k);
          if (raw !== null) m.set(k, utf8Bytes(raw));
        }
      } catch {
        // Backend unreadable: start from an empty usage map.
      }
      usage.set(gameId, m);
    }
    return m;
  }

  function forGame(meta: GameMeta, { readOnly }: { readOnly: boolean }): StorageAPI {
    const prefix = `${GAME_PREFIX}${meta.id}:`;
    const tag = `[pocketcade:${meta.id}]`;

    return {
      async get<T extends Json = Json>(key: string): Promise<SaveEnvelope<T> | null> {
        if (readOnly || !STORAGE_KEY_PATTERN.test(key)) return null;
        let raw: string | null;
        try {
          raw = backend.getItem(prefix + key);
        } catch {
          return null;
        }
        if (raw === null) return null;
        try {
          const parsed: unknown = JSON.parse(raw);
          if (isEnvelope(parsed)) return parsed as SaveEnvelope<T>;
        } catch {
          // fall through to the corrupt path
        }
        if (dev) console.warn(`${tag} storage key "${key}" is corrupt; returning null`);
        return null;
      },

      async set<T extends Json = Json>(key: string, data: T): Promise<StorageResult> {
        if (readOnly) {
          if (dev) console.warn(`${tag} storage.set("${key}") during attract is ignored`);
          return { ok: false, reason: 'unavailable' };
        }
        if (!STORAGE_KEY_PATTERN.test(key)) return { ok: false, reason: 'invalid_key' };
        const issue = jsonIssue(data);
        if (issue) {
          if (dev) console.error(`${tag} storage.set("${key}") rejected non-JSON data: ${issue}`);
          return { ok: false, reason: 'unavailable' };
        }
        const envelope: SaveEnvelope = {
          v: meta.saveSchemaVersion,
          savedAt: new Date(clock.now()).toISOString(),
          data,
        };
        const str = JSON.stringify(envelope);
        const bytes = utf8Bytes(str);
        if (bytes > STORAGE_MAX_VALUE_BYTES) return { ok: false, reason: 'too_large' };

        const physical = prefix + key;
        const used = usageFor(meta.id);
        const previous = used.get(physical) ?? 0;
        let total = 0;
        for (const b of used.values()) total += b;
        if (bytes > previous && total - previous + bytes > STORAGE_MAX_GAME_BYTES)
          return { ok: false, reason: 'quota' };

        try {
          backend.setItem(physical, str);
        } catch (e) {
          return { ok: false, reason: isQuotaError(e) ? 'quota' : 'unavailable' };
        }
        used.set(physical, bytes);
        return { ok: true };
      },

      async remove(key: string): Promise<void> {
        if (readOnly || !STORAGE_KEY_PATTERN.test(key)) return;
        try {
          backend.removeItem(prefix + key);
          usageFor(meta.id).delete(prefix + key);
        } catch {
          // never throws
        }
      },

      async keys(): Promise<string[]> {
        if (readOnly) return [];
        try {
          return backend
            .keys(prefix)
            .map((k) => k.slice(prefix.length))
            .sort();
        } catch {
          return [];
        }
      },
    };
  }

  const portal: StorageAdmin['portal'] = {
    get(key) {
      try {
        const raw = backend.getItem(PORTAL_PREFIX + key);
        return raw === null ? null : (JSON.parse(raw) as Json);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        backend.setItem(PORTAL_PREFIX + key, JSON.stringify(value));
        return { ok: true };
      } catch {
        return { ok: false };
      }
    },
  };

  return { persistent: backend.persistent, forGame, portal };
}
