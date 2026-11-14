// @pocketcade/toolkit/dom — DOM adapter for engine-less games.
// Open shadow DOM + adoptedStyleSheets scope the game's CSS both ways.
import {
  defineGame,
  type GameDefinition,
  type GameMeta,
  type HostAPI,
  type MountContext,
  type PauseReason,
  type Unsubscribe,
} from '@pocketcade/sdk';
import { createAttract, type AttractScript } from '../attract.ts';
import {
  abortError,
  checkConfig,
  createTkContext,
  raceAbort,
  type TkContext,
  type TkInternals,
} from '../context.ts';
import { createInput } from '../input.ts';
import { safeLoop, type SafeLoop, type SafeLoopOptions } from '../loop.ts';
import { createBusSfx, renderBank, type BusSfx, type SfxBank } from '../sfx.ts';
import { toolkitStrings, type ToolkitStrings } from '../strings.en.ts';
import { FONT_STACK, colors } from '../tokens.ts';
import { sheet } from '../util.ts';
import type { OverlayConfig, OverlaysInternal } from '../ui/overlays.ts';

export interface DomGameHooks {
  /** after the toolkit paused its loops/timers */
  pause?(reason: PauseReason | 'menu'): void;
  resume?(): void;
  /** before toolkit cleanup */
  dispose?(): void | Promise<void>;
}

export interface DomScope extends TkContext {
  /** div[data-tk-game] inside the shadow root */
  readonly root: HTMLElement;
  readonly shadow: ShadowRoot;
  /** target must be inside `shadow` */
  listen<K extends keyof HTMLElementEventMap>(
    target: Element,
    type: K,
    handler: (ev: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): Unsubscribe;
  /** deferred while paused */
  raf(cb: FrameRequestCallback): () => void;
  /** pausable */
  timeout(cb: () => void, ms: number): () => void;
  /** pausable */
  interval(cb: () => void, ms: number): () => void;
  /** auto-paused and disposed */
  loop(options: SafeLoopOptions): SafeLoop;
  announce(text: string, politeness?: 'polite' | 'assertive'): void;
}

export interface DefineDomGameOptions {
  meta: GameMeta;
  /** CSS text, adopted after the toolkit base CSS */
  styles?: string;
  /** default 'manipulation' */
  touchAction?: 'none' | 'pan-y' | 'manipulation';
  sfx?: SfxBank;
  overlays: OverlayConfig;
  attract: AttractScript;
  strings?: Partial<ToolkitStrings>;
  mount(scope: DomScope): Promise<DomGameHooks | void> | DomGameHooks | void;
}

declare const process: { env: { NODE_ENV?: string } };

const BASE_CSS = (touch: string) =>
  `:host{all:initial;position:absolute;inset:0;display:block;color:${colors.text};background:${colors.bg};font:16px/1.4 var(--pocketcade-font-family,${FONT_STACK})}
[data-tk-game]{position:absolute;inset:0;overflow:auto;outline:none;touch-action:${touch};-webkit-tap-highlight-color:transparent;overscroll-behavior:contain}
[data-tk-game]:focus-visible{outline:3px solid ${colors.yellow};outline-offset:-3px}
[data-tk-ui]{position:absolute;inset:0;pointer-events:none}
[data-tk-live]{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}`;

export function defineDomGame(options: DefineDomGameOptions): GameDefinition {
  if (process.env.NODE_ENV !== 'production') checkConfig(options.overlays, options.attract);
  return defineGame({ meta: options.meta, create: () => createDomGame(options) });
}

interface Timer {
  cb: () => void;
  ms: number;
  repeat: boolean;
  due: number;
  handle: ReturnType<typeof setTimeout> | null;
}

function createDomGame(o: DefineDomGameOptions): ReturnType<GameDefinition['create']> {
  const { meta } = o;
  let hostEl: HTMLElement | null = null;
  let internals: TkInternals | null = null;
  let hooks: DomGameHooks = {};
  let ui: OverlaysInternal | null = null;
  let sfx: BusSfx | null = null;
  let paused = false;
  let menuOpen = false;
  let fatal = false;
  let disposing: Promise<void> | null = null;
  const timers = new Set<Timer>();
  let rafs: FrameRequestCallback[] = [];
  let rafHandle: number | null = null;
  const cleanups: Array<() => void> = [];

  const frozen = () => paused || menuOpen || fatal;

  // ─── pausable timers and rAF ───
  function arm(t: Timer): void {
    t.handle = setTimeout(
      () => {
        t.handle = null;
        if (t.repeat) {
          t.due = performance.now() + t.ms;
          arm(t);
        } else timers.delete(t);
        guard(t.cb);
      },
      Math.max(0, t.due - performance.now()),
    );
  }
  function freezeTimers(): void {
    const now = performance.now();
    for (const t of timers) {
      if (t.handle === null) continue; // already frozen
      clearTimeout(t.handle);
      t.handle = null;
      t.due -= now; // remaining
    }
    if (rafHandle !== null) cancelAnimationFrame(rafHandle);
    rafHandle = null;
  }
  function thawTimers(): void {
    const now = performance.now();
    for (const t of timers) {
      if (t.handle !== null) continue;
      t.due += now;
      arm(t);
    }
    if (rafs.length) requestRaf();
  }
  function requestRaf(): void {
    if (rafHandle === null && !frozen()) rafHandle = requestAnimationFrame(runRafs);
  }
  function runRafs(now: number): void {
    rafHandle = null;
    const list = rafs;
    rafs = [];
    for (const cb of list) {
      try {
        cb(now);
      } catch (e) {
        internals?.tk.reportError(e, true); // a throwing frame is fatal
      }
    }
  }
  function guard(fn: () => void): void {
    try {
      fn();
    } catch (e) {
      internals?.listenerError(e);
    }
  }
  function setFrozen(was: boolean): void {
    const now = frozen();
    if (now && !was) freezeTimers();
    else if (!now && was) thawTimers();
  }

  async function teardown(): Promise<void> {
    const tkInt = internals;
    await tkInt?.dispose();
    try {
      await hooks.dispose?.();
    } catch (e) {
      tkInt?.tk.host.reportError({ name: 'Error', message: String(e) });
    }
    sfx?.dispose();
    freezeTimers();
    timers.clear();
    rafs = [];
    for (const c of cleanups.splice(0).reverse()) {
      try {
        c();
      } catch {
        // best effort
      }
    }
    hostEl?.remove();
    hostEl = null;
    internals = null;
    ui = null;
    sfx = null;
    hooks = {};
  }

  async function mount(container: HTMLElement, h: HostAPI, ctx: MountContext): Promise<void> {
    const attract = ctx.launch === 'attract';
    const signal = ctx.signal;
    const strings: ToolkitStrings = { ...toolkitStrings, title: meta.id, ...o.strings };
    try {
      // 1. root → open shadow root → game root, UI layer, live region.
      hostEl = document.createElement('div');
      hostEl.setAttribute('data-tk-root', '');
      hostEl.tabIndex = -1;
      hostEl.setAttribute('style', 'position:absolute;inset:0;outline:none');
      const shadow = hostEl.attachShadow({ mode: 'open' });
      shadow.adoptedStyleSheets = [
        sheet(BASE_CSS(o.touchAction ?? 'manipulation')),
        ...(o.styles ? [sheet(o.styles)] : []),
      ];
      const root = document.createElement('div');
      root.setAttribute('data-tk-game', '');
      root.tabIndex = attract ? -1 : 0;
      const uiLayer = document.createElement('div');
      uiLayer.setAttribute('data-tk-ui', '');
      const live = document.createElement('div');
      live.setAttribute('data-tk-live', '');
      live.setAttribute('aria-live', 'polite');
      shadow.append(root, uiLayer, live);
      container.appendChild(hostEl);

      internals = createTkContext({
        meta,
        host: h,
        ctx,
        attract: o.attract,
        layoutFor: ({ width, height }) => ({
          cssWidth: width,
          cssHeight: height,
          width,
          height,
          view: { x: 0, y: 0, width, height },
          bleed: { x: 0, y: 0 },
          renderScale: 1,
          orientation: width >= height ? 'landscape' : 'portrait',
        }),
        loading: (p) => !attract && h.gameplay.loading(0.1 + 0.9 * Math.min(1, Math.max(0, p))),
        onFatal: () => {
          const was = frozen();
          fatal = true;
          setFrozen(was);
        },
        setMuted: (muted) => sfx?.setMuted(muted),
        input: (tkSignal) =>
          createInput({
            stage: root,
            signal: tkSignal,
            gate: () => !frozen() && !attract && !disposing && !ui?.open,
            toLocal: (x, y) => {
              const r = root.getBoundingClientRect();
              return { x: x - r.left, y: y - r.top };
            },
            focusOnPointer: !attract,
            onError: (e) => internals?.listenerError(e),
          }),
      });
      const tkInt = internals;
      const tk = tkInt.tk;
      ui = tkInt.createUi({
        layer: uiLayer,
        stage: root,
        strings,
        config: o.overlays,
        onMenu(open) {
          if (open === menuOpen) return;
          const was = frozen();
          menuOpen = open;
          setFrozen(was);
          if (open) {
            tk.input.clearHeld();
            hooks.pause?.('menu');
            tkInt.emit('pause', { source: 'menu' });
          } else if (!paused) {
            hooks.resume?.();
            tkInt.emit('resume', { source: 'menu' });
          }
        },
        hostPaused: () => paused,
      });

      await tkInt.loadPrefs();
      // SFX through the host master gain; none in attract or without 'audio'.
      if (!attract && h.capabilities.has('audio') && o.sfx?.length) {
        const { context, output } = h.audio;
        sfx = createBusSfx(
          context,
          output,
          await raceAbort(renderBank(o.sfx, context, meta.id, signal), signal),
        );
        tkInt.set({ sfx });
      }
      tkInt.applyMute();
      h.gameplay.loading(0.1);

      const own = (n: EventTarget) =>
        n instanceof Node && (n === shadow || n.getRootNode() === shadow);
      const scope: DomScope = Object.assign(Object.create(tk) as TkContext, {
        root,
        shadow,
        listen<K extends keyof HTMLElementEventMap>(
          target: Element,
          type: K,
          handler: (ev: HTMLElementEventMap[K]) => void,
          opts?: AddEventListenerOptions,
        ): Unsubscribe {
          if (!own(target)) {
            const err = new TypeError(`scope.listen target must be inside the game's shadow root`);
            if (h.env.dev) throw err;
            tk.reportError(err);
            return () => {};
          }
          const fn = (ev: Event) => guard(() => handler(ev as HTMLElementEventMap[K]));
          target.addEventListener(type, fn, { ...opts, signal: tk.signal });
          return () => target.removeEventListener(type, fn, opts);
        },
        raf(cb: FrameRequestCallback) {
          rafs.push(cb);
          requestRaf();
          return () => void (rafs = rafs.filter((f) => f !== cb));
        },
        timeout(cb: () => void, ms: number) {
          return addTimer(cb, ms, false);
        },
        interval(cb: () => void, ms: number) {
          return addTimer(cb, ms, true);
        },
        loop: (opts: SafeLoopOptions) => safeLoop(opts, tk),
        announce(text: string, politeness: 'polite' | 'assertive' = 'polite') {
          live.setAttribute('aria-live', politeness);
          // identical consecutive text is re-announced
          live.textContent = live.textContent === text ? `${text} ` : text;
        },
      });
      function addTimer(cb: () => void, ms: number, repeat: boolean): () => void {
        const t: Timer = { cb, ms, repeat, due: performance.now() + ms, handle: null };
        timers.add(t);
        if (frozen()) t.due = ms;
        else arm(t);
        return () => {
          if (t.handle !== null) clearTimeout(t.handle);
          timers.delete(t);
        };
      }

      hooks = (await raceAbort(Promise.resolve(o.mount(scope)), signal)) ?? {};

      if (attract) {
        // A fixed 60 Hz driver on pausable rAF; the still freezes timers and loops.
        const driver = createAttract(o.attract, {
          root: hostEl,
          inject: (v) => tk.input.inject(v),
          freeze(ms, done) {
            const was = frozen();
            menuOpen = true;
            setFrozen(was);
            tkInt.emit('pause', { source: 'menu' });
            const t = setTimeout(() => {
              const w = frozen();
              menuOpen = false;
              setFrozen(w);
              tkInt.emit('resume', { source: 'menu' });
              done();
            }, ms);
            cleanups.push(() => clearTimeout(t));
          },
          onError: (e) => tk.reportError(e),
        });
        tkInt.set({ attract: driver });
        safeLoop({ update: () => driver.tick() }, tk).start();
      } else if (!shadow.activeElement) root.focus({ preventScroll: true }); // the game may have focused its own field
      if (ctx.launch === 'play') void ui.howTo();
    } catch (e) {
      await teardown();
      throw signal.aborted ? abortError() : e;
    }
  }

  return {
    mount,
    unmount() {
      disposing ??= teardown();
      return disposing;
    },
    pause(reason) {
      if (paused || disposing || !internals) return;
      const was = frozen();
      paused = true;
      setFrozen(was);
      internals.tk.input.clearHeld();
      void internals.flushSaves();
      try {
        hooks.pause?.(reason);
      } catch (e) {
        internals.tk.reportError(e);
      }
      internals.emit('pause', { source: 'host', reason });
    },
    resume() {
      if (!paused || disposing || !internals) return;
      const was = frozen();
      paused = false;
      setFrozen(was);
      if (!menuOpen) {
        try {
          hooks.resume?.();
        } catch (e) {
          internals.tk.reportError(e);
        }
      }
      internals.emit('resume', { source: 'host' });
    },
  };
}
