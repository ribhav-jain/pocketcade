import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { CSSProperties } from 'react';
import { CardItems } from '../../../components/CardItems';
import { GameHost } from '../../../components/GameHost';
import { Icon } from '../../../components/Icon';
import { PlayerErrorBoundary } from '../../../components/PlayerErrorBoundary';
import { Rail } from '../../../components/Rail';
import {
  categoryById,
  gameById,
  games,
  related,
  tagLabels,
  type Input,
} from '../../../games/catalog';
import { gameDetails } from '../../../games/details.generated';
import type { GameId } from '../../../games/registry.generated';
import { buildId, repoUrl } from '../../../lib/build-info';
import { gameJsonLd, pageMeta, serializeJsonLd, SITE_NAME } from '../../../lib/seo';

type Params = { params: Promise<{ slug: string }> };

// one page per registered game; anything else is a 404.
export const dynamicParams = false;

export function generateStaticParams(): Array<{ slug: string }> {
  return games.map((g) => ({ slug: g.id }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const game = gameById((await params).slug);
  if (!game) return {};
  return pageMeta({
    path: `/games/${game.id}/`,
    title: `${game.title} — Play free in your browser · ${SITE_NAME}`,
    description: game.tagline,
    image: { url: `/og/${game.id}.jpg`, alt: gameDetails[game.id].alt },
  });
}

const INPUT_LABEL: Record<Input, string> = {
  keyboard: 'Keyboard',
  pointer: 'Mouse',
  touch: 'Touch',
};
const INPUT_ORDER: readonly Input[] = ['keyboard', 'pointer', 'touch'];

export default async function GamePage({ params }: Params) {
  const game = gameById((await params).slug);
  if (!game) notFound();
  const category = categoryById(game.category)!;
  const { faq } = gameDetails[game.id];
  const inputs = INPUT_ORDER.filter((i) => game.inputs.includes(i));
  const controls = gameDetails[game.id].controls.filter((c) => inputs.some((i) => c[i]));
  return (
    <div className="game-page" style={{ '--accent': game.accent } as CSSProperties}>
      {gameJsonLd(game).map((data, i) => (
        <script
          key={i}
          type="application/ld+json"
          // escaped by serializeJsonLd, so the data cannot close the script element
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
        />
      ))}
      <div className="game-ambient" aria-hidden="true">
        <img src={game.cover} alt="" />
      </div>
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <Icon name="right" size={14} />
        <Link href={`/category/${category.id}/`} prefetch={false}>
          {category.title}
        </Link>
        <Icon name="right" size={14} />
        <span aria-current="page">{game.title}</span>
      </nav>
      <PlayerErrorBoundary>
        <GameHost
          key={game.id}
          gameId={game.id as GameId}
          title={game.title}
          aspectRatio={game.aspectRatio}
          minSize={game.minSize}
          orientation={game.orientation}
          leaderboards={game.leaderboards}
          buildId={buildId()}
          repoUrl={repoUrl()}
          cover={game.cover}
          tagline={game.tagline}
        />
      </PlayerErrorBoundary>
      <div className="game-bar">
        <img className="game-bar-art" src={game.cover} alt="" width={52} height={52} />
        <div>
          <h1>{game.title}</h1>
          <p>{game.tagline}</p>
        </div>
      </div>
      <section className="game-info" aria-labelledby="about-game">
        <div className="info-card">
          <h2 id="about-game" className="section-title">
            About {game.title}
          </h2>
          <p className="info-blurb">{game.blurb}</p>
          <ul className="chips" aria-label="Tags">
            <li>
              <Link
                href={`/category/${category.id}/`}
                prefetch={false}
                className="chip chip-accent"
              >
                <Icon name={category.id} size={16} />
                {category.title}
              </Link>
            </li>
            {game.tags.map((t) => (
              <li key={t} className="chip">
                {tagLabels[t]}
              </li>
            ))}
          </ul>
        </div>
        <dl className="info-facts">
          <div>
            <dt>
              <Icon name="devices" size={18} /> Play with
            </dt>
            <dd>{game.inputs.map((i) => INPUT_LABEL[i]).join(' · ')}</dd>
          </div>
          <div>
            <dt>
              <Icon name="clock" size={18} /> A round takes
            </dt>
            <dd>About {game.minutes} min</dd>
          </div>
          <div>
            <dt>
              <Icon name="trophy" size={18} /> Leaderboards
            </dt>
            <dd>
              {game.leaderboards.length
                ? game.leaderboards.map((b) => b.label).join(' · ')
                : 'None'}
            </dd>
          </div>
          <div>
            <dt>
              <Icon name="shield" size={18} /> Your data
            </dt>
            <dd>Saves and scores stay on this device</dd>
          </div>
        </dl>
      </section>
      <section className="game-info game-help" aria-label={`How to play ${game.title}`}>
        <div className="info-card">
          <h2 className="section-title">How to play</h2>
          <table className="controls">
            <thead>
              <tr>
                <th scope="col">Action</th>
                {inputs.map((i) => (
                  <th key={i} scope="col">
                    {INPUT_LABEL[i]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {controls.map((c) => (
                <tr key={c.action}>
                  <th scope="row">{c.action}</th>
                  {inputs.map((i) => (
                    <td key={i} data-label={INPUT_LABEL[i]}>
                      {c[i] ?? '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {faq.length > 0 && (
          <div className="info-card">
            <h2 className="section-title">Questions</h2>
            {faq.map((f) => (
              <details key={f.q} className="faq">
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        )}
      </section>
      <Rail
        id="more"
        title="More like this"
        subtitle={`If you like ${game.title}, try these`}
        icon="sparkle"
      >
        <CardItems games={related(game)} />
      </Rail>
    </div>
  );
}
