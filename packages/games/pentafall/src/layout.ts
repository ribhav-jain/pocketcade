// Where everything sits for a given view (design units). Two arrangements: "wide" puts the stash and scores to the
// left of the well and the conveyor to its right; "tall" stacks them above the well with the touch buttons below.
// The one that gives the larger cells wins, so the well is as big as the frame allows at every shape.
import { COLS, HIDDEN_ROWS, ROWS } from './sim.ts';

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
interface Point {
  x: number;
  y: number;
}

export interface Frame {
  wide: boolean;
  /** size of a well cell */
  cell: number;
  /** size of a preview cell (stash and conveyor) */
  mini: number;
  well: Rect;
  stash: Rect;
  next: Rect;
  /** centres of the previews: the stash, then the three conveyor slots */
  slots: readonly [Point, Point, Point, Point];
  /** score, level, lines */
  pills: readonly [Rect, Rect, Rect];
  /** touch buttons: turn left, stash, drop */
  buttons: readonly [Rect, Rect, Rect];
  /** keyboard hint: the centre of one line (tall) or the top-left corner of a short list (wide) */
  hint: Point;
}

export const VIS_ROWS = ROWS - HIDDEN_ROWS;
const PAD = 12;
/** room on each side of the well for its rim and the level rail */
const RAIL = 24;
const LABEL = 34;
/** The toolkit's touch pause button sits in the top-right corner: 48 CSS px, 12 from the edges. */
const PAUSE_CSS = 66;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function tall(v: View, pause: number): Frame {
  const [panelH, pillH, buttonH] = [104, 56, 96];
  const top = 10 + panelH + 8 + pillH + 10;
  const bottom = 8 + buttonH + 10;
  const cell = Math.max(
    8,
    Math.floor(Math.min((v.height - top - bottom) / VIS_ROWS, (v.width - 2 * RAIL) / COLS)),
  );
  const well = {
    x: Math.round(v.x + (v.width - COLS * cell) / 2),
    y: Math.round(v.y + top + (v.height - top - bottom - VIS_ROWS * cell) / 2),
    w: COLS * cell,
    h: VIS_ROWS * cell,
  };
  const stash = { x: v.x + PAD, y: v.y + 10, w: 150, h: panelH };
  const next = {
    x: stash.x + stash.w + 10,
    y: stash.y,
    w: Math.max(240, Math.min(420, v.width - 2 * PAD - stash.w - 10 - pause)),
    h: panelH,
  };
  const slotY = stash.y + LABEL - 6 + (panelH - LABEL) / 2;
  const slotW = (next.w - 16) / 3;
  const full = v.width - 2 * PAD;
  const pillY = stash.y + panelH + 8;
  const pillW = [0.37, 0.26, 0.37].map((f) => Math.floor((full - 16) * f));
  const buttonW = Math.floor((full - 20) / 3);
  const buttonY = v.y + v.height - 10 - buttonH;
  const button = (i: number) => ({
    x: v.x + PAD + i * (buttonW + 10),
    y: buttonY,
    w: buttonW,
    h: buttonH,
  });
  return {
    wide: false,
    cell,
    mini: 22,
    well,
    stash,
    next,
    slots: [
      { x: stash.x + stash.w / 2, y: slotY },
      { x: next.x + 8 + slotW * 0.5, y: slotY },
      { x: next.x + 8 + slotW * 1.5, y: slotY },
      { x: next.x + 8 + slotW * 2.5, y: slotY },
    ],
    pills: [
      { x: v.x + PAD, y: pillY, w: pillW[0]!, h: pillH },
      { x: v.x + PAD + pillW[0]! + 8, y: pillY, w: pillW[1]!, h: pillH },
      { x: v.x + v.width - PAD - pillW[2]!, y: pillY, w: pillW[2]!, h: pillH },
    ],
    buttons: [button(0), button(1), button(2)],
    hint: { x: v.x + v.width / 2, y: buttonY + buttonH / 2 },
  };
}

function wide(v: View, pause: number): Frame {
  const [colMin, colMax, gap, edge, pillH, buttonH] = [124, 200, RAIL + 6, 10, 58, 96];
  const cell = Math.max(
    8,
    Math.floor(
      Math.min((v.height - 28) / VIS_ROWS, (v.width - 2 * (colMin + gap + edge)) / COLS),
    ),
  );
  const well = {
    x: Math.round(v.x + (v.width - COLS * cell) / 2),
    y: Math.round(v.y + (v.height - VIS_ROWS * cell) / 2),
    w: COLS * cell,
    h: VIS_ROWS * cell,
  };
  const col = clamp(Math.floor((v.width - well.w) / 2 - gap - edge), colMin, colMax);
  const mini = clamp(Math.floor((col - 28) / 5), 18, 32);
  const left = well.x - gap - col;
  const right = well.x + well.w + gap;
  const stash = { x: left, y: well.y, w: col, h: LABEL + 3 * mini + 16 };
  const pill = (i: number) => ({
    x: left,
    y: stash.y + stash.h + 12 + i * (pillH + 10),
    w: col,
    h: pillH,
  });
  // Keep the conveyor out from under the pause button when the column reaches into that corner.
  const cornered = right + col > v.x + v.width - pause;
  const slotH = 3 * mini + 10;
  const next = {
    x: right,
    y: cornered ? Math.max(well.y, v.y + pause + 4) : well.y,
    w: col,
    h: LABEL + 3 * slotH + 8,
  };
  // Buttons go in the free space outside the columns (where thumbs rest) when there is any, else under them.
  const outer = left - edge - (v.x + 16);
  const buttonW = outer >= 120 ? Math.min(170, outer) : col;
  const buttonL = outer >= 120 ? v.x + 16 : left;
  const buttonR = outer >= 120 ? v.x + v.width - 16 - buttonW : right;
  const buttonY = v.y + v.height - 14 - buttonH;
  return {
    wide: true,
    cell,
    mini,
    well,
    stash,
    next,
    slots: [
      { x: left + col / 2, y: stash.y + LABEL + (3 * mini) / 2 + 4 },
      { x: right + col / 2, y: next.y + LABEL + slotH * 0.5 },
      { x: right + col / 2, y: next.y + LABEL + slotH * 1.5 },
      { x: right + col / 2, y: next.y + LABEL + slotH * 2.5 },
    ],
    pills: [pill(0), pill(1), pill(2)],
    buttons: [
      { x: buttonL, y: buttonY, w: buttonW, h: buttonH },
      { x: buttonL, y: buttonY - buttonH - 10, w: buttonW, h: buttonH },
      { x: buttonR, y: buttonY, w: buttonW, h: buttonH },
    ],
    hint: { x: right, y: next.y + next.h + 18 },
  };
}

/** The layout for a view; `cssWidth` (the frame's width in CSS px) sizes the pause-button corner. */
export function frameFor(v: View, cssWidth: number): Frame {
  const pause = Math.min(160, (PAUSE_CSS * v.width) / Math.max(1, cssWidth));
  const [t, w] = [tall(v, pause), wide(v, pause)];
  return w.cell >= t.cell ? w : t;
}
