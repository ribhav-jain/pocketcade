// Where everything sits for a given visible rectangle. Pure geometry in design units: a tall view stacks the
// score, the quilt and the tray; a wide view puts the score and Purl on the left and the tray on the right so
// the quilt can use the full height.
import { SIZE } from './logic.ts';

export const DESIGN = { width: 720, height: 960 } as const;
/** Largest square size any layout uses (16:9 at full height). */
export const CELL_MAX = 108;
/** Width of the quilt's binding around the 8 × 8 squares. */
export const BIND = 16;
export const PILL = { w: 200, h: 64 } as const;
/** Design-unit square in the view's top-right corner that the pause button covers. */
const PAUSE_CORNER = 116;
/** Purl's texture is this shape (width / height). */
export const PURL_ASPECT = 1.25;
export const PURL_MAX_H = 230;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Frame {
  mode: 'stack' | 'side';
  /** size of one quilt square */
  cell: number;
  /** top-left of the 8 × 8 squares */
  gx: number;
  gy: number;
  /** the three tray slots */
  slots: readonly [Rect, Rect, Rect];
  /** largest square size a waiting patch is drawn at */
  trayCell: number;
  /** top-left corners of the two HUD pills */
  score: { x: number; y: number };
  best: { x: number; y: number };
  /** Purl: bottom-centre anchor and height */
  purl: { x: number; y: number; h: number };
  /** the yarn ball beside Purl, or null when there is no room */
  yarn: { x: number; y: number; scale: number } | null;
  /** centre of the sewing-kit props, or null when there is no room */
  kit: { x: number; y: number; scale: number } | null;
}

const PAD = 14;
const GAP = 10;
const HUD_MIN = 100;
const TRAY_MIN = 200;
const TRAY_MAX = 290;
const PANEL_MIN = 240;
const PANEL_MAX = 380;
const KIT = { w: 320, h: 300 } as const;

const clampCell = (v: number) => Math.max(40, Math.min(CELL_MAX, Math.floor(v)));

function stackCell(w: number, h: number): number {
  return clampCell(
    Math.min((w - 8 - BIND * 2) / SIZE, (h - HUD_MIN - TRAY_MIN - GAP - PAD - BIND * 2) / SIZE),
  );
}

function sideCell(w: number, h: number): number {
  return clampCell(
    Math.min(
      (h - 40 - BIND * 2) / SIZE,
      (w - PANEL_MIN * 2 - GAP * 4 - PAD * 2 - BIND * 2) / SIZE,
    ),
  );
}

function stack(v: { x: number; y: number; width: number; height: number }): Frame {
  const cell = stackCell(v.width, v.height);
  const grid = cell * SIZE;
  const outer = grid + BIND * 2;
  const spare = Math.max(0, v.height - (outer + HUD_MIN + TRAY_MIN + GAP + PAD));
  const trayH = Math.min(TRAY_MAX, TRAY_MIN + spare * 0.45);
  const hudH = HUD_MIN + spare - (trayH - TRAY_MIN);
  const left = v.x + (v.width - outer) / 2;
  const top = v.y + hudH;
  const gx = left + BIND;
  const gy = top + BIND;

  const trayW = Math.min(v.width - PAD * 2, Math.max(outer, 640));
  const trayX = v.x + (v.width - trayW) / 2;
  const trayY = top + outer + GAP;
  const slotW = (trayW - GAP * 2) / 3;
  const slot = (i: number): Rect => ({
    x: trayX + i * (slotW + GAP),
    y: trayY,
    w: slotW,
    h: trayH,
  });

  // Pills: one above the other when the HUD band is tall, side by side when it is short.
  const hx = Math.max(v.x + PAD, left);
  const tall = hudH >= PILL.h * 2 + 30;
  const score = { x: hx, y: v.y + (tall ? 14 : (hudH - PILL.h) / 2) };
  const best = tall ? { x: hx, y: score.y + PILL.h + 8 } : { x: hx + PILL.w + 8, y: score.y };
  const pillsRight = best.x + PILL.w;

  // Purl rests on the quilt's top edge, clear of the pills and of the pause button in the corner.
  let purlH = Math.max(84, Math.min(PURL_MAX_H, hudH - 10));
  let right = left + outer - 10;
  if (top + 10 - purlH < v.y + PAUSE_CORNER)
    right = Math.min(right, v.x + v.width - PAUSE_CORNER - 4);
  purlH = Math.min(purlH, Math.max(60, (right - pillsRight - 10) / PURL_ASPECT));
  const purlW = purlH * PURL_ASPECT;
  const purl = { x: right - purlW / 2, y: top + 10, h: purlH };
  const yarnScale = purlH / PURL_MAX_H;
  const yarnX = right - purlW - 34 * yarnScale;
  const yarn =
    yarnX - 50 * yarnScale > pillsRight + 6 ? { x: yarnX, y: top + 2, scale: yarnScale } : null;

  const margin = (v.width - outer) / 2;
  const kitScale = Math.min(1, (margin - 24) / KIT.w);
  const kit =
    kitScale >= 0.5 ? { x: v.x + margin / 2, y: top + outer * 0.55, scale: kitScale } : null;

  return {
    mode: 'stack',
    cell,
    gx,
    gy,
    slots: [slot(0), slot(1), slot(2)],
    trayCell: Math.min(54, Math.floor(cell * 0.62)),
    score,
    best,
    purl,
    yarn,
    kit,
  };
}

function side(v: { x: number; y: number; width: number; height: number }): Frame {
  const cell = sideCell(v.width, v.height);
  const grid = cell * SIZE;
  const outer = grid + BIND * 2;
  const left = v.x + (v.width - outer) / 2;
  const top = v.y + (v.height - outer) / 2;
  const panelW = Math.min(PANEL_MAX, (v.width - outer) / 2 - GAP * 2 - PAD);
  const leftX = left - GAP * 2 - panelW;
  const rightX = left + outer + GAP * 2;

  // Tray: three slots down the right, starting below the pause button.
  const trayTop = v.y + PAUSE_CORNER;
  const trayBottom = v.y + v.height - 20;
  const slotW = Math.min(panelW, 320);
  const slotH = Math.min(250, (trayBottom - trayTop - GAP * 2) / 3);
  const trayY = trayTop + (trayBottom - trayTop - (slotH * 3 + GAP * 2)) / 2;
  const slot = (i: number): Rect => ({
    x: rightX + (panelW - slotW) / 2,
    y: trayY + i * (slotH + GAP),
    w: slotW,
    h: slotH,
  });

  const hx = leftX + (panelW - PILL.w) / 2;
  const score = { x: hx, y: v.y + 36 };
  const best = { x: hx, y: score.y + PILL.h + 8 };

  const purlH = Math.min(PURL_MAX_H, (panelW - 20) / PURL_ASPECT);
  const yarnScale = purlH / PURL_MAX_H;
  const purlX = leftX + panelW / 2 + 16 * yarnScale;
  const purlY = v.y + v.height - 44;
  const purl = { x: purlX, y: purlY, h: purlH };
  const yarn = { x: purlX - purlH * PURL_ASPECT * 0.5 + 4, y: purlY + 6, scale: yarnScale };

  const kitTop = best.y + PILL.h + 24;
  const kitBottom = purlY - purlH - 24;
  const kitScale = Math.min(1, (panelW - 10) / KIT.w, (kitBottom - kitTop) / KIT.h);
  const kit =
    kitScale >= 0.5
      ? { x: leftX + panelW / 2, y: (kitTop + kitBottom) / 2, scale: kitScale }
      : null;

  return {
    mode: 'side',
    cell,
    gx: left + BIND,
    gy: top + BIND,
    slots: [slot(0), slot(1), slot(2)],
    trayCell: Math.min(54, Math.floor(cell * 0.5)),
    score,
    best,
    purl,
    yarn,
    kit,
  };
}

/** The layout for a visible rectangle: whichever arrangement gives the larger quilt. */
export function frameFor(view: { x: number; y: number; width: number; height: number }): Frame {
  return sideCell(view.width, view.height) > stackCell(view.width, view.height)
    ? side(view)
    : stack(view);
}

/** Scale that fits a w × h patch into a tray slot, never larger than the tray square size. */
export function trayScale(frame: Frame, w: number, h: number): number {
  const slot = frame.slots[0];
  return Math.min(frame.trayCell, (slot.w - 28) / w, (slot.h - 28) / h) / frame.cell;
}
