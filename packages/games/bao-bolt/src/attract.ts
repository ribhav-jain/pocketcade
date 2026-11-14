// The self-playing demo: acts at the centre of each obstacle's window and fumbles on purpose around steps 200 and
// 900 (stumbles) and from 1,000 on (eaten), so the reel shows Gulp and a whole run.
import type { AttractScript, VirtualInput } from '@pocketcade/toolkit';
import type { ObstacleKind } from './chunks.ts';

export interface AttractView {
  next: { kind: ObstacleKind; ttcS: number } | null;
  move: 'grounded' | 'airborne' | 'fastdrop' | 'sliding';
  /** what the current jump is clearing */
  jumpKind: ObstacleKind | null;
}

// Centres of each action's clear window (time to contact with the hitbox): a full-hold jump clears tins from 0.17 to 0.43 s.
const TRIGGER: Record<ObstacleKind, number> = { pin: 0.16, tins: 0.3, shelf: 0.05 };
const fumbling = (step: number) =>
  (step >= 200 && step < 260) || (step >= 900 && step < 960) || step >= 1000;
const press = (action: string): VirtualInput => ({ action, phase: 'press' });

export const attract: AttractScript<AttractView> = {
  seed: 'bunaway:attract',
  drive(step, view) {
    if (!view) return;
    // short hops release at once; tins jumps keep the full hold
    if (view.move === 'airborne' && view.jumpKind !== 'tins')
      return [{ action: 'jump', phase: 'release' }];
    const next = view.next;
    if (!next || view.move === 'airborne' || view.move === 'fastdrop') return;
    const t = TRIGGER[next.kind];
    if (next.ttcS > t || next.ttcS <= t - 0.05 || fumbling(step)) return;
    return [press(next.kind === 'shelf' ? 'slide' : 'jump')];
  },
  clip: { startStep: 240, durationMs: 3000 },
  still: { atStep: 420, holdMs: 600 },
  restartDelayMs: 1000,
};
