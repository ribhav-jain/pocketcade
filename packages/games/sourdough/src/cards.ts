// Card art, drawn once per mount with Canvas 2D in a 128 × 179 box (the scene scales it to the texture size). Big
// rank + suit index in two corners, custom suit pips (paths, not font glyphs), and original frontier portraits on
// the court cards: J a young miner, Q a lantern keeper, K an old prospector. Hearts and diamonds in a warm red,
// spades and clubs in deep navy, so red and black differ in lightness as well as hue.
import { FONT_DISPLAY, roundRectPath } from '@pocketcade/toolkit';
import { rankOf, suitOf } from './klondike.ts';
import { ART_H, ART_W } from './layout.ts';

type Ctx = CanvasRenderingContext2D;

const RED = '#C8302C';
const BLACK = '#1F2550';
const INK = '#2A1A10';
const GOLD = '#E9B23A';
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;

/** Pip centres for 2–10 as fractions of the pip box (x, y). */
const L = 0.12;
const R = 0.88;
const C = 0.5;
const PIPS: Record<number, ReadonlyArray<readonly [number, number]>> = {
  2: [
    [C, 0.08],
    [C, 0.92],
  ],
  3: [
    [C, 0.08],
    [C, 0.5],
    [C, 0.92],
  ],
  4: [
    [L, 0.08],
    [R, 0.08],
    [L, 0.92],
    [R, 0.92],
  ],
  5: [
    [L, 0.08],
    [R, 0.08],
    [C, 0.5],
    [L, 0.92],
    [R, 0.92],
  ],
  6: [
    [L, 0.08],
    [R, 0.08],
    [L, 0.5],
    [R, 0.5],
    [L, 0.92],
    [R, 0.92],
  ],
  7: [
    [L, 0.08],
    [R, 0.08],
    [C, 0.29],
    [L, 0.5],
    [R, 0.5],
    [L, 0.92],
    [R, 0.92],
  ],
  8: [
    [L, 0.08],
    [R, 0.08],
    [C, 0.29],
    [L, 0.5],
    [R, 0.5],
    [C, 0.71],
    [L, 0.92],
    [R, 0.92],
  ],
  9: [
    [L, 0.08],
    [R, 0.08],
    [L, 0.36],
    [R, 0.36],
    [C, 0.5],
    [L, 0.64],
    [R, 0.64],
    [L, 0.92],
    [R, 0.92],
  ],
  10: [
    [L, 0.08],
    [R, 0.08],
    [C, 0.22],
    [L, 0.36],
    [R, 0.36],
    [L, 0.64],
    [R, 0.64],
    [C, 0.78],
    [L, 0.92],
    [R, 0.92],
  ],
};

/** Adds a suit path (0 ♠, 1 ♥, 2 ♦, 3 ♣) of height s centred on (cx, cy). */
function suitPath(ctx: Ctx, suit: number, cx: number, cy: number, s: number): void {
  ctx.beginPath();
  const heart = (x: number, y: number, k: number, dir: 1 | -1) => {
    // dir 1: point down (heart); -1: point up (spade body)
    const py = (v: number) => y + v * k * dir;
    ctx.moveTo(x, py(0.46));
    ctx.bezierCurveTo(x - k * 0.18, py(0.3), x - k * 0.52, py(0.1), x - k * 0.52, py(-0.16));
    ctx.bezierCurveTo(x - k * 0.52, py(-0.44), x - k * 0.14, py(-0.52), x, py(-0.26));
    ctx.bezierCurveTo(x + k * 0.14, py(-0.52), x + k * 0.52, py(-0.44), x + k * 0.52, py(-0.16));
    ctx.bezierCurveTo(x + k * 0.52, py(0.1), x + k * 0.18, py(0.3), x, py(0.46));
    ctx.closePath();
  };
  const stem = (x: number, y: number, k: number) => {
    ctx.moveTo(x, y + k * 0.06);
    ctx.quadraticCurveTo(x - k * 0.04, y + k * 0.36, x - k * 0.2, y + k * 0.5);
    ctx.lineTo(x + k * 0.2, y + k * 0.5);
    ctx.quadraticCurveTo(x + k * 0.04, y + k * 0.36, x, y + k * 0.06);
    ctx.closePath();
  };
  if (suit === 1) heart(cx, cy, s, 1);
  else if (suit === 0) {
    heart(cx, cy - s * 0.08, s * 0.92, -1);
    stem(cx, cy, s);
  } else if (suit === 2) {
    ctx.moveTo(cx, cy - s * 0.5);
    ctx.quadraticCurveTo(cx + s * 0.12, cy - s * 0.14, cx + s * 0.4, cy);
    ctx.quadraticCurveTo(cx + s * 0.12, cy + s * 0.14, cx, cy + s * 0.5);
    ctx.quadraticCurveTo(cx - s * 0.12, cy + s * 0.14, cx - s * 0.4, cy);
    ctx.quadraticCurveTo(cx - s * 0.12, cy - s * 0.14, cx, cy - s * 0.5);
    ctx.closePath();
  } else {
    const r = s * 0.21;
    for (const [x, y] of [
      [cx, cy - s * 0.24],
      [cx - s * 0.24, cy + s * 0.06],
      [cx + s * 0.24, cy + s * 0.06],
    ] as const) {
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.moveTo(cx + s * 0.1, cy);
    ctx.arc(cx, cy, s * 0.1, 0, Math.PI * 2);
    stem(cx, cy, s);
  }
}

const suitColor = (suit: number) => (suit === 1 || suit === 2 ? RED : BLACK);

function pip(ctx: Ctx, suit: number, cx: number, cy: number, s: number, flip = false): void {
  ctx.save();
  if (flip) {
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI);
    ctx.translate(-cx, -cy);
  }
  suitPath(ctx, suit, cx, cy, s);
  ctx.fillStyle = suitColor(suit);
  ctx.fill();
  ctx.restore();
}

function paper(ctx: Ctx, w: number, h: number): void {
  const r = 10;
  ctx.fillStyle = 'rgba(40,24,8,0.45)';
  roundRectPath(ctx, 0.5, 2, w - 1, h - 2, r);
  ctx.fill();
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#FFFCF4');
  g.addColorStop(1, '#F5E9D2');
  ctx.fillStyle = g;
  roundRectPath(ctx, 0.5, 0.5, w - 1, h - 2.5, r);
  ctx.fill();
  ctx.strokeStyle = 'rgba(70,45,15,0.4)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function index(ctx: Ctx, rank: number, suit: number, w: number, h: number, flip: boolean): void {
  ctx.save();
  if (flip) {
    ctx.translate(w, h - 2);
    ctx.rotate(Math.PI);
  }
  ctx.fillStyle = suitColor(suit);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.font = `700 ${rank === 10 ? 33 : 37}px ${FONT_DISPLAY}`;
  ctx.fillText(RANKS[rank - 1]!, rank === 10 ? 5 : 8, 37);
  pip(ctx, suit, w - 22, 22, 25);
  ctx.restore();
}

export function drawFace(ctx: Ctx, card: number, w = ART_W, h = ART_H): void {
  const suit = suitOf(card);
  const rank = rankOf(card);
  paper(ctx, w, h);
  index(ctx, rank, suit, w, h, false);
  if (rank === 1) ace(ctx, suit, w, h);
  else if (rank <= 10) {
    const box = { x: 28, y: 52, w: w - 56, h: h - 104 };
    for (const [fx, fy] of PIPS[rank]!)
      pip(ctx, suit, box.x + fx * box.w, box.y + fy * box.h, 22, fy > 0.55);
  } else portrait(ctx, rank, suit, w, h);
  // the mirrored corner index sits on top of any art
  index(ctx, rank, suit, w, h, true);
}

function ace(ctx: Ctx, suit: number, w: number, h: number): void {
  const [cx, cy] = [w / 2, h / 2 + 2];
  const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, 44);
  g.addColorStop(0, 'rgba(255,214,120,0.55)');
  g.addColorStop(1, 'rgba(255,214,120,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, 44, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, 38, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 3]);
  ctx.beginPath();
  ctx.arc(cx, cy, 33, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  pip(ctx, suit, cx, cy, 48);
}

// ─── court portraits ───
const SKIN = '#F2C49B';
const outline = (ctx: Ctx, lw = 2) => {
  ctx.lineWidth = lw;
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
};
const fillOut = (ctx: Ctx, color: string, lw = 2) => {
  ctx.fillStyle = color;
  ctx.fill();
  outline(ctx, lw);
};

function portrait(ctx: Ctx, rank: number, suit: number, w: number, h: number): void {
  const f = { x: 13, y: 46, w: w - 26, h: h - 84 };
  const cloth = suitColor(suit);
  ctx.save();
  roundRectPath(ctx, f.x, f.y, f.w, f.h, 12);
  ctx.clip();
  // dusk sky, a sun and the hills behind the claim
  const sky = ctx.createLinearGradient(0, f.y, 0, f.y + f.h);
  sky.addColorStop(0, '#FFD08A');
  sky.addColorStop(0.55, '#F08A5D');
  sky.addColorStop(1, '#7A4A86');
  ctx.fillStyle = sky;
  ctx.fillRect(f.x, f.y, f.w, f.h);
  ctx.fillStyle = 'rgba(255,240,200,0.7)';
  ctx.beginPath();
  ctx.arc(f.x + f.w * 0.78, f.y + 22, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5B3A72';
  ctx.beginPath();
  ctx.moveTo(f.x, f.y + f.h * 0.62);
  ctx.lineTo(f.x + f.w * 0.22, f.y + f.h * 0.42);
  ctx.lineTo(f.x + f.w * 0.42, f.y + f.h * 0.6);
  ctx.lineTo(f.x + f.w * 0.7, f.y + f.h * 0.38);
  ctx.lineTo(f.x + f.w, f.y + f.h * 0.56);
  ctx.lineTo(f.x + f.w, f.y + f.h);
  ctx.lineTo(f.x, f.y + f.h);
  ctx.closePath();
  ctx.fill();
  const cx = w / 2;
  const hy = f.y + f.h * 0.5; // head centre
  // shoulders in the suit colour, with a gold badge showing the suit
  ctx.beginPath();
  ctx.moveTo(cx - 44, f.y + f.h + 4);
  ctx.quadraticCurveTo(cx - 40, hy + 26, cx, hy + 24);
  ctx.quadraticCurveTo(cx + 40, hy + 26, cx + 44, f.y + f.h + 4);
  ctx.closePath();
  fillOut(ctx, cloth);
  ctx.beginPath();
  ctx.arc(cx + 22, hy + 40, 8, 0, Math.PI * 2);
  fillOut(ctx, GOLD, 1.5);
  suitPath(ctx, suit, cx + 22, hy + 40, 10);
  ctx.fillStyle = cloth;
  ctx.fill();
  if (rank === 11) miner(ctx, cx, hy, cloth);
  else if (rank === 12) keeper(ctx, cx, hy, f);
  else prospector(ctx, cx, hy);
  ctx.restore();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2.5;
  roundRectPath(ctx, f.x, f.y, f.w, f.h, 12);
  ctx.stroke();
}

function face(ctx: Ctx, cx: number, hy: number, smile: 'grin' | 'soft' | 'none'): void {
  ctx.beginPath();
  ctx.arc(cx, hy, 19, 0, Math.PI * 2);
  fillOut(ctx, SKIN);
  ctx.fillStyle = INK;
  for (const dx of [-7, 7]) {
    ctx.beginPath();
    ctx.ellipse(cx + dx, hy - 2, 2.2, 2.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(232,110,110,0.55)';
  for (const dx of [-12, 12]) {
    ctx.beginPath();
    ctx.arc(cx + dx, hy + 5, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  if (smile === 'none') return;
  ctx.beginPath();
  if (smile === 'grin') {
    ctx.moveTo(cx - 7, hy + 7);
    ctx.quadraticCurveTo(cx, hy + 15, cx + 7, hy + 7);
    ctx.closePath();
    fillOut(ctx, '#FFFFFF', 1.5);
  } else {
    ctx.moveTo(cx - 5, hy + 8);
    ctx.quadraticCurveTo(cx, hy + 12, cx + 5, hy + 8);
    outline(ctx, 1.8);
  }
}

/** J: a young miner with a headlamp helmet, freckles and a pickaxe on his shoulder. */
function miner(ctx: Ctx, cx: number, hy: number, cloth: string): void {
  // pickaxe behind the shoulder
  ctx.beginPath();
  ctx.moveTo(cx - 34, hy + 44);
  ctx.lineTo(cx - 20, hy - 8);
  outline(ctx, 7);
  ctx.strokeStyle = '#A0662E';
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - 40, hy - 2);
  ctx.quadraticCurveTo(cx - 22, hy - 18, cx - 2, hy - 12);
  ctx.quadraticCurveTo(cx - 22, hy - 12, cx - 38, hy + 4);
  ctx.closePath();
  fillOut(ctx, '#C9CED8', 1.8);
  face(ctx, cx, hy, 'grin');
  ctx.fillStyle = 'rgba(160,90,40,0.6)';
  for (const [x, y] of [
    [-10, 2],
    [-13, 5],
    [10, 2],
    [13, 5],
  ] as const) {
    ctx.beginPath();
    ctx.arc(cx + x, hy + y, 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
  // bandana knot
  ctx.beginPath();
  ctx.moveTo(cx - 14, hy + 18);
  ctx.lineTo(cx + 14, hy + 18);
  ctx.lineTo(cx, hy + 32);
  ctx.closePath();
  fillOut(ctx, cloth, 1.8);
  // helmet with headlamp and its beam
  ctx.beginPath();
  ctx.arc(cx, hy - 4, 21, Math.PI, 0);
  ctx.closePath();
  fillOut(ctx, '#F2A93B');
  ctx.beginPath();
  roundRectPath(ctx, cx - 26, hy - 6, 52, 6, 3);
  fillOut(ctx, '#D9822B', 1.8);
  const beam = ctx.createLinearGradient(cx, hy - 16, cx, hy - 50);
  beam.addColorStop(0, 'rgba(255,248,200,0.8)');
  beam.addColorStop(1, 'rgba(255,248,200,0)');
  ctx.fillStyle = beam;
  ctx.beginPath();
  ctx.moveTo(cx - 5, hy - 16);
  ctx.lineTo(cx - 18, hy - 54);
  ctx.lineTo(cx + 18, hy - 54);
  ctx.lineTo(cx + 5, hy - 16);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, hy - 15, 6, 0, Math.PI * 2);
  fillOut(ctx, '#FFF4B8', 1.8);
}

/** Q: the lantern keeper, auburn curls with a gold flower, lantern aglow at her side. */
function keeper(
  ctx: Ctx,
  cx: number,
  hy: number,
  f: { x: number; y: number; w: number; h: number },
): void {
  // hair volume behind the head
  ctx.beginPath();
  for (const [x, y, r] of [
    [-18, -4, 12],
    [18, -4, 12],
    [-16, 12, 10],
    [16, 12, 10],
    [0, -16, 16],
  ] as const) {
    ctx.moveTo(cx + x + r, hy + y);
    ctx.arc(cx + x, hy + y, r, 0, Math.PI * 2);
  }
  fillOut(ctx, '#B4532A');
  // lace collar
  ctx.beginPath();
  ctx.moveTo(cx - 16, hy + 20);
  ctx.quadraticCurveTo(cx, hy + 32, cx + 16, hy + 20);
  ctx.lineTo(cx + 10, hy + 18);
  ctx.lineTo(cx - 10, hy + 18);
  ctx.closePath();
  fillOut(ctx, '#FFF6EA', 1.5);
  face(ctx, cx, hy + 2, 'soft');
  // lashes and fringe
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.4;
  for (const dx of [-7, 7]) {
    ctx.beginPath();
    ctx.moveTo(cx + dx - 3, hy - 3);
    ctx.lineTo(cx + dx - 5, hy - 5);
    ctx.moveTo(cx + dx + 3, hy - 3);
    ctx.lineTo(cx + dx + 5, hy - 5);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(cx - 19, hy - 2);
  ctx.quadraticCurveTo(cx - 12, hy - 22, cx + 4, hy - 16);
  ctx.quadraticCurveTo(cx + 14, hy - 22, cx + 19, hy - 2);
  ctx.quadraticCurveTo(cx + 12, hy - 12, cx, hy - 10);
  ctx.quadraticCurveTo(cx - 12, hy - 12, cx - 19, hy - 2);
  fillOut(ctx, '#B4532A', 1.6);
  // flower and earrings
  ctx.fillStyle = GOLD;
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx + 16 + Math.cos(a) * 4, hy - 16 + Math.sin(a) * 4, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#FFF4B8';
  ctx.beginPath();
  ctx.arc(cx + 16, hy - 16, 2, 0, Math.PI * 2);
  ctx.fill();
  for (const dx of [-19, 19]) {
    ctx.beginPath();
    ctx.arc(cx + dx, hy + 9, 2.2, 0, Math.PI * 2);
    fillOut(ctx, GOLD, 1);
  }
  // lantern
  const lx = f.x + 16;
  const ly = f.y + f.h - 22;
  const glow = ctx.createRadialGradient(lx, ly, 2, lx, ly, 26);
  glow.addColorStop(0, 'rgba(255,220,120,0.9)');
  glow.addColorStop(1, 'rgba(255,220,120,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(lx - 26, ly - 26, 52, 52);
  ctx.beginPath();
  ctx.arc(lx, ly - 15, 4, Math.PI, 0);
  outline(ctx, 1.6);
  ctx.beginPath();
  roundRectPath(ctx, lx - 7, ly - 11, 14, 20, 4);
  fillOut(ctx, '#FFE07A', 1.6);
  ctx.beginPath();
  roundRectPath(ctx, lx - 9, ly - 13, 18, 4, 2);
  fillOut(ctx, '#7A4A26', 1.4);
  ctx.beginPath();
  roundRectPath(ctx, lx - 9, ly + 8, 18, 4, 2);
  fillOut(ctx, '#7A4A26', 1.4);
}

/** K: the old prospector, big white beard, wide hat with a gold crown band. */
function prospector(ctx: Ctx, cx: number, hy: number): void {
  face(ctx, cx, hy, 'none');
  // bushy brows
  ctx.fillStyle = '#E9E3D6';
  for (const dx of [-8, 8]) {
    ctx.beginPath();
    ctx.ellipse(cx + dx, hy - 7, 6, 2.6, dx < 0 ? 0.2 : -0.2, 0, Math.PI * 2);
    ctx.fill();
    outline(ctx, 1.2);
  }
  // beard and moustache
  ctx.beginPath();
  ctx.moveTo(cx - 19, hy + 2);
  ctx.quadraticCurveTo(cx - 22, hy + 22, cx - 10, hy + 32);
  ctx.quadraticCurveTo(cx - 4, hy + 40, cx, hy + 36);
  ctx.quadraticCurveTo(cx + 4, hy + 40, cx + 10, hy + 32);
  ctx.quadraticCurveTo(cx + 22, hy + 22, cx + 19, hy + 2);
  ctx.quadraticCurveTo(cx + 10, hy + 12, cx, hy + 10);
  ctx.quadraticCurveTo(cx - 10, hy + 12, cx - 19, hy + 2);
  fillOut(ctx, '#F1ECE1');
  ctx.beginPath();
  ctx.moveTo(cx, hy + 6);
  ctx.quadraticCurveTo(cx - 10, hy + 4, cx - 14, hy + 11);
  ctx.quadraticCurveTo(cx - 6, hy + 13, cx, hy + 9);
  ctx.quadraticCurveTo(cx + 6, hy + 13, cx + 14, hy + 11);
  ctx.quadraticCurveTo(cx + 10, hy + 4, cx, hy + 6);
  fillOut(ctx, '#DCD4C2', 1.4);
  ctx.beginPath();
  ctx.arc(cx, hy + 3, 4.5, 0, Math.PI * 2);
  fillOut(ctx, '#E89A78', 1.4);
  // hat: brim, crown, gold band with a little crown
  ctx.beginPath();
  ctx.ellipse(cx, hy - 14, 34, 7, 0, 0, Math.PI * 2);
  fillOut(ctx, '#7A4A26');
  ctx.beginPath();
  ctx.moveTo(cx - 18, hy - 15);
  ctx.lineTo(cx - 16, hy - 38);
  ctx.quadraticCurveTo(cx, hy - 32, cx + 16, hy - 38);
  ctx.lineTo(cx + 18, hy - 15);
  ctx.closePath();
  fillOut(ctx, '#8E5A2E');
  ctx.beginPath();
  roundRectPath(ctx, cx - 18, hy - 24, 36, 7, 2);
  fillOut(ctx, GOLD, 1.5);
  ctx.beginPath();
  ctx.moveTo(cx - 6, hy - 22);
  ctx.lineTo(cx - 6, hy - 30);
  ctx.lineTo(cx - 3, hy - 26);
  ctx.lineTo(cx, hy - 31);
  ctx.lineTo(cx + 3, hy - 26);
  ctx.lineTo(cx + 6, hy - 30);
  ctx.lineTo(cx + 6, hy - 22);
  ctx.closePath();
  fillOut(ctx, '#FFD866', 1.3);
}

// ─── back ───
/** Navy and gold, with a gold pan and pickaxe medallion. */
export function drawBack(ctx: Ctx, w = ART_W, h = ART_H): void {
  ctx.fillStyle = 'rgba(10,8,30,0.5)';
  roundRectPath(ctx, 0.5, 2, w - 1, h - 2, 10);
  ctx.fill();
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#2A3C88');
  g.addColorStop(1, '#16205A');
  ctx.fillStyle = g;
  roundRectPath(ctx, 0.5, 0.5, w - 1, h - 2.5, 10);
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = 'rgba(120,150,255,0.16)';
  ctx.lineWidth = 1.5;
  for (let d = -h; d < w + h; d += 12) {
    ctx.beginPath();
    ctx.moveTo(d, 0);
    ctx.lineTo(d + h, h);
    ctx.moveTo(d + h, 0);
    ctx.lineTo(d, h);
    ctx.stroke();
  }
  const sheen = ctx.createLinearGradient(0, 0, w, h * 0.6);
  sheen.addColorStop(0, 'rgba(255,255,255,0.18)');
  sheen.addColorStop(0.5, 'rgba(255,255,255,0.02)');
  sheen.addColorStop(0.51, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
  const gold = ctx.createLinearGradient(0, 0, 0, h);
  gold.addColorStop(0, '#FFE08A');
  gold.addColorStop(1, '#C98A1E');
  ctx.strokeStyle = gold;
  ctx.lineWidth = 3;
  roundRectPath(ctx, 7, 7, w - 14, h - 16, 7);
  ctx.stroke();
  ctx.lineWidth = 1;
  roundRectPath(ctx, 12, 12, w - 24, h - 26, 5);
  ctx.stroke();
  for (const [x, y] of [
    [20, 20],
    [w - 20, 20],
    [20, h - 22],
    [w - 20, h - 22],
  ] as const) {
    suitPath(ctx, 2, x, y, 10);
    ctx.fillStyle = gold;
    ctx.fill();
  }
  // medallion: gold pan with nuggets, pickaxe across it
  const [cx, cy] = [w / 2, h / 2 - 1];
  ctx.beginPath();
  ctx.arc(cx, cy, 34, 0, Math.PI * 2);
  ctx.fillStyle = '#121A4A';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = gold;
  ctx.stroke();
  ctx.save();
  ctx.translate(cx, cy + 4);
  ctx.rotate(-0.25);
  ctx.beginPath();
  ctx.ellipse(0, 0, 22, 11, 0, 0, Math.PI * 2);
  ctx.fillStyle = gold;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, -1, 15, 6.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#9C6A16';
  ctx.fill();
  ctx.fillStyle = '#FFE58F';
  for (const [x, y, r] of [
    [-5, -1, 3],
    [3, 0, 2.4],
    [8, -2, 1.8],
  ] as const) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#B9873E';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(cx - 20, cy + 22);
  ctx.lineTo(cx + 14, cy - 18);
  ctx.stroke();
  // pick head, square to the handle at its top end
  const [hx, hy] = [cx + 14, cy - 18];
  const [dx, dy, nx, ny] = [0.648, -0.762, 0.762, 0.648];
  ctx.beginPath();
  ctx.moveTo(hx + nx * 22, hy + ny * 22);
  ctx.quadraticCurveTo(hx + dx * 17, hy + dy * 17, hx - nx * 22, hy - ny * 22);
  ctx.quadraticCurveTo(hx + dx * 4, hy + dy * 4, hx + nx * 22, hy + ny * 22);
  ctx.closePath();
  ctx.fillStyle = '#DDE3EE';
  ctx.fill();
  ctx.strokeStyle = gold;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}
