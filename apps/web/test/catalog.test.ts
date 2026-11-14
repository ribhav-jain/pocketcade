// The portal catalog covers every game, every category is used, and every game ships its own cover art.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  categories,
  gameOrder,
  games,
  gamesIn,
  moodRows,
  related,
  summaries,
  topPicks,
} from '../src/games/catalog';
import { gameMetas } from '../src/games/metas.generated';

const root = new URL('../../../', import.meta.url);

describe('portal catalog', () => {
  it('has presentation data for every game and a category with games for every tile', () => {
    expect(summaries).toHaveLength(games.length);
    for (const c of categories) expect(gamesIn(c.id).length).toBeGreaterThan(0);
    for (const g of games) {
      expect(categories.some((c) => c.id === g.category)).toBe(true);
      expect(g.accent).toMatch(/^#[0-9A-F]{6}$/i);
      expect(g.blurb.length).toBeGreaterThan(40);
    }
  });

  it('lists exactly the game packages, each under its own meta id', () => {
    const folders = readdirSync(new URL('packages/games/', root), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    expect(games.map((g) => g.id).sort()).toEqual(folders);
    for (const [id, meta] of Object.entries(gameMetas)) expect(meta.id).toBe(id);
    expect([...gameOrder].sort(), 'gameOrder names every game once').toEqual(folders);
    expect(games.map((g) => g.id)).toEqual(gameOrder);
  });

  it('builds rows and related lists without duplicates or self-links', () => {
    expect(new Set(topPicks.map((g) => g.id)).size).toBe(topPicks.length);
    for (const row of moodRows) expect(row.games.length).toBeGreaterThanOrEqual(3);
    for (const g of games) expect(related(g).some((o) => o.id === g.id)).toBe(false);
  });

  it('every game ships a square, self-contained media/cover.svg', () => {
    for (const g of games) {
      const file = new URL(`packages/games/${g.id}/media/cover.svg`, root);
      expect(existsSync(file), `${g.id} cover`).toBe(true);
      const svg = readFileSync(file, 'utf8');
      expect(svg, `${g.id} viewBox`).toMatch(/viewBox="0 0 600 600"/);
      expect(svg, `${g.id} external refs`).not.toMatch(/(?:href|src)="(?:https?:)?\/\//);
      expect(svg.length, `${g.id} size`).toBeLessThanOrEqual(40 * 1024);
    }
  });
});
