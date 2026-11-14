// One HostServices per document: storage, scores, shared audio, window-error attribution and the
// document-wide game slot.
import { createAudioService, type AudioService } from './audio.ts';
import { probeBackend, type StorageBackend } from './backend.ts';
import { createErrorRouter, type ErrorRouter } from './errors.ts';
import {
  createScoresAdmin,
  createStorageAdmin,
  localDateKey,
  type Clock,
  type ScoresAdmin,
  type StorageAdmin,
} from '@pocketcade/sdk/rules';

export interface HostServicesOptions {
  /** always 'en-US' for now */
  locale: string;
  /** persisted portal preference */
  muted?: boolean;
  reducedMotion: boolean | 'system';
  dev: boolean;
  clock?: Clock;
  /** default: probe localStorage, else memory */
  backend?: StorageBackend;
  /** pocketcade-build meta; fills CrashReport.buildId */
  buildId: string;
}

/** Serializes game mounts across every runner on the page: one game at a time. */
interface GameSlot {
  /** Resolves with a release function once every earlier holder has released. */
  acquire(): Promise<() => void>;
}

export interface HostServices {
  readonly storage: StorageAdmin;
  readonly scores: ScoresAdmin;
  readonly audio: AudioService;
  readonly errors: ErrorRouter;
  /** Local calendar date YYYY-MM-DD. */
  readonly dailyKey: string;
  readonly options: Readonly<Required<Omit<HostServicesOptions, 'backend' | 'muted'>>>;
  readonly slot: GameSlot;
  /** tests only */
  dispose(): void;
}

function createSlot(): GameSlot {
  let tail: Promise<void> = Promise.resolve();
  return {
    acquire() {
      let release!: () => void;
      const held = new Promise<void>((resolve) => (release = resolve));
      const previous = tail;
      tail = previous.then(() => held);
      return previous.then(() => release);
    },
  };
}

/** ms until the next local midnight, DST-safe. */
export function msToNextLocalMidnight(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - ms;
}

export function createHostServices(opts: HostServicesOptions): HostServices {
  const { locale, reducedMotion, dev, buildId } = opts;
  const clock = opts.clock ?? { now: () => Date.now() };
  const backend = opts.backend ?? probeBackend();
  const errors = createErrorRouter(dev);
  return {
    storage: createStorageAdmin(backend, clock, dev),
    scores: createScoresAdmin(backend, clock),
    audio: createAudioService({ muted: opts.muted ?? false, dev }),
    errors,
    get dailyKey() {
      return localDateKey(clock.now());
    },
    options: { locale, reducedMotion, dev, clock, buildId },
    slot: createSlot(),
    dispose() {
      errors.dispose();
    },
  };
}
