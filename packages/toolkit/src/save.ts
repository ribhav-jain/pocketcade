// Versioned saves over host.storage.
import {
  STORAGE_MAX_VALUE_BYTES,
  type Json,
  type SerializableError,
  type StorageAPI,
  type StorageResult,
} from '@pocketcade/sdk';

export interface SaveSpec<T extends Json> {
  /** host.storage (filled by tk.createSave) */
  storage: StorageAPI;
  /** ≤ 60 chars so `<key>.bak` still fits the key pattern; must not start with 'tk.' */
  key: string;
  /** must equal meta.saveSchemaVersion */
  version: number;
  defaults: () => T;
  /** migrate[n]: v n → v n+1; pure, sync */
  migrate?: { readonly [fromVersion: number]: (data: Json) => Json };
  /** runs after load and after migration */
  validate: (data: Json) => data is T;
  /** default 500; 0 writes on every set() */
  debounceMs?: number;
}

export type LoadIssue = 'corrupt' | 'future_version' | 'migration_threw' | 'unavailable';
export interface Loaded<T> {
  data: T;
  source: 'stored' | 'migrated' | 'default';
  issue?: LoadIssue;
}

export interface Save<T extends Json> {
  /** never throws */
  load(): Promise<Loaded<T>>;
  /** debounced write */
  set(data: T): void;
  update(fn: (current: T) => T): void;
  /** write pending data now */
  flush(): Promise<StorageResult>;
  clear(): Promise<void>;
  readonly current: T;
  readonly lastResult: StorageResult | null;
}

export interface SaveOptions {
  /** attract mode: no storage calls at all */
  readOnly?: boolean;
  reportError?: (e: SerializableError) => void;
}

// Building blocks for SaveSpec.validate.
export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
/** A safe integer in [min, max]. */
export const isInt = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max;
/** A non-negative safe integer. */
export const isCount = (v: unknown): v is number => isInt(v);

const SAVED_AT_SAMPLE = '2026-01-01T00:00:00.000Z';
let encoder: TextEncoder | null = null;

function envelopeBytes(version: number, data: Json): number {
  encoder ??= new TextEncoder();
  return encoder.encode(JSON.stringify({ v: version, savedAt: SAVED_AT_SAMPLE, data })).length;
}

export function createSave<T extends Json>(spec: SaveSpec<T>, opts: SaveOptions = {}): Save<T> {
  const debounceMs = spec.debounceMs ?? 500;
  let current: T = spec.defaults();
  let pending: { data: T } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastResult: StorageResult | null = null;
  let chain: Promise<unknown> = Promise.resolve();
  let reported = false;

  const report = (name: string, message: string) => {
    if (reported) return;
    reported = true;
    opts.reportError?.({ name, message });
  };

  async function backup(raw: Json): Promise<void> {
    await spec.storage.set(`${spec.key}.bak`, raw);
  }

  function schedule(): void {
    if (opts.readOnly) return;
    if (debounceMs === 0) {
      void flush();
      return;
    }
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, debounceMs);
  }

  function flush(): Promise<StorageResult> {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    const job = pending;
    pending = null;
    if (opts.readOnly || !job) return chain.then(() => lastResult ?? { ok: true });
    const run = chain.then(async (): Promise<StorageResult> => {
      let result: StorageResult;
      if (envelopeBytes(spec.version, job.data) > STORAGE_MAX_VALUE_BYTES) {
        result = { ok: false, reason: 'too_large' };
      } else {
        try {
          result = await spec.storage.set(spec.key, job.data);
        } catch {
          result = { ok: false, reason: 'unavailable' };
        }
      }
      lastResult = result;
      if (!result.ok) {
        // Keep the value in memory and retry at the next flush.
        pending ??= job;
        if (result.reason === 'quota' || result.reason === 'too_large')
          report('SaveFailed', `save "${spec.key}" failed: ${result.reason}`);
      }
      return result;
    });
    chain = run;
    return run;
  }

  async function load(): Promise<Loaded<T>> {
    if (opts.readOnly) {
      current = spec.defaults();
      return { data: current, source: 'default' };
    }
    await flush();
    let env;
    try {
      env = await spec.storage.get(spec.key);
    } catch {
      current = spec.defaults();
      return { data: current, source: 'default', issue: 'unavailable' };
    }
    if (!env) {
      current = spec.defaults();
      return { data: current, source: 'default' };
    }
    const fail = async (issue: LoadIssue): Promise<Loaded<T>> => {
      await backup(env as unknown as Json);
      report('SaveLoadIssue', `save "${spec.key}" ${issue}; backed up to ${spec.key}.bak`);
      current = spec.defaults();
      return { data: current, source: 'default', issue };
    };
    if (env.v > spec.version) return fail('future_version');
    if (env.v === spec.version) {
      if (!spec.validate(env.data)) return fail('corrupt');
      current = env.data;
      return { data: current, source: 'stored' };
    }
    let data: Json = env.data;
    try {
      for (let v = env.v; v < spec.version; v++) {
        const step = spec.migrate?.[v];
        if (step) data = step(data);
      }
    } catch {
      return fail('migration_threw');
    }
    if (!spec.validate(data)) return fail('corrupt');
    current = data;
    pending = { data };
    await flush();
    return { data: current, source: 'migrated' };
  }

  return {
    load,
    set(data) {
      current = data;
      pending = { data };
      schedule();
    },
    update(fn) {
      current = fn(current);
      pending = { data: current };
      schedule();
    },
    flush,
    async clear() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      pending = null;
      current = spec.defaults();
      if (!opts.readOnly) await spec.storage.remove(spec.key);
    },
    get current() {
      return current;
    },
    get lastResult() {
      return lastResult;
    },
  };
}
