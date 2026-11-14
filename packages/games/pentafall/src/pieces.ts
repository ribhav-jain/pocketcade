// The 18 one-sided pentominoes, each in a 5 × 5 box that contains the pivot (2, 2) in every orientation.
// PIECE_IDS order is canonical: the save encodes a settled cell as 'a' + its piece's index.

export const PIECE_IDS = [
  'I',
  'L',
  'Lm',
  'N',
  'Nm',
  'P',
  'Pm',
  'T',
  'U',
  'V',
  'W',
  'X',
  'Y',
  'Ym',
  'Z',
  'Zm',
  'F',
  'Fm',
] as const;
export type PieceId = (typeof PIECE_IDS)[number];
export type Family = 'bar' | 'hook' | 'step' | 'block' | 'branch' | 'bolt' | 'kite' | 'chalk';
export type Cell = readonly [number, number];

interface PieceDef {
  family: Family;
  tier: 0 | 1 | 2 | 3;
  /** spawn shape: box rows 0–4 */
  rows: readonly string[];
  mirror: boolean;
}

const _ = '.....';
const DEFS: Record<PieceId, PieceDef> = {
  I: { family: 'bar', tier: 0, rows: [_, _, '#####', _, _], mirror: false },
  L: { family: 'hook', tier: 0, rows: [_, '...#.', '####.', _, _], mirror: false },
  Lm: { family: 'hook', tier: 0, rows: [_, '.#...', '.####', _, _], mirror: true },
  N: { family: 'step', tier: 1, rows: [_, '.##..', '..###', _, _], mirror: false },
  Nm: { family: 'step', tier: 1, rows: [_, '..##.', '###..', _, _], mirror: true },
  P: { family: 'block', tier: 0, rows: [_, '.##..', '.###.', _, _], mirror: false },
  Pm: { family: 'block', tier: 0, rows: [_, '..##.', '.###.', _, _], mirror: true },
  T: { family: 'chalk', tier: 0, rows: [_, '..#..', '..#..', '.###.', _], mirror: false },
  U: { family: 'chalk', tier: 0, rows: [_, '.#.#.', '.###.', _, _], mirror: false },
  V: { family: 'chalk', tier: 0, rows: ['.#...', '.#...', '.###.', _, _], mirror: false },
  W: { family: 'chalk', tier: 2, rows: [_, '.#...', '.##..', '..##.', _], mirror: false },
  X: { family: 'chalk', tier: 3, rows: [_, '..#..', '.###.', '..#..', _], mirror: false },
  Y: { family: 'branch', tier: 0, rows: [_, '..#..', '####.', _, _], mirror: false },
  Ym: { family: 'branch', tier: 0, rows: [_, '..#..', '.####', _, _], mirror: true },
  Z: { family: 'bolt', tier: 1, rows: [_, '.##..', '..#..', '..##.', _], mirror: false },
  Zm: { family: 'bolt', tier: 1, rows: [_, '..##.', '..#..', '.##..', _], mirror: true },
  F: { family: 'kite', tier: 2, rows: [_, '..##.', '.##..', '..#..', _], mirror: false },
  Fm: { family: 'kite', tier: 2, rows: [_, '.##..', '..##.', '..#..', _], mirror: true },
};

export const family = (id: PieceId) => DEFS[id].family;
export const tierOf = (id: PieceId) => DEFS[id].tier;
export const isMirror = (id: PieceId) => DEFS[id].mirror;
export const pieceIndex = (id: PieceId) => PIECE_IDS.indexOf(id);

/** Clockwise with y down: (x, y) → (4 − y, x); the pivot (2, 2) stays put. */
const rotCW = ([x, y]: Cell): Cell => [4 - y, x];

/** Box cells per rotation state 0–3 (0 = spawn), sorted for comparison. */
const SHAPES = {} as Record<PieceId, readonly (readonly Cell[])[]>;
for (const id of PIECE_IDS) {
  const spawn: Cell[] = [];
  DEFS[id].rows.forEach((row, y) => [...row].forEach((c, x) => c === '#' && spawn.push([x, y])));
  const states = [spawn];
  for (let r = 1; r < 4; r++) states.push(states[r - 1]!.map(rotCW));
  SHAPES[id] = states.map((s) => [...s].sort((a, b) => a[1] - b[1] || a[0] - b[0]));
}

export const boxCells = (id: PieceId, rot: number): readonly Cell[] =>
  SHAPES[id][((rot % 4) + 4) % 4]!;

/** Turn states that differ (I, Z, Zm: 2; X: 1; others 4). */
export function distinctRotations(id: PieceId): number[] {
  const seen = new Set<string>();
  return [0, 1, 2, 3].filter((r) => {
    const key = JSON.stringify(boxCells(id, r));
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Box row offset at spawn: the top cell lands in row 3 (I → 1, V → 3, others → 2). */
export const spawnY = (id: PieceId) => 3 - Math.min(...boxCells(id, 0).map(([, y]) => y));
export const SPAWN_X = 3;
