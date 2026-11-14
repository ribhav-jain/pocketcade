// Klondike rules, pure TypeScript. Piles 0 stock, 1 waste, 2–5 vaults (foundations), 6–12 tableau, each bottom → top. Card id = suit × 13 + (rank − 1); suits 0 ♠, 1 ♥, 2 ♦, 3 ♣ (1 and 2 are red).
import { createRng } from '@pocketcade/toolkit';

export const STOCK = 0;
export const WASTE = 1;
const VAULT0 = 2;
export const TAB0 = 6;
export const PILES = 13;

export const suitOf = (c: number) => Math.floor(c / 13);
export const rankOf = (c: number) => (c % 13) + 1;
const isRed = (c: number) => suitOf(c) === 1 || suitOf(c) === 2;
export const isVault = (p: number) => p >= VAULT0 && p < TAB0;
export const isTab = (p: number) => p >= TAB0 && p < PILES;

export interface State {
  piles: number[][];
  /** face-down count per tableau column T1–T7 (the bottom-most cards) */
  faceDown: number[];
  draw: 1 | 3;
}

const cloneState = (s: State): State => ({
  piles: s.piles.map((p) => [...p]),
  faceDown: [...s.faceDown],
  draw: s.draw,
});

/** The deck order for a claim (deal seed): seeded Fisher–Yates. */
export function shuffled(claim: string): number[] {
  const deck = Array.from({ length: 52 }, (_, i) => i);
  createRng(`sourdough:deal:${claim}`).shuffle(deck);
  return deck;
}

export function layoutDeal(deck: readonly number[], draw: 1 | 3): State {
  const piles: number[][] = Array.from({ length: PILES }, () => []);
  let k = 0;
  for (let r = 0; r < 7; r++) for (let c = r; c < 7; c++) piles[TAB0 + c]!.push(deck[k++]!);
  piles[STOCK] = deck.slice(28);
  return { piles, faceDown: [0, 1, 2, 3, 4, 5, 6], draw };
}

export type Move =
  | { type: 'draw' }
  | { type: 'recycle' }
  | { type: 'move'; from: number; to: number; count: number };

const top = (p: readonly number[]) => p[p.length - 1];

function fits(s: State, card: number, to: number): boolean {
  const t = top(s.piles[to]!);
  if (isVault(to))
    return t === undefined
      ? rankOf(card) === 1
      : suitOf(t) === suitOf(card) && rankOf(card) === rankOf(t) + 1;
  if (isTab(to))
    return t === undefined
      ? rankOf(card) === 13
      : isRed(t) !== isRed(card) && rankOf(card) === rankOf(t) - 1;
  return false;
}

/** First face-up index of a pile (tableau: after its face-down cards). */
export const faceUpFrom = (s: State, p: number) => (isTab(p) ? s.faceDown[p - TAB0]! : 0);

export function legal(s: State, m: Move): boolean {
  if (m.type === 'draw') return s.piles[STOCK]!.length > 0;
  if (m.type === 'recycle') return s.piles[STOCK]!.length === 0 && s.piles[WASTE]!.length > 0;
  const src = s.piles[m.from]!;
  if (m.from === m.to || m.count < 1 || m.count > src.length || m.from === STOCK || m.to <= WASTE)
    return false;
  if (!isTab(m.from) && m.count !== 1) return false;
  if (isVault(m.to) && m.count !== 1) return false;
  if (src.length - m.count < faceUpFrom(s, m.from)) return false;
  return fits(s, src[src.length - m.count]!, m.to);
}

/** Applies a legal move; returns the cards moved and whether it flipped the source column's new top. */
export function apply(s: State, m: Move): { flip: boolean; count: number } {
  if (m.type === 'draw') {
    const n = Math.min(s.draw, s.piles[STOCK]!.length);
    for (let i = 0; i < n; i++) s.piles[WASTE]!.push(s.piles[STOCK]!.pop()!);
    return { flip: false, count: n };
  }
  if (m.type === 'recycle') {
    s.piles[STOCK] = s.piles[WASTE]!.reverse();
    s.piles[WASTE] = [];
    return { flip: false, count: 0 };
  }
  const src = s.piles[m.from]!;
  s.piles[m.to]!.push(...src.splice(src.length - m.count, m.count));
  let flip = false;
  if (isTab(m.from)) {
    const c = m.from - TAB0;
    if (s.faceDown[c]! > 0 && s.faceDown[c]! >= src.length) {
      s.faceDown[c] = src.length - 1;
      flip = true;
    }
  }
  return { flip, count: m.count };
}

// ─── move tokens: n = type | from << 2 | to << 6 | count << 10 | flip << 14, base 36, 3 chars ───

export function encode(m: Move, r: { flip: boolean; count: number }): string {
  const [type, from, to, count] =
    m.type === 'draw'
      ? [0, STOCK, WASTE, r.count]
      : m.type === 'recycle'
        ? [1, WASTE, STOCK, 0]
        : [2, m.from, m.to, m.count];
  return (type | (from << 2) | (to << 6) | (count << 10) | ((r.flip ? 1 : 0) << 14))
    .toString(36)
    .padStart(3, '0');
}

export function decode(token: string): { move: Move; count: number; flip: boolean } | null {
  if (!/^[0-9a-z]{3}$/.test(token)) return null;
  const n = parseInt(token, 36);
  const [type, from, to, count, flip] = [
    n & 3,
    (n >> 2) & 15,
    (n >> 6) & 15,
    (n >> 10) & 15,
    (n >> 14) & 1,
  ];
  if (n >> 15) return null;
  const move: Move | null =
    type === 0
      ? { type: 'draw' }
      : type === 1
        ? { type: 'recycle' }
        : type === 2
          ? { type: 'move', from, to, count }
          : null;
  return move && { move, count, flip: flip === 1 };
}

/** Replays a token log from `start`; null if any token is malformed, illegal or has the wrong flip bit. */
export function replay(start: State, log: string): State | null {
  if (log.length % 3) return null;
  const s = cloneState(start);
  for (let i = 0; i < log.length; i += 3) {
    const d = decode(log.slice(i, i + 3));
    if (!d || !legal(s, d.move)) return null;
    const r = apply(s, d.move);
    if (r.flip !== d.flip || (d.move.type === 'draw' && r.count !== d.count)) return null;
  }
  return s;
}

export const banked = (s: State) => s.piles.slice(VAULT0, TAB0).reduce((n, p) => n + p.length, 0);
export const isWon = (s: State) => banked(s) === 52;

/** Card count and the face-up run rule hold (reported, never fatal). */
export function invariantOk(s: State): boolean {
  if (s.piles.reduce((n, p) => n + p.length, 0) !== 52) return false;
  for (let c = 0; c < 7; c++) {
    const p = s.piles[TAB0 + c]!;
    for (let i = Math.max(s.faceDown[c]!, 0) + 1; i < p.length; i++)
      if (isRed(p[i]!) === isRed(p[i - 1]!) || rankOf(p[i]!) !== rankOf(p[i - 1]!) - 1)
        return false;
  }
  return true;
}

// ─── tap-to-move, hints, auto-finish ───

const VAULTS = [2, 3, 4, 5];
const TABS = [6, 7, 8, 9, 10, 11, 12];

/** The best spot for the card at (pile, index), or null (then the card is selected for two-tap moving). */
export function tapMove(s: State, pile: number, index: number): Move | null {
  if (pile === STOCK)
    return s.piles[STOCK]!.length
      ? { type: 'draw' }
      : s.piles[WASTE]!.length
        ? { type: 'recycle' }
        : null;
  const src = s.piles[pile]!;
  const count = src.length - index;
  if (count < 1 || index < faceUpFrom(s, pile)) return null;
  const move = (to: number): Move => ({ type: 'move', from: pile, to, count });
  if (count === 1 && !isVault(pile)) for (const v of VAULTS) if (legal(s, move(v))) return move(v);
  const order = isTab(pile)
    ? [...TABS.slice(pile - TAB0 + 1), ...TABS.slice(0, pile - TAB0)]
    : TABS;
  for (const t of order) if (s.piles[t]!.length && legal(s, move(t))) return move(t);
  // An empty column only helps if the run isn't already at the bottom of its own column.
  if (!(isTab(pile) && index === 0))
    for (const t of order) if (!s.piles[t]!.length && legal(s, move(t))) return move(t);
  return null;
}

/** A useful move, or null (then see deckHelps). Vault → tableau is never suggested. */
export function hint(s: State): Move | null {
  const moves: Array<{ m: Move; score: number }> = [];
  for (const from of [WASTE, ...TABS]) {
    const src = s.piles[from]!;
    if (!src.length) continue;
    for (const v of VAULTS)
      if (legal(s, { type: 'move', from, to: v, count: 1 }))
        moves.push({
          m: { type: 'move', from, to: v, count: 1 },
          score:
            from === WASTE
              ? 60
              : src.length - 1 === faceUpFrom(s, from) && faceUpFrom(s, from) > 0
                ? 100
                : 80,
        });
    if (from === WASTE) {
      for (const t of TABS)
        if (legal(s, { type: 'move', from, to: t, count: 1 }))
          moves.push({
            m: { type: 'move', from, to: t, count: 1 },
            score: s.piles[t]!.length ? 50 : 40,
          });
      continue;
    }
    // Moving a whole face-up run is suggested only when it uncovers a face-down card.
    const i = faceUpFrom(s, from);
    if (i === 0) continue;
    const count = src.length - i;
    for (const t of TABS)
      if (t !== from && legal(s, { type: 'move', from, to: t, count }))
        moves.push({ m: { type: 'move', from, to: t, count }, score: 90 + i });
  }
  moves.sort((a, b) => b.score - a.score);
  return moves[0]?.m ?? null;
}

/** Whether drawing through the deck reaches a card that can be played now (Draw 3 sees only every third card). */
export function deckHelps(start: State): boolean {
  const s = cloneState(start);
  const n = s.piles[STOCK]!.length + s.piles[WASTE]!.length;
  if (!n) return false;
  // Two passes through the deck show every card it can offer: the first may start part-way through.
  for (let k = 0; k < 2 * (Math.ceil(n / s.draw) + 1); k++) {
    apply(s, s.piles[STOCK]!.length ? { type: 'draw' } : { type: 'recycle' });
    if (
      s.piles[WASTE]!.length &&
      [...VAULTS, ...TABS].some((to) => legal(s, { type: 'move', from: WASTE, to, count: 1 }))
    )
      return true;
  }
  return false;
}

/** Moves that bank everything once no tableau card is face-down, or null if the greedy finisher gets stuck. */
export function finishMoves(start: State): Move[] | null {
  if (start.faceDown.some((n) => n > 0)) return null;
  const s = cloneState(start);
  const out: Move[] = [];
  let idle = 0;
  while (!isWon(s) && idle <= 2 * (s.piles[STOCK]!.length + s.piles[WASTE]!.length + 2)) {
    let m: Move | null = null;
    for (const from of [WASTE, ...TABS])
      for (const v of VAULTS)
        if (!m && s.piles[from]!.length && legal(s, { type: 'move', from, to: v, count: 1 }))
          m = { type: 'move', from, to: v, count: 1 };
    if (m) idle = 0;
    else {
      m = s.piles[STOCK]!.length
        ? { type: 'draw' }
        : s.piles[WASTE]!.length
          ? { type: 'recycle' }
          : null;
      idle++;
    }
    if (!m) return null;
    apply(s, m);
    out.push(m);
  }
  return isWon(s) ? out : null;
}
