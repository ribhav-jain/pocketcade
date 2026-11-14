// safeLoop: fixed 60 Hz update, render once per frame, ≤ 5 catch-up steps, 250 ms clamp.
import type { TkContext } from './context.ts';

export interface SafeLoopOptions {
  /** called with a fixed 1000/60 ms */
  update(dtMs: number): void;
  /** once per rAF; alpha 0..1 for interpolation */
  render?(alpha: number): void;
  /** default 5 steps per frame */
  maxCatchUp?: number;
}

export interface SafeLoop {
  start(): void;
  stop(): void;
  readonly running: boolean;
  /** fixed steps since start (attract scripts key off this) */
  readonly step: number;
}

const DT = 1000 / 60;

/** Stops on any pause and restarts on resume; errors are fatal. Disposed with the mount. */
export function safeLoop(options: SafeLoopOptions, tk: TkContext): SafeLoop {
  let wanted = false;
  let paused = false;
  let handle: number | null = null;
  let last = 0;
  let acc = 0;
  let step = 0;
  const max = options.maxCatchUp ?? 5;

  const frame = (now: number) => {
    handle = requestAnimationFrame(frame);
    acc += Math.min(250, now - last);
    last = now;
    try {
      let n = 0;
      while (acc >= DT && n < max) {
        options.update(DT);
        acc -= DT;
        step++;
        n++;
      }
      if (acc >= DT) acc %= DT; // drop the remainder: no spiral of death
      options.render?.(acc / DT);
    } catch (e) {
      halt();
      wanted = false;
      tk.reportError(e, true);
    }
  };
  const run = () => {
    if (handle !== null || !wanted || paused || tk.signal.aborted) return;
    last = performance.now();
    acc = 0;
    handle = requestAnimationFrame(frame);
  };
  const halt = () => {
    if (handle !== null) cancelAnimationFrame(handle);
    handle = null;
  };
  tk.on('pause', () => {
    paused = true;
    halt();
  });
  tk.on('resume', () => {
    paused = false;
    run();
  });
  tk.signal.addEventListener('abort', halt, { once: true });

  return {
    start() {
      wanted = true;
      run();
    },
    stop() {
      wanted = false;
      halt();
    },
    get running() {
      return handle !== null;
    },
    get step() {
      return step;
    },
  };
}
