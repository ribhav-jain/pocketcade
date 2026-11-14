// Pop Reef's levels: four reef zones of ten authored boards each, then an endless run of generated ones.
// A board is described by a shape (which cells are filled), a colour pattern and where the specials sit; the same
// level number always builds the same board. Pure data and maths: the rules are in sim.ts.
import { createRng, type Rng } from '@pocketcade/toolkit';
import {
  CELL_COUNT,
  COLOURS,
  COLS,
  STONE,
  URCHIN,
  floating,
  isColour,
  neighbours,
  rowLen,
  type Goal,
  type LevelSetup,
} from './sim.ts';

export const ZONES = 4;
export const ZONE_LEVELS = 10;
/** Levels with a hand-made board; later ones are generated. */
export const AUTHORED = ZONES * ZONE_LEVELS;
/** The last level number a save can hold. */
export const MAX_LEVEL = 999;
/** The reef zone (0..ZONES-1) a level is in; the zones repeat in the endless levels. */
export const zoneOf = (level: number) => Math.floor((level - 1) / ZONE_LEVELS) % ZONES;

/** A first-time hint shown when a level introduces something. */
export type Tip = 'match' | 'drop' | 'rainbow' | 'stone' | 'fish' | 'urchin';

export interface Level extends LevelSetup {
  n: number;
  zone: number;
  cells: Int8Array;
  fish: Uint8Array;
  goal: Goal;
  tip?: Tip;
}

/** A cell while a board is being built: row, column and `x`, its centre in half-bubble steps from the middle. */
interface Spot {
  r: number;
  c: number;
  x: number;
  i: number;
}
interface Build {
  cells: Int8Array;
  rng: Rng;
  kinds: number;
}
type Mask = (s: Spot) => boolean;
/** Returns a colour index; the builder wraps it into the level's colours. */
type Paint = (s: Spot, b: Build) => number;

interface Def {
  /** rows filled (with `art`, the number of art rows) */
  rows: number;
  kinds: number;
  /**
   * A hand-drawn board, one string per row (10 cells, then 9, alternating): `.` empty, `?` a bubble coloured by
   * `paint`, `a`–`f` a fixed colour, `#` a stone, `*` an urchin. `$` and capitals carry a fish.
   */
  art?: readonly string[];
  /** filled cells (default: every cell of the first `rows` rows) */
  shape?: Mask;
  paint: Paint;
  /** chance a bubble takes a random colour instead of the pattern's */
  noise?: number;
  /** rotates the pattern's colours so levels don't all start red */
  rot?: number;
  stone?: Mask;
  urchin?: Mask;
  /** fish ride the coloured bubbles picked here; any fish makes it a rescue level */
  fish?: Mask;
  par: number;
  pushEvery?: number;
  tip?: Tip;
}

const mod = (a: number, n: number) => ((a % n) + n) % n;
/** Hex steps between a spot and the point (x, r), in bubbles. */
const dist = (s: Spot, x: number, r: number) => {
  const dy = Math.abs(s.r - r);
  return dy + Math.max(0, Math.abs(s.x - x) / 2 - dy / 2);
};

// ─── shapes ───
const any =
  (...m: Mask[]): Mask =>
  (s) =>
    m.some((f) => f(s));
const both =
  (...m: Mask[]): Mask =>
  (s) =>
    m.every((f) => f(s));
const not =
  (m: Mask): Mask =>
  (s) =>
    !m(s);
const rowsFrom =
  (from: number, to = 99): Mask =>
  (s) =>
    s.r >= from && s.r <= to;
/** An upside-down triangle: `half` half-steps wide at the top, narrowing by `slope` per row. */
const vee =
  (slope: number, half = 9): Mask =>
  (s) =>
    Math.abs(s.x) <= half - s.r * slope;
/** Vertical strands `w` half-steps wide with `gap` between them. */
const strands =
  (w: number, gap: number, off = 0): Mask =>
  (s) =>
    mod(s.x + 9 + off, w + gap) < w;
/** Narrow at row `mid`, widening by `slope` per row away from it. */
const waist =
  (mid: number, slope: number, min: number): Mask =>
  (s) =>
    Math.abs(s.x) <= min + Math.abs(s.r - mid) * slope;
/** A round clump of radius `rad` bubbles around (x, r). */
const clump =
  (x: number, r: number, rad: number): Mask =>
  (s) =>
    dist(s, x, r) <= rad;
/** Within `w` half-steps of a line that swings left and right every `period` rows. */
const zigzag =
  (w: number, period: number, swing: number): Mask =>
  (s) => {
    const t = mod(s.r, 2 * period);
    const centre = (t < period ? t : 2 * period - t) * (swing / period) - swing / 2;
    return Math.abs(s.x - centre * 2) <= w;
  };
const at =
  (...cells: (readonly [number, number])[]): Mask =>
  (s) =>
    cells.some(([r, c]) => r === s.r && c === s.c);
/** The same shape mirrored left to right. */
const flip =
  (m: Mask): Mask =>
  (s) =>
    m({ ...s, x: -s.x });

// ─── colour patterns ───
const cols =
  (w: number): Paint =>
  (s) =>
    Math.floor((s.x + 9) / (2 * w));
const bands =
  (h: number): Paint =>
  (s) =>
    Math.floor(s.r / h);
/** Stripes along a hex diagonal, `w` bubbles wide; dir 1 leans right, -1 left. */
const diag =
  (w: number, dir = 1): Paint =>
  (s) =>
    Math.floor((s.x + 9 + dir * s.r) / (2 * w));
const chevron =
  (w: number): Paint =>
  (s) =>
    Math.floor((Math.abs(s.x) + s.r) / (2 * w));
const rings =
  (r: number, w: number, x = 0): Paint =>
  (s) =>
    Math.floor(dist(s, x, r) / w);
const blocks =
  (w: number, h: number): Paint =>
  (s) =>
    Math.floor((s.x + 9) / (2 * w)) + Math.floor(s.r / h);
/** Loose clusters: each bubble copies an already painted neighbour with chance `p`, else picks at random. */
const clusters =
  (p = 0.6): Paint =>
  (s, b) => {
    const near = neighbours(s.i, 0).filter((n) => isColour(b.cells[n]!));
    return near.length && b.rng.chance(p) ? b.cells[b.rng.pick(near)]! : b.rng.int(0, b.kinds - 1);
  };
/** Clusters on the left half, mirrored onto the right. */
const mirrored = (p = 0.6): Paint => {
  const left = clusters(p);
  return (s, b) => {
    const twin = s.r * COLS + (rowLen(s.r, 0) - 1 - s.c);
    return s.x > 0 && isColour(b.cells[twin]!) ? b.cells[twin]! : left(s, b);
  };
};

// ─── the authored levels ───

const everyOther: Mask = (s) => mod(s.c, 2) === 0;
const edge: Mask = (s) => Math.abs(s.x) >= 8;
const middle: Mask = (s) => Math.abs(s.x) <= 1;

const DEFS: readonly Def[] = [
  // Zone 1, Sunlit Shallows: the basics, then stones
  { rows: 4, kinds: 3, paint: cols(2), par: 7, tip: 'match' },
  { rows: 5, kinds: 3, shape: vee(1.6), paint: chevron(2), rot: 1, par: 8, tip: 'drop' },
  { rows: 5, kinds: 3, paint: blocks(2, 2), rot: 2, par: 12, tip: 'rainbow' },
  { rows: 5, kinds: 4, paint: diag(2), par: 6 },
  {
    rows: 6,
    kinds: 4,
    art: [
      'aabbccddaa',
      '.b..c..d.',
      '.bb.cc.dd.',
      '.a..d..b.',
      '.aa.dd.bb.',
      '.c..a..c.',
    ],
    paint: bands(1),
    par: 8,
  },
  {
    rows: 6,
    kinds: 4,
    paint: clusters(0.7),
    stone: both(rowsFrom(3, 3), everyOther),
    par: 11,
    tip: 'stone',
  },
  {
    rows: 7,
    kinds: 4,
    shape: any(rowsFrom(0, 1), strands(4, 4)),
    paint: diag(1.5, -1),
    noise: 0.1,
    par: 10,
  },
  {
    rows: 7,
    kinds: 4,
    shape: waist(3, 2, 2),
    paint: rings(3, 1.5),
    noise: 0.12,
    rot: 2,
    stone: both(rowsFrom(3, 3), middle),
    par: 11,
  },
  {
    rows: 7,
    kinds: 4,
    shape: any(rowsFrom(0, 1), (s) => Math.abs(s.x) >= 6),
    paint: clusters(0.65),
    stone: both(rowsFrom(3, 6), edge),
    par: 8,
  },
  {
    rows: 8,
    kinds: 4,
    shape: any(rowsFrom(0, 0), clump(0, 4, 3.5)),
    paint: rings(4, 1),
    noise: 0.1,
    rot: 3,
    stone: at([4, 4]),
    par: 11,
  },

  // Zone 2, Kelp Forest: fish to free, a fifth colour
  {
    rows: 5,
    kinds: 4,
    paint: clusters(0.65),
    fish: at([1, 1], [2, 5], [1, 7]),
    par: 5,
    tip: 'fish',
  },
  {
    rows: 8,
    kinds: 4,
    shape: any(rowsFrom(0, 0), strands(2, 2)),
    paint: bands(2),
    noise: 0.2,
    rot: 1,
    fish: both(rowsFrom(7, 7), (s) => mod(s.c, 2) === 0),
    par: 7,
  },
  {
    rows: 8,
    kinds: 4,
    shape: any(rowsFrom(0, 0), zigzag(3, 3, 5)),
    paint: bands(1),
    noise: 0.15,
    rot: 2,
    stone: at([3, 7], [6, 1]),
    par: 7,
  },
  {
    rows: 6,
    kinds: 4,
    shape: not(both(rowsFrom(1, 4), (s) => mod(s.r, 2) === 1 && mod(s.c, 3) === 1)),
    paint: blocks(1.5, 2),
    noise: 0.15,
    fish: at([0, 2], [0, 7], [2, 2], [2, 7], [4, 4]),
    par: 14,
  },
  { rows: 6, kinds: 5, paint: cols(1), noise: 0.12, par: 18 },
  {
    rows: 8,
    kinds: 5,
    shape: any(
      rowsFrom(0, 0),
      both(rowsFrom(1, 2), (s) => Math.abs(Math.abs(s.x) - 5) <= 1),
      clump(-5, 5, 2),
      clump(5, 5, 2),
    ),
    paint: mirrored(0.6),
    stone: both(rowsFrom(1, 2), (s) => Math.abs(Math.abs(s.x) - 5) <= 1),
    par: 16,
  },
  {
    rows: 9,
    kinds: 5,
    art: [
      'bbaaccddee',
      'bbaaccdde',
      '...a..d...',
      '...a.d...',
      '...####...',
      '..#EdE#..',
      '..#dEEd#..',
      '..#DeD#..',
      '...####...',
    ],
    paint: bands(1),
    par: 6,
  },
  {
    rows: 7,
    kinds: 5,
    paint: (s) => Math.floor(s.r / 2 + Math.sin((s.x + 9) / 3) * 1.2 + 2),
    noise: 0.15,
    par: 23,
  },
  {
    rows: 7,
    kinds: 5,
    shape: vee(1.2),
    paint: chevron(1),
    noise: 0.2,
    rot: 2,
    stone: both(rowsFrom(2, 2), edge),
    fish: at([4, 3], [4, 5], [6, 4], [5, 2], [5, 6]),
    par: 8,
  },
  {
    rows: 8,
    kinds: 5,
    paint: mirrored(0.62),
    stone: both(rowsFrom(4, 4), (s) => mod(s.c, 3) === 1),
    fish: at([1, 1], [1, 7], [2, 4], [3, 2], [3, 6], [6, 4]),
    par: 10,
  },

  // Zone 3, Coral Garden: urchins, and the ceiling sinks a little sooner
  {
    rows: 6,
    kinds: 5,
    paint: clusters(0.6),
    urchin: at([3, 2], [3, 6]),
    par: 10,
    pushEvery: 5,
    tip: 'urchin',
  },
  {
    rows: 8,
    kinds: 5,
    art: [
      'aabbccbbaa',
      '...bcb...',
      '....cc....',
      'dddd*eeee',
      'ddaadeebbe',
      '.a..d..b.',
      '.aa.dd.bb.',
      '.e..a..e.',
    ],
    paint: bands(1),
    par: 8,
    pushEvery: 5,
  },
  {
    rows: 7,
    kinds: 5,
    paint: clusters(0.6),
    stone: rowsFrom(3, 3),
    urchin: at([3, 2], [3, 6]),
    par: 12,
    pushEvery: 5,
  },
  {
    rows: 7,
    kinds: 5,
    paint: blocks(2, 1),
    noise: 0.25,
    urchin: at([2, 4], [5, 2], [5, 6]),
    fish: at([0, 1], [0, 8], [1, 4], [3, 1], [3, 7]),
    par: 16,
    pushEvery: 5,
  },
  {
    rows: 8,
    kinds: 5,
    shape: any(rowsFrom(0, 0), clump(0, 4, 4)),
    paint: rings(4, 1),
    noise: 0.2,
    rot: 1,
    urchin: at([4, 4]),
    stone: both(clump(0, 4, 2), not(clump(0, 4, 1.5))),
    par: 24,
    pushEvery: 5,
  },
  {
    rows: 7,
    kinds: 5,
    shape: not(both(rowsFrom(1, 5), (s) => mod(s.r, 2) === 0 && mod(s.c, 3) === 1)),
    paint: diag(1, 1),
    noise: 0.25,
    stone: both(rowsFrom(3, 3), (s) => mod(s.c, 3) === 0),
    par: 28,
    pushEvery: 5,
  },
  {
    rows: 7,
    kinds: 5,
    paint: clusters(0.55),
    urchin: both(rowsFrom(4, 4), (s) => mod(s.c, 3) === 1),
    stone: both(rowsFrom(2, 2), everyOther),
    par: 8,
    pushEvery: 5,
  },
  {
    rows: 8,
    kinds: 5,
    shape: any(rowsFrom(0, 1), strands(4, 2, 1)),
    paint: blocks(1.5, 2),
    noise: 0.2,
    stone: both(rowsFrom(4, 4), strands(4, 2, 1), (s) => Math.abs(s.x) > 4),
    fish: both(rowsFrom(7, 7), (s) => mod(s.c, 3) === 1),
    urchin: at([2, 4]),
    par: 23,
    pushEvery: 5,
  },
  {
    rows: 8,
    kinds: 5,
    paint: mirrored(0.6),
    stone: any(both(rowsFrom(2, 6), edge), both(rowsFrom(6, 6), not(middle))),
    urchin: at([6, 4], [3, 4]),
    par: 32,
    pushEvery: 5,
  },
  {
    rows: 9,
    kinds: 5,
    shape: any(rowsFrom(0, 1), waist(5, 1.6, 2.5)),
    paint: rings(5, 1.5),
    noise: 0.22,
    rot: 3,
    stone: both(rowsFrom(5, 5), (s) => Math.abs(s.x) === 2),
    urchin: at([5, 4], [2, 1], [2, 8]),
    fish: at([0, 0], [0, 9], [1, 4], [3, 3], [3, 5]),
    par: 7,
    pushEvery: 5,
  },

  // Zone 4, Twilight Trench: six colours and everything together
  { rows: 7, kinds: 5, paint: clusters(0.5), par: 23, pushEvery: 5 },
  {
    rows: 9,
    kinds: 5,
    shape: any(rowsFrom(0, 0), zigzag(2, 3, 6), flip(zigzag(2, 3, 6))),
    paint: clusters(0.5),
    urchin: at([5, 4]),
    par: 10,
    pushEvery: 5,
  },
  { rows: 6, kinds: 6, paint: cols(1.5), noise: 0.2, par: 16, pushEvery: 5 },
  {
    rows: 8,
    kinds: 6,
    shape: any(rowsFrom(0, 0), clump(-5, 4, 2.5), clump(5, 4, 2.5), both(rowsFrom(1, 1), edge)),
    paint: rings(4, 1, 5),
    noise: 0.25,
    urchin: at([4, 2], [4, 7]),
    fish: at([3, 1], [3, 7], [4, 1], [4, 8], [0, 4]),
    par: 15,
    pushEvery: 5,
  },
  {
    rows: 8,
    kinds: 6,
    paint: chevron(1),
    noise: 0.25,
    stone: both(rowsFrom(3, 5), (s) => Math.abs(s.x) + s.r * 2 === 11 || Math.abs(s.x) + s.r * 2 === 12),
    par: 36,
    pushEvery: 5,
  },
  {
    rows: 8,
    kinds: 6,
    shape: not(both(rowsFrom(2, 6), (s) => mod(s.r, 2) === 0 && mod(s.c, 2) === 1)),
    paint: blocks(2, 2),
    noise: 0.3,
    urchin: at([3, 1], [3, 7], [7, 4]),
    par: 32,
    pushEvery: 5,
  },
  {
    rows: 9,
    kinds: 6,
    shape: any(rowsFrom(0, 1), strands(2, 2, 2)),
    paint: diag(1.5),
    noise: 0.25,
    stone: both(rowsFrom(5, 5), strands(2, 2, 2), everyOther),
    fish: both(rowsFrom(8, 8), strands(2, 2, 2)),
    par: 9,
    pushEvery: 5,
  },
  {
    rows: 8,
    kinds: 6,
    paint: clusters(0.5),
    stone: both(rowsFrom(3, 3), not(middle)),
    urchin: at([3, 4], [6, 1], [6, 7]),
    par: 33,
    pushEvery: 5,
  },
  {
    rows: 8,
    kinds: 6,
    art: [
      '??????????',
      '?????????',
      '#?#*??*#?#',
      '??$???$??',
      '??????????',
      '?#??$??#?',
      '???.??.???',
      '?$?...?$?',
    ],
    paint: mirrored(0.55),
    par: 28,
    pushEvery: 5,
  },
  {
    rows: 9,
    kinds: 6,
    paint: mirrored(0.55),
    stone: both(rowsFrom(4, 4), (s) => mod(s.c, 3) !== 1),
    urchin: at([4, 4], [7, 2], [7, 6]),
    fish: at([0, 1], [0, 8], [1, 4], [2, 2], [2, 7], [3, 4]),
    par: 13,
    pushEvery: 5,
  },
];

// ─── endless levels ───

/** A generated level past the authored ones: a random shape and pattern, six colours, a few of every special. */
function endlessDef(level: number, rng: Rng): Def {
  const shapes: (Mask | undefined)[] = [
    undefined,
    any(rowsFrom(0, 1), strands(4, 2, rng.int(0, 3))),
    any(rowsFrom(0, 1), waist(4, 1.8, 2.5)),
    any(rowsFrom(0, 0), clump(-5, 4, 2.5), clump(5, 4, 2.5), both(rowsFrom(1, 1), edge)),
    not(both(rowsFrom(2, 6), (s) => mod(s.r, 2) === 0 && mod(s.c, 3) === 1)),
    any(rowsFrom(0, 2), not(vee(-1.3, -1))),
  ];
  const paints: Paint[] = [
    clusters(0.55),
    mirrored(0.55),
    blocks(2, 2),
    diag(1.5, rng.pick([1, -1])),
    chevron(1.5),
    rings(4, 1.5),
  ];
  const stoneRow = rng.int(3, 5);
  const urchins = rng.int(1, 3);
  const rescue = rng.chance(0.4);
  const rows = rng.int(7, 9);
  return {
    rows,
    kinds: 6,
    shape: rng.pick(shapes),
    paint: rng.pick(paints),
    noise: 0.25,
    rot: rng.int(0, 5),
    stone: rng.chance(0.6)
      ? both(rowsFrom(stoneRow, stoneRow), (s) => mod(s.c + level, 3) === 0)
      : undefined,
    urchin: (s) => s.r >= 2 && s.r < rows - 1 && mod(s.i * 7 + level * 13, 61) < urchins,
    fish: rescue ? (s) => s.r <= 3 && mod(s.i * 5 + level * 3, 6) === 0 : undefined,
    par: 0,
    pushEvery: 5,
  };
}

/** Three-star shots for a generated board: about a shot per two bubbles, fewer when only the fish matter. */
function estimatePar(cells: Int8Array, goal: Goal): number {
  let colours = 0;
  for (const k of cells) if (isColour(k)) colours++;
  return Math.round(colours / (goal === 'rescue' ? 3.6 : 2.3)) + 3;
}

/** Builds the board for a level number (1-based, capped at MAX_LEVEL). */
export function buildLevel(level: number): Level {
  const n = Math.min(MAX_LEVEL, Math.max(1, Math.floor(level)));
  const rng = createRng(`pop-reef:level:${n}`);
  const def = DEFS[n - 1] ?? endlessDef(n, rng.fork('def'));
  const cells = new Int8Array(CELL_COUNT).fill(-1);
  const fish = new Uint8Array(CELL_COUNT);
  const b: Build = { cells, rng: rng.fork('paint'), kinds: def.kinds };
  const noise = rng.fork('noise');
  const colour = (s: Spot) =>
    def.noise && noise.chance(def.noise)
      ? noise.int(0, def.kinds - 1)
      : mod(def.paint(s, b) + (def.rot ?? 0), def.kinds);
  for (let r = 0; r < def.rows; r++)
    for (let c = 0; c < rowLen(r, 0); c++) {
      const s = { r, c, x: 2 * c - (rowLen(r, 0) - 1), i: r * COLS + c };
      const ch = def.art ? (def.art[r]?.[c] ?? '.') : '?';
      if (ch === '.' || (def.shape && !def.shape(s))) continue;
      const letter = ch.toLowerCase().charCodeAt(0) - 97;
      if (ch === '*' || def.urchin?.(s)) cells[s.i] = URCHIN;
      else if (ch === '#' || def.stone?.(s)) cells[s.i] = STONE;
      else cells[s.i] = letter >= 0 && letter < COLOURS ? letter : colour(s);
      if (isColour(cells[s.i]!) && (ch === '$' || (letter >= 0 && ch !== ch.toLowerCase()) || def.fish?.(s)))
        fish[s.i] = 1;
    }
  for (const i of floating(cells, 0)) {
    cells[i] = -1;
    fish[i] = 0;
  }
  const goal: Goal = fish.includes(1) ? 'rescue' : 'clear';
  return {
    n,
    zone: zoneOf(n),
    cells,
    fish,
    shift: 0,
    kinds: def.kinds,
    goal,
    par: def.par || estimatePar(cells, goal),
    pushEvery: def.pushEvery ?? 6,
    ...(def.tip ? { tip: def.tip } : {}),
  };
}
