// Per-mount TkContext and the plumbing both adapters share: host events, mute, the local sound
// preference, overlays, saves and the dev fault hook. Never stored in module scope.
import type {
  FullscreenMode,
  GameMeta,
  HostAPI,
  HostEnv,
  HostEvents,
  InputKind,
  Json,
  MountContext,
  PauseReason,
  SerializableError,
  Size,
  Unsubscribe,
} from '@pocketcade/sdk';
import type { AttractController, AttractScript } from './attract.ts';
import type { Input } from './input.ts';
import { createRng, randomSeedHex, type Rng, type RngState } from './rng.ts';
import { createSave, type Save, type SaveSpec } from './save.ts';
import { NO_SFX, type Sfx } from './sfx.ts';
import type { ToolkitStrings } from './strings.en.ts';
import {
  attractOverlays,
  createOverlays,
  type OverlayConfig,
  type Overlays,
  type OverlaysInternal,
} from './ui/overlays.ts';
import { createMotion, type Motion } from './util.ts';

export interface Layout {
  /** stage size in CSS px */
  cssWidth: number;
  cssHeight: number;
  /** authoring units: the design area (Phaser), or the stage in CSS px (DOM) */
  width: number;
  height: number;
  /**
   * The visible rectangle in design units. With a fixed aspect ratio it is the design area. With an aspect range
   * the frame can be wider or taller than the design area, and the view then extends past it (x or y below 0)
   * by up to `bleed` on each side. Keep gameplay inside the design area; cover the view with scenery.
   */
  view: { x: number; y: number; width: number; height: number };
  /** the largest overhang the game's aspect range allows on each side, in design units */
  bleed: { x: number; y: number };
  /** backing-store scale */
  renderScale: number;
  orientation: 'portrait' | 'landscape';
}

/** HostEnv snapshot kept current by host events. */
export interface TkLiveEnv extends HostEnv {
  readonly size: Size;
  readonly fullscreen: FullscreenMode;
  /** pause-menu "Game sound" toggle (tk.prefs) */
  readonly localSoundOff: boolean;
  /** muted || localSoundOff */
  readonly effectiveMuted: boolean;
}

export interface TkEvents {
  pause: { source: 'host'; reason: PauseReason } | { source: 'menu' };
  resume: { source: 'host' | 'menu' };
  resize: { size: Size; layout: Layout };
  mute: { muted: boolean };
  inputchange: { primary: InputKind };
  dailyrollover: { dailyKey: string };
  fullscreenchange: { mode: FullscreenMode };
  dispose: Record<string, never>;
}

export interface RunTracker {
  readonly active: boolean;
  /** idempotent per run → host.gameplay.start() */
  begin(): void;
  /** once per run → host.gameplay.stop(reason) + save flush */
  end(reason: 'gameover' | 'level_end' | 'menu'): void;
}

export interface RngProvider {
  /** play/restart: random seed; attract: fixed seed */
  readonly main: Rng;
  create(seed: string | RngState): Rng;
}

export type TkSaveSpec<T extends Json> = Omit<SaveSpec<T>, 'storage' | 'version'>;

export interface TkContext {
  readonly meta: GameMeta;
  readonly host: HostAPI;
  readonly ctx: MountContext;
  readonly env: TkLiveEnv;
  readonly layout: Layout;
  /** aborted when unmount starts */
  readonly signal: AbortSignal;
  readonly input: Input;
  readonly sfx: Sfx;
  readonly ui: Overlays;
  readonly rng: RngProvider;
  readonly motion: Motion;
  readonly run: RunTracker;
  /** non-null only when ctx.launch === 'attract' */
  readonly attract: AttractController | null;
  createSave<T extends Json>(spec: TkSaveSpec<T>): Save<T>;
  on<E extends keyof TkEvents>(event: E, cb: (payload: TkEvents[E]) => void): Unsubscribe;
  /** 0..1 of the game's share; mapped onto host.gameplay.loading */
  loading(progress: number): void;
  ready(): void;
  deferReady(): void;
  reportError(error: unknown, fatal?: boolean): void;
}

/** What an adapter supplies for the overlays (never shown in attract). */
export interface UiOptions {
  /** div[data-tk-ui] */
  layer: HTMLElement;
  stage: HTMLElement;
  strings: ToolkitStrings;
  config: OverlayConfig;
  /** freeze/unfreeze the game while the how-to or pause menu is open */
  onMenu(open: boolean): void;
  hostPaused(): boolean;
}

/** Internal handle the adapter keeps next to the TkContext. */
export interface TkInternals {
  tk: TkContext;
  emit<E extends keyof TkEvents>(event: E, payload: TkEvents[E]): void;
  /** the adapter plugs in services built after the context */
  set(parts: Partial<{ sfx: Sfx; attract: AttractController }>): void;
  /** Builds tk.ui: the real overlays, or the no-UI attract stand-in. */
  createUi(o: UiOptions): OverlaysInternal;
  /** pushes host mute OR local "Game sound" off to the engine, the game and the overlays. */
  applyMute(): void;
  /** play/restart: reads the local "Game sound" preference (tk.prefs). */
  loadPrefs(): Promise<void>;
  /** listener/timer errors are fatal after 3 within 1 s */
  listenerError(e: unknown): void;
  flushSaves(): Promise<void>;
  /** resolves once ready() is called, or immediately if deferReady() was never called */
  readyGate(): Promise<void>;
  /** Start of unmount: flush saves (≤ 500 ms), emit 'dispose', then end every mount-scoped listener. */
  dispose(): Promise<void>;
}

export interface CreateTkArgs {
  meta: GameMeta;
  host: HostAPI;
  ctx: MountContext;
  /** seed and restart delay in attract */
  attract: AttractScript;
  /** layout for a stage size: at creation and on every host resize */
  layoutFor(size: Size): Layout;
  input: (signal: AbortSignal) => Input;
  /** maps 0..1 of the game's share onto host progress (adapter-specific) */
  loading: (p: number) => void;
  /** first fatal error: stop loops and freeze the game before the rethrow */
  onFatal: () => void;
  /** silence or restore the engine / sfx bus */
  setMuted(muted: boolean): void;
  /** the stage size or fullscreen mode changed */
  onStageChange?(): void;
}

export const abortError = () => new DOMException('Aborted', 'AbortError');

/** `p`, or an AbortError as soon as `signal` aborts. */
export function raceAbort<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener('abort', onAbort, { once: true });
    p.then(
      (v) => {
        signal.removeEventListener('abort', onAbort);
        resolve(v);
      },
      (e: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(e);
      },
    );
  });
}

/** Dev-time config checks shared by definePhaserGame and defineDomGame. */
export function checkConfig(
  overlays: OverlayConfig | undefined,
  attract: AttractScript | undefined,
): void {
  const steps = overlays?.howTo?.steps.length ?? 0;
  if (steps < 1 || steps > 4) throw new Error('overlays.howTo needs 1–4 steps');
  if (typeof attract?.drive !== 'function') throw new Error('config.attract script is required');
}

function toSerializable(e: unknown): SerializableError {
  if (e instanceof Error)
    return { name: e.name, message: e.message, ...(e.stack ? { stack: e.stack } : {}) };
  return { name: 'Error', message: String(e) };
}

export function createTkContext(args: CreateTkArgs): TkInternals {
  const { meta, host, ctx } = args;
  const attract = ctx.launch === 'attract';
  const controller = new AbortController();
  const subs = new Map<keyof TkEvents, Set<(p: never) => void>>();
  const saves = new Set<Save<Json>>();
  let layout = args.layoutFor(ctx.size);
  let env: TkLiveEnv = {
    ...host.env,
    size: ctx.size,
    fullscreen: 'none',
    localSoundOff: false,
    effectiveMuted: host.env.muted,
  };
  let sfx: Sfx = NO_SFX;
  let ui: OverlaysInternal | null = null;
  let attractCtl: AttractController | null = null;
  let fataled = false;
  const listenerErrors: number[] = [];
  let deferred = false;
  let readyResolve: (() => void) | null = null;
  const readyPromise = new Promise<void>((r) => (readyResolve = r));

  const seed = attract
    ? (args.attract.seed ?? `${meta.id}:attract`)
    : `${meta.id}:play:${randomSeedHex()}`;
  const rng: RngProvider = { main: createRng(seed), create: (s) => createRng(s) };

  const reportError = (error: unknown, fatal = false) => {
    if (fataled) return; // the game is frozen; no error storm
    host.reportError(toSerializable(error));
    if (!fatal) return;
    fataled = true;
    try {
      args.onFatal();
    } catch {
      // freezing is best-effort
    }
    // mark the error as this game's, then rethrow in a microtask so the host's window 'error'
    // listener raises the crash card.
    if (typeof error === 'object' && error !== null)
      (error as Record<symbol, unknown>)[Symbol.for('pocketcade.gameId')] = meta.id;
    queueMicrotask(() => {
      throw error;
    });
  };

  function emit<E extends keyof TkEvents>(event: E, payload: TkEvents[E]): void {
    for (const cb of [...(subs.get(event) ?? [])]) {
      try {
        (cb as (p: TkEvents[E]) => void)(payload);
      } catch (e) {
        reportError(e);
      }
    }
  }

  function listenerError(e: unknown): void {
    const now = performance.now();
    listenerErrors.push(now);
    while (listenerErrors.length && now - listenerErrors[0]! > 1000) listenerErrors.shift();
    reportError(e, listenerErrors.length >= 3);
  }

  let runActive = false;
  const run: RunTracker = {
    get active() {
      return runActive;
    },
    begin() {
      if (attract || runActive) return;
      runActive = true;
      host.gameplay.start();
    },
    end(reason) {
      if (attract || !runActive) return;
      runActive = false;
      host.gameplay.stop(reason);
      void flushSaves();
    },
  };

  async function flushSaves(): Promise<void> {
    await Promise.all([...saves].map((s) => s.flush()));
  }

  function applyMute(): void {
    args.setMuted(env.effectiveMuted);
    emit('mute', { muted: env.effectiveMuted });
    ui?.refresh();
  }

  function setLocalSoundOff(off: boolean): void {
    env = { ...env, localSoundOff: off, effectiveMuted: env.muted || off };
  }

  const tk: TkContext = {
    meta,
    host,
    ctx,
    get env() {
      return env;
    },
    get layout() {
      return layout;
    },
    signal: controller.signal,
    input: args.input(controller.signal),
    get sfx() {
      return sfx;
    },
    get ui() {
      return ui!;
    },
    get attract() {
      return attractCtl;
    },
    rng,
    motion: createMotion(host.env.reducedMotion),
    run,
    createSave<T extends Json>(spec: TkSaveSpec<T>): Save<T> {
      if (spec.key.startsWith('tk.')) {
        const err = new Error(`storage key "${spec.key}" is reserved for the toolkit`);
        if (host.env.dev) throw err;
        reportError(err);
      }
      const save = createSave<T>(
        { ...spec, storage: host.storage, version: meta.saveSchemaVersion },
        { readOnly: attract, reportError: (e) => host.reportError(e) },
      );
      saves.add(save as unknown as Save<Json>);
      return save;
    },
    on(event, cb) {
      let set = subs.get(event);
      if (!set) subs.set(event, (set = new Set()));
      const entry = (p: never) => cb(p);
      set.add(entry);
      return () => void subs.get(event)?.delete(entry);
    },
    loading: (p) => args.loading(p),
    ready() {
      readyResolve?.();
    },
    deferReady() {
      deferred = true;
    },
    reportError,
  };

  // Host events keep tk.env and tk.layout current and reach the game as tk events (they can arrive while
  // mounting). The subscriptions end with the mount.
  const hostOn = <E extends keyof HostEvents>(e: E, cb: (p: HostEvents[E]) => void) =>
    controller.signal.addEventListener('abort', host.on(e, cb), { once: true });
  hostOn('resize', (size) => {
    env = { ...env, size };
    layout = args.layoutFor(size);
    emit('resize', { size, layout });
    args.onStageChange?.();
  });
  hostOn('fullscreenchange', ({ mode }) => {
    env = { ...env, fullscreen: mode };
    emit('fullscreenchange', { mode });
    args.onStageChange?.();
  });
  hostOn('mute', ({ muted }) => {
    env = { ...env, muted, effectiveMuted: muted || env.localSoundOff };
    applyMute();
  });
  hostOn('inputchange', ({ primary }) => {
    env = { ...env, input: { ...env.input, primary } };
    emit('inputchange', { primary });
    ui?.refresh();
  });
  hostOn('dailyrollover', ({ dailyKey }) => {
    env = { ...env, dailyKey };
    emit('dailyrollover', { dailyKey });
  });

  return {
    tk,
    emit,
    set(parts) {
      if (parts.sfx) sfx = parts.sfx;
      if (parts.attract) attractCtl = parts.attract;
    },
    createUi(o) {
      ui = attract
        ? attractOverlays(args.attract.restartDelayMs ?? 1000, controller.signal)
        : createOverlays({
            ...o,
            host,
            meta,
            env: () => env,
            signal: controller.signal,
            run,
            soundOff: {
              get: () => env.localSoundOff,
              set(off) {
                setLocalSoundOff(off);
                void host.storage.set('tk.prefs', { soundOff: off });
                applyMute();
              },
            },
            reportError: (e) => reportError(e),
          });
      return ui;
    },
    applyMute,
    async loadPrefs() {
      if (attract) return;
      const prefs = await raceAbort(
        host.storage.get<{ soundOff?: boolean }>('tk.prefs'),
        ctx.signal,
      );
      setLocalSoundOff(prefs?.data.soundOff === true);
    },
    listenerError,
    flushSaves,
    readyGate: () => (deferred ? readyPromise : Promise.resolve()),
    async dispose() {
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        flushSaves().catch(() => {}),
        new Promise((r) => (timer = setTimeout(r, 500))),
      ]);
      clearTimeout(timer);
      emit('dispose', {});
      controller.abort();
      subs.clear();
    },
  };
}
