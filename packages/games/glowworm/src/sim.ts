// Glowworm's run as a pure simulation. Phaser only draws it.
// A cave is a COLS × ROWS grid; a cell is its index y × COLS + x. Wick moves one cell per tick and the tick
// shortens a little with every berry. Eating QUOTA berries clears the cave: after a short pause Wick starts the
// next one (new layout and edges) at its full length. Time is in ms on the clock the caller passes to advance():
// the scene's frame clock in play, the attract step clock in attract. Events tell the scene what to draw; they
// never feed back.
import type { Rng } from '@pocketcade/toolkit';

export const COLS = 17;
export const ROWS = 17;
export const CELLS = COLS * ROWS;
export const START_LEN = 4;
/** Wick's head starts left of the centre with the body trailing left, so Wick faces right. */
export const START_HEAD = 8 * COLS + 6;
export const TICK_START_MS = 150;
export const TICK_MIN_MS = 90;
/** each berry closes this share of the gap to top speed */
const TICK_DECAY = 0.955;
export const BERRY_POINTS = 10;
/** a berry eaten within COMBO_TICKS moves of the last one is worth COMBO_STEP more, up to COMBO_MAX in a row */
export const COMBO_STEP = 5;
export const COMBO_MAX = 5;
export const COMBO_TICKS = 24;
export const GOLDEN_POINTS = 50;
/** a golden berry appears once per cave, after this many plain berries */
export const GOLDEN_AT = 4;
export const GOLDEN_MS = 6000;
/** plain berries that clear a cave */
export const QUOTA = 8;
export const CLEAR_POINTS = 50;
/** the celebration between two caves, then the pause before Wick moves in the new one */
export const CLEAR_MS = 1400;
export const ENTER_MS = 900;
export const MAX_QUEUE = 2;
/** caves cycle through this many looks (palettes) */
export const BIOMES = 5;

export type Dir = 'up' | 'down' | 'left' | 'right';
export const DIRS: readonly Dir[] = ['up', 'right', 'down', 'left'];
export type Phase = 'ready' | 'playing' | 'cleared' | 'dead' | 'won';
export type Cause = 'self' | 'wall' | 'crystal';

export type SimEvent =
  | { type: 'start' }
  | { type: 'eat'; cell: number; golden: boolean; points: number; chain: number }
  | { type: 'golden'; cell: number }
  | { type: 'golden-gone'; cell: number }
  | { type: 'clear'; depth: number; points: number }
  | { type: 'cave'; depth: number }
  | { type: 'die'; cause: Cause }
  | { type: 'won' };

export const DELTA: Record<Dir, readonly [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};
const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };
export const opposite = (d: Dir): Dir => OPPOSITE[d];
export const cellX = (c: number) => c % COLS;
export const cellY = (c: number) => Math.floor(c / COLS);
export const cellAt = (x: number, y: number) => y * COLS + x;

/** One cave: its crystal blocks and which rows and columns wrap around (a tunnel through the wall). */
export interface Cave {
  /** 1 for the first cave */
  depth: number;
  /** index of its palette, 0..BIOMES-1 */
  biome: number;
  blocks: readonly number[];
  /** wrapRows[y]: leaving row y on the left or right comes back in on the other side */
  wrapRows: readonly boolean[];
  /** wrapCols[x]: the same for the top and bottom of column x */
  wrapCols: readonly boolean[];
}

type Wrap = 'all' | readonly number[];
const flags = (n: number, wrap: Wrap): boolean[] =>
  Array.from({ length: n }, (_, i) => wrap === 'all' || wrap.includes(i));

export function makeCave(depth: number, blocks: readonly number[], rows: Wrap, cols: Wrap): Cave {
  return {
    depth,
    biome: (depth - 1) % BIOMES,
    blocks,
    wrapRows: flags(ROWS, rows),
    wrapCols: flags(COLS, cols),
  };
}

/** Layouts as inclusive rectangles of crystal [x0, y0, x1, y1]; none touches Wick's start row. */
type Rect = readonly [number, number, number, number];
const LAYOUTS: readonly { rects: readonly Rect[]; rows: Wrap; cols: Wrap }[] = [
  // an open cave: every edge wraps
  { rects: [], rows: 'all', cols: 'all' },
  // walls and four pillars
  {
    rects: [
      [3, 3, 4, 4],
      [12, 3, 13, 4],
      [3, 12, 4, 13],
      [12, 12, 13, 13],
    ],
    rows: [],
    cols: [],
  },
  // corner brackets, with a tunnel through the middle of every wall
  {
    rects: [
      [4, 4, 6, 4],
      [4, 5, 4, 6],
      [10, 4, 12, 4],
      [12, 5, 12, 6],
      [4, 12, 6, 12],
      [4, 10, 4, 11],
      [10, 12, 12, 12],
      [12, 10, 12, 11],
    ],
    rows: [8],
    cols: [8],
  },
  // two long bars in an open cave
  {
    rects: [
      [4, 4, 12, 4],
      [4, 12, 12, 12],
    ],
    rows: 'all',
    cols: 'all',
  },
  // six columns
  {
    rects: [
      [4, 2, 4, 6],
      [4, 10, 4, 14],
      [12, 2, 12, 6],
      [12, 10, 12, 14],
      [8, 3, 8, 5],
      [8, 11, 8, 13],
    ],
    rows: [],
    cols: [],
  },
  // a field of single crystals with four tunnels
  {
    rects: [2, 6, 10, 14].flatMap((x) => [2, 6, 10, 14].map((y): Rect => [x, y, x, y])),
    rows: [4, 12],
    cols: [4, 12],
  },
  // two long walls that make an S
  {
    rects: [
      [0, 5, 10, 5],
      [6, 11, 16, 11],
    ],
    rows: [],
    cols: [],
  },
  // a split cave: the sides wrap, the top and bottom are walls
  {
    rects: [
      [8, 0, 8, 5],
      [8, 11, 8, 16],
      [4, 4, 4, 4],
      [12, 4, 12, 4],
      [4, 12, 4, 12],
      [12, 12, 12, 12],
    ],
    rows: 'all',
    cols: [],
  },
];
export const LAYOUT_COUNT = LAYOUTS.length;

/** The cave at `depth` (1 = first). Layouts and palettes repeat on different cycles, so pairings keep changing. */
export function caveFor(depth: number): Cave {
  const l = LAYOUTS[(depth - 1) % LAYOUTS.length]!;
  const blocks: number[] = [];
  for (const [x0, y0, x1, y1] of l.rects)
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) blocks.push(cellAt(x, y));
  return makeCave(depth, blocks, l.rows, l.cols);
}

/** The cell one step from `c`, or -1 for a wall (an edge that does not wrap). */
export function stepCell(c: number, d: Dir, cave: Cave): number {
  let x = cellX(c) + DELTA[d][0];
  let y = cellY(c) + DELTA[d][1];
  if (x < 0 || x >= COLS) {
    if (!cave.wrapRows[y]) return -1;
    x = (x + COLS) % COLS;
  } else if (y < 0 || y >= ROWS) {
    if (!cave.wrapCols[x]) return -1;
    y = (y + ROWS) % ROWS;
  }
  return cellAt(x, y);
}

/** Tick length after `eaten` berries: fast gains early, then easing toward top speed. */
export const tickMsFor = (eaten: number) =>
  Math.round(TICK_MIN_MS + (TICK_START_MS - TICK_MIN_MS) * TICK_DECAY ** eaten);

/** Tap-to-turn: the turn toward a point (dx, dy from the head) on the axis across `from`; null when in line. */
export function tapDir(from: Dir, dx: number, dy: number): Dir | null {
  if (from === 'left' || from === 'right') return dy < 0 ? 'up' : dy > 0 ? 'down' : null;
  return dx < 0 ? 'left' : dx > 0 ? 'right' : null;
}

/** Cells reachable from `from` through cells where `blocked` is 0, using the cave's tunnels. */
export function floodCount(from: number, blocked: Uint8Array, cave: Cave): number {
  if (blocked[from]) return 0;
  const seen = new Uint8Array(CELLS);
  const stack = [from];
  seen[from] = 1;
  let n = 0;
  while (stack.length) {
    const c = stack.pop()!;
    n++;
    for (const d of DIRS) {
      const nb = stepCell(c, d, cave);
      if (nb >= 0 && !seen[nb] && !blocked[nb]) {
        seen[nb] = 1;
        stack.push(nb);
      }
    }
  }
  return n;
}

/** How a run starts. Everything is optional; tests and the attract demo use it. */
export interface Setup {
  /** the first cave (default 1) */
  depth?: number;
  /** Wick's full length (default START_LEN); the part beyond the start body grows in as Wick moves */
  length?: number;
  /** berries already eaten (sets the speed) */
  eaten?: number;
  /** plain berries already eaten in this cave */
  got?: number;
  /** a custom cave instead of the one for `depth` */
  cave?: Cave;
  /** Wick's cells, head first, and the heading */
  body?: readonly number[];
  heading?: Dir;
  berry?: number;
}

const startBody = () => Array.from({ length: START_LEN }, (_, i) => START_HEAD - i);

export function createRun(rng: Rng, setup: Setup = {}) {
  const spawnRng = rng.fork('berries');
  let cave = setup.cave ?? caveFor(setup.depth ?? 1);
  /** body cells head first; a new array every tick, so `prev` keeps the last one for drawing */
  let body: number[] = setup.body ? [...setup.body] : startBody();
  let prev: readonly number[] = body;
  /** segments still to grow: the tail stays put while this is above 0 */
  let grow = Math.max(0, (setup.length ?? body.length) - body.length);
  let heading: Dir = setup.heading ?? 'right';
  const queue: Dir[] = [];
  let phase: Phase = 'ready';
  let cause: Cause | null = null;
  let score = 0;
  let eaten = setup.eaten ?? 0;
  let got = setup.got ?? 0;
  let ticks = 0;
  let acc = 0;
  let wait = 0;
  let berry = -1;
  let golden = -1;
  let goldenLeft = 0;
  let chain = 0;
  let chainTick = 0;
  /** 1 = Wick, 2 = crystal */
  const occ = new Uint8Array(CELLS);
  function occupy(): void {
    occ.fill(0);
    for (const c of cave.blocks) occ[c] = 2;
    for (const c of body) occ[c] = 1;
  }
  occupy();

  /** A random free cell (not Wick, a crystal or a berry), or -1 when there is none. */
  function spawn(): number {
    const free: number[] = [];
    for (let c = 0; c < CELLS; c++) if (!occ[c] && c !== berry && c !== golden) free.push(c);
    return free.length ? spawnRng.pick(free) : -1;
  }
  berry = setup.berry ?? spawn();

  function turn(d: Dir): SimEvent[] {
    if (phase === 'ready') {
      // the first direction starts the run; straight ahead counts, backwards doesn't
      if (d === OPPOSITE[heading]) return [];
      phase = 'playing';
      if (d !== heading) queue.push(d);
      return [{ type: 'start' }];
    }
    if (phase !== 'playing' || queue.length >= MAX_QUEUE) return [];
    // compared with the last queued turn, so two quick turns both count and a reversal never does
    const last = queue.at(-1) ?? heading;
    if (d !== last && d !== OPPOSITE[last]) queue.push(d);
    return [];
  }

  /** The next cave: Wick starts over at the left with its whole length, most of it still to grow in. */
  function enter(depth: number): void {
    const length = body.length + grow;
    cave = caveFor(depth);
    body = startBody();
    prev = body;
    grow = length - body.length;
    heading = 'right';
    queue.length = 0;
    got = 0;
    chain = 0;
    occupy();
    berry = spawn();
    phase = 'playing';
    acc = -ENTER_MS;
  }

  /** One tick: turn, move one cell, then eat or die. */
  function step(): SimEvent[] {
    if (phase !== 'playing') return [];
    heading = queue.shift() ?? heading;
    ticks++;
    const next = stepCell(body[0]!, heading, cave);
    const tail = body.at(-1)!;
    // Wick may move into the cell the tail is leaving (it is not leaving while Wick grows)
    const hit: Cause | null =
      next < 0
        ? 'wall'
        : occ[next] === 2
          ? 'crystal'
          : occ[next] === 1 && (next !== tail || grow > 0)
            ? 'self'
            : null;
    if (hit) {
      phase = 'dead';
      cause = hit;
      prev = body;
      queue.length = 0;
      return [{ type: 'die', cause: hit }];
    }
    const isGolden = next === golden;
    const ate = isGolden || next === berry;
    if (ate) grow++;
    prev = body;
    body = [next, ...body];
    if (grow > 0) grow--;
    else {
      body.pop();
      occ[tail] = 0;
    }
    occ[next] = 1;
    if (!ate) return [];

    chain = chain > 0 && ticks - chainTick <= COMBO_TICKS ? chain + 1 : 1;
    chainTick = ticks;
    const points = isGolden
      ? GOLDEN_POINTS
      : BERRY_POINTS + COMBO_STEP * (Math.min(chain, COMBO_MAX) - 1);
    const out: SimEvent[] = [{ type: 'eat', cell: next, golden: isGolden, points, chain }];
    score += points;
    eaten++;
    if (isGolden) golden = -1;
    else {
      got++;
      berry = -1;
    }
    if (body.length >= CELLS - cave.blocks.length) {
      phase = 'won';
      return [...out, { type: 'won' }];
    }
    if (!isGolden && got >= QUOTA) {
      score += CLEAR_POINTS;
      phase = 'cleared';
      wait = CLEAR_MS;
      golden = -1;
      goldenLeft = 0;
      queue.length = 0;
      out.push({ type: 'clear', depth: cave.depth, points: CLEAR_POINTS });
      return out;
    }
    if (berry < 0) berry = spawn(); // stays -1 only while the golden berry holds the last free cell
    if (!isGolden && got === GOLDEN_AT && golden < 0) {
      golden = spawn();
      if (golden >= 0) {
        goldenLeft = GOLDEN_MS;
        out.push({ type: 'golden', cell: golden });
      }
    }
    return out;
  }

  /** Advances `ms`: the pause between caves, or whole ticks and then the golden berry's timer. */
  function advance(ms: number): SimEvent[] {
    if (phase === 'cleared') {
      wait -= ms;
      if (wait > 0) return [];
      enter(cave.depth + 1);
      return [{ type: 'cave', depth: cave.depth }];
    }
    if (phase !== 'playing') return [];
    const out: SimEvent[] = [];
    acc += ms;
    while (phase === 'playing' && acc >= tickMsFor(eaten)) {
      acc -= tickMsFor(eaten);
      out.push(...step());
    }
    if (phase !== 'playing') {
      acc = 0;
      return out;
    }
    if (golden >= 0) {
      goldenLeft -= ms;
      if (goldenLeft <= 0) {
        out.push({ type: 'golden-gone', cell: golden });
        golden = -1;
        goldenLeft = 0;
        if (berry < 0) berry = spawn();
      }
    }
    return out;
  }

  return {
    get cave() {
      return cave;
    },
    get phase() {
      return phase;
    },
    /** why the run ended, once phase is 'dead' */
    get cause() {
      return cause;
    },
    /** Wick's cells, head first */
    get body(): readonly number[] {
      return body;
    },
    /** the body before the last tick; the same array as `body` while Wick is at rest */
    get prev(): readonly number[] {
      return prev;
    },
    /** Wick's full length, counting segments still to grow in */
    get length() {
      return body.length + grow;
    },
    /** true while the tail stays put */
    get growing() {
      return grow > 0;
    },
    get heading() {
      return heading;
    },
    get queue(): readonly Dir[] {
      return queue;
    },
    /** -1 between caves, or while the golden berry holds the last free cell */
    get berry() {
      return berry;
    },
    get golden() {
      return golden;
    },
    get goldenLeftMs() {
      return goldenLeft;
    },
    get score() {
      return score;
    },
    /** berries eaten, golden ones included */
    get eaten() {
      return eaten;
    },
    /** plain berries eaten in this cave, 0..QUOTA */
    get got() {
      return got;
    },
    /** berries in the current combo (0 once the window has passed) */
    get chain() {
      return phase === 'playing' && ticks - chainTick <= COMBO_TICKS ? chain : 0;
    },
    /** moves left to keep the combo going */
    get chainTicksLeft() {
      return Math.max(0, COMBO_TICKS - (ticks - chainTick));
    },
    get ticks() {
      return ticks;
    },
    get tickMs() {
      return tickMsFor(eaten);
    },
    /** ms into the current tick, for interpolation; below 0 while Wick waits at the start of a new cave */
    get acc() {
      return acc;
    },
    /** ms left of the pause between caves */
    get clearLeftMs() {
      return phase === 'cleared' ? wait : 0;
    },
    turn,
    step,
    advance,
  };
}

export type Run = ReturnType<typeof createRun>;
