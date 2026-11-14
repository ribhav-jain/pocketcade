// @vitest-environment node
// Rules checks for the pure simulation: hex neighbours, snapping, wall bounces, matching, drops, stones, urchins,
// the rainbow bubble, streaks, the ceiling push, the danger line, goals and stars; plus the level builder, the
// attract AI and the save.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRng } from '@pocketcade/toolkit';
import { describe, expect, it } from 'vitest';
import { chooseAim } from '../src/attract.ts';
import { AUTHORED, MAX_LEVEL, buildLevel, zoneOf } from '../src/levels.ts';
import { freshProgress, furthest, isProgressV1, withLevel, withRun } from '../src/save.ts';
import {
  CEILING,
  CELL_COUNT,
  COLOURS,
  COLS,
  D,
  DANGER_ROW,
  DANGER_Y,
  DROP_POINTS,
  FIELD_R,
  FISH_POINTS,
  LEFT_POINTS,
  MAX_AIM,
  MIN_AIM,
  POP_POINTS,
  R,
  RAINBOW,
  RAINBOW_EVERY,
  ROWS,
  ROW_H,
  SHOOT_X,
  SHOOT_Y,
  STAR_BONUS,
  STONE,
  TOP,
  URCHIN,
  aimToward,
  around,
  cellX,
  cellY,
  coloursOnBoard,
  createRun,
  floating,
  groupAt,
  isColour,
  lowestRow,
  neighbours,
  pushRow,
  resolve,
  rowLen,
  snap,
  starsFor,
  trace,
  twoStarShots,
  type LevelSetup,
  type Run,
  type SimEvent,
} from '../src/sim.ts';

const rng = (seed = 't') => createRng(seed);
const at = (r: number, c: number) => r * COLS + c;
const deg = (d: number) => (d * Math.PI) / 180;
const sorted = (a: number[]) => [...a].sort((x, y) => x - y);

/** A board from rows of cells: digits are colours, `#` a stone, `*` an urchin, `.` empty (spaces ignored). */
function board(rows: string[]): Int8Array {
  const cells = new Int8Array(CELL_COUNT).fill(-1);
  rows.forEach((row, r) =>
    [...row.replace(/ /g, '')].forEach((ch, c) => {
      if (ch !== '.') cells[at(r, c)] = ch === '#' ? STONE : ch === '*' ? URCHIN : Number(ch);
    }),
  );
  return cells;
}

/** Rows 0..last filled with colours 0–2 in small groups; a colour-3 shot never pops anything on it. */
function striped(last: number, shift = 0): Int8Array {
  const cells = new Int8Array(CELL_COUNT).fill(-1);
  for (let r = 0; r <= last; r++)
    for (let c = 0; c < rowLen(r, shift); c++) {
      const used = neighbours(at(r, c), shift).map((n) => cells[n]);
      cells[at(r, c)] = [0, 1, 2].find((k) => !used.includes(k))!;
    }
  return cells;
}

/** A level around a board: clear goal, par 10, a push every 6 misses unless overridden. */
const level = (cells: Int8Array, more: Partial<LevelSetup> = {}): LevelSetup => ({
  cells,
  kinds: 4,
  goal: 'clear',
  par: 10,
  pushEvery: 6,
  ...more,
});

/** Fires at `aim` and steps until the shot settles; returns every event. */
function shoot(run: Run, aim: number): SimEvent[] {
  run.setAim(aim);
  const out = run.fire();
  for (let i = 0; i < 1000 && run.phase === 'flying'; i++) out.push(...run.step());
  return out;
}
const of = <T extends SimEvent['type']>(events: SimEvent[], type: T) =>
  events.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);
/** An aim whose shot settles in `cell`. */
function aimFor(run: Run, cell: number): number {
  for (let i = 0; i < 900; i++) {
    const a = MIN_AIM + ((MAX_AIM - MIN_AIM) * i) / 899;
    if (trace(run.cells, run.shift, a).cell === cell) return a;
  }
  throw new Error(`no aim reaches cell ${cell}`);
}

describe('hex grid', () => {
  it('gives each cell its hex neighbours, with indented rows offset half a bubble', () => {
    expect(rowLen(0, 0)).toBe(COLS);
    expect(rowLen(1, 0)).toBe(COLS - 1);
    expect(sorted(neighbours(at(0, 0), 0))).toEqual([at(0, 1), at(1, 0)]);
    expect(sorted(neighbours(at(2, 5), 0))).toEqual([
      at(1, 4),
      at(1, 5),
      at(2, 4),
      at(2, 6),
      at(3, 4),
      at(3, 5),
    ]);
    expect(sorted(neighbours(at(1, COLS - 2), 0))).toEqual([
      at(0, COLS - 2),
      at(0, COLS - 1),
      at(1, COLS - 3),
      at(2, COLS - 2),
      at(2, COLS - 1),
    ]);
    // shift 1 flips which rows are indented
    expect(rowLen(0, 1)).toBe(COLS - 1);
    expect(sorted(neighbours(at(0, 0), 1))).toEqual([at(0, 1), at(1, 0), at(1, 1)]);
  });

  it('is symmetric, every neighbour is one bubble apart, and a blast reaches two rings', () => {
    for (const shift of [0, 1])
      for (let i = 0; i < CELL_COUNT; i++) {
        if (i % COLS >= rowLen(Math.floor(i / COLS), shift)) continue;
        for (const n of neighbours(i, shift)) {
          expect(neighbours(n, shift)).toContain(i);
          const d = Math.hypot(cellX(n, shift) - cellX(i, shift), cellY(n) - cellY(i));
          expect(d).toBeCloseTo(D, 6);
        }
      }
    const ring = around(at(4, 4), 0, 2);
    expect(ring).toHaveLength(18);
    for (const n of ring)
      expect(
        Math.hypot(cellX(n, 0) - cellX(at(4, 4), 0), cellY(n) - cellY(at(4, 4))),
      ).toBeLessThan(2 * D + 1);
  });

  it('fits the walls and keeps the danger line above the launcher', () => {
    expect(cellX(at(0, COLS - 1), 0) + R).toBe(FIELD_R);
    expect(cellX(at(1, COLS - 2), 0) + R).toBe(FIELD_R - R);
    expect(DANGER_Y).toBeGreaterThan(cellY(at(DANGER_ROW - 1, 0)));
    expect(DANGER_Y).toBeLessThan(cellY(at(DANGER_ROW, 0)));
    expect(SHOOT_Y - R).toBeGreaterThan(DANGER_Y);
    expect(ROWS).toBe(DANGER_ROW + 1);
  });
});

describe('aim, flight and snapping', () => {
  it('clamps the aim and turns faster the longer a key is held', () => {
    const run = createRun(rng(), level(board(['0']), { current: 0, next: 0 }));
    run.setAim(0);
    expect(run.aim).toBe(MIN_AIM);
    run.setAim(Math.PI);
    expect(run.aim).toBe(MAX_AIM);
    run.setAim(Math.PI / 2);
    run.step(1);
    const first = run.aim - Math.PI / 2;
    for (let i = 0; i < 40; i++) run.step(1);
    const a = run.aim;
    run.step(1);
    expect(run.aim - a).toBeGreaterThan(first * 3);
    for (let i = 0; i < 400; i++) run.step(-1);
    expect(run.aim).toBe(MIN_AIM);
    expect(aimToward(0, -100)).toBeCloseTo(Math.PI / 2);
    expect(aimToward(100, 20)).toBe(MIN_AIM);
    expect(aimToward(-100, 20)).toBe(MAX_AIM);
  });

  it('snaps to the nearest free top cell at the ceiling, or next to the bubble it touched', () => {
    const empty = board([]);
    expect(snap(empty, 0, 200, TOP + R, CEILING)).toBe(at(0, 2));
    const one = board(['.....0']);
    // below and to the right of (0,5) → the indented cell (1,5); to the left → (1,4)
    expect(snap(one, 0, cellX(at(0, 5), 0) + 30, cellY(at(0, 5)) + 50, at(0, 5))).toBe(at(1, 5));
    expect(snap(one, 0, cellX(at(0, 5), 0) - 30, cellY(at(0, 5)) + 50, at(0, 5))).toBe(at(1, 4));
  });

  it('bounces off a side wall and the guide matches the real flight', () => {
    const empty = board([]);
    const t = trace(empty, 0, deg(60));
    // launcher, one bounce on the right wall, then the ceiling
    expect(t.path.length).toBe(6);
    expect(t.path[2]).toBe(FIELD_R - R);
    expect(t.path[3]!).toBeCloseTo(SHOOT_Y - (FIELD_R - R - SHOOT_X) * Math.tan(deg(60)), 6);
    expect(t.path[4]!).toBeLessThan(FIELD_R - R);
    // a flatter shot bounces off both walls
    expect(trace(empty, 0, deg(30)).path.length).toBe(8);
    const run = createRun(rng(), level(board(['0']), { current: 1, next: 1 }));
    const events = shoot(run, deg(60));
    expect(of(events, 'bounce')).toHaveLength(1);
    expect(of(events, 'bounce')[0]!.x).toBe(FIELD_R - R);
    // a real flight on a level's board lands where the trace said
    const r2 = createRun(rng('guide'), buildLevel(18));
    for (let i = 0; i < 25 && r2.phase === 'aim'; i++) {
      const aim = MIN_AIM + ((MAX_AIM - MIN_AIM) * ((i * 7) % 25)) / 24;
      const want = trace(r2.cells, r2.shift, aim).cell;
      expect(of(shoot(r2, aim), 'stick')[0]!.cell).toBe(want);
    }
  });
});

describe('matching and drops', () => {
  it('finds connected same-colour groups and floating bubbles', () => {
    const cells = board(['1100', '.0.0', '...2']);
    expect(sorted(groupAt(cells, 0, at(0, 0)))).toEqual([at(0, 0), at(0, 1)]);
    expect(sorted(groupAt(cells, 0, at(0, 2)))).toEqual([at(0, 2), at(0, 3), at(1, 1), at(1, 3)]);
    expect(floating(cells, 0)).toEqual([]);
    cells[at(1, 3)] = -1;
    cells[at(0, 3)] = -1;
    // (2,3) hung only from (1,3): it floats
    expect(floating(cells, 0)).toEqual([at(2, 3)]);
  });

  it('pops a group of three or more, drops what hangs from it, and scores 10 and 20', () => {
    // (0,5) anchors two colour-0 bubbles; colour 2 hangs below them
    const cells = board(['.....1', '....00', '.....2']);
    const res = resolve(cells, 0, at(1, 3), 0);
    expect([res.popped.length, res.dropped.length]).toEqual([3, 1]);
    expect(resolve(cells, 0, at(1, 3), 1).popped).toEqual([]);
    const run = createRun(rng(), level(cells, { current: 0, next: 1 }));
    const pop = of(shoot(run, aimFor(run, at(1, 3))), 'pop')[0]!;
    expect(pop.popped).toHaveLength(3);
    expect(pop.dropped).toEqual([
      { x: cellX(at(2, 5), 0), y: cellY(at(2, 5)), kind: 2, fish: false },
    ]);
    expect(pop.points).toBe(3 * POP_POINTS + DROP_POINTS);
    expect(run.score).toBe(50);
    expect([...run.cells].filter((k) => k >= 0)).toEqual([1]);
    expect(run.misses).toBe(0);
    expect(run.streak).toBe(1);
  });

  it("doesn't pop a pair, and a miss ends the streak", () => {
    const run = createRun(rng(), level(board(['.....0']), { current: 0, next: 0, streak: 2 }));
    expect(of(shoot(run, Math.PI / 2), 'pop')).toEqual([]);
    expect(run.misses).toBe(1);
    expect(run.streak).toBe(0);
  });

  it('multiplies points by the streak and hands out a rainbow every fourth pop in a row', () => {
    const cells = board(['11...00']);
    const run = createRun(
      rng(),
      level(cells, { current: 0, next: 1, streak: RAINBOW_EVERY - 1 }),
    );
    const events = shoot(run, aimFor(run, at(1, 5)));
    expect(of(events, 'pop')[0]!.points).toBe(3 * POP_POINTS * RAINBOW_EVERY);
    expect(of(events, 'rainbow')).toHaveLength(1);
    expect([run.current, run.next]).toEqual([1, RAINBOW]);
  });
});

describe('special bubbles', () => {
  it('never pops a stone, but drops it when nothing holds it up', () => {
    // two colour-0 bubbles hold a stone, which holds a colour-1 bubble
    const cells = board(['....00', '....#', '....1']);
    expect(groupAt(cells, 0, at(1, 4))).toEqual([]);
    const res = resolve(cells, 0, at(0, 3), 0);
    expect(res.popped).toHaveLength(3);
    expect(sorted(res.dropped)).toEqual([at(1, 4), at(2, 4)]);
    // a shot of any colour just sticks to a stone
    expect(resolve(board(['....#']), 0, at(1, 4), 0).popped).toEqual([]);
  });

  it('bursts an urchin when a bubble lands beside it, taking two rings and chaining', () => {
    const cells = striped(5);
    cells[at(2, 2)] = URCHIN;
    cells[at(2, 5)] = URCHIN; // three cells along: inside the first blast's reach
    cells[at(6, 2)] = 2;
    const landing = at(6, 1);
    expect(resolve(cells, 0, landing, 3).blasts).toEqual([]); // nowhere near
    const near = neighbours(at(2, 2), 0).find((n) => cells[n]! >= 0)!;
    cells[near] = -1;
    const res = resolve(cells, 0, near, 3);
    expect(sorted(res.blasts)).toEqual([at(2, 2), at(2, 5)]);
    for (const b of around(at(2, 2), 0, 2)) expect(res.cells[b]).toBe(-1);
    for (const b of around(at(2, 5), 0, 2)) expect(res.cells[b]).toBe(-1);
    expect(res.cells[near]).toBe(-1);
    expect(res.popped).toContain(near);
  });

  it('pops every colour group a rainbow touches, whatever its size', () => {
    const cells = board(['00.1.22222', '.........']);
    // (1,1) touches (0,1) and (0,2): only the pair of 0s; (1,2) touches the lone 1 as well
    const a = resolve(cells, 0, at(1, 0), RAINBOW);
    expect(sorted(a.popped)).toEqual([at(0, 0), at(0, 1), at(1, 0)]);
    const b = resolve(cells, 0, at(1, 3), RAINBOW);
    expect(sorted(b.popped)).toEqual([at(0, 3), at(1, 3)]);
    // a rainbow never stays on the board
    expect(resolve(board(['#']), 0, at(1, 0), RAINBOW).popped).toEqual([at(1, 0)]);
  });
});

describe('goals and stars', () => {
  it('wins a clear level when the last colour goes; stones left behind fall for points', () => {
    const run = createRun(rng(), level(board(['#...00']), { current: 0, next: 0, par: 3 }));
    const events = shoot(run, Math.PI / 2);
    const win = of(events, 'win')[0]!;
    expect(win.stars).toBe(3);
    expect(win.left.map((b) => b.kind)).toEqual([STONE]);
    expect(win.bonus).toBe(3 * STAR_BONUS + LEFT_POINTS);
    expect(run.score).toBe(3 * POP_POINTS + win.bonus);
    expect(run.phase).toBe('won');
    expect(lowestRow(run.cells)).toBe(-1);
    expect(run.fire()).toEqual([]);
  });

  it('wins a rescue level when the last fish is free, popped or dropped', () => {
    const cells = board(['11...00', '......2']);
    const fish = new Uint8Array(CELL_COUNT);
    fish[at(1, 6)] = 1;
    const run = createRun(rng(), level(cells, { fish, goal: 'rescue', current: 0, next: 1 }));
    expect(run.fishLeft).toBe(1);
    const events = shoot(run, aimFor(run, at(1, 5)));
    const pop = of(events, 'pop')[0]!;
    expect(pop.fish).toBe(1);
    expect(pop.points).toBe(3 * POP_POINTS + DROP_POINTS + FISH_POINTS);
    // the two colour-1 bubbles were still up
    expect(of(events, 'win')[0]!.left).toHaveLength(2);
    expect(run.fishLeft).toBe(0);
  });

  it('gives three stars within par, two a little over, then one', () => {
    expect([10, 11, 14, 15].map((s) => starsFor(s, 10))).toEqual([3, 2, 2, 1]);
    expect(twoStarShots(10)).toBe(14);
    const run = createRun(rng(), level(striped(2), { current: 3, next: 3, par: 2, pushEvery: 99 }));
    expect([run.stars, run.starShots]).toEqual([3, 2]);
    shoot(run, deg(90));
    expect([run.stars, run.starShots]).toEqual([3, 1]);
    shoot(run, deg(80));
    expect([run.stars, run.starShots]).toEqual([2, 1]);
    shoot(run, deg(100));
    expect([run.stars, run.starShots]).toEqual([1, 0]);
  });
});

describe('pressure', () => {
  it('pushes the ceiling down a row on the last allowed miss, fish and all', () => {
    const cells = striped(2);
    const fish = new Uint8Array(CELL_COUNT);
    fish[at(1, 3)] = 1;
    const run = createRun(
      rng('push'),
      level(cells, { fish, current: 3, next: 3, pushEvery: 5, misses: 4 }),
    );
    const events = shoot(run, deg(90));
    const kept = Int8Array.from(cells);
    kept[of(events, 'stick')[0]!.cell] = 3;
    expect(of(events, 'push')).toHaveLength(1);
    expect(run.misses).toBe(0);
    expect(run.shift).toBe(1);
    // every old bubble moved down one row, at the same x
    for (let i = 0; i < CELL_COUNT - COLS; i++)
      if (kept[i]! >= 0) {
        expect(run.cells[i + COLS]).toBe(kept[i]);
        expect(cellX(i + COLS, run.shift)).toBe(cellX(i, 0));
        expect(cellY(i + COLS) - cellY(i)).toBeCloseTo(ROW_H);
      }
    expect(run.fish[at(2, 3)]).toBe(1);
    expect(run.fishLeft).toBe(1);
    // a full new row of the level's colours at the top
    for (let c = 0; c < rowLen(0, run.shift); c++) expect(isColour(run.cells[c]!)).toBe(true);
  });

  it('pushRow keeps indented rows indented', () => {
    const cells = striped(3);
    const s = pushRow(rng(), cells, new Uint8Array(CELL_COUNT), 0, 4);
    expect(s).toBe(1);
    expect(cells[at(2, COLS - 1)]).toBe(-1); // old row 1 (indented) is now row 2
    expect(cells[at(0, COLS - 1)]).toBe(-1); // the new top row is indented too
  });

  it('loses the level when a settled bubble crosses the danger line, by a shot or a push', () => {
    const run = createRun(rng(), level(striped(DANGER_ROW - 1), { current: 3, next: 3 }));
    expect(of(shoot(run, Math.PI / 2), 'over')).toHaveLength(1);
    expect(run.phase).toBe('over');
    expect(run.fire()).toEqual([]);
    const pushed = createRun(
      rng(),
      level(striped(DANGER_ROW - 2), { current: 3, next: 3, misses: 5 }),
    );
    expect(shoot(pushed, Math.PI / 2).map((e) => e.type)).toEqual([
      'fire',
      'stick',
      'push',
      'over',
    ]);
  });

  it("doesn't lose when the bubble in the last row pops", () => {
    const cells = striped(DANGER_ROW - 1);
    cells[at(DANGER_ROW - 1, 4)] = 3;
    cells[at(DANGER_ROW - 1, 5)] = 3;
    const run = createRun(rng(), level(cells, { current: 3, next: 3 }));
    expect(of(shoot(run, Math.PI / 2), 'pop')).toHaveLength(1);
    expect(run.phase).toBe('aim');
  });
});

describe('loaded bubbles', () => {
  it('only loads colours still on the board', () => {
    // next (0) is not on the board, so it is re-rolled; stones and urchins never load
    const run = createRun(rng(), level(board(['2#*......2']), { current: 2, next: 0 }));
    expect(coloursOnBoard(run.cells)).toEqual([2]);
    shoot(run, deg(40));
    expect([run.current, run.next]).toEqual([2, 2]);
  });

  it('swaps the current and next bubbles while aiming', () => {
    const run = createRun(rng(), level(board(['01']), { current: 0, next: 1 }));
    expect(run.swap()).toEqual([{ type: 'swap' }]);
    expect([run.current, run.next]).toEqual([1, 0]);
    run.fire();
    expect(run.swap()).toEqual([]);
  });
});

describe('levels', () => {
  it('builds every authored level as a sound board, the same each time', () => {
    for (let n = 1; n <= AUTHORED + 12; n++) {
      const l = buildLevel(n);
      expect(buildLevel(n).cells, `level ${n}`).toEqual(l.cells);
      expect(floating(l.cells, 0), `level ${n}`).toEqual([]);
      expect(lowestRow(l.cells), `level ${n}`).toBeLessThanOrEqual(8);
      expect(coloursOnBoard(l.cells).length, `level ${n}`).toBeGreaterThanOrEqual(2);
      for (const k of coloursOnBoard(l.cells)) expect(k).toBeLessThan(l.kinds);
      expect(l.kinds).toBeLessThanOrEqual(COLOURS);
      expect(l.goal, `level ${n}`).toBe(l.fish.includes(1) ? 'rescue' : 'clear');
      for (let i = 0; i < CELL_COUNT; i++) if (l.fish[i]) expect(isColour(l.cells[i]!)).toBe(true);
      expect(l.par, `level ${n}`).toBeGreaterThanOrEqual(5);
    }
  });

  it('opens gently, adds colours over the zones and repeats the zones for ever', () => {
    expect(buildLevel(1).kinds).toBe(3);
    expect(buildLevel(AUTHORED).kinds).toBe(COLOURS);
    expect([1, 10, 11, 40, 41, 81].map(zoneOf)).toEqual([0, 0, 1, 3, 0, 0]);
    expect(buildLevel(MAX_LEVEL + 5).n).toBe(MAX_LEVEL);
    const has = (n: number, kind: number) => buildLevel(n).cells.includes(kind);
    // each special arrives on its own level
    expect([5, 6].map((n) => has(n, STONE))).toEqual([false, true]);
    expect([20, 21].map((n) => has(n, URCHIN))).toEqual([false, true]);
    expect([10, 11].map((n) => buildLevel(n).goal)).toEqual(['clear', 'rescue']);
  });
});

describe('determinism and the attract AI', () => {
  /** The AI plays a level to the end (or `max` shots). */
  function play(n: number, seed: string, max = 150): { run: Run; log: SimEvent[] } {
    const run = createRun(rng(seed), buildLevel(n));
    const pick = createRng(`${seed}:ai`);
    const log: SimEvent[] = [];
    for (let i = 0; i < max && run.phase === 'aim'; i++)
      log.push(...shoot(run, chooseAim(run, () => pick.next())));
    return { run, log };
  }

  it('replays identically for the same seed and inputs', () => {
    expect(play(9, 'd1', 12).log).toEqual(play(9, 'd1', 12).log);
    expect(play(9, 'd1', 12).log).not.toEqual(play(9, 'd2', 12).log);
  });

  it('wins levels of every kind with a star rating to match', () => {
    for (const n of [1, 8, 14, 22, 27, 33]) {
      const { run } = play(n, `ai${n}`);
      expect(run.phase, `level ${n} after ${run.shots} shots`).toBe('won');
      expect(run.stars).toBe(starsFor(run.shots, buildLevel(n).par));
    }
  });
});

describe('saves', () => {
  const fixture = (name: string) =>
    JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures/save', name), 'utf8')) as never;
  it('accepts the committed fixture and the defaults', () => {
    expect(isProgressV1(fixture('progress.v1.json'))).toBe(true);
    expect(isProgressV1(freshProgress())).toBe(true);
  });
  it('rejects broken data', () => {
    expect(isProgressV1({ stars: [3], scores: [], best: 0 })).toBe(false);
    expect(isProgressV1({ stars: [4], scores: [10], best: 0 })).toBe(false);
    expect(isProgressV1({ stars: [0], scores: [10], best: 0 })).toBe(false);
    expect(isProgressV1({ stars: [3], scores: [-1], best: 0 })).toBe(false);
    expect(isProgressV1({ stars: [], scores: [] })).toBe(false);
    expect(isProgressV1(null)).toBe(false);
  });
  it('records cleared levels in order and keeps the better result', () => {
    let p = withLevel(freshProgress(), 1, { stars: 2, score: 900 });
    expect(p).toEqual({ stars: [2], scores: [900], best: 0 });
    expect(furthest(p)).toBe(2);
    p = withLevel(p, 1, { stars: 3, score: 700 });
    expect(p).toEqual({ stars: [3], scores: [900], best: 0 });
    // a level past the furthest can't be recorded
    expect(withLevel(p, 3, { stars: 3, score: 1 })).toBe(p);
    expect(withRun(p, 1500).best).toBe(1500);
    expect(withRun(withRun(p, 1500), 200).best).toBe(1500);
  });
});
