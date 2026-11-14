// Seeded RNG: sfc32 with FNV-1a + splitmix32 seeding.
// Uses only Math.imul, >>>, ^, |0 and + so output is identical in every JS engine.

export type RngState = [number, number, number, number];

export interface Rng {
  /** [0, 1), 32-bit resolution */
  next(): number;
  nextUint32(): number;
  /** inclusive, rejection-sampled */
  int(min: number, max: number): number;
  float(min: number, max: number): number;
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** in place, Fisher–Yates */
  shuffle<T>(items: T[]): T[];
  weighted<T>(items: readonly (readonly [T, number])[]): T;
  /** from root seed + label, position-independent */
  fork(label: string): Rng;
  state(): RngState;
}

let encoder: TextEncoder | null = null;

function fnv1a(s: string): number {
  encoder ??= new TextEncoder();
  let h = 0x811c9dc5;
  for (const byte of encoder.encode(s)) {
    h ^= byte;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function splitmix32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    return (t ^ (t >>> 15)) >>> 0;
  };
}

/** UTF-8 → FNV-1a 32-bit → splitmix32 × 4. */
export function seedFromString(s: string): RngState {
  const sm = splitmix32(fnv1a(s));
  return [sm(), sm(), sm(), sm()];
}

export function isRngState(v: unknown): v is RngState {
  return (
    Array.isArray(v) &&
    v.length === 4 &&
    v.every((n) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff)
  );
}

/**
 * Creates an RNG from a seed string (12 outputs discarded) or resumes exactly from a saved state.
 * `root` names the seed string forks derive from when resuming from a state.
 */
export function createRng(seed: string | RngState, root?: string): Rng {
  let a: number;
  let b: number;
  let c: number;
  let d: number;
  const rootSeed = typeof seed === 'string' ? seed : (root ?? seed.join(','));

  const nextUint32 = (): number => {
    const t0 = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    const t = (t0 + d) | 0;
    c = (c + t) | 0;
    return t >>> 0;
  };

  [a, b, c, d] =
    typeof seed === 'string'
      ? seedFromString(seed)
      : [seed[0] | 0, seed[1] | 0, seed[2] | 0, seed[3] | 0];
  if (typeof seed === 'string') for (let i = 0; i < 12; i++) nextUint32();

  const int = (min: number, max: number): number => {
    const range = max - min + 1;
    if (!Number.isInteger(min) || !Number.isInteger(max) || range < 1 || range > 0x100000000) {
      throw new RangeError(`rng.int(${min}, ${max}): invalid range`);
    }
    const limit = 0x100000000 - (0x100000000 % range);
    let x = nextUint32();
    while (x >= limit) x = nextUint32();
    return min + (x % range);
  };

  const rng: Rng = {
    next: () => nextUint32() / 0x100000000,
    nextUint32,
    int,
    float: (min, max) => min + (nextUint32() / 0x100000000) * (max - min),
    chance: (p) => nextUint32() / 0x100000000 < p,
    pick(items) {
      if (items.length === 0) throw new RangeError('rng.pick: empty list');
      return items[int(0, items.length - 1)]!;
    },
    shuffle(items) {
      for (let i = items.length - 1; i > 0; i--) {
        const j = int(0, i);
        [items[i], items[j]] = [items[j]!, items[i]!];
      }
      return items;
    },
    weighted(items) {
      const total = items.reduce((s, [, w]) => s + Math.max(0, w), 0);
      if (total <= 0) throw new RangeError('rng.weighted: no positive weight');
      let r = (nextUint32() / 0x100000000) * total;
      for (const [item, w] of items) {
        r -= Math.max(0, w);
        if (r < 0) return item;
      }
      return items[items.length - 1]![0];
    },
    fork: (label) => createRng(`${rootSeed}/${label}`),
    state: () => [a >>> 0, b >>> 0, c >>> 0, d >>> 0],
  };
  return rng;
}

/** 64 random bits as 16 hex chars (play seeds). */
export function randomSeedHex(): string {
  const words = new Uint32Array(2);
  globalThis.crypto.getRandomValues(words);
  return Array.from(words, (w) => w.toString(16).padStart(8, '0')).join('');
}
