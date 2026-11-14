import Link from 'next/link';
import type { CSSProperties } from 'react';
import { CardItems } from '../components/CardItems';
import { Icon } from '../components/Icon';
import { PlayHistory } from '../components/PlayHistory';
import { Rail } from '../components/Rail';
import { CategoryStrip } from '../components/SiteChrome';
import { SurpriseButton } from '../components/SurpriseButton';
import {
  categories,
  featured,
  games,
  gamesIn,
  moodRows,
  summaries,
  topPicks,
  type CatalogGame,
} from '../games/catalog';
import { buildId } from '../lib/build-info';
import { pageMeta } from '../lib/seo';

export const metadata = pageMeta({
  path: '/',
  title: 'Pocketcade — Free browser games, no downloads',
  description: 'Play free games instantly in your browser. No downloads, no ads, no tracking.',
});

const dailyBadge = (g: CatalogGame) => (g.tags.includes('daily') ? 'Daily' : undefined);
const ROW_ICONS = { quick: 'clock', brain: 'brain', unwind: 'heart' } as const;

export default function Home() {
  const floaters = topPicks.slice(1, 4);
  return (
    <div className="home">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-glow" aria-hidden="true">
          <span className="twinkle t1" />
          <span className="twinkle t2" />
          <span className="twinkle t3" />
          <span className="twinkle t4" />
        </div>
        <div className="hero-copy">
          <p className="eyebrow">
            <Icon name="sparkle" size={16} /> {games.length} free games · No ads · No sign-up
          </p>
          <h1 id="hero-title">
            <span className="h1-brand">Pocketcade</span>
            <span className="h1-line">
              A whole arcade <em>in your pocket.</em>
            </span>
          </h1>
          <p className="hero-sub">
            Tap a game and you&apos;re playing. No downloads, no accounts, no tracking: just quick,
            colourful fun on any screen.
          </p>
          <div className="hero-ctas">
            <Link
              href={`/games/${featured.id}/`}
              prefetch={false}
              className="btn btn-primary btn-lg"
            >
              <Icon name="play" size={22} />
              Play now
            </Link>
            <a href="#all-games" className="btn btn-secondary btn-lg">
              <Icon name="grid" size={20} />
              Explore games
            </a>
            <SurpriseButton ids={games.map((g) => g.id)} />
          </div>
          <ul className="hero-stats" aria-label="Pocketcade in numbers">
            <li>
              <strong>{games.length}</strong> games
            </li>
            <li>
              <strong>{categories.length}</strong> categories
            </li>
            <li>
              <strong>0</strong> ads, ever
            </li>
          </ul>
        </div>
        <div className="hero-stage">
          {floaters.map((g, i) => (
            <img
              key={g.id}
              className={`floater f${i + 1}`}
              src={g.cover}
              alt=""
              aria-hidden="true"
              width={150}
              height={150}
            />
          ))}
          <Link
            href={`/games/${featured.id}/`}
            prefetch={false}
            className="spotlight"
            style={{ '--accent': featured.accent } as CSSProperties}
            aria-label={`Featured: play ${featured.title}`}
          >
            <span className="spotlight-art">
              <img src={featured.cover} alt="" width={420} height={420} />
            </span>
            <span className="spotlight-info">
              <span className="spotlight-label">
                <Icon name="star" size={14} /> Featured game
              </span>
              <span className="spotlight-title">{featured.title}</span>
              <span className="spotlight-tagline">{featured.tagline}</span>
              <span className="btn btn-primary btn-sm">
                <Icon name="play" size={16} /> Play
              </span>
            </span>
          </Link>
        </div>
      </section>

      <CategoryStrip />

      <PlayHistory games={summaries} buildId={buildId()} />

      <Rail
        id="top-picks"
        title="Top picks"
        subtitle="Hand-picked by the Pocketcade crew"
        icon="fire"
      >
        <CardItems games={topPicks} size="lg" eagerCount={3} badge={dailyBadge} />
      </Rail>

      <section className="section" aria-labelledby="cats-title">
        <h2 id="cats-title" className="section-title">
          <span className="section-icon">
            <Icon name="grid" size={20} />
          </span>
          Browse by category
        </h2>
        <ul className="cat-grid">
          {categories.map((c) => {
            const list = gamesIn(c.id);
            return (
              <li key={c.id}>
                <Link
                  href={`/category/${c.id}/`}
                  prefetch={false}
                  className="cat-tile"
                  style={{ '--c1': c.colors[0], '--c2': c.colors[1] } as CSSProperties}
                >
                  <span className="cat-icon">
                    <Icon name={c.id} size={30} />
                  </span>
                  <span className="cat-name">{c.title}</span>
                  <span className="cat-count">
                    {list.length} {list.length === 1 ? 'game' : 'games'}
                  </span>
                  <span className="cat-thumbs" aria-hidden="true">
                    {list.slice(0, 3).map((g) => (
                      <img key={g.id} src={g.cover} alt="" width={56} height={56} loading="lazy" />
                    ))}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {moodRows.map((row) => (
        <Rail
          key={row.id}
          id={row.id}
          title={row.title}
          subtitle={row.subtitle}
          icon={ROW_ICONS[row.id]}
        >
          <CardItems games={row.games} />
        </Rail>
      ))}

      <section id="all-games" className="section" aria-labelledby="all-title">
        <h2 id="all-title" className="section-title">
          <span className="section-icon">
            <Icon name="arcade" size={20} />
          </span>
          All games
        </h2>
        <ul className="grid">
          <CardItems games={games} badge={dailyBadge} />
        </ul>
      </section>

      <section id="about" className="promise-band" aria-labelledby="about-title">
        <h2 id="about-title" className="section-title">
          Games first. Nothing else.
        </h2>
        <ul className="promise-grid">
          <li>
            <span className="promise-icon p1">
              <Icon name="bolt" size={26} />
            </span>
            <strong>Instant play</strong>
            <span>Every game loads in seconds, right in your browser.</span>
          </li>
          <li>
            <span className="promise-icon p2">
              <Icon name="shield" size={26} />
            </span>
            <strong>No ads, no tracking</strong>
            <span>Your scores and progress stay on your device.</span>
          </li>
          <li>
            <span className="promise-icon p3">
              <Icon name="devices" size={26} />
            </span>
            <strong>Any screen</strong>
            <span>Keyboard, mouse or touch: phone, tablet or desktop.</span>
          </li>
          <li>
            <span className="promise-icon p4">
              <Icon name="code" size={26} />
            </span>
            <strong>Open source</strong>
            <span>Code under MIT, art and audio under CC BY 4.0.</span>
          </li>
        </ul>
      </section>
    </div>
  );
}
