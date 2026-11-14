// Per-game storage: key namespacing, save envelopes, size limits and behaviour when the backend fails.
import { SDK_API_VERSION, type GameMeta } from '@pocketcade/sdk';
import { describe, expect, it } from 'vitest';
import { createMemoryBackend, type StorageBackend } from '../src/backend.ts';
import { createStorageAdmin } from '@pocketcade/sdk/rules';

const meta: GameMeta = {
  id: 'sumslide',
  apiVersion: SDK_API_VERSION,
  version: '1.0.0',
  inputs: ['keyboard'],
  orientation: 'any',
  aspectRatio: 1,
  minSize: { width: 280, height: 280 },
  saveSchemaVersion: 3,
  leaderboards: [],
};
const clock = { now: () => Date.UTC(2026, 10, 10, 12, 0, 0, 123) };

function throwingBackend(name = 'SecurityError'): StorageBackend {
  const fail = () => {
    const e = new Error('blocked');
    e.name = name;
    throw e;
  };
  return { persistent: true, getItem: fail, setItem: fail, removeItem: fail, keys: fail };
}

function setup(backend: StorageBackend = createMemoryBackend()) {
  const admin = createStorageAdmin(backend, clock, false);
  return { backend, storage: admin.forGame(meta, { readOnly: false }), admin };
}

describe('game storage', () => {
  it('namespaces physical keys and writes an envelope with v and savedAt', async () => {
    const { backend, storage } = setup();
    expect(await storage.set('run', { cells: [1, 2] })).toEqual({ ok: true });
    expect(backend.keys('')).toEqual(['pocketcade:v1:g:sumslide:run']);
    const raw = JSON.parse(backend.getItem('pocketcade:v1:g:sumslide:run')!);
    expect(raw).toEqual({ v: 3, savedAt: '2026-11-10T12:00:00.123Z', data: { cells: [1, 2] } });
    expect(await storage.get('run')).toEqual(raw);
  });

  it('validates logical keys', async () => {
    const { storage, backend } = setup();
    expect(await storage.set('Bad Key', 1)).toEqual({ ok: false, reason: 'invalid_key' });
    expect(await storage.set('', 1)).toEqual({ ok: false, reason: 'invalid_key' });
    expect(await storage.get('Bad Key')).toBeNull();
    await expect(storage.remove('Bad Key')).resolves.toBeUndefined();
    expect(backend.keys('')).toEqual([]);
  });

  it('rejects values over 64 KiB as too_large', async () => {
    const { storage } = setup();
    expect(await storage.set('big', 'x'.repeat(65536))).toEqual({ ok: false, reason: 'too_large' });
  });

  it('enforces the 256 KiB per-game cap, but a same-size replacement always fits', async () => {
    const { storage } = setup();
    const chunk = 'x'.repeat(60000);
    for (const k of ['a', 'b', 'c', 'd']) expect(await storage.set(k, chunk)).toEqual({ ok: true });
    expect(await storage.set('e', chunk)).toEqual({ ok: false, reason: 'quota' });
    expect(await storage.set('a', chunk.replace('x', 'y'))).toEqual({ ok: true });
  });

  it('rejects non-JSON data without writing', async () => {
    const { storage, backend } = setup();
    expect(await storage.set('run', { score: Number.NaN })).toEqual({
      ok: false,
      reason: 'unavailable',
    });
    expect(await storage.set('run', { d: new Date() } as never)).toEqual({
      ok: false,
      reason: 'unavailable',
    });
    expect(backend.keys('')).toEqual([]);
  });

  it('returns null for corrupt values but lists them in keys()', async () => {
    const { storage, backend } = setup();
    backend.setItem('pocketcade:v1:g:sumslide:zeta', '{not json');
    backend.setItem(
      'pocketcade:v1:g:sumslide:alpha',
      JSON.stringify({ v: 0, savedAt: 'x', data: 1 }),
    );
    backend.setItem('pocketcade:v1:g:other:run', '1');
    expect(await storage.get('zeta')).toBeNull();
    expect(await storage.get('alpha')).toBeNull();
    expect(await storage.keys()).toEqual(['alpha', 'zeta']);
  });

  it('maps a backend QuotaExceededError to quota', async () => {
    const backend = createMemoryBackend();
    backend.setItem = () => {
      const e = new Error('full');
      e.name = 'QuotaExceededError';
      throw e;
    };
    const { storage } = setup(backend);
    expect(await storage.set('run', 1)).toEqual({ ok: false, reason: 'quota' });
  });

  it('is read-only and silent for attract mounts', async () => {
    const { admin, backend } = setup();
    backend.setItem(
      'pocketcade:v1:g:sumslide:run',
      JSON.stringify({ v: 3, savedAt: 'x', data: 1 }),
    );
    const attract = admin.forGame(meta, { readOnly: true });
    expect(await attract.get('run')).toBeNull();
    expect(await attract.set('run', 2)).toEqual({ ok: false, reason: 'unavailable' });
    expect(await attract.keys()).toEqual([]);
    await attract.remove('run');
    expect(backend.getItem('pocketcade:v1:g:sumslide:run')).not.toBeNull();
  });
});

describe('storage over a backend whose every method throws', () => {
  it('game storage never rejects', async () => {
    const { storage } = setup(throwingBackend());
    await expect(storage.get('run')).resolves.toBeNull();
    await expect(storage.set('run', 1)).resolves.toEqual({ ok: false, reason: 'unavailable' });
    await expect(storage.remove('run')).resolves.toBeUndefined();
    await expect(storage.keys()).resolves.toEqual([]);
  });

  it('portal storage never throws either', () => {
    const { admin } = setup(throwingBackend());
    expect(admin.portal.get('x')).toBeNull();
    expect(admin.portal.set('x', 1)).toEqual({ ok: false });
  });
});
