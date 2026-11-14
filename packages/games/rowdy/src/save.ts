// The saved progress and round shapes, and the streak bookkeeping, as pure functions.
import type { Json } from '@pocketcade/sdk';
import { isCount, isInt, isRecord } from '@pocketcade/toolkit';
import type { Level, Sharpness } from './ai.ts';
import { replay, type Side } from './rules.ts';

export type { Level, Sharpness, Side };

type LevelRecordV1 = { wins: number; losses: number; draws: number; bestStreak: number };
export type RowdyProgressV1 = {
  level: Level | null;
  streak: number;
  streakDraws: number;
  records: { easy: LevelRecordV1; medium: LevelRecordV1; hard: LevelRecordV1 };
  nextStarter: Side;
  lastRoundId: number;
};
export type RowdyRoundV1 = {
  roundId: number;
  level: Level;
  sharpness: Sharpness;
  starter: Side;
  moves: number[];
  aiRng: [number, number, number, number];
};

export const LEVELS: readonly Level[] = ['easy', 'medium', 'hard'];
const zero = (): LevelRecordV1 => ({ wins: 0, losses: 0, draws: 0, bestStreak: 0 });
export const freshProgress = (): RowdyProgressV1 => ({
  level: null,
  streak: 0,
  streakDraws: 0,
  records: { easy: zero(), medium: zero(), hard: zero() },
  nextStarter: 'you',
  lastRoundId: 0,
});
export const sharpnessFor = (streak: number) => Math.min(streak, 4) as Sharpness;

const isLevel = (v: unknown): v is Level => v === 'easy' || v === 'medium' || v === 'hard';
const isSide = (v: unknown): v is Side => v === 'you' || v === 'bot';

export function isProgressV1(v: Json): v is RowdyProgressV1 {
  if (!isRecord(v) || !(v.level === null || isLevel(v.level)) || !isSide(v.nextStarter))
    return false;
  if (![v.streak, v.streakDraws, v.lastRoundId].every(isCount) || !isRecord(v.records))
    return false;
  const recs = v.records;
  for (const l of LEVELS) {
    const r = recs[l];
    if (!isRecord(r) || ![r.wins, r.losses, r.draws, r.bestStreak].every(isCount)) return false;
  }
  if (v.level === null) return v.streak === 0 && v.streakDraws === 0;
  const rec = recs[v.level] as LevelRecordV1;
  return (
    rec.bestStreak >= (v.streak as number) && (v.streakDraws as number) <= rec.wins + rec.draws
  );
}

/** Structure only; the cross-key checks against `progress` happen at restore. */
export function isRoundV1(v: Json): v is RowdyRoundV1 | null {
  if (v === null) return true;
  if (
    !isRecord(v) ||
    !isInt(v.roundId, 1) ||
    !isLevel(v.level) ||
    !isSide(v.starter) ||
    !isInt(v.sharpness, 0, 4)
  )
    return false;
  const { moves, aiRng } = v;
  if (!Array.isArray(aiRng) || aiRng.length !== 4 || !aiRng.every((n) => isInt(n, 0, 0xffffffff)))
    return false;
  if (!Array.isArray(moves) || moves.length > 42 || !moves.every((m) => isInt(m, 0, 6)))
    return false;
  return replay(moves as number[], v.starter).valid;
}

export type Result = 'win' | 'draw' | 'loss';
export interface Applied {
  progress: RowdyProgressV1;
  /** the streak that just ended (loss or forfeit), if any */
  ended: { streak: number; draws: number } | null;
  /** a new best streak for this level */
  newBest: boolean;
}

/** Applies a round's result once: only when `round.roundId === lastRoundId + 1`, else returns null. */
export function applyResult(
  p: RowdyProgressV1,
  round: RowdyRoundV1,
  result: Result,
): Applied | null {
  if (round.roundId !== p.lastRoundId + 1) return null;
  const rec = { ...p.records[round.level] };
  const next: RowdyProgressV1 = {
    ...p,
    nextStarter: round.starter === 'you' ? 'bot' : 'you',
    lastRoundId: round.roundId,
  };
  let ended: Applied['ended'] = null;
  let newBest = false;
  if (result === 'win') {
    next.streak = p.streak + 1;
    rec.wins++;
    newBest = next.streak > rec.bestStreak;
    rec.bestStreak = Math.max(rec.bestStreak, next.streak);
  } else if (result === 'draw') {
    rec.draws++;
    next.streakDraws = p.streakDraws + 1;
  } else {
    rec.losses++;
    ended = { streak: p.streak, draws: p.streakDraws };
    next.streak = 0;
    next.streakDraws = 0;
  }
  next.records = { ...p.records, [round.level]: rec };
  return { progress: next, ended, newBest };
}

/** "End streak" on the round card: banks the streak. */
export function endStreak(p: RowdyProgressV1): Applied {
  return {
    progress: { ...p, streak: 0, streakDraws: 0 },
    ended: { streak: p.streak, draws: p.streakDraws },
    newBest: false,
  };
}
