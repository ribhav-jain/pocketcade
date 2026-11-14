// @pocketcade/toolkit/phaser — Phaser adapter.
// Phaser is referenced as types only; the runtime module is imported inside mount().
import type Phaser from 'phaser';
import {
  aspectRange,
  defineGame,
  type Game,
  type GameDefinition,
  type GameMeta,
  type HostAPI,
  type MountContext,
  type PauseReason,
  type Size,
} from '@pocketcade/sdk';
import { loadBrandFonts } from '../art.ts';
import { createAttract, type AttractScript } from '../attract.ts';
import {
  abortError,
  checkConfig,
  createTkContext,
  raceAbort,
  type Layout,
  type TkContext,
  type TkInternals,
} from '../context.ts';
import { createInput } from '../input.ts';
import { renderBank, type Sfx, type SfxBank } from '../sfx.ts';
import { toolkitStrings, type ToolkitStrings } from '../strings.en.ts';
import { FONT_DISPLAY, FONT_STACK, colors, typeScale, type ColorToken } from '../tokens.ts';
import type { OverlayConfig, OverlaysInternal } from '../ui/overlays.ts';
import { canvasTexture } from './fx.ts';
import {
  captureGlobalListeners,
  destroyGame,
  releaseTargetCamera,
  saveWindowFocusHandlers,
  type ListenerCapture,
} from './hardening.ts';

export {
  backdrop,
  bump,
  burst,
  canvasImage,
  canvasTexture,
  flash,
  hudPill,
  iconTexture,
  popText,
  shake,
  texScale,
  type BackdropOptions,
  type BurstOptions,
  type FxShape,
  type HudIcon,
  type HudPill,
  type HudPillOptions,
  type PopTextOptions,
} from './fx.ts';

export type PhaserModule = typeof Phaser;

/** Scene base supplied at mount time; `tk` is a scene-scoped facade (tk.on() auto-removes on SHUTDOWN). */
export interface TkScene extends Phaser.Scene {
  readonly tk: TkContext;
}
export type TkSceneClass = abstract new (
  config: string | Phaser.Types.Scenes.SettingsConfig,
) => TkScene;

export interface TkTextStyle {
  size?: keyof typeof typeScale;
  /** explicit size in design units (overrides `size`) */
  px?: number;
  weight?: 400 | 500 | 600 | 700;
  /** a token or '#RRGGBB' */
  color?: ColorToken | (string & {});
  align?: 'left' | 'center' | 'right';
  /** 'display' (Fredoka, default) or 'body' (Nunito) */
  font?: 'display' | 'body';
  /** outline colour ('#RRGGBB' or token) and width in design units */
  stroke?: ColorToken | (string & {});
  strokePx?: number;
  /** soft drop shadow */
  shadow?: boolean;
}

export interface PhaserKit {
  /**
   * extends P.Scene: the camera is zoomed to design units and scrolled so (0, 0) is the design area's corner
   * whatever the view; `tk` access. Subclasses overriding init() call super.init().
   */
  readonly Scene: TkSceneClass;
  text(
    scene: Phaser.Scene,
    x: number,
    y: number,
    value: string,
    style?: TkTextStyle,
  ): Phaser.GameObjects.Text;
  /** design units → canvas pixels (the camera zoom) */
  readonly renderScale: number;
  readonly textures: {
    /** Draw once per mount with Canvas 2D at the render scale; show with canvasImage(). Returns the key. */
    canvas(
      scene: Phaser.Scene,
      key: string,
      w: number,
      h: number,
      draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
    ): string;
  };
  readonly fps: {
    /** Run at 60 fps for `ms` (+100 ms), then fall back to the loop's base limit. 0 → no change. */
    burst(ms: number): void;
  };
}

export type SceneFactory = (P: PhaserModule, kit: PhaserKit) => readonly (new () => Phaser.Scene)[];

export interface PhaserGameConfig {
  /**
   * The design area in authoring units. Its shape must sit inside meta.aspectRatio. When that is a range, the
   * frame can be wider or taller than the design area: gameplay stays in the design area and the extra space
   * (tk.layout.view, at most tk.layout.bleed per side) shows scenery.
   */
  designSize: { width: number; height: number };
  /** default 'realtime'; 'turn-based' → fps.limit 30 */
  loop?: 'realtime' | 'turn-based';
  renderer?: 'auto' | 'webgl' | 'canvas';
  maxRenderScale?: 1 | 1.5 | 2;
  backgroundColor?: ColorToken;
  touchAction?: 'none' | 'pan-y' | 'manipulation';
  sfx?: SfxBank;
  overlays: OverlayConfig;
  attract: AttractScript;
  /** includes `title` (stage aria-label, how-to heading) */
  strings?: Partial<ToolkitStrings>;
}

export interface DefinePhaserGameOptions {
  meta: GameMeta;
  scenes: SceneFactory;
  config: PhaserGameConfig;
}

declare const process: { env: { NODE_ENV?: string } };

const STAGE_STYLE = (touchAction: string) =>
  `position:relative;width:100%;height:100%;outline:none;touch-action:${touchAction};user-select:none;-webkit-user-select:none;` +
  '-webkit-touch-callout:none;overscroll-behavior:contain;-webkit-tap-highlight-color:transparent';
const FOCUS_CSS = '[data-tk-stage]:focus-visible{outline:3px solid #F0E442;outline-offset:-3px}';

export function definePhaserGame(options: DefinePhaserGameOptions): GameDefinition {
  const { meta, config } = options;
  if (process.env.NODE_ENV !== 'production') {
    const ratio = config.designSize.width / config.designSize.height;
    const range = aspectRange(meta.aspectRatio);
    if (range && (ratio < range.min * 0.99 || ratio > range.max * 1.01))
      throw new Error(
        `designSize ratio ${ratio} must be within meta.aspectRatio (${range.min} to ${range.max})`,
      );
    checkConfig(config.overlays, config.attract);
  }
  return defineGame({ meta, create: () => createPhaserGame(options) });
}

function createPhaserGame(options: DefinePhaserGameOptions): Game {
  const { meta, config } = options;
  const design = config.designSize;
  const base = design.width / design.height;
  const range = aspectRange(meta.aspectRatio) ?? { min: base, max: base };
  const bleed = {
    x: Math.max(0, (design.height * range.max - design.width) / 2),
    y: Math.max(0, (design.width / range.min - design.height) / 2),
  };

  /** The visible rectangle (design units) for a frame of w × h: the design area widened or heightened to its shape. */
  function viewFor(w: number, h: number): Layout['view'] {
    const aspect = Math.min(range.max, Math.max(range.min, w / Math.max(1, h)));
    const width = aspect > base ? Math.round(design.height * aspect) : design.width;
    const height = aspect < base ? Math.round(design.width / aspect) : design.height;
    return { x: (design.width - width) / 2, y: (design.height - height) / 2, width, height };
  }

  // Per-instance state: nothing lives in module scope.
  let P: PhaserModule | null = null;
  let game: Phaser.Game | null = null;
  let root: HTMLElement | null = null;
  let internals: TkInternals | null = null;
  let capture: ListenerCapture | null = null;
  let restoreFocusHandlers: (() => void) | null = null;
  let refreshPending = false;
  let paused = false;
  let menuOpen = false;
  let fatal = false;
  let ui: OverlaysInternal | null = null;
  let audioCtx: AudioContext | null = null;
  let disposing: Promise<void> | null = null;
  let renderScale = 1;

  const baseFps = config.loop === 'turn-based' ? 30 : 0;

  /** Sizes the canvas to the current view, points every camera at it, then fits the canvas into its parent. */
  function refit(): void {
    const g = game;
    if (!g) return;
    const view = internals?.tk.layout.view;
    if (view) {
      const w = Math.round(view.width * renderScale);
      const h = Math.round(view.height * renderScale);
      if (g.scale.width !== w || g.scale.height !== h) g.scale.setGameSize(w, h);
      for (const scene of g.scene.getScenes(false)) scene.cameras?.main?.setScroll(view.x, view.y);
    }
    // Phaser's refresh() sizes the canvas from its cached parent size, so measure the parent first.
    g.scale.getParentBounds();
    g.scale.refresh();
  }

  function scheduleRefresh(): void {
    if (refreshPending) return;
    refreshPending = true;
    const run = () => {
      if (!refreshPending) return;
      refreshPending = false;
      refit();
    };
    requestAnimationFrame(run);
    setTimeout(run, 100); // rAF stops in hidden tabs
  }

  async function teardown(): Promise<void> {
    const tkInt = internals;
    await tkInt?.dispose();
    refreshPending = false;
    const g = game;
    const ac = audioCtx;
    const before = ac?.state;
    if (g && P) {
      try {
        g.sound?.stopAll();
        await destroyGame(g as unknown as Parameters<typeof destroyGame>[0], P.Core.Events.DESTROY);
      } catch (e) {
        tkInt?.tk.reportError(e);
      }
    }
    // Phaser suspends a supplied context on destroy; give the next game the state it had.
    if (ac && before === 'running' && !paused && !tkInt?.tk.env.muted)
      void ac.resume().catch(() => {});
    // Any Graphics#generateTexture() call would otherwise pin this game in memory.
    if (P) releaseTargetCamera(P.GameObjects.Graphics);
    capture?.stop();
    capture?.removeAll();
    restoreFocusHandlers?.();
    root?.remove();
    // drop every reference.
    capture = null;
    restoreFocusHandlers = null;
    root = null;
    game = null;
    internals = null;
    ui = null;
    audioCtx = null;
    P = null;
  }

  /** Pause menu / how-to freeze the game; a host pause on top keeps it frozen. */
  function setMenu(open: boolean): void {
    if (open === menuOpen || !game) return;
    menuOpen = open;
    if (open) {
      game.pause();
      internals?.tk.input.clearHeld();
      internals?.emit('pause', { source: 'menu' });
    } else if (!paused) {
      game.resume();
      internals?.emit('resume', { source: 'menu' });
    }
  }

  async function mount(container: HTMLElement, host: HostAPI, ctx: MountContext): Promise<void> {
    const attract = ctx.launch === 'attract';
    const signal = ctx.signal;
    const audioOk = !attract && host.capabilities.has('audio');
    const strings: ToolkitStrings = { ...toolkitStrings, title: meta.id, ...config.strings };
    const loading = (p: number) => {
      if (!attract) host.gameplay.loading(p);
    };
    try {
      // 1. DOM: root → stage + ui layer.
      root = document.createElement('div');
      root.setAttribute('data-tk-root', '');
      root.tabIndex = -1;
      root.setAttribute('style', 'position:absolute;inset:0;outline:none');
      const style = document.createElement('style');
      style.textContent = FOCUS_CSS;
      const stage = document.createElement('div');
      stage.setAttribute('data-tk-stage', '');
      stage.tabIndex = attract ? -1 : 0;
      stage.setAttribute('role', 'application');
      stage.setAttribute('aria-label', strings.title);
      stage.setAttribute('style', STAGE_STYLE(config.touchAction ?? 'none'));
      const uiLayer = document.createElement('div');
      uiLayer.setAttribute('data-tk-ui', '');
      uiLayer.setAttribute('style', 'position:absolute;inset:0;pointer-events:none');
      root.append(style, stage, uiLayer);
      container.appendChild(root);

      const cssW = Math.max(1, ctx.size.width);
      const cssH = Math.max(1, ctx.size.height);
      // Textures are drawn once per mount, so pick the scale for the largest size this mount can reach: the
      // frame now, or fullscreen. The canvas then stays sharp when the player goes fullscreen.
      const fit = (w: number, h: number) => {
        const v = viewFor(w, h);
        return Math.min(w / v.width, h / v.height);
      };
      const fitted = Math.max(fit(cssW, cssH), fit(window.screen.width, window.screen.height));
      renderScale = Math.max(
        0.25,
        Math.min(config.maxRenderScale ?? 2, Math.round(fitted * ctx.size.dpr * 100) / 100),
      );
      const layoutFor = (size: Size): Layout => ({
        cssWidth: size.width,
        cssHeight: size.height,
        width: design.width,
        height: design.height,
        view: viewFor(size.width, size.height),
        bleed,
        renderScale,
        orientation: size.width >= size.height ? 'landscape' : 'portrait',
      });
      const firstView = viewFor(cssW, cssH);

      const toLocal = (clientX: number, clientY: number) => {
        const r = (game?.canvas ?? stage).getBoundingClientRect();
        const v = internals?.tk.layout.view ?? firstView;
        return {
          x: v.x + ((clientX - r.left) / Math.max(1, r.width)) * v.width,
          y: v.y + ((clientY - r.top) / Math.max(1, r.height)) * v.height,
        };
      };

      internals = createTkContext({
        meta,
        host,
        ctx,
        attract: config.attract,
        layoutFor,
        loading: (p) => loading(0.4 + 0.6 * Math.min(1, Math.max(0, p))),
        onFatal: () => {
          fatal = true;
          game?.pause();
        },
        setMuted(muted) {
          try {
            game?.sound?.setMute(muted);
          } catch {
            // NoAudioSoundManager
          }
        },
        onStageChange() {
          refit();
          scheduleRefresh(); // again once the parent has its new size
        },
        input: (tkSignal) =>
          createInput({
            stage,
            signal: tkSignal,
            gate: () => !paused && !attract && !disposing && !menuOpen && !fatal && !ui?.open,
            toLocal,
            focusOnPointer: !attract,
            onError: (e) => internals?.listenerError(e),
          }),
      });
      const tkInt = internals;
      const tk = tkInt.tk;
      // The attract driver exists before the scenes boot, so tk.attract is set in every scene's create();
      // it starts ticking only after tk.ready() (below).
      const driver = attract
        ? createAttract(config.attract, {
            root,
            inject: (v) => tk.input.inject(v),
            freeze(ms, done) {
              game?.pause();
              const t = setTimeout(() => {
                if (!paused && !fatal) game?.resume();
                done();
              }, ms);
              tk.signal.addEventListener('abort', () => clearTimeout(t), { once: true });
            },
            onError: (e) => tk.reportError(e),
          })
        : null;
      if (driver) tkInt.set({ attract: driver });
      ui = tkInt.createUi({
        layer: uiLayer,
        stage,
        strings,
        config: config.overlays,
        onMenu: setMenu,
        hostPaused: () => paused,
      });
      if (audioOk) audioCtx = host.audio.context;
      loading(0.05);
      await tkInt.loadPrefs();

      // 2. Load Phaser (the shared chunk) inside mount().
      const mod = (await raceAbort(import('phaser'), signal)) as PhaserModule & {
        default?: PhaserModule;
      };
      const PM = mod.default ?? mod;
      P = PM;
      loading(0.3);
      // 3. SFX bank; 4. wait <= 300 ms for the host to have the context running (no resume()).
      const buffers =
        audioCtx && config.sfx?.length
          ? await raceAbort(renderBank(config.sfx, audioCtx, meta.id, signal), signal)
          : null;
      loading(0.4);
      if (audioCtx) await raceAbort(waitRunning(audioCtx, 300), signal);
      // 5. Brand fonts (≤ 800 ms) so canvas text renders in them from the first frame.
      await raceAbort(loadBrandFonts(800), signal);

      // 6. Scenes and game, inside the listener-capture window.
      let bootCreated!: () => void;
      const bootCreatedP = new Promise<void>((r) => (bootCreated = r));
      const kit = createKit(PM, tk, {
        renderScale,
        baseFps,
        getGame: () => game,
        onBootCreate: () => bootCreated(),
      });
      const sceneClasses = options.scenes(PM, kit);
      const bootKey = sceneClasses[0];

      restoreFocusHandlers = saveWindowFocusHandlers();
      capture = captureGlobalListeners();
      let readyFired!: () => void;
      const readyP = new Promise<void>((r) => (readyFired = r));
      const renderer =
        config.renderer === 'webgl' ? PM.WEBGL : config.renderer === 'canvas' ? PM.CANVAS : PM.AUTO;
      const g = new PM.Game({
        type: renderer,
        parent: stage,
        backgroundColor: colors[config.backgroundColor ?? 'bg'],
        banner: false,
        autoFocus: false,
        disableContextMenu: true,
        seed: [tk.rng.main.state().join(':')],
        scale: {
          mode: PM.Scale.FIT,
          autoCenter: PM.Scale.CENTER_BOTH,
          width: Math.round(firstView.width * renderScale),
          height: Math.round(firstView.height * renderScale),
          expandParent: false,
        },
        render: {
          antialias: true,
          pixelArt: false,
          transparent: false,
          preserveDrawingBuffer: false,
        },
        audio: audioCtx ? { context: audioCtx } : { noAudio: true },
        input: {
          keyboard: false,
          gamepad: false,
          windowEvents: false,
          mouse: { preventDefaultWheel: false },
          touch: { capture: true },
        },
        dom: { createContainer: false },
        fps: { target: 60, limit: baseFps },
        scene: sceneClasses as unknown as Phaser.Types.Scenes.SceneType[],
      });
      game = g;
      // one report, freeze and one fatal rethrow for a throwing frame; no error storm.
      const step = g.step;
      g.step = (time: number, delta: number) => {
        if (fatal) return;
        try {
          step.call(g, time, delta);
        } catch (e) {
          tk.reportError(e, true);
        }
      };
      // Scenes boot on READY (async), so the registry is set before any scene init() runs.
      g.registry.set('tk', tk);
      g.registry.set('tk.bootKey', bootKey);
      g.events.once(PM.Core.Events.READY, () => readyFired());
      if (g.canvas) {
        g.canvas.setAttribute('data-tk-canvas', meta.id);
        g.canvas.setAttribute('aria-hidden', 'true');
      }

      // 7. READY; VisibilityHandler runs right after READY, so close the capture window one microtask later.
      await raceAbort(readyP, signal);
      await Promise.resolve();
      capture.stop();
      capture.removeBody();
      if (g.canvas && !g.canvas.hasAttribute('data-tk-canvas')) {
        g.canvas.setAttribute('data-tk-canvas', meta.id);
        g.canvas.setAttribute('aria-hidden', 'true');
      }
      // the host is the only pause source.
      const sound = g.sound as unknown as
        { pauseOnBlur?: boolean; onGameVisible?: () => void } | undefined;
      if (sound) {
        sound.pauseOnBlur = false;
        if (sound.onGameVisible) g.events.off(PM.Core.Events.VISIBLE, sound.onGameVisible, sound);
      }
      if (buffers) {
        for (const [name, buf] of buffers) g.cache.audio.add(`sfx:${name}`, buf);
        tkInt.set({ sfx: phaserSfx(g) });
      }
      tkInt.applyMute();

      // 8. Boot scene CREATE, then tk.ready() if the scene deferred it.
      await raceAbort(bootCreatedP, signal);
      await raceAbort(tkInt.readyGate(), signal);

      // Attract: a 60 Hz accumulator on Phaser's loop drives the script.
      if (driver) {
        let acc = 0;
        g.events.on(PM.Core.Events.PRE_STEP, (_time: number, delta: number) => {
          acc += Math.min(250, delta);
          for (; acc >= 1000 / 60; acc -= 1000 / 60) if (!fatal) driver.tick();
        });
      }

      // 9. Focus the stage for play/restart (never in attract); how-to on the first play mount.
      if (!attract) stage.focus({ preventScroll: true });
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
    pause(reason: PauseReason) {
      if (paused || disposing || !game) return;
      paused = true;
      game.pause(); // idempotent in Phaser; a menu-frozen game stays frozen
      internals?.tk.input.clearHeld();
      void internals?.flushSaves();
      internals?.emit('pause', { source: 'host', reason });
    },
    resume() {
      if (!paused || disposing || !game) return;
      paused = false;
      if (!menuOpen && !fatal) game.resume();
      refit();
      internals?.applyMute();
      internals?.emit('resume', { source: 'host' });
    },
  };
}

interface KitOptions {
  renderScale: number;
  /** 30 for turn-based games, 0 (uncapped) for realtime */
  baseFps: number;
  getGame: () => Phaser.Game | null;
  onBootCreate: () => void;
}

function createKit(P: PhaserModule, tk: TkContext, o: KitOptions): PhaserKit {
  const { renderScale, baseFps, getGame } = o;
  let fpsTimer: ReturnType<typeof setTimeout> | null = null;
  tk.signal.addEventListener('abort', () => {
    if (fpsTimer !== null) clearTimeout(fpsTimer);
    fpsTimer = null;
  });
  const facades = new WeakMap<Phaser.Scene, TkContext>();

  function facade(scene: Phaser.Scene): TkContext {
    let f = facades.get(scene);
    if (!f) {
      const offs = new Set<() => void>();
      scene.events.once(P.Scenes.Events.SHUTDOWN, () => {
        for (const off of offs) off();
        offs.clear();
      });
      f = Object.assign(Object.create(tk) as TkContext, {
        on: ((event, cb) => {
          const off = tk.on(event, cb);
          offs.add(off);
          return () => {
            offs.delete(off);
            off();
          };
        }) as TkContext['on'],
      });
      facades.set(scene, f);
    }
    return f;
  }

  abstract class KitScene extends P.Scene {
    get tk(): TkContext {
      return facade(this);
    }
    init(_data?: unknown): void {
      const cam = this.cameras.main;
      cam.setZoom(renderScale);
      cam.setOrigin(0, 0);
      cam.setScroll(tk.layout.view.x, tk.layout.view.y);
      const isBoot = this.registry.get('tk.bootKey') === this.constructor;
      if (isBoot) this.events.once(P.Scenes.Events.CREATE, () => o.onBootCreate());
    }
  }

  return {
    Scene: KitScene as unknown as TkSceneClass,
    renderScale,
    text(scene, x, y, value, style = {}) {
      const px = style.px ?? typeScale[style.size ?? 'md'];
      const hex = (c: string) => (c.startsWith('#') ? c : colors[c as ColorToken]);
      const weight = style.weight ?? 700;
      const t = scene.add.text(x, y, value, {
        fontFamily: style.font === 'body' ? FONT_STACK : FONT_DISPLAY,
        fontSize: `${px}px`,
        fontStyle: weight === 700 ? 'bold' : weight === 400 ? 'normal' : String(weight),
        color: hex(style.color ?? 'text'),
        align: style.align ?? 'left',
        ...(style.stroke
          ? {
              stroke: hex(style.stroke),
              strokeThickness: style.strokePx ?? Math.max(2, Math.round(px * 0.16)),
            }
          : {}),
        ...(style.shadow
          ? {
              shadow: {
                offsetX: 0,
                offsetY: Math.max(1, px * 0.06),
                color: 'rgba(8,4,24,0.55)',
                blur: Math.max(2, px * 0.15),
                fill: true,
                stroke: true,
              },
            }
          : {}),
      });
      t.setResolution(Math.max(1, Math.ceil(renderScale)));
      return t;
    },
    textures: {
      canvas: (scene, key, w, h, draw) =>
        canvasTexture(scene, key, w, h, draw, { scale: renderScale }),
    },
    fps: {
      burst(ms) {
        const game = getGame();
        if (!game || ms <= 0 || baseFps === 0 || tk.signal.aborted) return;
        if (fpsTimer !== null) clearTimeout(fpsTimer);
        else game.loop.setFPSLimit(60);
        fpsTimer = setTimeout(() => {
          fpsTimer = null;
          getGame()?.loop.setFPSLimit(baseFps);
        }, ms + 100);
      },
    },
  };
}

/** resolves when the context runs, or after `ms`. Never calls resume(). */
function waitRunning(ac: AudioContext, ms: number): Promise<void> {
  if (ac.state === 'running') return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(t);
      ac.removeEventListener('statechange', check);
      resolve();
    };
    const check = () => ac.state === 'running' && done();
    const t = setTimeout(done, ms);
    ac.addEventListener('statechange', check);
  });
}

/** rendered buffers live in Phaser's audio cache as `sfx:<name>` and play through its sound manager. */
function phaserSfx(g: Phaser.Game): Sfx {
  const last = new Map<string, number>();
  return {
    ready: true,
    play(name, o = {}) {
      const key = `sfx:${name}`;
      const now = performance.now();
      if (!g.cache.audio.exists(key) || now - (last.get(name) ?? -Infinity) < 30) return;
      last.set(name, now);
      g.sound.play(key, { volume: o.volume ?? 1, detune: o.detuneCents ?? 0 });
    },
    stopAll: () => g.sound.stopAll(),
  };
}
