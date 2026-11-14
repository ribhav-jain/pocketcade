import '@fontsource-variable/fredoka/index.css';
import '@fontsource-variable/nunito/index.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { RouteFocus } from '../components/RouteFocus';
import { SiteFooter, SiteHeader } from '../components/SiteChrome';
import { buildId } from '../lib/build-info';
import { deployUrl, SITE_NAME } from '../lib/seo';
import './globals.css';

// Each route sets its own title, canonical and share tags with pageMeta; nothing page-specific
// lives here, so no page inherits another's canonical.
export const metadata: Metadata = {
  metadataBase: new URL(deployUrl()),
  title: SITE_NAME,
  // every page carries the build id for the stale-deploy check.
  other: { 'pocketcade-build': buildId() },
};

// viewport-fit=cover so pseudo-fullscreen can pad by the safe-area insets.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#120C2C',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const id = buildId();
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <SiteHeader buildId={id} />
        <main id="main">{children}</main>
        <SiteFooter buildId={id} />
        <RouteFocus />
      </body>
    </html>
  );
}
