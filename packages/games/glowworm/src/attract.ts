// Attract mode: an autopilot steers Wick through the same keys a player uses. Each 60 Hz step with no turn queued
// it picks the next move: the first step of the shortest path (BFS) to a berry, if that leaves Wick more free
// cells than its length; otherwise the move with the most room. When Wick dies the toolkit restarts the run.
import type { AttractScript } from '@pocketcade/toolkit';
import {
  CELLS,
  DIRS,
  floodCount,
  opposite,
  stepCell,
  type Cave,
  type Dir,
  type Run,
} from './sim.ts';

/** What the autopilot reads (the live run). */
export type AutopilotView = Pick<
  Run,
  'phase' | 'body' | 'length' | 'growing' | 'heading' | 'queue' | 'berry' | 'golden' | 'cave'
>;

/**
 * BFS from the head's next cells: per cell, the index of the option the shortest path starts with (-1 where
 * unreachable), and the cells in the order reached, nearest first.
 */
function firstSteps(
  options: readonly { c: number }[],
  blocked: Uint8Array,
  cave: Cave,
): { first: Int16Array; order: number[] } {
  const first = new Int16Array(CELLS).fill(-1);
  const order: number[] = [];
  options.forEach((o, i) => {
    first[o.c] = i;
    order.push(o.c);
  });
  for (let q = 0; q < order.length; q++) {
    const c = order[q]!;
    for (const d of DIRS) {
      const nb = stepCell(c, d, cave);
      if (nb >= 0 && !blocked[nb] && first[nb]! < 0) {
        first[nb] = first[c]!;
        order.push(nb);
      }
    }
  }
  return { first, order };
}

/** The autopilot's move for the next tick, or null when every move is blocked (or Wick is not moving). */
export function autopilot(v: AutopilotView): Dir | null {
  if (v.phase !== 'ready' && v.phase !== 'playing') return null;
  const head = v.body[0]!;
  // Crystals and Wick block. The tail does not, unless Wick is growing: otherwise it moves on next tick.
  const blocked = new Uint8Array(CELLS);
  for (const c of v.cave.blocks) blocked[c] = 1;
  for (let i = 0; i < v.body.length - (v.growing ? 0 : 1); i++) blocked[v.body[i]!] = 1;
  // straight ahead first, so ties keep Wick going straight
  const options = [v.heading, ...DIRS.filter((d) => d !== v.heading)]
    .filter((d) => d !== opposite(v.heading))
    .map((d) => ({ d, c: stepCell(head, d, v.cave) }))
    .filter((o) => o.c >= 0 && !blocked[o.c]);
  if (!options.length) return null;
  const room = (c: number) => floodCount(c, blocked, v.cave);
  const { first, order } = firstSteps(options, blocked, v.cave);
  const target = order.find((c) => c === v.berry || c === v.golden);
  if (target !== undefined) {
    const pick = options[first[target]!]!;
    if (room(pick.c) > v.length) return pick.d;
  }
  let best = options[0]!;
  let bestRoom = room(best.c);
  for (const o of options.slice(1)) {
    const r = room(o.c);
    if (r > bestRoom) [best, bestRoom] = [o, r];
  }
  return best.d;
}

export const attract: AttractScript<AutopilotView> = {
  seed: 'glowworm:attract',
  drive(_step, view) {
    if (!view || view.queue.length) return;
    const d = autopilot(view);
    if (!d || (d === view.heading && view.phase === 'playing')) return;
    return [
      { action: d, phase: 'press' },
      { action: d, phase: 'release' },
    ];
  },
  clip: { startStep: 120, durationMs: 3000 },
  still: { atStep: 420, holdMs: 600 },
  restartDelayMs: 1000,
};
