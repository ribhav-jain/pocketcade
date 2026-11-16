// The pure rules: shapes, the fit test, line clears, scoring, dealing, game over and the demo's greedy policy.
import { createRng } from '@pocketcade/toolkit';
import { describe, expect, it } from 'vitest';
import {
  CELLS,
  COLOURS,
  HAND,
  POINTS,
  SHAPES,
  SIZE,
  bestMove,
  canPlaceAny,
  deal,
  fits,
  fitsAnywhere,
  gainFor,
  lineBonus,
  linesAfter,
  newGame,
  place,
  type GameState,
  type Piece,
} from '../src/logic.ts';

const shapeOf = (rows: string[]): number => {
  const key = rows.join('/');
  const index = SHAPES.findIndex((s) => {
    const grid = Array.from({ length: s.h }, () => new Array<string>(s.w).fill('.'));
    for (const [c, r] of s.cells) grid[r]![c] = '#';
    return grid.map((line) => line.join('')).join('/') === key;
  });
  if (index < 0) throw new Error(`no shape ${key}`);
  return index;
};
const DOT = shapeOf(['#']);
const BAR2 = shapeOf(['##']);
const BAR3 = shapeOf(['###']);
const BAR3_UP = shapeOf(['#', '#', '#']);
const SQUARE2 = shapeOf(['##', '##']);
const SQUARE3 = shapeOf(['###', '###', '###']);

/** A board from 8 strings: '.' empty, a digit is that colour. */
const boardOf = (rows: string[]): number[] =>
  rows.flatMap((row) => [...row].map((ch) => (ch === '.' ? 0 : Number(ch))));
const EMPTY = Array.from({ length: SIZE }, () => '.'.repeat(SIZE));

function stateOf(rows: string[], hand: (Piece | null)[], extra: Partial<GameState> = {}) {
  const rng = createRng('test');
  const state: GameState = {
    board: boardOf(rows),
    hand,
    score: 0,
    streak: 0,
    placed: 0,
    lines: 0,
    rng: rng.state(),
    ...extra,
  };
  return { state, rng };
}
const piece = (shape: number, colour = 1): Piece => ({ shape, colour });

describe('shapes', () => {
  it('are 35 distinct fixed orientations of 1 to 9 squares, packed to their top-left corner', () => {
    expect(SHAPES).toHaveLength(35);
    const seen = new Set<string>();
    for (const s of SHAPES) {
      expect(s.cells.length).toBeGreaterThanOrEqual(1);
      expect(s.cells.length).toBeLessThanOrEqual(9);
      expect(s.cells.every(([c, r]) => c >= 0 && c < s.w && r >= 0 && r < s.h)).toBe(true);
      expect(s.cells.some(([c]) => c === 0) && s.cells.some(([, r]) => r === 0)).toBe(true);
      seen.add(`${s.w}x${s.h}:${s.cells.map((c) => c.join(',')).join(';')}`);
    }
    expect(seen.size).toBe(SHAPES.length);
  });
});

describe('fits', () => {
  const board = boardOf(['........', '..11....', ...EMPTY.slice(2)]);

  it('needs every square on the quilt and empty', () => {
    const bar = SHAPES[BAR3]!;
    expect(fits(board, bar, 0, 0)).toBe(true);
    expect(fits(board, bar, 5, 7)).toBe(true);
    expect(fits(board, bar, 6, 0)).toBe(false);
    expect(fits(board, bar, -1, 0)).toBe(false);
    expect(fits(board, bar, 1, 1)).toBe(false);
    expect(fits(board, SHAPES[BAR3_UP]!, 2, 0)).toBe(false);
  });

  it('fitsAnywhere finds the last hole', () => {
    const tight = boardOf(
      Array.from({ length: SIZE }, (_, r) => (r === 4 ? '111.1111' : '1111111.')),
    );
    expect(fitsAnywhere(tight, SHAPES[DOT]!)).toBe(true);
    expect(fitsAnywhere(tight, SHAPES[BAR2]!)).toBe(false);
  });
});

describe('placing and stitching', () => {
  it('scores a square per cell and leaves the board alone when no line fills', () => {
    const { state, rng } = stateOf(EMPTY, [piece(SQUARE2, 3), piece(DOT), piece(DOT)]);
    const out = place(state, 0, 2, 5, rng)!;
    expect(out.rows).toEqual([]);
    expect(out.cols).toEqual([]);
    expect(out.gain.total).toBe(4);
    expect(out.placed.sort((a, b) => a - b)).toEqual([42, 43, 50, 51]);
    expect(out.next.board.filter((c) => c === 3)).toHaveLength(4);
    expect(out.next.hand).toEqual([null, piece(DOT), piece(DOT)]);
    expect(out.next.streak).toBe(0);
    expect(out.dealt).toBe(false);
    expect(state.board.every((c) => c === 0)).toBe(true); // the input is not mutated
  });

  it('clears a full row, keeps the rest and reports the colours that went', () => {
    const rows = [...EMPTY.slice(0, 6), '22222...', '..4.....'];
    const { state, rng } = stateOf(rows, [piece(BAR3, 5), piece(DOT), null]);
    expect(linesAfter(state.board, SHAPES[BAR3]!, 5, 6)).toEqual({ rows: [6], cols: [] });
    const out = place(state, 0, 5, 6, rng)!;
    expect(out.rows).toEqual([6]);
    expect(out.cleared).toHaveLength(SIZE);
    expect(out.cleared.filter((c) => c.colour === 5)).toHaveLength(3);
    expect(out.next.board.slice(48, 56).every((c) => c === 0)).toBe(true);
    expect(out.next.board[58]).toBe(4);
    expect(out.gain).toMatchObject({ cells: 3, clear: 10, multiplier: 1, total: 13 });
    expect(out.next.streak).toBe(1);
    expect(out.next.lines).toBe(1);
  });

  it('a row and a column at once share their corner and score the two-line bonus', () => {
    const rows = ['1111111.', ...Array.from({ length: 7 }, () => '.......1')];
    const { state, rng } = stateOf(rows, [piece(DOT, 2), piece(DOT), null]);
    const out = place(state, 0, 7, 0, rng)!;
    expect(out.rows).toEqual([0]);
    expect(out.cols).toEqual([7]);
    expect(out.cleared).toHaveLength(15);
    expect(out.gain.clear).toBe(lineBonus(2));
    expect(out.clean).toBe(true);
    expect(out.gain.total).toBe(1 + 30 + POINTS.cleanQuilt);
  });

  it('multiplies the line bonus on back-to-back stitches and resets after a miss', () => {
    const rows = [...EMPTY.slice(0, 5), '1111111.', '1111111.', '.......1'];
    const { state, rng } = stateOf(rows, [piece(DOT), piece(DOT), piece(DOT)]);
    const first = place(state, 0, 7, 5, rng)!;
    expect(first.gain).toMatchObject({ multiplier: 1, clear: 10 });
    const second = place(first.next, 1, 7, 6, rng)!;
    expect(second.gain).toMatchObject({ multiplier: 2, clear: 20 });
    expect(second.next.streak).toBe(2);
    const third = place(second.next, 2, 0, 0, rng)!;
    expect(third.gain.clear).toBe(0);
    expect(third.next.streak).toBe(0);
  });

  it('caps the streak multiplier and grows the bonus with lines at once', () => {
    expect([1, 2, 3, 4].map(lineBonus)).toEqual([10, 30, 60, 100]);
    expect(gainFor(4, 1, 99, false).multiplier).toBe(POINTS.maxStreak);
    expect(gainFor(4, 0, 0, false)).toMatchObject({ clear: 0, total: 4 });
  });

  it('refuses an empty slot, an overlap and a spot off the quilt', () => {
    const { state, rng } = stateOf(['1.......', ...EMPTY.slice(1)], [piece(BAR2), null, null]);
    expect(place(state, 1, 3, 3, rng)).toBeNull();
    expect(place(state, 0, 0, 0, rng)).toBeNull();
    expect(place(state, 0, 7, 0, rng)).toBeNull();
  });

  it('deals three new patches only when the last one is used', () => {
    const { state, rng } = stateOf(EMPTY, [piece(DOT), piece(DOT), piece(DOT)]);
    const a = place(state, 0, 0, 0, rng)!;
    const b = place(a.next, 2, 2, 0, rng)!;
    expect(b.dealt).toBe(false);
    const c = place(b.next, 1, 4, 0, rng)!;
    expect(c.dealt).toBe(true);
    expect(c.next.hand.every((p) => p !== null)).toBe(true);
    expect(c.next.rng).toEqual(rng.state());
    expect(c.next.placed).toBe(3);
  });
});

describe('game over', () => {
  const tight = Array.from({ length: SIZE }, (_, r) => (r === 4 ? '111.1111' : '1111111.'));

  it('ends when no waiting patch fits, not before', () => {
    const board = boardOf(tight);
    expect(canPlaceAny(board, [piece(SQUARE2), null, piece(BAR2)])).toBe(false);
    expect(canPlaceAny(board, [piece(SQUARE2), null, piece(DOT)])).toBe(true);
    // a 3 × 3 hole in the corner, one hole in every other row and column
    const rows = [
      '11111...',
      '11111...',
      '11111...',
      '.1111111',
      '1.111111',
      '11.11111',
      '111.1111',
      '1111.111',
    ];
    const { state, rng } = stateOf(rows, [piece(SQUARE3), piece(SQUARE3), null]);
    const out = place(state, 0, 5, 0, rng)!;
    expect(out.rows.length + out.cols.length).toBe(6);
    expect(out.over).toBe(false); // the stitches made room for the second square
    const { state: s2, rng: r2 } = stateOf(rows, [piece(DOT), piece(SQUARE3), null]);
    expect(place(s2, 0, 5, 0, r2)!.over).toBe(true);
  });
});

describe('dealing', () => {
  it('is deterministic for a seed', () => {
    const a = newGame(createRng('seed-a'));
    const b = newGame(createRng('seed-a'));
    const c = newGame(createRng('seed-b'));
    expect(a).toEqual(b);
    expect(a.hand).not.toEqual(c.hand);
    expect(a.board).toHaveLength(CELLS);
  });

  it('always includes a patch that fits and uses three different colours', () => {
    const rng = createRng('deal');
    for (let n = 0; n < 300; n++) {
      // a random quilt with at least one hole, from nearly empty to nearly full
      const density = rng.next();
      const board = Array.from({ length: CELLS }, () => (rng.chance(density) ? 1 : 0));
      board[rng.int(0, CELLS - 1)] = 0;
      const hand = deal(board, rng.int(0, 9000), rng);
      expect(hand).toHaveLength(HAND);
      expect(canPlaceAny(board, hand)).toBe(true);
      expect(new Set(hand.map((p) => p.colour)).size).toBe(HAND);
      for (const p of hand) {
        expect(p.colour).toBeGreaterThanOrEqual(1);
        expect(p.colour).toBeLessThanOrEqual(COLOURS);
      }
    }
  });

  it('deals smaller patches on a crowded quilt', () => {
    const size = (board: number[]) => {
      const rng = createRng('sizes');
      let squares = 0;
      for (let n = 0; n < 200; n++)
        for (const p of deal(board, 0, rng)) squares += SHAPES[p.shape]!.cells.length;
      return squares / 600;
    };
    const open = new Array<number>(CELLS).fill(0);
    // a checkerboard of 2 × 2 blocks: every shape still has room, but the quilt is half full
    const crowded = open.map((_, i) => ((i >> 1) + (i >> 4)) % 2);
    expect(size(crowded)).toBeLessThan(size(open) - 0.3);
  });
});

describe('greedy demo policy', () => {
  it('takes the stitch when there is one', () => {
    const rows = [...EMPTY.slice(0, 7), '11111...'];
    const { state } = stateOf(rows, [piece(SQUARE2), piece(BAR3), piece(DOT)]);
    expect(bestMove(state)).toEqual({ slot: 1, col: 5, row: 7 });
  });

  it('returns null when nothing fits', () => {
    const { state } = stateOf(
      Array.from({ length: SIZE }, () => '1.1.1.1.'),
      [piece(BAR2), null, null],
    );
    expect(bestMove(state)).toBeNull();
  });

  it('plays whole games legally: no full line survives and the score only grows', () => {
    for (const seed of ['g1', 'g2', 'g3']) {
      const rng = createRng(seed);
      let state = newGame(rng);
      for (let n = 0; n < 400; n++) {
        const move = bestMove(state);
        if (!move) break;
        const out = place(state, move.slot, move.col, move.row, rng)!;
        expect(out.next.score).toBeGreaterThan(state.score);
        state = out.next;
        for (let i = 0; i < SIZE; i++) {
          const row = state.board.slice(i * SIZE, i * SIZE + SIZE);
          const col = state.board.filter((_, k) => k % SIZE === i);
          expect(row.includes(0) && col.includes(0)).toBe(true);
        }
        if (out.over) {
          expect(bestMove(state)).toBeNull();
          break;
        }
      }
      expect(state.placed).toBeGreaterThan(20);
    }
  });
});
