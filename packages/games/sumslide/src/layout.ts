// Where the tray and the HUD cards go for a given view. Pure, in design units.
//
// The tray takes the largest square the view allows. The HUD sits beside it on wide views (one column, or one on
// each side when there is room) and above it otherwise (one row, or two on tall views).

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface HudLayout {
  tray: { x: number; y: number; size: number };
  score: Rect;
  goal: Rect;
  echo: Rect;
  undo: Rect;
}

type View = { x: number; y: number; width: number; height: number };

const MARGIN = 12;
const GAP = 10;
const TRAY_MAX = 696;
const ROW = 84;
const ROW_MAX = 112;
const COL_MIN = 200;
const COL_MAX = 260;
const CARD = 108;
const UNDO_ROW = 76;

/** `pause` is the side of the square in the view's top-right corner that the pause button covers. */
export function layoutHud(view: View, pause: number): HudLayout {
  const availW = view.width - 2 * MARGIN;
  const availH = view.height - 2 * MARGIN;
  const spare = availH - TRAY_MAX - 2 * (ROW + GAP);
  const rows = spare >= 0 ? 2 : 1;
  // a single row grows, if it must, so the tray starts below the pause button
  const rowH =
    rows === 2 ? Math.min(ROW_MAX, ROW + spare / 2) : Math.max(ROW, pause - MARGIN - GAP);
  const topSize = Math.min(TRAY_MAX, availW, availH - rows * (rowH + GAP));
  const sideSize = Math.min(TRAY_MAX, availH, availW - GAP - COL_MIN);
  return sideSize > topSize
    ? beside(view, sideSize, pause)
    : above(view, topSize, rows, rowH, pause);
}

function above(view: View, size: number, rows: number, rowH: number, pause: number): HudLayout {
  const width = Math.min(view.width - 2 * MARGIN, TRAY_MAX);
  const blockH = rows * (rowH + GAP) + size;
  const x = view.x + (view.width - width) / 2;
  const y = view.y + MARGIN + (view.height - 2 * MARGIN - blockH) * 0.4;
  const right = view.x + view.width;
  // the first row stops short of the pause button when they would meet
  const firstW = y < view.y + pause && x + width > right - pause ? right - pause - GAP - x : width;
  const tray = { x: view.x + (view.width - size) / 2, y: y + rows * (rowH + GAP), size };
  if (rows === 1) {
    const rest = firstW - UNDO_ROW - 3 * GAP;
    const score = { x: x + UNDO_ROW + GAP, y, w: rest * 0.29, h: rowH };
    const goal = { x: score.x + score.w + GAP, y, w: rest * 0.34, h: rowH };
    const echo = { x: goal.x + goal.w + GAP, y, w: rest - score.w - goal.w, h: rowH };
    return { tray, score, goal, echo, undo: { x, y, w: UNDO_ROW, h: rowH } };
  }
  const y2 = y + rowH + GAP;
  const w = (width - 2 * GAP) * 0.38;
  return {
    tray,
    score: { x, y, w: firstW, h: rowH },
    goal: { x, y: y2, w, h: rowH },
    echo: { x: x + w + GAP, y: y2, w, h: rowH },
    undo: { x: x + 2 * (w + GAP), y: y2, w: width - 2 * (w + GAP), h: rowH },
  };
}

function beside(view: View, size: number, pause: number): HudLayout {
  const availW = view.width - 2 * MARGIN;
  const two = availW - size - 2 * GAP >= 2 * COL_MIN;
  const cw = Math.min(COL_MAX, two ? (availW - size - 2 * GAP) / 2 : availW - size - GAP);
  const blockW = size + (two ? 2 : 1) * (cw + GAP);
  const x0 = view.x + (view.width - blockW) / 2;
  const tray = { x: two ? x0 + cw + GAP : x0, y: view.y + (view.height - size) / 2, size };
  const rightX = tray.x + size + GAP;
  const mid = tray.y + size / 2;
  // the right column starts below the pause button when it reaches under it
  const minY = rightX + cw > view.x + view.width - pause ? view.y + pause + GAP : -Infinity;
  const stack = (x: number, heights: number[], floor: number): Rect[] => {
    const total = heights.reduce((sum, h) => sum + h + GAP, -GAP);
    let y = Math.max(floor, mid - total / 2);
    return heights.map((h) => {
      const r = { x, y, w: cw, h };
      y += h + GAP;
      return r;
    });
  };
  if (two) {
    const [score, goal] = stack(x0, [CARD, CARD], -Infinity) as [Rect, Rect];
    const [echo, undo] = stack(rightX, [CARD, ROW], minY) as [Rect, Rect];
    return { tray, score, goal, echo, undo };
  }
  const [score, goal, echo, undo] = stack(rightX, [CARD, CARD, CARD, ROW], minY) as [
    Rect,
    Rect,
    Rect,
    Rect,
  ];
  return { tray, score, goal, echo, undo };
}
