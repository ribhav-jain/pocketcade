'use client';
// every mute toggle shares one persisted state; the name stays "Mute sound", the icon changes.
import { useEffect, useSyncExternalStore } from 'react';
import {
  getHostServices,
  getServerSettings,
  getSettings,
  setMuted,
  subscribeSettings,
} from '../lib/host-services';

export function MuteButton({
  buildId,
  className,
  onPointerUse,
}: {
  buildId: string;
  className?: string;
  onPointerUse?: () => void;
}) {
  const { muted } = useSyncExternalStore(subscribeSettings, getSettings, getServerSettings);
  useEffect(() => void getHostServices(buildId), [buildId]);
  return (
    <button
      type="button"
      className={className ?? 'icon-button'}
      aria-pressed={muted}
      aria-label="Mute sound"
      title={muted ? 'Sound off' : 'Sound on'}
      onClick={(e) => {
        setMuted(!muted, buildId);
        if (e.detail > 0) onPointerUse?.(); // pointer use returns focus to the game
      }}
    >
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="currentColor">
        <path d="M4 9h4l5-4v14l-5-4H4z" />
        {muted ? (
          <path
            d="M16 9l5 6m0-6l-5 6"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
        ) : (
          <path
            d="M16 8a5 5 0 0 1 0 8M18.5 5.5a8.5 8.5 0 0 1 0 13"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
        )}
      </svg>
    </button>
  );
}
