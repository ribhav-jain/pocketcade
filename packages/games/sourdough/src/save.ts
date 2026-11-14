// Saves: the in-progress claim as a move log, per-mode stats and prefs.
import type { Json } from '@pocketcade/sdk';
import { isCount, isInt, isRecord } from '@pocketcade/toolkit';
import { layoutDeal, PILES, replay, TAB0, type State } from './klondike.ts';

type SolSnapshotV1 = { piles: number[][]; faceDown: number[] };
export type SolGameV1 = {
  rules: 1;
  claim: string;
  draw: 1 | 3;
  deal: number[];
  snapshot: SolSnapshotV1 | null;
  log: string;
  moves: number;
  undos: number;
  hints: number;
  elapsedMs: number;
  counted: boolean;
};
type SolModeStatsV1 = {
  played: number;
  won: number;
  bestMs: number | null;
  bestMoves: number | null;
  streak: number;
  bestStreak: number;
};
export type SolStatsV1 = { totalWins: number; d1: SolModeStatsV1; d3: SolModeStatsV1 };
export type SolPrefsV1 = { draw: 1 | 3 };

const mode = (): SolModeStatsV1 => ({
  played: 0,
  won: 0,
  bestMs: null,
  bestMoves: null,
  streak: 0,
  bestStreak: 0,
});
export const freshStats = (): SolStatsV1 => ({ totalWins: 0, d1: mode(), d3: mode() });
export const freshPrefs = (): SolPrefsV1 => ({ draw: 1 });
/** Log length (tokens) that triggers folding the oldest 1,000 into the snapshot. */
export const TRIM_AT = 11_000;
export const TRIM_BY = 1_000;

const isDraw = (v: unknown): v is 1 | 3 => v === 1 || v === 3;

/** The state at the start of the saved log: the snapshot, or the opening deal (shared arrays; replay() copies). */
export function startOf(g: Pick<SolGameV1, 'deal' | 'draw' | 'snapshot'>): State {
  return g.snapshot ? { ...g.snapshot, draw: g.draw } : layoutDeal(g.deal, g.draw);
}

export function isGameV1(v: Json): v is SolGameV1 | null {
  if (v === null) return true;
  if (
    !isRecord(v) ||
    v.rules !== 1 ||
    typeof v.claim !== 'string' ||
    !/^[0-9a-f]{16}$/.test(v.claim) ||
    !isDraw(v.draw)
  )
    return false;
  const deal = v.deal;
  if (
    !Array.isArray(deal) ||
    deal.length !== 52 ||
    new Set(deal).size !== 52 ||
    !deal.every((c) => isInt(c, 0, 51))
  )
    return false;
  if (
    ![v.moves, v.undos, v.hints, v.elapsedMs].every(isCount) ||
    typeof v.counted !== 'boolean' ||
    typeof v.log !== 'string'
  )
    return false;
  const snap = v.snapshot;
  if (snap !== null) {
    if (
      !isRecord(snap) ||
      !Array.isArray(snap.piles) ||
      snap.piles.length !== PILES ||
      !Array.isArray(snap.faceDown) ||
      snap.faceDown.length !== 7
    )
      return false;
    const cards = (snap.piles as unknown[]).flat();
    if (
      !(snap.piles as unknown[]).every(Array.isArray) ||
      cards.length !== 52 ||
      new Set(cards).size !== 52 ||
      !cards.every((c) => isInt(c, 0, 51))
    )
      return false;
    if (
      !(snap.faceDown as unknown[]).every((n, i) =>
        isInt(n, 0, Math.max(0, (snap.piles as number[][])[TAB0 + i]!.length - 1)),
      )
    )
      return false;
  }
  return replay(startOf(v as SolGameV1), v.log) !== null;
}

const isMode = (v: unknown): v is SolModeStatsV1 =>
  isRecord(v) &&
  [v.played, v.won, v.streak, v.bestStreak].every(isCount) &&
  (v.bestMs === null || isCount(v.bestMs)) &&
  (v.bestMoves === null || isCount(v.bestMoves));
export const isStatsV1 = (v: Json): v is SolStatsV1 =>
  isRecord(v) && isCount(v.totalWins) && isMode(v.d1) && isMode(v.d3);
export const isPrefsV1 = (v: Json): v is SolPrefsV1 => isRecord(v) && isDraw(v.draw);

const key = (draw: 1 | 3): 'd1' | 'd3' => (draw === 1 ? 'd1' : 'd3');
const add = (a: number, b: number) => Math.min(Number.MAX_SAFE_INTEGER, a + b);

/** First action of a claim. */
export const withPlayed = (s: SolStatsV1, draw: 1 | 3): SolStatsV1 => ({
  ...s,
  [key(draw)]: { ...s[key(draw)], played: add(s[key(draw)].played, 1) },
});

export function withWin(s: SolStatsV1, draw: 1 | 3, ms: number, moves: number): SolStatsV1 {
  const m = s[key(draw)];
  const streak = m.streak + 1;
  return {
    ...s,
    totalWins: add(s.totalWins, 1),
    [key(draw)]: {
      ...m,
      won: add(m.won, 1),
      streak,
      bestStreak: Math.max(m.bestStreak, streak),
      bestMs: m.bestMs === null ? ms : Math.min(m.bestMs, ms),
      bestMoves: m.bestMoves === null ? moves : Math.min(m.bestMoves, moves),
    },
  };
}

/** New claim, Restart or Replay while the claim was counted and not won. */
export const withAbandon = (s: SolStatsV1, draw: 1 | 3): SolStatsV1 => ({
  ...s,
  [key(draw)]: { ...s[key(draw)], streak: 0 },
});
