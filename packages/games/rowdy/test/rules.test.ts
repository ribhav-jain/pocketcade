// @vitest-environment node
// Rules and the 69 lines, the attract script, each AI level's tactics,
// Hard's time slicing, a strength ladder, and the streak / starter / save bookkeeping.
import { readFileSync } from 'node:fs';
import { createRng } from '@pocketcade/toolkit';
import { describe, expect, it } from 'vitest';
import {
  createSearch,
  createTable,
  easyMove,
  mediumMove,
  ORDER,
  RAMP,
  type Level,
  type Sharpness,
} from '../src/ai.ts';
import { ATTRACT_MOVES } from '../src/attract.ts';
import {
  BOT,
  canPlay,
  createBoard,
  drop,
  LINES,
  lineThrough,
  replay,
  ROWS,
  YOU,
  type Side,
} from '../src/rules.ts';
import {
  applyResult,
  freshProgress,
  isProgressV1,
  isRoundV1,
  type Result,
  type RowdyProgressV1,
  type RowdyRoundV1,
} from '../src/save.ts';

const legal = (moves: number[]) =>
  [0, 1, 2, 3, 4, 5, 6].filter((c) => canPlay(replay(moves, 'you').board, c));

describe('rules', () => {
  it('has 69 lines; completing any of them is a win on that disc', () => {
    expect(LINES).toHaveLength(69);
    for (const line of LINES) {
      const b = createBoard();
      // Fill each column below the line with the other side so the line's cells are reachable.
      for (const [c, r] of line) {
        while (b.heights[c]! < r) drop(b, c, BOT);
        if (b.heights[c] === r) drop(b, c, YOU);
      }
      const [c, r] = line[3]!;
      expect(b.cells[c * ROWS + r]).toBe(YOU);
      expect(lineThrough(b, c, r)).not.toBeNull();
    }
  });

  it('a full board with no line is a draw; a move after a result is invalid', () => {
    const rng = createRng('rowdy:draw');
    let moves: number[] = [];
    for (let tries = 0; moves.length < 42 && tries < 500; tries++) {
      moves = [];
      for (;;) {
        const safe = legal(moves).filter((c) => !replay([...moves, c], 'you').outcome);
        if (!safe.length) break;
        moves.push(rng.pick(safe));
      }
      if (moves.length === 41) {
        const last = legal(moves)[0]!;
        if (replay([...moves, last], 'you').outcome?.winner === 'draw') moves.push(last);
      }
    }
    expect(moves).toHaveLength(42);
    expect(replay(moves, 'you').outcome).toEqual({ winner: 'draw' });
    expect(replay([0, 1, 0, 1, 0, 1, 0, 1], 'you').valid).toBe(false);
    expect(replay([0, 1, 0, 1, 0, 1, 0], 'you').outcome).toMatchObject({ winner: 'you' });
  });

  it('the attract script is legal, has no four before move 15, and move 15 wins for You', () => {
    for (let i = 1; i < ATTRACT_MOVES.length; i++) {
      const r = replay(ATTRACT_MOVES.slice(0, i), 'you');
      expect(r.valid).toBe(true);
      expect(r.outcome).toBeNull();
    }
    const end = replay([...ATTRACT_MOVES], 'you');
    expect(end.outcome).toMatchObject({ winner: 'you' });
    const line = (end.outcome as { line: Array<[number, number]> }).line;
    expect(new Set(line.map(([c, r]) => c - r)).size).toBe(1); // a "/" diagonal
  });
});

const board = (moves: number[], starter: Side = 'you') => replay(moves, starter).board;
/** Rowdy to move. */
const pick = (level: Level, moves: number[], s: Sharpness = 4) =>
  createSearch(
    board(moves),
    { level, sharpness: s, rng: createRng('ai'), age: 1 },
    { now: () => 0, nodeBudget: 50_000, table: createTable() },
  ).step(6);

describe('AI tactics', () => {
  // You: 0, 0, 0 (Rowdy 6, 6, 5) → Rowdy must block column 0. Rowdy: 6, 6, 6 → Rowdy wins in column 6.
  const blockPos = [0, 6, 0, 6, 0, 5];
  const winPos = [0, 6, 1, 6, 5, 6, 0];
  it.each(['easy', 'medium', 'hard'] as const)(
    '%s wins in 1 and blocks in 1 at full sharpness',
    (level) => {
      expect(pick(level, winPos)).toBe(6);
      expect(pick(level, blockPos)).toBe(0);
    },
  );

  it('Hard finds a win in 3 (two threats at once)', () => {
    // Rowdy has 2 and 3 on the bottom row with 1 and 4 open: playing 4 or 1 makes an open three.
    const moves = [6, 2, 6, 3, 0, 5, 0];
    const r = replay(moves, 'you');
    expect(r.toMove).toBe('bot');
    const col = pick('hard', moves)!;
    expect([1, 4]).toContain(col);
  });

  it('every level gets sharper with the streak, and Hard never searches the whole game', () => {
    for (const ramp of Object.values(RAMP))
      for (let s = 1; s < ramp.length; s++)
        expect(ramp === RAMP.blunder ? ramp[s]! <= ramp[s - 1]! : ramp[s]! >= ramp[s - 1]!).toBe(true);
    expect(RAMP.hardDepthCap[0]).toBeGreaterThan(RAMP.mediumDepth[4]);
    expect(RAMP.hardDepthCap[4]).toBeLessThan(20);
  });

  it('Hard varies its first disc but keeps it near the centre', () => {
    const rng = createRng('open');
    const firsts = new Set<number>();
    for (let i = 0; i < 30; i++)
      firsts.add(
        createSearch(
          board([]),
          { level: 'hard', sharpness: 0, rng, age: 1 },
          { now: () => 0, table: null },
        ).step(6)!,
      );
    expect([...firsts].sort()).toEqual([2, 3, 4]);
  });

  it('Hard slices stay within 8 ms and stop by 150 ms of compute ', () => {
    // Time is a function of work done: 0.004 ms per node (~250,000 nodes/s, a slow device).
    let s: ReturnType<typeof createSearch> | null = null;
    const now = () => (s?.nodes ?? 0) * 0.004;
    s = createSearch(
      board([3, 3, 2, 4, 2]),
      { level: 'hard', sharpness: 4, rng: createRng('x'), age: 1 },
      { now, table: createTable() },
    );
    let result: number | null = null;
    let slices = 0;
    let compute = 0;
    while (result === null && slices < 200) {
      const before = now();
      result = s.step(6);
      expect(now() - before).toBeLessThanOrEqual(8);
      compute += now() - before;
      slices++;
    }
    expect(result).not.toBeNull();
    expect(compute).toBeLessThanOrEqual(155);
    expect(s.depth).toBeGreaterThanOrEqual(2);
  });
});

/** Plays a full game between two movers; returns the winner ('you' = the first mover). */
function match(first: Level | 'random', second: Level | 'random', seed: string): Side | 'draw' {
  const moves: number[] = [];
  const rng = createRng(seed);
  const table = createTable();
  for (let ply = 0; ply < 42; ply++) {
    const mover = ply % 2 === 0 ? first : second;
    // The AI always plays BOT, so present the board from the mover's side.
    const b = replay(moves, ply % 2 === 0 ? 'bot' : 'you').board;
    const col =
      mover === 'random'
        ? rng.pick([0, 1, 2, 3, 4, 5, 6].filter((c) => canPlay(b, c)))
        : createSearch(
            b,
            { level: mover, sharpness: 4, rng, age: ply },
            { now: () => 0, nodeBudget: 20_000, table },
          ).step(6)!;
    moves.push(col);
    const out = replay(moves, 'you').outcome;
    if (out) return out.winner === 'draw' ? 'draw' : out.winner;
  }
  return 'draw';
}

describe('strength ladder', () => {
  it('each level beats the one below most of the time', () => {
    const score = (strong: Level, weak: Level | 'random', n: number) => {
      let wins = 0;
      for (let i = 0; i < n; i++) {
        const strongFirst = i % 2 === 0;
        const w = strongFirst ? match(strong, weak, `m${i}`) : match(weak, strong, `m${i}`);
        if (w === (strongFirst ? 'you' : 'bot')) wins++;
      }
      return wins;
    };
    expect(score('easy', 'random', 10)).toBeGreaterThanOrEqual(8);
    expect(score('medium', 'easy', 10)).toBeGreaterThanOrEqual(8);
    expect(score('hard', 'medium', 4)).toBeGreaterThanOrEqual(3);
  }, 60_000);

  it('Easy and Medium are deterministic for the same position and RNG', () => {
    const b = board([3, 2, 4]);
    expect(easyMove(b, 2, createRng('d'))).toBe(easyMove(b, 2, createRng('d')));
    expect(mediumMove(b, 0, createRng('d'))).toBe(mediumMove(b, 0, createRng('d')));
    expect(ORDER).toEqual([3, 2, 4, 1, 5, 0, 6]);
  });
});

describe('streaks and saves', () => {
  const round = (id: number, starter: Side, level = 'medium' as const): RowdyRoundV1 => ({
    roundId: id,
    level,
    sharpness: 0,
    starter,
    moves: [],
    aiRng: [1, 2, 3, 4],
  });

  it('starters alternate whatever the result; a loss ends the streak with its counts', () => {
    let p: RowdyProgressV1 = { ...freshProgress(), level: 'medium' };
    const starters: Side[] = [];
    let ended = null;
    for (const r of ['win', 'win', 'draw', 'loss'] as Result[]) {
      starters.push(p.nextStarter);
      const a = applyResult(p, round(p.lastRoundId + 1, p.nextStarter), r)!;
      p = a.progress;
      ended = a.ended ?? ended;
    }
    expect(starters).toEqual(['you', 'bot', 'you', 'bot']);
    expect(ended).toEqual({ streak: 2, draws: 1 });
    expect(p.records.medium).toEqual({ wins: 2, losses: 1, draws: 1, bestStreak: 2 });
    expect([p.streak, p.streakDraws]).toEqual([0, 0]);
    expect(isProgressV1(p)).toBe(true);
    // Applied exactly once: a stale round id changes nothing.
    expect(applyResult(p, round(p.lastRoundId, 'you'), 'win')).toBeNull();
  });

  it('rejects broken rounds; the fixtures load', () => {
    const ok = { ...round(3, 'you'), moves: [3, 3, 2] };
    expect(isRoundV1(ok)).toBe(true);
    expect(isRoundV1({ ...ok, moves: [7] })).toBe(false);
    expect(isRoundV1({ ...ok, moves: [0, 0, 0, 0, 0, 0, 0] })).toBe(false);
    expect(isRoundV1({ ...ok, moves: [0, 1, 0, 1, 0, 1, 0, 1] })).toBe(false);
    const read = (f: string) =>
      JSON.parse(readFileSync(new URL(`./fixtures/save/${f}`, import.meta.url), 'utf8'));
    expect(isProgressV1(read('progress.v1.json'))).toBe(true);
    expect(isRoundV1(read('round.v1.json'))).toBe(true);
  });
});
