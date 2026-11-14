// @pocketcade/sdk/testing: createMockHost and runContractSuite, for test files only.
// The mock host's storage and scores run on @pocketcade/sdk/rules, the same code as the real host.
import { describe, expect, it, vi } from 'vitest';
import {
  ABORT_SETTLE_MS,
  MOUNT_TIMEOUT_MS,
  SDK_API_VERSION,
  UNMOUNT_TIMEOUT_MS,
  validateMeta,
  type FullscreenMode,
  type GameDefinition,
  type GameMeta,
  type HostAPI,
  type HostEnv,
  type HostEvents,
  type MountContext,
  type PauseReason,
  type SaveEnvelope,
  type ScoreEntry,
  type Size,
} from '../index.ts';
import {
  createMemoryBackend,
  createScoresAdmin,
  createStorageAdmin,
  localDateKey,
} from '../rules/index.ts';
import { GAME_PREFIX } from '../rules/storage.ts';

type Capability = 'storage' | 'scores' | 'fullscreen' | 'audio';

export interface MockHostOptions {
  /** default 'test-game' */
  gameId?: string;
  env?: Partial<HostEnv>;
  /** default: storage, scores, fullscreen, plus audio when the environment has an AudioContext */
  capabilities?: Capability[];
  /** default 'pseudo' */
  fullscreenResult?: FullscreenMode;
  /** attract → read-only storage and scores */
  launch?: 'play' | 'restart' | 'attract';
  now?: () => number;
  saveSchemaVersion?: number;
  leaderboards?: GameMeta['leaderboards'];
}

export interface MockHostControls {
  emit<E extends keyof HostEvents>(event: E, payload: HostEvents[E]): void;
  /** every HostAPI call */
  readonly calls: Array<{ member: string; args: unknown[]; at: number }>;
  /** logical key → envelope */
  readonly storage: Map<string, SaveEnvelope>;
  /** board → entries */
  readonly scores: Map<string, ScoreEntry[]>;
  /** live on() subscriptions */
  readonly subscriptions: number;
  readonly gameplay: Array<{ event: 'start' | 'stop' | 'loading'; arg?: unknown }>;
  readonly errors: Array<{ name: string; message: string }>;
  /** simulate the host revoking the API after unmount */
  revoke(): void;
}

export function createMockHost(opts: MockHostOptions = {}): {
  host: HostAPI;
  controls: MockHostControls;
} {
  const gameId = opts.gameId ?? 'test-game';
  const now = opts.now ?? Date.now;
  const clock = { now };
  const leaderboards = opts.leaderboards ?? [];
  const meta = {
    id: gameId,
    saveSchemaVersion: opts.saveSchemaVersion ?? 1,
    leaderboards,
  } as GameMeta;
  const readOnly = opts.launch === 'attract';
  const backend = createMemoryBackend();
  const storageApi = createStorageAdmin(backend, clock, true).forGame(meta, { readOnly });
  const scoresApi = createScoresAdmin(backend, clock).forGame(meta, { readOnly });

  const AC = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
  const capabilities = new Set<Capability>(
    opts.capabilities ?? ['storage', 'scores', 'fullscreen', ...(AC ? (['audio'] as const) : [])],
  );
  let audio: { context: AudioContext; output: AudioNode } | null = null;
  const getAudio = () => {
    if (!capabilities.has('audio')) {
      const e = new Error('audio capability unavailable');
      e.name = 'CapabilityUnavailable';
      throw e;
    }
    if (!audio) {
      const context = AC ? new AC() : stubContext();
      const output = context.createGain();
      output.connect(context.destination);
      audio = { context, output };
    }
    return audio;
  };

  const env: HostEnv = {
    mode: 'direct',
    locale: 'en-US',
    reducedMotion: false,
    muted: false,
    input: { primary: 'keyboard', hasKeyboard: true, hasTouch: false },
    dailyKey: localDateKey(now()),
    storagePersistent: true,
    dev: true,
    ...opts.env,
  };

  const calls: MockHostControls['calls'] = [];
  const gameplay: MockHostControls['gameplay'] = [];
  const errors: MockHostControls['errors'] = [];
  const listeners = new Map<keyof HostEvents, Set<(p: never) => void>>();
  let subscriptions = 0;
  let revoked = false;
  const record = (member: string, args: unknown[]) => calls.push({ member, args, at: now() });

  const host: HostAPI = {
    apiVersion: SDK_API_VERSION,
    capabilities,
    env,
    storage: {
      get: (key) => (
        record('storage.get', [key]),
        revoked ? Promise.resolve(null) : storageApi.get(key)
      ),
      set: (key, data) => (
        record('storage.set', [key, data]),
        revoked ? Promise.resolve({ ok: false, reason: 'unavailable' }) : storageApi.set(key, data)
      ),
      remove: (key) => (
        record('storage.remove', [key]),
        revoked ? Promise.resolve() : storageApi.remove(key)
      ),
      keys: () => (record('storage.keys', []), revoked ? Promise.resolve([]) : storageApi.keys()),
    },
    scores: {
      submit: (s) => (
        record('scores.submit', [s]),
        revoked
          ? Promise.resolve({
              accepted: false,
              rank: null,
              personalBest: false,
              reason: 'unavailable',
            })
          : scoresApi.submit(s)
      ),
      top: (board, limit) => (
        record('scores.top', [board, limit]),
        revoked ? Promise.resolve([]) : scoresApi.top(board, limit)
      ),
    },
    display: {
      requestFullscreen: () => (
        record('display.requestFullscreen', []),
        Promise.resolve({ mode: opts.fullscreenResult ?? 'pseudo' })
      ),
      exitFullscreen: () => (record('display.exitFullscreen', []), Promise.resolve()),
    },
    get audio() {
      record('audio', []);
      return getAudio();
    },
    gameplay: {
      start: () => (record('gameplay.start', []), void gameplay.push({ event: 'start' })),
      stop: (reason) => (
        record('gameplay.stop', [reason]),
        void gameplay.push({ event: 'stop', arg: reason })
      ),
      loading: (p) => (
        record('gameplay.loading', [p]),
        void gameplay.push({ event: 'loading', arg: p })
      ),
    },
    on(event, cb) {
      record('on', [event]);
      if (revoked) return () => {};
      let set = listeners.get(event);
      if (!set) listeners.set(event, (set = new Set()));
      const entry = cb as (p: never) => void;
      set.add(entry);
      subscriptions++;
      let live = true;
      return () => {
        if (!live) return;
        live = false;
        subscriptions--;
        listeners.get(event)?.delete(entry);
      };
    },
    reportError(error) {
      record('reportError', [error]);
      errors.push({ name: error.name, message: error.message });
    },
  };

  const controls: MockHostControls = {
    emit(event, payload) {
      if (event === 'mute')
        (env as { muted: boolean }).muted = (payload as HostEvents['mute']).muted;
      if (event === 'dailyrollover')
        (env as { dailyKey: string }).dailyKey = (payload as HostEvents['dailyrollover']).dailyKey;
      for (const cb of [...(listeners.get(event) ?? [])])
        (cb as (p: HostEvents[typeof event]) => void)(payload);
    },
    calls,
    get storage() {
      const out = new Map<string, SaveEnvelope>();
      const prefix = `${GAME_PREFIX}${gameId}:`;
      for (const k of backend.keys(prefix))
        out.set(k.slice(prefix.length), JSON.parse(backend.getItem(k)!) as SaveEnvelope);
      return out;
    },
    get scores() {
      const out = new Map<string, ScoreEntry[]>();
      for (const def of leaderboards) {
        const raw = backend.getItem(`pocketcade:v1:lb:${gameId}:${def.id}`);
        if (!raw) continue;
        const entries = (JSON.parse(raw) as { entries: Omit<ScoreEntry, 'rank'>[] }).entries;
        out.set(
          def.id,
          entries.map((e, i) => ({ ...e, rank: i + 1 })),
        );
      }
      return out;
    },
    get subscriptions() {
      return subscriptions;
    },
    gameplay,
    errors,
    revoke() {
      revoked = true;
      listeners.clear();
      subscriptions = 0;
    },
  };
  return { host, controls };
}

/** A minimal AudioContext stand-in for environments without Web Audio. */
function stubContext(): AudioContext {
  const node = () => ({
    connect: () => {},
    disconnect: () => {},
    gain: { value: 1, setValueAtTime: () => {} },
  });
  return {
    state: 'running',
    sampleRate: 48000,
    currentTime: 0,
    destination: node(),
    createGain: node,
    createBuffer: (ch: number, len: number, rate: number) => ({
      numberOfChannels: ch,
      length: len,
      sampleRate: rate,
      getChannelData: () => new Float32Array(len),
      copyToChannel: () => {},
    }),
    createBufferSource: () => ({
      ...node(),
      buffer: null,
      start: () => {},
      stop: () => {},
      onended: null,
    }),
    resume: () => Promise.resolve(),
    suspend: () => Promise.resolve(),
    addEventListener: () => {},
    removeEventListener: () => {},
  } as unknown as AudioContext;
}

// ───────────────────────────── Contract suite ─────────────────────────────

export interface ContractSuiteOptions {
  /**
   * Re-imports the game module (`() => import('../src/index.ts')`) so the suite can check that importing it has
   * no side effects. That test is skipped without it.
   */
  load?: () => Promise<unknown>;
}

const PAUSE_REASONS: Array<PauseReason | 'future-reason'> = [
  'visibility',
  'blur',
  'offscreen',
  'overlay',
  'user',
  'host',
  'future-reason',
];

interface GlobalSpy {
  /** net window/document listeners added since install */
  readonly listeners: number;
  /** nodes added to body/head outside test containers */
  readonly strayNodes: number;
  /** Web Storage / IndexedDB calls */
  readonly storageCalls: number;
  readonly timers: number;
  restore(): void;
}

function installGlobalSpy(isContainer: (n: Node) => boolean): GlobalSpy {
  let strayNodes = 0;
  let storageCalls = 0;
  let timers = 0;
  const undo: Array<() => void> = [];
  // Patch the prototype: the Phaser adapter's listener-capture wrappers forward there.
  const live = new Set<string>();
  const ids = new WeakMap<object, number>();
  let nextId = 0;
  const idOf = (v: unknown) => {
    if ((typeof v !== 'object' && typeof v !== 'function') || v === null) return String(v);
    let n = ids.get(v);
    if (n === undefined) ids.set(v, (n = ++nextId));
    return String(n);
  };
  const keyOf = (t: EventTarget, type: string, cb: unknown, o?: boolean | EventListenerOptions) =>
    `${t === window ? 'w' : 'd'}|${type}|${typeof o === 'boolean' ? o : !!o?.capture}|${idOf(cb)}`;
  const proto = EventTarget.prototype;
  const add = proto.addEventListener;
  const remove = proto.removeEventListener;
  proto.addEventListener = function (
    this: EventTarget,
    type: string,
    cb: EventListenerOrEventListenerObject | null,
    o?: boolean | AddEventListenerOptions,
  ) {
    if (cb && (this === window || this === document)) live.add(keyOf(this, type, cb, o));
    return add.call(this, type, cb, o);
  };
  proto.removeEventListener = function (
    this: EventTarget,
    type: string,
    cb: EventListenerOrEventListenerObject | null,
    o?: boolean | EventListenerOptions,
  ) {
    if (this === window || this === document) live.delete(keyOf(this, type, cb, o));
    return remove.call(this, type, cb, o);
  };
  undo.push(() => {
    proto.addEventListener = add;
    proto.removeEventListener = remove;
  });
  const observer = new MutationObserver((records) => {
    for (const r of records) for (const n of r.addedNodes) if (!isContainer(n)) strayNodes++;
  });
  observer.observe(document.body, { childList: true });
  observer.observe(document.head, { childList: true });
  undo.push(() => observer.disconnect());
  const wrap = (obj: object, m: string) => {
    const orig = (obj as Record<string, (...a: unknown[]) => unknown>)[m]!.bind(obj);
    Object.defineProperty(obj, m, {
      configurable: true,
      value: (...a: unknown[]) => (storageCalls++, orig(...a)),
    });
    undo.push(() => delete (obj as Record<string, unknown>)[m]);
  };
  for (const s of [globalThis.localStorage, globalThis.sessionStorage]) {
    if (s) for (const m of ['getItem', 'setItem', 'removeItem', 'clear', 'key']) wrap(s, m);
  }
  if (globalThis.indexedDB) wrap(globalThis.indexedDB, 'open');
  const st = globalThis.setTimeout;
  globalThis.setTimeout = ((...a: Parameters<typeof setTimeout>) => (
    timers++,
    st(...a)
  )) as typeof setTimeout;
  undo.push(() => (globalThis.setTimeout = st));
  return {
    get listeners() {
      return live.size;
    },
    get strayNodes() {
      return strayNodes;
    },
    get storageCalls() {
      return storageCalls;
    },
    get timers() {
      return timers;
    },
    restore: () => undo.reverse().forEach((u) => u()),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function within<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([
    p,
    sleep(ms).then(() => Promise.reject(new Error(`${what} did not settle within ${ms} ms`))),
  ]);
}

/**
 * Registers the contract tests for one game definition: what every game must do so the host can mount, pause,
 * resume and unmount it. Call it at the top level of a test file that runs in a real browser.
 */
export function runContractSuite(def: GameDefinition, opts: ContractSuiteOptions = {}): void {
  const meta = def.meta;
  const TIMEOUT = MOUNT_TIMEOUT_MS + 6000;

  const containers = new Set<Node>();
  const makeContainer = () => {
    const c = document.createElement('div');
    c.setAttribute('data-pocketcade-game', meta.id);
    c.style.cssText = 'position:relative;width:800px;height:600px';
    containers.add(c);
    document.body.appendChild(c);
    return c;
  };
  const size = (): Size => ({ width: 800, height: 600, dpr: 1 });
  const hostFor = (launch: MountContext['launch']) =>
    createMockHost({
      gameId: meta.id,
      launch,
      saveSchemaVersion: meta.saveSchemaVersion,
      leaderboards: meta.leaderboards,
    });

  /** Mounts a fresh instance; `body` runs while mounted. Always unmounts and removes the container. */
  async function session(
    launch: MountContext['launch'],
    body: (s: {
      game: ReturnType<GameDefinition['create']>;
      host: ReturnType<typeof createMockHost>;
    }) => Promise<void>,
  ) {
    const mock = hostFor(launch);
    const container = makeContainer();
    const game = def.create();
    const controller = new AbortController();
    try {
      await within(
        game.mount(container, mock.host, { signal: controller.signal, size: size(), launch }),
        MOUNT_TIMEOUT_MS,
        'mount()',
      );
      await body({ game, host: mock });
    } finally {
      await within(game.unmount(), UNMOUNT_TIMEOUT_MS, 'unmount()');
      container.remove();
    }
    return mock;
  }

  describe(`contract: ${meta.id}`, () => {
    it('meta is valid', () => {
      expect(validateMeta(meta)).toEqual([]);
      expect(meta.apiVersion).toBe(SDK_API_VERSION);
    });

    it.skipIf(!opts.load)(
      'importing the module has no side effects',
      async () => {
        const spy = installGlobalSpy((n) => containers.has(n));
        try {
          const before = {
            nodes: document.body.childElementCount + document.head.childElementCount,
            timers: spy.timers,
          };
          vi.resetModules();
          await opts.load!();
          expect(document.body.childElementCount + document.head.childElementCount).toBe(
            before.nodes,
          );
          expect(spy.listeners).toBe(0);
          expect(spy.timers).toBe(before.timers);
          expect(spy.storageCalls).toBe(0);
        } finally {
          spy.restore();
        }
      },
      TIMEOUT,
    );

    it('create() returns a fresh instance each time', () => {
      expect(def.create()).not.toBe(def.create());
    });

    it(
      'mount resolves; the game stays inside its container and uses only host storage and its own boards',
      async () => {
        const spy = installGlobalSpy((n) => containers.has(n));
        try {
          const mock = await session('play', async ({ host }) => {
            const container = [...containers].at(-1) as HTMLElement;
            expect(container.childElementCount).toBeGreaterThanOrEqual(1);
            await sleep(500);
            expect(host.controls.errors).toEqual([]);
          });
          expect(spy.storageCalls, 'direct Web Storage / IndexedDB calls').toBe(0);
          for (const g of mock.controls.gameplay.filter((g) => g.event === 'loading')) {
            expect(g.arg, 'loading progress').toBeGreaterThanOrEqual(0);
            expect(g.arg, 'loading progress').toBeLessThanOrEqual(1);
          }
          const boards = new Set(meta.leaderboards.map((b) => b.id));
          for (const c of mock.controls.calls.filter((c) => c.member === 'scores.submit'))
            expect(boards.has((c.args[0] as { board: string }).board), 'declared board').toBe(true);
          expect(spy.strayNodes, 'nodes added outside the container').toBe(0);
          expect(spy.listeners, 'window/document listeners left after unmount').toBe(0);
        } finally {
          spy.restore();
        }
      },
      TIMEOUT,
    );

    it(
      'an aborted mount settles within 2 s',
      async () => {
        const mock = hostFor('play');
        const container = makeContainer();
        const game = def.create();
        const controller = new AbortController();
        const mounting = game.mount(container, mock.host, {
          signal: controller.signal,
          size: size(),
          launch: 'play',
        });
        controller.abort();
        await within(
          mounting.then(
            () => {},
            () => {},
          ),
          ABORT_SETTLE_MS,
          'aborted mount()',
        );
        await within(game.unmount(), UNMOUNT_TIMEOUT_MS, 'unmount() after abort');
        container.remove();
      },
      TIMEOUT,
    );

    it(
      'pause and resume are idempotent, and every host event is tolerated in any state',
      async () => {
        await session('play', async ({ game, host }) => {
          const emitAll = () => {
            host.controls.emit('resize', { width: 800, height: 600, dpr: 2 });
            host.controls.emit('resize', { width: 50, height: 40, dpr: 1 });
            host.controls.emit('resize', { width: 800, height: 600, dpr: 1 });
            host.controls.emit('mute', { muted: true });
            host.controls.emit('mute', { muted: false });
            host.controls.emit('fullscreenchange', { mode: 'pseudo' });
            host.controls.emit('fullscreenchange', { mode: 'none' });
            host.controls.emit('inputchange', { primary: 'touch' });
            host.controls.emit('inputchange', { primary: 'keyboard' });
            host.controls.emit('dailyrollover', { dailyKey: '2099-01-01' });
          };
          emitAll();
          for (const r of PAUSE_REASONS) {
            game.pause(r as PauseReason);
            game.pause(r as PauseReason);
          }
          emitAll();
          game.resume();
          game.resume();
          await sleep(200);
          expect(host.controls.errors).toEqual([]);
        });
      },
      TIMEOUT,
    );

    it(
      'unmount empties the container and drops every host subscription',
      async () => {
        const mock = hostFor('play');
        const container = makeContainer();
        const game = def.create();
        await within(
          game.mount(container, mock.host, {
            signal: new AbortController().signal,
            size: size(),
            launch: 'play',
          }),
          MOUNT_TIMEOUT_MS,
          'mount()',
        );
        await within(game.unmount(), UNMOUNT_TIMEOUT_MS, 'unmount()');
        expect(container.childElementCount).toBe(0);
        expect(mock.controls.subscriptions).toBe(0);
        container.remove();
      },
      TIMEOUT,
    );

    it(
      'a second mount behaves like the first',
      async () => {
        const pattern = (m: ReturnType<typeof createMockHost>) =>
          m.controls.calls
            .filter((c) => c.member.startsWith('storage.'))
            .map((c) => `${c.member}(${String(c.args[0])})`);
        const first = await session('play', async () => {});
        const second = await session('play', async () => {});
        expect(pattern(second)).toEqual(pattern(first));
      },
      2 * TIMEOUT,
    );

    it(
      'attract mode makes no storage or score calls',
      async () => {
        const mock = await session('attract', async () => void (await sleep(3000)));
        const touched = mock.controls.calls.filter(
          (c) => c.member.startsWith('storage.') || c.member.startsWith('scores.'),
        );
        expect(touched).toEqual([]);
      },
      TIMEOUT,
    );
  });
}
