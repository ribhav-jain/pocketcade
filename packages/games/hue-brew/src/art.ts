// Hue Brew art, drawn with Canvas 2D in design units: the glass bottles, the drink layers with their flavour
// symbols, corks, Pekoe the otter, the helper buttons, the result card and the tea-house walls. Pure drawing; the
// scene turns these into textures.
import { colors, font, prng, rgba, roundRectPath, shade, starPath } from '@pocketcade/toolkit';
import { BOTTLE, BUTTON, PANEL, PEKOE } from './layout.ts';

type Ctx = CanvasRenderingContext2D;

export type Symbol =
  | 'leaf'
  | 'berry'
  | 'star'
  | 'wave'
  | 'moon'
  | 'heart'
  | 'flower'
  | 'diamond'
  | 'ring'
  | 'drop'
  | 'cross'
  | 'bolt';

/**
 * The drinks, for flavours 1..12. Each has its own symbol as well as its own colour, so no layer relies on
 * colour alone. `ink` marks pale drinks whose symbol is drawn dark.
 */
export const DRINKS: readonly { color: string; symbol: Symbol; ink?: true }[] = [
  { color: '#1FB56F', symbol: 'leaf' },
  { color: '#F0405C', symbol: 'berry' },
  { color: '#FFD23F', symbol: 'star', ink: true },
  { color: '#3D8BFF', symbol: 'wave' },
  { color: '#9B5DE5', symbol: 'moon' },
  { color: '#FF8A3D', symbol: 'heart' },
  { color: '#FF86C8', symbol: 'flower' },
  { color: '#3FE0D0', symbol: 'diamond', ink: true },
  { color: '#9A5B34', symbol: 'ring' },
  { color: '#F8ECD6', symbol: 'drop', ink: true },
  { color: '#7888A8', symbol: 'cross' },
  { color: '#BDEE48', symbol: 'bolt', ink: true },
];

export const INK = '#2A1A52';
const GLASS = '#E6F3FF';
const MYSTERY = { fill: '#3D3578', mark: '#C9BFFF' } as const;

// ─── bottle geometry (in the BOTTLE box, origin at its top-left) ───

/** Space around the BOTTLE box inside the glass textures. */
export const GLASS_PAD = 10;
export const GLASS_TEX = { w: BOTTLE.w + GLASS_PAD * 2, h: BOTTLE.h + GLASS_PAD * 2 } as const;
/** Glass thickness: the drink starts this far inside the outline. */
export const WALL = 9;
/** One drink layer: its width, the step between layers, and the texture height (layers overlap by 2). */
export const LAYER = { w: BOTTLE.w - WALL * 2, step: 66, h: 68 } as const;
/** Where a cork sits: its texture and the y of its centre in the BOTTLE box. */
export const CORK = { w: 84, h: 70, y: 0 } as const;

const NECK = { left: 44, right: 106, top: 20, bottom: 78 } as const;
const SHOULDER = 148;
const CORNER = 34;

/** The bottle's outline: a straight neck, round shoulders and a round-cornered body. */
function bottlePath(ctx: Ctx, inset: number): void {
  const l = inset;
  const r = BOTTLE.w - inset;
  const b = BOTTLE.h - inset;
  const c = CORNER - inset;
  const nl = NECK.left + inset;
  const nr = NECK.right - inset;
  ctx.beginPath();
  ctx.moveTo(nl, NECK.top);
  ctx.lineTo(nl, NECK.bottom);
  ctx.bezierCurveTo(nl, NECK.bottom + 36, l, SHOULDER - 40, l, SHOULDER);
  ctx.lineTo(l, b - c);
  ctx.quadraticCurveTo(l, b, l + c, b);
  ctx.lineTo(r - c, b);
  ctx.quadraticCurveTo(r, b, r, b - c);
  ctx.lineTo(r, SHOULDER);
  ctx.bezierCurveTo(r, SHOULDER - 40, nr, NECK.bottom + 36, nr, NECK.bottom);
  ctx.lineTo(nr, NECK.top);
  ctx.closePath();
}

/** A bottle's shadow on the shelf. It stays there when the bottle is lifted. */
export const SHADOW = { w: BOTTLE.w + 12, h: 18 } as const;
export function drawShadow(ctx: Ctx): void {
  ctx.fillStyle = 'rgba(6,3,20,0.4)';
  ctx.beginPath();
  ctx.ellipse(SHADOW.w / 2, SHADOW.h / 2, SHADOW.w / 2, SHADOW.h / 2, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Behind the drink: a faint glass fill. */
export function drawGlassBack(ctx: Ctx): void {
  ctx.translate(GLASS_PAD, GLASS_PAD);
  bottlePath(ctx, 0);
  ctx.fillStyle = 'rgba(150,190,255,0.16)';
  ctx.fill();
}

/** In front of the drink: the glass outline, the lip, one long highlight and a short one. */
export function drawGlassFront(ctx: Ctx): void {
  ctx.translate(GLASS_PAD, GLASS_PAD);
  ctx.lineJoin = 'round';
  bottlePath(ctx, 2.5);
  ctx.lineWidth = 5;
  ctx.strokeStyle = GLASS;
  ctx.stroke();
  // lip
  roundRectPath(ctx, NECK.left - 9, 2, NECK.right - NECK.left + 18, 22, 9);
  ctx.fillStyle = GLASS;
  ctx.fill();
  ctx.fillStyle = 'rgba(60,90,150,0.35)';
  roundRectPath(ctx, NECK.left - 3, 15, NECK.right - NECK.left + 6, 5, 2.5);
  ctx.fill();
  // highlights
  ctx.fillStyle = 'rgba(255,255,255,0.42)';
  roundRectPath(ctx, 17, SHOULDER + 6, 11, BOTTLE.h - SHOULDER - 70, 5.5);
  ctx.fill();
  roundRectPath(ctx, NECK.left + 9, NECK.top + 12, 7, 38, 3.5);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  roundRectPath(ctx, BOTTLE.w - 25, SHOULDER + 40, 7, 90, 3.5);
  ctx.fill();
}

export function drawCork(ctx: Ctx): void {
  const cx = CORK.w / 2;
  ctx.fillStyle = '#8A5A30';
  ctx.beginPath();
  ctx.moveTo(cx - 33, 12);
  ctx.quadraticCurveTo(cx - 33, 2, cx - 23, 2);
  ctx.lineTo(cx + 23, 2);
  ctx.quadraticCurveTo(cx + 33, 2, cx + 33, 12);
  ctx.lineTo(cx + 26, CORK.h - 2);
  ctx.lineTo(cx - 26, CORK.h - 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#E9B578';
  ctx.beginPath();
  ctx.moveTo(cx - 29, 13);
  ctx.quadraticCurveTo(cx - 29, 6, cx - 21, 6);
  ctx.lineTo(cx + 21, 6);
  ctx.quadraticCurveTo(cx + 29, 6, cx + 29, 13);
  ctx.lineTo(cx + 22.5, CORK.h - 5);
  ctx.lineTo(cx - 22.5, CORK.h - 5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#FFD9A3';
  roundRectPath(ctx, cx - 22, 9, 44, 7, 3.5);
  ctx.fill();
  ctx.fillStyle = '#C48A4E';
  for (const [x, y] of [
    [-12, 26],
    [9, 22],
    [-3, 38],
    [14, 40],
    [-15, 48],
  ] as const) {
    ctx.beginPath();
    ctx.arc(cx + x, y, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ─── drink layers ───

export function drawSymbol(ctx: Ctx, symbol: Symbol, cx: number, cy: number, r: number): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  switch (symbol) {
    case 'leaf':
      ctx.moveTo(cx - r, cy + r * 0.7);
      ctx.quadraticCurveTo(cx - r * 0.9, cy - r * 0.9, cx + r, cy - r * 0.75);
      ctx.quadraticCurveTo(cx + r * 0.8, cy + r * 0.95, cx - r, cy + r * 0.7);
      ctx.fill();
      break;
    case 'berry':
      for (const [x, y] of [
        [-0.5, 0.42],
        [0.5, 0.42],
        [0, -0.45],
      ] as const) {
        ctx.moveTo(cx + x * r + r * 0.48, cy + y * r);
        ctx.arc(cx + x * r, cy + y * r, r * 0.48, 0, Math.PI * 2);
      }
      ctx.fill();
      break;
    case 'star':
      starPath(ctx, cx, cy + r * 0.06, 5, r * 1.08, r * 0.48);
      ctx.fill();
      break;
    case 'wave':
      ctx.lineWidth = r * 0.36;
      for (const dy of [-0.42, 0.42]) {
        const y = cy + dy * r;
        ctx.moveTo(cx - r * 1.1, y);
        ctx.bezierCurveTo(cx - r * 0.6, y - r * 0.6, cx - r * 0.3, y + r * 0.6, cx, y);
        ctx.bezierCurveTo(cx + r * 0.3, y - r * 0.6, cx + r * 0.6, y + r * 0.6, cx + r * 1.1, y);
      }
      ctx.stroke();
      break;
    case 'moon':
      ctx.arc(cx, cy, r, Math.PI * 0.32, Math.PI * 1.68);
      ctx.quadraticCurveTo(cx - r * 0.25, cy, cx + r * 0.55, cy + r * 0.85);
      ctx.fill();
      break;
    case 'heart':
      ctx.moveTo(cx, cy + r * 0.95);
      ctx.bezierCurveTo(cx - r * 1.5, cy, cx - r * 0.7, cy - r * 1.15, cx, cy - r * 0.4);
      ctx.bezierCurveTo(cx + r * 0.7, cy - r * 1.15, cx + r * 1.5, cy, cx, cy + r * 0.95);
      ctx.fill();
      break;
    case 'flower':
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
        const x = cx + Math.cos(a) * r * 0.62;
        const y = cy + Math.sin(a) * r * 0.62;
        ctx.moveTo(x + r * 0.42, y);
        ctx.arc(x, y, r * 0.42, 0, Math.PI * 2);
      }
      ctx.fill();
      break;
    case 'diamond':
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r * 0.8, cy);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r * 0.8, cy);
      ctx.closePath();
      ctx.fill();
      break;
    case 'ring':
      ctx.lineWidth = r * 0.42;
      ctx.arc(cx, cy, r * 0.74, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'drop':
      ctx.moveTo(cx, cy - r * 1.05);
      ctx.bezierCurveTo(cx + r * 1.25, cy + r * 0.2, cx + r * 0.6, cy + r, cx, cy + r);
      ctx.bezierCurveTo(cx - r * 0.6, cy + r, cx - r * 1.25, cy + r * 0.2, cx, cy - r * 1.05);
      ctx.fill();
      break;
    case 'cross':
      ctx.lineWidth = r * 0.5;
      ctx.moveTo(cx - r * 0.8, cy);
      ctx.lineTo(cx + r * 0.8, cy);
      ctx.moveTo(cx, cy - r * 0.8);
      ctx.lineTo(cx, cy + r * 0.8);
      ctx.stroke();
      break;
    case 'bolt':
      ctx.moveTo(cx + r * 0.25, cy - r);
      ctx.lineTo(cx - r * 0.7, cy + r * 0.15);
      ctx.lineTo(cx - r * 0.05, cy + r * 0.15);
      ctx.lineTo(cx - r * 0.25, cy + r);
      ctx.lineTo(cx + r * 0.7, cy - r * 0.15);
      ctx.lineTo(cx + r * 0.05, cy - r * 0.15);
      ctx.closePath();
      ctx.fill();
      break;
  }
}

/**
 * One layer of drink (flavour 1..12, or 0 for a mystery layer). The lowest layer in a bottle has round bottom
 * corners to follow the glass.
 */
export function drawLayer(ctx: Ctx, flavour: number, bottom: boolean): void {
  const { w, h } = LAYER;
  const drink = DRINKS[flavour - 1];
  const fill = drink ? drink.color : MYSTERY.fill;
  const c = bottom ? CORNER - WALL : 0;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(w, 0);
  ctx.lineTo(w, h - c);
  ctx.quadraticCurveTo(w, h, w - c, h);
  ctx.lineTo(c, h);
  ctx.quadraticCurveTo(0, h, 0, h - c);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, shade(fill, 0.1));
  g.addColorStop(0.5, fill);
  g.addColorStop(1, shade(fill, -0.14));
  ctx.fillStyle = g;
  ctx.fill();
  // the surface line that separates this layer from the one above
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillRect(0, 0, w, 3);
  const cy = h / 2 + 2;
  if (!drink) {
    ctx.fillStyle = MYSTERY.mark;
    ctx.font = font('display', 700, 44);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', w / 2, cy + 2);
    return;
  }
  const mark = drink.ink ? rgba(INK, 0.62) : 'rgba(255,255,255,0.9)';
  ctx.fillStyle = mark;
  ctx.strokeStyle = mark;
  drawSymbol(ctx, drink.symbol, w / 2, cy, 17);
}

// ─── Pekoe ───

export type Mood = 'wait' | 'pleased' | 'cheer';

const FUR = { coat: '#9A6238', dark: '#6F4526', cream: '#F7E2BF', nose: '#3B2418' } as const;
const APRON = '#7ED957';

/** Pekoe the otter barista, from the chest up, standing behind the counter. */
export function drawPekoe(ctx: Ctx, mood: Mood): void {
  const cx = PEKOE.w / 2;
  const base = PEKOE.h;
  const dot = (x: number, y: number, r: number, fill: string) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  const blob = (x: number, y: number, rx: number, ry: number, fill: string, turn = 0) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, turn, 0, Math.PI * 2);
    ctx.fill();
  };
  // arms up behind the head when cheering
  if (mood === 'cheer') {
    ctx.strokeStyle = FUR.dark;
    ctx.lineWidth = 27;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const side of [-1, 1]) {
      ctx.moveTo(cx + side * 44, 140);
      ctx.quadraticCurveTo(cx + side * 98, 118, cx + side * 94, 32);
    }
    ctx.stroke();
    dot(cx - 94, 28, 17, FUR.coat);
    dot(cx + 94, 28, 17, FUR.coat);
  }
  // body and apron
  ctx.fillStyle = FUR.coat;
  ctx.beginPath();
  ctx.moveTo(cx - 58, base);
  ctx.quadraticCurveTo(cx - 64, 112, cx - 30, 104);
  ctx.lineTo(cx + 30, 104);
  ctx.quadraticCurveTo(cx + 64, 112, cx + 58, base);
  ctx.closePath();
  ctx.fill();
  blob(cx, 132, 34, 22, FUR.cream);
  ctx.fillStyle = APRON;
  roundRectPath(ctx, cx - 36, 142, 72, base - 142 + 20, 14);
  ctx.fill();
  ctx.fillStyle = shade(APRON, -0.3);
  ctx.fillRect(cx - 30, 126, 7, 20);
  ctx.fillRect(cx + 23, 126, 7, 20);
  ctx.fillStyle = '#FFFFFF';
  drawSymbol(ctx, 'leaf', cx, 172, 12);
  // small ears, low on the sides of a broad, flat head
  for (const side of [-1, 1]) {
    dot(cx + side * 66, 52, 12, FUR.dark);
    dot(cx + side * 66, 53, 6, '#E8A07E');
  }
  blob(cx, 72, 72, 50, FUR.coat);
  // pale muzzle and throat
  blob(cx, 96, 52, 30, FUR.cream);
  blob(cx - 20, 88, 27, 20, FUR.cream);
  blob(cx + 20, 88, 27, 20, FUR.cream);
  dot(cx - 52, 92, 8, 'rgba(255,120,140,0.5)');
  dot(cx + 52, 92, 8, 'rgba(255,120,140,0.5)');
  // whiskers
  ctx.lineCap = 'round';
  ctx.strokeStyle = FUR.dark;
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (const side of [-1, 1])
    for (const dy of [-5, 4]) {
      ctx.moveTo(cx + side * 34, 96 + dy * 0.5);
      ctx.lineTo(cx + side * 62, 98 + dy * 1.6);
    }
  ctx.stroke();
  // eyes, wide apart
  ctx.strokeStyle = FUR.nose;
  ctx.lineWidth = 5.5;
  for (const side of [-1, 1]) {
    const ex = cx + side * 34;
    if (mood === 'wait') {
      dot(ex, 62, 7, FUR.nose);
      dot(ex + 2.2, 59.5, 2.6, '#FFFFFF');
    } else {
      ctx.beginPath();
      ctx.arc(ex, 66, 9, Math.PI * 1.12, Math.PI * 1.88);
      ctx.stroke();
    }
  }
  // a broad nose and the mouth
  ctx.fillStyle = FUR.nose;
  ctx.beginPath();
  ctx.moveTo(cx - 17, 76);
  ctx.quadraticCurveTo(cx, 68, cx + 17, 76);
  ctx.quadraticCurveTo(cx + 12, 92, cx, 93);
  ctx.quadraticCurveTo(cx - 12, 92, cx - 17, 76);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.beginPath();
  if (mood === 'cheer') {
    ctx.fillStyle = '#7A2E3A';
    ctx.moveTo(cx - 14, 101);
    ctx.quadraticCurveTo(cx, 124, cx + 14, 101);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.moveTo(cx - 13, 101);
    ctx.quadraticCurveTo(cx - 6, 109, cx, 100);
    ctx.quadraticCurveTo(cx + 6, 109, cx + 13, 101);
    ctx.stroke();
  }
  // paws on the counter (one lifted when pleased)
  if (mood !== 'cheer') {
    blob(cx - 52, base - 9, 20, 13, FUR.dark);
    if (mood === 'pleased') blob(cx + 64, 128, 16, 19, FUR.dark, -0.3);
    else blob(cx + 52, base - 9, 20, 13, FUR.dark);
  }
}

// ─── buttons, stars, card ───

export type ButtonKind = 'undo' | 'restart' | 'hint' | 'bottle';

/** A round helper button with a white glyph. */
export function drawButton(ctx: Ctx, kind: ButtonKind): void {
  // the glyphs are measured on a 116-unit button
  const s = 116;
  const c = s / 2;
  ctx.scale(BUTTON / s, BUTTON / s);
  ctx.fillStyle = 'rgba(6,3,20,0.4)';
  ctx.beginPath();
  ctx.arc(c, c + 4, c - 4, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createLinearGradient(0, 0, 0, s);
  g.addColorStop(0, '#5A49C9');
  g.addColorStop(1, '#34268A');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(c, c - 1, c - 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#9C8CFF';
  ctx.stroke();
  ctx.strokeStyle = '#FFFFFF';
  ctx.fillStyle = '#FFFFFF';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 9;
  const y = c - 1;
  const arrow = (x: number, ay: number, turn: number) => {
    ctx.save();
    ctx.translate(x, ay);
    ctx.rotate(turn);
    ctx.beginPath();
    ctx.moveTo(-15, 0);
    ctx.lineTo(9, -14);
    ctx.lineTo(9, 14);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };
  switch (kind) {
    case 'undo':
      ctx.beginPath();
      ctx.moveTo(c - 14, y - 12);
      ctx.lineTo(c + 8, y - 12);
      ctx.arc(c + 8, y + 5, 17, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(c - 16, y + 22);
      ctx.stroke();
      arrow(c - 20, y - 12, 0);
      break;
    case 'restart':
      ctx.beginPath();
      ctx.arc(c, y, 22, -Math.PI * 0.35, Math.PI * 1.25);
      ctx.stroke();
      arrow(c + 15, y - 21, Math.PI * 1.2);
      break;
    case 'hint':
      ctx.beginPath();
      ctx.arc(c, y - 8, 19, 0, Math.PI * 2);
      ctx.fill();
      roundRectPath(ctx, c - 11, y + 8, 22, 12, 3);
      ctx.fill();
      roundRectPath(ctx, c - 8, y + 23, 16, 6, 3);
      ctx.fill();
      ctx.fillStyle = '#34268A';
      roundRectPath(ctx, c - 3, y - 14, 6, 16, 3);
      ctx.fill();
      break;
    case 'bottle':
      roundRectPath(ctx, c - 24, y - 12, 26, 38, 8);
      ctx.fill();
      roundRectPath(ctx, c - 17, y - 27, 12, 18, 3);
      ctx.fill();
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(c + 12, y - 12);
      ctx.lineTo(c + 30, y - 12);
      ctx.moveTo(c + 21, y - 21);
      ctx.lineTo(c + 21, y - 3);
      ctx.stroke();
      break;
  }
}

export const STAR = 96;

/** A result star: gold when earned, a dark socket when not. */
export function drawStar(ctx: Ctx, earned: boolean): void {
  const c = STAR / 2;
  ctx.lineJoin = 'round';
  starPath(ctx, c, c + 3, 5, c - 7, (c - 7) * 0.5);
  ctx.lineWidth = 8;
  ctx.strokeStyle = earned ? '#B86A00' : '#3A2F7A';
  ctx.stroke();
  const g = ctx.createLinearGradient(0, 0, 0, STAR);
  g.addColorStop(0, earned ? '#FFE98A' : '#2A2160');
  g.addColorStop(1, earned ? colors.gold : '#221A52');
  ctx.fillStyle = g;
  ctx.fill();
  if (!earned) return;
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath();
  ctx.ellipse(c - 10, c - 8, 9, 5, -0.6, 0, Math.PI * 2);
  ctx.fill();
}

export function drawPanel(ctx: Ctx): void {
  const { w, h } = PANEL;
  ctx.fillStyle = 'rgba(6,3,20,0.4)';
  roundRectPath(ctx, 6, 12, w - 12, h - 14, 40);
  ctx.fill();
  roundRectPath(ctx, 4, 4, w - 8, h - 14, 40);
  ctx.fillStyle = rgba(colors.surface, 0.96);
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#8F7EFF';
  ctx.stroke();
}

/** The frame around the bottle the keyboard cursor is on. */
export const CURSOR = { w: BOTTLE.w + 40, h: BOTTLE.h + 44 } as const;
export function drawCursor(ctx: Ctx): void {
  ctx.lineWidth = 7;
  ctx.strokeStyle = '#FFFFFF';
  ctx.setLineDash([26, 16]);
  ctx.lineCap = 'round';
  roundRectPath(ctx, 5, 5, CURSOR.w - 10, CURSOR.h - 10, 44);
  ctx.stroke();
}

/** A soft round glow, used for the drifting lights. */
export function drawGlow(ctx: Ctx, size: number): void {
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
}

// ─── the tea-house wall ───

export const WOOD = { top: '#D9A066', face: '#96603A', under: '#5C3620' } as const;

export interface Theme {
  /** wall gradient, top to bottom */
  stops: readonly string[];
  /** colour of the drifting lights */
  mote: string;
  /** the lights fall like rain instead of drifting */
  rain?: true;
}

/** The wall changes every ten levels: lantern evening, rainy window, dawn, festival lights. */
export const THEMES: readonly Theme[] = [
  { stops: ['#2E1C66', '#1F1350', '#150D36'], mote: '#FFC66B' },
  { stops: ['#173A6A', '#132A55', '#0F1A3C'], mote: '#A8DCFF', rain: true },
  { stops: ['#2C2468', '#5A3478', '#A0526F'], mote: '#FFE2B0' },
  { stops: ['#33146C', '#27105A', '#160A3A'], mote: '#FF9BD8' },
];

export function themeFor(level: number): number {
  return Math.floor((Math.max(1, level) - 1) / 10) % THEMES.length;
}

const CANDY = [colors.pink, colors.gold, colors.sky, colors.lime, colors.purple, colors.orange];

/**
 * Paints a theme's decorations over the wall gradient. The rectangle (x, y, w, h) is the whole area the view can
 * ever show; motifs repeat across it so some are in sight at every frame shape.
 */
export function drawWall(
  ctx: Ctx,
  theme: number,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const rnd = prng(101 + theme * 17);
  const glow = (gx: number, gy: number, r: number, color: string, alpha: number) => {
    const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
    g.addColorStop(0, rgba(color, alpha));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(gx - r, gy - r, r * 2, r * 2);
  };
  // wall boards: wide, barely lighter stripes
  ctx.fillStyle = 'rgba(255,255,255,0.025)';
  for (let bx = x - 40; bx < x + w; bx += 180) ctx.fillRect(bx, y, 90, h);

  if (theme === 0) {
    // strings of paper lanterns
    for (let row = 0, sy = y + 70; sy < y + h; row++, sy += 330) {
      const shift = row % 2 ? 110 : 0;
      ctx.strokeStyle = 'rgba(255,220,170,0.22)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let lx = x - 220 + shift; lx < x + w + 220; lx += 220) {
        ctx.moveTo(lx, sy);
        ctx.quadraticCurveTo(lx + 110, sy + 46, lx + 220, sy);
      }
      ctx.stroke();
      for (let lx = x - 110 + shift; lx < x + w + 110; lx += 220) {
        const ly = sy + 52;
        const warm = rnd() < 0.5 ? '#FF9F1C' : '#FF6F61';
        glow(lx, ly, 120, '#FFB347', 0.2);
        ctx.fillStyle = rgba(warm, 0.62);
        ctx.beginPath();
        ctx.ellipse(lx, ly, 27, 33, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,236,170,0.5)';
        ctx.beginPath();
        ctx.ellipse(lx, ly, 12, 25, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(40,20,60,0.7)';
        ctx.fillRect(lx - 12, ly - 38, 24, 7);
        ctx.fillRect(lx - 12, ly + 31, 24, 7);
      }
    }
  } else if (theme === 1) {
    // a wall of window panes with rain on the glass and street lights beyond
    for (let i = 0; i < 16; i++)
      glow(x + rnd() * w, y + rnd() * h, 70 + rnd() * 90, rnd() < 0.5 ? '#FFC66B' : '#6CD6FF', 0.1);
    ctx.fillStyle = 'rgba(150,200,255,0.06)';
    for (let px = x - 60; px < x + w; px += 250)
      for (let py = y - 40; py < y + h; py += 320) {
        roundRectPath(ctx, px + 12, py + 12, 226, 296, 18);
        ctx.fill();
      }
    ctx.strokeStyle = 'rgba(170,215,255,0.2)';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < 420; i++) {
      const rx = x + rnd() * w;
      const ry = y + rnd() * h;
      const len = 16 + rnd() * 26;
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx - len * 0.22, ry + len);
    }
    ctx.stroke();
  } else if (theme === 2) {
    // the sun coming up behind long clouds, the last stars above
    glow(x + w / 2, y + h, h * 0.75, '#FFB36B', 0.5);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 90; i++) {
      ctx.beginPath();
      ctx.arc(x + rnd() * w, y + rnd() * h * 0.45, 1 + rnd() * 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 26; i++) {
      const cw = 220 + rnd() * 380;
      const cy = y + h * 0.2 + rnd() * h * 0.8;
      ctx.fillStyle = rgba(rnd() < 0.5 ? '#FFD9C2' : '#FF9FB0', 0.1);
      roundRectPath(ctx, x + rnd() * w - cw / 2, cy, cw, 26 + rnd() * 26, 26);
      ctx.fill();
    }
  } else {
    // bunting and festival lights
    for (let i = 0; i < 70; i++)
      glow(x + rnd() * w, y + rnd() * h, 14 + rnd() * 30, CANDY[i % CANDY.length]!, 0.3);
    for (let row = 0, sy = y + 50; sy < y + h; row++, sy += 300) {
      const shift = row % 2 ? 150 : 0;
      for (let lx = x - 300 + shift; lx < x + w + 300; lx += 300) {
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(lx, sy);
        ctx.quadraticCurveTo(lx + 150, sy + 60, lx + 300, sy);
        ctx.stroke();
        for (let k = 0; k < 6; k++) {
          const t = (k + 0.5) / 6;
          const fx = lx + t * 300;
          const fy = sy + 120 * t * (1 - t);
          ctx.fillStyle = rgba(CANDY[(k + row) % CANDY.length]!, 0.6);
          ctx.beginPath();
          ctx.moveTo(fx - 17, fy);
          ctx.lineTo(fx + 17, fy);
          ctx.lineTo(fx, fy + 34);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  }
}
