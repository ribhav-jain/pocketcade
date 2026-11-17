// Hue Brew rules: bottles of layered drinks, the pour, corked bottles, the win test, the level generator and the
// solver behind par, hints and the demo. Pure and deterministic: no Phaser, no DOM, no clock; randomness only
// from a generator seeded with the level number.
import { createRng, type Rng } from '@pocketcade/toolkit';

/** Layers a bottle holds. */
export const CAP = 4;
/** Flavours are numbered 1..FLAVOURS. */
export const FLAVOURS = 12;
/** Empty bottles a level starts with. */
export const SPARE = 2;
/** The most bottles on the shelves: every flavour, the spares and the extra bottle. */
export const MAX_BOTTLES = FLAVOURS + SPARE + 1;
/** The first level with mystery layers. */
export const MYSTERY_FROM = 15;

export interface Brew {
  /** each bottle's layers, bottom first; a layer is a flavour 1..FLAVOURS */
  bottles: number[][];
  /** for each bottle, how many of its lowest layers are still a mystery (shown as "?") */
  veil: number[];
}

export interface Move {
  from: number;
  to: number;
}

/** A pour that happened, with what is needed to take it back. */
export interface Pour extends Move {
  /** layers moved */
  n: number;
  veilFrom: number;
  veilTo: number;
}

export interface Level {
  level: number;
  flavours: number;
  brew: Brew;
  /** moves in the solver's solution */
  par: number;
  /** some layers start hidden */
  mystery: boolean;
}

/** A full bottle of one flavour: it is corked and stays as it is. */
export function isComplete(bottle: readonly number[]): boolean {
  return bottle.length === CAP && bottle.every((f) => f === bottle[0]);
}

export function isSolved(brew: Brew): boolean {
  return brew.bottles.every((b) => b.length === 0 || isComplete(b));
}

/** How many layers leave bottle `i` in one pour: its top run of one flavour, never reaching into mystery layers. */
export function topRun(brew: Brew, i: number): number {
  const b = brew.bottles[i];
  if (!b || b.length === 0) return 0;
  const top = b[b.length - 1];
  const floor = brew.veil[i] ?? 0;
  let n = 1;
  while (b.length - 1 - n >= floor && b[b.length - 1 - n] === top) n++;
  return n;
}

/** Layers a pour from `from` into `to` would move; 0 when the pour is not allowed. */
export function pourCount(brew: Brew, from: number, to: number): number {
  const a = brew.bottles[from];
  const b = brew.bottles[to];
  if (from === to || !a || !b || a.length === 0 || b.length >= CAP || isComplete(a)) return 0;
  if (b.length > 0 && b[b.length - 1] !== a[a.length - 1]) return 0;
  return Math.min(topRun(brew, from), CAP - b.length);
}

export interface PourOutcome {
  brew: Brew;
  pour: Pour;
  /** the target is now a full bottle of one flavour */
  completed: boolean;
  /** a mystery layer in the source came to the top and is now shown */
  revealed: boolean;
}

/** Pours `from` into `to`. Returns the new state, or null when the pour is not allowed. */
export function pour(brew: Brew, from: number, to: number): PourOutcome | null {
  const n = pourCount(brew, from, to);
  if (n === 0) return null;
  const bottles = brew.bottles.map((b) => b.slice());
  const veil = brew.veil.slice();
  const record: Pour = { from, to, n, veilFrom: veil[from]!, veilTo: veil[to]! };
  bottles[to]!.push(...bottles[from]!.splice(-n));
  veil[from] = Math.max(0, Math.min(veil[from]!, bottles[from]!.length - 1));
  const completed = isComplete(bottles[to]!);
  if (completed) veil[to] = 0;
  return {
    brew: { bottles, veil },
    pour: record,
    completed,
    revealed: veil[from] < record.veilFrom,
  };
}

/** Takes a pour back: the layers return and anything it revealed is hidden again. */
export function unpour(brew: Brew, p: Pour): Brew {
  const bottles = brew.bottles.map((b) => b.slice());
  const veil = brew.veil.slice();
  bottles[p.from]!.push(...bottles[p.to]!.splice(-p.n));
  veil[p.from] = p.veilFrom;
  veil[p.to] = p.veilTo;
  return { bottles, veil };
}

/** The extra-bottle helper: one more empty bottle at the end of the shelf. */
export function addBottle(brew: Brew): Brew {
  return { bottles: [...brew.bottles.map((b) => b.slice()), []], veil: [...brew.veil, 0] };
}

/** 3 stars at par or better, 2 within about a third more moves, otherwise 1. */
export function stars(moves: number, par: number): 1 | 2 | 3 {
  if (moves <= par) return 3;
  return moves <= par + Math.max(3, Math.ceil(par * 0.3)) ? 2 : 1;
}

// ─── solver ───
// Best-first search over bottle states. A bottle is packed into one number: four bits per layer (bottom layer in
// the lowest bits) and the veil above them. Bottles keep their shelf positions, so a solution is a list of real
// moves; two states that differ only in bottle order count as the same state.

const LAYERS = 0xffff;
const lenOf = (code: number): number => {
  const l = code & LAYERS;
  return l >= 0x1000 ? 4 : l >= 0x100 ? 3 : l >= 0x10 ? 2 : l > 0 ? 1 : 0;
};
const at = (code: number, i: number): number => (code >> (i * 4)) & 15;

function pack(brew: Brew): number[] {
  return brew.bottles.map((b, i) => {
    let code = brew.veil[i]! << 16;
    b.forEach((f, k) => (code |= f << (k * 4)));
    return code;
  });
}

/**
 * A lower bound on the pours still needed: every run of one flavour has to move at least once, except one run
 * per flavour that already sits at the bottom of a bottle. It is 0 exactly when the level is solved.
 */
function remaining(codes: readonly number[]): number {
  let runs = 0;
  let bottoms = 0;
  for (const code of codes) {
    const len = lenOf(code);
    if (len === 0) continue;
    bottoms |= 1 << at(code, 0);
    runs++;
    for (let i = 1; i < len; i++) if (at(code, i) !== at(code, i - 1)) runs++;
  }
  let distinct = 0;
  for (; bottoms; bottoms &= bottoms - 1) distinct++;
  return runs - distinct;
}

function keyOf(codes: readonly number[]): string {
  const sorted = codes.slice().sort((a, b) => a - b);
  let key = '';
  for (const c of sorted) key += String.fromCharCode(c & LAYERS, c >>> 16);
  return key;
}

/** How strongly the search prefers states that look close to solved over short paths. */
const GREED = 3;
/** States the solver may expand before it gives up. */
export const SOLVE_LIMIT = 6000;

/**
 * Finds a way to solve `brew`: the moves in order, an empty list when it is already solved, or null when there
 * is no solution (or none was found within `limit` states).
 */
export function solve(brew: Brew, limit = SOLVE_LIMIT): Move[] | null {
  const start = pack(brew);
  const count = start.length;
  // search nodes, in parallel arrays
  const states: number[][] = [start];
  const cost: number[] = [0];
  const parent: number[] = [-1];
  const via: number[] = [0];
  const left: number[] = [remaining(start)];
  const seen = new Set<string>([keyOf(start)]);
  // binary heap of node ids, lowest priority first; deeper nodes win ties
  const heap: number[] = [0];
  const prio: number[] = [left[0]! * GREED * 64];
  const better = (a: number, b: number) => prio[a]! < prio[b]!;
  const push = (id: number) => {
    let i = heap.length;
    heap.push(id);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!better(id, heap[p]!)) break;
      heap[i] = heap[p]!;
      i = p;
    }
    heap[i] = id;
  };
  const pop = (): number => {
    const top = heap[0]!;
    const last = heap.pop()!;
    const n = heap.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = i * 2 + 1;
        if (c >= n) break;
        if (c + 1 < n && better(heap[c + 1]!, heap[c]!)) c++;
        if (!better(heap[c]!, last)) break;
        heap[i] = heap[c]!;
        i = c;
      }
      heap[i] = last;
    }
    return top;
  };

  for (let expanded = 0; heap.length > 0 && expanded < limit; expanded++) {
    const id = pop();
    if (left[id] === 0) {
      const moves: Move[] = [];
      for (let n = id; parent[n]! >= 0; n = parent[n]!)
        moves.push({ from: via[n]! >> 4, to: via[n]! & 15 });
      return moves.reverse();
    }
    const codes = states[id]!;
    for (let from = 0; from < count; from++) {
      const cf = codes[from]!;
      const lf = lenOf(cf);
      if (lf === 0) continue;
      const veilF = cf >>> 16;
      const top = at(cf, lf - 1);
      let run = 1;
      while (lf - 1 - run >= veilF && at(cf, lf - 1 - run) === top) run++;
      if (run === CAP) continue; // corked
      let triedEmpty = false;
      for (let to = 0; to < count; to++) {
        if (to === from) continue;
        const ct = codes[to]!;
        const lt = lenOf(ct);
        if (lt === CAP) continue;
        if (lt === 0) {
          // one empty bottle is as good as another, and moving a whole bottle into one changes nothing
          if (triedEmpty || run === lf) continue;
          triedEmpty = true;
        } else if (at(ct, lt - 1) !== top) continue;
        const k = Math.min(run, CAP - lt);
        const next = codes.slice();
        const keep = lf - k;
        next[from] =
          (cf & ((1 << (keep * 4)) - 1)) | (Math.max(0, Math.min(veilF, keep - 1)) << 16);
        let filled = ct;
        for (let i = 0; i < k; i++) filled |= top << ((lt + i) * 4);
        const layers = filled & LAYERS;
        // a bottle that is now full of one flavour shows all its layers
        next[to] = lt + k === CAP && layers === top * 0x1111 ? layers : filled;
        const key = keyOf(next);
        if (seen.has(key)) continue;
        seen.add(key);
        const node = states.length;
        states.push(next);
        cost.push(cost[id]! + 1);
        parent.push(id);
        via.push((from << 4) | to);
        left.push(remaining(next));
        prio.push((cost[node]! + left[node]! * GREED) * 64 - Math.min(63, cost[node]!));
        push(node);
      }
    }
  }
  return null;
}

/** The solver's next move from here, or null when the level is solved or cannot be solved from this state. */
export function hint(brew: Brew): Move | null {
  return solve(brew)?.[0] ?? null;
}

// ─── levels ───

/** Flavours by level: [first level, flavours]. */
const CURVE: readonly (readonly [number, number])[] = [
  [1, 3],
  [4, 4],
  [7, 5],
  [11, 6],
  [16, 7],
  [22, 8],
  [29, 9],
  [37, 10],
  [46, 11],
  [60, 12],
];
/** After the curve tops out, each level picks from these. */
const LATE = [12, 11, 12, 10, 12, 11, 9, 12] as const;
const LAST_STEP = CURVE[CURVE.length - 1]![0];

function flavoursFor(level: number, rng: Rng): number {
  if (level > LAST_STEP) return rng.pick(LATE);
  let flavours = CURVE[0]![1];
  for (const [first, n] of CURVE) if (level >= first) flavours = n;
  return flavours;
}

/** The fewest solver moves a level may have: anything shorter is too easy to be worth a level. */
export function minPar(flavours: number): number {
  return flavours * 2 + 1;
}

/** Hides the lowest layers of a few bottles. Mystery levels are rare at first and more common later. */
function veilFor(level: number, rng: Rng, bottles: readonly number[][]): number[] {
  const veil = bottles.map(() => 0);
  if (level < MYSTERY_FROM) return veil;
  const chance = Math.min(0.4, 0.12 + (level - MYSTERY_FROM) * 0.004);
  // drawn even for the first mystery level, so every level uses the generator the same way
  const lucky = rng.chance(chance);
  if (level !== MYSTERY_FROM && !lucky) return veil;
  const filled = bottles.flatMap((b, i) => (b.length > 0 ? [i] : []));
  const count = Math.min(filled.length, 5, 2 + Math.floor((level - MYSTERY_FROM) / 20));
  const deepest = level < 40 ? 2 : 3;
  for (const i of rng.shuffle(filled).slice(0, count)) veil[i] = rng.int(1, deepest);
  return veil;
}

/** Attempts before the generator falls back to the scramble that cannot fail. */
const DEALS = 60;

/**
 * The level for a number, the same for everyone. Flavours are dealt at random and a deal is kept only when the
 * solver proves it can be solved and it is not too short.
 */
export function makeLevel(level: number): Level {
  const rng = createRng(`hue-brew:level:${level}`);
  const flavours = flavoursFor(level, rng);
  for (let attempt = 0; attempt < DEALS; attempt++) {
    const layers: number[] = [];
    for (let f = 1; f <= flavours; f++) for (let i = 0; i < CAP; i++) layers.push(f);
    rng.shuffle(layers);
    const bottles: number[][] = [];
    for (let i = 0; i < flavours; i++) bottles.push(layers.slice(i * CAP, (i + 1) * CAP));
    for (let i = 0; i < SPARE; i++) bottles.push([]);
    const veil = veilFor(level, rng, bottles);
    if (bottles.some(isComplete)) continue;
    const brew = { bottles, veil };
    const solution = solve(brew);
    if (!solution || solution.length < minPar(flavours)) continue;
    return { level, flavours, brew, par: solution.length, mystery: veil.some((v) => v > 0) };
  }
  return scramble(level, flavours, rng);
}

/**
 * A level made backwards from the solved shelf: each step undoes a legal pour, so playing the steps in reverse
 * solves it. Only used if no random deal passes, which the tests show does not happen for any early level.
 */
export function scramble(level: number, flavours: number, rng: Rng): Level {
  const bottles: number[][] = [];
  for (let f = 1; f <= flavours; f++) bottles.push(new Array<number>(CAP).fill(f));
  for (let i = 0; i < SPARE; i++) bottles.push([]);
  const steps = flavours * 12;
  for (let step = 0; step < steps; step++) {
    const from = rng.int(0, bottles.length - 1);
    const to = rng.int(0, bottles.length - 1);
    const a = bottles[from]!;
    const b = bottles[to]!;
    if (from === to || a.length === 0 || b.length >= CAP) continue;
    const top = a[a.length - 1]!;
    let run = 1;
    while (run < a.length && a[a.length - 1 - run] === top) run++;
    // Take k layers off `from` and put them on `to`. Pouring them back must be legal and move exactly those
    // layers: what stays in `from` is empty or the same flavour, and `to` does not already end in it.
    const most = Math.min(run === a.length ? run : run - 1, CAP - b.length);
    if (most < 1 || b[b.length - 1] === top) continue;
    b.push(...a.splice(-rng.int(1, most)));
  }
  const brew = { bottles, veil: bottles.map(() => 0) };
  const par = solve(brew)?.length ?? steps;
  return { level, flavours, brew, par, mystery: false };
}

/** A saved state belongs to a level when it holds exactly the level's layers in the right number of bottles. */
export function fitsLevel(level: Level, brew: Brew, extra: boolean): boolean {
  if (brew.bottles.length !== level.flavours + SPARE + (extra ? 1 : 0)) return false;
  if (brew.veil.length !== brew.bottles.length) return false;
  const counts = new Array<number>(level.flavours + 1).fill(0);
  for (const [i, b] of brew.bottles.entries()) {
    if (b.length > CAP || brew.veil[i]! > Math.max(0, b.length - 1)) return false;
    for (const f of b) {
      if (!(f >= 1 && f <= level.flavours)) return false;
      counts[f]!++;
    }
  }
  return counts.slice(1).every((n) => n === CAP);
}
