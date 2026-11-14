// @vitest-environment node
// Rules checks: pieces, entering the well, turns, the Tumbler, timing, scoring, clears, overflow, stash, the run
// save, the layout and the attract opening's Full Five.
import { readFileSync } from 'node:fs';
import { createRng } from '@pocketcade/toolkit';
import { describe, expect, it } from 'vitest';
import { plan } from '../src/ai.ts';
import { ATTRACT_PILE, ATTRACT_QUEUE, attract, OPENING, type AttractView } from '../src/attract.ts';
import { frameFor, type Rect } from '../src/layout.ts';
import {
  boxCells,
  distinctRotations,
  PIECE_IDS,
  tierOf,
  type Cell,
  type PieceId,
} from '../src/pieces.ts';
import { isRunOrNull, isStatsV1 } from '../src/save.ts';
import {
  cellsOf,
  clearPoints,
  COLS,
  createSim,
  createTumbler,
  decodeBoard,
  enterPiece,
  fits,
  levelOf,
  ROWS,
  spawnPiece,
  tierFor,
  tryTurn,
  type Action,
  type Input,
  type Sim,
  type SimEvent,
} from '../src/sim.ts';

const SEED = '00000000000000aa';
const sorted = (cells: readonly Cell[]) => [...cells].map(([x, y]) => `${x},${y}`).sort();
const norm = (cells: readonly Cell[]) => {
  const mx = Math.min(...cells.map(([x]) => x));
  const my = Math.min(...cells.map(([, y]) => y));
  return sorted(cells.map(([x, y]) => [x - mx, y - my])).join(' ');
};
const fresh = (o: { queue?: readonly PieceId[]; pile?: string } = {}) =>
  createSim({ seed: SEED, rng: createRng(`${SEED}:pieces`), ...o });
const press = (action: Action): Input[] => [{ action, down: true }];
const tap = (sim: Sim, action: Action) => [
  ...sim.step(press(action)),
  ...sim.step([{ action, down: false }]),
];
/** A pile string with the given cells settled (as piece 'a'). */
function pile(cells: readonly Cell[]): string {
  const b = Array<string>(COLS * ROWS).fill('.');
  for (const [x, y] of cells) b[y * COLS + x] = 'a';
  return b.join('');
}
const EMPTY = new Int8Array(COLS * ROWS).fill(-1);

describe('pieces', () => {
  it('every state has 5 cells in the box including the pivot; distinct counts; all distinct; mirrors match', () => {
    for (const id of PIECE_IDS)
      for (let r = 0; r < 4; r++) {
        const c = boxCells(id, r);
        expect(c).toHaveLength(5);
        expect(c.every(([x, y]) => x >= 0 && x < 5 && y >= 0 && y < 5)).toBe(true);
        expect(sorted(c)).toContain('2,2');
      }
    const counts = Object.fromEntries(PIECE_IDS.map((id) => [id, distinctRotations(id).length]));
    expect(counts).toMatchObject({ I: 2, X: 1, Z: 2, Zm: 2, L: 4, F: 4, W: 4 });
    const shapes = PIECE_IDS.map((id) => new Set([0, 1, 2, 3].map((r) => norm(boxCells(id, r)))));
    for (let a = 0; a < shapes.length; a++)
      for (let b = a + 1; b < shapes.length; b++)
        expect([...shapes[a]!].some((s) => shapes[b]!.has(s))).toBe(false);
    for (const id of PIECE_IDS.filter((p) => p.endsWith('m'))) {
      const partner = id.slice(0, -1) as PieceId;
      expect(sorted(boxCells(id, 0))).toEqual(
        sorted(boxCells(partner, 0).map(([x, y]) => [4 - x, y])),
      );
    }
  });

  it('enters with the top cell on the first visible row, or higher when the pile is in the way', () => {
    expect(new Set(cellsOf(spawnPiece('I')).map(([, y]) => y))).toEqual(new Set([3]));
    expect(new Set(cellsOf(spawnPiece('V')).map(([, y]) => y))).toEqual(new Set([3, 4, 5]));
    for (const id of PIECE_IDS)
      expect(cellsOf(spawnPiece(id)).every(([x]) => x >= 3 && x <= 7)).toBe(true);
    expect(enterPiece(EMPTY, 'T')).toEqual(spawnPiece('T'));
    const lifted = enterPiece(decodeBoard(pile([[5, 5]])), 'T')!;
    expect(lifted.y).toBe(spawnPiece('T').y - 1);
    const blocked = pile([
      [5, 3],
      [5, 4],
      [5, 5],
    ]);
    expect(enterPiece(decodeBoard(blocked), 'T')).toBeNull();
  });

  it('turns about the pivot, nudging off walls and the floor', () => {
    const t = tryTurn(EMPTY, spawnPiece('T'), 1, 4)!;
    expect(sorted(cellsOf(t.piece))).toEqual(
      sorted([
        [4, 3],
        [4, 4],
        [4, 5],
        [5, 4],
        [6, 4],
      ]),
    );
    const upright = { id: 'I' as const, rot: 1, x: -2, y: 1 }; // against the left wall
    expect(fits(EMPTY, upright)).toBe(true);
    const r = tryTurn(EMPTY, upright, 1, 4)!;
    expect([r.piece.x - upright.x, r.up]).toEqual([2, false]);
    // An L lying on the floor needs two rows of headroom to stand up.
    const flat = { id: 'L' as const, rot: 0, x: 3, y: ROWS - 3 };
    expect(fits(EMPTY, flat)).toBe(true);
    const stood = tryTurn(EMPTY, flat, -1, 4)!;
    expect([stood.piece.y - flat.y, stood.up]).toEqual([-2, true]);
    expect(tryTurn(EMPTY, flat, -1, 0)).toBeNull();
  });
});

describe('Tumbler', () => {
  it('10,000 draws: no repeats, every shape once a load, two bars, the X every other load', () => {
    const t = createTumbler(createRng('0000000000000000:pieces'), { tier: 3 });
    const count = new Map<PieceId, number>();
    const last = new Map<PieceId, number>();
    const gap = new Map<PieceId, number>();
    let prev: PieceId | null = null;
    for (let i = 0; i < 10_000; i++) {
      const p = t.draw();
      expect(p).not.toBe(prev);
      prev = p;
      count.set(p, (count.get(p) ?? 0) + 1);
      if (last.has(p)) gap.set(p, Math.max(gap.get(p) ?? 0, i - last.get(p)! - 1));
      last.set(p, i);
    }
    const loads = t.loads;
    for (const p of PIECE_IDS) {
      const per = p === 'I' ? 2 : p === 'X' ? 0.5 : 1;
      expect(Math.abs(count.get(p)! - loads * per)).toBeLessThanOrEqual(2);
      // 19 or 20 pieces a load: a shape is never further than two loads away, a bar never further than one.
      expect(gap.get(p)!).toBeLessThanOrEqual(p === 'I' ? 18 : p === 'X' ? 58 : 38);
    }
  });

  it('opens gently and unlocks tiers at 30, 60 and 90 lines', () => {
    for (let seed = 0; seed < 20; seed++) {
      const t = createTumbler(createRng(`gentle${seed}`));
      const first = [t.draw(), t.draw(), t.draw(), t.draw()];
      expect(first.some((p) => p === 'T' || p === 'U' || p === 'V')).toBe(false);
    }
    const size = (lines: number) =>
      PIECE_IDS.filter((p) => tierOf(p) <= tierFor(levelOf(lines))).length;
    expect([0, 29, 30, 59, 60, 89, 90].map(size)).toEqual([10, 10, 14, 14, 17, 17, 18]);
    const t = createTumbler(createRng('t'));
    for (let i = 0; i < 3; i++) t.draw();
    expect(t.unlock(1)).toEqual(['N', 'Nm', 'Z', 'Zm']);
    const seen = new Set<PieceId>();
    for (let i = 0; i < 12; i++) seen.add(t.draw());
    for (const p of ['N', 'Nm', 'Z', 'Zm'] as const) expect(seen.has(p)).toBe(true);
  });
});

describe('timing', () => {
  /** Rows fallen by a bar from the top in `steps` steps with no input after the start. */
  function fallen(lines: number, steps: number): number {
    const save = fresh({ queue: ['I', 'L', 'P', 'T'] }).snapshot();
    const sim = createSim({ seed: SEED, rng: createRng(save.rng), save: { ...save, lines } });
    const y0 = sim.piece!.y;
    tap(sim, 'nudgeLeft');
    for (let i = 2; i < steps; i++) sim.step([]);
    return sim.piece!.y - y0;
  }

  it('falls by the speed table; level from lines', () => {
    expect(fallen(0, 540)).toBe(9);
    expect(fallen(90, 250)).toBe(16);
    expect(fallen(190, 49)).toBe(14);
    expect([0, 9, 10, 189, 190, 400].map(levelOf)).toEqual([1, 1, 2, 19, 20, 20]);
  });

  /** Runs until the piece rests on something; returns the step it landed on. */
  function land(sim: Sim): number {
    while (sim.landing() > 0) sim.step([]);
    return sim.steps;
  }

  it('settles 30 steps after landing, or 230 with a shift every 20 steps; the next piece enters 6 steps later', () => {
    const sim = fresh({ queue: ['I', 'L', 'P', 'T'] });
    tap(sim, 'nudgeLeft');
    const g = land(sim);
    let lockAt = -1;
    let spawnAt = -1;
    while (spawnAt < 0) {
      const ev = sim.step([]);
      if (ev.some((e) => e.type === 'lock')) lockAt = sim.steps;
      if (ev.some((e) => e.type === 'spawn')) spawnAt = sim.steps;
    }
    expect(lockAt - g).toBe(30);
    expect(spawnAt - lockAt).toBe(6);

    const s2 = fresh({ queue: ['I', 'L', 'P', 'T'] });
    tap(s2, 'nudgeLeft');
    const g2 = land(s2);
    // A shift every 20 steps, alternating right and left along the floor (press, release next step).
    let lockedAfter = -1;
    for (let k = 1; k < 400 && lockedAfter < 0; k++) {
      const key: Action = Math.floor(k / 20) % 2 ? 'right' : 'left';
      const inputs: Input[] =
        k % 20 === 0 ? press(key) : k % 20 === 1 && k > 20 ? [{ action: key, down: false }] : [];
      if (s2.step(inputs).some((e) => e.type === 'lock')) lockedAfter = s2.steps - g2;
    }
    expect(lockedAfter).toBe(230);
  });

  it('a held direction moves at once, repeats from step 9 and stops at the wall; fast fall and drop score', () => {
    const sim = fresh({ queue: ['T', 'L', 'P', 'I'] });
    const x0 = sim.piece!.x;
    const xs: number[] = [];
    sim.step(press('right'));
    xs.push(sim.piece!.x - x0);
    for (let i = 1; i <= 25; i++) {
      sim.step([]);
      xs.push(sim.piece!.x - x0);
    }
    expect([xs[0], xs[8], xs[9], xs[17], xs[18], xs[25]]).toEqual([1, 1, 2, 4, 5, 5]);

    const s2 = fresh({ queue: ['T', 'L', 'P', 'I'] });
    const y0 = s2.piece!.y;
    s2.step(press('fast'));
    for (let i = 1; i < 20; i++) s2.step([]);
    expect([s2.piece!.y - y0, s2.score]).toEqual([10, 10]);

    const s3 = fresh({ queue: ['I', 'L', 'P', 'T'] });
    s3.step(press('slam'));
    expect(s3.score).toBe(2 * (ROWS - 4));
  });

  it('a turn pressed between pieces is applied as the next piece enters', () => {
    const sim = fresh({ queue: ['I', 'L', 'P', 'T'] });
    tap(sim, 'slam');
    tap(sim, 'turnRight');
    while (sim.phase === 'entry') sim.step([]);
    expect([sim.piece!.id, sim.piece!.rot]).toEqual(['L', 1]);
  });
});

describe('scoring and clears', () => {
  it('matches the test vectors', () => {
    expect([
      clearPoints(1, 1, 1, false),
      clearPoints(2, 1, 2, false),
      clearPoints(5, 3, 1, false),
      clearPoints(3, 5, 3, false),
      clearPoints(4, 20, 6, false),
      clearPoints(2, 2, 1, true),
    ]).toEqual([100, 312, 4500, 3375, 30000, 4500]);
  });

  it('an upright bar into the right-hand shaft clears a Full Five', () => {
    const sim = fresh({ queue: ATTRACT_QUEUE, pile: ATTRACT_PILE });
    tap(sim, 'slam'); // P
    for (let i = 0; i < 6; i++) sim.step([]);
    tap(sim, 'slam'); // Lm
    for (let i = 0; i < 6; i++) sim.step([]);
    tap(sim, 'turnRight');
    for (let i = 0; i < 6; i++) tap(sim, 'nudgeRight');
    const ev = sim.step(press('slam'));
    const clear = ev.find((e): e is Extract<SimEvent, { type: 'clear' }> => e.type === 'clear')!;
    expect(clear).toMatchObject({
      rows: [16, 17, 18, 19, 20],
      five: true,
      sweep: false,
      points: 1500,
    });
    expect(sim.lastClear.rows).toBe(5);
    expect(sim.lines).toBe(5);
  });

  it('a piece that settles above the crest ends the run', () => {
    const tower: Cell[] = [];
    for (let y = 6; y < ROWS; y++) for (let x = 3; x <= 7; x++) tower.push([x, y]);
    const sim = fresh({ queue: ['I', 'L', 'P', 'T'], pile: pile(tower) });
    tap(sim, 'turnRight');
    expect(sim.step(press('slam')).map((e) => e.type)).toEqual(['lock', 'over']);
  });

  it('stash: once per piece; a blocked incoming piece is refused and the run goes on', () => {
    const sim = fresh({ queue: ['T', 'L', 'P', 'I'] });
    expect(sim.step(press('stash')).map((e) => e.type)).toEqual(['start', 'stash']);
    expect([sim.piece!.id, sim.stash, sim.next]).toEqual([
      'L',
      'T',
      ['P', 'I', expect.any(String)],
    ]);
    expect(sim.step(press('stash')).map((e) => e.type)).toEqual(['bump']);
    const column = pile([
      [5, 1],
      [5, 2],
      [5, 3],
    ]);
    const blocked = fresh({ queue: ['U', 'I', 'P', 'L'], pile: column });
    expect(blocked.step(press('stash')).map((e) => e.type)).toEqual(['start', 'bump']);
    expect([blocked.piece!.id, blocked.phase]).toEqual(['U', 'falling']);
  });
});

describe('save', () => {
  it('a snapshot validates and restores the same run; bad saves are rejected', () => {
    const sim = fresh();
    for (let i = 0; i < 3; i++) {
      tap(sim, i % 2 ? 'nudgeLeft' : 'nudgeRight');
      sim.step(press('slam'));
      sim.step([{ action: 'slam', down: false }]);
      while (sim.phase === 'entry') sim.step([]);
    }
    const snap = JSON.parse(JSON.stringify(sim.snapshot()));
    expect(isRunOrNull(snap)).toBe(true);
    const back = createSim({ seed: snap.seed, rng: createRng(snap.rng), save: snap });
    expect([back.phase, back.piece!.id, back.next, back.score, [...back.board]]).toEqual([
      'ready',
      sim.piece!.id,
      sim.next,
      sim.score,
      [...sim.board],
    ]);
    expect(back.snapshot()).toEqual(snap);
    // The restored run deals the same pieces as the original would have.
    const deal = (s: Sim) => {
      const ids: PieceId[] = [];
      for (let i = 0; i < 25; i++) {
        s.step(press('slam'));
        s.step([{ action: 'slam', down: false }]);
        while (s.phase === 'entry') s.step([]);
        ids.push(s.next[2]!);
      }
      return ids;
    };
    expect(deal(back)).toEqual(deal(sim));
    expect(isRunOrNull({ ...snap, board: snap.board.slice(1) })).toBe(false);
    expect(isRunOrNull({ ...snap, board: '.'.repeat(12) + 'a' + snap.board.slice(13) })).toBe(
      false,
    );
    expect(isRunOrNull({ ...snap, current: 'O' })).toBe(false);
    expect(isRunOrNull(null)).toBe(true);
  });

  it('the committed fixtures validate', () => {
    const read = (f: string) =>
      JSON.parse(readFileSync(new URL(`./fixtures/save/${f}`, import.meta.url), 'utf8'));
    expect(isRunOrNull(read('run.v1.json'))).toBe(true);
    expect(isStatsV1(read('stats.v1.json'))).toBe(true);
  });
});

describe('layout', () => {
  const view = (width: number, height: number) => ({
    x: (720 - width) / 2,
    y: (720 - height) / 2,
    width,
    height,
  });
  const overlap = (a: Rect, b: Rect) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  it('fills a wide frame and a tall one with a large well, everything in view and nothing on the well', () => {
    const shapes = [
      [1280, 720, 1031],
      [720, 1280, 390],
      [720, 720, 600],
      [960, 720, 800],
      [720, 960, 600],
    ] as const;
    for (const [w, h, css] of shapes) {
      const v = view(w, h);
      const f = frameFor(v, css);
      const parts = [f.stash, f.next, ...f.pills, ...f.buttons];
      for (const r of [f.well, ...parts]) {
        expect(r.x).toBeGreaterThanOrEqual(v.x);
        expect(r.y).toBeGreaterThanOrEqual(v.y);
        expect(r.x + r.w).toBeLessThanOrEqual(v.x + v.width);
        expect(r.y + r.h).toBeLessThanOrEqual(v.y + v.height);
      }
      for (const r of parts) expect(overlap(r, f.well)).toBe(false);
      for (const r of [...f.pills, ...f.buttons])
        expect(overlap(r, f.stash) || overlap(r, f.next)).toBe(false);
    }
    expect(frameFor(view(1280, 720), 1031)).toMatchObject({ wide: true, cell: 38 });
    expect(frameFor(view(720, 1280), 390)).toMatchObject({ wide: false, cell: 54 });
  });
});

describe('attract', () => {
  it('the opening clears a Full Five inside the clip, then the AI keeps playing', () => {
    const sim = fresh({ queue: ATTRACT_QUEUE, pile: ATTRACT_PILE });
    let view: AttractView = { actions: OPENING[0]!, startStep: 0 };
    let serial = 0;
    let pieces = 0;
    for (let step = 0; step < 900 && sim.phase !== 'over'; step++) {
      const inputs = (attract.drive(step, view) ?? []).map((v) => ({
        action: (v as { action: Action }).action,
        down: (v as { phase: string }).phase === 'press',
      }));
      const ev = sim.step(inputs);
      if (ev.some((e) => e.type === 'spawn' || e.type === 'stash')) {
        serial++;
        view = {
          actions: serial < OPENING.length ? OPENING[serial]! : plan(sim.board, sim.piece!),
          startStep: step + 1,
        };
      }
      if (ev.some((e) => e.type === 'clear' && e.five)) expect(step).toBeGreaterThanOrEqual(30);
      pieces = sim.pieces;
    }
    expect(sim.fives).toBe(1);
    expect(sim.lastClear.step).toBeLessThan(900);
    expect(sim.stash).toBe('U');
    expect(pieces).toBeGreaterThan(8);
  });
});
