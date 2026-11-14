// GameRunner: mounts one game into a player frame through the Game/HostAPI contract.
import {
  ABORT_SETTLE_MS,
  DEFAULT_PAUSE_KEYS,
  MOUNT_TIMEOUT_MS,
  OFFSCREEN_THRESHOLD,
  SDK_API_VERSION,
  UNMOUNT_TIMEOUT_MS,
  validateMeta,
  type FullscreenMode,
  type Game,
  type GameDefinition,
  type GameMeta,
  type HostAPI,
  type HostEnv,
  type HostEvents,
  type InputKind,
  type PauseReason,
  type SerializableError,
  type Size,
} from '@pocketcade/sdk';
import type { ErrorTarget } from './errors.ts';
import { createFullscreen, type Fullscreen } from './fullscreen.ts';
import { msToNextLocalMidnight, type HostServices } from './services.ts';

const HOST_VERSION = '0.2.0';

export type RunnerState =
  'idle' | 'loading' | 'mounting' | 'running' | 'paused' | 'unmounting' | 'disposed' | 'crashed';
type Launch = 'play' | 'restart' | 'attract';

export interface CrashReport {
  errorName: string;
  message: string;
  stack?: string;
  phase: 'import' | 'validate' | 'create' | 'mount' | 'running' | 'pause' | 'resume';
  gameId: string;
  gameVersion: string | null;
  apiVersion: number | null;
  hostVersion: string;
  buildId: string;
  userAgent: string;
  fullscreenMode: FullscreenMode;
  inputPrimary: InputKind;
  storagePersistent: boolean;
  reportedErrors: { count: number; last: string[] };
  occurredAt: string;
  path: string;
  /** set by the embedder */
  crashLoop: boolean;
  primaryAction: 'restart' | 'retry' | 'reload' | 'report';
}

export type RunnerEvent =
  | { type: 'state'; state: RunnerState }
  | { type: 'progress'; value: number | null }
  | { type: 'pausechange'; reasons: PauseReason[]; overlay: boolean }
  | { type: 'notice'; kind: 'rotate' | 'enlarge' | null }
  | {
      type: 'gameplay';
      event: 'start' | 'stop';
      reason?: 'pause' | 'gameover' | 'level_end' | 'menu';
    }
  | {
      type: 'score';
      board: string;
      value: number;
      rank: number;
      entryId: string;
      personalBest: boolean;
    }
  | { type: 'fullscreenchange'; mode: FullscreenMode }
  /** first Escape in pseudo-fullscreen while the game uses Escape: show "Press Esc again to exit full screen" */
  | { type: 'escapehint' }
  | { type: 'diagnostic'; error: SerializableError; fatal: false }
  | { type: 'crash'; report: CrashReport };

export interface GameRunnerOptions {
  gameId: string;
  /** gameLoaders[id] from registry.generated.ts */
  load: () => Promise<{ default: GameDefinition }>;
  /** player frame; the runner adds the container inside it */
  frame: HTMLElement;
  /** fullscreen target holding the frame and the embedder's overlays; default: frame */
  fullscreenTarget?: HTMLElement;
  services: HostServices;
  onEvent(e: RunnerEvent): void;
}

export interface GameRunner {
  readonly state: RunnerState;
  readonly fullscreenMode: FullscreenMode;
  /** desired state = mounted */
  mount(launch?: 'play' | 'attract'): void;
  /** desired state = unmounted; resolves when disposed */
  unmount(): Promise<void>;
  restart(): void;
  addPause(reason: PauseReason, cause?: string): void;
  removePause(reason: PauseReason, cause?: string): void;
  /** call inside a trusted input handler */
  resumeFromOverlay(): void;
  /** player-bar button and auto-fullscreen on phones; call inside the input handler */
  enterFullscreen(pseudoWithoutActivation?: boolean): Promise<{ mode: FullscreenMode }>;
  /** the exit button: a player exit, so a running game pauses behind the resume overlay */
  exitFullscreen(): Promise<void>;
}

const OVERLAY_CAUSES = new Set(['visibility', 'blur', 'host:fullscreen-exit']);
const SCROLL_CODES = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock']);
const HOST_EVENTS = new Set<keyof HostEvents>([
  'resize',
  'mute',
  'fullscreenchange',
  'inputchange',
  'dailyrollover',
]);
const MAX_ERROR_LOG = 20;
const NOTICE_DELAY_MS = 150;

const CONTAINER_STYLE =
  'position:relative;width:100%;height:100%;overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none;' +
  '-webkit-tap-highlight-color:transparent;overscroll-behavior:contain;contain:layout paint';

function abortError(): DOMException {
  return new DOMException('Aborted', 'AbortError');
}

function toSerializable(e: unknown): SerializableError {
  if (e instanceof Error || (typeof e === 'object' && e !== null && 'message' in e)) {
    const x = e as { name?: unknown; message?: unknown; stack?: unknown };
    const out: SerializableError = {
      name: String(x.name ?? 'Error').slice(0, 128),
      message: String(x.message ?? '').slice(0, 2000),
    };
    if (typeof x.stack === 'string') out.stack = x.stack.slice(0, 8192);
    return out;
  }
  return { name: 'Error', message: String(e).slice(0, 2000) };
}

function namedError(name: string, message: string): Error {
  const e = new Error(message);
  e.name = name;
  return e;
}

/** Waits for `p` or `ms`, clearing the timer either way. Returns true if `p` settled first. */
function settleWithin(p: Promise<unknown>, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(false), ms);
    p.then(
      () => (clearTimeout(t), resolve(true)),
      () => (clearTimeout(t), resolve(true)),
    );
  });
}

function matches(q: string): boolean {
  return typeof matchMedia === 'function' && matchMedia(q).matches;
}

const touchPrimary = () => matches('(pointer: coarse)') && matches('(hover: none)');

/** Initial input hint, constrained to meta.inputs. */
function inputHints(meta: GameMeta): HostEnv['input'] {
  let primary: InputKind = touchPrimary()
    ? 'touch'
    : matches('(pointer: fine)')
      ? 'pointer'
      : 'keyboard';
  if (!meta.inputs.includes(primary)) primary = meta.inputs[0] ?? 'keyboard';
  const hasTouch = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
  return { primary, hasKeyboard: matches('(any-pointer: fine)'), hasTouch };
}

function isEditable(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return (
    t.isContentEditable ||
    t.tagName === 'INPUT' ||
    t.tagName === 'TEXTAREA' ||
    t.tagName === 'SELECT'
  );
}

export function createGameRunner(opts: GameRunnerOptions): GameRunner {
  const { services, frame, gameId } = opts;
  const target = opts.fullscreenTarget ?? frame;
  const dev = services.options.dev;
  const tag = `[pocketcade:${gameId}]`;
  const audio = services.audio;

  let state: RunnerState = 'idle';
  let desired: 'mounted' | 'unmounted' | null = null;
  let pendingLaunch: Launch = 'play';
  let currentLaunch: Launch = 'play';
  let scheduled = false;
  let unmountRequested = false;
  let releaseSlot: (() => void) | null = null;

  let meta: GameMeta | null = null;
  let game: Game | null = null;
  let container: HTMLElement | null = null;
  let abort: AbortController | null = null;
  let handle: ReturnType<typeof buildHostApi> | null = null;
  let output: GainNode | null = null;
  let mountCalled = false;
  let mountSettled: Promise<void> = Promise.resolve();
  let mountSettledFlag = true;
  let cleanupDone: Promise<void> = Promise.resolve();
  let fs: Fullscreen | null = null;
  let inputPrimary: InputKind = 'keyboard';
  let lastInputEmit = 0;
  let dailyKey = services.dailyKey;

  const causes = new Map<string, PauseReason>();
  const errorLog: string[] = [];
  let errorCount = 0;

  let resolveDisposed!: () => void;
  const disposed = new Promise<void>((r) => (resolveDisposed = r));

  const log = (msg: string) => {
    if (dev) console.info(`${tag} ${msg}`);
  };

  // ─── events ───
  function emit(e: RunnerEvent): void {
    try {
      opts.onEvent(e);
    } catch (err) {
      if (dev) console.error(`${tag} onEvent threw`, err);
    }
  }
  function setState(s: RunnerState): void {
    if (state === s) return;
    log(`${state} → ${s}`);
    state = s;
    emit({ type: 'state', state: s });
  }
  const active = () =>
    state === 'loading' || state === 'mounting' || state === 'running' || state === 'paused';
  const playing = () => state === 'mounting' || state === 'running' || state === 'paused';
  const attract = () => currentLaunch === 'attract';
  function pauseReasons(): PauseReason[] {
    return [...new Set(causes.values())];
  }
  function emitPause(): void {
    const visible = typeof document === 'undefined' || document.visibilityState !== 'hidden';
    const overlay = visible && [...causes.keys()].some((c) => OVERLAY_CAUSES.has(c));
    emit({ type: 'pausechange', reasons: pauseReasons(), overlay });
  }

  // ─── fullscreen ───
  function ensureFullscreen(): Fullscreen {
    fs ??= createFullscreen(target, {
      orientation: () => meta?.orientation ?? 'any',
      pauseKeys: () => meta?.pauseKeys ?? DEFAULT_PAUSE_KEYS,
      dev,
      onEscapeHint: () => emit({ type: 'escapehint' }),
      onChange(mode, userExit) {
        emit({ type: 'fullscreenchange', mode });
        handle?.emitToGame('fullscreenchange', { mode });
        lastSize = null; // fullscreenchange, then resize
        scheduleResize();
        if (userExit && playing()) addPause('host', 'host:fullscreen-exit');
      },
    });
    return fs;
  }

  // ─── global + frame listeners (registered when the first operation starts, removed at dispose) ───
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') return addPause('visibility');
    emitPause();
    checkDailyKey();
  };
  const onPageHide = () => addPause('visibility');
  const onPageShow = (e: PageTransitionEvent) => {
    if (!e.persisted) return;
    emitPause();
    lastSize = null;
    scheduleResize();
    checkDailyKey();
  };
  const onBlur = () => {
    if (document.visibilityState === 'visible') addPause('blur');
  };
  const onFocus = () => checkDailyKey();
  const onKeyDown = (e: KeyboardEvent) => {
    // bubble phase, so the game's own handlers run first.
    // inside a shadow root the target is retargeted to the host, so check the real origin.
    if (
      state === 'running' &&
      SCROLL_CODES.has(e.code) &&
      !isEditable(e.composedPath()[0] ?? e.target)
    )
      e.preventDefault();
  };
  // trusted input in the frame resumes audio and updates the input hint.
  const onInput = (e: Event) => {
    if (!e.isTrusted && !dev) return;
    const ctx = audio.context;
    if (ctx && ctx.state !== 'running' && state === 'running' && !audio.muted && !attract())
      audio.unlock();
    let kind: InputKind | null = null;
    if (e instanceof KeyboardEvent) kind = MODIFIER_KEYS.has(e.key) ? null : 'keyboard';
    else if (e instanceof PointerEvent) kind = e.pointerType === 'touch' ? 'touch' : 'pointer';
    if (!kind || kind === inputPrimary || !meta?.inputs.includes(kind)) return;
    const now = Date.now();
    if (now - lastInputEmit < 1000) return; // at most once per second
    lastInputEmit = now;
    inputPrimary = kind;
    handle?.emitToGame('inputchange', { primary: kind });
  };
  let resizeObserver: ResizeObserver | null = null;
  let intersection: IntersectionObserver | null = null;
  let dprQuery: MediaQueryList | null = null;
  let orientationQuery: MediaQueryList | null = null;
  let dayTimer: ReturnType<typeof setTimeout> | null = null;
  let dayInterval: ReturnType<typeof setInterval> | null = null;
  const onDprChange = () => {
    watchDpr();
    scheduleResize();
  };
  const onOrientation = () => scheduleNotices();
  function watchDpr(): void {
    dprQuery?.removeEventListener('change', onDprChange);
    dprQuery =
      typeof matchMedia === 'function'
        ? matchMedia(`(resolution: ${globalThis.devicePixelRatio || 1}dppx)`)
        : null;
    dprQuery?.addEventListener('change', onDprChange);
  }
  let listening = false;
  function listen(): void {
    if (listening || typeof window === 'undefined') return;
    listening = true;
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    frame.addEventListener('keydown', onKeyDown);
    frame.addEventListener('keydown', onInput, true);
    frame.addEventListener('pointerdown', onInput, true);
    ensureFullscreen();
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => scheduleResize());
      resizeObserver.observe(frame);
    }
    if (typeof IntersectionObserver !== 'undefined') {
      // < 50 % visible → offscreen cause; auto-resume at ≥ 50 %.
      intersection = new IntersectionObserver(
        ([entry]) => {
          if (!entry || !playing()) return;
          if (entry.intersectionRatio < OFFSCREEN_THRESHOLD) addPause('offscreen');
          else removePause('offscreen');
        },
        { threshold: [OFFSCREEN_THRESHOLD] },
      );
      intersection.observe(frame);
    }
    watchDpr();
    orientationQuery =
      typeof matchMedia === 'function' ? matchMedia('(orientation: portrait)') : null;
    orientationQuery?.addEventListener('change', onOrientation);
    armDailyTimers();
  }
  function unlisten(): void {
    if (!listening) return;
    listening = false;
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', onPageShow);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('focus', onFocus);
    frame.removeEventListener('keydown', onKeyDown);
    frame.removeEventListener('keydown', onInput, true);
    frame.removeEventListener('pointerdown', onInput, true);
    resizeObserver?.disconnect();
    resizeObserver = null;
    intersection?.disconnect();
    intersection = null;
    dprQuery?.removeEventListener('change', onDprChange);
    dprQuery = null;
    orientationQuery?.removeEventListener('change', onOrientation);
    orientationQuery = null;
    if (dayTimer !== null) clearTimeout(dayTimer);
    if (dayInterval !== null) clearInterval(dayInterval);
    dayTimer = dayInterval = null;
    if (noticeTimer !== null) clearTimeout(noticeTimer);
    noticeTimer = null;
  }

  // ─── daily key rollover ───
  function checkDailyKey(): void {
    const key = services.dailyKey;
    if (key === dailyKey) return;
    dailyKey = key;
    log(`daily key → ${key}`);
    handle?.emitToGame('dailyrollover', { dailyKey: key });
  }
  function armDailyTimers(): void {
    if (dayTimer !== null) clearTimeout(dayTimer);
    dayTimer = setTimeout(
      () => {
        checkDailyKey();
        armDailyTimers();
      },
      msToNextLocalMidnight(services.options.clock.now()) + 50,
    );
    dayInterval ??= setInterval(checkDailyKey, 60_000);
  }

  // ─── resize and notices ───
  let lastSize: Size | null = null;
  let resizePending = false;
  let noticeTimer: ReturnType<typeof setTimeout> | null = null;
  let notice: 'rotate' | 'enlarge' | null = null;
  function measure(): Size {
    const r = frame.getBoundingClientRect();
    return { width: r.width, height: r.height, dpr: globalThis.devicePixelRatio || 1 };
  }
  function scheduleResize(): void {
    if (resizePending) return;
    resizePending = true;
    let done = false;
    const fire = () => {
      if (done) return;
      done = true;
      resizePending = false;
      scheduleNotices();
      const size = measure();
      if (
        lastSize &&
        size.width === lastSize.width &&
        size.height === lastSize.height &&
        size.dpr === lastSize.dpr
      )
        return;
      if (size.width === 0 && size.height === 0) return;
      lastSize = size;
      handle?.emitToGame('resize', size);
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fire);
    setTimeout(fire, 50); // rAF stops in hidden tabs
  }
  function scheduleNotices(): void {
    if (noticeTimer !== null) clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => {
      noticeTimer = null;
      updateNotices();
    }, NOTICE_DELAY_MS);
  }
  function updateNotices(): void {
    if (!meta || !playing() || attract()) return;
    const size = measure();
    const portrait = matches('(orientation: portrait)');
    const rotate =
      touchPrimary() &&
      meta.orientation !== 'any' &&
      (meta.orientation === 'landscape') === portrait;
    const enlarge =
      size.width > 0 && (size.width < meta.minSize.width || size.height < meta.minSize.height);
    if (rotate) addPause('host', 'host:orientation');
    else removePause('host', 'host:orientation');
    if (enlarge) addPause('host', 'host:size');
    else removePause('host', 'host:size');
    const next = rotate ? 'rotate' : enlarge ? 'enlarge' : null;
    if (next !== notice) {
      notice = next;
      emit({ type: 'notice', kind: next });
    }
  }

  // ─── diagnostics ───
  function diagnostic(e: unknown): void {
    const err = toSerializable(e);
    errorCount++;
    errorLog.push(`${err.name}: ${err.message}`);
    if (errorLog.length > MAX_ERROR_LOG) errorLog.shift();
    if (dev && errorCount <= MAX_ERROR_LOG) console.error(tag, err.name, err.message);
    else if (dev && errorCount === MAX_ERROR_LOG + 1)
      console.error(`${tag} further errors suppressed`);
    emit({ type: 'diagnostic', error: err, fatal: false });
  }

  // ─── HostAPI per mount ───
  function buildHostApi(m: GameMeta, launch: Launch, gain: GainNode | null) {
    let revoked = false;
    let mountResolved = false;
    let started = false;
    let lastStop: string | null = null;
    let lastProgress = -Infinity;
    const isAttract = launch === 'attract';
    const storage = services.storage.forGame(m, { readOnly: isAttract });
    const scores = services.scores.forGame(m, {
      readOnly: isAttract,
      onRanked: (s) => emit({ type: 'score', ...s }),
    });
    const subs = new Map<keyof HostEvents, Set<(p: never) => void>>();
    const warnRevoked = (member: string) => {
      if (dev) console.warn(`${tag} ${member} called after unmount`);
    };
    const input = inputHints(m);
    inputPrimary = input.primary;

    const env: HostEnv = Object.freeze({
      mode: 'direct',
      locale: services.options.locale,
      reducedMotion:
        services.options.reducedMotion === 'system'
          ? matches('(prefers-reduced-motion: reduce)')
          : services.options.reducedMotion,
      muted: isAttract ? true : audio.muted,
      input: Object.freeze(input),
      dailyKey,
      storagePersistent: services.storage.persistent,
      dev,
    });

    const capabilities = new Set<'storage' | 'scores' | 'fullscreen' | 'audio'>([
      'storage',
      'scores',
      'fullscreen',
    ]);
    if (gain) capabilities.add('audio');

    const api = {
      apiVersion: SDK_API_VERSION,
      capabilities,
      env,
      storage: Object.freeze({
        get: (key: string) =>
          revoked ? (warnRevoked('storage.get'), Promise.resolve(null)) : storage.get(key),
        set: (key: string, data: never) =>
          revoked
            ? (warnRevoked('storage.set'),
              Promise.resolve({ ok: false as const, reason: 'unavailable' as const }))
            : storage.set(key, data),
        remove: (key: string) =>
          revoked ? (warnRevoked('storage.remove'), Promise.resolve()) : storage.remove(key),
        keys: () => (revoked ? (warnRevoked('storage.keys'), Promise.resolve([])) : storage.keys()),
      }),
      scores: Object.freeze({
        submit: (s: never) =>
          revoked
            ? (warnRevoked('scores.submit'),
              Promise.resolve({
                accepted: false,
                rank: null,
                personalBest: false,
                reason: 'unavailable' as const,
              }))
            : scores.submit(s),
        top: (board: string, limit?: number) =>
          revoked ? (warnRevoked('scores.top'), Promise.resolve([])) : scores.top(board, limit),
      }),
      display: Object.freeze({
        requestFullscreen: () =>
          revoked || isAttract
            ? Promise.resolve({ mode: 'none' as const })
            : ensureFullscreen().request(),
        exitFullscreen: () => (revoked || !fs ? Promise.resolve() : fs.exit(false)),
      }),
      gameplay: Object.freeze({
        start() {
          if (revoked || isAttract || started) return;
          started = true;
          lastStop = null;
          emit({ type: 'gameplay', event: 'start' });
        },
        stop(reason: 'pause' | 'gameover' | 'level_end' | 'menu') {
          if (revoked || isAttract) return;
          if (!started && lastStop === reason) return;
          started = false;
          lastStop = reason;
          emit({ type: 'gameplay', event: 'stop', reason });
        },
        loading(p: number) {
          if (revoked || isAttract || mountResolved || !Number.isFinite(p)) return;
          const v = Math.min(1, Math.max(0, p));
          if (v <= lastProgress) return;
          lastProgress = v;
          emit({ type: 'progress', value: v });
        },
      }),
      on<E extends keyof HostEvents>(event: E, cb: (payload: HostEvents[E]) => void) {
        if (revoked) return () => {};
        if (!HOST_EVENTS.has(event)) {
          if (dev) console.warn(`${tag} unknown host event "${String(event)}"`);
          return () => {};
        }
        // Each call is its own subscription, even for the same callback.
        const entry = (p: never) => cb(p);
        let set = subs.get(event);
        if (!set) subs.set(event, (set = new Set()));
        set.add(entry);
        return () => void subs.get(event)?.delete(entry);
      },
      reportError(error: SerializableError) {
        if (!revoked) diagnostic(error);
      },
      get audio() {
        const context = gain ? audio.ensure() : null;
        if (!gain || !context)
          throw namedError(
            'CapabilityUnavailable',
            "Capability 'audio' is not available; check host.capabilities first",
          );
        return Object.freeze({ context, output: gain });
      },
    };

    return {
      api: Object.freeze(api) as unknown as HostAPI,
      emitToGame<E extends keyof HostEvents>(event: E, payload: HostEvents[E]) {
        if (revoked) return;
        for (const cb of [...(subs.get(event) ?? [])]) {
          try {
            (cb as (p: HostEvents[E]) => void)(payload);
          } catch (e) {
            diagnostic(e);
          }
        }
      },
      markMountResolved() {
        mountResolved = true;
      },
      revoke() {
        revoked = true;
        subs.clear();
      },
    };
  }

  // ─── audio per mount ───
  function attachAudio(silent: boolean): void {
    output = audio.available ? audio.createOutput(silent) : null;
    audio.setActive({
      paused: () => causes.size > 0,
      output: () => output,
      onMute: (muted) => handle?.emitToGame('mute', { muted }),
    });
  }
  function detachAudio(): void {
    try {
      output?.disconnect();
    } catch {
      // already disconnected
    }
    output = null;
    audio.setActive(null);
  }

  // ─── crash ───
  function crash(error: unknown, phase: CrashReport['phase'], errorName?: string): void {
    const err = toSerializable(error);
    const lifecycle =
      phase === 'pause' || phase === 'resume' || phase === 'create' || phase === 'mount';
    const name =
      errorName ?? (lifecycle ? (err.name === 'Error' ? 'LifecycleError' : err.name) : err.name);
    const report: CrashReport = {
      errorName: name,
      message: err.message,
      phase,
      gameId,
      gameVersion: meta?.version ?? null,
      apiVersion: meta?.apiVersion ?? null,
      hostVersion: HOST_VERSION,
      buildId: services.options.buildId,
      userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
      fullscreenMode: fs?.mode ?? 'none',
      inputPrimary,
      storagePersistent: services.storage.persistent,
      reportedErrors: { count: errorCount, last: errorLog.slice(-5) },
      occurredAt: new Date(services.options.clock.now()).toISOString(),
      path: typeof location === 'undefined' ? '' : location.pathname,
      crashLoop: false,
      primaryAction:
        name === 'ChunkLoadError'
          ? 'retry'
          : name === 'ApiVersionMismatch'
            ? 'reload'
            : name === 'InvalidGameMeta'
              ? 'report'
              : 'restart',
    };
    if (err.stack) report.stack = err.stack;
    console.error(tag, 'crashed:', name, err.message);
    setState('crashed');
    emit({ type: 'crash', report });
    detachAudio();
    audio.want('suspended');
    cleanupDone = (async () => {
      if (game && mountCalled && !mountSettledFlag) {
        abort?.abort(abortError());
        await settleWithin(mountSettled, ABORT_SETTLE_MS);
      }
      await teardown();
    })();
  }

  // ─── teardown: unmount the game (2 s cap), revoke, remove container ───
  async function teardown(): Promise<void> {
    const g = game;
    const c = container;
    const h = handle;
    const called = mountCalled;
    game = null;
    mountCalled = false;
    if (g && called) {
      const settled = await settleWithin(
        Promise.resolve()
          .then(() => g.unmount())
          .catch((e: unknown) => diagnostic(e)),
        UNMOUNT_TIMEOUT_MS,
      );
      if (!settled)
        console.warn(
          `${tag} unmount() did not settle within ${UNMOUNT_TIMEOUT_MS} ms; container force-removed (possible leak)`,
        );
    }
    h?.revoke();
    if (handle === h) handle = null;
    detachAudio();
    c?.remove();
    if (container === c) container = null;
    abort = null;
    notice = null;
  }

  function finishDispose(): void {
    if (state === 'disposed') return;
    unlisten();
    fs?.dispose(); // leaving the page exits fullscreen
    fs = null;
    if (errorTarget) services.errors.setActive(null);
    errorTarget = null;
    releaseSlot?.();
    releaseSlot = null;
    setState('disposed');
    resolveDisposed();
  }

  // ─── game pause/resume: a throw crashes the game ───
  function callPause(reason: PauseReason): boolean {
    return callGame('pause', () => game?.pause(reason));
  }
  function callResume(): boolean {
    return callGame('resume', () => game?.resume());
  }
  function callGame(phase: 'pause' | 'resume', fn: () => void): boolean {
    try {
      fn();
      return true;
    } catch (e) {
      crash(e, phase);
      return false;
    }
  }

  // ─── window errors attributed to this game ───
  let errorTarget: ErrorTarget | null = null;
  function routeErrors(): void {
    errorTarget = {
      gameId,
      fatal: (e) => {
        if (state === 'running' || state === 'paused') crash(e, 'running', 'GameRuntimeError');
        else if (state === 'mounting') crash(e, 'mount', 'GameRuntimeError');
      },
      diagnostic: (e) => diagnostic(e),
    };
    services.errors.setActive(errorTarget);
  }

  // ─── load → create → mount ───
  async function load(launch: Launch): Promise<void> {
    currentLaunch = launch;
    setState('loading');
    emit({ type: 'progress', value: null });
    const loadStart = typeof performance === 'undefined' ? 0 : performance.now();
    let def: GameDefinition;
    try {
      def = (await opts.load()).default;
    } catch (e) {
      if (unmountRequested) return finishDispose();
      return crash(e, 'import', 'ChunkLoadError');
    }
    if (unmountRequested) return finishDispose();

    if ((def?.meta as { apiVersion?: unknown } | undefined)?.apiVersion !== SDK_API_VERSION) {
      return crash(
        namedError('ApiVersionMismatch', 'This game needs a newer version of Pocketcade'),
        'validate',
        'ApiVersionMismatch',
      );
    }
    const issues = validateMeta(def.meta);
    if (typeof def.create !== 'function')
      issues.push({ code: 'create_missing', path: 'create', message: 'create must be a function' });
    if (issues.length > 0) {
      return crash(
        namedError('InvalidGameMeta', issues.map((i) => `${i.path}: ${i.code}`).join('; ')),
        'validate',
        'InvalidGameMeta',
      );
    }
    meta = def.meta;

    let g: Game;
    try {
      g = def.create();
    } catch (e) {
      return crash(e, 'create');
    }
    if (unmountRequested) return finishDispose();

    // mounting
    const c = document.createElement('div');
    c.setAttribute('data-pocketcade-game', gameId);
    c.setAttribute('style', CONTAINER_STYLE);
    frame.appendChild(c);
    game = g;
    container = c;
    abort = new AbortController();
    attachAudio(launch === 'attract');
    handle = buildHostApi(meta, launch, output);
    const h = handle;
    lastSize = measure();
    setState('mounting');
    const activeBefore = document.activeElement;
    // the context runs before mount() (even when muted) so Phaser adds no unlock listeners.
    if (launch !== 'attract') audio.want('running');

    mountCalled = true;
    mountSettledFlag = false;
    let p: Promise<void>;
    try {
      p = Promise.resolve(g.mount(c, h.api, { signal: abort.signal, size: lastSize, launch }));
    } catch (e) {
      p = Promise.reject(e);
    }
    mountSettled = p.then(
      () => void (mountSettledFlag = true),
      () => void (mountSettledFlag = true),
    );
    const timer = setTimeout(() => {
      if (state === 'mounting' && game === g)
        crash(namedError('MountTimeout', 'Took too long to start'), 'mount', 'MountTimeout');
    }, MOUNT_TIMEOUT_MS);

    try {
      await p;
    } catch (e) {
      clearTimeout(timer);
      if (state === 'mounting' && game === g) {
        const err = e as { name?: string } | null;
        crash(e, 'mount', err?.name === 'ChunkLoadError' ? 'ChunkLoadError' : undefined);
      }
      return; // aborted (unmounting) or already crashed
    }
    clearTimeout(timer);
    if (state !== 'mounting' || game !== g) return;

    services.errors.recordScripts(loadStart);
    h.markMountResolved();
    if (launch !== 'attract') focusGame(c, activeBefore);
    if (audio.muted || causes.size > 0 || launch === 'attract') audio.want('suspended');
    updateNotices();
    const reasons = pauseReasons();
    if (reasons.length === 0) {
      setState('running');
      return;
    }
    for (const r of reasons) if (!callPause(r)) return;
    setState('paused');
    emitPause();
  }

  function focusGame(c: HTMLElement, activeBefore: Element | null): void {
    const activeEl = document.activeElement;
    const moved =
      activeEl &&
      activeEl !== document.body &&
      activeEl !== activeBefore &&
      !target.contains(activeEl);
    if (moved) return;
    // The game already focused its own element (e.g. a field inside its shadow root, which querySelector cannot see).
    if (activeEl && activeEl !== c && c.contains(activeEl)) return;
    let el = c.querySelector<HTMLElement>('[tabindex="0"]');
    if (!el) {
      c.tabIndex = -1;
      el = c;
    }
    el.focus({ preventScroll: true });
  }

  async function start(launch: Launch): Promise<void> {
    setState('loading'); // waits here for the document-wide slot
    const release = await services.slot.acquire();
    releaseSlot = release;
    if (unmountRequested || state === 'disposed') return finishDispose();
    listen();
    routeErrors();
    await load(launch);
  }

  function process(): void {
    scheduled = false;
    if (state !== 'idle') return;
    if (desired === 'unmounted') return finishDispose();
    if (desired === 'mounted') void start(pendingLaunch);
  }

  function schedule(): void {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(process);
  }

  // ─── pause causes and audio suspend/resume ───
  function addPause(reason: PauseReason, cause: string = reason): void {
    if (!active() || causes.has(cause)) return;
    const wasEmpty = causes.size === 0;
    const isNewReason = !pauseReasons().includes(reason);
    causes.set(cause, reason);
    log(`pause + ${cause}`);
    if (wasEmpty && mountCalled) audio.want('suspended');
    if (state === 'running') {
      if (!callPause(reason)) return;
      setState('paused');
    } else if (state === 'paused' && isNewReason) {
      if (!callPause(reason)) return;
    }
    emitPause();
  }

  function removePause(_reason: PauseReason, cause: string = _reason): void {
    if (!causes.delete(cause)) return;
    log(`pause − ${cause}`);
    if (causes.size === 0 && state === 'paused') {
      if (!callResume()) return;
      setState('running');
      if (!audio.muted && !attract()) audio.want('running');
    }
    emitPause();
  }

  return {
    get state() {
      return state;
    },
    get fullscreenMode() {
      return fs?.mode ?? 'none';
    },

    mount(launch = 'play') {
      if (state !== 'idle') {
        if (dev) console.warn(`${tag} mount() ignored in state ${state}`);
        return;
      }
      desired = 'mounted';
      pendingLaunch = launch;
      schedule();
    },

    unmount() {
      if (state === 'idle') {
        // Reconciled in a microtask: a mount() later in the same task wins.
        desired = 'unmounted';
        schedule();
        return disposed;
      }
      unmountRequested = true;
      switch (state) {
        case 'mounting':
          setState('unmounting');
          abort?.abort(abortError());
          void (async () => {
            await settleWithin(mountSettled, ABORT_SETTLE_MS);
            await teardown();
            finishDispose();
          })();
          break;
        case 'running':
        case 'paused':
          setState('unmounting');
          void teardown().then(finishDispose);
          break;
        case 'crashed':
          void cleanupDone.then(finishDispose);
          break;
        // loading: load()/start() check unmountRequested; unmounting: the running teardown finishes the job.
      }
      return disposed;
    },

    restart() {
      if (state === 'running' || state === 'paused') {
        setState('unmounting');
        void teardown().then(() => (unmountRequested ? finishDispose() : load('restart')));
      } else if (state === 'crashed') {
        void cleanupDone.then(() => (unmountRequested ? finishDispose() : load('restart')));
      }
    },

    addPause,
    removePause,

    resumeFromOverlay() {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      for (const [cause, reason] of [...causes])
        if (OVERLAY_CAUSES.has(cause)) removePause(reason, cause);
      // Inside the gesture: resume audio synchronously.
      if (causes.size === 0 && !audio.muted && !attract()) audio.unlock();
    },

    enterFullscreen(pseudoWithoutActivation = false) {
      return ensureFullscreen().request(pseudoWithoutActivation);
    },

    exitFullscreen() {
      return fs ? fs.exit(true) : Promise.resolve();
    },
  };
}
