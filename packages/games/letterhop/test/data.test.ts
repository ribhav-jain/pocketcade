// @vitest-environment node
// Shipped puzzle data: every par equals the shortest-path length over the shipped words, pars sit in 4–7 and on the
// weekday curve, starts and goals are common words, and no pair (or its reverse) is in both pools.
import { describe, expect, it } from 'vitest';
import { DAILY } from '../src/data/daily.gen.ts';
import { PRACTICE } from '../src/data/practice.gen.ts';
import { COMMON, WORDS } from '../src/data/words.gen.ts';
import { isCommon, makeDict, wordAt } from '../src/logic.ts';

const dict = makeDict(WORDS, Uint8Array.from(Buffer.from(COMMON, 'base64')));
const CURVE = [4, 4, 5, 5, 5, 6, 7];

// Adjacency once, through wildcard buckets, so recomputing ~2,000 BFS runs stays fast.
const adj: number[][] = (() => {
  const buckets = new Map<string, number[]>();
  for (let i = 0; i < dict.count; i++) {
    const w = wordAt(dict, i);
    for (let p = 0; p < 4; p++) {
      const k = `${w.slice(0, p)}_${w.slice(p + 1)}`;
      buckets.set(k, [...(buckets.get(k) ?? []), i]);
    }
  }
  return Array.from({ length: dict.count }, (_, i) => {
    const w = wordAt(dict, i);
    const out = new Set<number>();
    for (let p = 0; p < 4; p++)
      for (const j of buckets.get(`${w.slice(0, p)}_${w.slice(p + 1)}`)!) if (j !== i) out.add(j);
    return [...out];
  });
})();
const distCache = new Map<number, Int16Array>();
function dist(s: number): Int16Array {
  let d = distCache.get(s);
  if (d) return d;
  d = new Int16Array(dict.count).fill(-1);
  d[s] = 0;
  const q = [s];
  for (let h = 0; h < q.length; h++)
    for (const v of adj[q[h]!]!)
      if (d[v] === -1) {
        d[v] = d[q[h]!]! + 1;
        q.push(v);
      }
  distCache.set(s, d);
  return d;
}
const triples = (list: readonly number[]) =>
  Array.from(
    { length: list.length / 3 },
    (_, i) => [list[i * 3]!, list[i * 3 + 1]!, list[i * 3 + 2]!] as const,
  );

describe('shipped word data', () => {
  it('has enough words, sorted, and enough common ones', () => {
    expect(dict.count).toBeGreaterThanOrEqual(2000);
    const words = Array.from({ length: dict.count }, (_, i) => wordAt(dict, i));
    expect([...words].sort()).toEqual(words);
    expect(words.filter((_, i) => isCommon(dict, i)).length).toBeGreaterThanOrEqual(800);
  });

  it('daily list: at least a year of entries, a multiple of 7, on the weekday curve', () => {
    const d = triples(DAILY);
    expect(d.length).toBeGreaterThanOrEqual(406);
    expect(d.length % 7).toBe(0);
    d.forEach(([, , par], i) => expect(par).toBe(CURVE[i % 7]));
  });

  it('every puzzle: par = shortest distance, 4 ≤ par ≤ 7, common start and goal', () => {
    const all = [
      ...triples(DAILY),
      ...triples(PRACTICE.short),
      ...triples(PRACTICE.medium),
      ...triples(PRACTICE.long),
    ];
    for (const [s, g, par] of all) {
      expect(dist(s)[g], `${wordAt(dict, s)} → ${wordAt(dict, g)}`).toBe(par);
      expect(par).toBeGreaterThanOrEqual(4);
      expect(par).toBeLessThanOrEqual(7);
      expect(isCommon(dict, s) && isCommon(dict, g)).toBe(true);
    }
  });

  it('no (start, goal) pair or its reverse is in both the daily and practice pools', () => {
    const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
    const daily = new Set(triples(DAILY).map(([s, g]) => key(s, g)));
    for (const tier of [PRACTICE.short, PRACTICE.medium, PRACTICE.long])
      for (const [s, g] of triples(tier)) expect(daily.has(key(s, g))).toBe(false);
  });
});
