// Pentafall simulation: pure TypeScript on a fixed 60 Hz step with integer timing, deterministic for a seed and an
// input sequence. The scene only draws it.
import type { Rng } from '@pocketcade/toolkit';
import {
  boxCells,
  PIECE_IDS,
  pieceIndex,
  SPAWN_X,
  spawnY,
  tierOf,
  type Cell,
  type PieceId,
} from './pieces.ts';
import type { RunSaveV1 } from './save.ts';

export const COLS = 12;
export const ROWS = 21;
/** Rows above the crest: a piece may turn into them, but a piece that settles there ends the run. */
export const HIDDEN_ROWS = 3;
export const MAX_LEVEL = 20;
export const LINES_PER_LEVEL = 10;
/** ms per row by level 1–20: round(1000 × 0.86^(level − 1)). */
const FALL_MS = [
  0, 1000, 860, 740, 636, 547, 470, 405, 348, 299, 257, 221, 190, 164, 141, 121, 104, 90, 77, 66,
  57,
] as const;
/** A held direction moves at once, then repeats after the delay. */
const SHIFT_DELAY_STEPS = 9;
const SHIFT_REPEAT_STEPS = 3;
/** A piece resting on the pile settles after this long; moving or turning it restarts the wait, up to a limit. */
const SETTLE_RESETS_MAX = 10;
export const UP_NUDGES_MAX = 4;
const ENTRY_STEPS = 6;
const ENTRY_CLEAR_STEPS = 18;
const BASE = [0, 100, 250, 450, 750, 1500] as const;
const SWEEP_BONUS = 2000;

export const levelOf = (lines: number) =>
  Math.min(MAX_LEVEL, 1 + Math.floor(lines / LINES_PER_LEVEL));
const settleStepsFor = (level: number) => (level >= 15 ? 24 : level >= 10 ? 27 : 30);
/** Highest unlocked tier: A at level 1, B at 4, C at 7, D at 10. */
export const tierFor = (level: number) => (level >= 10 ? 3 : level >= 7 ? 2 : level >= 4 ? 1 : 0);

/** Points for clearing `n` rows; `streak` counts this lock; `level` is the level before these lines. */
export function clearPoints(n: number, level: number, streak: number, sweep: boolean): number {
  if (n === 0) return 0;
  return (
    Math.floor((BASE[n]! * (4 + Math.min(streak - 1, 4))) / 4) * level +
    (sweep ? SWEEP_BONUS * level : 0)
  );
}

// ─── the Tumbler: which piece comes next ───

/** Held back from the first few pieces of a run so it opens with flat, easy shapes. */
const LATER: ReadonlySet<PieceId> = new Set(['T', 'U', 'V']);
const GENTLE_START = 4;

export interface Tumbler {
  /** pieces still to come from the current load, next first */
  readonly load: readonly PieceId[];
  readonly loads: number;
  draw(): PieceId;
  /** unlocks tiers up to `tier`; returns the pieces added */
  unlock(tier: number): PieceId[];
}

/**
 * Deals the unlocked pieces one shuffled load at a time, so every shape turns up once per load and none is ever
 * more than two loads away. A load holds two bars, one in each half (the bar is what scores a Full Five), and the
 * X only joins every other load. A piece never comes twice in a row.
 */
export function createTumbler(
  rng: Rng,
  opts: { load?: readonly PieceId[]; loads?: number; last?: PieceId | null; tier?: number } = {},
): Tumbler {
  const load = [...(opts.load ?? [])];
  let loads = opts.loads ?? 0;
  let last = opts.last ?? null;
  let tier = opts.tier ?? 0;

  function refill(): void {
    loads++;
    const rest = rng.shuffle(
      PIECE_IDS.filter(
        (id) => id !== 'I' && tierOf(id) <= tier && (id !== 'X' || loads % 2 === 0),
      ),
    );
    if (loads === 1)
      for (let i = 0, j = GENTLE_START; i < GENTLE_START; i++) {
        if (!LATER.has(rest[i]!)) continue;
        while (j < rest.length && LATER.has(rest[j]!)) j++;
        if (j < rest.length) [rest[i], rest[j]] = [rest[j]!, rest[i]!];
      }
    const half = rest.length >> 1;
    rest.splice(rng.int(0, half), 0, 'I');
    rest.splice(rng.int(half + 2, rest.length), 0, 'I');
    if (rest[0] === last) [rest[0], rest[1]] = [rest[1]!, rest[0]!];
    load.push(...rest);
  }

  return {
    load,
    get loads() {
      return loads;
    },
    draw() {
      if (!load.length) refill();
      last = load.shift()!;
      return last;
    },
    unlock(t) {
      if (t <= tier) return [];
      const added = PIECE_IDS.filter((id) => tierOf(id) > tier && tierOf(id) <= t);
      tier = t;
      // New shapes join what is left of the current load, so they show up soon.
      for (const id of added) load.splice(rng.int(0, load.length), 0, id);
      return added;
    },
  };
}

// ─── well geometry ───

export interface Piece {
  id: PieceId;
  rot: number;
  /** well column and row of box cell (0, 0) */
  x: number;
  y: number;
}

export const cellsOf = (p: Piece): Cell[] =>
  boxCells(p.id, p.rot).map(([cx, cy]) => [p.x + cx, p.y + cy]);
export const spawnPiece = (id: PieceId): Piece => ({ id, rot: 0, x: SPAWN_X, y: spawnY(id) });

/** Settled cells: -1 empty, else the PIECE_IDS index. */
export type Board = Int8Array;
export const fits = (board: Board, p: Piece) =>
  cellsOf(p).every(
    ([x, y]) => x >= 0 && x < COLS && y >= 0 && y < ROWS && board[y * COLS + x] === -1,
  );
export const dropDistance = (board: Board, p: Piece) => {
  let d = 0;
  while (fits(board, { ...p, y: p.y + d + 1 })) d++;
  return d;
};

/**
 * A new piece at the top of the well. When the pile is in the way it enters up to two rows higher, above the
 * crest, which leaves a last chance to slide it somewhere it can drop. Null when even that is blocked.
 */
export function enterPiece(board: Board, id: PieceId): Piece | null {
  const p = spawnPiece(id);
  for (let lift = 0; lift < HIDDEN_ROWS; lift++) {
    const c = { ...p, y: p.y - lift };
    if (fits(board, c)) return c;
  }
  return null;
}

/** Where a turn may shift the piece when it does not fit in place: sideways first, then up (off the floor). */
const NUDGES_RIGHT: readonly Cell[] = [
  [0, 0],
  [-1, 0],
  [1, 0],
  [0, -1],
  [-2, 0],
  [2, 0],
  [-1, -1],
  [1, -1],
  [0, -2],
  [-1, -2],
  [1, -2],
];
const NUDGES_LEFT: readonly Cell[] = NUDGES_RIGHT.map(([x, y]) => [x === 0 ? 0 : -x, y]);

/** A quarter turn with the nudge list; up-nudges only while `upLeft` > 0. Returns the new piece and whether it nudged up. */
export function tryTurn(
  board: Board,
  p: Piece,
  dir: 1 | -1,
  upLeft: number,
): { piece: Piece; up: boolean } | null {
  for (const [dx, dy] of dir === 1 ? NUDGES_RIGHT : NUDGES_LEFT) {
    if (dy < 0 && upLeft <= 0) continue;
    const c = { id: p.id, rot: p.rot + dir, x: p.x + dx, y: p.y + dy };
    if (fits(board, c)) return { piece: c, up: dy < 0 };
  }
  return null;
}

/** Removes full rows (the rows above move down); returns the removed rows. */
export function clearRows(board: Board): number[] {
  const full: number[] = [];
  for (let y = 0; y < ROWS; y++) {
    let n = 0;
    for (let x = 0; x < COLS; x++) if (board[y * COLS + x]! >= 0) n++;
    if (n === COLS) full.push(y);
  }
  if (!full.length) return full;
  let dst = ROWS - 1;
  for (let src = ROWS - 1; src >= 0; src--) {
    if (full.includes(src)) continue;
    if (dst !== src) board.copyWithin(dst * COLS, src * COLS, src * COLS + COLS);
    dst--;
  }
  board.fill(-1, 0, (dst + 1) * COLS);
  return full;
}

export const encodeBoard = (board: Board) =>
  [...board].map((c) => (c < 0 ? '.' : String.fromCharCode(97 + c))).join('');
export const decodeBoard = (s: string): Board =>
  Int8Array.from(s, (c) => (c === '.' ? -1 : c.charCodeAt(0) - 97));

// ─── the run ───

type Phase = 'ready' | 'falling' | 'entry' | 'over';
/**
 * `left`/`right`/`fast` are held keys (auto-repeat, faster fall); `slam` drops the piece to the pile at once;
 * `nudgeLeft`/`nudgeRight`/`fastRow` are single steps from touch drags.
 */
export type Action =
  | 'left'
  | 'right'
  | 'fast'
  | 'slam'
  | 'turnRight'
  | 'turnLeft'
  | 'stash'
  | 'nudgeLeft'
  | 'nudgeRight'
  | 'fastRow';
export interface Input {
  action: Action;
  down: boolean;
}
export type SimEvent =
  | { type: 'start' | 'shift' | 'turn' | 'bump' | 'stash' | 'spawn' | 'over' }
  /** `fell`: rows a slam dropped the piece (0 when it settled by itself) */
  | { type: 'lock'; id: PieceId; slam: boolean; cells: Cell[]; fell: number }
  | {
      type: 'clear';
      rows: number[];
      points: number;
      five: boolean;
      sweep: boolean;
      /** the well as it was with the full rows still in it */
      before: Board;
    }
  | { type: 'level'; level: number }
  | { type: 'tier'; pieces: PieceId[] };

interface SimOptions {
  /** 16 hex chars */
  seed: string;
  /** piece stream (`seed + ':pieces'`), or restored from a save */
  rng: Rng;
  save?: RunSaveV1;
  /** attract start pile, in the save's board encoding */
  pile?: string;
  /** forced current + 3 next (attract) */
  queue?: readonly PieceId[];
}

export type Sim = ReturnType<typeof createSim>;

export function createSim(o: SimOptions) {
  const s = o.save;
  const board: Board = new Int8Array(COLS * ROWS).fill(-1);
  const start = s?.board ?? o.pile;
  if (start) board.set(decodeBoard(start));
  let lines = s?.lines ?? 0;
  let level = levelOf(lines);
  const tumbler = createTumbler(o.rng, {
    ...(s ? { load: s.load, loads: s.loads, last: s.next[2] } : {}),
    tier: tierFor(level),
  });
  let pending: PieceId;
  let next: PieceId[];
  if (s) [pending, next] = [s.current, [...s.next]];
  else if (o.queue) [pending, next] = [o.queue[0]!, o.queue.slice(1, 4)];
  else [pending, next] = [tumbler.draw(), [tumbler.draw(), tumbler.draw(), tumbler.draw()]];

  let phase: Phase = 'ready';
  let piece: Piece | null = enterPiece(board, pending) ?? spawnPiece(pending);
  let stash: PieceId | null = s?.stash ?? null;
  let stashUsed = s?.stashUsed ?? false;
  let score = s?.score ?? 0;
  let streak = s?.streak ?? 0;
  let pieces = s?.pieces ?? 0;
  let playSteps = Math.round(((s?.playMs ?? 0) * 3) / 50);
  let fives = 0;
  let sweeps = 0;
  let steps = 0;
  let lastClear = { rows: 0, step: -1 };
  // per piece
  let acc = 0;
  let settleCount = 0;
  let resets = 0;
  let upLeft = UP_NUDGES_MAX;
  let lowest = piece.y;
  let entryLeft = 0;
  /** a turn or stash pressed between pieces, applied as the next piece enters */
  let queued: Action | null = null;
  // held keys
  const held = { left: false, right: false, fast: false };
  let lastDir: 'left' | 'right' | null = null;
  let shiftCount = 0;
  let fastCount = 0;
  // within one step
  let ev: SimEvent[] = [];
  let reset = false;

  const grounded = () => !!piece && !fits(board, { ...piece, y: piece.y + 1 });
  const setPiece = (p: Piece) => {
    piece = p;
    acc = 0;
    settleCount = 0;
    resets = 0;
    upLeft = UP_NUDGES_MAX;
    lowest = p.y;
  };
  const settleReset = () => {
    if (resets >= SETTLE_RESETS_MAX) return;
    resets++;
    settleCount = 0;
    reset = true;
  };
  const fell = () => {
    if (piece!.y <= lowest) return;
    lowest = piece!.y;
    settleCount = 0;
    reset = true;
  };

  function move(dx: number): boolean {
    const p = piece!;
    const c = { ...p, x: p.x + dx };
    if (!fits(board, c)) return false;
    const was = grounded();
    piece = c;
    if (was) settleReset();
    ev.push({ type: 'shift' });
    return true;
  }

  function fastRow(): void {
    const p = piece!;
    if (!fits(board, { ...p, y: p.y + 1 })) return;
    piece = { ...p, y: p.y + 1 };
    score += 1;
    acc = 0;
    fell();
  }

  function turn(dir: 1 | -1): void {
    const r = tryTurn(board, piece!, dir, upLeft);
    if (!r) return void ev.push({ type: 'bump' });
    const was = grounded();
    piece = r.piece;
    if (r.up) upLeft--;
    if (was) settleReset();
    ev.push({ type: 'turn' });
  }

  function doStash(): void {
    const incoming = stash ?? next[0]!;
    const entered = stashUsed ? null : enterPiece(board, incoming);
    if (!entered) return void ev.push({ type: 'bump' });
    if (stash === null) {
      next.shift();
      next.push(tumbler.draw());
    }
    stash = piece!.id;
    stashUsed = true;
    setPiece(entered);
    ev.push({ type: 'stash' });
  }

  function lock(slam: boolean, dropped: number): void {
    const cells = cellsOf(piece!);
    const id = piece!.id;
    const idx = pieceIndex(id);
    for (const [x, y] of cells) board[y * COLS + x] = idx;
    piece = null;
    pieces++;
    ev.push({ type: 'lock', id, slam, cells, fell: dropped });
    const before = board.slice();
    const rows = clearRows(board);
    if (rows.length) {
      streak++;
      const sweep = board.every((c) => c === -1);
      const points = clearPoints(rows.length, level, streak, sweep);
      score += points;
      lines += rows.length;
      if (rows.length === 5) fives++;
      if (sweep) sweeps++;
      lastClear = { rows: rows.length, step: steps };
      ev.push({ type: 'clear', rows, points, five: rows.length === 5, sweep, before });
      const lv = levelOf(lines);
      if (lv > level) {
        level = lv;
        ev.push({ type: 'level', level });
        const added = tumbler.unlock(tierFor(level));
        if (added.length) ev.push({ type: 'tier', pieces: added });
      }
    } else streak = 0;
    if (board.subarray(0, HIDDEN_ROWS * COLS).some((c) => c >= 0)) {
      phase = 'over';
      return void ev.push({ type: 'over' });
    }
    // The conveyor advances at lock, so a snapshot taken now names the piece that enters next.
    pending = next.shift()!;
    next.push(tumbler.draw());
    stashUsed = false;
    queued = null;
    phase = 'entry';
    entryLeft = rows.length ? ENTRY_CLEAR_STEPS : ENTRY_STEPS;
  }

  function slam(): void {
    const d = dropDistance(board, piece!);
    piece = { ...piece!, y: piece!.y + d };
    score += 2 * d;
    lock(true, d);
  }

  function act(action: Action): void {
    if (action === 'left' || action === 'nudgeLeft') move(-1);
    else if (action === 'right' || action === 'nudgeRight') move(1);
    else if (action === 'fastRow') fastRow();
    else if (action === 'slam') slam();
    else if (action === 'turnRight') turn(1);
    else if (action === 'turnLeft') turn(-1);
    else if (action === 'stash') doStash();
  }

  function handle({ action, down }: Input): void {
    if (action === 'left' || action === 'right') {
      const other = action === 'left' ? 'right' : 'left';
      held[action] = down;
      // Press: move at once (below), then repeat after the delay. Releasing the active direction resumes the
      // other one with a fresh delay.
      if (down || lastDir === action) {
        lastDir = down ? action : held[other] ? other : null;
        shiftCount = -1;
      }
    }
    if (action === 'fast') {
      held.fast = down;
      fastCount = 0;
    }
    if (!down) return;
    if (phase === 'ready') {
      phase = 'falling';
      ev.push({ type: 'start' });
    }
    if (phase === 'falling') act(action);
    else if (phase === 'entry' && (action === 'turnRight' || action === 'turnLeft' || action === 'stash'))
      queued = action;
  }

  return {
    board,
    get phase() {
      return phase;
    },
    get piece() {
      return piece;
    },
    get next() {
      return next as readonly PieceId[];
    },
    get stash() {
      return stash;
    },
    get stashUsed() {
      return stashUsed;
    },
    get score() {
      return score;
    },
    get lines() {
      return lines;
    },
    get level() {
      return level;
    },
    get streak() {
      return streak;
    },
    get pieces() {
      return pieces;
    },
    get fives() {
      return fives;
    },
    get sweeps() {
      return sweeps;
    },
    get steps() {
      return steps;
    },
    get playMs() {
      return Math.round((playSteps * 50) / 3);
    },
    get lastClear() {
      return lastClear;
    },
    /** rows between the current piece and where it would land */
    landing: () => (piece ? dropDistance(board, piece) : 0),
    /** after a pause: no key is held until a fresh keydown */
    releaseAll(): void {
      held.left = held.right = held.fast = false;
      lastDir = null;
      queued = null;
    },
    /** one 60 Hz step with the inputs that arrived since the last one */
    step(inputs: readonly Input[]): SimEvent[] {
      ev = [];
      reset = false;
      if (phase === 'over') return ev;
      steps++;
      if (phase === 'entry' && --entryLeft <= 0) {
        const entered = enterPiece(board, pending);
        if (!entered) {
          phase = 'over';
          ev.push({ type: 'over' });
          return ev;
        }
        setPiece(entered);
        phase = 'falling';
        ev.push({ type: 'spawn' });
        if (queued) act(queued);
        queued = null;
      }
      for (const i of inputs) handle(i);
      if (phase === 'falling' || phase === 'entry') playSteps++;
      if (lastDir && held[lastDir]) {
        shiftCount++;
        if (
          phase === 'falling' &&
          shiftCount >= SHIFT_DELAY_STEPS &&
          (shiftCount - SHIFT_DELAY_STEPS) % SHIFT_REPEAT_STEPS === 0
        )
          move(lastDir === 'left' ? -1 : 1);
      }
      if (phase !== 'falling') return ev;
      if (held.fast && ++fastCount % 2 === 1) fastRow();
      acc += 50;
      const per = 3 * FALL_MS[level]!;
      while (acc >= per) {
        acc -= per;
        if (grounded()) {
          acc = 0;
          break;
        }
        piece = { ...piece!, y: piece!.y + 1 };
        fell();
      }
      if (grounded() && !reset && ++settleCount >= settleStepsFor(level)) lock(false, 0);
      return ev;
    },
    snapshot(): RunSaveV1 {
      return {
        board: encodeBoard(board),
        current: piece && phase === 'ready' ? piece.id : pending,
        next: [next[0]!, next[1]!, next[2]!],
        stash,
        stashUsed: phase === 'ready' ? stashUsed : false,
        score,
        lines,
        streak,
        pieces,
        playMs: Math.round((playSteps * 50) / 3),
        seed: o.seed,
        rng: o.rng.state(),
        load: [...tumbler.load],
        loads: tumbler.loads,
      };
    },
  };
}
