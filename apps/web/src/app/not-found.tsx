// exported as 404.html and served with HTTP 404 for unknown paths.
import type { Metadata } from 'next';
import Link from 'next/link';
import { CardItems } from '../components/CardItems';
import { Icon, LogoMark } from '../components/Icon';
import { topPicks } from '../games/catalog';
import { SITE_IMAGE, SITE_NAME } from '../lib/seo';

// noindex and no canonical.
export const metadata: Metadata = {
  title: { absolute: `Page not found · ${SITE_NAME}` },
  robots: { index: false },
  openGraph: { images: [{ url: SITE_IMAGE.url, width: 1200, height: 630, alt: SITE_IMAGE.alt }] },
};

export default function NotFound() {
  return (
    <section className="not-found">
      <div className="nf-badge" aria-hidden="true">
        <LogoMark size={88} />
      </div>
      <h1>Page not found</h1>
      <p>This level doesn&apos;t exist (yet). Pick a game and keep playing.</p>
      <Link href="/" className="btn btn-primary">
        <Icon name="left" size={18} />
        Go to the home page
      </Link>
      <ul className="grid nf-grid" aria-label="Popular picks">
        <CardItems games={topPicks.slice(0, 4)} />
      </ul>
    </section>
  );
}
