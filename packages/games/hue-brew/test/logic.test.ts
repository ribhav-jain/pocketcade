// The pure rules: the pour, corked bottles, mystery layers, the win test, the generator, the solver, hints, stars.
import { createRng } from '@pocketcade/toolkit';
import { describe, expect, it } from 'vitest';
import {
  CAP,
  MYSTERY_FROM,
  SPARE,
  addBottle,
  fitsLevel,
  hint,
  isComplete,
  isSolved,
  makeLevel,
  minPar,
  pour,
  pourCount,
  scramble,
  solve,
  stars,
  topRun,
  unpour,
  type Brew,
  type Move,
} from '../src/logic.ts';

const brewOf = (bottles: number[][], veil?: number[]): Brew => ({
  bottles,
  veil: veil ?? bottles.map(() => 0),
});

/** Plays moves from a state; throws if one is not allowed. */
function play(brew: Brew, moves: readonly Move[]): Brew {
  let state = brew;
  for (const m of moves) {
    const out = pour(state, m.from, m.to);
    if (!out) throw new Error(`illegal move ${m.from} -> ${m.to}`);
    state = out.brew;
  }
  return state;
}

describe('pouring', () => {
  it('moves the whole top run of one flavour into an empty bottle', () => {
    const out = pour(brewOf([[1, 2, 2], []]), 0, 1)!;
    expect(out.brew.bottles).toEqual([[1], [2, 2]]);
    expect(out.pour.n).toBe(2);
    expect(out.completed).toBe(false);
  });

  it('pours onto the same flavour and moves only as many layers as fit', () => {
    const out = pour(brewOf([[3, 1, 1, 1], [2, 2, 1], []]), 0, 1)!;
    expect(out.brew.bottles).toEqual([[3, 1, 1], [2, 2, 1, 1], []]);
    expect(out.pour.n).toBe(1);
  });

  it('refuses a different flavour, a full bottle, an empty source and the same bottle', () => {
    const brew = brewOf([[1, 2], [3], [4, 4, 5, 5], []]);
    expect(pour(brew, 0, 1)).toBeNull();
    expect(pour(brew, 0, 2)).toBeNull();
    expect(pour(brew, 3, 0)).toBeNull();
    expect(pour(brew, 0, 0)).toBeNull();
    expect(pour(brew, 0, 9)).toBeNull();
    expect(pourCount(brew, 0, 3)).toBe(1);
  });

  it('does not change the state it was given', () => {
    const brew = brewOf([[1, 2, 2], [2]]);
    pour(brew, 0, 1);
    expect(brew.bottles).toEqual([[1, 2, 2], [2]]);
  });

  it('corks a bottle that becomes full of one flavour, and a corked bottle cannot be poured from', () => {
    const out = pour(brewOf([[2, 1], [1, 1, 1], []]), 0, 1)!;
    expect(out.completed).toBe(true);
    expect(isComplete(out.brew.bottles[1]!)).toBe(true);
    expect(pour(out.brew, 1, 2)).toBeNull();
    expect(pourCount(out.brew, 1, 2)).toBe(0);
    // a full bottle of mixed flavours is not corked
    expect(pourCount(brewOf([[1, 1, 2, 2], []]), 0, 1)).toBe(2);
  });

  it('can be taken back exactly', () => {
    const brew = brewOf([[1, 2, 2], [3, 2], []], [1, 0, 0]);
    const out = pour(brew, 0, 1)!;
    expect(unpour(out.brew, out.pour)).toEqual(brew);
  });

  it('adds one empty bottle at the end of the shelf', () => {
    const brew = addBottle(
      brewOf([
        [1, 1],
        [1, 1],
      ]),
    );
    expect(brew.bottles).toEqual([[1, 1], [1, 1], []]);
    expect(brew.veil).toEqual([0, 0, 0]);
  });
});

describe('mystery layers', () => {
  it('stop the run: only layers that are showing pour', () => {
    const brew = brewOf([[1, 2, 2, 2], []], [2, 0]);
    expect(topRun(brew, 0)).toBe(2);
    const out = pour(brew, 0, 1)!;
    expect(out.brew.bottles).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  it('show the layer that comes to the top, and hide it again on undo', () => {
    const brew = brewOf([[1, 2, 3], []], [2, 0]);
    const out = pour(brew, 0, 1)!;
    expect(out.revealed).toBe(true);
    expect(out.brew.veil).toEqual([1, 0]);
    expect(unpour(out.brew, out.pour).veil).toEqual([2, 0]);
  });

  it('are all shown once their bottle is full of one flavour', () => {
    const out = pour(
      brewOf(
        [
          [2, 1],
          [1, 1, 1],
        ],
        [0, 2],
      ),
      0,
      1,
    )!;
    expect(out.completed).toBe(true);
    expect(out.brew.veil).toEqual([0, 0]);
  });
});

describe('the win test', () => {
  it('needs every bottle empty or full of one flavour', () => {
    expect(isSolved(brewOf([[1, 1, 1, 1], [], [2, 2, 2, 2]]))).toBe(true);
    expect(isSolved(brewOf([[1, 1, 1], [1], [2, 2, 2, 2]]))).toBe(false);
    expect(
      isSolved(
        brewOf([
          [1, 1, 2, 2],
          [2, 2, 1, 1],
        ]),
      ),
    ).toBe(false);
  });
});

describe('stars', () => {
  it('gives 3 at par or better, 2 within about a third more, otherwise 1', () => {
    expect(stars(8, 10)).toBe(3);
    expect(stars(10, 10)).toBe(3);
    expect(stars(11, 10)).toBe(2);
    expect(stars(13, 10)).toBe(2);
    expect(stars(14, 10)).toBe(1);
    expect(stars(52, 40)).toBe(2);
    expect(stars(53, 40)).toBe(1);
  });
});

describe('the solver', () => {
  it('returns no moves for a solved shelf and null for a dead end', () => {
    expect(solve(brewOf([[1, 1, 1, 1], []]))).toEqual([]);
    const stuck = brewOf([
      [1, 2, 1, 2],
      [2, 1, 2, 1],
    ]);
    expect(solve(stuck)).toBeNull();
    expect(hint(stuck)).toBeNull();
    expect(hint(brewOf([[1, 1, 1, 1], []]))).toBeNull();
  });

  it('solves a small shelf with real moves', () => {
    const brew = brewOf([[1, 2, 1, 2], [2, 1, 2, 1], [], []]);
    const moves = solve(brew)!;
    expect(isSolved(play(brew, moves))).toBe(true);
  });

  it('respects mystery layers', () => {
    const brew = brewOf([[1, 1, 2, 2], [2, 2, 1, 1], []], [3, 3, 0]);
    const moves = solve(brew)!;
    expect(isSolved(play(brew, moves))).toBe(true);
  });
});

describe('levels', () => {
  const levels = Array.from({ length: 80 }, (_, i) => makeLevel(i + 1));

  it('are the same every time and differ from each other', () => {
    for (const n of [1, 7, 15, 42, 80]) expect(makeLevel(n)).toEqual(levels[n - 1]);
    expect(levels[0]!.brew).not.toEqual(levels[1]!.brew);
    expect(levels[40]!.brew).not.toEqual(levels[41]!.brew);
  });

  it('hold four layers of every flavour and start with two empty bottles', () => {
    for (const lv of levels) {
      expect(lv.brew.bottles).toHaveLength(lv.flavours + SPARE);
      expect(lv.brew.bottles.filter((b) => b.length === 0)).toHaveLength(SPARE);
      expect(lv.brew.bottles.some(isComplete)).toBe(false);
      expect(fitsLevel(lv, lv.brew, false)).toBe(true);
      expect(isSolved(lv.brew)).toBe(false);
    }
  });

  it('can all be solved, in no fewer moves than the minimum for their size', () => {
    for (const lv of levels) {
      const moves = solve(lv.brew);
      expect(moves, `level ${lv.level}`).not.toBeNull();
      expect(isSolved(play(lv.brew, moves!))).toBe(true);
      expect(lv.par).toBe(moves!.length);
      expect(lv.par).toBeGreaterThanOrEqual(minPar(lv.flavours));
    }
  });

  it('start with 3 flavours and grow to 12 by level 60', () => {
    expect(levels.slice(0, 3).map((l) => l.flavours)).toEqual([3, 3, 3]);
    for (let i = 1; i < 60; i++) {
      const step = levels[i]!.flavours - levels[i - 1]!.flavours;
      expect(step === 0 || step === 1).toBe(true);
    }
    expect(levels[59]!.flavours).toBe(12);
    for (const lv of levels.slice(60)) {
      expect(lv.flavours).toBeGreaterThanOrEqual(9);
      expect(lv.flavours).toBeLessThanOrEqual(12);
    }
  });

  it(`keep mystery layers for level ${MYSTERY_FROM} onwards, and only some levels`, () => {
    for (const lv of levels.slice(0, MYSTERY_FROM - 1)) expect(lv.mystery).toBe(false);
    expect(levels[MYSTERY_FROM - 1]!.mystery).toBe(true);
    const later = levels.slice(MYSTERY_FROM).filter((l) => l.mystery).length;
    expect(later).toBeGreaterThan(3);
    expect(later).toBeLessThan(40);
    for (const lv of levels)
      lv.brew.veil.forEach((v, i) => {
        // the top layer of a bottle always shows
        expect(v).toBeLessThanOrEqual(Math.max(0, lv.brew.bottles[i]!.length - 1));
      });
  });

  it('are quick to make', () => {
    const start = performance.now();
    for (let n = 200; n < 240; n++) makeLevel(n);
    expect((performance.now() - start) / 40).toBeLessThan(50);
  });

  it('give hints that are always legal and lead to a solution', () => {
    for (const lv of levels.filter((l) => l.level % 3 === 1)) {
      let state = lv.brew;
      let steps = 0;
      while (!isSolved(state)) {
        const move = hint(state);
        expect(move, `level ${lv.level} after ${steps} hints`).not.toBeNull();
        const out = pour(state, move!.from, move!.to);
        expect(out, `level ${lv.level}: hint ${move!.from} -> ${move!.to}`).not.toBeNull();
        state = out!.brew;
        expect(++steps).toBeLessThanOrEqual(lv.par * 2);
      }
    }
  });

  it('still give a hint after a detour and with the extra bottle', () => {
    const lv = levels[19]!;
    const first = hint(lv.brew)!;
    // any other legal move, then ask again
    let detour: Brew | null = null;
    for (let from = 0; from < lv.brew.bottles.length && !detour; from++)
      for (let to = 0; to < lv.brew.bottles.length && !detour; to++)
        if ((from !== first.from || to !== first.to) && pourCount(lv.brew, from, to) > 0)
          detour = pour(lv.brew, from, to)!.brew;
    const withExtra = addBottle(detour!);
    const moves = solve(withExtra)!;
    expect(isSolved(play(withExtra, moves))).toBe(true);
    expect(fitsLevel(lv, withExtra, true)).toBe(true);
    expect(fitsLevel(lv, withExtra, false)).toBe(false);
  });
});

describe('the fallback scramble', () => {
  it('always makes a level that can be solved', () => {
    for (const flavours of [3, 6, 9, 12]) {
      const lv = scramble(1, flavours, createRng(`scramble:${flavours}`));
      const layers = lv.brew.bottles.flat();
      expect(layers).toHaveLength(flavours * CAP);
      expect(isSolved(play(lv.brew, solve(lv.brew)!))).toBe(true);
    }
  });
});

describe('a saved state', () => {
  it('fits its level only with the right layers', () => {
    const lv = makeLevel(5);
    const moved = pour(lv.brew, 0, lv.flavours)!.brew;
    expect(fitsLevel(lv, moved, false)).toBe(true);
    const wrong = { bottles: moved.bottles.map((b) => b.slice()), veil: moved.veil.slice() };
    wrong.bottles[0]![0] = wrong.bottles[0]![0] === 1 ? 2 : 1;
    expect(fitsLevel(lv, wrong, false)).toBe(false);
    expect(fitsLevel(makeLevel(11), moved, false)).toBe(false);
  });
});
