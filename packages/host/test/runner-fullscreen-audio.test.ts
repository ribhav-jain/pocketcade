// @vitest-environment happy-dom
// GameRunner fullscreen (pseudo-fullscreen here: happy-dom has no Fullscreen API) and the shared audio context.
import type { GameDefinition } from '@pocketcade/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HostServices } from '../src/services.ts';
import {
  fakeDefinition,
  flush,
  makeRunner as makeRunnerOn,
  meta,
  testServices,
} from './harness.ts';

// A minimal Web Audio stand-in.
class FakeGain {
  gain = { value: 1, setTargetAtTime: vi.fn((v: number) => (this.gain.value = v)) };
  connected = false;
  connect() {
    this.connected = true;
  }
  disconnect() {
    this.connected = false;
  }
}
let contexts: FakeAudioContext[] = [];
class FakeAudioContext {
  state: 'suspended' | 'running' = 'suspended';
  currentTime = 0;
  destination = {};
  constructor() {
    contexts.push(this);
  }
  private listeners = new Set<() => void>();
  addEventListener(_type: 'statechange', cb: () => void) {
    this.listeners.add(cb);
  }
  removeEventListener(_type: 'statechange', cb: () => void) {
    this.listeners.delete(cb);
  }
  private set(state: 'suspended' | 'running') {
    if (this.state === state) return;
    this.state = state;
    for (const cb of this.listeners) cb();
  }
  resume = vi.fn(async () => this.set('running'));
  suspend = vi.fn(async () => this.set('suspended'));
  createGain() {
    return new FakeGain();
  }
}
const audioGlobal = globalThis as unknown as { AudioContext?: unknown };

let services: HostServices;
let frame: HTMLElement;
let stage: HTMLElement;

const makeRunner = (load: () => Promise<{ default: GameDefinition }>) =>
  makeRunnerOn(services, load, frame, stage);

function useServices(extra: Parameters<typeof testServices>[0] = {}) {
  services?.dispose();
  services = testServices(extra);
}

beforeEach(() => {
  vi.useFakeTimers();
  contexts = [];
  audioGlobal.AudioContext = FakeAudioContext;
  useServices();
  stage = document.createElement('div');
  frame = document.createElement('div');
  stage.appendChild(frame);
  document.body.appendChild(stage);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  services.dispose();
  vi.useRealTimers();
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('style');
  document.body.removeAttribute('style');
  delete audioGlobal.AudioContext;
});

describe('fullscreen', () => {
  it('falls back to pseudo-fullscreen on the stage and tells the embedder and the game', async () => {
    const f = fakeDefinition();
    const { runner, events } = makeRunner(f.load);
    runner.mount();
    await flush();
    expect(await runner.enterFullscreen()).toEqual({ mode: 'pseudo' });
    expect(stage.style.position).toBe('fixed');
    expect(document.body.style.overflow).toBe('hidden');
    expect(events).toContainEqual({ type: 'fullscreenchange', mode: 'pseudo' });
    expect(f.instances[0]!.events[0]).toEqual(['fullscreenchange', { mode: 'pseudo' }]);
    // asking again while already fullscreen changes nothing
    expect(await f.instances[0]!.host!.display.requestFullscreen()).toEqual({ mode: 'pseudo' });
  });

  it('a player exit pauses behind the resume overlay; an exit by the game does not', async () => {
    const f = fakeDefinition();
    const { runner, events } = makeRunner(f.load);
    runner.mount();
    await flush();
    await f.instances[0]!.host!.display.requestFullscreen();
    await f.instances[0]!.host!.display.exitFullscreen();
    expect(runner.state).toBe('running');
    expect(stage.getAttribute('style')).toBeNull();
    await runner.enterFullscreen();
    await runner.exitFullscreen();
    expect(runner.state).toBe('paused');
    expect(events.at(-1)).toEqual({ type: 'pausechange', reasons: ['host'], overlay: true });
  });

  it('Escape goes to a game that uses it (with a hint) and exits on the second press; otherwise the first exits', async () => {
    const f = fakeDefinition();
    const { runner, events } = makeRunner(f.load);
    runner.mount();
    await flush();
    await runner.enterFullscreen();
    const esc = () => {
      const e = new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      frame.dispatchEvent(e);
      return e;
    };
    expect(esc().defaultPrevented).toBe(false);
    expect(events).toContainEqual({ type: 'escapehint' });
    expect(runner.fullscreenMode).toBe('pseudo');
    expect(esc().defaultPrevented).toBe(true);
    expect(runner.fullscreenMode).toBe('none');
    await runner.unmount();

    const noEsc = fakeDefinition({}, { ...meta, pauseKeys: [] });
    const r2 = makeRunner(noEsc.load);
    r2.runner.mount();
    await flush();
    await r2.runner.enterFullscreen();
    esc();
    expect(r2.runner.fullscreenMode).toBe('none');
  });

  it('unmounting restores the page; attract mounts never get fullscreen', async () => {
    const f = fakeDefinition();
    const { runner } = makeRunner(f.load);
    runner.mount();
    await flush();
    await runner.enterFullscreen();
    await runner.unmount();
    expect(stage.getAttribute('style')).toBeNull();
    expect(document.body.style.overflow).toBe('');

    const a = fakeDefinition();
    const ra = makeRunner(a.load);
    ra.runner.mount('attract');
    await flush();
    expect(await a.instances[0]!.host!.display.requestFullscreen()).toEqual({ mode: 'none' });
  });
});

describe('audio', () => {
  it('shares one context across mounts; each mount gets its own master gain, disconnected at unmount', async () => {
    const a = fakeDefinition();
    const ra = makeRunner(a.load);
    ra.runner.mount();
    await flush();
    const hostA = a.instances[0]!.host!;
    expect(hostA.capabilities.has('audio')).toBe(true);
    const { context, output } = hostA.audio;
    expect((output as unknown as FakeGain).connected).toBe(true);
    await ra.runner.unmount();
    expect((output as unknown as FakeGain).connected).toBe(false);

    const b = fakeDefinition();
    const rb = makeRunner(b.load);
    rb.runner.mount();
    await flush();
    expect(b.instances[0]!.host!.audio.context).toBe(context);
    expect(b.instances[0]!.host!.audio.output).not.toBe(output);
    expect(contexts).toHaveLength(1);
  });

  it('suspends while paused, resumes after, and resumes synchronously inside the overlay gesture', async () => {
    const f = fakeDefinition();
    const { runner } = makeRunner(f.load);
    runner.mount();
    await flush();
    const ctx = contexts[0]!;
    expect(ctx.state).toBe('running');
    runner.addPause('user');
    await flush();
    expect(ctx.state).toBe('suspended');
    runner.removePause('user');
    await flush();
    expect(ctx.state).toBe('running');
    runner.addPause('blur');
    await flush();
    ctx.resume.mockClear();
    runner.resumeFromOverlay();
    expect(ctx.resume).toHaveBeenCalledTimes(1);
  });

  it('mute ramps the master gain down, suspends the context and tells the game', async () => {
    const f = fakeDefinition();
    const { runner } = makeRunner(f.load);
    runner.mount();
    await flush();
    const gain = f.instances[0]!.host!.audio.output as unknown as FakeGain;
    services.audio.setMuted(true);
    await flush();
    expect(gain.gain.setTargetAtTime).toHaveBeenCalledWith(0, 0, 0.02);
    expect(contexts[0]!.state).toBe('suspended');
    expect(f.instances[0]!.events).toContainEqual(['mute', { muted: true }]);
    services.audio.setMuted(false);
    expect(contexts[0]!.resume).toHaveBeenCalled();
    expect(runner.state).toBe('running');
  });

  it('the host owns the context state: a game that resumes it while muted is suspended again', async () => {
    const f = fakeDefinition();
    const { runner } = makeRunner(f.load);
    services.audio.setMuted(true);
    runner.mount();
    await flush();
    expect(contexts[0]!.state).toBe('suspended');
    void f.instances[0]!.host!.audio.context.resume(); // what Phaser does with a supplied context
    await flush();
    expect(contexts[0]!.state).toBe('suspended');
  });

  it('attract mounts are silent and never resume the context', async () => {
    const f = fakeDefinition();
    const { runner } = makeRunner(f.load);
    runner.mount('attract');
    await flush();
    const host = f.instances[0]!.host!;
    expect(host.env.muted).toBe(true);
    expect((host.audio.output as unknown as FakeGain).gain.value).toBe(0);
    expect(contexts[0]!.resume).not.toHaveBeenCalled();
  });

  it('a game cannot close the shared context', async () => {
    useServices({ dev: true });
    const f = fakeDefinition();
    const { runner } = makeRunner(f.load);
    runner.mount();
    await flush();
    expect(() => f.instances[0]!.host!.audio.context.close()).toThrowError(
      expect.objectContaining({ name: 'ContractViolation' }),
    );
  });

  it('without Web Audio, audio is not a capability and reading host.audio throws', async () => {
    delete audioGlobal.AudioContext;
    useServices();
    const f = fakeDefinition();
    const { runner } = makeRunner(f.load);
    runner.mount();
    await flush();
    const host = f.instances[0]!.host!;
    expect(host.capabilities.has('audio')).toBe(false);
    expect(() => host.audio).toThrowError(
      expect.objectContaining({ name: 'CapabilityUnavailable' }),
    );
  });
});
