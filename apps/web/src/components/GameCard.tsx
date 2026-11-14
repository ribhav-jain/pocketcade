// The game tile: square key art, title and category; the whole card is one link (≥ 44 px). Hover lifts it, zooms
// the art, glows in the game's accent and shows a Play bubble. Works in server and client components.
import Link from 'next/link';
import type { CSSProperties } from 'react';
import type { GameSummary } from '../games/catalog';
import { Icon } from './Icon';

export type CardGame = Pick<GameSummary, 'id' | 'title' | 'cover' | 'accent' | 'category'>;

export function GameCard({
  game,
  badge,
  size = 'md',
  eager = false,
}: {
  game: CardGame;
  badge?: string;
  size?: 'md' | 'lg';
  eager?: boolean;
}) {
  return (
    <Link
      href={`/games/${game.id}/`}
      prefetch={false}
      className={size === 'lg' ? 'card card-lg' : 'card'}
      style={{ '--accent': game.accent } as CSSProperties}
      aria-label={badge ? `${game.title} (${badge})` : game.title}
    >
      <span className="card-art">
        <img
          src={game.cover}
          alt=""
          width={320}
          height={320}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
        />
        {badge && <span className="card-badge">{badge}</span>}
        <span className="card-play" aria-hidden="true">
          <Icon name="play" size={22} />
        </span>
      </span>
      <span className="card-meta" aria-hidden="true">
        <span className="card-title">{game.title}</span>
        <span className="card-cat">{game.category}</span>
      </span>
    </Link>
  );
}
