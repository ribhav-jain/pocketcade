// Follow rules: a pattern over 4 lanterns grows one step per round.
// Pure and time-driven: the scene passes its game clock (ms) and draws `lit`.
import type { Rng } from '@pocketcade/toolkit';

export const LANTERNS = 4;
const MAX_LENGTH = 99;
const LEAD_IN_MS = 600;
const PRESS_LIT_MS = 350;
const NEXT_MS = 800;
const CLEAR_MARK_MS = 300;
const OUTLINE_MS = 700;

/** Tempo table: highlight on/gap by length; never more than 2 highlights per second. */
export function tempo(length: number): { on: number; gap: number } {
  if (length <= 5) return { on: 600, gap: 250 };
  if (length <= 9) return { on: 500, gap: 200 };
  if (length <= 13) return { on: 420, gap: 180 };
  return { on: 350, gap: 150 };
}

type Step = { lantern: number; on: number; off: number };

/** Playback timeline for a pattern, relative to the end of the lead-in. */
export function timeline(pattern: readonly number[]): Step[] {
  const { on, gap } = tempo(pattern.length);
  const out: Step[] = [];
  let t = 0;
  pattern.forEach((lantern, i) => {
    if (i > 0) t += pattern[i - 1] === lantern ? Math.max(gap, 250) : gap; // a repeat needs a visible dark gap
    out.push({ lantern, on: t, off: t + on });
    t += on;
  });
  return out;
}

type Phase = 'leadin' | 'watch' | 'repeat' | 'cleared' | 'wrong' | 'over';
export type FollowEvent =
  | { type: 'tone'; lantern: number }
  | { type: 'correct'; lantern: number; progress: number }
  | { type: 'round-clear'; length: number }
  | { type: 'wrong'; lantern: number; expected: number; secondLook: boolean }
  | { type: 'round'; length: number }
  | { type: 'over'; score: number };

export function createFollow(rng: Rng) {
  const pattern: number[] = [];
  /** the pattern's playback timeline (rebuilt only when the pattern grows) */
  let steps: Step[] = [];
  let phase: Phase = 'leadin';
  let phaseAt = 0;
  let progress = 0;
  let secondLookLeft = true;
  let secondLookAt: number | null = null;
  let lit: number | null = null;
  let litUntil = 0;
  let mark: { kind: 'clear' | 'wrong'; lantern: number; expected: number; until: number } | null =
    null;
  let toneIndex = -1;
  let score = 0;
  let wrongIsSecondLook = false;

  function grow(): void {
    let next = rng.int(0, LANTERNS - 1);
    while (pattern.length >= 2 && pattern.at(-1) === next && pattern.at(-2) === next)
      next = rng.int(0, LANTERNS - 1);
    pattern.push(next);
    steps = timeline(pattern);
  }

  function startRound(now: number, ev: FollowEvent[]): void {
    phase = 'leadin';
    phaseAt = now;
    progress = 0;
    toneIndex = -1;
    lit = null;
    ev.push({ type: 'round', length: pattern.length });
  }

  return {
    get pattern(): readonly number[] {
      return pattern;
    },
    get phase() {
      return phase;
    },
    get length() {
      return pattern.length;
    },
    get progress() {
      return progress;
    },
    get secondLookLeft() {
      return secondLookLeft;
    },
    get secondLookAt() {
      return secondLookAt;
    },
    get score() {
      return score;
    },
    /** The lantern lit right now, if any. */
    get lit() {
      return lit;
    },
    get mark() {
      return mark;
    },
    begin(now: number): FollowEvent[] {
      const ev: FollowEvent[] = [];
      grow();
      startRound(now, ev);
      return ev;
    },
    /** After a pause: the lead-in or playback starts again from step 1. */
    replay(now: number): void {
      if (phase === 'leadin' || phase === 'watch') {
        phase = 'leadin';
        phaseAt = now;
        toneIndex = -1;
        lit = null;
      }
    },
    /** Ends the run now (Modes pressed twice). */
    quit(): FollowEvent[] {
      if (phase === 'over') return [];
      phase = 'over';
      return [{ type: 'over', score }];
    },
    press(lantern: number, now: number): FollowEvent[] {
      const ev: FollowEvent[] = [];
      if (phase !== 'repeat') return ev; // ignored while watching or between rounds
      const expected = pattern[progress]!;
      if (lantern === expected) {
        progress++;
        lit = lantern;
        litUntil = now + PRESS_LIT_MS;
        ev.push({ type: 'tone', lantern }, { type: 'correct', lantern, progress });
        if (progress === pattern.length) {
          score = pattern.length;
          phase = 'cleared';
          phaseAt = now;
        }
        return ev;
      }
      const secondLook = secondLookLeft;
      wrongIsSecondLook = secondLook;
      if (secondLook) {
        secondLookLeft = false;
        secondLookAt = pattern.length;
      }
      phase = 'wrong';
      phaseAt = now;
      mark = { kind: 'wrong', lantern, expected, until: now + OUTLINE_MS };
      ev.push({ type: 'wrong', lantern, expected, secondLook });
      return ev;
    },
    tick(now: number): FollowEvent[] {
      const ev: FollowEvent[] = [];
      if (lit !== null && phase !== 'watch' && now >= litUntil) lit = null;
      if (mark && now >= mark.until) mark = null;
      if (phase === 'leadin' && now >= phaseAt + LEAD_IN_MS) {
        phase = 'watch';
        phaseAt = now;
      }
      if (phase === 'watch') {
        const t = now - phaseAt;
        const i = steps.findIndex((s) => t >= s.on && t < s.off);
        lit = i >= 0 ? steps[i]!.lantern : null;
        if (i > toneIndex) {
          toneIndex = i;
          ev.push({ type: 'tone', lantern: steps[i]!.lantern });
        }
        if (t >= steps.at(-1)!.off) {
          phase = 'repeat';
          lit = null;
        }
      } else if (phase === 'cleared') {
        if (!mark && now >= phaseAt + CLEAR_MARK_MS) {
          mark = { kind: 'clear', lantern: -1, expected: -1, until: phaseAt + NEXT_MS };
          ev.push({ type: 'round-clear', length: pattern.length });
        }
        if (now >= phaseAt + NEXT_MS) {
          if (pattern.length >= MAX_LENGTH) {
            phase = 'over';
            ev.push({ type: 'over', score });
          } else {
            grow();
            startRound(now, ev);
          }
        }
      } else if (phase === 'wrong' && now >= phaseAt + NEXT_MS) {
        // The first mistake replays the same length (second look); the second ends the run.
        if (wrongIsSecondLook) startRound(now, ev);
        else {
          phase = 'over';
          ev.push({ type: 'over', score });
        }
      }
      return ev;
    },
  };
}

export type Follow = ReturnType<typeof createFollow>;
