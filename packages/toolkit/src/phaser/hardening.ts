// Workarounds for Phaser 4.2.1 behaviour that would otherwise leak listeners or whole games.
//
// Source audit of phaser@4.2.1, paths relative to node_modules/phaser/src:
// - core/VisibilityHandler.js: adds document 'visibilitychange' and overwrites window.onblur/onfocus.
//   It is never undone. Game#texturesReady emits READY *before* calling start() → VisibilityHandler(),
//   so the capture window must stay open until the microtask after READY (not just until READY).
// - scale/ScaleManager.js: window 'resize'/'orientationchange' and document '*fullscreenchange' listeners;
//   removed by ScaleManager#stopListeners on destroy. Captured anyway (removal is idempotent).
// - input/mouse/MouseManager.js: stopListeners() never removes the canvas 'wheel' listener (phaserjs/phaser#7340).
//   window mousedown/mouseup only with config.inputWindowEvents (we pass windowEvents: false).
// - sound/webaudio/WebAudioSoundManager.js: document.body unlock listeners (touchstart, touchend, mousedown,
//   mouseup, keydown) when the context is suspended. With audio.noAudio Phaser uses NoAudioSoundManager instead.
// - core/Game.js: destroy() only sets pendingDestroy; teardown runs in the next step(). Game#runDestroy()
//   is the forced-teardown entry point when no frame arrives (we call runDestroy()).
// - core/TimeStep.js: setFPSLimit(limit) exists (4.2.0+), used for the 60/30 fps burst.
// - core/CreateRenderer.js: the Canvas renderer ships in the dist build, so 'auto' falls back to Canvas.
// - gameobjects/graphics/Graphics.js: Graphics.TargetCamera is a module-level BaseCamera that generateTexture()
//   binds to the calling scene and pushes the Graphics object onto its renderList, which nothing ever clears.
//   It retained every unmounted game's scene, renderer and WebGL context (+1 canvas per mount, found by the
//   leak suite). releaseTargetCamera() below undoes it.

type Listener = EventListenerOrEventListenerObject;
interface Record_ {
  target: EventTarget;
  type: string;
  listener: Listener;
  options: boolean | EventListenerOptions | undefined;
}

/** (target, type) pairs Phaser 4.2.1 may add to page globals during boot. */
const ALLOW: Record<'window' | 'document' | 'body', ReadonlySet<string>> = {
  window: new Set([
    'resize',
    'orientationchange',
    'mousedown',
    'mouseup',
    'touchstart',
    'touchend',
    'touchcancel',
    'load',
  ]),
  document: new Set([
    'visibilitychange',
    'webkitvisibilitychange',
    'mozvisibilitychange',
    'msvisibilitychange',
    'fullscreenchange',
    'webkitfullscreenchange',
    'mozfullscreenchange',
    'fullscreenerror',
    'webkitfullscreenerror',
    'mozfullscreenerror',
    'MSFullscreenChange',
    'MSFullscreenError',
    'pointerlockchange',
    'mozpointerlockchange',
    'webkitpointerlockchange',
    'DOMContentLoaded',
    'deviceready',
  ]),
  body: new Set(['touchstart', 'touchend', 'touchmove', 'mousedown', 'mouseup', 'keydown']),
};

export interface ListenerCapture {
  /** Remove the own-property wrappers (end of the capture window). */
  stop(): void;
  /** Remove captured document.body listeners now (WebAudio unlock). */
  removeBody(): void;
  /** Remove every captured listener (unmount). */
  removeAll(): void;
}

/** temporary own-property addEventListener wrappers on window, document and document.body. */
export function captureGlobalListeners(): ListenerCapture {
  const records: Record_[] = [];
  const targets: Array<[keyof typeof ALLOW, EventTarget]> = [
    ['window', window],
    ['document', document],
    ['body', document.body],
  ];
  for (const [name, target] of targets) {
    Object.defineProperty(target, 'addEventListener', {
      configurable: true,
      writable: true,
      value(
        this: EventTarget,
        type: string,
        listener: Listener | null,
        options?: boolean | AddEventListenerOptions,
      ) {
        if (listener && ALLOW[name].has(type)) {
          records.push({
            target,
            type,
            listener,
            options: typeof options === 'object' ? { capture: options.capture } : options,
          });
        }
        // Look the prototype method up at call time so LeakProbe-style spies still see the call.
        return EventTarget.prototype.addEventListener.call(this, type, listener, options);
      },
    });
  }
  const remove = (r: Record_) =>
    EventTarget.prototype.removeEventListener.call(r.target, r.type, r.listener, r.options);
  return {
    stop() {
      for (const [, target] of targets)
        delete (target as unknown as Record<string, unknown>).addEventListener;
    },
    removeBody() {
      for (let i = records.length - 1; i >= 0; i--) {
        if (records[i]!.target === document.body) remove(records.splice(i, 1)[0]!);
      }
    },
    removeAll() {
      for (const r of records.splice(0)) remove(r);
    },
  };
}

/** save window.onblur/onfocus before Phaser overwrites them. */
export function saveWindowFocusHandlers(): () => void {
  const { onblur, onfocus } = window;
  return () => {
    window.onblur = onblur;
    window.onfocus = onfocus;
  };
}

interface DestroyableGame {
  renderer: unknown;
  input?: { mouse?: { target?: EventTarget | null; onMouseWheel?: Listener } | null } | null;
  events: { once(event: string, fn: () => void): unknown };
  destroy(removeCanvas: boolean, noReturn?: boolean): void;
  runDestroy(): void;
}

/**
 * Items (4)–(5) plus #7340: remove the canvas wheel listener, lose the WebGL context, destroy(true, false),
 * and force teardown with runDestroy() if DESTROY has not fired within 300 ms (hidden tab, no rAF).
 */
export async function destroyGame(game: DestroyableGame, destroyEvent: string): Promise<void> {
  try {
    const mouse = game.input?.mouse;
    if (mouse?.target && mouse.onMouseWheel)
      mouse.target.removeEventListener('wheel', mouse.onMouseWheel);
  } catch {
    // best effort
  }
  try {
    const gl = (game.renderer as { gl?: WebGLRenderingContext | null } | null)?.gl;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    // best effort
  }
  let fired = false;
  const destroyed = new Promise<void>((resolve) =>
    game.events.once(destroyEvent, () => {
      fired = true;
      resolve();
    }),
  );
  game.destroy(true, false);
  await new Promise<void>((resolve) => {
    const t = setTimeout(resolve, 300);
    void destroyed.then(() => {
      clearTimeout(t);
      resolve();
    });
  });
  if (!fired) game.runDestroy();
}

interface TargetCameraLike {
  renderList?: unknown[];
  scene?: unknown;
  sceneManager?: unknown;
  scaleManager?: unknown;
  cameraManager?: unknown;
  _customViewport?: boolean;
}

/** Item (11): drop Graphics.TargetCamera's references to the scene, game and render nodes (see the audit above). */
export function releaseTargetCamera(graphicsClass: unknown): void {
  const cam = (graphicsClass as { TargetCamera?: TargetCameraLike } | null)?.TargetCamera;
  if (!cam) return;
  if (Array.isArray(cam.renderList)) cam.renderList.length = 0;
  cam.scene = null;
  cam.sceneManager = null;
  cam.scaleManager = null;
  cam.cameraManager = null;
  cam._customViewport = false;
}
