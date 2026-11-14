// The served build: headers and caching from vercel.json, routing, SEO files, and a browse-and-play pass that
// must cause no CSP violation and no request to another origin.
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { GAME, GAME_PATH, play } from './helpers';

interface VercelJson {
  headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
}
const vercel = JSON.parse(
  readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'),
) as VercelJson;
const securityHeaders = vercel.headers[0]!.headers;
const ORIGIN = 'http://127.0.0.1:4173';
const NOT_FOUND = '/games/does-not-exist/';

test('every kind of response carries the security headers from vercel.json', async ({
  request,
}) => {
  for (const path of ['/', GAME_PATH, '/version.json', NOT_FOUND, GAME_PATH.slice(0, -1)]) {
    const res = await request.get(path, { maxRedirects: 0 });
    for (const h of securityHeaders)
      expect(res.headers()[h.key.toLowerCase()], `${h.key} on ${path}`).toBe(h.value);
  }
});

test('pages revalidate, hashed assets are immutable, version.json is never cached', async ({
  request,
}) => {
  const page = await request.get(GAME_PATH);
  expect(page.headers()['cache-control']).toBe('public, max-age=0, must-revalidate');
  const chunk = (await page.text()).match(/\/_next\/static\/[^"']+\.js/)?.[0];
  expect(chunk).toBeTruthy();
  expect((await request.get(chunk!)).headers()['cache-control']).toBe(
    'public, max-age=31536000, immutable',
  );
  expect((await request.get('/version.json')).headers()['cache-control']).toBe('no-cache');
});

test('a path without its trailing slash redirects; an unknown path is a 404 page', async ({
  request,
}) => {
  const redirect = await request.get(GAME_PATH.slice(0, -1), { maxRedirects: 0 });
  expect(redirect.status()).toBe(308);
  expect(redirect.headers()['location']).toBe(GAME_PATH);

  const missing = await request.get(NOT_FOUND);
  expect(missing.status()).toBe(404);
  const html = await missing.text();
  expect(html).toContain('Page not found');
  expect(html).toMatch(/<meta name="robots" content="noindex"/);
  expect(html).not.toContain('rel="canonical"');
});

test('robots.txt, the sitemap, canonical links, share images and build metadata', async ({
  request,
}) => {
  expect(await (await request.get('/robots.txt')).text()).toContain(
    `Sitemap: ${ORIGIN}/sitemap.xml`,
  );
  const sitemap = await (await request.get('/sitemap.xml')).text();
  for (const path of ['/', '/category/puzzle/', GAME_PATH, '/about/', '/privacy/'])
    expect(sitemap).toContain(`<loc>${ORIGIN}${path}</loc>`);

  const game = await (await request.get(GAME_PATH)).text();
  expect(game).toContain(`<link rel="canonical" href="${ORIGIN}${GAME_PATH}"/>`);
  expect(game).toContain('<script type="application/ld+json">{"@context":"https://schema.org"');
  const image = game.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
  expect(image).toBe(`${ORIGIN}/og/${GAME}.jpg`);
  expect((await request.get(image!)).headers()['content-type']).toBe('image/jpeg');

  // The player compares these two to tell a stale tab from a broken connection.
  const { buildId } = (await (await request.get('/version.json')).json()) as { buildId: string };
  expect(game).toContain(`<meta name="pocketcade-build" content="${buildId}"/>`);
});

test('browsing and playing cause no CSP violation and no request to another origin', async ({
  page,
}) => {
  const offOrigin: string[] = [];
  page.on('request', (r) => {
    const url = r.url();
    if (!url.startsWith(ORIGIN) && !url.startsWith('data:') && !url.startsWith('blob:'))
      offOrigin.push(url);
  });
  await page.addInitScript(() => {
    const w = window as unknown as { __csp: string[] };
    w.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) =>
      w.__csp.push(`${e.violatedDirective} ${e.blockedURI}`),
    );
  });
  const violations = () => page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);

  await page.goto('/');
  await expect(page.locator(`a[href="${GAME_PATH}"]`).first()).toBeVisible();
  expect(await violations()).toEqual([]);

  await page.goto(NOT_FOUND);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  expect(await violations()).toEqual([]);

  await page.goto(GAME_PATH);
  await play(page);
  await page.waitForTimeout(2000);
  expect(await violations()).toEqual([]);
  expect(offOrigin).toEqual([]);
});
