// Table geometry, computed from the visible view so the table fills whatever frame shape the portal gives. Two
// arrangements: 'stacked' (stock, waste and the four vaults in a row above the seven columns) and 'wide' (stock and
// waste in a column on the left, the vaults in a column on the right), used when it gives clearly bigger cards.
// Tall views also get a bottom bar for the action buttons. Pure; hit-testing uses it, not Phaser drop zones.
import { faceUpFrom, isTab, isVault, STOCK, TAB0, WASTE, type State } from './klondike.ts';

/** cards.ts draws every card in this box; sprites are scaled to the table's card size */
export const ART_W = 128;
export const ART_H = 179;
/** the largest card any view shows; card textures are drawn at this size */
export const MAX_CARD_W = 156;
/** HUD element scale bounds; HUD textures are drawn for UI_MAX */
export const UI_MAX = 1.6;
/** HUD sizes at scale 1 (design units) */
export const HUD = {
  bar: 80,
  bottomBar: 96,
  h: 56,
  chipW: 112,
  pillW: 116,
  btnW: 96,
  wideBtnW: 190,
  lanternW: 44,
  gap: 10,
} as const;

const RATIO = ART_H / ART_W;
const GAP = 0.08; // between columns, in card widths
const SIDE = 0.35; // extra space between the side columns and the tableau (wide)
const ROW_GAP = 0.16; // between the top row and the columns (stacked), in card heights
const ROOM = 2.6; // fan room a column needs below its slot, in card heights
const PAD = 14;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Table {
  mode: 'stacked' | 'wide';
  view: Rect;
  /** card size */
  w: number;
  h: number;
  /** HUD scale: above 1 when the frame is small on screen, so buttons stay comfortable to touch */
  ui: number;
  top: Rect;
  /** the action buttons' bar on tall views */
  bottom: Rect | null;
  /** top-left of each pile's slot */
  slots: ReadonlyArray<{ x: number; y: number }>;
  /** the lowest y a tableau card may reach */
  floor: number;
}

/**
 * The table for a view (design units) shown at `cssPerUnit` CSS px per design unit.
 * The HUD scale aims for buttons about 36 CSS px tall, within what the bar can fit.
 */
export function tableFor(view: Rect, cssPerUnit: number): Table {
  const tall = view.height >= view.width * 1.3;
  const rowNeed = tall
    ? HUD.chipW + 2 * HUD.pillW + HUD.btnW + HUD.lanternW + 6 * HUD.gap
    : HUD.chipW + 2 * HUD.pillW + 4 * HUD.btnW + HUD.lanternW + 9 * HUD.gap;
  const bottomNeed = 3 * HUD.wideBtnW + 4 * HUD.gap;
  const ui = Math.max(
    1,
    Math.min(
      UI_MAX,
      36 / (HUD.h * Math.max(0.01, cssPerUnit)),
      view.width / rowNeed,
      tall ? view.width / bottomNeed : UI_MAX,
    ),
  );
  const top = { x: view.x, y: view.y, width: view.width, height: HUD.bar * ui };
  const bottomH = HUD.bottomBar * ui;
  const bottom = tall
    ? { x: view.x, y: view.y + view.height - bottomH, width: view.width, height: bottomH }
    : null;
  const y0 = top.y + top.height + PAD;
  const y1 = (bottom ? bottom.y : view.y + view.height) - PAD;
  const across = view.width - 2 * PAD;
  const stackedW = Math.min(
    MAX_CARD_W,
    across / (7 + 6 * GAP),
    (y1 - y0) / (RATIO * (2 + ROW_GAP + ROOM)),
  );
  const wideW = Math.min(
    MAX_CARD_W,
    across / (9 + 6 * GAP + 2 * SIDE),
    (y1 - y0) / (RATIO * (4 + 3 * 0.06)),
  );
  const mode = !tall && wideW > stackedW * 1.06 ? 'wide' : 'stacked';
  const w = Math.floor(mode === 'wide' ? wideW : stackedW);
  const h = Math.round(w * RATIO);
  const pitch = w * (1 + GAP);
  const tabSpan = 7 * w + 6 * GAP * w;
  const slots: Array<{ x: number; y: number }> = [];
  if (mode === 'stacked') {
    const left = view.x + (view.width - tabSpan) / 2;
    const col = (c: number) => Math.round(left + c * pitch);
    const tabY = Math.round(y0 + h * (1 + ROW_GAP));
    for (let p = 0; p < 13; p++)
      slots.push(
        p === STOCK
          ? { x: col(0), y: y0 }
          : p === WASTE
            ? { x: col(1), y: y0 }
            : isVault(p)
              ? { x: col(1 + p), y: y0 }
              : { x: col(p - TAB0), y: tabY },
      );
  } else {
    const left = view.x + (view.width - (tabSpan + 2 * w * (1 + SIDE))) / 2;
    const tab0 = left + w * (1 + SIDE);
    const right = Math.round(tab0 + tabSpan + w * SIDE);
    const vaultStep = (y1 - y0 - h) / 3;
    for (let p = 0; p < 13; p++)
      slots.push(
        p === STOCK
          ? { x: Math.round(left), y: y0 }
          : p === WASTE
            ? { x: Math.round(left), y: Math.round(y0 + h * 1.1) }
            : isVault(p)
              ? { x: right, y: Math.round(y0 + (p - 2) * vaultStep) }
              : { x: Math.round(tab0 + (p - TAB0) * pitch), y: y0 },
      );
  }
  return { mode, view, w, h, ui, top, bottom, slots, floor: y1 };
}

/** Face-down and face-up fan offsets for a column, compressed so the column stays above the floor. */
export function fan(t: Table, s: State, p: number): { down: number; up: number } {
  const n = s.piles[p]!.length;
  const down0 = s.faceDown[p - TAB0]!;
  const up0 = Math.max(0, n - down0 - 1);
  const room = t.floor - t.slots[p]!.y - t.h;
  let down = 0.12 * t.h;
  let up = 0.28 * t.h;
  if (down0 * down + up0 * up > room && up0) up = Math.max(0.15 * t.h, (room - down0 * down) / up0);
  if (down0 * down + up0 * up > room && down0)
    down = Math.max(0.05 * t.h, (room - up0 * up) / down0);
  return { down, up };
}

/** Top-left of the card at (pile, index). Draw 3 fans the top three waste cards (right, or down when wide). */
export function cardXY(t: Table, s: State, p: number, i: number): { x: number; y: number } {
  const base = t.slots[p]!;
  if (isTab(p)) {
    const f = fan(t, s, p);
    const down = Math.min(i, faceUpFrom(s, p));
    return { x: base.x, y: Math.round(base.y + down * f.down + (i - down) * f.up) };
  }
  if (p === WASTE && s.draw === 3) {
    const n = s.piles[WASTE]!.length;
    const k = Math.max(0, i - Math.max(0, n - 3));
    return t.mode === 'wide'
      ? { x: base.x, y: Math.round(base.y + k * 0.2 * t.h) }
      : { x: Math.round(base.x + k * 0.24 * t.w), y: base.y };
  }
  return base;
}

const inside = (t: Table, x: number, y: number, r: { x: number; y: number }, pad = 0) =>
  x >= r.x - pad && x <= r.x + t.w + pad && y >= r.y - pad && y <= r.y + t.h + pad;

/** The card under (x, y): the top-most in a column, the top of other piles, or the stock slot. */
export function hitCard(
  t: Table,
  s: State,
  x: number,
  y: number,
): { pile: number; index: number } | null {
  for (let p = TAB0; p < TAB0 + 7; p++)
    for (let i = s.piles[p]!.length - 1; i >= 0; i--)
      if (inside(t, x, y, cardXY(t, s, p, i))) return { pile: p, index: i };
  if (inside(t, x, y, t.slots[STOCK]!)) return { pile: STOCK, index: 0 };
  for (const p of [WASTE, 2, 3, 4, 5]) {
    const n = s.piles[p]!.length;
    if (n && inside(t, x, y, cardXY(t, s, p, n - 1))) return { pile: p, index: n - 1 };
  }
  return null;
}

/** The pile a drop or tap at (x, y) targets: a top or side slot, or a column's whole lane. */
export function pileAt(t: Table, s: State, x: number, y: number): number | null {
  for (const p of [STOCK, WASTE, 2, 3, 4, 5]) {
    const r = p === WASTE ? cardXY(t, s, p, Math.max(0, s.piles[p]!.length - 1)) : t.slots[p]!;
    if (inside(t, x, y, r, 10) || inside(t, x, y, t.slots[p]!, 10)) return p;
  }
  const half = (GAP * t.w) / 2;
  for (let p = TAB0; p < TAB0 + 7; p++) {
    const slot = t.slots[p]!;
    if (x >= slot.x - half && x <= slot.x + t.w + half && y >= slot.y - 24) return p;
  }
  return null;
}

/** Centre of the card at (pile, index), or of the slot. */
export function centre(t: Table, s: State, p: number, i: number): { x: number; y: number } {
  const xy = s.piles[p]!.length
    ? cardXY(t, s, p, Math.min(i, s.piles[p]!.length - 1))
    : t.slots[p]!;
  return { x: xy.x + t.w / 2, y: xy.y + t.h / 2 };
}
