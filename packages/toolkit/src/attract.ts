// Attract mode driver: scripted virtual input per 60 Hz step and capture phases.
import type { VirtualInput } from './input.ts';

export interface AttractScript<View = unknown> {
  /** default `${meta.id}:attract` */
  seed?: string;
  /** once per 60 Hz step */
  drive(step: number, view: View | undefined): readonly VirtualInput[] | void;
  /** durationMs ≤ 3000 */
  clip: { startStep: number; durationMs: number };
  /** atStep ≥ clip end; holdMs default 600 */
  still: { atStep: number; holdMs?: number };
  /** after an attract game over, default 1000 */
  restartDelayMs?: number;
}

export type AttractPhase = 'warmup' | 'clip' | 'post' | 'still' | 'done';

export interface AttractController {
  readonly step: number;
  /** game publishes a read model for drive() */
  setView(view: unknown): void;
  readonly phase: AttractPhase;
}

interface AttractDriver extends AttractController {
  /** advance one fixed step (skipped while the still is held) */
  tick(): void;
}

export function createAttract(
  script: AttractScript,
  opts: {
    root: HTMLElement;
    inject(v: VirtualInput): void;
    /** freeze the game for `ms`, then call `done` */
    freeze(ms: number, done: () => void): void;
    onError(e: unknown): void;
  },
): AttractDriver {
  let step = 0;
  let view: unknown;
  let phase: AttractPhase = 'warmup';
  let holding = false;
  const clipEnd =
    script.clip.startStep + Math.round((Math.min(3000, script.clip.durationMs) * 60) / 1000);
  const set = (p: AttractPhase) => {
    phase = p;
    opts.root.setAttribute('data-tk-attract', p);
  };
  set('warmup');
  return {
    get step() {
      return step;
    },
    get phase() {
      return phase;
    },
    setView(v) {
      view = v;
    },
    tick() {
      if (holding) return;
      try {
        for (const v of script.drive(step, view) ?? []) opts.inject(v);
      } catch (e) {
        opts.onError(e);
      }
      step++;
      if (phase === 'warmup' && step >= script.clip.startStep) set('clip');
      if (phase === 'clip' && step >= clipEnd) set('post');
      if (phase === 'post' && step >= script.still.atStep) {
        set('still');
        holding = true;
        opts.freeze(script.still.holdMs ?? 600, () => {
          holding = false;
          set('done');
        });
      }
    },
  };
}
