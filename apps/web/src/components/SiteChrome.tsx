// Site header and footer (server components).
import Link from 'next/link';
import { categories, summaries } from '../games/catalog';
import { Icon, LogoMark } from './Icon';
import { MuteButton } from './MuteButton';
import { SearchBox } from './SearchBox';

function Brand({ size }: { size: number }) {
  return (
    <Link href="/" className="brand" aria-label="Pocketcade home">
      <LogoMark size={size} />
      <span className="brand-word">
        Pocket<span>cade</span>
      </span>
    </Link>
  );
}

export function SiteHeader({ buildId }: { buildId: string }) {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Brand size={38} />
        <nav className="header-nav" aria-label="Categories">
          {categories.map((c) => (
            <Link key={c.id} href={`/category/${c.id}/`} prefetch={false} className="nav-pill">
              <Icon name={c.id} size={18} />
              {c.title}
            </Link>
          ))}
        </nav>
        <div className="header-tools">
          <SearchBox games={summaries} />
          <MuteButton buildId={buildId} className="round-button" />
        </div>
      </div>
    </header>
  );
}

/** Category pills for pages without the desktop header nav (scrolls sideways on phones). */
export function CategoryStrip({ current }: { current?: string }) {
  return (
    <nav className="category-strip" aria-label="Browse categories">
      <Link
        href="/"
        prefetch={false}
        className={current ? 'strip-pill' : 'strip-pill is-current'}
        aria-current={current ? undefined : 'page'}
      >
        <Icon name="grid" size={18} />
        All games
      </Link>
      {categories.map((c) => (
        <Link
          key={c.id}
          href={`/category/${c.id}/`}
          prefetch={false}
          className={current === c.id ? 'strip-pill is-current' : 'strip-pill'}
          aria-current={current === c.id ? 'page' : undefined}
        >
          <Icon name={c.id} size={18} />
          {c.title}
        </Link>
      ))}
    </nav>
  );
}

export function SiteFooter({ buildId }: { buildId: string }) {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <Brand size={34} />
          <p>
            A whole arcade in your pocket. Free games that play instantly in your browser, on any
            device.
          </p>
          <ul className="promise" aria-label="Our promise">
            <li>
              <Icon name="shield" size={16} /> No ads
            </li>
            <li>
              <Icon name="heart" size={16} /> No tracking
            </li>
            <li>
              <Icon name="bolt" size={16} /> No sign-up
            </li>
          </ul>
        </div>
        <nav aria-label="Footer categories">
          <h2>Categories</h2>
          <ul>
            {categories.map((c) => (
              <li key={c.id}>
                <Link href={`/category/${c.id}/`} prefetch={false}>
                  {c.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Footer games">
          <h2>Games</h2>
          <ul className="footer-games">
            {summaries.map((g) => (
              <li key={g.id}>
                <Link href={`/games/${g.id}/`} prefetch={false}>
                  {g.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="footer-legal">
        <nav aria-label="About Pocketcade">
          <Link href="/about/" prefetch={false}>
            About
          </Link>
          <Link href="/privacy/" prefetch={false}>
            Privacy
          </Link>
          <Link href="/licenses/" prefetch={false}>
            Licenses
          </Link>
        </nav>
        <p>
          Code: MIT · Art, audio and text: CC BY 4.0 · No ads. No tracking. · Build{' '}
          {buildId.slice(0, 7)}
        </p>
      </div>
    </footer>
  );
}
