// Table art (Canvas 2D, drawn once per mount): the felt, its vignette, the wooden rail that carries the HUD, the
// hanging lantern, pile slots (dashed columns, gold-rimmed vaults), the gold nugget, soft glows, a card lift shadow,
// HUD pills and the candy buttons. Pure drawing, no Phaser.
import {
  colors,
  FONT_DISPLAY,
  glossyRect,
  prng,
  rgba,
  roundRectPath,
  shade,
  sprinkle,
} from '@pocketcade/toolkit';
import { ART_H, ART_W } from './layout.ts';

type Ctx = CanvasRenderingContext2D;
const OUT = '#2A1606';

/**
 * Deep green felt over the whole area any view can show (w × h, with the design area's corner at (ox, oy)): a
 * lamp-lit centre, felt speckle and a faint embossed claim seal. Drawn at half scale; it is soft.
 */
export function drawFelt(ctx: Ctx, w: number, h: number, ox: number, oy: number): void {
  const base = ctx.createRadialGradient(w / 2, h / 2 - 80, 60, w / 2, h / 2, Math.max(w, h) * 0.6);
  base.addColorStop(0, '#2C7A4E');
  base.addColorStop(0.55, '#1B5A39');
  base.addColorStop(1, '#0E3322');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  sprinkle(ctx, 0, 0, w, h, Math.round((900 * w * h) / 1e6), '#0A2416', 3, [0.6, 1.4]);
  sprinkle(ctx, 0, 0, w, h, Math.round((500 * w * h) / 1e6), '#4FA372', 9, [0.5, 1.1]);
  const g = ctx.createRadialGradient(w / 2, oy, 0, w / 2, oy, 700);
  g.addColorStop(0, rgba('#FFB347', 0.16));
  g.addColorStop(1, rgba('#FFB347', 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // the claim seal: rings and a gold pan with nuggets, low on the table
  const [ex, ey] = [ox + 500, oy + 800];
  ctx.strokeStyle = 'rgba(8,30,18,0.25)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(ex, ey, 118, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(ex, ey, 102, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(8,30,18,0.2)';
  ctx.beginPath();
  ctx.ellipse(ex, ey + 6, 76, 34, -0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,214,120,0.07)';
  for (const [x, y, r] of [
    [-18, 2, 9],
    [10, 10, 7],
    [26, -2, 5],
  ] as const) {
    ctx.beginPath();
    ctx.arc(ex + x, ey + y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** A dusk vignette in a square; the scene stretches it over the view. */
export function drawVignette(ctx: Ctx, s: number): void {
  const vig = ctx.createRadialGradient(s / 2, s / 2, s * 0.3, s / 2, s / 2, s * 0.72);
  vig.addColorStop(0, 'rgba(10,6,24,0)');
  vig.addColorStop(1, 'rgba(10,6,24,0.55)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, s, s);
}

/** A vertical fade from dark to clear (the rail's shadow on the felt); stretched by the scene. */
export function drawShade(ctx: Ctx, w: number, h: number): void {
  const sh = ctx.createLinearGradient(0, 0, 0, h);
  sh.addColorStop(0, 'rgba(8,4,2,0.55)');
  sh.addColorStop(1, 'rgba(8,4,2,0)');
  ctx.fillStyle = sh;
  ctx.fillRect(0, 0, w, h);
}

/** Wooden planks for the HUD rails; the scene crops it to each bar and adds the brass edge. */
export function drawRail(ctx: Ctx, w: number, h: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#9A5F31');
  g.addColorStop(0.5, '#7D4A24');
  g.addColorStop(1, '#5E3518');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const rnd = prng(17);
  // grain
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 40; i++) {
    const y = 4 + rnd() * (h - 8);
    ctx.strokeStyle = rgba(rnd() > 0.5 ? '#3E2210' : '#B9783F', 0.18 + rnd() * 0.14);
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= w; x += 40) ctx.lineTo(x, y + Math.sin(x / (60 + rnd() * 40) + i) * 2.2);
    ctx.stroke();
  }
  // plank seams, each with a pair of nails
  for (let x = 250; x < w; x += 250 + Math.round(rnd() * 30)) {
    ctx.fillStyle = 'rgba(30,14,4,0.55)';
    ctx.fillRect(x, 0, 2, h);
    for (const nx of [x - 10, x + 12]) {
      ctx.fillStyle = '#3A2010';
      ctx.beginPath();
      ctx.arc(nx, 12, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,220,170,0.45)';
      ctx.beginPath();
      ctx.arc(nx - 0.8, 11.2, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = 'rgba(255,220,170,0.25)';
  ctx.fillRect(0, 0, w, 2);
}

/** The brass strip along a rail's edge (w × 6). */
export function drawBrass(ctx: Ctx, w: number, h: number): void {
  const brass = ctx.createLinearGradient(0, 0, 0, h);
  brass.addColorStop(0, '#FFE08A');
  brass.addColorStop(1, '#B07A1C');
  ctx.fillStyle = brass;
  ctx.fillRect(0, 0, w, h);
}

/** The hanging lantern, in a 40 × 60 box (hook at the top centre). */
export function drawLantern(ctx: Ctx): void {
  lantern(ctx, 20, 8);
}

function lantern(ctx: Ctx, x: number, y: number): void {
  ctx.strokeStyle = '#2A1606';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y - 8);
  ctx.lineTo(x, y + 4);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y + 8, 6, Math.PI, 0);
  ctx.stroke();
  const glass = ctx.createRadialGradient(x, y + 30, 2, x, y + 30, 16);
  glass.addColorStop(0, '#FFF6C8');
  glass.addColorStop(0.6, '#FFC24A');
  glass.addColorStop(1, '#E07B1C');
  ctx.fillStyle = glass;
  roundRectPath(ctx, x - 12, y + 14, 24, 32, 6);
  ctx.fill();
  ctx.strokeStyle = '#3A2010';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y + 14);
  ctx.lineTo(x, y + 46);
  ctx.stroke();
  glossyRect(ctx, x - 16, y + 8, 32, 9, '#C98A2E', {
    radius: 4,
    depth: 2,
    outline: '#3A2010',
    lineWidth: 1.5,
    shadow: false,
  });
  glossyRect(ctx, x - 16, y + 44, 32, 9, '#C98A2E', {
    radius: 4,
    depth: 2,
    outline: '#3A2010',
    lineWidth: 1.5,
    shadow: false,
  });
}

/** Pile slots: 'vault' (gold rim, dial and an A), 'king' (dashed with a K) and 'plain' (dashed). */
export function drawSlot(ctx: Ctx, kind: 'vault' | 'king' | 'plain', w = ART_W, h = ART_H): void {
  ctx.fillStyle = kind === 'vault' ? 'rgba(10,20,14,0.55)' : 'rgba(6,20,12,0.28)';
  roundRectPath(ctx, 2, 2, w - 4, h - 4, 11);
  ctx.fill();
  if (kind !== 'vault') {
    ctx.strokeStyle = 'rgba(255,244,220,0.42)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([10, 8]);
    roundRectPath(ctx, 3, 3, w - 6, h - 6, 11);
    ctx.stroke();
    ctx.setLineDash([]);
    if (kind === 'king') label(ctx, 'K', w, h, 'rgba(255,244,220,0.28)');
    return;
  }
  // inner shadow
  const ins = ctx.createLinearGradient(0, 0, 0, 24);
  ins.addColorStop(0, 'rgba(0,0,0,0.45)');
  ins.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = ins;
  roundRectPath(ctx, 4, 4, w - 8, 24, 10);
  ctx.fill();
  const gold = ctx.createLinearGradient(0, 0, 0, h);
  gold.addColorStop(0, '#FFE58F');
  gold.addColorStop(0.5, '#E9B23A');
  gold.addColorStop(1, '#A8701A');
  ctx.strokeStyle = gold;
  ctx.lineWidth = 4;
  roundRectPath(ctx, 3, 3, w - 6, h - 6, 11);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(42,22,6,0.6)';
  ctx.lineWidth = 1;
  roundRectPath(ctx, 6, 6, w - 12, h - 12, 9);
  ctx.stroke();
  // vault dial
  const [cx, cy] = [w / 2, h / 2];
  ctx.strokeStyle = 'rgba(233,178,58,0.38)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, 38, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 2;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 30, cy + Math.sin(a) * 30);
    ctx.lineTo(cx + Math.cos(a) * 38, cy + Math.sin(a) * 38);
    ctx.stroke();
  }
  for (const [x, y] of [
    [14, 14],
    [w - 14, 14],
    [14, h - 14],
    [w - 14, h - 14],
  ] as const) {
    ctx.fillStyle = '#E9B23A';
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  label(ctx, 'A', w, h, 'rgba(255,214,120,0.6)');
}

function label(ctx: Ctx, s: string, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.font = `700 44px ${FONT_DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(s, w / 2, h / 2 + 2);
}

/** A soft additive glow ring around a card-sized rect (vault glow). */
export function drawCardGlow(ctx: Ctx, w: number): void {
  const pad = (w - ART_W) / 2;
  for (let i = 0; i < 14; i++) {
    ctx.strokeStyle = `rgba(255,255,255,${0.09 * (1 - i / 14)})`;
    ctx.lineWidth = 3;
    roundRectPath(
      ctx,
      pad - i * 1.6,
      pad - i * 1.6,
      ART_W + i * 3.2,
      ART_H + i * 3.2,
      12 + i * 1.6,
    );
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  roundRectPath(ctx, pad, pad, ART_W, ART_H, 12);
  ctx.fill();
}

/** Soft card lift shadow. */
export function drawShadow(ctx: Ctx, w: number, h: number): void {
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = 'rgba(4,8,4,0.1)';
    roundRectPath(ctx, i * 2, i * 2, w - i * 4, h - i * 4, 18 - i);
    ctx.fill();
  }
}

/** A gold nugget, one of three lumpy shapes. */
export function drawNugget(ctx: Ctx, w: number, h: number, variant: number): void {
  const pts = [
    [0.1, 0.55, 0.25, 0.15, 0.62, 0.08, 0.92, 0.35, 0.86, 0.8, 0.45, 0.92],
    [0.08, 0.4, 0.4, 0.1, 0.8, 0.2, 0.94, 0.62, 0.6, 0.94, 0.2, 0.82],
    [0.15, 0.25, 0.55, 0.06, 0.9, 0.3, 0.8, 0.78, 0.4, 0.95, 0.06, 0.7],
  ][variant % 3]!;
  ctx.beginPath();
  for (let i = 0; i < pts.length; i += 2) {
    const [x, y] = [pts[i]! * w, pts[i + 1]! * h];
    const [nx, ny] = [pts[(i + 2) % pts.length]! * w, pts[(i + 3) % pts.length]! * h];
    if (!i) ctx.moveTo((x + nx) / 2, (y + ny) / 2);
    else ctx.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
  }
  ctx.quadraticCurveTo(
    pts[0]! * w,
    pts[1]! * h,
    ((pts[0]! + pts[2]!) / 2) * w,
    ((pts[1]! + pts[3]!) / 2) * h,
  );
  ctx.closePath();
  const g = ctx.createRadialGradient(w * 0.35, h * 0.3, 1, w * 0.5, h * 0.5, w * 0.6);
  g.addColorStop(0, '#FFF3B0');
  g.addColorStop(0.45, colors.gold);
  g.addColorStop(1, '#B9741A');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = OUT;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.arc(w * 0.36, h * 0.32, w * 0.08, 0, Math.PI * 2);
  ctx.fill();
}

export function drawSoftGlow(ctx: Ctx, s: number): void {
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
}

/** The HUD pill: dark glass with a soft top highlight. */
export function drawPill(ctx: Ctx, w: number, h: number): void {
  roundRectPath(ctx, 1, 1, w - 2, h - 2, h / 2);
  ctx.fillStyle = rgba('#1A0F06', 0.62);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,236,190,0.2)';
  ctx.stroke();
  const g = ctx.createLinearGradient(0, 0, 0, h * 0.5);
  g.addColorStop(0, 'rgba(255,255,255,0.10)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  roundRectPath(ctx, 3, 3, w - 6, h * 0.48, h / 2.4);
  ctx.fill();
}

/** Candy button face (ink label drawn by the scene). */
export function drawButton(ctx: Ctx, w: number, h: number, base: string): void {
  glossyRect(ctx, 0, 0, w, h, base, {
    radius: 16,
    depth: 6,
    outline: shade(base, -0.6),
    lineWidth: 2.5,
  });
}
