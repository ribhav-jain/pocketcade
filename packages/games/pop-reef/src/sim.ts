// One Pop Reef level as a pure simulation; Phaser only draws it.
// The reef is a hex-packed grid of ROWS × COLS cells (cell index = row × COLS + col). Full rows hold COLS bubbles;
// indented rows sit half a bubble to the right and hold COLS - 1. `shift` says which rows are indented and flips
// whenever the ceiling pushes a new row in at the top. Geometry is in design units (720 × 960), so the sim and the
// scene share one coordinate space. Time moves in fixed 60 Hz steps. Events tell the scene what to draw.
import type { Rng } from '@pocketcade/toolkit';

/** Bubble radius and diameter. */
export const R = 34;
export const D = R * 2;
/** Bubbles on a full row; indented rows hold one fewer. */
export const COLS = 10;
/** Distance between row centres (hex packing). */
export const ROW_H = R * Math.sqrt(3);
/** The play field between the side walls, and the reef ceiling under the HUD. */
export const FIELD_L = 20;
export const FIELD_R = FIELD_L + COLS * D;
export const TOP = 76;
/** A bubble that settles in this row (or lower) has crossed the danger line: the level is lost. */
export const DANGER_ROW = 12;
/** Rows kept in storage: one past the danger row, where a last bubble can land. */
export const ROWS = DANGER_ROW + 1;
export const CELL_COUNT = ROWS * COLS;
/** The danger line: the bottom edge of the last safe row. */
export const DANGER_Y = TOP + 2 * R + (DANGER_ROW - 1) * ROW_H;
/** Where shots start (the bubble Puff is holding). */
export const SHOOT_X = 360;
export const SHOOT_Y = 842;
/** Aim limits, in radians from the +x axis, counter-clockwise (π/2 = straight up). */
export const MIN_AIM = (12 * Math.PI) / 180;
export const MAX_AIM = (168 * Math.PI) / 180;
/** Keyboard aim speed per step: slow at first for fine aiming, ramping up over AIM_RAMP steps of holding. */
export const AIM_SLOW = (0.5 * Math.PI) / 180;
export const AIM_FAST = (2 * Math.PI) / 180;
export const AIM_RAMP = 30;
export const STEP_MS = 1000 / 60;
/** Shot speed in design units per step, moved in sub-steps of SUB so it never skips past a bubble. */
export const SHOT_SPEED = 32;
const SUB = 8;
/** A shot sticks when its centre comes this close to a bubble's centre (a little forgiving: slips through gaps). */
export const CONTACT = 2 * R * 0.84;
const WALL_MIN = FIELD_L + R;
const WALL_MAX = FIELD_R - R;
/** Safety cap for a flight; every aim climbs to the ceiling long before this. */
const MAX_FLIGHT_STEPS = 400;

/** Cell values: -1 empty, 0..COLOURS-1 a coloured bubble, then the specials. */
export const COLOURS = 6;
/** A stone never pops: it only falls when nothing holds it up, or goes in an urchin's blast. */
export const STONE = 6;
/** An urchin bursts when a bubble lands or pops beside it, taking everything within BLAST cells with it. */
export const URCHIN = 7;
/** Loaded bubbles only: a rainbow pops every colour group it touches. */
export const RAINBOW = 8;
export const BLAST = 2;
export const isColour = (k: number) => k >= 0 && k < COLOURS;

export const POP_MIN = 3;
export const POP_POINTS = 10;
export const DROP_POINTS = 20;
export const FISH_POINTS = 100;
/** Each bubble still hanging when the level is won. */
export const LEFT_POINTS = 10;
/** Level bonus per star. */
export const STAR_BONUS = 500;
/** Popping on shots in a row multiplies the points, up to this. */
export const MAX_MULT = 5;
/** Every this many popping shots in a row, the next bubble is a rainbow. */
export const RAINBOW_EVERY = 4;
/** Chance a pushed-in bubble copies the colour of a filled neighbour, so new rows come in matchable clusters. */
export const CLUSTER = 0.55;
/** What a shot touched besides a bubble. */
export const CEILING = -2;

export type Phase = 'aim' | 'flying' | 'won' | 'over';
export type Goal = 'clear' | 'rescue';
export interface Bubble {
  x: number;
  y: number;
  kind: number;
  fish: boolean;
}
export type SimEvent =
  | { type: 'fire'; kind: number }
  | { type: 'bounce'; x: number; y: number }
  | { type: 'stick'; cell: number; kind: number }
  | {
      type: 'pop';
      /** in chain order, outward from where the shot landed */
      popped: Bubble[];
      dropped: Bubble[];
      /** centres of the urchins that burst */
      blasts: { x: number; y: number }[];
      fish: number;
      points: number;
      /** popping shots in a row, this one included */
      streak: number;
    }
  | { type: 'push' }
  | { type: 'rainbow' }
  | { type: 'win'; left: Bubble[]; stars: number; bonus: number }
  | { type: 'swap' }
  | { type: 'over' };

export interface Shot {
  x: number;
  y: number;
  /** unit direction */
  dx: number;
  dy: number;
  kind: number;
}

// ─── geometry ───

export const rowOf = (i: number) => Math.floor(i / COLS);
export const colOf = (i: number) => i % COLS;
export const indented = (row: number, shift: number) => ((row + shift) & 1) === 1;
export const rowLen = (row: number, shift: number) => (indented(row, shift) ? COLS - 1 : COLS);
export const cellX = (i: number, shift: number) =>
  FIELD_L + R + colOf(i) * D + (indented(rowOf(i), shift) ? R : 0);
export const cellY = (i: number) => TOP + R + rowOf(i) * ROW_H;
export const clampAim = (a: number) => Math.min(MAX_AIM, Math.max(MIN_AIM, a));

/** The aim toward a point (dx, dy from the launcher, y down); points below the launcher clamp to that side. */
export function aimToward(dx: number, dy: number): number {
  if (dy >= 0) return dx < 0 ? MAX_AIM : MIN_AIM;
  return clampAim(Math.atan2(-dy, dx));
}

/** The up-to-six hex neighbours of cell `i` that exist on the board. */
export function neighbours(i: number, shift: number): number[] {
  const r = rowOf(i);
  const c = colOf(i);
  const out: number[] = [];
  const add = (rr: number, cc: number) => {
    if (rr >= 0 && rr < ROWS && cc >= 0 && cc < rowLen(rr, shift)) out.push(rr * COLS + cc);
  };
  add(r, c - 1);
  add(r, c + 1);
  // an indented row touches columns c and c + 1 of the rows around it; a full row touches c - 1 and c
  const d = indented(r, shift) ? 0 : -1;
  for (const rr of [r - 1, r + 1]) {
    add(rr, c + d);
    add(rr, c + d + 1);
  }
  return out;
}

/** Every cell within `steps` hex steps of `i` (not `i` itself). */
export function around(i: number, shift: number, steps: number): number[] {
  const seen = new Set([i]);
  let edge = [i];
  for (let s = 0; s < steps; s++) {
    const next: number[] = [];
    for (const e of edge)
      for (const n of neighbours(e, shift))
        if (!seen.has(n)) {
          seen.add(n);
          next.push(n);
        }
    edge = next;
  }
  seen.delete(i);
  return [...seen];
}

/** The lowest row holding a bubble, or -1 on an empty board. */
export function lowestRow(cells: Int8Array): number {
  for (let i = CELL_COUNT - 1; i >= 0; i--) if (cells[i]! >= 0) return rowOf(i);
  return -1;
}

// ─── flight ───

export function launch(aim: number, kind: number): Shot {
  return { x: SHOOT_X, y: SHOOT_Y, dx: Math.cos(aim), dy: -Math.sin(aim), kind };
}

/** The nearest bubble within CONTACT of (x, y), else CEILING if the ceiling is touched, else -1. */
function contact(cells: Int8Array, shift: number, x: number, y: number): number {
  const r0 = Math.floor((y - TOP - R) / ROW_H);
  let best = -1;
  let bestD = CONTACT * CONTACT;
  for (let r = Math.max(0, r0 - 1); r <= Math.min(ROWS - 1, r0 + 1); r++) {
    const c0 = Math.round((x - FIELD_L - R - (indented(r, shift) ? R : 0)) / D);
    for (let c = Math.max(0, c0 - 1); c <= Math.min(rowLen(r, shift) - 1, c0 + 1); c++) {
      const i = r * COLS + c;
      if (cells[i]! < 0) continue;
      const dx = cellX(i, shift) - x;
      const dy = cellY(i) - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD) {
        bestD = d2;
        best = i;
      }
    }
  }
  if (best >= 0) return best;
  return y <= TOP + R ? CEILING : -1;
}

/**
 * Moves `shot` up to `dist` units in sub-steps, reflecting off the side walls (each bounce point is pushed onto
 * `bounces` as x, y). Returns what it touched (a cell or CEILING), or -1 while it is still flying.
 */
function travel(
  shot: Shot,
  cells: Int8Array,
  shift: number,
  dist: number,
  bounces?: number[],
): number {
  for (let left = dist; left > 0; left -= SUB) {
    const s = Math.min(SUB, left);
    const x0 = shot.x;
    shot.x += shot.dx * s;
    shot.y += shot.dy * s;
    if (shot.x < WALL_MIN || shot.x > WALL_MAX) {
      const wall = shot.x < WALL_MIN ? WALL_MIN : WALL_MAX;
      bounces?.push(wall, shot.y - shot.dy * s * ((shot.x - wall) / (shot.x - x0)));
      shot.x = 2 * wall - shot.x;
      shot.dx = -shot.dx;
    }
    const hit = contact(cells, shift, shot.x, shot.y);
    if (hit !== -1) return hit;
  }
  return -1;
}

/**
 * The free cell a shot stopped at (x, y) settles in: the nearest free neighbour of the bubble it touched, or the
 * nearest free top-row cell at the ceiling. Falls back to the nearest free cell anywhere.
 */
export function snap(cells: Int8Array, shift: number, x: number, y: number, hit: number): number {
  let best = -1;
  let bestD = Infinity;
  const consider = (i: number) => {
    if (cells[i]! >= 0) return;
    const dx = cellX(i, shift) - x;
    const dy = cellY(i) - y;
    if (dx * dx + dy * dy < bestD) {
      bestD = dx * dx + dy * dy;
      best = i;
    }
  };
  if (hit >= 0) for (const n of neighbours(hit, shift)) consider(n);
  else for (let c = 0; c < rowLen(0, shift); c++) consider(c);
  if (best < 0)
    for (let i = 0; i < CELL_COUNT; i++) if (colOf(i) < rowLen(rowOf(i), shift)) consider(i);
  return best;
}

export interface Trace {
  /** x, y pairs: the launcher, each wall bounce, then where the bubble first touches */
  path: number[];
  /** the cell the bubble settles in (-1 only if it never touches anything) */
  cell: number;
}

/** Where a shot at `aim` goes on this board: the same sub-steps as a real flight, so it lands in the same cell. */
export function trace(cells: Int8Array, shift: number, aim: number): Trace {
  const shot = launch(aim, 0);
  const path = [shot.x, shot.y];
  for (let n = 0; n < MAX_FLIGHT_STEPS; n++) {
    const hit = travel(shot, cells, shift, SHOT_SPEED, path);
    if (hit !== -1) {
      path.push(shot.x, shot.y);
      return { path, cell: snap(cells, shift, shot.x, shot.y, hit) };
    }
  }
  path.push(shot.x, shot.y);
  return { path, cell: -1 };
}

// ─── matching ───

/** The connected group of same-colour bubbles that includes `start` (empty unless `start` is a colour). */
export function groupAt(cells: Int8Array, shift: number, start: number): number[] {
  const kind = cells[start]!;
  if (!isColour(kind)) return [];
  const seen = new Uint8Array(CELL_COUNT);
  seen[start] = 1;
  const out = [start];
  for (let q = 0; q < out.length; q++)
    for (const n of neighbours(out[q]!, shift))
      if (!seen[n] && cells[n] === kind) {
        seen[n] = 1;
        out.push(n);
      }
  return out;
}

/** Bubbles no longer connected (through any bubbles) to the top row. */
export function floating(cells: Int8Array, shift: number): number[] {
  const seen = new Uint8Array(CELL_COUNT);
  const queue: number[] = [];
  for (let c = 0; c < COLS; c++)
    if (cells[c]! >= 0) {
      seen[c] = 1;
      queue.push(c);
    }
  for (let q = 0; q < queue.length; q++)
    for (const n of neighbours(queue[q]!, shift))
      if (!seen[n] && cells[n]! >= 0) {
        seen[n] = 1;
        queue.push(n);
      }
  const out: number[] = [];
  for (let i = 0; i < CELL_COUNT; i++) if (cells[i]! >= 0 && !seen[i]) out.push(i);
  return out;
}

export interface Outcome {
  /** the board afterwards */
  cells: Int8Array;
  /** cells that pop or are blasted, in chain order (the settled bubble included when it goes) */
  popped: number[];
  /** urchins that burst */
  blasts: number[];
  /** cells left hanging, which fall */
  dropped: number[];
}

/**
 * What settling `kind` in the free cell `cell` does (the board passed in is left unchanged). A colour pops its
 * group of POP_MIN or more; a rainbow pops itself and every colour group it touches. Any urchin beside the landing
 * cell or beside a popped bubble bursts, popping everything within BLAST cells, which can set off more urchins.
 */
export function resolve(cells: Int8Array, shift: number, cell: number, kind: number): Outcome {
  const next = cells.slice();
  next[cell] = kind;
  const gone = new Uint8Array(CELL_COUNT);
  const popped: number[] = [];
  const blasts: number[] = [];
  const take = (i: number) => {
    if (gone[i] || next[i]! < 0) return;
    gone[i] = 1;
    popped.push(i);
  };
  const burst = (u: number) => {
    if (blasts.includes(u)) return;
    blasts.push(u);
    take(u);
    for (const b of around(u, shift, BLAST)) take(b);
  };
  if (kind === RAINBOW) {
    take(cell);
    for (const n of neighbours(cell, shift)) for (const g of groupAt(next, shift, n)) take(g);
  } else {
    const group = groupAt(next, shift, cell);
    if (group.length >= POP_MIN) group.forEach(take);
  }
  for (const n of neighbours(cell, shift)) if (next[n] === URCHIN) burst(n);
  // `popped` grows while urchins burst, so this also follows the chain
  for (let q = 0; q < popped.length; q++) {
    const p = popped[q]!;
    if (next[p] === URCHIN) burst(p);
    for (const n of neighbours(p, shift)) if (next[n] === URCHIN) burst(n);
  }
  for (const i of popped) next[i] = -1;
  const dropped = floating(next, shift);
  for (const i of dropped) next[i] = -1;
  return { cells: next, popped, blasts, dropped };
}

/** Colours present on the board, ascending. */
export function coloursOnBoard(cells: Int8Array): number[] {
  const has = new Uint8Array(COLOURS);
  for (const k of cells) if (isColour(k)) has[k] = 1;
  const out: number[] = [];
  for (let k = 0; k < COLOURS; k++) if (has[k]) out.push(k);
  return out;
}

/**
 * The ceiling pushes down: every row moves down one and a new row of colours enters at the top (each bubble often
 * copies a filled neighbour, otherwise it is random). Returns the new shift.
 */
export function pushRow(
  rng: Rng,
  cells: Int8Array,
  fish: Uint8Array,
  shift: number,
  kinds: number,
): number {
  cells.copyWithin(COLS, 0, CELL_COUNT - COLS);
  cells.fill(-1, 0, COLS);
  fish.copyWithin(COLS, 0, CELL_COUNT - COLS);
  fish.fill(0, 0, COLS);
  const s = shift ^ 1;
  for (let c = 0; c < rowLen(0, s); c++) {
    const near = neighbours(c, s).filter((n) => isColour(cells[n]!));
    cells[c] = near.length && rng.chance(CLUSTER) ? cells[rng.pick(near)]! : rng.int(0, kinds - 1);
  }
  return s;
}

// ─── stars ───

/** The most shots that still earn two stars. */
export const twoStarShots = (par: number) => par + Math.ceil(par * 0.4);
/** Stars for winning in `shots`: three within par, two a little over, else one. */
export const starsFor = (shots: number, par: number) =>
  shots <= par ? 3 : shots <= twoStarShots(par) ? 2 : 1;

// ─── a level ───

/** What a level starts with (levels.ts builds these; tests write their own). */
export interface LevelSetup {
  cells: ArrayLike<number>;
  /** 1 where a fish rides in the bubble */
  fish?: ArrayLike<number>;
  shift?: number;
  /** colours the ceiling pushes in (0..kinds-1) */
  kinds: number;
  /** 'clear': pop every coloured bubble; 'rescue': free every fish */
  goal: Goal;
  /** shots for three stars */
  par: number;
  /** shots that pop nothing before the ceiling pushes down a row */
  pushEvery: number;
  current?: number;
  next?: number;
  misses?: number;
  streak?: number;
}

export function createRun(rng: Rng, setup: LevelSetup) {
  const pushRng = rng.fork('push');
  const feedRng = rng.fork('feed');
  let cells: Int8Array = Int8Array.from(setup.cells);
  const fish = setup.fish ? Uint8Array.from(setup.fish) : new Uint8Array(CELL_COUNT);
  let shift = setup.shift ?? 0;
  const { kinds, goal, par, pushEvery } = setup;
  let phase: Phase = 'aim';
  let aim = Math.PI / 2;
  let turnDir = 0;
  let turnSteps = 0;
  let shot: Shot | null = null;
  let score = 0;
  let shots = 0;
  let misses = setup.misses ?? 0;
  let streak = setup.streak ?? 0;
  let stars = 0;
  /** bumps on every board change, so the scene redraws only then */
  let version = 0;
  let current = setup.current ?? roll();
  let next = setup.next ?? roll();

  /** A loaded bubble: only colours still on the board. */
  function roll(): number {
    const on = coloursOnBoard(cells);
    return on.length ? feedRng.pick(on) : 0;
  }

  const count = (list: Uint8Array | Int8Array, want: (v: number) => boolean) => {
    let n = 0;
    for (const v of list) if (want(v)) n++;
    return n;
  };
  const fishLeft = () => count(fish, (v) => v === 1);
  const coloursLeft = () => count(cells, isColour);

  function setAim(a: number): void {
    aim = clampAim(a);
  }

  function fire(): SimEvent[] {
    if (phase !== 'aim') return [];
    shot = launch(aim, current);
    phase = 'flying';
    shots++;
    return [{ type: 'fire', kind: current }];
  }

  function swap(): SimEvent[] {
    if (phase !== 'aim' || current === next) return [];
    [current, next] = [next, current];
    return [{ type: 'swap' }];
  }

  /** One fixed step: turn the aim (+1 = left, -1 = right) and move the shot; settle it when it touches. */
  function step(turn = 0): SimEvent[] {
    if (phase === 'won' || phase === 'over') return [];
    turnSteps = turn && turn === turnDir ? turnSteps + 1 : 0;
    turnDir = turn;
    if (turn)
      aim = clampAim(
        aim + turn * (AIM_SLOW + (AIM_FAST - AIM_SLOW) * Math.min(1, turnSteps / AIM_RAMP)),
      );
    if (phase !== 'flying' || !shot) return [];
    const bounces: number[] = [];
    const hit = travel(shot, cells, shift, SHOT_SPEED, bounces);
    const out: SimEvent[] = [];
    for (let i = 0; i < bounces.length; i += 2)
      out.push({ type: 'bounce', x: bounces[i]!, y: bounces[i + 1]! });
    if (hit !== -1) out.push(...settle(snap(cells, shift, shot.x, shot.y, hit), shot.kind));
    return out;
  }

  /** Lifts the bubbles in `list` off the board (their fish go with them). */
  function lift(list: number[], from: Int8Array): Bubble[] {
    return list.map((i) => {
      const b = { x: cellX(i, shift), y: cellY(i), kind: from[i]!, fish: fish[i] === 1 };
      fish[i] = 0;
      return b;
    });
  }

  /** The shot sticks: pop, blast and drop, or count a miss (and maybe push the ceiling); then win, lose or reload. */
  function settle(cell: number, kind: number): SimEvent[] {
    shot = null;
    version++;
    const out: SimEvent[] = [{ type: 'stick', cell, kind }];
    const before = cells.slice();
    before[cell] = kind;
    const res = resolve(cells, shift, cell, kind);
    cells = res.cells;
    if (res.popped.length) {
      streak++;
      const popped = lift(res.popped, before);
      const dropped = lift(res.dropped, before);
      const freed = [...popped, ...dropped].filter((b) => b.fish).length;
      const mult = Math.min(MAX_MULT, streak);
      const points =
        (popped.length * POP_POINTS + dropped.length * DROP_POINTS) * mult + freed * FISH_POINTS;
      score += points;
      out.push({
        type: 'pop',
        popped,
        dropped,
        blasts: res.blasts.map((u) => ({ x: cellX(u, shift), y: cellY(u) })),
        fish: freed,
        points,
        streak,
      });
    } else {
      streak = 0;
      if (++misses >= pushEvery) {
        misses = 0;
        shift = pushRow(pushRng, cells, fish, shift, kinds);
        out.push({ type: 'push' });
      }
    }
    if (goal === 'rescue' ? fishLeft() === 0 : coloursLeft() === 0) {
      const rest: number[] = [];
      for (let i = 0; i < CELL_COUNT; i++) if (cells[i]! >= 0) rest.push(i);
      const left = lift(rest, cells);
      cells.fill(-1);
      stars = starsFor(shots, par);
      const bonus = stars * STAR_BONUS + left.length * LEFT_POINTS;
      score += bonus;
      phase = 'won';
      out.push({ type: 'win', left, stars, bonus });
      return out;
    }
    if (lowestRow(cells) >= DANGER_ROW) {
      phase = 'over';
      out.push({ type: 'over' });
      return out;
    }
    current = next === RAINBOW || coloursOnBoard(cells).includes(next) ? next : roll();
    next = roll();
    if (res.popped.length && streak % RAINBOW_EVERY === 0) {
      next = RAINBOW;
      out.push({ type: 'rainbow' });
    }
    phase = 'aim';
    return out;
  }

  return {
    get phase() {
      return phase;
    },
    /** radians, MIN_AIM..MAX_AIM; π/2 is straight up */
    get aim() {
      return aim;
    },
    goal,
    par,
    pushEvery,
    get score() {
      return score;
    },
    /** shots fired */
    get shots() {
      return shots;
    },
    /** shots that popped nothing since the last push */
    get misses() {
      return misses;
    },
    /** popping shots in a row */
    get streak() {
      return streak;
    },
    /** stars the loaded bubble would earn if it won the level; once won, the stars earned */
    get stars() {
      return phase === 'won' ? stars : starsFor(shots + (phase === 'aim' ? 1 : 0), par);
    },
    /** bubbles that can still be fired, the loaded one included, without losing a star (0 at one star) */
    get starShots() {
      const used = phase === 'aim' ? shots : shots - 1;
      const s = starsFor(used + 1, par);
      return s === 3 ? par - used : s === 2 ? twoStarShots(par) - used : 0;
    },
    /** fish still trapped, and coloured bubbles still up */
    get fishLeft() {
      return fishLeft();
    },
    get coloursLeft() {
      return coloursLeft();
    },
    /** the live board: kind per cell, -1 = empty (callers must not change it) */
    get cells() {
      return cells;
    },
    /** 1 where a fish rides in the bubble */
    fish,
    get shift() {
      return shift;
    },
    get version() {
      return version;
    },
    /** the bubble in the launcher, and the one after it */
    get current() {
      return current;
    },
    get next() {
      return next;
    },
    get shot(): Readonly<Shot> | null {
      return shot;
    },
    setAim,
    fire,
    swap,
    step,
  };
}

export type Run = ReturnType<typeof createRun>;
