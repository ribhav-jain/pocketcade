// The rules: a 7 × 6 rack, gravity drops, four in a row. Pure TypeScript.

export const COLS = 7;
export const ROWS = 6;
export type Side = 'you' | 'bot';
/** cell values */
export const EMPTY = 0;
export const YOU = 1;
export const BOT = 2;
export const sideValue = (s: Side) => (s === 'you' ? YOU : BOT);
export const other = (s: Side): Side => (s === 'you' ? 'bot' : 'you');

/** Cells are indexed col × 6 + row, row 0 at the bottom. */
export interface Board {
  cells: Int8Array;
  heights: Uint8Array;
  count: number;
}

export const createBoard = (): Board => ({
  cells: new Int8Array(COLS * ROWS),
  heights: new Uint8Array(COLS),
  count: 0,
});
export const canPlay = (b: Board, c: number) =>
  Number.isInteger(c) && c >= 0 && c < COLS && b.heights[c]! < ROWS;
export const at = (b: Board, c: number, r: number) =>
  c < 0 || c >= COLS || r < 0 || r >= ROWS ? -1 : b.cells[c * ROWS + r]!;

/** Drops a disc; returns its row. */
export function drop(b: Board, c: number, v: number): number {
  const r = b.heights[c]!;
  b.cells[c * ROWS + r] = v;
  b.heights[c] = r + 1;
  b.count++;
  return r;
}

export function lift(b: Board, c: number): void {
  const r = --b.heights[c]!;
  b.cells[c * ROWS + r] = EMPTY;
  b.count--;
}

const DIRS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
] as const;

/** The run of 4+ through (c, r) for the disc there, or null. */
export function lineThrough(b: Board, c: number, r: number): Array<[number, number]> | null {
  const v = at(b, c, r);
  if (v <= 0) return null;
  for (const [dc, dr] of DIRS) {
    const run: Array<[number, number]> = [[c, r]];
    for (let k = 1; at(b, c + dc * k, r + dr * k) === v; k++) run.push([c + dc * k, r + dr * k]);
    for (let k = 1; at(b, c - dc * k, r - dr * k) === v; k++) run.unshift([c - dc * k, r - dr * k]);
    if (run.length >= 4) return run;
  }
  return null;
}

/** Would dropping `v` into column c make four? */
export function winsAt(b: Board, c: number, v: number): boolean {
  if (!canPlay(b, c)) return false;
  const r = drop(b, c, v);
  const win = lineThrough(b, c, r) !== null;
  lift(b, c);
  return win;
}

/** All 69 lines of four: 24 horizontal, 21 vertical, 24 diagonal. */
export const LINES: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = (() => {
  const out: Array<Array<readonly [number, number]>> = [];
  for (const [dc, dr] of DIRS)
    for (let c = 0; c < COLS; c++)
      for (let r = 0; r < ROWS; r++) {
        const cells = [0, 1, 2, 3].map((k) => [c + dc * k, r + dr * k] as const);
        if (cells.every(([x, y]) => x >= 0 && x < COLS && y >= 0 && y < ROWS)) out.push(cells);
      }
  return out;
})();

export type Outcome = { winner: Side; line: Array<[number, number]> } | { winner: 'draw' } | null;

/**
 * Replays a move list. `valid` is false if a move is illegal or a four appears before the last move.
 * `outcome` is the result of the last move (null while the round goes on).
 */
export function replay(
  moves: readonly number[],
  starter: Side,
): { board: Board; toMove: Side; outcome: Outcome; valid: boolean } {
  const board = createBoard();
  let side = starter;
  let outcome: Outcome = null;
  for (let i = 0; i < moves.length; i++) {
    const c = moves[i]!;
    if (outcome || !canPlay(board, c)) return { board, toMove: side, outcome, valid: false };
    const r = drop(board, c, sideValue(side));
    const line = lineThrough(board, c, r);
    if (line) outcome = { winner: side, line };
    else if (board.count === COLS * ROWS) outcome = { winner: 'draw' };
    side = other(side);
  }
  return { board, toMove: side, outcome, valid: true };
}
