// Molehills rules, pure TypeScript: board sizes, digging, the deterministic solver (single numbers, pairs of
// numbers, the global mole count), no-guess generation and hints.
import type { Rng } from '@pocketcade/toolkit';

export type SizeId = 'garden' | 'field' | 'meadow';
interface Size {
  cols: number;
  rows: number;
  moles: number;
  /** whether pair deductions are allowed, and how many a generated board must need (keeps bigger sizes harder) */
  pairs: boolean;
  minPairs: number;
}
export const SIZES: Record<SizeId, Size> = {
  garden: { cols: 8, rows: 10, moles: 12, pairs: false, minPairs: 0 },
  field: { cols: 12, rows: 16, moles: 32, pairs: true, minPairs: 2 },
  meadow: { cols: 16, rows: 24, moles: 70, pairs: true, minPairs: 5 },
};
export const SIZE_IDS: readonly SizeId[] = ['garden', 'field', 'meadow'];
export const GEN_VERSION = 1;
const MAX_ATTEMPTS = 2000;

/** In-bounds 8-neighbourhoods per size, cell index = row × cols + col. */
const NB = new Map<SizeId, number[][]>();
export function neighbours(size: SizeId): number[][] {
  let n = NB.get(size);
  if (n) return n;
  const { cols, rows } = SIZES[size];
  n = Array.from({ length: cols * rows }, (_, i) => {
    const [r, c] = [Math.floor(i / cols), i % cols];
    const out: number[] = [];
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        const [rr, cc] = [r + dr, c + dc];
        if ((dr || dc) && rr >= 0 && rr < rows && cc >= 0 && cc < cols) out.push(rr * cols + cc);
      }
    return out;
  });
  NB.set(size, n);
  return n;
}

export interface Board {
  size: SizeId;
  moles: Uint8Array;
  /** mole neighbours of each cell */
  counts: Uint8Array;
}

export function makeBoard(size: SizeId, moles: Uint8Array): Board {
  const nb = neighbours(size);
  const counts = new Uint8Array(moles.length);
  for (let i = 0; i < moles.length; i++) for (const j of nb[i]!) counts[i] = counts[i]! + moles[j]!;
  return { size, moles, counts };
}

/** Moles anywhere except the first dig and its neighbours: partial Fisher–Yates over the ascending candidates. */
export function placeMoles(size: SizeId, start: number, rng: Rng): Uint8Array {
  const { cols, rows, moles } = SIZES[size];
  const banned = new Set([start, ...neighbours(size)[start]!]);
  const cand: number[] = [];
  for (let i = 0; i < cols * rows; i++) if (!banned.has(i)) cand.push(i);
  const out = new Uint8Array(cols * rows);
  for (let k = 0; k < moles; k++) {
    const j = rng.int(k, cand.length - 1);
    [cand[k], cand[j]] = [cand[j]!, cand[k]!];
    out[cand[k]!] = 1;
  }
  return out;
}

/** Digs a cell; a 0 floods over its 8-neighbourhood. Returns the cells opened (mole cells are never passed in). */
export function dig(b: Board, dug: Uint8Array, cell: number, blocked?: Uint8Array): number[] {
  if (dug[cell] || b.moles[cell]) return [];
  const nb = neighbours(b.size);
  const opened: number[] = [];
  const stack = [cell];
  dug[cell] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    opened.push(i);
    if (b.counts[i]) continue;
    for (const j of nb[i]!)
      if (!dug[j] && !b.moles[j] && !blocked?.[j]) {
        dug[j] = 1;
        stack.push(j);
      }
  }
  return opened;
}

/**
 * One round of deduction from the dug cells and the solver's own known moles (never the player's flowers):
 * single-number rules to a fixpoint, else one pair deduction, else the global count. Adds to `known`; returns
 * the safe cells found (or null if stuck).
 */
export function deduce(
  b: Board,
  dug: Uint8Array,
  known: Uint8Array,
  allowPairs: boolean,
): { safe: number[]; pair: boolean } | null {
  const nb = neighbours(b.size);
  const n = dug.length;
  const unknown = (j: number) => !dug[j] && !known[j];
  const rest = (i: number) => {
    let k = 0;
    const u: number[] = [];
    for (const j of nb[i]!) {
      if (known[j]) k++;
      else if (!dug[j]) u.push(j);
    }
    return { r: b.counts[i]! - k, u };
  };
  // A satisfied number makes its other neighbours safe; a saturated one makes them all moles.
  const safe = new Set<number>();
  for (let changed = true; changed;) {
    changed = false;
    for (let i = 0; i < n; i++) {
      if (!dug[i] || !b.counts[i]) continue;
      const { r, u } = rest(i);
      const open = u.filter((j) => !safe.has(j));
      if (!open.length) continue;
      if (r === 0) for (const j of open) safe.add(j);
      else if (r === open.length) {
        for (const j of open) known[j] = 1;
        changed = true;
      }
    }
  }
  if (safe.size) return { safe: [...safe].sort((x, y) => x - y), pair: false };
  // Pairs of numbers up to two cells apart that share unknown neighbours: if B needs exactly as many more moles
  // than A as B has cells A cannot see, those cells are moles and A's cells outside B are safe.
  if (allowPairs) {
    const { cols } = SIZES[b.size];
    for (let a = 0; a < n; a++) {
      if (!dug[a] || !b.counts[a]) continue;
      const A = rest(a);
      if (!A.u.length) continue;
      const [ar, ac] = [Math.floor(a / cols), a % cols];
      for (let dr = -2; dr <= 2; dr++)
        for (let dc = -2; dc <= 2; dc++) {
          const [br, bc] = [ar + dr, ac + dc];
          const bi = br * cols + bc;
          if (bi <= a || bc < 0 || bc >= cols || br < 0 || bi >= n || !dug[bi] || !b.counts[bi])
            continue;
          const B = rest(bi);
          if (!B.u.some((j) => A.u.includes(j))) continue;
          for (const [X, Y] of [
            [A, B],
            [B, A],
          ] as const) {
            const yOnly = Y.u.filter((j) => !X.u.includes(j));
            const xOnly = X.u.filter((j) => !Y.u.includes(j));
            if (Y.r - X.r !== yOnly.length || (!yOnly.length && !xOnly.length)) continue;
            for (const j of yOnly) known[j] = 1;
            if (xOnly.length) return { safe: xOnly.sort((x, y) => x - y), pair: true };
            if (yOnly.length) return { safe: [], pair: true };
          }
        }
    }
  }
  // Count the remaining moles against the unknown cells.
  let knownCount = 0;
  const unknowns: number[] = [];
  for (let i = 0; i < n; i++) {
    if (known[i]) knownCount++;
    else if (unknown(i)) unknowns.push(i);
  }
  const left = SIZES[b.size].moles - knownCount;
  if (unknowns.length && left === 0) return { safe: unknowns, pair: false };
  if (unknowns.length && left === unknowns.length) {
    for (const j of unknowns) known[j] = 1;
    return { safe: [], pair: false };
  }
  return null;
}

/** Plays the board from the first dig with the size's rule ceiling. */
export function solve(
  b: Board,
  start: number,
): { solved: boolean; pairs: number; opening: number } {
  const n = b.moles.length;
  const dug = new Uint8Array(n);
  const known = new Uint8Array(n);
  const opening = dig(b, dug, start).length;
  const safeTotal = n - SIZES[b.size].moles;
  let pairs = 0;
  let dugCount = opening;
  while (dugCount < safeTotal) {
    const d = deduce(b, dug, known, SIZES[b.size].pairs);
    if (!d) return { solved: false, pairs, opening };
    if (d.pair) pairs++;
    for (const s of d.safe) dugCount += dig(b, dug, s).length;
  }
  return { solved: true, pairs, opening };
}

export type BoardOrigin = { src: 'gen'; seed: string } | { src: 'unverified'; seed: string };
interface Generated {
  moles: Uint8Array;
  origin: BoardOrigin;
  attempts: number;
}

/** True when the board needs no guess from `start`, opens ≤ 50 % of the safe patches, and uses enough pairs. */
export function acceptable(b: Board, start: number): boolean {
  const r = solve(b, start);
  const safe = b.moles.length - SIZES[b.size].moles;
  return r.solved && r.opening <= safe / 2 && r.pairs >= SIZES[b.size].minPairs;
}

/**
 * No-guess generation, time-sliced: each step() tries attempts until `maxMs` passes (or, with no clock, one
 * attempt per call). Attempt n uses `rng.fork('gen/' + n)`. After MAX_ATTEMPTS the last board is used unverified.
 */
export function createGenerator(size: SizeId, start: number, rng: Rng, now: (() => number) | null) {
  let n = 0;
  return {
    get attempts() {
      return n;
    },
    step(maxMs: number): Generated | null {
      const end = now ? now() + maxMs : 0;
      do {
        const moles = placeMoles(size, start, rng.fork(`gen/${n}`));
        const seed = `gen/${n}`;
        n++;
        if (acceptable(makeBoard(size, moles), start))
          return { moles, origin: { src: 'gen', seed }, attempts: n };
        if (n >= MAX_ATTEMPTS) return { moles, origin: { src: 'unverified', seed }, attempts: n };
      } while (now && now() < end);
      return null;
    },
  };
}

type Hint = { cell: number; kind: 'dig' | 'flower' | 'misplaced' };

/** The next move the solver can see from the dug cells (ignoring flowers), or a misplaced flower first. */
export function hint(b: Board, dug: Uint8Array, flowers: Uint8Array): Hint | null {
  for (let i = 0; i < flowers.length; i++)
    if (flowers[i] && !b.moles[i]) return { cell: i, kind: 'misplaced' };
  const known = new Uint8Array(dug.length);
  for (let guard = 0; guard < dug.length; guard++) {
    const d = deduce(b, dug, known, true);
    if (!d) break;
    const s = d.safe.find((i) => !dug[i]);
    if (s !== undefined) return { cell: s, kind: 'dig' };
  }
  for (let i = 0; i < known.length; i++)
    if (known[i] && !flowers[i]) return { cell: i, kind: 'flower' };
  return null;
}

/** Moles the solver can prove from the dug cells alone (attract plants flowers on these). */
export function provenMoles(b: Board, dug: Uint8Array): number[] {
  const known = new Uint8Array(dug.length);
  for (let guard = 0; guard < dug.length; guard++) {
    const d = deduce(b, dug, known, true);
    if (!d || d.safe.length) break;
  }
  return [...known.keys()].filter((i) => known[i]);
}

// ─── bitsets: base64url without padding, bit i = cell i, LSB-first per byte ───

export function toBits(a: Uint8Array): string {
  const bytes = new Uint8Array(Math.ceil(a.length / 8));
  for (let i = 0; i < a.length; i++) if (a[i]) bytes[i >> 3]! |= 1 << (i & 7);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function fromBits(s: string, length: number): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  let raw: string;
  try {
    raw = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  } catch {
    return null;
  }
  if (raw.length !== Math.ceil(length / 8)) return null;
  const out = new Uint8Array(length);
  for (let i = 0; i < raw.length * 8; i++) {
    const bit = (raw.charCodeAt(i >> 3) >> (i & 7)) & 1;
    if (i >= length && bit) return null; // unused high bits must be 0
    if (i < length) out[i] = bit;
  }
  return out;
}

export const popcount = (a: Uint8Array) => a.reduce((n, x) => n + x, 0);
