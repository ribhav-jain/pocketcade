// Server-only: catalog games as <li> game cards, for a Rail or a .grid list.
import { summaries, type CatalogGame } from '../games/catalog';
import { GameCard } from './GameCard';

const summaryOf = new Map(summaries.map((s) => [s.id, s]));

export function CardItems({
  games,
  size,
  eagerCount = 0,
  badge,
}: {
  games: readonly CatalogGame[];
  size?: 'md' | 'lg';
  /** the first N cards load their art eagerly */
  eagerCount?: number;
  badge?: (g: CatalogGame) => string | undefined;
}) {
  return games.map((g, i) => (
    <li key={g.id}>
      <GameCard game={summaryOf.get(g.id)!} size={size} eager={i < eagerCount} badge={badge?.(g)} />
    </li>
  ));
}
