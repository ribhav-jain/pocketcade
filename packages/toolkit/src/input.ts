// Input: keyboard action map by KeyboardEvent.code, pointer gestures, input gate.
import type { Unsubscribe } from '@pocketcade/sdk';

export type ActionName = string;
export type Dir = 'up' | 'down' | 'left' | 'right';

export interface KeyBinding {
  /** KeyboardEvent.code values, e.g. ['ArrowLeft', 'KeyA'] */
  codes: readonly string[];
  /** honour browser auto-repeat (default false) */
  repeat?: boolean;
  /** opt-in modified bindings, e.g. Ctrl+Z */
  modifiers?: { ctrl?: boolean; meta?: boolean };
}

export interface InputSpec {
  actions: Record<ActionName, KeyBinding>;
}

export interface ActionEvent {
  action: ActionName;
  phase: 'press' | 'release';
  repeat: boolean;
  source: 'keyboard' | 'virtual';
  /** performance.now() clock: the key event's own timeStamp (performance.now() if they differ by > 1 s) */
  time: number;
}

/** x/y are authoring units (design units for Phaser FIT); dx/dy/distances are CSS px. */
export interface GestureEvents {
  tap: { x: number; y: number; pointerType: 'pointer' | 'touch' };
  dragstart: { x: number; y: number };
  drag: { x: number; y: number; dx: number; dy: number };
  /** `cancelled` when the browser or OS took the touch away (pointercancel) rather than the player letting go */
  dragend: { x: number; y: number; cancelled?: true };
  swipe: { dir: Dir; dx: number; dy: number; durationMs: number };
}

export type VirtualInput =
  | { action: ActionName; phase: 'press' | 'release' }
  | { gesture: 'tap'; x: number; y: number }
  | { gesture: 'swipe'; dir: Dir };

export interface Input {
  configure(spec: InputSpec): void;
  on(action: ActionName, cb: (e: ActionEvent) => void): Unsubscribe;
  isDown(action: ActionName): boolean;
  onGesture<G extends keyof GestureEvents>(g: G, cb: (e: GestureEvents[G]) => void): Unsubscribe;
  clearHeld(): void;
  /** attract mode and tests only */
  inject(input: VirtualInput): void;
}

/** Gesture thresholds (CSS px / ms). */
const THRESHOLDS = {
  tapMove: 8,
  tapMs: 450,
  dragStart: 8,
  swipeMin: 30,
  swipeMs: 300,
  swipeRatio: 1.5,
} as const;

/** Classifies a finished pointer sequence as a swipe direction, or null. */
export function swipeDir(dx: number, dy: number, durationMs: number): Dir | null {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const major = Math.max(ax, ay);
  const minor = Math.min(ax, ay);
  if (
    durationMs > THRESHOLDS.swipeMs ||
    major < THRESHOLDS.swipeMin ||
    major < THRESHOLDS.swipeRatio * minor
  )
    return null;
  return ax >= ay ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
}

interface InputOptions {
  /** element that owns keyboard focus and receives pointer events */
  stage: HTMLElement;
  /** aborted at unmount: removes every listener */
  signal: AbortSignal;
  /** true while real input may reach the game */
  gate: () => boolean;
  /** client px → authoring units */
  toLocal: (clientX: number, clientY: number) => { x: number; y: number };
  /** focus the stage on pointerdown (false in attract) */
  focusOnPointer: boolean;
  onError: (e: unknown) => void;
}

export function createInput(opts: InputOptions): Input {
  let actions: Record<ActionName, KeyBinding> = {};
  const held = new Set<ActionName>();
  const actionSubs = new Map<ActionName, Set<(e: ActionEvent) => void>>();
  const gestureSubs = new Map<keyof GestureEvents, Set<(e: never) => void>>();
  let ptr: {
    id: number;
    x0: number;
    y0: number;
    t0: number;
    dragging: boolean;
    type: 'pointer' | 'touch';
  } | null = null;

  const call = <T>(set: Set<(e: T) => void> | undefined, e: T) => {
    for (const cb of [...(set ?? [])]) {
      try {
        cb(e);
      } catch (err) {
        opts.onError(err);
      }
    }
  };
  /** The event's own timestamp (same clock as performance.now()); the handler time if the two disagree by > 1 s. */
  const eventTime = (e: Event) => {
    const now = performance.now();
    return Math.abs(e.timeStamp - now) <= 1000 ? e.timeStamp : now;
  };
  const fireAction = (e: ActionEvent) => call(actionSubs.get(e.action), e);
  const fireGesture = <G extends keyof GestureEvents>(g: G, e: GestureEvents[G]) =>
    call(gestureSubs.get(g) as Set<(e: GestureEvents[G]) => void> | undefined, e);

  function matchingActions(e: KeyboardEvent): Array<[ActionName, KeyBinding]> {
    if (e.altKey) return [];
    return Object.entries(actions).filter(([, b]) => {
      if (!b.codes.includes(e.code)) return false;
      if (e.ctrlKey && !b.modifiers?.ctrl) return false;
      if (e.metaKey && !b.modifiers?.meta) return false;
      return true;
    });
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.isComposing || e.keyCode === 229) return;
    const matched = matchingActions(e);
    if (matched.length === 0) return;
    e.preventDefault(); // bound key: no page scroll
    if (!opts.gate()) return;
    for (const [action, binding] of matched) {
      if (e.repeat && !binding.repeat) continue;
      held.add(action);
      fireAction({
        action,
        phase: 'press',
        repeat: e.repeat,
        source: 'keyboard',
        time: eventTime(e),
      });
    }
  };

  const onKeyUp = (e: KeyboardEvent) => {
    for (const [action, b] of Object.entries(actions)) {
      if (!b.codes.includes(e.code) || !held.delete(action)) continue;
      if (opts.gate())
        fireAction({
          action,
          phase: 'release',
          repeat: false,
          source: 'keyboard',
          time: eventTime(e),
        });
    }
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // DOM games: a press on a control (button, field…) belongs to that control. Capturing the pointer here would
    // retarget its mouseup to the stage and the control would never get its click.
    const origin = e.composedPath()[0];
    if (
      origin instanceof Element &&
      origin !== opts.stage &&
      origin.closest('button,input,textarea,select,a[href],[contenteditable],[role=button]')
    )
      return;
    if (opts.focusOnPointer) opts.stage.focus({ preventScroll: true });
    if (ptr || !opts.gate() || gestureSubs.size === 0) return;
    ptr = {
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      t0: performance.now(),
      dragging: false,
      type: e.pointerType === 'touch' ? 'touch' : 'pointer',
    };
    try {
      opts.stage.setPointerCapture(e.pointerId);
    } catch {
      // capture is best-effort
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!ptr || e.pointerId !== ptr.id || !opts.gate()) return;
    const dx = e.clientX - ptr.x0;
    const dy = e.clientY - ptr.y0;
    if (!ptr.dragging && Math.hypot(dx, dy) > THRESHOLDS.dragStart) {
      ptr.dragging = true;
      fireGesture('dragstart', opts.toLocal(ptr.x0, ptr.y0));
    }
    if (ptr.dragging) fireGesture('drag', { ...opts.toLocal(e.clientX, e.clientY), dx, dy });
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!ptr || e.pointerId !== ptr.id) return;
    const p = ptr;
    ptr = null;
    if (!opts.gate()) return;
    const dx = e.clientX - p.x0;
    const dy = e.clientY - p.y0;
    const ms = performance.now() - p.t0;
    const local = opts.toLocal(e.clientX, e.clientY);
    if (p.dragging) fireGesture('dragend', local);
    const dir = swipeDir(dx, dy, ms);
    if (dir) fireGesture('swipe', { dir, dx, dy, durationMs: ms });
    else if (!p.dragging && Math.hypot(dx, dy) <= THRESHOLDS.tapMove && ms < THRESHOLDS.tapMs) {
      fireGesture('tap', { ...local, pointerType: p.type });
    }
  };

  const onPointerCancel = (e: PointerEvent) => {
    if (!ptr || e.pointerId !== ptr.id) return;
    const wasDragging = ptr.dragging;
    ptr = null;
    if (wasDragging && opts.gate())
      fireGesture('dragend', { ...opts.toLocal(e.clientX, e.clientY), cancelled: true });
  };

  const { stage, signal } = opts;
  stage.addEventListener('keydown', onKeyDown, { signal });
  stage.addEventListener('keyup', onKeyUp, { signal });
  stage.addEventListener('pointerdown', onPointerDown, { signal });
  stage.addEventListener('pointermove', onPointerMove, { signal });
  stage.addEventListener('pointerup', onPointerUp, { signal });
  stage.addEventListener('pointercancel', onPointerCancel, { signal });
  stage.addEventListener('focusout', () => held.clear(), { signal });

  return {
    configure(spec) {
      actions = { ...spec.actions };
      held.clear();
    },
    on(action, cb) {
      let set = actionSubs.get(action);
      if (!set) actionSubs.set(action, (set = new Set()));
      const entry = (e: ActionEvent) => cb(e);
      set.add(entry);
      return () => void actionSubs.get(action)?.delete(entry);
    },
    isDown: (action) => held.has(action),
    onGesture(g, cb) {
      let set = gestureSubs.get(g);
      if (!set) gestureSubs.set(g, (set = new Set()));
      const entry = (e: never) => cb(e);
      set.add(entry);
      return () => void gestureSubs.get(g)?.delete(entry);
    },
    clearHeld() {
      held.clear();
      ptr = null;
    },
    inject(v) {
      if ('action' in v) {
        if (v.phase === 'press') held.add(v.action);
        else held.delete(v.action);
        fireAction({
          action: v.action,
          phase: v.phase,
          repeat: false,
          source: 'virtual',
          time: performance.now(),
        });
      } else if (v.gesture === 'swipe') {
        fireGesture('swipe', { dir: v.dir, dx: 0, dy: 0, durationMs: 0 });
      } else {
        fireGesture('tap', { x: v.x, y: v.y, pointerType: 'pointer' });
      }
    },
  };
}
