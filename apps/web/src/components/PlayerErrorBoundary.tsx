'use client';
// a render error in the player shows a card with Reload; unmounting GameHost also unmounts the game.
import { Component, type ReactNode } from 'react';
import { ReloadCard } from './CrashCard';

export class PlayerErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    console.error('[pocketcade] HostUIError', error);
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="stage">
        <div className="player">
          <ReloadCard text="The player stopped working" label="Reload page" />
        </div>
      </div>
    );
  }
}
