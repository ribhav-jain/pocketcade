'use client';
// A titled, horizontally scrolling row of cards with snap, plus arrow buttons on pointer devices.
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export function Rail({
  id,
  title,
  subtitle,
  icon,
  href,
  children,
}: {
  id: string;
  title: string;
  subtitle?: string;
  icon?: IconName;
  /** "See all" link */
  href?: string;
  /** <li> elements */
  children: ReactNode;
}) {
  const track = useRef<HTMLUListElement>(null);
  // Two booleans, so scroll events that don't reach an edge don't re-render.
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);
  const update = useCallback(() => {
    const t = track.current;
    if (!t) return;
    setAtStart(t.scrollLeft <= 4);
    setAtEnd(t.scrollLeft + t.clientWidth >= t.scrollWidth - 4);
  }, []);
  useEffect(() => {
    const t = track.current;
    if (!t) return;
    const ro = new ResizeObserver(update); // also reports the initial size
    ro.observe(t);
    return () => ro.disconnect();
  }, [update]);
  const go = (dir: 1 | -1) => {
    const t = track.current;
    if (!t) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    t.scrollBy({ left: dir * t.clientWidth * 0.85, behavior: reduce ? 'auto' : 'smooth' });
  };
  return (
    <section className="rail" aria-labelledby={`${id}-title`}>
      <div className="rail-head">
        <div>
          <h2 id={`${id}-title`} className="section-title">
            {icon && (
              <span className="section-icon">
                <Icon name={icon} size={20} />
              </span>
            )}
            {title}
          </h2>
          {subtitle && <p className="section-sub">{subtitle}</p>}
        </div>
        <div className="rail-tools">
          {href && (
            <Link href={href} className="rail-more" prefetch={false}>
              See all
            </Link>
          )}
          <button
            type="button"
            className="round-button"
            aria-label={`Scroll ${title} back`}
            disabled={atStart}
            onClick={() => go(-1)}
          >
            <Icon name="left" size={18} />
          </button>
          <button
            type="button"
            className="round-button"
            aria-label={`Scroll ${title} forward`}
            disabled={atEnd}
            onClick={() => go(1)}
          >
            <Icon name="right" size={18} />
          </button>
        </div>
      </div>
      <ul className="rail-track" ref={track} onScroll={update}>
        {children}
      </ul>
    </section>
  );
}
