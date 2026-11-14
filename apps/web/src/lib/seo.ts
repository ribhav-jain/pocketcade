// Site URLs, page metadata and JSON-LD. Build time
// only (Server Components and metadata routes): it reads environment variables, which client code must not.
import type { Metadata } from 'next';
import { categoryById, tagLabels, type CatalogGame, type Input } from '../games/catalog';
import { deployEnv } from './build-info';

export const SITE_NAME = 'Pocketcade';

const https = (host: string) => `https://${host.replace(/\/+$/, '')}`;

/**
 * The canonical origin, used by canonicals, the sitemap and JSON-LD in every environment:
 * NEXT_PUBLIC_SITE_URL, else the project's Vercel production domain, else the local static server.
 */
export function siteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL)
    return https(process.env.VERCEL_PROJECT_PRODUCTION_URL);
  return 'http://127.0.0.1:4173';
}

/** The origin this build is served from: a preview's own URL, so a shared preview link shows its own card. */
export function deployUrl(): string {
  return deployEnv() === 'preview' && process.env.VERCEL_URL
    ? https(process.env.VERCEL_URL)
    : siteUrl();
}

interface ShareImage {
  url: string;
  alt: string;
}

export const SITE_IMAGE: ShareImage = {
  url: '/og/_site.jpg',
  alt: 'Pocketcade: a whole arcade in your pocket, with cover art from six of its games.',
};

/**
 * Title, description, canonical, robots and share tags for one page. `path` is the internal href, with its
 * trailing slash. Titles are absolute: every page names the site itself.
 */
export function pageMeta(p: {
  path: string;
  title: string;
  description: string;
  image?: ShareImage;
  noindex?: boolean;
}): Metadata {
  const image = p.image ?? SITE_IMAGE;
  return {
    title: { absolute: p.title },
    description: p.description,
    alternates: { canonical: `${siteUrl()}${p.path}` },
    ...(p.noindex && { robots: { index: false, follow: true } }),
    // relative URLs resolve against the layout's metadataBase (deployUrl)
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      title: p.title,
      description: p.description,
      url: p.path,
      images: [{ url: image.url, width: 1200, height: 630, alt: image.alt }],
    },
    twitter: {
      card: 'summary_large_image',
      title: p.title,
      description: p.description,
      images: [image.url],
    },
  };
}

// Built from a string, so the source holds no raw U+2028 or U+2029 (a line break inside a regex literal).
const UNSAFE = new RegExp('[<>&\\u2028\\u2029]', 'g');

/** safe inside a <script> element, whatever the data holds. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(
    UNSAFE,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}

const CONTROL: Record<Input, string> = {
  keyboard: 'fullKeyboardControl',
  pointer: 'fullMouseControl',
  touch: 'fullTouchControl',
};

/**
 * The game page's JSON-LD: VideoGame (without the fields that need data the portal does not keep
 * yet: dates, preview video, thumbnails) and its BreadcrumbList.
 */
export function gameJsonLd(g: CatalogGame): object[] {
  const site = siteUrl();
  const url = `${site}/games/${g.id}/`;
  const category = categoryById(g.category)!;
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'VideoGame',
      '@id': `${url}#game`,
      name: g.title,
      description: g.tagline,
      url,
      image: [`${site}/og/${g.id}.jpg`],
      genre: [category.title],
      keywords: g.tags.map((t) => tagLabels[t]).join(', '),
      gamePlatform: 'Web browser',
      applicationCategory: 'Game',
      operatingSystem: 'Any',
      playMode: 'SinglePlayer',
      numberOfPlayers: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 1 },
      inLanguage: 'en',
      isAccessibleForFree: true,
      softwareVersion: g.version,
      author: [{ '@type': 'Organization', name: 'Pocketcade contributors' }],
      publisher: { '@type': 'Organization', name: SITE_NAME },
      license: 'https://creativecommons.org/licenses/by/4.0/',
      accessibilityControl: g.inputs.map((i) => CONTROL[i]),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${site}/` },
        {
          '@type': 'ListItem',
          position: 2,
          name: category.title,
          item: `${site}/category/${category.id}/`,
        },
        { '@type': 'ListItem', position: 3, name: g.title, item: url },
      ],
    },
  ];
}
