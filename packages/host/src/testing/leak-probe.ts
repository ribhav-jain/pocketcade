// LeakProbe: patches page APIs before any game module loads and reports what a game left behind after
// unmount. Used by the playground leak test only; nothing in the portal imports it.

export interface LeakSnapshot {
  rafPending: number;
  timersPending: number;
  listeners: { window: number; document: number; body: number };
  webgl: { created: number; lost: number };
  audio: { playing: number };
  handlers: { onblur: unknown; onfocus: unknown };
  containers: number;
}

export interface LeakReport {
  baseline: LeakSnapshot;
  now: LeakSnapshot;
  /** what was left behind, one line each; empty when clean */
  failures: string[];
}

export interface LeakProbe {
  markGameStart(): void;
  markGameEnd(): void;
  snapshot(): LeakSnapshot;
  baseline(): LeakSnapshot;
  report(): LeakReport;
}

type W = typeof globalThis & { __pocketcadeLeakProbe?: LeakProbe };

/** Installs once per page (idempotent). */
export function installLeakProbe(): LeakProbe {
  const g = globalThis as W;
  if (g.__pocketcadeLeakProbe) return g.__pocketcadeLeakProbe;

  // rAF
  const raf = new Set<number>();
  const origRaf = g.requestAnimationFrame.bind(g);
  const origCaf = g.cancelAnimationFrame.bind(g);
  g.requestAnimationFrame = (cb) => {
    const id = origRaf((t) => {
      raf.delete(id);
      cb(t);
    });
    raf.add(id);
    return id;
  };
  g.cancelAnimationFrame = (id) => {
    raf.delete(id);
    origCaf(id);
  };

  // timers created inside the game window
  let inGame = false;
  const timers = new Set<unknown>();
  const st = g.setTimeout.bind(g);
  const ct = g.clearTimeout.bind(g);
  const si = g.setInterval.bind(g);
  const ci = g.clearInterval.bind(g);
  g.setTimeout = ((cb: TimerHandler, ms?: number, ...a: unknown[]) => {
    const track = inGame;
    const id: ReturnType<typeof setTimeout> = st(
      (...x: unknown[]) => {
        timers.delete(id);
        if (typeof cb === 'function') (cb as (...y: unknown[]) => void)(...x);
      },
      ms,
      ...a,
    );
    if (track) timers.add(id);
    return id;
  }) as unknown as typeof setTimeout;
  g.clearTimeout = ((id?: ReturnType<typeof setTimeout>) => {
    timers.delete(id);
    ct(id);
  }) as unknown as typeof clearTimeout;
  g.setInterval = ((cb: TimerHandler, ms?: number, ...a: unknown[]) => {
    const id = si(cb, ms, ...a);
    if (inGame) timers.add(id);
    return id;
  }) as unknown as typeof setInterval;
  g.clearInterval = ((id?: ReturnType<typeof setInterval>) => {
    timers.delete(id);
    ci(id);
  }) as unknown as typeof clearInterval;

  // window / document / body listeners
  type Rec = { t: EventTarget; type: string; l: unknown; c: boolean };
  const recs: Rec[] = [];
  const which = (t: EventTarget) =>
    t === window ? 'window' : t === document ? 'document' : t === document.body ? 'body' : null;
  const cap = (o: unknown) =>
    typeof o === 'boolean' ? o : !!(o as { capture?: boolean } | undefined)?.capture;
  const find = (t: EventTarget, type: string, l: unknown, c: boolean) =>
    recs.findIndex((r) => r.t === t && r.type === type && r.l === l && r.c === c);
  const add = EventTarget.prototype.addEventListener;
  const remove = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function (
    this: EventTarget,
    type: string,
    l: EventListenerOrEventListenerObject | null,
    o?: boolean | AddEventListenerOptions,
  ) {
    if (l && which(this) && !(typeof o === 'object' && o?.once)) {
      const c = cap(o);
      if (find(this, type, l, c) < 0) {
        recs.push({ t: this, type, l, c });
        const signal = typeof o === 'object' ? o?.signal : undefined;
        signal?.addEventListener('abort', () => {
          const i = find(this, type, l, c);
          if (i >= 0) recs.splice(i, 1);
        });
      }
    }
    return add.call(this, type, l, o);
  };
  EventTarget.prototype.removeEventListener = function (
    this: EventTarget,
    type: string,
    l: EventListenerOrEventListenerObject | null,
    o?: boolean | EventListenerOptions,
  ) {
    const i = which(this) ? find(this, type, l, cap(o)) : -1;
    if (i >= 0) recs.splice(i, 1);
    return remove.call(this, type, l, o);
  };

  // WebGL contexts created / lost
  const webgl = { created: 0, lost: 0 };
  const getContext = HTMLCanvasElement.prototype.getContext;
  const seen = new WeakSet<object>();
  HTMLCanvasElement.prototype.getContext = function (
    this: HTMLCanvasElement,
    id: string,
    ...rest: unknown[]
  ) {
    const ctx = (getContext as (this: HTMLCanvasElement, ...a: unknown[]) => unknown).call(
      this,
      id,
      ...rest,
    ) as object | null;
    if (ctx && /^(webgl2?|experimental-webgl)$/.test(id) && !seen.has(ctx)) {
      seen.add(ctx);
      webgl.created++;
    }
    return ctx;
  } as typeof getContext;
  for (const proto of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
    const getExtension = proto.getExtension;
    proto.getExtension = function (this: WebGLRenderingContext, name: string) {
      const ext = (getExtension as (this: WebGLRenderingContext, n: string) => unknown).call(
        this,
        name,
      ) as { loseContext?: () => void; __probed?: boolean } | null;
      if (name === 'WEBGL_lose_context' && ext?.loseContext && !ext.__probed) {
        const lose = ext.loseContext.bind(ext);
        ext.loseContext = () => {
          webgl.lost++;
          lose();
        };
        ext.__probed = true;
      }
      return ext;
    } as typeof proto.getExtension;
  }

  // audio sources started and not yet ended/stopped
  const playing = new Set<AudioScheduledSourceNode>();
  if (typeof AudioScheduledSourceNode !== 'undefined') {
    const start = AudioScheduledSourceNode.prototype.start;
    const stop = AudioScheduledSourceNode.prototype.stop;
    AudioScheduledSourceNode.prototype.start = function (
      this: AudioScheduledSourceNode,
      ...a: number[]
    ) {
      playing.add(this);
      add.call(this, 'ended', () => playing.delete(this));
      return (start as (...x: number[]) => void).apply(this, a);
    } as typeof start;
    AudioScheduledSourceNode.prototype.stop = function (
      this: AudioScheduledSourceNode,
      ...a: number[]
    ) {
      playing.delete(this);
      return (stop as (...x: number[]) => void).apply(this, a);
    } as typeof stop;
  }

  const snapshot = (): LeakSnapshot => {
    const count = (t: EventTarget) => recs.filter((r) => r.t === t).length;
    return {
      rafPending: raf.size,
      timersPending: timers.size,
      listeners: { window: count(window), document: count(document), body: count(document.body) },
      webgl: { ...webgl },
      audio: { playing: playing.size },
      handlers: { onblur: window.onblur, onfocus: window.onfocus },
      containers: document.querySelectorAll('[data-pocketcade-game]').length,
    };
  };
  let base = snapshot();

  const probe: LeakProbe = {
    markGameStart: () => void (inGame = true),
    markGameEnd: () => void (inGame = false),
    snapshot,
    baseline: () => (base = snapshot()),
    report() {
      const now = snapshot();
      const f: string[] = [];
      if (now.rafPending > base.rafPending)
        f.push(`animation frames pending: ${now.rafPending} > ${base.rafPending}`);
      if (now.timersPending > 0) f.push(`game timers pending: ${now.timersPending}`);
      for (const k of ['window', 'document', 'body'] as const)
        if (now.listeners[k] !== base.listeners[k])
          f.push(`${k} listeners: ${now.listeners[k]} ≠ ${base.listeners[k]}`);
      if (now.containers > 0) f.push(`game containers left in the page: ${now.containers}`);
      const open = now.webgl.created - base.webgl.created - (now.webgl.lost - base.webgl.lost);
      if (open > 1) f.push(`WebGL contexts not released: ${open}`);
      if (now.audio.playing > 0) f.push(`audio sources still playing: ${now.audio.playing}`);
      if (
        now.handlers.onblur !== base.handlers.onblur ||
        now.handlers.onfocus !== base.handlers.onfocus
      )
        f.push('window.onblur/onfocus changed');
      return { baseline: base, now, failures: f };
    },
  };
  g.__pocketcadeLeakProbe = probe;
  return probe;
}
