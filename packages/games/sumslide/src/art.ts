// Sumslide art: the tile colour ladder, backdrop themes and every Canvas 2D drawing.
//
// Everything here except the backdrop is drawn in canvas pixels at the exact size it is shown, with edges on
// whole pixels, so the scene can show each texture 1:1 and nothing is resampled. No Phaser or DOM imports.
import { font, luminance, roundRectPath, shade, starPath } from '@pocketcade/toolkit';

type Ctx = CanvasRenderingContext2D;

/**
 * Tile colour by level, 5 up to 2560: pale and cool at the bottom, warm in the middle, deep jewel tones at the
 * top. 5120 and above are gold.
 */
const FILLS = [
  '#E6ECFF',
  '#9AD8FF',
  '#5EE0C2',
  '#A8E650',
  '#FFD53D',
  '#FFA033',
  '#F4503F',
  '#F0409A',
  '#A558F5',
  '#5B4DEB',
] as const;
const GOLD = '#FFC233';
/** Echo colours for its merge burst and charge bar. */
export const RAINBOW = ['#38D6FF', '#B8F34A', '#FFC83D', '#FF9F1C', '#FF4FA3', '#C77DFF'];
export const GOAL_BAR = ['#FFE14D', '#FF9F1C'];

export function tileFill(level: number): string {
  return FILLS[level - 1] ?? GOLD;
}

/** Number colour: white on the deep fills, a dark shade of the fill on the light ones. */
export function tileInk(level: number): string {
  const fill = tileFill(level);
  return luminance(fill) < 0.3 ? '#FFFFFF' : shade(fill, -0.74);
}

/** The backdrop changes with every goal reached, cycling through these. */
export interface Theme {
  /** gradient, top to bottom */
  stops: readonly [string, string, string];
  /** glow behind the tray */
  accent: string;
}
export const THEMES: readonly Theme[] = [
  { stops: ['#2D2170', '#1B1450', '#0D0A2A'], accent: '#8F7BFF' },
  { stops: ['#0F4F73', '#0B3557', '#061A33'], accent: '#38D6FF' },
  { stops: ['#5C1E72', '#3A1456', '#190A30'], accent: '#FF6AD5' },
  { stops: ['#70301F', '#481722', '#200A1B'], accent: '#FF9F1C' },
  { stops: ['#155C4B', '#0D3D41', '#061E2A'], accent: '#5BE38F' },
  { stops: ['#453814', '#251D16', '#0E0B10'], accent: '#FFD24A' },
];

// ─── tray geometry ───

/** The tray in canvas pixels: 4 × 4 cells with `gap` between them and `pad` around them. */
export interface TrayGeo {
  size: number;
  pad: number;
  gap: number;
  cell: number;
  /** transparent border of the tray texture, for its drop shadow */
  margin: number;
}

/** Whole-pixel tray geometry for a tray about `sizePx` wide (never wider). */
export function trayGeo(sizePx: number): TrayGeo {
  const gap = Math.round(sizePx * 0.02);
  const cell = Math.floor((sizePx * 0.95 - 3 * gap) / 4);
  const pad = Math.floor((sizePx - 4 * cell - 3 * gap) / 2);
  return { size: 4 * cell + 3 * gap + 2 * pad, pad, gap, cell, margin: Math.round(sizePx * 0.05) };
}

/** Top-left of a cell, in pixels from the tray's top-left. */
export function cellOffset(g: TrayGeo, index: number): { x: number; y: number } {
  const step = g.cell + g.gap;
  return { x: g.pad + step * (index % 4), y: g.pad + step * Math.floor(index / 4) };
}

const cornerOf = (cell: number) => Math.round(cell * 0.17);
const lipOf = (cell: number) => Math.max(2, Math.round(cell * 0.065));

// ─── drawing helpers ───

/** A bright line just inside the top edge of a rounded rect, fading out downwards. */
function rimLight(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  width: number,
  alpha: number,
  color = '255,255,255',
): void {
  ctx.save();
  roundRectPath(ctx, x, y, w, h, r);
  ctx.clip();
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, `rgba(${color},${alpha})`);
  g.addColorStop(0.6, `rgba(${color},${alpha * 0.15})`);
  g.addColorStop(1, `rgba(${color},${alpha * 0.15})`);
  ctx.strokeStyle = g;
  // centred on the edge and clipped, so only the inner half shows
  ctx.lineWidth = width * 2;
  roundRectPath(ctx, x, y, w, h, r);
  ctx.stroke();
  ctx.restore();
}

/** The largest font size at which `text` is no wider than `maxWidth`, capped at `maxPx`. */
function fitFont(ctx: Ctx, text: string, maxPx: number, maxWidth: number): number {
  ctx.font = font('display', 700, 100);
  return Math.min(maxPx, (maxWidth * 100) / ctx.measureText(text).width);
}

/** Bold text centred on (cx, cy) by its real ink box, with an optional hard drop one step below. */
function centredText(
  ctx: Ctx,
  text: string,
  cx: number,
  cy: number,
  px: number,
  color: string,
  drop?: { color: string; offset: number },
): void {
  ctx.font = font('display', 700, px);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const m = ctx.measureText(text);
  const y = Math.round(cy + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
  if (drop) {
    ctx.fillStyle = drop.color;
    ctx.fillText(text, cx, y + drop.offset);
  }
  ctx.fillStyle = color;
  ctx.fillText(text, cx, y);
}

/** The body shared by number tiles and the Echo: a lip underneath, a face and a rim light. */
function tileBody(ctx: Ctx, s: number, top: string, bottom: string, lipColor: string): number {
  const r = cornerOf(s);
  const face = s - lipOf(s);
  ctx.fillStyle = lipColor;
  roundRectPath(ctx, 0, 0, s, s, r);
  ctx.fill();
  const g = ctx.createLinearGradient(0, 0, 0, face);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  roundRectPath(ctx, 0, 0, s, face, r);
  ctx.fill();
  rimLight(ctx, 0, 0, s, face, r, Math.max(2, Math.round(s * 0.025)), 0.6);
  return face;
}

// ─── tiles ───

/** Corner sparkles on the top tiles: x, y and radius as fractions of the tile. */
const SPARKLES = [
  [0.19, 0.2, 0.07],
  [0.82, 0.78, 0.055],
  [0.83, 0.2, 0.04],
] as const;

/**
 * A number tile, `s` pixels square. The number is one size up to three digits and only steps down for longer
 * labels. Tiles gain a thin inner frame from 80, corner sparkles from 1280 and a gold face from 5120.
 */
export function drawTile(ctx: Ctx, s: number, level: number, label: string): void {
  const base = tileFill(level);
  const gold = level > FILLS.length;
  const face = gold
    ? tileBody(ctx, s, '#FFE98A', '#F7A41F', '#A85F08')
    : tileBody(ctx, s, shade(base, 0.12), shade(base, -0.04), shade(base, -0.36));
  const ink = tileInk(level);
  if (level >= 5) {
    const inset = Math.round(s * 0.065);
    ctx.lineWidth = Math.max(1.5, s * 0.014);
    ctx.strokeStyle = ink === '#FFFFFF' ? 'rgba(255,255,255,0.32)' : shade(base, -0.22);
    roundRectPath(ctx, inset, inset, s - inset * 2, face - inset * 2, cornerOf(s) - inset * 0.6);
    ctx.stroke();
  }
  if (level >= 9) {
    ctx.fillStyle = '#FFFFFF';
    for (const [x, y, r] of SPARKLES.slice(0, gold ? 3 : 2)) {
      starPath(ctx, s * x, face * y, 4, s * r, s * r * 0.32);
      ctx.fill();
    }
  }
  const px = fitFont(ctx, label, s * 0.44, s * 0.76);
  centredText(
    ctx,
    label,
    s / 2,
    face / 2,
    px,
    ink,
    ink === '#FFFFFF'
      ? { color: shade(base, -0.45), offset: Math.max(1, Math.round(s * 0.022)) }
      : undefined,
  );
}

/** A rainbow ring centred on (cx, cy). */
export function drawRing(ctx: Ctx, cx: number, cy: number, r: number, width: number): void {
  const n = 48;
  ctx.lineWidth = width;
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    ctx.strokeStyle = `hsl(${(i * 360) / n},95%,62%)`;
    ctx.beginPath();
    ctx.arc(cx, cy, r, a - 0.01, a + (Math.PI * 2) / n + 0.01);
    ctx.stroke();
  }
}

/** The Echo wildcard: a dark tile with a rainbow ring around its label. */
export function drawEcho(ctx: Ctx, s: number, label: string): void {
  const face = tileBody(ctx, s, '#30266E', '#1C1548', '#090620');
  drawRing(ctx, s / 2, face / 2, s * 0.31, s * 0.1);
  centredText(ctx, label, s / 2, face / 2, s * 0.25, '#FFFFFF');
}

/** A white tile-shaped flash laid over a tile as it merges. */
export function drawFlash(ctx: Ctx, s: number): void {
  ctx.fillStyle = '#FFFFFF';
  roundRectPath(ctx, 0, 0, s, s - lipOf(s), cornerOf(s));
  ctx.fill();
}

/** A tile-shaped outline that expands from a goal tile; `cell` sets its corner and line weight. */
export function drawShock(ctx: Ctx, s: number, cell: number): void {
  const w = Math.max(3, Math.round(cell * 0.05));
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = w;
  roundRectPath(ctx, w / 2, w / 2, s - w, s - w, cornerOf(cell) * (s / cell));
  ctx.stroke();
}

// ─── tray and HUD ───

/** The tray: dark glass that takes its hue from the backdrop, with one soft shadow, a lip and 16 slots. */
export function drawTray(ctx: Ctx, g: TrayGeo): void {
  const { size, margin: m, cell } = g;
  const r = cornerOf(cell) + g.pad;
  const lip = Math.round(size * 0.014);
  ctx.save();
  ctx.shadowColor = 'rgba(3,2,12,0.6)';
  ctx.shadowBlur = m * 0.4;
  ctx.shadowOffsetY = m * 0.2;
  ctx.fillStyle = '#070516';
  roundRectPath(ctx, m, m + lip, size, size, r);
  ctx.fill();
  ctx.restore();
  // clear the lip and shadow from under the body so the glass stays see-through
  ctx.globalCompositeOperation = 'destination-out';
  roundRectPath(ctx, m, m, size, size, r);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'rgba(15,11,38,0.8)';
  ctx.fill();
  rimLight(ctx, m, m, size, size, r, Math.max(2, Math.round(size * 0.004)), 0.34);
  const cr = cornerOf(cell);
  const edge = Math.max(2, Math.round(cell * 0.03));
  for (let i = 0; i < 16; i++) {
    const o = cellOffset(g, i);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    roundRectPath(ctx, m + o.x, m + o.y, cell, cell, cr);
    ctx.fill();
    rimLight(ctx, m + o.x, m + o.y, cell, cell, cr, edge, 0.5, '2,1,10');
  }
}

/** A HUD card: the same dark glass as the tray. */
export function drawPanel(ctx: Ctx, w: number, h: number, r: number): void {
  ctx.fillStyle = 'rgba(15,11,38,0.7)';
  roundRectPath(ctx, 0, 0, w, h, r);
  ctx.fill();
  rimLight(ctx, 0, 0, w, h, r, 2, 0.26);
}

/** The Undo button face when an undo is available: a solid violet key with a lip. */
export function drawButton(ctx: Ctx, w: number, h: number, r: number): void {
  const lip = Math.max(2, Math.round(h * 0.07));
  ctx.fillStyle = '#3F2DB3';
  roundRectPath(ctx, 0, 0, w, h, r);
  ctx.fill();
  const g = ctx.createLinearGradient(0, 0, 0, h - lip);
  g.addColorStop(0, '#8A75FF');
  g.addColorStop(1, '#6A54F0');
  ctx.fillStyle = g;
  roundRectPath(ctx, 0, 0, w, h - lip, r);
  ctx.fill();
  rimLight(ctx, 0, 0, w, h - lip, r, 2, 0.55);
}

/** A white curved "take back" arrow in an `s` pixel box. */
export function drawUndoIcon(ctx: Ctx, s: number): void {
  const c = s / 2;
  const r = s * 0.3;
  ctx.strokeStyle = '#FFFFFF';
  ctx.fillStyle = '#FFFFFF';
  ctx.lineWidth = s * 0.13;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(c + s * 0.04, c + s * 0.08, r, Math.PI * 1.08, Math.PI * 0.5);
  ctx.stroke();
  const tipX = c + s * 0.04 - r;
  const tipY = c + s * 0.02;
  ctx.beginPath();
  ctx.moveTo(tipX - s * 0.19, tipY - s * 0.1);
  ctx.lineTo(tipX + s * 0.17, tipY - s * 0.19);
  ctx.lineTo(tipX + s * 0.02, tipY + s * 0.17);
  ctx.closePath();
  ctx.fill();
}

/** A round badge for the undo count. */
export function drawBadge(ctx: Ctx, s: number): void {
  ctx.fillStyle = '#FF4FA3';
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2);
  ctx.fill();
}

/** A progress bar: the empty track, or (with colours) the fill, which the scene crops to the progress. */
export function drawBar(ctx: Ctx, w: number, h: number, fill?: readonly string[]): void {
  roundRectPath(ctx, 0, 0, w, h, h / 2);
  if (!fill) {
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fill();
    return;
  }
  const g = ctx.createLinearGradient(0, 0, w, 0);
  fill.forEach((c, i) => g.addColorStop(i / (fill.length - 1), c));
  ctx.fillStyle = g;
  ctx.fill();
}

// ─── backdrop ───

/** The backdrop: a calm vertical gradient with darker corners. Smooth, so it is drawn small and stretched. */
export function drawBackdrop(ctx: Ctx, w: number, h: number, theme: Theme): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  theme.stops.forEach((c, i) => g.addColorStop(i / 2, c));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const v = ctx.createRadialGradient(
    w / 2,
    h / 2,
    Math.min(w, h) * 0.3,
    w / 2,
    h / 2,
    Math.hypot(w, h) / 2,
  );
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
}

/** A soft round light placed behind the tray and tinted with the theme accent. */
export function drawGlow(ctx: Ctx, s: number): void {
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
}

/** A small tile silhouette that drifts in the backdrop: solid, or an outline. */
export function drawMote(ctx: Ctx, s: number, outline: boolean): void {
  const w = Math.max(2, s * 0.12);
  if (outline) {
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = w;
    roundRectPath(ctx, w / 2, w / 2, s - w, s - w, s * 0.26);
    ctx.stroke();
    return;
  }
  ctx.fillStyle = '#FFFFFF';
  roundRectPath(ctx, 0, 0, s, s, s * 0.26);
  ctx.fill();
}
