// Portal catalog. Each game's listing (title, tagline, category, tags, accent, blurb) is written in its own
// packages/games/<id>/game.md and arrives here through listings.generated.ts; its GameMeta comes from the package.
// This module adds what only the portal knows: the categories, the editorial order and the home-page rows.
// Discovery is editorial or on-device only: nothing is tracked, so nothing here claims to be "trending".
import type { GameMeta, InputKind } from '@pocketcade/sdk';
import { gameListings } from './listings.generated';
import { gameMetas } from './metas.generated';
import type { GameId } from './registry.generated';

export type CategoryId = 'arcade' | 'puzzle' | 'word' | 'cards-and-board' | 'brain';
export type Tag =
  | 'quick'
  | 'relaxing'
  | 'daily'
  | 'vs-computer'
  | 'endless'
  | 'levels'
  | 'logic'
  | 'numbers'
  | 'words'
  | 'cards'
  | 'one-button';
export type Input = InputKind;

interface Category {
  id: CategoryId;
  title: string;
  blurb: string;
  /** gradient start, end */
  colors: readonly [string, string];
}

export const categories: readonly Category[] = [
  {
    id: 'arcade',
    title: 'Arcade',
    blurb: 'Quick reflexes, big scores, one more go.',
    colors: ['#FF4FA3', '#FF9F1C'],
  },
  {
    id: 'puzzle',
    title: 'Puzzle',
    blurb: 'Slide, deduce and stack your way to a clean board.',
    colors: ['#38D6FF', '#7B5CFF'],
  },
  {
    id: 'word',
    title: 'Word',
    blurb: 'Letters, ladders and a daily brain-teaser.',
    colors: ['#B8F34A', '#2BD47D'],
  },
  {
    id: 'cards-and-board',
    title: 'Cards & Board',
    blurb: 'Classic tabletop games with a fresh coat of paint.',
    colors: ['#FFE14D', '#FF9F1C'],
  },
  {
    id: 'brain',
    title: 'Brain',
    blurb: 'Memory and focus games that feel like play.',
    colors: ['#FF4FA3', '#C77DFF'],
  },
];

export const tagLabels: Record<Tag, string> = {
  quick: 'Quick play',
  relaxing: 'Relaxing',
  daily: 'Daily',
  'vs-computer': 'Vs computer',
  endless: 'Endless',
  levels: 'Levels',
  logic: 'Logic',
  numbers: 'Numbers',
  words: 'Words',
  cards: 'Cards',
  'one-button': 'One button',
};

/** What a game.md supplies (see tools/gen-registry). */
export interface Listing {
  title: string;
  /** one line for cards, search and the page description */
  tagline: string;
  category: CategoryId;
  tags: readonly Tag[];
  /** the game's accent: card glow, page tint */
  accent: string;
  /** typical session length */
  minutes: number;
  /** a short paragraph for the game page and the hero */
  blurb: string;
}

/**
 * The portfolio in editorial order: the games most likely to hook a new player come first. Every list on the site
 * follows this order. A game missing from it is appended at the end (and fails the catalog test).
 */
export const gameOrder: readonly GameId[] = [
  'pebble-post',
  'pop-reef',
  'sumslide',
  'sunset-sprint',
  'bao-bolt',
  'sourdough',
  'pentafall',
  'glowworm',
  'comet-crush',
  'letterhop',
  'molehills',
  'rowdy',
  'on-the-dot',
  'firefly-flip',
];

export interface CatalogGame extends Listing {
  id: GameId;
  version: string;
  inputs: readonly Input[];
  aspectRatio: GameMeta['aspectRatio'];
  minSize: GameMeta['minSize'];
  orientation: GameMeta['orientation'];
  leaderboards: GameMeta['leaderboards'];
  /** static cover art (copied from packages/games/<id>/media/cover.svg by tools/gen-registry) */
  cover: string;
}

const rank = (id: GameId) => {
  const i = gameOrder.indexOf(id);
  return i < 0 ? gameOrder.length : i;
};

/** Every game, in editorial order. */
export const games: readonly CatalogGame[] = (Object.keys(gameListings) as GameId[])
  .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
  .map((id): CatalogGame => {
    const { version, inputs, aspectRatio, minSize, orientation, leaderboards } = gameMetas[id];
    return {
      id,
      ...gameListings[id],
      version,
      inputs,
      aspectRatio,
      minSize,
      orientation,
      leaderboards,
      cover: `/covers/${id}.svg`,
    };
  });

export const gameById = (id: string): CatalogGame | undefined => games.find((g) => g.id === id);
export const categoryById = (id: string): Category | undefined =>
  categories.find((c) => c.id === id);
export const gamesIn = (c: CategoryId): CatalogGame[] => games.filter((g) => g.category === c);
const withTag = (...tags: Tag[]): CatalogGame[] =>
  games.filter((g) => tags.some((t) => g.tags.includes(t)));

/** The hero game and the first rail. */
export const featured: CatalogGame = games[0]!;
export const topPicks: readonly CatalogGame[] = games.slice(0, 7);

interface Row {
  id: 'quick' | 'brain' | 'unwind';
  title: string;
  subtitle: string;
  games: readonly CatalogGame[];
}

export const moodRows: readonly Row[] = [
  {
    id: 'quick',
    title: 'Quick five',
    subtitle: 'Perfect for a five-minute break',
    games: withTag('quick'),
  },
  {
    id: 'brain',
    title: 'Brain workout',
    subtitle: 'Logic, memory and numbers',
    games: games.filter(
      (g) => g.category === 'brain' || g.tags.includes('logic') || g.tags.includes('numbers'),
    ),
  },
  {
    id: 'unwind',
    title: 'Unwind',
    subtitle: 'No timers you need to worry about',
    games: withTag('relaxing'),
  },
];

/** "More like this": same category first, then games sharing a tag, then the rest in editorial order. */
export function related(g: CatalogGame, n = 6): CatalogGame[] {
  const score = (o: CatalogGame) =>
    (o.category === g.category ? 10 : 0) + o.tags.filter((t) => g.tags.includes(t)).length;
  return games
    .filter((o) => o.id !== g.id)
    .map((o) => [o, score(o)] as const)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([o]) => o);
}

/** Client-safe summary for search and the on-device rows. */
export interface GameSummary {
  id: string;
  title: string;
  tagline: string;
  category: string;
  accent: string;
  cover: string;
  keywords: string;
}

export const summaries: readonly GameSummary[] = games.map((g) => {
  const category = categoryById(g.category)!.title;
  return {
    id: g.id,
    title: g.title,
    tagline: g.tagline,
    category,
    accent: g.accent,
    cover: g.cover,
    keywords: [g.title, g.tagline, category, ...g.tags.map((t) => tagLabels[t])]
      .join(' ')
      .toLowerCase(),
  };
});
