// Shared fixtures for the runner tests: a fake game that records what the host does to it, and a runner wired
// to an in-memory backend.
import {
  SDK_API_VERSION,
  type Game,
  type GameDefinition,
  type GameMeta,
  type HostAPI,
  type HostEvents,
  type MountContext,
  type PauseReason,
} from '@pocketcade/sdk';
import { vi } from 'vitest';
import { createMemoryBackend } from '../src/backend.ts';
import { createGameRunner, type RunnerEvent } from '../src/runner.ts';
import {
  createHostServices,
  type HostServices,
  type HostServicesOptions,
} from '../src/services.ts';

export const meta: GameMeta = {
  id: 'fake',
  apiVersion: SDK_API_VERSION,
  version: '1.0.0',
  inputs: ['keyboard', 'pointer', 'touch'],
  orientation: 'any',
  aspectRatio: 1,
  minSize: { width: 100, height: 100 },
  saveSchemaVersion: 1,
  leaderboards: [{ id: 'best', label: 'Best', order: 'desc', format: 'integer' }],
};

export interface FakeGame extends Game {
  host: HostAPI | null;
  ctx: MountContext | null;
  paused: PauseReason[];
  resumed: number;
  unmounted: number;
  /** every host event the game received, in order */
  events: Array<[keyof HostEvents, unknown]>;
}

interface FakeOptions {
  /** runs inside mount(), after the game has its host and a focusable stage */
  mount?: (g: FakeGame, ctx: MountContext) => Promise<void>;
  unmount?: () => Promise<void>;
  pauseThrows?: boolean;
  resumeThrows?: boolean;
}

const HOST_EVENTS = ['resize', 'mute', 'fullscreenchange', 'inputchange', 'dailyrollover'] as const;

export function fakeDefinition(o: FakeOptions = {}, m: GameMeta = meta) {
  const instances: FakeGame[] = [];
  const def: GameDefinition = {
    meta: m,
    create() {
      const g: FakeGame = {
        host: null,
        ctx: null,
        paused: [],
        resumed: 0,
        unmounted: 0,
        events: [],
        async mount(container, host, ctx) {
          g.host = host;
          g.ctx = ctx;
          for (const ev of HOST_EVENTS) host.on(ev, (payload) => g.events.push([ev, payload]));
          const stage = document.createElement('div');
          stage.tabIndex = 0;
          container.appendChild(stage);
          if (o.mount) await o.mount(g, ctx);
        },
        async unmount() {
          g.unmounted++;
          if (o.unmount) await o.unmount();
        },
        pause(reason) {
          if (o.pauseThrows) throw new Error('pause boom');
          g.paused.push(reason);
        },
        resume() {
          if (o.resumeThrows) throw new Error('resume boom');
          g.resumed++;
        },
      };
      instances.push(g);
      return g;
    },
  };
  return { def, instances, load: vi.fn(async () => ({ default: def })) };
}

export function testServices(extra: Partial<HostServicesOptions> = {}): HostServices {
  return createHostServices({
    locale: 'en-US',
    reducedMotion: false,
    dev: false,
    buildId: 'test',
    backend: createMemoryBackend(),
    ...extra,
  });
}

export function makeRunner(
  services: HostServices,
  load: () => Promise<{ default: GameDefinition }>,
  frame: HTMLElement,
  fullscreenTarget?: HTMLElement,
) {
  const events: RunnerEvent[] = [];
  const runner = createGameRunner({
    gameId: 'fake',
    load,
    frame,
    ...(fullscreenTarget ? { fullscreenTarget } : {}),
    services,
    onEvent: (e) => events.push(e),
  });
  const states = () =>
    events
      .filter((e): e is Extract<RunnerEvent, { type: 'state' }> => e.type === 'state')
      .map((e) => e.state);
  return { runner, events, states };
}

/** Lets queued microtasks and zero-delay timers run under fake timers. */
export const flush = () => vi.advanceTimersByTimeAsync(0);

export const containers = () => document.querySelectorAll('[data-pocketcade-game]').length;
