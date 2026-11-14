import { describe, expect, it } from 'vitest';
import { gameChunks } from '../check-budgets.ts';

// The shapes Turbopack emits for the game registry and for one lazy module's loader.
const registry =
  'let r={"bao-bolt":()=>e.A(29616),letterhop:()=>e.A(56361),sumslide:()=>e.A(74239)};';
const loaders =
  '29616,s=>{s.v(t=>Promise.all(["static/chunks/kit.js","static/chunks/bao.js"].map(t=>s.l(t))).then(()=>t(1)))},' +
  '174239,s=>{s.v(t=>Promise.all(["static/chunks/other.js"].map(t=>s.l(t))).then(()=>t(2)))},' +
  '74239,s=>{s.v(t=>Promise.all(["static/chunks/kit.js","static/chunks/sum.js"].map(t=>s.l(t))).then(()=>t(3)))}';

describe('gameChunks', () => {
  it("lists a game's lazy chunks from the registry entry and its loader", () => {
    const sources = ['unrelated()', registry, loaders];
    expect(gameChunks(sources, 'sumslide')).toEqual([
      '/_next/static/chunks/kit.js',
      '/_next/static/chunks/sum.js',
    ]);
    expect(gameChunks(sources, 'bao-bolt')).toEqual([
      '/_next/static/chunks/kit.js',
      '/_next/static/chunks/bao.js',
    ]);
  });

  it('returns nothing for a game the build does not register or cannot load', () => {
    expect(gameChunks([registry, loaders], 'slide')).toEqual([]);
    expect(gameChunks([registry, loaders], 'letterhop')).toEqual([]);
  });
});
