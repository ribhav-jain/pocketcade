// tools/gen-word-ladder: builds Letterhop's dictionary, daily list and practice pools from
// packages/games/letterhop/data/{source,common,blocklist}.txt. Deterministic for a seed.
// Usage: node tools/gen-word-ladder.ts [--seed letterhop-v1] [--check]
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PKG = join(root, 'packages', 'games', 'letterhop');

/** Daily curve by weekday index (DAILY_EPOCH is a Monday): Mon..Sun. */
export const CURVE = [4, 4, 5, 5, 5, 6, 7] as const;
const DAILY_TARGET = 728;
const DAILY_MIN = 406;
const REUSE_WINDOW = 60;
const TIERS = {
  short: { pars: [4], min: 400, max: 500 },
  medium: { pars: [5], min: 400, max: 500 },
  long: { pars: [6, 7], min: 200, max: 300 },
};

export interface Pair {
  s: number;
  g: number;
  par: number;
  ways: number;
}

export function readList(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim().toLowerCase())
    .filter((l) => l && !l.startsWith('#'));
}

/** One-letter-change graph through wildcard buckets ("c_ld"). */
export function buildGraph(words: readonly string[]): number[][] {
  const buckets = new Map<string, number[]>();
  words.forEach((w, i) => {
    for (let p = 0; p < w.length; p++) {
      const k = `${w.slice(0, p)}_${w.slice(p + 1)}`;
      const b = buckets.get(k);
      if (b) b.push(i);
      else buckets.set(k, [i]);
    }
  });
  return words.map((w, i) => {
    const out = new Set<number>();
    for (let p = 0; p < w.length; p++)
      for (const j of buckets.get(`${w.slice(0, p)}_${w.slice(p + 1)}`)!) if (j !== i) out.add(j);
    return [...out].sort((a, b) => a - b);
  });
}

/** BFS distances and shortest-path counts from `start`; `allowed` restricts the nodes visited. */
export function bfs(
  adj: readonly number[][],
  start: number,
  allowed?: Uint8Array,
): { dist: Int16Array; ways: Float64Array } {
  const dist = new Int16Array(adj.length).fill(-1);
  const ways = new Float64Array(adj.length);
  dist[start] = 0;
  ways[start] = 1;
  const q = [start];
  for (let h = 0; h < q.length; h++) {
    const u = q[h]!;
    for (const v of adj[u]!) {
      if (allowed && !allowed[v]) continue;
      if (dist[v] === -1) {
        dist[v] = dist[u]! + 1;
        q.push(v);
      }
      if (dist[v] === dist[u]! + 1) ways[v]! += ways[u]!;
    }
  }
  return { dist, ways };
}

/** sfc32 seeded from a string with FNV-1a + splitmix32 (same construction as the toolkit RNG). */
export function rng(seed: string): () => number {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(seed)) h = Math.imul(h ^ b, 0x01000193);
  const split = () => {
    h = (h + 0x9e3779b9) | 0;
    let z = h;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
  let [a, b, c, d] = [split(), split(), split(), split()];
  const next = () => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 12; i++) next();
  return next;
}

function shuffle<T>(items: T[], next: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}

export interface Generated {
  words: string[];
  common: Set<string>;
  daily: Pair[];
  practice: { short: Pair[]; medium: Pair[]; long: Pair[] };
  report: Record<string, unknown>;
}

export function generate(
  source: string,
  commonText: string,
  blocklist: string,
  seed: string,
): Generated {
  const blocked = new Set(readList(blocklist));
  const words = [...new Set(readList(source))]
    .filter((w) => /^[a-z]{4}$/.test(w) && !blocked.has(w))
    .sort();
  const index = new Map(words.map((w, i) => [w, i]));
  const common = new Set(readList(commonText).filter((w) => index.has(w)));
  const mask = new Uint8Array(words.length);
  for (const w of common) mask[index.get(w)!] = 1;
  const adj = buildGraph(words);

  // Candidate pairs: both ends common, par 4–7 over the full dictionary, a shortest path of common words only.
  const pairs: Pair[] = [];
  const starts = [...common].sort().map((w) => index.get(w)!);
  for (const s of starts) {
    const full = bfs(adj, s);
    const onlyCommon = bfs(adj, s, mask);
    for (const g of starts) {
      if (g <= s) continue; // each unordered pair once: (s, g) and (g, s) never both ship
      const par = full.dist[g]!;
      if (par < 4 || par > 7 || onlyCommon.dist[g] !== par) continue;
      pairs.push({ s, g, par, ways: full.ways[g]! });
    }
  }
  const next = rng(seed);
  const byPar = new Map<number, Pair[]>();
  for (const p of shuffle(pairs, next)) {
    if (next() < 0.5) [p.s, p.g] = [p.g, p.s]; // direction
    const list = byPar.get(p.par) ?? [];
    list.push(p);
    byPar.set(p.par, list);
  }

  // Daily: weekday curve; ways ≥ 2 for par 4–5; no start/goal reuse within 60 entries.
  const daily: Pair[] = [];
  for (let i = 0; i < DAILY_TARGET; i++) {
    const par = CURVE[i % 7]!;
    const recent = new Set(daily.slice(-REUSE_WINDOW).flatMap((p) => [p.s, p.g]));
    const pool = byPar.get(par) ?? [];
    const k = pool.findIndex(
      (p) => p.ways >= (par <= 5 ? 2 : 1) && !recent.has(p.s) && !recent.has(p.g),
    );
    if (k < 0) break;
    daily.push(pool.splice(k, 1)[0]!);
  }
  daily.length -= daily.length % 7;
  if (daily.length < DAILY_MIN)
    throw new Error(`daily list has ${daily.length} entries; need ≥ ${DAILY_MIN}`);

  const practice = {} as Generated['practice'];
  for (const [tier, spec] of Object.entries(TIERS) as Array<
    [keyof typeof TIERS, (typeof TIERS)[keyof typeof TIERS]]
  >) {
    const pool = shuffle(
      spec.pars.flatMap((p) => byPar.get(p) ?? []),
      next,
    ).slice(0, spec.max);
    if (pool.length < spec.min)
      throw new Error(`practice ${tier} has ${pool.length} puzzles; need ≥ ${spec.min}`);
    practice[tier] = pool;
  }

  const hist = (list: Pair[], key: 'par' | 'ways') =>
    list.reduce<Record<string, number>>(
      (h, p) => (
        (h[key === 'ways' ? String(Math.min(p.ways, 10)) : String(p.par)] =
          (h[key === 'ways' ? String(Math.min(p.ways, 10)) : String(p.par)] ?? 0) + 1),
        h
      ),
      {},
    );
  const report = {
    seed,
    words: words.length,
    common: common.size,
    blocked: blocked.size,
    candidatePairs: pairs.length,
    daily: { entries: daily.length, par: hist(daily, 'par'), waysCapped10: hist(daily, 'ways') },
    practice: {
      short: practice.short.length,
      medium: practice.medium.length,
      long: practice.long.length,
    },
  };
  return { words, common, daily, practice, report };
}

const HEADER =
  '// Generated by tools/gen-word-ladder.ts from data/*.txt (see data/SOURCE.md). Do not edit.\n';
const flat = (list: Pair[]) => list.flatMap((p) => [p.s, p.g, p.par]);
function chunked(nums: number[]): string {
  const lines: string[] = [];
  for (let i = 0; i < nums.length; i += 24) lines.push(`  ${nums.slice(i, i + 24).join(', ')},`);
  return `[\n${lines.join('\n')}\n]`;
}

export function render(gen: Generated): Record<string, string> {
  const bits = new Uint8Array(Math.ceil(gen.words.length / 8));
  gen.words.forEach((w, i) => gen.common.has(w) && (bits[i >> 3]! |= 1 << (i & 7)));
  const words = gen.words.join('');
  return {
    'src/data/words.gen.ts':
      `${HEADER}/** Sorted 4-letter words, concatenated: word i is WORDS.slice(4 * i, 4 * i + 4). */\n` +
      `export const WORDS =\n${(words.match(/.{1,96}/g) ?? []).map((l) => `  '${l}'`).join(' +\n')};\n\n` +
      `/** Bitset over WORDS (bit i of byte i >> 3): the common subset for starts, goals and revealed paths. */\n` +
      `export const COMMON = '${Buffer.from(bits).toString('base64')}';\n`,
    'src/data/daily.gen.ts': `${HEADER}/** Flat [startIndex, goalIndex, par] triples; entry i is for weekday i mod 7 (Monday = 0). */\nexport const DAILY: readonly number[] = ${chunked(flat(gen.daily))};\n`,
    'src/data/practice.gen.ts':
      `${HEADER}/** Flat [startIndex, goalIndex, par] triples per tier. */\nexport const PRACTICE = {\n` +
      (['short', 'medium', 'long'] as const)
        .map(
          (t) =>
            `  ${t}: ${chunked(flat(gen.practice[t])).replace(/\n/g, '\n  ')} as readonly number[],`,
        )
        .join('\n') +
      '\n};\n',
    'data/report.json': `${JSON.stringify(gen.report, null, 2)}\n`,
  };
}

function main(): void {
  const args = process.argv.slice(2);
  const seedAt = args.indexOf('--seed');
  const seed = seedAt > -1 ? args[seedAt + 1]! : 'letterhop-v1';
  const read = (f: string) => readFileSync(join(PKG, 'data', f), 'utf8');
  const files = render(
    generate(read('source.txt'), read('common.txt'), read('blocklist.txt'), seed),
  );
  if (args.includes('--check')) {
    const stale = Object.entries(files).filter(([f, text]) => {
      try {
        return readFileSync(join(PKG, f), 'utf8') !== text;
      } catch {
        return true;
      }
    });
    if (stale.length) {
      console.error(
        `gen-word-ladder: out of date: ${stale.map(([f]) => f).join(', ')}. Run node tools/gen-word-ladder.ts`,
      );
      process.exitCode = 1;
    } else console.log('gen-word-ladder: OK');
    return;
  }
  for (const [f, text] of Object.entries(files)) writeFileSync(join(PKG, f), text);
  console.log(`gen-word-ladder: wrote ${Object.keys(files).join(', ')}`);
  console.log(files['data/report.json']);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
