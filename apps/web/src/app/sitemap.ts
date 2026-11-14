// /sitemap.xml: every listed game and category plus the static pages, on the canonical origin.
// No lastmod: the portal keeps no per-game update dates yet, and a build date on every entry would claim each deploy
// changed every page.
import type { MetadataRoute } from 'next';
import { categories, games, gamesIn } from '../games/catalog';
import { siteUrl } from '../lib/seo';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  const site = siteUrl();
  return [
    '/',
    ...categories.filter((c) => gamesIn(c.id).length > 0).map((c) => `/category/${c.id}/`),
    ...games.map((g) => `/games/${g.id}/`),
    '/about/',
    '/privacy/',
    '/licenses/',
  ].map((path) => ({ url: `${site}${path}` }));
}
