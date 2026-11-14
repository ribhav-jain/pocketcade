// /about/: what it is, principles, how games are built, contributing, and the working name.
import Link from 'next/link';
import { games } from '../../games/catalog';
import { repoUrl } from '../../lib/build-info';
import { pageMeta, SITE_NAME } from '../../lib/seo';

export const metadata = pageMeta({
  path: '/about/',
  title: `About · ${SITE_NAME}`,
  description:
    'Pocketcade is a free, open-source arcade of browser games: no downloads, no sign-ups, no ads and no tracking.',
});

export default function About() {
  const repo = repoUrl();
  return (
    <article className="doc-page">
      <h1>About {SITE_NAME}</h1>
      <p className="doc-lede">
        A whole arcade in your pocket: {games.length} free games that start in a second on your
        phone, tablet or computer.
      </p>

      <section className="info-card">
        <h2>What it is</h2>
        <p>
          {SITE_NAME} is a small collection of original games that run right in your browser. There
          is nothing to install and no account to make: pick a game, press Play, and your progress
          and best scores are saved on your device.
        </p>
      </section>

      <section className="info-card">
        <h2>Principles</h2>
        <ul>
          <li>
            <strong>Free.</strong> Every game, with nothing locked away.
          </li>
          <li>
            <strong>Instant.</strong> No downloads and no sign-up.
          </li>
          <li>
            <strong>No ads, no tracking.</strong> No analytics, no third-party scripts, no cookies.
            See the <Link href="/privacy/">privacy page</Link>.
          </li>
          <li>
            <strong>Your data stays with you.</strong> Saves and scores never leave your device.
          </li>
          <li>
            <strong>Open source.</strong> Code under MIT; art, sound and text under CC BY 4.0 (see{' '}
            <Link href="/licenses/">licenses</Link>).
          </li>
        </ul>
      </section>

      <section className="info-card">
        <h2>How the games are built</h2>
        <p>
          Every game is made for {SITE_NAME}: all but one with the Phaser game engine, and the word
          game Letterhop as a plain web page. They all plug into the site through the same contract,
          so each one pauses when you switch tabs, saves on your device, works with keyboard, mouse
          or touch where it can, and cleans up after itself when you leave.
        </p>
      </section>

      <section className="info-card">
        <h2>Contribute</h2>
        {repo ? (
          <p>
            The code lives on <a href={repo}>GitHub</a>. Bug reports, fixes and ideas for new games
            are welcome there.
          </p>
        ) : (
          <p>
            {SITE_NAME} is open source. A link to its code repository will appear here once it is
            public.
          </p>
        )}
      </section>

      <section className="info-card">
        <h2>The name</h2>
        <p>
          {SITE_NAME} and the game titles are working names. They may change before the site
          launches.
        </p>
      </section>
    </article>
  );
}
