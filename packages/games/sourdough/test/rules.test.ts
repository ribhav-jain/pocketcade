// @vitest-environment node
// Rules checks: the deal, moves and auto-flip, Draw 3 and recycle, move tokens and replay, tap-to-move, hints,
// auto-finish, the save guard and stats, and the attract seed.
import { readFileSync } from 'node:fs';
import { createRng } from '@pocketcade/toolkit';
import { describe, expect, it } from 'vitest';
import { ATTRACT_SEED, attractTarget } from '../src/attract.ts';
import {
  apply,
  banked,
  decode,
  deckHelps,
  encode,
  finishMoves,
  isWon,
  layoutDeal,
  legal,
  replay,
  shuffled,
  STOCK,
  TAB0,
  tapMove,
  WASTE,
  type Move,
  type State,
} from '../src/klondike.ts';
import {
  freshStats,
  isGameV1,
  isStatsV1,
  withAbandon,
  withPlayed,
  withWin,
  type SolGameV1,
} from '../src/save.ts';

const CLAIM = '3f9a0c21b7d45e88';
const card = (rank: number, suit: number) => suit * 13 + rank - 1;
/** An empty table with the given piles. */
function table(
  piles: Record<number, number[]>,
  faceDown: number[] = [0, 0, 0, 0, 0, 0, 0],
  draw: 1 | 3 = 1,
): State {
  return { piles: Array.from({ length: 13 }, (_, i) => [...(piles[i] ?? [])]), faceDown, draw };
}

describe('deal', () => {
  it('is a seeded permutation laid out 1–7 with the top cards up and 24 in the deck', () => {
    const deck = shuffled(CLAIM);
    expect([...deck].sort((a, b) => a - b)).toEqual(Array.from({ length: 52 }, (_, i) => i));
    expect(shuffled(CLAIM)).toEqual(deck);
    expect(shuffled('0000000000000001')).not.toEqual(deck);
    const s = layoutDeal(deck, 1);
    expect(s.piles.slice(TAB0).map((p) => p.length)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(s.faceDown).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(s.piles[STOCK]).toEqual(deck.slice(28));
    expect(s.piles[TAB0 + 1]).toEqual([deck[1], deck[7]]); // row by row
  });
});

describe('moves', () => {
  it('flips the newly exposed card as part of the move; runs move whole', () => {
    // T1: [K♠ down, 7♥ up]; T2: [8♣ up]. 7♥ onto 8♣ flips K♠.
    const s = table(
      { [TAB0]: [card(13, 0), card(7, 1)], [TAB0 + 1]: [card(8, 3)] },
      [1, 0, 0, 0, 0, 0, 0],
    );
    const m: Move = { type: 'move', from: TAB0, to: TAB0 + 1, count: 1 };
    expect(legal(s, m)).toBe(true);
    expect(apply(s, m)).toEqual({ flip: true, count: 1 });
    expect(s.faceDown[0]).toBe(0);
    // the 8♣–7♥ run moves together onto a red 9; K♠ cannot go onto a non-empty column
    s.piles[TAB0 + 2] = [card(9, 2)];
    expect(legal(s, { type: 'move', from: TAB0 + 1, to: TAB0 + 2, count: 2 })).toBe(true);
    expect(legal(s, { type: 'move', from: TAB0, to: TAB0 + 2, count: 1 })).toBe(false);
    expect(legal(s, { type: 'move', from: TAB0, to: TAB0 + 3, count: 1 })).toBe(true); // King to an empty column
  });

  it('Draw 3 draws one at a time; recycle preserves order', () => {
    const s = table({ [STOCK]: [1, 2, 3, 4, 5] }, undefined, 3);
    apply(s, { type: 'draw' });
    expect(s.piles[WASTE]).toEqual([5, 4, 3]);
    apply(s, { type: 'draw' });
    expect(s.piles[WASTE]).toEqual([5, 4, 3, 2, 1]);
    expect(legal(s, { type: 'draw' })).toBe(false);
    apply(s, { type: 'recycle' });
    expect(s.piles[STOCK]).toEqual([1, 2, 3, 4, 5]);
  });

  it('tokens are 3 chars and replay reproduces the state; a wrong flip bit is rejected', () => {
    const start = layoutDeal(shuffled(CLAIM), 1);
    const s = structuredClone(start);
    let log = '';
    for (let i = 0; i < 60; i++) {
      const t = attractTarget(s);
      const m = tapMove(s, t.pile, t.index);
      if (!m) break;
      const r = apply(s, m);
      const token = encode(m, r);
      expect(token).toHaveLength(3);
      expect(decode(token)?.flip).toBe(r.flip);
      log += token;
    }
    expect(replay(start, log)).toEqual(s);
    expect(
      encode({ type: 'move', from: 12, to: 12, count: 13 }, { flip: true, count: 13 }),
    ).toHaveLength(3);
    const flipIdx = [...Array(log.length / 3).keys()].find(
      (i) => decode(log.slice(i * 3, i * 3 + 3))!.flip,
    );
    if (flipIdx !== undefined) {
      const bad = (parseInt(log.slice(flipIdx * 3, flipIdx * 3 + 3), 36) ^ (1 << 14))
        .toString(36)
        .padStart(3, '0');
      expect(
        replay(start, log.slice(0, flipIdx * 3) + bad + log.slice(flipIdx * 3 + 3)),
      ).toBeNull();
    }
  });

  it('tap-to-move prefers a vault, then a built column, then an empty one', () => {
    const s = table({
      [WASTE]: [card(1, 1)],
      [TAB0]: [card(13, 0)],
      [TAB0 + 2]: [card(6, 0)],
      [TAB0 + 3]: [card(5, 2)],
    });
    expect(tapMove(s, WASTE, 0)).toEqual({ type: 'move', from: WASTE, to: 2, count: 1 });
    expect(tapMove(s, TAB0 + 3, 0)).toEqual({
      type: 'move',
      from: TAB0 + 3,
      to: TAB0 + 2,
      count: 1,
    });
    expect(tapMove(s, TAB0, 0)).toBeNull(); // a King already at the bottom has nowhere better to go
    expect(tapMove(s, STOCK, 0)).toEqual({ type: 'recycle' });
  });

  it('the deck counts as a hint only if drawing reaches a playable card', () => {
    // 2♠ on the A♠ vault is playable once drawn; with Draw 3 it is only reachable if it lands on top of a group
    expect(deckHelps(table({ [STOCK]: [card(2, 0), card(9, 1)], [2]: [card(1, 0)] }))).toBe(true);
    expect(deckHelps(table({ [STOCK]: [card(9, 1), card(5, 3)], [2]: [card(1, 0)] }))).toBe(false);
    const three = { [STOCK]: [card(2, 0), card(9, 1), card(5, 3)], [2]: [card(1, 0)] };
    expect(deckHelps(table(three, undefined, 3))).toBe(true);
    expect(
      deckHelps(table({ ...three, [STOCK]: [card(9, 1), card(2, 0), card(5, 3)] }, undefined, 3)),
    ).toBe(false);
  });

  it('auto-finish banks everything once nothing is face-down', () => {
    const piles: Record<number, number[]> = {};
    for (let suit = 0; suit < 4; suit++)
      piles[TAB0 + suit] = Array.from({ length: 13 }, (_, i) => card(13 - i, suit));
    const s = table(piles);
    const moves = finishMoves(s)!;
    expect(moves).toHaveLength(52);
    for (const m of moves) apply(s, m);
    expect(isWon(s)).toBe(true);
    expect(finishMoves(table({ [TAB0]: [1] }, [1, 0, 0, 0, 0, 0, 0]))).toBeNull();
  });
});

describe('save', () => {
  const game = (log = ''): SolGameV1 => ({
    rules: 1,
    claim: CLAIM,
    draw: 1,
    deal: shuffled(CLAIM),
    snapshot: null,
    log,
    moves: 0,
    undos: 0,
    hints: 0,
    elapsedMs: 0,
    counted: false,
  });
  it('validates by replaying the log', () => {
    expect(isGameV1(game())).toBe(true);
    expect(isGameV1(game('000'))).toBe(false); // a draw token claiming 0 cards
    expect(isGameV1({ ...game(), deal: [...shuffled(CLAIM).slice(1), 0] })).toBe(false);
    const read = (f: string) =>
      JSON.parse(readFileSync(new URL(`./fixtures/save/${f}`, import.meta.url), 'utf8'));
    expect(isGameV1(read('game.v1.json'))).toBe(true);
    expect(isStatsV1(read('stats.v1.json'))).toBe(true);
  });

  it('stats: played on the first action, a win updates bests and streaks, an abandon resets the streak', () => {
    let s = withPlayed(freshStats(), 3);
    s = withWin(s, 3, 300_000, 140);
    s = withWin(s, 3, 280_000, 150);
    expect(s.d3).toEqual({
      played: 1,
      won: 2,
      bestMs: 280_000,
      bestMoves: 140,
      streak: 2,
      bestStreak: 2,
    });
    expect(withAbandon(s, 3).d3.streak).toBe(0);
    expect(s.totalWins).toBe(2);
  });
});

describe('attract', () => {
  it('the clip shows a run move, a flip and a banked card; the still shows ≥ 3 banked', () => {
    const main = createRng(ATTRACT_SEED);
    const claim = [main.nextUint32(), main.nextUint32()]
      .map((x) => x.toString(16).padStart(8, '0'))
      .join('');
    const s = layoutDeal(shuffled(claim), 1);
    let run = false;
    let flip = false;
    let bankedInClip = 0;
    for (let k = 0; k <= 16; k++) {
      const t = attractTarget(s);
      const m = tapMove(s, t.pile, t.index);
      if (!m) continue;
      const r = apply(s, m);
      if (k <= 7) {
        run ||= m.type === 'move' && m.count >= 2;
        flip ||= r.flip;
        bankedInClip = banked(s);
      }
    }
    expect({ run, flip, bankedInClip: bankedInClip >= 1, still: banked(s) >= 3 }).toEqual({
      run: true,
      flip: true,
      bankedInClip: true,
      still: true,
    });
  });
});
