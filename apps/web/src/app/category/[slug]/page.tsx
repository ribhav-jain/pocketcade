import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { CSSProperties } from 'react';
import { CardItems } from '../../../components/CardItems';
import { Icon } from '../../../components/Icon';
import { Rail } from '../../../components/Rail';
import { CategoryStrip } from '../../../components/SiteChrome';
import { categories, categoryById, games, gamesIn } from '../../../games/catalog';
import { pageMeta, SITE_NAME } from '../../../lib/seo';

type Params = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams(): Array<{ slug: string }> {
  return categories.map((c) => ({ slug: c.id }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const c = categoryById((await params).slug);
  if (!c) return {};
  return pageMeta({
    path: `/category/${c.id}/`,
    title: `${c.title} games — Play free online · ${SITE_NAME}`,
    description: `${c.blurb} ${gamesIn(c.id).length} free ${c.title.toLowerCase()} games to play in your browser, no downloads.`,
  });
}

export default async function CategoryPage({ params }: Params) {
  const c = categoryById((await params).slug);
  if (!c) notFound();
  const list = gamesIn(c.id);
  const others = games.filter((g) => g.category !== c.id);
  return (
    <div className="category-page">
      <section
        className="cat-hero"
        style={{ '--c1': c.colors[0], '--c2': c.colors[1] } as CSSProperties}
      >
        <span className="cat-hero-icon" aria-hidden="true">
          <Icon name={c.id} size={44} />
        </span>
        <div>
          <h1>{c.title} games</h1>
          <p>{c.blurb}</p>
          <p className="cat-hero-count">
            {list.length} {list.length === 1 ? 'game' : 'games'} · all free, no sign-up
          </p>
        </div>
      </section>
      <CategoryStrip current={c.id} />
      <section className="section" aria-label={`${c.title} games`}>
        <ul className="grid grid-lg">
          <CardItems games={list} size="lg" eagerCount={4} />
        </ul>
      </section>
      <Rail
        id="others"
        title="Try something different"
        subtitle="Hand-picked from the other categories"
        icon="sparkle"
      >
        <CardItems games={others} />
      </Rail>
    </div>
  );
}
