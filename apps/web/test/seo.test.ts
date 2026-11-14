// SEO helpers (site URLs, page metadata, JSON-LD), the ASSETS.md reader and the details read from game.md.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { games } from '../src/games/catalog';
import { gameDetails } from '../src/games/details.generated';
import { parseAssets, readAssets } from '../src/lib/assets';
import { deployUrl, gameJsonLd, pageMeta, serializeJsonLd, siteUrl } from '../src/lib/seo';

afterEach(() => vi.unstubAllEnvs());

function env(vars: Record<string, string>) {
  for (const k of [
    'NEXT_PUBLIC_SITE_URL',
    'NEXT_PUBLIC_DEPLOY_ENV',
    'VERCEL_ENV',
    'VERCEL_URL',
    'VERCEL_PROJECT_PRODUCTION_URL',
  ])
    vi.stubEnv(k, vars[k] ?? '');
}

describe('site URLs', () => {
  it('canonicals use the production origin on a preview; share tags use the preview', () => {
    env({
      VERCEL_ENV: 'preview',
      VERCEL_URL: 'p.vercel.app',
      VERCEL_PROJECT_PRODUCTION_URL: 'prod.vercel.app',
    });
    expect(siteUrl()).toBe('https://prod.vercel.app');
    expect(deployUrl()).toBe('https://p.vercel.app');
    const meta = pageMeta({ path: '/games/sumslide/', title: 'T', description: 'D' });
    expect(meta.alternates?.canonical).toBe('https://prod.vercel.app/games/sumslide/');
  });

  it('production uses one origin; NEXT_PUBLIC_SITE_URL wins; local builds use the static server', () => {
    env({
      VERCEL_ENV: 'production',
      VERCEL_URL: 'x.vercel.app',
      VERCEL_PROJECT_PRODUCTION_URL: 'prod.vercel.app',
    });
    expect(deployUrl()).toBe('https://prod.vercel.app');
    env({
      NEXT_PUBLIC_SITE_URL: 'https://pocketcade.example/',
      VERCEL_PROJECT_PRODUCTION_URL: 'prod.vercel.app',
    });
    expect(siteUrl()).toBe('https://pocketcade.example');
    env({});
    expect(siteUrl()).toBe('http://127.0.0.1:4173');
  });
});

describe('JSON-LD', () => {
  it('escapes everything that could end the script element', () => {
    const separators = String.fromCharCode(0x2028, 0x2029);
    const nasty = `</script><b>&${separators}`;
    const out = serializeJsonLd({ s: nasty });
    for (const c of `<>&${separators}`) expect(out.includes(c), c).toBe(false);
    expect(JSON.parse(out)).toEqual({ s: nasty });
  });

  it('describes every game and its breadcrumb on the canonical origin', () => {
    env({ VERCEL_PROJECT_PRODUCTION_URL: 'prod.vercel.app' });
    for (const g of games) {
      const [game, crumbs] = gameJsonLd(g) as Array<Record<string, unknown>>;
      expect(game).toMatchObject({
        '@type': 'VideoGame',
        name: g.title,
        url: `https://prod.vercel.app/games/${g.id}/`,
      });
      expect((crumbs!.itemListElement as unknown[]).length).toBe(3);
    }
  });
});

describe('page data', () => {
  it('every game has controls for one of its inputs, cover alt text and a share image under 300 KB', () => {
    for (const g of games) {
      const d = gameDetails[g.id];
      expect(
        d.controls.some((c) => g.inputs.some((i) => c[i])),
        g.id,
      ).toBe(true);
      expect(d.alt.length).toBeGreaterThan(20);
      const og = readFileSync(new URL(`../public/og/${g.id}.jpg`, import.meta.url));
      expect(og.length).toBeLessThan(300 * 1024);
    }
  });

  it('reads every ASSETS.md row with its id', () => {
    const rows = readAssets();
    expect(rows.map((r) => r.id)).toContain('font-fredoka');
    for (const r of rows) expect(r.id).toMatch(/^[a-z0-9-]+$/);
    expect(
      parseAssets('| `a-b` | T | [Me](x) | MIT | https://e.x | `f.ts` |\n| ID | Title |'),
    ).toEqual([
      { id: 'a-b', title: 'T', author: 'Me', license: 'MIT', url: 'https://e.x', files: 'f.ts' },
    ]);
  });
});
