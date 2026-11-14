// Pairs rules. Pure and time-driven: the scene passes its game clock (ms).
import type { Rng } from '@pocketcade/toolkit';

export type GridId = '4x4' | '4x5' | '6x6';
export const GRIDS: Record<GridId, { rows: number; cols: number; pairs: number }> = {
  '4x4': { rows: 4, cols: 4, pairs: 8 },
  '4x5': { rows: 4, cols: 5, pairs: 10 },
  '6x6': { rows: 6, cols: 6, pairs: 18 },
};
export const MOTIFS = 24;
export const TURN_MS = 200;
export const HOLD_MS = 900;
export const SHORTCUT_MS = 400;

/** Shuffle motif ids, take P, duplicate, shuffle into row-major cells. */
export function deal(rng: Rng, grid: GridId): number[] {
  const ids = rng.shuffle(Array.from({ length: MOTIFS }, (_, i) => i)).slice(0, GRIDS[grid].pairs);
  return rng.shuffle([...ids, ...ids]);
}

export type PairsEvent =
  | { type: 'open'; cell: number }
  | { type: 'match'; cells: [number, number] }
  | { type: 'mismatch'; cells: [number, number] }
  | { type: 'close'; cells: [number, number] }
  | { type: 'cleared' };

interface PairsBoard {
  faces: readonly number[];
  matched: boolean[];
  moves: number;
}

/** Board state machine: at most 2 open cards; a mismatch is held 900 ms after the second turn, with a shortcut. */
export function createPairs(board: PairsBoard) {
  const { faces } = board;
  const matched = [...board.matched];
  let moves = board.moves;
  let open: number[] = [];
  let held: { cells: [number, number]; at: number } | null = null;

  function close(ev: PairsEvent[]): void {
    if (!held) return;
    ev.push({ type: 'close', cells: held.cells });
    held = null;
    open = [];
  }

  function openCell(cell: number, ev: PairsEvent[]): void {
    open.push(cell);
    ev.push({ type: 'open', cell });
    if (open.length < 2) return;
    moves++;
    const [a, b] = open as [number, number];
    if (faces[a] === faces[b]) {
      matched[a] = matched[b] = true;
      open = [];
      ev.push({ type: 'match', cells: [a, b] });
      if (matched.every(Boolean)) ev.push({ type: 'cleared' });
    } else ev.push({ type: 'mismatch', cells: [a, b] });
  }

  return {
    faces,
    get matched(): readonly boolean[] {
      return matched;
    },
    get moves() {
      return moves;
    },
    get open(): readonly number[] {
      return open;
    },
    get held() {
      return held?.cells ?? null;
    },
    get cleared() {
      return matched.every(Boolean);
    },
    /** A tap on `cell` at time `now`; ignored taps return no events. */
    tap(cell: number, now: number): PairsEvent[] {
      const ev: PairsEvent[] = [];
      if (cell < 0 || cell >= faces.length || matched[cell]) return ev;
      if (held) {
        // Shortcut: from 400 ms after the second card finished turning, a tap ends the hold early.
        if (now < held.at + TURN_MS + SHORTCUT_MS) return ev;
        const onHeld = held.cells.includes(cell);
        close(ev);
        if (!onHeld) openCell(cell, ev);
        return ev;
      }
      if (open.includes(cell) || open.length >= 2) return ev;
      openCell(cell, ev);
      if (ev.some((e) => e.type === 'mismatch')) held = { cells: [open[0]!, open[1]!], at: now };
      return ev;
    },
    /** Resolves the mismatch hold when its time is up. */
    tick(now: number): PairsEvent[] {
      const ev: PairsEvent[] = [];
      if (held && now >= held.at + TURN_MS + HOLD_MS) close(ev);
      return ev;
    },
  };
}

export type Pairs = ReturnType<typeof createPairs>;
