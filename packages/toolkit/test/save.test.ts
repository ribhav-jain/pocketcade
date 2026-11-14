// createSave: loading with validation and migrations, debounced writes and failure handling.
import type { Json, SaveEnvelope, StorageAPI, StorageResult } from '@pocketcade/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSave, type SaveSpec } from '../src/save.ts';

type Data = { n: number };
const isData = (d: Json): d is Data =>
  typeof d === 'object' && d !== null && !Array.isArray(d) && typeof d.n === 'number';

function memoryStorage(version = 2) {
  const map = new Map<string, SaveEnvelope>();
  const calls: string[] = [];
  let nextResult: StorageResult | null = null;
  const storage: StorageAPI = {
    get: async <T extends Json>(k: string) => {
      calls.push(`get:${k}`);
      return (map.get(k) as SaveEnvelope<T> | undefined) ?? null;
    },
    set: async (k, data) => {
      calls.push(`set:${k}`);
      if (nextResult) {
        const r = nextResult;
        nextResult = null;
        return r;
      }
      map.set(k, { v: version, savedAt: 'now', data });
      return { ok: true };
    },
    remove: async (k) => void map.delete(k),
    keys: async () => [...map.keys()],
  };
  return { storage, map, calls, failNext: (r: StorageResult) => (nextResult = r) };
}

function spec(storage: StorageAPI, extra: Partial<SaveSpec<Data>> = {}): SaveSpec<Data> {
  return {
    storage,
    key: 'run',
    version: 2,
    defaults: () => ({ n: 0 }),
    validate: isData,
    ...extra,
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('load()', () => {
  it('returns defaults when nothing is stored', async () => {
    const m = memoryStorage();
    expect(await createSave(spec(m.storage)).load()).toEqual({ data: { n: 0 }, source: 'default' });
  });

  it('returns stored data when v === version and validate passes', async () => {
    const m = memoryStorage();
    m.map.set('run', { v: 2, savedAt: 'x', data: { n: 5 } });
    expect(await createSave(spec(m.storage)).load()).toEqual({ data: { n: 5 }, source: 'stored' });
  });

  it('migrates older versions in order and writes back once', async () => {
    const m = memoryStorage();
    m.map.set('run', { v: 1, savedAt: 'x', data: { count: 7 } });
    const save = createSave(
      spec(m.storage, { migrate: { 1: (d) => ({ n: (d as { count: number }).count }) } }),
    );
    expect(await save.load()).toEqual({ data: { n: 7 }, source: 'migrated' });
    expect(m.calls.filter((c) => c === 'set:run')).toHaveLength(1);
  });

  it.each([
    ['future_version', { v: 3, savedAt: 'x', data: { n: 1 } }, {}],
    ['corrupt', { v: 2, savedAt: 'x', data: { wrong: true } }, {}],
    [
      'migration_threw',
      { v: 1, savedAt: 'x', data: {} },
      {
        migrate: {
          1: () => {
            throw new Error('bad');
          },
        },
      },
    ],
  ] as const)('backs up to <key>.bak and reports once on %s', async (issue, stored, extra) => {
    const m = memoryStorage();
    m.map.set('run', stored as SaveEnvelope);
    const reportError = vi.fn();
    const result = await createSave(spec(m.storage, extra as Partial<SaveSpec<Data>>), {
      reportError,
    }).load();
    expect(result).toEqual({ data: { n: 0 }, source: 'default', issue });
    expect(m.map.get('run.bak')?.data).toEqual(stored);
    expect(reportError).toHaveBeenCalledTimes(1);
  });

  it('returns defaults with issue unavailable when get rejects', async () => {
    const m = memoryStorage();
    m.storage.get = () => Promise.reject(new Error('boom'));
    expect(await createSave(spec(m.storage)).load()).toEqual({
      data: { n: 0 },
      source: 'default',
      issue: 'unavailable',
    });
  });

  it('makes no storage calls at all in attract mode', async () => {
    const m = memoryStorage();
    const save = createSave(spec(m.storage, { debounceMs: 0 }), { readOnly: true });
    await save.load();
    save.set({ n: 3 });
    await save.flush();
    expect(m.calls).toEqual([]);
  });
});

describe('writes', () => {
  it('debounceMs 0 writes once per set()', async () => {
    const m = memoryStorage();
    const save = createSave(spec(m.storage, { debounceMs: 0 }));
    save.set({ n: 1 });
    save.set({ n: 2 });
    save.set({ n: 3 });
    await save.flush();
    expect(m.calls).toEqual(['set:run', 'set:run', 'set:run']);
    expect(m.map.get('run')?.data).toEqual({ n: 3 });
  });

  it('coalesces writes within the debounce window and flushes on demand', async () => {
    const m = memoryStorage();
    const save = createSave(spec(m.storage));
    save.set({ n: 1 });
    save.update((d) => ({ n: d.n + 1 }));
    expect(m.calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(500);
    expect(m.calls).toEqual(['set:run']);
    save.set({ n: 9 });
    await save.flush();
    expect(m.map.get('run')?.data).toEqual({ n: 9 });
  });

  it('keeps a failed write in memory and retries at the next flush', async () => {
    const m = memoryStorage();
    const reportError = vi.fn();
    const save = createSave(spec(m.storage, { debounceMs: 0 }), { reportError });
    m.failNext({ ok: false, reason: 'quota' });
    save.set({ n: 1 });
    expect(await save.flush()).toEqual({ ok: false, reason: 'quota' });
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(await save.flush()).toEqual({ ok: true });
    expect(m.map.get('run')?.data).toEqual({ n: 1 });
  });

  it('rejects values over 64 KiB before calling storage', async () => {
    const m = memoryStorage();
    type Big = { s: string };
    const save = createSave<Big>({
      storage: m.storage,
      key: 'big',
      version: 2,
      defaults: () => ({ s: '' }),
      validate: (_d): _d is Big => true,
      debounceMs: 0,
    });
    save.set({ s: 'x'.repeat(70000) });
    expect(await save.flush()).toEqual({ ok: false, reason: 'too_large' });
    expect(m.calls).toEqual([]);
  });
});
