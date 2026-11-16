// /licenses/: code and asset licences, every ASSETS.md entry (anchor = its id), per-game credits
// and the open-source libraries the site ships.
import Link from 'next/link';
import { games } from '../../games/catalog';
import { readAssets } from '../../lib/assets';
import { repoUrl } from '../../lib/build-info';
import { pageMeta, SITE_NAME } from '../../lib/seo';

export const metadata = pageMeta({
  path: '/licenses/',
  title: `Licenses · ${SITE_NAME}`,
  description:
    'Pocketcade code is MIT licensed and its art, sound and text are CC BY 4.0, plus the third-party fonts and word lists it uses.',
});

const CC_BY = 'https://creativecommons.org/licenses/by/4.0/';
/** Games that use a third-party asset, by ASSETS.md id (the rest are wholly original). */
const GAME_ASSETS: Record<string, readonly string[]> = {
  letterhop: ['words-enable', 'words-12dicts'],
};
const LIBRARIES = [
  ['Next.js', 'MIT', 'https://github.com/vercel/next.js'],
  ['React', 'MIT', 'https://github.com/react/react'],
  ['Phaser', 'MIT', 'https://github.com/phaserjs/phaser'],
] as const;

export default function Licenses() {
  const repo = repoUrl();
  const assets = readAssets();
  const file = (name: string) =>
    repo ? <a href={`${repo}/blob/main/${name}`}>{name}</a> : <code>{name}</code>;
  return (
    <article className="doc-page">
      <h1>Licenses</h1>
      <p className="doc-lede">
        {SITE_NAME} is open source. You may reuse its code and its art under the licences below.
      </p>

      <section className="info-card">
        <h2>Code</h2>
        <p>
          All code is released under the{' '}
          <a href="https://opensource.org/license/mit">MIT License</a> (see {file('LICENSE')}).
        </p>
      </section>

      <section className="info-card">
        <h2>Art, sound and text</h2>
        <p>
          Everything the project made itself, from cover art and sprites to sounds and game text, is
          released under <a href={CC_BY}>Creative Commons Attribution 4.0</a> (see{' '}
          {file('LICENSE-ASSETS')}). Credit &ldquo;Pocketcade contributors&rdquo;.
        </p>
      </section>

      <section className="info-card">
        <h2>Third-party assets</h2>
        <p>
          Everything {SITE_NAME} uses but did not make itself, as listed in {file('ASSETS.md')}. The
          fonts are under the <a href="https://openfontlicense.org/">SIL Open Font License</a>.
        </p>
        <ul className="asset-list">
          {assets.map((a) => (
            <li key={a.id} id={a.id}>
              <h3>{a.title}</h3>
              <dl>
                <div>
                  <dt>Author</dt>
                  <dd>{a.author}</dd>
                </div>
                <div>
                  <dt>Licence</dt>
                  <dd>{a.license}</dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>{a.url.startsWith('https://') ? <a href={a.url}>{a.url}</a> : a.url}</dd>
                </div>
                <div>
                  <dt>Used in</dt>
                  <dd>{a.files}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      </section>

      <section className="info-card">
        <h2>Game credits</h2>
        <p>
          Every game was made for {SITE_NAME} by Pocketcade contributors, with original art, sound
          and text.
        </p>
        <ul>
          {games.map((g) => (
            <li key={g.id}>
              <Link href={`/games/${g.id}/`} prefetch={false}>
                {g.title}
              </Link>
              {GAME_ASSETS[g.id] && (
                <>
                  {' '}
                  also uses{' '}
                  {GAME_ASSETS[g.id]!.map((id, i) => (
                    <span key={id}>
                      {i > 0 && ' and '}
                      <a href={`#${id}`}>{assets.find((a) => a.id === id)?.title ?? id}</a>
                    </span>
                  ))}
                </>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="info-card">
        <h2>Open-source libraries</h2>
        <p>The site is built with these libraries, each under its own licence:</p>
        <ul>
          {LIBRARIES.map(([name, licence, url]) => (
            <li key={name}>
              <a href={url}>{name}</a> ({licence})
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
