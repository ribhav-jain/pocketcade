'use client';
// "Surprise me": opens a random game.
import { useRouter } from 'next/navigation';
import { Icon } from './Icon';

export function SurpriseButton({ ids }: { ids: readonly string[] }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn btn-ghost"
      onClick={() => router.push(`/games/${ids[Math.floor(Math.random() * ids.length)]}/`)}
    >
      <Icon name="dice" size={20} />
      Surprise me
    </button>
  );
}
