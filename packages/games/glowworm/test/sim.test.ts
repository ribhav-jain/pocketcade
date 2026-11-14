// @vitest-environment node
// Rules checks for the pure simulation: movement, edges and tunnels, the turn queue, growth, collisions, combos,
// the golden berry, clearing a cave, the cave layouts, determinism, the autopilot and the save guard.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRng } from '@pocketcade/toolkit';
import { describe, expect, it } from 'vitest';
import { autopilot } from '../src/attract.ts';
import { freshStats, isStatsV1, withRun } from '../src/save.ts';
import {
  BERRY_POINTS,
  BIOMES,
  CELLS,
  CLEAR_MS,
  CLEAR_POINTS,
  COLS,
  COMBO_MAX,
  COMBO_STEP,
  COMBO_TICKS,
  DIRS,
  ENTER_MS,
  GOLDEN_AT,
  GOLDEN_MS,
  GOLDEN_POINTS,
  LAYOUT_COUNT,
  QUOTA,
  ROWS,
  START_HEAD,
  START_LEN,
  TICK_MIN_MS,
  TICK_START_MS,
  caveFor,
  cellAt,
  cellY,
  createRun,
  floodCount,
  makeCave,
  stepCell,
  tapDir,
  tickMsFor,
  type Run,
  type Setup,
  type SimEvent,
} from '../src/sim.ts';

const rng = (seed = 't') => createRng(seed);
const at = (x: number, y: number) => cellAt(x, y);
const OPEN = makeCave(1, [], 'all', 'all');
const WALLED = makeCave(1, [], [], []);
/** A started run in an empty cave whose edges all wrap, unless the setup says otherwise. */
const started = (setup: Setup, seed = 't') => {
  const r = createRun(rng(seed), { cave: OPEN, ...setup });
  r.turn(setup.heading ?? 'right');
  return r;
};
/** Every cell in a boustrophedon path: row 0 left to right, row 1 right to left, … */
const SERPENTINE = Array.from({ length: CELLS }, (_, i) => {
  const y = Math.floor(i / COLS);
  const x = y % 2 ? COLS - 1 - (i % COLS) : i % COLS;
  return at(x, y);
});
/** One tick with the autopilot steering. */
const autoStep = (r: Run): SimEvent[] => {
  const d = autopilot(r);
  if (d) r.turn(d);
  return r.step();
};
const line = { body: [at(5, 5), at(4, 5), at(3, 5)], heading: 'right' as const };

describe('start and movement', () => {
  it('waits for the first direction, ignores backwards, then moves one cell per tick', () => {
    const r = createRun(rng());
    expect(r.body).toEqual([START_HEAD, START_HEAD - 1, START_HEAD - 2, START_HEAD - 3]);
    expect(r.advance(5000)).toEqual([]);
    expect(r.turn('left')).toEqual([]);
    expect(r.phase).toBe('ready');
    expect(r.turn('up')).toEqual([{ type: 'start' }]);
    r.advance(TICK_START_MS - 1);
    expect(r.body[0]).toBe(START_HEAD);
    r.advance(1);
    expect(r.body[0]).toBe(START_HEAD - COLS);
    expect(r.prev[0]).toBe(START_HEAD);
    expect(r.body).toHaveLength(START_LEN);
  });

  it('eases from the start speed toward top speed', () => {
    expect(tickMsFor(0)).toBe(TICK_START_MS);
    expect(tickMsFor(8)).toBeLessThan(tickMsFor(4));
    expect(tickMsFor(4) - tickMsFor(8)).toBeLessThan(tickMsFor(0) - tickMsFor(4));
    expect(tickMsFor(500)).toBe(TICK_MIN_MS);
  });
});

describe('edges', () => {
  const edge = { body: [at(16, 5), at(15, 5), at(14, 5)], heading: 'right' as const, berry: 0 };
  it('an open edge wraps around', () => {
    const r = started(edge);
    r.step();
    expect(r.body[0]).toBe(at(0, 5));
    expect(stepCell(at(3, 0), 'up', OPEN)).toBe(at(3, ROWS - 1));
    expect(stepCell(at(3, ROWS - 1), 'down', OPEN)).toBe(at(3, 0));
  });
  it('a wall ends the run', () => {
    const r = started({ ...edge, cave: WALLED });
    expect(r.step()).toEqual([{ type: 'die', cause: 'wall' }]);
    expect(r.phase).toBe('dead');
    expect(r.advance(1000)).toEqual([]);
  });
  it('a tunnel wraps only its own row or column', () => {
    const cave = makeCave(1, [], [5], [2]);
    expect(stepCell(at(16, 5), 'right', cave)).toBe(at(0, 5));
    expect(stepCell(at(0, 5), 'left', cave)).toBe(at(16, 5));
    expect(stepCell(at(16, 6), 'right', cave)).toBe(-1);
    expect(stepCell(at(2, 0), 'up', cave)).toBe(at(2, ROWS - 1));
    expect(stepCell(at(3, 0), 'up', cave)).toBe(-1);
  });
  it('a crystal ahead ends the run', () => {
    const r = started({ ...line, berry: 0, cave: makeCave(1, [at(6, 5)], [], []) });
    expect(r.step()).toEqual([{ type: 'die', cause: 'crystal' }]);
  });
});

describe('turn queue', () => {
  it('queues two turns, ignoring repeats and reversals of the last queued direction', () => {
    const r = createRun(rng());
    r.turn('right');
    r.turn('left'); // reversal of the heading
    r.turn('right'); // repeat
    expect(r.queue).toEqual([]);
    r.turn('up');
    r.turn('up'); // repeat of the queued turn
    r.turn('down'); // reversal of the queued turn
    expect(r.queue).toEqual(['up']);
    r.turn('left');
    r.turn('down'); // queue full
    expect(r.queue).toEqual(['up', 'left']);
    r.step();
    expect(r.body[0]).toBe(START_HEAD - COLS);
    r.step();
    expect(r.body[0]).toBe(START_HEAD - COLS - 1);
    expect(r.queue).toEqual([]);
  });

  it('tap-to-turn picks the side of the head across the heading', () => {
    expect(tapDir('right', 30, -5)).toBe('up');
    expect(tapDir('left', -30, 12)).toBe('down');
    expect(tapDir('up', -1, -40)).toBe('left');
    expect(tapDir('right', 50, 0)).toBeNull();
  });
});

describe('growth, collisions and scoring', () => {
  it('eating grows Wick by one, scores 10 and speeds up', () => {
    const r = started({ ...line, berry: at(6, 5) });
    expect(r.step()[0]).toEqual({
      type: 'eat',
      cell: at(6, 5),
      golden: false,
      points: BERRY_POINTS,
      chain: 1,
    });
    expect(r.body).toEqual([at(6, 5), at(5, 5), at(4, 5), at(3, 5)]);
    expect(r.score).toBe(BERRY_POINTS);
    expect(r.got).toBe(1);
    expect(r.tickMs).toBeLessThan(TICK_START_MS);
    expect(r.body).not.toContain(r.berry);
    r.step();
    expect(r.body).toEqual([at(7, 5), at(6, 5), at(5, 5), at(4, 5)]);
  });

  it('biting the body ends the run; the cell the tail leaves is safe unless Wick is growing', () => {
    // a loop: moving down from (5,5) meets the body at (5,6)
    const loop = [at(5, 5), at(6, 5), at(6, 6), at(5, 6), at(4, 6)];
    const r = started({ body: loop, heading: 'down', berry: 0 });
    expect(r.step()).toEqual([{ type: 'die', cause: 'self' }]);
    expect(r.cause).toBe('self');
    const chase = started({ body: loop.slice(0, 4), heading: 'down', berry: 0 });
    expect(chase.step()).toEqual([]);
    expect(chase.body[0]).toBe(at(5, 6));
    const growing = started({ body: loop.slice(0, 4), heading: 'down', berry: 0, length: 6 });
    expect(growing.step()).toEqual([{ type: 'die', cause: 'self' }]);
  });

  it('quick pickups in a row score more, up to the cap; a slow one starts over', () => {
    let goldens = 0;
    for (let seed = 0; seed < 3; seed++) {
      const r = createRun(rng(`combo${seed}`));
      let chain = 0;
      let last = 0;
      for (let i = 0; i < 1200 && r.phase !== 'dead'; i++) {
        if (r.phase === 'cleared') r.advance(CLEAR_MS);
        for (const e of autoStep(r)) {
          if (e.type !== 'eat') continue;
          chain = chain > 0 && r.ticks - last <= COMBO_TICKS ? chain + 1 : 1;
          last = r.ticks;
          const combo = BERRY_POINTS + COMBO_STEP * (Math.min(chain, COMBO_MAX) - 1);
          expect(e.chain).toBe(chain);
          expect(e.points).toBe(e.golden ? GOLDEN_POINTS : combo);
          if (e.golden) goldens++;
          // a new cave starts a new combo
          if (r.phase === 'cleared') chain = 0;
        }
        expect(r.chain).toBe(r.phase === 'playing' && r.ticks - last <= COMBO_TICKS ? chain : 0);
      }
    }
    expect(goldens).toBeGreaterThan(0);
  });

  it('a golden berry appears once per cave and fades after 6 s', () => {
    for (let seed = 0; seed < 50; seed++) {
      const r = started({ ...line, berry: at(6, 5), got: GOLDEN_AT - 1 }, `g${seed}`);
      expect(r.step().some((e) => e.type === 'golden')).toBe(true);
      expect(r.golden).toBeGreaterThanOrEqual(0);
      expect(r.golden).not.toBe(r.berry);
      expect(r.body).not.toContain(r.golden);
      expect(r.goldenLeftMs).toBe(GOLDEN_MS);
      // Wick circles row 5 forever; use a seed that keeps both berries off that row
      if (cellY(r.golden) === 5 || cellY(r.berry) === 5) continue;
      let t = 0;
      let gone = -1;
      while (gone < 0 && t < GOLDEN_MS + 1000) {
        t += 10;
        if (r.advance(10).some((e) => e.type === 'golden-gone')) gone = t;
      }
      expect(gone).toBe(GOLDEN_MS);
      expect(r.golden).toBe(-1);
      expect(r.phase).toBe('playing');
      return;
    }
    throw new Error('no seed exercised the golden berry');
  });
});

describe('clearing a cave', () => {
  const lastBerry = () => started({ ...line, berry: at(6, 5), got: QUOTA - 1, length: 12 });

  it('the last berry clears the cave, pauses, then starts the next one at full length', () => {
    const r = lastBerry();
    const ev = r.step();
    expect(ev.map((e) => e.type)).toEqual(['eat', 'clear']);
    expect(r.phase).toBe('cleared');
    expect(r.score).toBe(BERRY_POINTS + CLEAR_POINTS);
    expect(r.berry).toBe(-1);
    expect(r.turn('up')).toEqual([]);
    expect(r.advance(CLEAR_MS - 1)).toEqual([]);
    expect(r.advance(1)).toEqual([{ type: 'cave', depth: 2 }]);
    expect(r.phase).toBe('playing');
    expect(r.cave.depth).toBe(2);
    expect(r.got).toBe(0);
    expect(r.body).toEqual([START_HEAD, START_HEAD - 1, START_HEAD - 2, START_HEAD - 3]);
    expect(r.length).toBe(13);
    expect(r.growing).toBe(true);
    expect(r.berry).toBeGreaterThanOrEqual(0);
    // Wick waits a moment in the new cave, taking turns meanwhile
    r.turn('up');
    r.advance(ENTER_MS - 1);
    expect(r.ticks).toBe(1);
    r.advance(r.tickMs + 1);
    expect(r.body[0]).toBe(START_HEAD - COLS);
    expect(r.body).toHaveLength(START_LEN + 1);
  });

  it('a full cave is a win', () => {
    const body = SERPENTINE.slice(0, CELLS - 1).reverse();
    const r = started({ body, berry: SERPENTINE[CELLS - 1]!, heading: 'right' });
    expect(r.step().map((e) => e.type)).toEqual(['eat', 'won']);
    expect(r.phase).toBe('won');
    expect(r.advance(1000)).toEqual([]);
  });
});

describe('cave layouts', () => {
  it('keep the start clear, leave no dead ends and never wall off a region', () => {
    for (let depth = 1; depth <= LAYOUT_COUNT; depth++) {
      const cave = caveFor(depth);
      const blocked = new Uint8Array(CELLS);
      for (const c of cave.blocks) blocked[c] = 1;
      expect(new Set(cave.blocks).size, `cave ${depth}`).toBe(cave.blocks.length);
      for (let x = 2; x <= 12; x++) expect(blocked[at(x, 8)], `cave ${depth} start row`).toBe(0);
      for (let x = 5; x <= 8; x++)
        for (const y of [7, 9]) expect(blocked[at(x, y)], `cave ${depth} start turn`).toBe(0);
      expect(floodCount(START_HEAD, blocked, cave), `cave ${depth}`).toBe(
        CELLS - cave.blocks.length,
      );
      for (let c = 0; c < CELLS; c++) {
        if (blocked[c]) continue;
        const exits = DIRS.filter((d) => {
          const nb = stepCell(c, d, cave);
          return nb >= 0 && !blocked[nb];
        }).length;
        expect(exits, `cave ${depth} cell ${c}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('cycle layouts and palettes after the last one', () => {
    expect(caveFor(LAYOUT_COUNT + 1).blocks).toEqual(caveFor(1).blocks);
    expect(caveFor(BIOMES + 1).biome).toBe(0);
    expect(caveFor(2).biome).toBe(1);
  });
});

describe('determinism and the autopilot', () => {
  it('replays identically for the same seed and inputs', () => {
    const play = (seed: string) => {
      const r = createRun(rng(seed), { depth: 2 });
      const log: SimEvent[] = [];
      for (let i = 0; i < 400 && r.phase !== 'dead' && r.phase !== 'won'; i++) {
        const d = autopilot(r);
        if (d) log.push(...r.turn(d));
        log.push(...r.advance(16));
        log.push(...r.advance(17));
      }
      return { log, body: [...r.body], score: r.score, berry: r.berry, golden: r.golden };
    };
    expect(play('d1')).toEqual(play('d1'));
    expect(play('d1').log).not.toEqual(play('d2').log);
  });

  it('plays through several caves without dying, and berries never land on Wick or a crystal', () => {
    for (let seed = 0; seed < 4; seed++) {
      const r = createRun(rng(`ap${seed}`));
      for (let i = 0; i < 450 && r.phase !== 'dead'; i++) {
        if (r.phase === 'cleared') r.advance(CLEAR_MS);
        else autoStep(r);
        for (const c of [r.berry, r.golden])
          if (c >= 0) expect(r.body.includes(c) || r.cave.blocks.includes(c)).toBe(false);
        if (r.berry >= 0) expect(r.berry).not.toBe(r.golden);
      }
      expect(r.phase, `seed ${seed} after ${r.ticks} ticks`).not.toBe('dead');
      expect(r.cave.depth).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('saves', () => {
  const fixture = (name: string) =>
    JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures/save', name), 'utf8')) as never;
  it('accepts the committed fixture and the defaults, and rejects broken data', () => {
    expect(isStatsV1(fixture('stats.v1.json'))).toBe(true);
    expect(isStatsV1(freshStats())).toBe(true);
    expect(isStatsV1({ best: 1, played: 1, longest: 4 })).toBe(false);
    expect(isStatsV1({ ...freshStats(), best: -1 })).toBe(false);
    expect(isStatsV1({ ...freshStats(), longest: CELLS + 1 })).toBe(false);
    expect(isStatsV1(null)).toBe(false);
  });
  it('records a run', () => {
    const s = withRun(freshStats(), { score: 120, length: 16, depth: 3 });
    expect(s).toEqual({ best: 120, played: 1, longest: 16, deepest: 3 });
    expect(withRun(s, { score: 40, length: 8, depth: 1 })).toEqual({ ...s, played: 2 });
  });
});
