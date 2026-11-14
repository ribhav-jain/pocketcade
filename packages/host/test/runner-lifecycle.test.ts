// @vitest-environment happy-dom
// GameRunner lifecycle: the mount queue, mount and unmount with their timeouts, pause reasons, crashes and
// what the game sees through its HostAPI.
import type { GameDefinition } from '@pocketcade/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GAME_MARKER } from '../src/errors.ts';
import type { HostServices } from '../src/services.ts';
import {
  containers,
  fakeDefinition,
  flush,
  makeRunner as makeRunnerOn,
  meta,
  testServices,
} from './harness.ts';

declare const process: { env: Record<string, string | undefined> };

let services: HostServices;
let frame: HTMLElement;

const makeRunner = (load: () => Promise<{ default: GameDefinition }>) =>
  makeRunnerOn(services, load, frame);

function useServices(extra: Parameters<typeof testServices>[0] = {}) {
  services?.dispose();
  services = testServices(extra);
}

function setVisibility(v: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  vi.useFakeTimers();
  useServices();
  frame = document.createElement('div');
  document.body.appendChild(frame);
  setVisibility('visible');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  services.dispose();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('mount queue', () => {
  it('mount → unmount → mount in one task ends as a single mount', async () => {
    const { load } = fakeDefinition();
    const { runner } = makeRunner(load);
    runner.mount();
    void runner.unmount();
    runner.mount();
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
    expect(runner.state).toBe('running');
    expect(containers()).toBe(1);
  });

  it('a runner unmounted before its mount starts imports nothing; the next runner mounts', async () => {
    const a = fakeDefinition();
    const b = fakeDefinition();
    const ra = makeRunner(a.load);
    ra.runner.mount();
    const disposed = ra.runner.unmount();
    const rb = makeRunner(b.load);
    rb.runner.mount();
    await flush();
    await disposed;
    expect(a.load).not.toHaveBeenCalled();
    expect(ra.runner.state).toBe('disposed');
    expect(rb.runner.state).toBe('running');
    expect(containers()).toBe(1);
  });

  it('one game per document: the next game is not created until the previous unmount settles', async () => {
    let releaseUnmount!: () => void;
    const a = fakeDefinition({ unmount: () => new Promise<void>((r) => (releaseUnmount = r)) });
    const b = fakeDefinition();
    const createB = vi.spyOn(b.def, 'create');
    const ra = makeRunner(a.load);
    ra.runner.mount();
    await flush();
    expect(ra.runner.state).toBe('running');

    void ra.runner.unmount();
    const rb = makeRunner(b.load);
    rb.runner.mount();
    await flush();
    expect(b.load).not.toHaveBeenCalled();
    expect(createB).not.toHaveBeenCalled();
    expect(containers()).toBe(1);

    releaseUnmount();
    await flush();
    expect(ra.runner.state).toBe('disposed');
    expect(createB).toHaveBeenCalledTimes(1);
    expect(rb.runner.state).toBe('running');
    expect(containers()).toBe(1);
  });
});

describe('mount', () => {
  it('creates the container, passes the launch mode and a live signal, and focuses the game', async () => {
    const f = fakeDefinition();
    const { runner, states } = makeRunner(f.load);
    runner.mount('play');
    await flush();
    const g = f.instances[0]!;
    const c = frame.querySelector<HTMLElement>('[data-pocketcade-game="fake"]')!;
    expect(c.getAttribute('style')).toContain('touch-action:none');
    expect(g.ctx?.launch).toBe('play');
    expect(g.ctx?.signal.aborted).toBe(false);
    expect(document.activeElement).toBe(c.querySelector('[tabindex="0"]'));
    expect(states()).toEqual(['loading', 'mounting', 'running']);
  });

  it('crashes with MountTimeout exactly 15 s into a mount() that never settles, and aborts its signal', async () => {
    const f = fakeDefinition({ mount: () => new Promise<void>(() => {}) });
    const { runner, events } = makeRunner(f.load);
    runner.mount();
    await flush();
    expect(runner.state).toBe('mounting');
    await vi.advanceTimersByTimeAsync(14_999);
    expect(runner.state).toBe('mounting');
    await vi.advanceTimersByTimeAsync(1);
    expect(runner.state).toBe('crashed');
    expect(events.find((e) => e.type === 'crash')).toMatchObject({
      report: { errorName: 'MountTimeout', phase: 'mount', gameId: 'fake' },
    });
    expect(f.instances[0]!.ctx!.signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(containers()).toBe(0);
  });

  it('crashes when mount() rejects; restart then mounts a fresh instance', async () => {
    let fail = true;
    const f = fakeDefinition({
      mount: async () => (fail ? Promise.reject(new Error('nope')) : undefined),
    });
    const { runner } = makeRunner(f.load);
    runner.mount();
    await flush();
    expect(runner.state).toBe('crashed');
    fail = false;
    runner.restart();
    await flush();
    expect(runner.state).toBe('running');
    expect(f.instances).toHaveLength(2);
    expect(f.instances[1]).not.toBe(f.instances[0]);
    expect(f.instances[1]!.ctx!.launch).toBe('restart');
    expect(containers()).toBe(1);
  });

  it.each<[string, () => Promise<{ default: GameDefinition }>]>([
    ['ChunkLoadError', () => Promise.reject(new Error('chunk 404'))],
    [
      'InvalidGameMeta',
      async () => ({ default: fakeDefinition({}, { ...meta, id: 'Bad Id' }).def }),
    ],
    [
      'ApiVersionMismatch',
      async () => ({ default: fakeDefinition({}, { ...meta, apiVersion: 2 as never }).def }),
    ],
  ])('crashes with %s before creating the game, and can still be disposed', async (name, load) => {
    const { runner, events } = makeRunner(load);
    runner.mount();
    await flush();
    expect(runner.state).toBe('crashed');
    expect(events.find((e) => e.type === 'crash')).toMatchObject({ report: { errorName: name } });
    await runner.unmount();
    expect(runner.state).toBe('disposed');
  });

  it('an unmount during the import disposes without ever creating the game', async () => {
    let resolveImport!: (v: { default: GameDefinition }) => void;
    const f = fakeDefinition();
    const createSpy = vi.spyOn(f.def, 'create');
    const { runner } = makeRunner(() => new Promise((r) => (resolveImport = r)));
    runner.mount();
    await flush();
    expect(runner.state).toBe('loading');
    const done = runner.unmount();
    resolveImport({ default: f.def });
    await done;
    expect(runner.state).toBe('disposed');
    expect(createSpy).not.toHaveBeenCalled();
  });
});

describe('unmount and restart', () => {
  it('force-removes the container 2 s into an unmount() that never settles', async () => {
    const f = fakeDefinition({ unmount: () => new Promise<void>(() => {}) });
    const { runner } = makeRunner(f.load);
    runner.mount();
    await flush();
    const done = runner.unmount();
    expect(runner.state).toBe('unmounting');
    await vi.advanceTimersByTimeAsync(1999);
    expect(containers()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await done;
    expect(containers()).toBe(0);
    expect(runner.state).toBe('disposed');
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('did not settle'));
  });

  it('aborts a mount in progress without reporting a crash', async () => {
    const f = fakeDefinition({
      mount: (_g, ctx) =>
        new Promise<void>((_, reject) =>
          ctx.signal.addEventListener('abort', () => reject(ctx.signal.reason)),
        ),
    });
    const { runner, events } = makeRunner(f.load);
    runner.mount();
    await flush();
    await runner.unmount();
    expect(f.instances[0]!.ctx!.signal.aborted).toBe(true);
    expect(f.instances[0]!.unmounted).toBe(1);
    expect(events.some((e) => e.type === 'crash')).toBe(false);
    expect(runner.state).toBe('disposed');
  });

  it('revokes the HostAPI: after unmount every call is a harmless no-op', async () => {
    const f = fakeDefinition();
    const { runner } = makeRunner(f.load);
    runner.mount();
    await flush();
    const host = f.instances[0]!.host!;
    expect(await host.storage.set('k', 1)).toEqual({ ok: true });
    await runner.unmount();
    expect(await host.storage.set('k', 1)).toEqual({ ok: false, reason: 'unavailable' });
    expect(await host.storage.get('k')).toBeNull();
    expect(await host.scores.submit({ board: 'best', value: 1 })).toMatchObject({
      accepted: false,
      reason: 'unavailable',
    });
    expect(await host.display.requestFullscreen()).toEqual({ mode: 'none' });
    expect(typeof host.on('resize', () => {})).toBe('function');
  });

  it('restart unmounts the running game and mounts a fresh one with launch "restart"', async () => {
    const f = fakeDefinition();
    const { runner } = makeRunner(f.load);
    runner.mount();
    await flush();
    runner.restart();
    await flush();
    expect(f.instances).toHaveLength(2);
    expect(f.instances[0]!.unmounted).toBe(1);
    expect(f.instances[1]!.ctx!.launch).toBe('restart');
    expect(runner.state).toBe('running');
    expect(containers()).toBe(1);
  });
});

describe('pausing', () => {
  it('a hidden tab pauses; the resume overlay shows once visible again and resumes the game', async () => {
    const f = fakeDefinition();
    const { runner, events } = makeRunner(f.load);
    runner.mount();
    await flush();
    setVisibility('hidden');
    expect(runner.state).toBe('paused');
    expect(f.instances[0]!.paused).toEqual(['visibility']);
    expect(events.at(-1)).toEqual({ type: 'pausechange', reasons: ['visibility'], overlay: false });
    setVisibility('visible');
    expect(events.at(-1)).toEqual({ type: 'pausechange', reasons: ['visibility'], overlay: true });
    expect(runner.state).toBe('paused');
    runner.resumeFromOverlay();
    expect(runner.state).toBe('running');
    expect(f.instances[0]!.resumed).toBe(1);
  });

  it('calls pause() once per new reason and resume() once, when the last cause is gone', async () => {
    const f = fakeDefinition();
    const { runner } = makeRunner(f.load);
    runner.mount();
    await flush();
    runner.addPause('overlay', 'overlay:leaderboard');
    runner.addPause('overlay', 'overlay:initials');
    runner.addPause('user');
    expect(f.instances[0]!.paused).toEqual(['overlay', 'user']);
    runner.removePause('overlay', 'overlay:leaderboard');
    runner.removePause('user');
    expect(f.instances[0]!.resumed).toBe(0);
    runner.removePause('overlay', 'overlay:initials');
    expect(f.instances[0]!.resumed).toBe(1);
    expect(runner.state).toBe('running');
  });

  it('a cause added while mounting pauses the game as soon as mount resolves', async () => {
    let finish!: () => void;
    const f = fakeDefinition({ mount: () => new Promise<void>((r) => (finish = r)) });
    const { runner } = makeRunner(f.load);
    runner.mount();
    await flush();
    setVisibility('hidden');
    expect(runner.state).toBe('mounting');
    finish();
    await flush();
    expect(runner.state).toBe('paused');
    expect(f.instances[0]!.paused).toEqual(['visibility']);
  });

  it('a paused game unmounts cleanly', async () => {
    const f = fakeDefinition();
    const { runner } = makeRunner(f.load);
    runner.mount();
    await flush();
    runner.addPause('user');
    await runner.unmount();
    expect(f.instances[0]!.unmounted).toBe(1);
    expect(runner.state).toBe('disposed');
  });

  it('a frame smaller than minSize pauses with the enlarge notice and no resume overlay', async () => {
    frame.getBoundingClientRect = () => ({
      width: 80,
      height: 300,
      top: 0,
      left: 0,
      right: 80,
      bottom: 300,
      x: 0,
      y: 0,
      toJSON() {},
    });
    const f = fakeDefinition();
    const { runner, events } = makeRunner(f.load);
    runner.mount();
    await flush();
    expect(runner.state).toBe('paused');
    expect(events).toContainEqual({ type: 'notice', kind: 'enlarge' });
    expect(events.at(-1)).toEqual({ type: 'pausechange', reasons: ['host'], overlay: false });
  });
});

describe('crashes while running', () => {
  it('a throwing pause() or resume() crashes the game in that phase', async () => {
    const p = fakeDefinition({ pauseThrows: true });
    const rp = makeRunner(p.load);
    rp.runner.mount();
    await flush();
    rp.runner.addPause('user');
    expect(rp.runner.state).toBe('crashed');
    expect(rp.events.find((e) => e.type === 'crash')).toMatchObject({
      report: { phase: 'pause', errorName: 'LifecycleError' },
    });
    await rp.runner.unmount();

    const r = fakeDefinition({ resumeThrows: true });
    const rr = makeRunner(r.load);
    rr.runner.mount();
    await flush();
    rr.runner.addPause('user');
    rr.runner.removePause('user');
    expect(rr.runner.state).toBe('crashed');
    expect(rr.events.find((e) => e.type === 'crash')).toMatchObject({
      report: { phase: 'resume' },
    });
  });

  it("only window errors attributed to the game crash it; the game's unhandled rejections are diagnostics", async () => {
    const f = fakeDefinition();
    const { runner, events } = makeRunner(f.load);
    runner.mount();
    await flush();
    window.dispatchEvent(
      new ErrorEvent('error', { error: new Error('portal bug'), message: 'portal bug' }),
    );
    expect(runner.state).toBe('running');

    const reason = Object.assign(new Error('game rejection'), { [GAME_MARKER]: 'fake' });
    window.dispatchEvent(
      Object.assign(new Event('unhandledrejection'), { reason, promise: Promise.resolve() }),
    );
    expect(events.some((e) => e.type === 'diagnostic')).toBe(true);
    expect(runner.state).toBe('running');

    const err = Object.assign(new Error('frame callback'), { [GAME_MARKER]: 'fake' });
    window.dispatchEvent(new ErrorEvent('error', { error: err, message: 'frame callback' }));
    expect(runner.state).toBe('crashed');
    expect(events.find((e) => e.type === 'crash')).toMatchObject({
      report: { errorName: 'GameRuntimeError', phase: 'running' },
    });
  });
});

describe('what the game sees and sends through its HostAPI', () => {
  it('gets a frozen API with the environment and the capabilities that exist', async () => {
    const f = fakeDefinition();
    const { runner } = makeRunner(f.load);
    runner.mount();
    await flush();
    const host = f.instances[0]!.host!;
    expect(Object.isFrozen(host)).toBe(true);
    expect([...host.capabilities]).toEqual(['storage', 'scores', 'fullscreen']); // no Web Audio here
    expect(host.env).toMatchObject({
      mode: 'direct',
      locale: 'en-US',
      storagePersistent: false,
      muted: false,
    });
    expect(host.env.dailyKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('loading progress only moves forward and is clamped; repeated start/stop signals are dropped', async () => {
    const f = fakeDefinition({
      mount: async (g) => {
        g.host!.gameplay.loading(0.5);
        g.host!.gameplay.loading(0.4);
        g.host!.gameplay.loading(2);
      },
    });
    const { runner, events } = makeRunner(f.load);
    runner.mount();
    await flush();
    const host = f.instances[0]!.host!;
    host.gameplay.loading(0.9);
    host.gameplay.start();
    host.gameplay.start();
    host.gameplay.stop('gameover');
    host.gameplay.stop('gameover');
    host.gameplay.stop('menu');
    const progress = events
      .filter((e) => e.type === 'progress')
      .map((e) => (e as { value: number | null }).value);
    expect(progress).toEqual([null, 0.5, 1]);
    expect(events.filter((e) => e.type === 'gameplay')).toEqual([
      { type: 'gameplay', event: 'start' },
      { type: 'gameplay', event: 'stop', reason: 'gameover' },
      { type: 'gameplay', event: 'stop', reason: 'menu' },
    ]);
  });

  it('a submitted score that ranks reaches the embedder as a score event', async () => {
    const f = fakeDefinition();
    const { runner, events } = makeRunner(f.load);
    runner.mount();
    await flush();
    await f.instances[0]!.host!.scores.submit({ board: 'best', value: 42 });
    expect(events.find((e) => e.type === 'score')).toMatchObject({
      board: 'best',
      value: 42,
      rank: 1,
      personalBest: true,
    });
  });

  it('arrow keys and Space in the game never scroll the page; other keys keep their default', async () => {
    const f = fakeDefinition();
    const { runner } = makeRunner(f.load);
    runner.mount();
    await flush();
    const target = frame.querySelector('[tabindex="0"]')!;
    const down = new KeyboardEvent('keydown', {
      code: 'ArrowDown',
      bubbles: true,
      cancelable: true,
    });
    target.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    const tab = new KeyboardEvent('keydown', { code: 'Tab', bubbles: true, cancelable: true });
    target.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
  });

  it('input in the frame switches the primary input, at most once per second', async () => {
    useServices({ dev: true }); // dev builds accept synthetic events
    const f = fakeDefinition();
    const { runner } = makeRunner(f.load);
    runner.mount();
    await flush();
    vi.advanceTimersByTime(1500);
    frame.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true }));
    frame.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    const changes = f.instances[0]!.events.filter(([e]) => e === 'inputchange');
    expect(changes).toEqual([['inputchange', { primary: 'touch' }]]);
    expect(runner.state).toBe('running');
  });

  it.each(['Asia/Kolkata', 'America/Los_Angeles'])(
    'dailyrollover fires once at local midnight in %s',
    async (tz) => {
      const previous = process.env.TZ;
      process.env.TZ = tz;
      try {
        vi.setSystemTime(new Date(2026, 10, 10, 23, 59, 59, 0));
        useServices();
        const f = fakeDefinition();
        const { runner } = makeRunner(f.load);
        runner.mount();
        await flush();
        expect(f.instances[0]!.host!.env.dailyKey).toBe('2026-11-10');
        await vi.advanceTimersByTimeAsync(1100);
        await vi.advanceTimersByTimeAsync(60_000);
        const rollovers = f.instances[0]!.events.filter(([e]) => e === 'dailyrollover');
        expect(rollovers).toEqual([['dailyrollover', { dailyKey: '2026-11-11' }]]);
      } finally {
        process.env.TZ = previous;
      }
    },
  );
});
