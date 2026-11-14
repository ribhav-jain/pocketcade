'use client';
// "Continue playing" and "Your most played", computed from on-device history only (nothing is sent anywhere).
// Renders nothing until this device has played something.
import { useEffect, useState } from 'react';
import type { GameSummary } from '../games/catalog';
import { getHistory, type PlayRecord } from '../lib/host-services';
import { GameCard } from './GameCard';
import { Rail } from './Rail';

export function PlayHistory({
  games,
  buildId,
}: {
  games: readonly GameSummary[];
  buildId: string;
}) {
  const [history, setHistory] = useState<Record<string, PlayRecord>>({});
  useEffect(() => setHistory(getHistory(buildId)), [buildId]);
  const played = games.flatMap((g) => {
    const r = history[g.id];
    return r ? [{ g, ...r }] : [];
  });
  if (!played.length) return null;
  const recent = [...played].sort((a, b) => b.last - a.last).slice(0, 8);
  const most = played
    .filter((p) => p.plays > 1)
    .sort((a, b) => b.plays - a.plays)
    .slice(0, 8);
  return (
    <>
      <Rail id="continue" title="Continue playing" subtitle="Saved on this device" icon="history">
        {recent.map(({ g }) => (
          <li key={g.id}>
            <GameCard game={g} />
          </li>
        ))}
      </Rail>
      {most.length >= 2 && (
        <Rail
          id="most-played"
          title="Your most played"
          subtitle="Your favourites, counted on this device only"
          icon="heart"
        >
          {most.map(({ g, plays }) => (
            <li key={g.id}>
              <GameCard game={g} badge={`${plays} plays`} />
            </li>
          ))}
        </Rail>
      )}
    </>
  );
}
