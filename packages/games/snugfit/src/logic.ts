// Pure Snugfit rules: the patch shapes, the fit test, placing, line clears, scoring, dealing and the game-over
// test. No DOM, no Phaser, no clock; all randomness comes from the Rng passed in.
import type { Rng, RngState } from '@pocketcade/toolkit';

/** The quilt is SIZE × SIZE squares, stored row-major from the top-left. */
export const SIZE = 8;
export const CELLS = SIZE * SIZE;
/** Fabric colours are 1..COLOURS; 0 is an empty square. */
export const COLOURS = 6;
export const HAND = 3;

export type Family =
  | 'dot'
  | 'bar2'
  | 'bar3'
  | 'bar4'
  | 'bar5'
  | 'square2'
  | 'square3'
  | 'corner3'
  | 'corner5'
  | 'ell'
  | 'tee'
  | 'ess';

export interface Shape {
  readonly family: Family;
  readonly w: number;
  readonly h: number;
  /** [col, row] offsets from the shape's top-left corner */
  readonly cells: readonly (readonly [number, number])[];
}

/**
 * How often a family is dealt on an empty quilt (shared between its orientations) and how bulky it is:
 * 0 = small (helps on a crowded quilt), 1 = medium, 2 = large (needs open space).
 */
const FAMILIES: Record<Family, { weight: number; bulk: 0 | 1 | 2 }> = {
  dot: { weight: 4, bulk: 0 },
  bar2: { weight: 7, bulk: 0 },
  bar3: { weight: 9, bulk: 0 },
  corner3: { weight: 10, bulk: 0 },
  bar4: { weight: 7, bulk: 1 },
  square2: { weight: 7, bulk: 1 },
  ell: { weight: 10, bulk: 1 },
  tee: { weight: 7, bulk: 1 },
  ess: { weight: 6, bulk: 1 },
  bar5: { weight: 5, bulk: 2 },
  corner5: { weight: 5, bulk: 2 },
  square3: { weight: 4, bulk: 2 },
};

/** Every orientation is its own shape (the player cannot rotate). Saves store the index: only ever append. */
const DEFS: readonly (readonly [Family, readonly string[]])[] = [
  ['dot', ['#']],
  ['bar2', ['##']],
  ['bar2', ['#', '#']],
  ['bar3', ['###']],
  ['bar3', ['#', '#', '#']],
  ['bar4', ['####']],
  ['bar4', ['#', '#', '#', '#']],
  ['bar5', ['#####']],
  ['bar5', ['#', '#', '#', '#', '#']],
  ['square2', ['##', '##']],
  ['square3', ['###', '###', '###']],
  ['corner3', ['##', '#.']],
  ['corner3', ['##', '.#']],
  ['corner3', ['#.', '##']],
  ['corner3', ['.#', '##']],
  ['corner5', ['###', '#..', '#..']],
  ['corner5', ['###', '..#', '..#']],
  ['corner5', ['#..', '#..', '###']],
  ['corner5', ['..#', '..#', '###']],
  ['ell', ['#.', '#.', '##']],
  ['ell', ['.#', '.#', '##']],
  ['ell', ['##', '#.', '#.']],
  ['ell', ['##', '.#', '.#']],
  ['ell', ['###', '#..']],
  ['ell', ['###', '..#']],
  ['ell', ['#..', '###']],
  ['ell', ['..#', '###']],
  ['tee', ['###', '.#.']],
  ['tee', ['.#.', '###']],
  ['tee', ['#.', '##', '#.']],
  ['tee', ['.#', '##', '.#']],
  ['ess', ['.##', '##.']],
  ['ess', ['##.', '.##']],
  ['ess', ['#.', '##', '.#']],
  ['ess', ['.#', '##', '#.']],
];

export const SHAPES: readonly Shape[] = DEFS.map(([family, rows]) => ({
  family,
  w: rows[0]!.length,
  h: rows.length,
  cells: rows.flatMap((line, r) =>
    [...line].flatMap((ch, c) => (ch === '#' ? [[c, r] as const] : [])),
  ),
}));

const ORIENTATIONS = SHAPES.reduce<Partial<Record<Family, number>>>((n, s) => {
  n[s.family] = (n[s.family] ?? 0) + 1;
  return n;
}, {});

export interface Piece {
  /** index into SHAPES */
  shape: number;
  /** 1..COLOURS */
  colour: number;
}

export interface GameState {
  /** CELLS colour codes, 0 = empty */
  board: number[];
  /** HAND slots; null once that patch has been placed */
  hand: (Piece | null)[];
  score: number;
  /** placements in a row that each stitched at least one line (0 after a placement without one) */
  streak: number;
  /** patches placed this game */
  placed: number;
  /** lines stitched this game */
  lines: number;
  /** RNG state after the last deal */
  rng: RngState;
}

export const POINTS = {
  /** per square of a placed patch */
  cell: 1,
  /** stitched lines score line × (1 + 2 + … + n): 10, 30, 60, 100 … */
  line: 10,
  /** the streak multiplies the line bonus, up to this */
  maxStreak: 8,
  /** emptying the whole quilt */
  cleanQuilt: 300,
  /** score at which the deal reaches its hardest mix */
  ramp: 6000,
} as const;

export function fits(board: readonly number[], shape: Shape, col: number, row: number): boolean {
  if (col < 0 || row < 0 || col + shape.w > SIZE || row + shape.h > SIZE) return false;
  for (const [c, r] of shape.cells) if (board[(row + r) * SIZE + col + c] !== 0) return false;
  return true;
}

export function fitsAnywhere(board: readonly number[], shape: Shape): boolean {
  for (let row = 0; row <= SIZE - shape.h; row++)
    for (let col = 0; col <= SIZE - shape.w; col++) if (fits(board, shape, col, row)) return true;
  return false;
}

export interface Lines {
  rows: number[];
  cols: number[];
}

/** The rows and columns that are full once `shape` sits at (col, row). The shape must fit there. */
export function linesAfter(
  board: readonly number[],
  shape: Shape,
  col: number,
  row: number,
): Lines {
  const covers = (c: number, r: number) =>
    shape.cells.some(([sc, sr]) => sc + col === c && sr + row === r);
  const full = (c: number, r: number) => board[r * SIZE + c] !== 0 || covers(c, r);
  const lines: Lines = { rows: [], cols: [] };
  for (let r = row; r < row + shape.h; r++) {
    let all = true;
    for (let c = 0; c < SIZE && all; c++) all = full(c, r);
    if (all) lines.rows.push(r);
  }
  for (let c = col; c < col + shape.w; c++) {
    let all = true;
    for (let r = 0; r < SIZE && all; r++) all = full(c, r);
    if (all) lines.cols.push(c);
  }
  return lines;
}

/** Line bonus before the streak multiplier: grows faster than the number of lines stitched at once. */
export function lineBonus(lines: number): number {
  return (POINTS.line * lines * (lines + 1)) / 2;
}

export interface Gain {
  cells: number;
  /** line bonus × multiplier */
  clear: number;
  multiplier: number;
  clean: number;
  total: number;
}

/** Points for one placement. `streak` already counts this placement when it stitched a line. */
export function gainFor(cells: number, lines: number, streak: number, clean: boolean): Gain {
  const multiplier = lines > 0 ? Math.min(Math.max(1, streak), POINTS.maxStreak) : 1;
  const clear = lineBonus(lines) * multiplier;
  const bonus = clean ? POINTS.cleanQuilt : 0;
  return {
    cells: cells * POINTS.cell,
    clear,
    multiplier,
    clean: bonus,
    total: cells * POINTS.cell + clear + bonus,
  };
}

/** True when at least one waiting patch still fits somewhere. */
export function canPlaceAny(board: readonly number[], hand: readonly (Piece | null)[]): boolean {
  return hand.some((p) => p !== null && fitsAnywhere(board, SHAPES[p.shape]!));
}

const filled = (board: readonly number[]) => board.reduce((n, c) => n + (c !== 0 ? 1 : 0), 0);

/**
 * Deals a fresh hand for this quilt. A crowded quilt favours small patches and a high score brings more large
 * ones; a shape that has no room right now is unlikely. The first patch drawn always fits somewhere, so a new
 * hand is never dead on arrival; the hand is then shuffled so that patch is not always in the same slot.
 */
export function deal(board: readonly number[], score: number, rng: Rng): Piece[] {
  const fill = filled(board) / CELLS;
  const level = Math.min(1, score / POINTS.ramp);
  const room = SHAPES.map((s) => fitsAnywhere(board, s));
  const bulkFactor = [
    1 + 1.5 * fill - 0.2 * level,
    1,
    Math.max(0.1, 1 - 1.1 * fill) * (0.75 + 0.6 * level),
  ];
  const mercy = 0.2 + 0.4 * level;
  const colours = rng.shuffle(Array.from({ length: COLOURS }, (_, i) => i + 1));
  const hand: Piece[] = [];
  for (let i = 0; i < HAND; i++) {
    const weights = SHAPES.map((s, index) => {
      if (!room[index] && i === 0) return [index, 0] as const;
      const f = FAMILIES[s.family];
      const repeat = hand.some((p) => p.shape === index) ? 0.35 : 1;
      const base = f.weight / ORIENTATIONS[s.family]!;
      return [index, base * bulkFactor[f.bulk]! * (room[index] ? 1 : mercy) * repeat] as const;
    });
    hand.push({ shape: rng.weighted(weights), colour: colours[i]! });
  }
  return rng.shuffle(hand);
}

export function newGame(rng: Rng): GameState {
  const board = new Array<number>(CELLS).fill(0);
  const hand = deal(board, 0, rng);
  return { board, hand, score: 0, streak: 0, placed: 0, lines: 0, rng: rng.state() };
}

export interface PlaceOutcome {
  next: GameState;
  /** board indexes the patch covered */
  placed: number[];
  rows: number[];
  cols: number[];
  /** every square that was stitched away, with the colour it had */
  cleared: { index: number; colour: number }[];
  gain: Gain;
  /** the whole quilt was emptied */
  clean: boolean;
  /** the hand was used up and three new patches were dealt */
  dealt: boolean;
  /** no waiting patch fits any more */
  over: boolean;
}

/**
 * Places the patch in `slot` with its top-left corner at (col, row), clears full lines, scores, deals a new hand
 * when the last patch was used, and reports what happened. Returns null when the move is not legal.
 */
export function place(
  state: GameState,
  slot: number,
  col: number,
  row: number,
  rng: Rng,
): PlaceOutcome | null {
  const piece = state.hand[slot];
  if (!piece) return null;
  const shape = SHAPES[piece.shape]!;
  if (!fits(state.board, shape, col, row)) return null;

  const { rows, cols } = linesAfter(state.board, shape, col, row);
  const board = [...state.board];
  const placed = shape.cells.map(([c, r]) => (row + r) * SIZE + col + c);
  for (const i of placed) board[i] = piece.colour;

  const gone = new Set<number>();
  for (const r of rows) for (let c = 0; c < SIZE; c++) gone.add(r * SIZE + c);
  for (const c of cols) for (let r = 0; r < SIZE; r++) gone.add(r * SIZE + c);
  const cleared = [...gone].map((index) => ({ index, colour: board[index]! }));
  for (const i of gone) board[i] = 0;

  const lines = rows.length + cols.length;
  const streak = lines > 0 ? state.streak + 1 : 0;
  const clean = lines > 0 && board.every((c) => c === 0);
  const gain = gainFor(placed.length, lines, streak, clean);
  const score = state.score + gain.total;

  let hand = state.hand.map((p, i) => (i === slot ? null : p));
  const dealt = hand.every((p) => p === null);
  if (dealt) hand = deal(board, score, rng);

  return {
    next: {
      board,
      hand,
      score,
      streak,
      placed: state.placed + 1,
      lines: state.lines + lines,
      rng: rng.state(),
    },
    placed,
    rows,
    cols,
    cleared,
    gain,
    clean,
    dealt,
    over: !canPlaceAny(board, hand),
  };
}

export interface Move {
  slot: number;
  col: number;
  row: number;
}

/**
 * The greedy move the self-playing demo makes: stitch as many lines as possible, otherwise tuck the patch where
 * it touches the most edges and leaves the fewest single-square holes. Ties go to the first move found.
 */
export function bestMove(state: Pick<GameState, 'board' | 'hand'>): Move | null {
  const { board } = state;
  const taken = (c: number, r: number) =>
    c < 0 || r < 0 || c >= SIZE || r >= SIZE || board[r * SIZE + c] !== 0;
  let best: Move | null = null;
  let bestValue = -Infinity;
  state.hand.forEach((piece, slot) => {
    if (!piece) return;
    const shape = SHAPES[piece.shape]!;
    for (let row = 0; row <= SIZE - shape.h; row++) {
      for (let col = 0; col <= SIZE - shape.w; col++) {
        if (!fits(board, shape, col, row)) continue;
        const covers = (c: number, r: number) =>
          shape.cells.some(([sc, sr]) => sc + col === c && sr + row === r);
        const lines = linesAfter(board, shape, col, row);
        let contact = 0;
        let holes = 0;
        for (const [sc, sr] of shape.cells) {
          for (const [dc, dr] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ] as const) {
            const c = col + sc + dc;
            const r = row + sr + dr;
            if (covers(c, r)) continue;
            if (taken(c, r)) contact++;
            else if (
              [
                [1, 0],
                [-1, 0],
                [0, 1],
                [0, -1],
              ].every(([ec, er]) => taken(c + ec!, r + er!) || covers(c + ec!, r + er!))
            )
              holes++;
          }
        }
        const value =
          (lines.rows.length + lines.cols.length) * 100 +
          contact * 3 -
          holes * 8 +
          shape.cells.length;
        if (value > bestValue) {
          bestValue = value;
          best = { slot, col, row };
        }
      }
    }
  });
  return best;
}
