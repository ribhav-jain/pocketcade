'use client';
// Header search: an ARIA combobox over the (small) catalog, filtered in the browser. Enter opens the highlighted
// game (or the first match); Escape clears. On small screens it collapses behind a search button.
import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { GameSummary } from '../games/catalog';
import { Icon } from './Icon';

export function SearchBox({ games }: { games: readonly GameSummary[] }) {
  const router = useRouter();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const results = useMemo(() => {
    const words = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return games.filter((g) => words.every((w) => g.keywords.includes(w))).slice(0, 6);
  }, [q, games]);
  useEffect(() => {
    if (expanded) input.current?.focus();
  }, [expanded]);

  const choose = (g: GameSummary | undefined) => {
    if (!g) return;
    setOpen(false);
    setQ('');
    setExpanded(false);
    router.push(`/games/${g.id}/`);
  };
  const showList = open && q.trim().length > 0;

  return (
    <div className={expanded ? 'search is-expanded' : 'search'}>
      <button
        type="button"
        className="round-button search-toggle"
        aria-label="Search games"
        aria-expanded={expanded}
        onClick={() => setExpanded((e) => !e)}
      >
        <Icon name={expanded ? 'close' : 'search'} size={20} />
      </button>
      <div className="search-field">
        <Icon name="search" size={18} className="search-icon" />
        <input
          ref={input}
          type="search"
          role="combobox"
          aria-label="Search games"
          aria-expanded={showList}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={
            showList && results[active] ? `${id}-${results[active].id}` : undefined
          }
          placeholder="Search games"
          autoComplete="off"
          spellCheck={false}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' && results.length) {
              e.preventDefault();
              setOpen(true);
              setActive((a) => (a + 1) % results.length);
            } else if (e.key === 'ArrowUp' && results.length) {
              e.preventDefault();
              setActive((a) => (a - 1 + results.length) % results.length);
            } else if (e.key === 'Enter') {
              e.preventDefault();
              choose(results[active] ?? results[0]);
            } else if (e.key === 'Escape') {
              if (q) setQ('');
              else setExpanded(false);
            }
          }}
        />
        <ul
          id={`${id}-list`}
          role="listbox"
          aria-label="Matching games"
          className="search-list"
          hidden={!showList}
        >
          {results.map((g, i) => (
            <li
              key={g.id}
              id={`${id}-${g.id}`}
              role="option"
              aria-selected={i === active}
              className="search-option"
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(g)}
            >
              <img src={g.cover} alt="" width={44} height={44} />
              <span>
                <span className="search-title">{g.title}</span>
                <span className="search-cat">{g.category}</span>
              </span>
            </li>
          ))}
          {results.length === 0 && (
            <li className="search-empty" role="option" aria-selected="false" aria-disabled="true">
              No games match “{q.trim()}”
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
