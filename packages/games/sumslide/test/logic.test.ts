// The rules: sliding and merging, scoring and goals, the Echo, undo, game over and the saved run.
import { createRng } from '@pocketcade/toolkit';
import { describe, expect, it } from 'vitest';
import {
  ECHO,
  ECHO_CHARGE_MAX,
  applyMove,
  attractPolicy,
  canMove,
  goalLevel,
  goalProgress,
  labelOf,
  newRun,
  slide,
  undosAfterUndo,
  valueOf,
  type Dir,
} from '../src/logic.ts';
import { isRun, type RunSnapshot } from '../src/save.ts';

const E = 'E';
type V = number | typeof E | null;
/** value → cell code */
const code = (v: V): number => (v === null ? 0 : v === E ? ECHO : Math.log2(v / 5) + 1);
const LINE_INDICES: Record<Dir, number[]> = {
  left: [0, 1, 2, 3],
  right: [3, 2, 1, 0],
  up: [0, 4, 8, 12],
  down: [12, 8, 4, 0],
};

/** Places a line (listed from the leading edge) on an otherwise empty board. */
function board(line: V[], dir: Dir): number[] {
  const cells = new Array<number>(16).fill(0);
  line.forEach((v, i) => (cells[LINE_INDICES[dir][i]!] = code(v)));
  return cells;
}

function snapshot(cells: number[], extra: Partial<RunSnapshot> = {}): RunSnapshot {
  return {
    cells,
    score: 0,
    moves: 0,
    maxLevel: Math.max(1, ...cells),
    echoCharge: 0,
    echoes: 0,
    rung: 0,
    rng: [1, 2, 3, 4],
    ...extra,
  };
}

const LINES: Array<[name: string, before: V[], after: V[], points: number | 'blocked']> = [
  ['a pair merges', [5, 5, null, null], [10, null, null, null], 10],
  ['three equal: the leading pair merges', [5, 5, 5, null], [10, 5, null, null], 10],
  ['four equal: two merges', [5, 5, 5, 5], [10, 10, null, null], 20],
  ['a merged tile does not merge again', [10, 5, 5, null], [10, 10, null, null], 10],
  ['a pair merges across a gap', [null, 5, null, 5], [10, null, null, null], 10],
  ['a leading Echo takes the first tile', [E, 5, 5, null], [10, 5, null, null], 10],
  ['an Echo between tiles joins the leading one', [5, E, 5, null], [10, 5, null, null], 10],
  ['an Echo doubles a big tile', [E, 160, null, null], [320, null, null, null], 320],
  ['nothing to do', [40, 20, 10, 5], [40, 20, 10, 5], 'blocked'],
  ['a lone Echo just slides', [null, E, null, null], [E, null, null, null], 0],
];

describe('slide()', () => {
  for (const dir of ['left', 'right', 'up', 'down'] as const) {
    it.each(LINES)(`%s (${dir})`, (_name, before, after, points) => {
      const r = slide(board(before, dir), dir);
      expect(r.cells).toEqual(board(after, dir));
      expect(r.moved).toBe(points !== 'blocked');
      const scored = r.merges.reduce((s, m) => s + valueOf(m.level), 0);
      expect(scored).toBe(points === 'blocked' ? 0 : points);
    });
  }

  it('reports where each moving tile ends up and where merges happen', () => {
    const r = slide(board([null, 5, null, 5], 'left'), 'left');
    expect(r.tracks).toEqual([
      { from: 1, to: 0, merged: true },
      { from: 3, to: 0, merged: true },
    ]);
    expect(r.merges).toEqual([{ at: 0, level: 2, echo: false }]);
  });
});

describe('applyMove()', () => {
  it('a blocked move changes nothing, not even the RNG', () => {
    const state = snapshot(board([40, 20, 10, 5], 'left'));
    const rng = createRng('blocked');
    const before = rng.state();
    const out = applyMove(state, 'left', rng);
    expect(out.moved).toBe(false);
    expect(out.next).toBe(state);
    expect(rng.state()).toEqual(before);
  });

  it('scores each merge and pays a goal bonus only the first time the goal is reached', () => {
    // 160 + 160 and 5 + 5 in one move, with the 80 and 160 goals already reached
    const cells = new Array<number>(16).fill(0);
    cells[0] = code(160);
    cells[1] = code(160);
    cells[4] = code(5);
    cells[5] = code(5);
    cells[15] = code(40);
    const out = applyMove(snapshot(cells, { rung: 2, score: 1000 }), 'left', createRng('goal'));
    expect(out.gained).toBe(320 + 10 + 320);
    expect(out.goals).toEqual([code(320)]);
    expect(out.next).toMatchObject({ rung: 3, score: 1650, moves: 1 });

    const again = new Array<number>(16).fill(0);
    again[0] = code(160);
    again[1] = code(160);
    const later = applyMove(snapshot(again, { maxLevel: 7, rung: 3 }), 'left', createRng('x'));
    expect(later.gained).toBe(320);
    expect(later.goals).toEqual([]);
  });

  it('adds exactly one new tile per move', () => {
    const state = newRun(createRng('one-spawn'));
    expect(state.cells.filter((c) => c !== 0)).toHaveLength(2);
    for (const dir of ['left', 'right', 'up', 'down'] as const) {
      const out = applyMove(state, dir, createRng(state.rng));
      if (!out.moved) continue;
      const tiles = (c: number[]) => c.filter((x) => x !== 0).length;
      expect(tiles(out.next.cells)).toBe(tiles(slide(state.cells, dir).cells) + 1);
    }
  });

  it('replays identically from the same seed', () => {
    const play = () => {
      const rng = createRng('sumslide:run:0123456789abcdef');
      let state = newRun(rng);
      for (let i = 0; i < 60; i++) state = applyMove(state, attractPolicy(state.cells), rng).next;
      return state;
    };
    expect(play()).toEqual(play());
  });
});

describe('the Echo', () => {
  it('arrives every 40 moves, never two at once, and always leaves a move open', () => {
    const dirs: Dir[] = ['up', 'down', 'left', 'right'];
    for (let seed = 0; seed < 200; seed++) {
      const pick = createRng(`dirs:${seed}`);
      const rng = createRng(`run:${seed}`);
      let state = newRun(rng);
      let lastEcho: number | null = null;
      for (let step = 0; step < 600; step++) {
        const out = applyMove(state, pick.pick(dirs), rng);
        if (!out.moved) {
          if (!canMove(state.cells)) break;
          continue;
        }
        state = out.next;
        const echoes = state.cells.filter((c) => c === ECHO).length;
        expect(echoes).toBeLessThanOrEqual(1);
        if (echoes === 1) {
          expect(state.echoCharge).toBe(0);
          expect(canMove(state.cells)).toBe(true);
        }
        if (out.spawn?.code === ECHO) {
          expect(state.moves - (lastEcho ?? 0)).toBeGreaterThanOrEqual(ECHO_CHARGE_MAX);
          lastEcho = state.moves;
        }
        if (out.over) break;
      }
    }
  });
});

describe('goals and undo', () => {
  it('the first goal is 80 and each one after it doubles', () => {
    expect([0, 1, 2, 7].map((rung) => valueOf(goalLevel(rung)!))).toEqual([80, 160, 320, 10240]);
  });

  it('goal progress follows the sum on the tray, measured from the previous goal', () => {
    expect(goalProgress(board([20, 20, null, null], 'left'), 0)).toBe(0.5);
    expect(goalProgress(board([80, 40, E, null], 'left'), 1)).toBe(0.5);
    expect(goalProgress(board([80, 80, 40, null], 'left'), 1)).toBe(1);
    expect(goalProgress(board([40, null, null, null], 'left'), 1)).toBe(0);
  });

  it('an undo costs one, and taking back a goal move also returns the undo it earned', () => {
    expect(undosAfterUndo(2, 3, 3)).toBe(1);
    expect(undosAfterUndo(2, 3, 2)).toBe(0);
    expect(undosAfterUndo(1, 3, 2)).toBe(0);
  });
});

describe('game over', () => {
  it('only when the tray is full with no equal neighbours and no Echo', () => {
    const full = [1, 2, 1, 2, 2, 1, 2, 1, 1, 2, 1, 2, 2, 1, 2, 1];
    expect(canMove(full)).toBe(false);
    expect(canMove(full.map((c, i) => (i === 5 ? ECHO : c)))).toBe(true);
    expect(canMove(full.map((c, i) => (i === 0 ? 2 : c)))).toBe(true);
    expect(canMove(full.map((c, i) => (i === 15 ? 0 : c)))).toBe(true);
  });
});

describe('labels', () => {
  it('doubles from 5 and goes compact from 10,240', () => {
    expect([1, 2, 3, 4, 5, 6].map(valueOf)).toEqual([5, 10, 20, 40, 80, 160]);
    expect([11, 12, 14, 15, 16].map(labelOf)).toEqual(['5120', '10.2k', '41k', '81.9k', '164k']);
  });
});

describe('balance', () => {
  it('the demo player usually reaches the 640 to 5120 goals in 200 to 1,500 moves', () => {
    const rungs: number[] = [];
    const lengths: number[] = [];
    for (let seed = 0; seed < 200; seed++) {
      const rng = createRng(`bot:${seed}`);
      let state = newRun(rng);
      for (let i = 0; i < 20_000; i++) {
        const out = applyMove(state, attractPolicy(state.cells), rng);
        if (!out.moved) break;
        state = out.next;
        if (out.over) break;
      }
      rungs.push(state.rung);
      lengths.push(state.moves);
    }
    const median = (a: number[]) => {
      const s = [...a].sort((x, y) => x - y);
      return (s[99]! + s[100]!) / 2;
    };
    expect(median(rungs)).toBeGreaterThanOrEqual(4);
    expect(median(rungs)).toBeLessThanOrEqual(7);
    expect(median(lengths)).toBeGreaterThanOrEqual(200);
    expect(median(lengths)).toBeLessThanOrEqual(1500);
  });
});

describe('saved runs', () => {
  const run = {
    ...snapshot([1, 2, 1, 0, 3, 4, 2, 0, 5, 4, 3, 1, 6, ECHO, 5, 2], { rung: 2, score: 1240 }),
    phase: 'playing',
    seed: 'sumslide:run:0123456789abcdef',
    undo: { left: 2, prev: null },
  };

  it('accepts a valid run, with or without a move to take back', () => {
    expect(isRun(run)).toBe(true);
    expect(isRun({ ...run, undo: { left: 1, prev: snapshot(run.cells) } })).toBe(true);
  });

  it('rejects corrupt runs', () => {
    expect(isRun({ ...run, cells: run.cells.slice(1) })).toBe(false);
    expect(isRun({ ...run, cells: run.cells.map((c, i) => (i < 2 ? ECHO : c)) })).toBe(false);
    expect(isRun({ ...run, echoCharge: 5 })).toBe(false);
    expect(isRun({ ...run, maxLevel: 3 })).toBe(false);
    expect(isRun({ ...run, phase: 'done' })).toBe(false);
    expect(isRun({ ...run, undo: { left: -1, prev: null } })).toBe(false);
  });
});
