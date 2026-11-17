// Where everything sits for a given visible rectangle. Pure geometry in design units. The HUD pills run along
// the top, the shelves of bottles fill the middle in as many rows as makes the bottles largest, and Pekoe and
// the helper buttons share the counter along the bottom. Sizes that must stay readable or tappable on a phone
// are worked out in CSS pixels, because a design unit can be half a CSS pixel on a tall frame.
import { MAX_BOTTLES } from './logic.ts';

export const DESIGN = { width: 720, height: 960 } as const;
/** The bottle box all bottle art is measured in. */
export const BOTTLE = { w: 150, h: 420 } as const;
/** The largest scale a bottle is shown at; bottle textures are drawn this much larger to stay sharp. */
export const BOTTLE_MAX = 1.25;
export const PILL = { level: 200, moves: 250, h: 56 } as const;
/** The size button art is drawn at; buttons are shown at this size or smaller. */
export const BUTTON = 140;
export const BUTTONS = 4;
/** Pekoe's texture, and the tallest he is shown. */
export const PEKOE = { w: 220, h: 200, max: 250 } as const; // max = h × BOTTLE_MAX
export const PANEL = { w: 560, h: 380 } as const;
/** Thickness of a shelf plank and of the counter top. */
export const SHELF = 18;
export const SLAB = 16;
/** The toolkit's pause button covers a square of this many CSS pixels in the view's top-right corner. */
export const PAUSE_CSS = 64;

/** How far a lifted bottle rises, as a share of its height. */
const LIFT = 0.1;
const ROW_GAP = 12;
/** The most rows of shelves any layout uses. */
export const MAX_ROWS = 3;

export interface Pt {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface View {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Frame {
  /** top-left corners of the two HUD pills, and their scale */
  level: Pt;
  moves: Pt;
  pillScale: number;
  rows: number;
  /** the row each bottle stands in */
  rowOf: number[];
  /** bottom-centre of each bottle */
  spots: Pt[];
  /** bottle size as a multiple of BOTTLE, at most BOTTLE_MAX */
  scale: number;
  /** distance between neighbours in a row */
  pitch: number;
  /** how far a lifted bottle rises */
  lift: number;
  /** one plank per row; y is the surface the bottles stand on */
  shelves: Rect[];
  /** helper buttons: diameter and centres */
  buttonSize: number;
  buttons: Pt[];
  /** Pekoe's bottom-centre and height, or null when there is no room */
  pekoe: { x: number; y: number; h: number } | null;
  /** top of the counter */
  counter: number;
  /** the result card: centre and scale */
  panel: { x: number; y: number; scale: number };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * The layout for `count` bottles in a visible rectangle. `css` is the number of CSS pixels one design unit
 * covers on screen.
 */
export function frameFor(view: View, css: number, count: number): Frame {
  const u = 1 / css;
  const n = clamp(Math.round(count), 1, MAX_BOTTLES);
  const cx = view.x + view.width / 2;
  const bottom = view.y + view.height;
  const pad = clamp(8 * u, 8, 20);

  // HUD pills: about 32 CSS px tall, from the top-left corner, a little smaller on a very narrow frame so they
  // stop short of the pause button.
  const corner = PAUSE_CSS * u;
  const pillScale = Math.min(
    clamp((32 * u) / PILL.h, 0.6, 1.5),
    (view.width - corner - pad * 2.75) / (PILL.level + PILL.moves),
  );
  const pillH = PILL.h * pillScale;
  const level = { x: view.x + pad, y: view.y + pad };
  const moves = { x: level.x + PILL.level * pillScale + pad * 0.75, y: level.y };

  // Counter band: buttons of about 54 CSS px with a caption under each.
  const buttonSize = clamp(54 * u, 64, BUTTON);
  const caption = buttonSize * 0.3;
  const counter = bottom - SLAB;
  const band = SLAB + pad * 0.5 + caption + buttonSize + pad * 0.5;

  // Shelves: between the pills (and the pause button's corner) and the counter band.
  const areaTop = view.y + Math.max(pad + pillH + pad * 0.5, corner - 24);
  const areaH = bottom - band - pad * 0.5 - areaTop;
  const ratio = BOTTLE.h / BOTTLE.w;
  const widthFor = (rows: number) => {
    const perRow = Math.ceil(n / rows);
    const rowH = areaH / rows;
    const h = (rowH - SHELF - ROW_GAP) / (1 + LIFT);
    return Math.min(BOTTLE.w * BOTTLE_MAX, ((view.width - pad * 2) / perRow) * 0.8, h / ratio);
  };
  let rows = 1;
  for (let r = 2; r <= MAX_ROWS; r++) if (widthFor(r) > widthFor(rows) * 1.04) rows = r;
  const w = widthFor(rows);
  const scale = w / BOTTLE.w;
  const h = BOTTLE.h * scale;
  const lift = h * LIFT;
  const perRow = Math.ceil(n / rows);
  const pitch = Math.min((view.width - pad * 2) / perRow, w * 1.55);
  const rowH = lift + h + SHELF + ROW_GAP;
  const spare = Math.max(0, areaH - rows * rowH);
  const top = areaTop + spare / 2;

  const rowOf: number[] = [];
  const spots: Pt[] = [];
  const shelves: Rect[] = [];
  const shelfW = Math.min(view.width, perRow * pitch + 36);
  const base = Math.floor(n / rows);
  for (let r = 0; r < rows; r++) {
    const inRow = base + (r < n % rows ? 1 : 0);
    const y = top + r * rowH + lift + h;
    for (let j = 0; j < inRow; j++) {
      rowOf.push(r);
      spots.push({ x: cx + (j - (inRow - 1) / 2) * pitch, y });
    }
    shelves.push({ x: cx - shelfW / 2, y, w: shelfW, h: SHELF });
  }

  // Pekoe stands on the counter to the left of the buttons, as tall as the space under the last shelf allows.
  const gap = clamp(10 * u, 10, 30);
  const buttonsW = BUTTONS * buttonSize + (BUTTONS - 1) * gap;
  const pekoeRatio = PEKOE.w / PEKOE.h;
  const room = counter - (top + rows * rowH - ROW_GAP) - 8;
  let pekoeH = Math.min(PEKOE.max, room);
  pekoeH = Math.min(pekoeH, (view.width - pad * 2 - gap - buttonsW) / pekoeRatio);
  const pekoeW = pekoeH >= 70 ? pekoeH * pekoeRatio : 0;
  const total = buttonsW + (pekoeW > 0 ? pekoeW + gap : 0);
  const x0 = cx - total / 2;
  const pekoe = pekoeW > 0 ? { x: x0 + pekoeW / 2, y: counter, h: pekoeH } : null;
  const bx = x0 + total - buttonsW + buttonSize / 2;
  const by = counter - pad * 0.5 - caption - buttonSize / 2;
  const buttons: Pt[] = [];
  for (let i = 0; i < BUTTONS; i++) buttons.push({ x: bx + i * (buttonSize + gap), y: by });

  const panel = {
    x: cx,
    y: view.y + view.height * 0.45,
    scale: Math.min(320 * u, view.width * 0.9) / PANEL.w,
  };

  return {
    level,
    moves,
    pillScale,
    rows,
    rowOf,
    spots,
    scale,
    pitch,
    lift,
    shelves,
    buttonSize,
    buttons,
    pekoe,
    counter,
    panel,
  };
}

/** The bottle whose slot contains the point, or -1. Slots are the full pitch wide, so targets stay generous. */
export function bottleAt(frame: Frame, x: number, y: number): number {
  const h = BOTTLE.h * frame.scale;
  let found = -1;
  let nearest = frame.pitch / 2;
  frame.spots.forEach((s, i) => {
    if (y < s.y - h - frame.lift - 6 || y > s.y + SHELF + 6) return;
    const d = Math.abs(x - s.x);
    if (d <= nearest) {
      nearest = d;
      found = i;
    }
  });
  return found;
}

/** The helper button under the point, or -1. The caption below a button counts as part of it. */
export function buttonAt(frame: Frame, x: number, y: number): number {
  const r = frame.buttonSize / 2;
  return frame.buttons.findIndex(
    (b) => Math.abs(x - b.x) <= r + 5 && y >= b.y - r - 5 && y <= b.y + r + frame.buttonSize * 0.3,
  );
}

/** The bottle a row above or below `from` that is closest to it sideways, or `from` when there is no such row. */
export function neighbourRow(frame: Frame, from: number, step: -1 | 1): number {
  const here = frame.spots[from];
  const row = (frame.rowOf[from] ?? 0) + step;
  if (!here || row < 0 || row >= frame.rows) return from;
  let found = from;
  let nearest = Infinity;
  frame.spots.forEach((s, i) => {
    const d = Math.abs(s.x - here.x);
    if (frame.rowOf[i] === row && d < nearest) {
      nearest = d;
      found = i;
    }
  });
  return found;
}
