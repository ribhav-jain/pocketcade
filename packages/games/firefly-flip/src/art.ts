// Firefly Flip art (Canvas 2D, drawn once into textures by scene.ts): the moonlit meadow, Lumi the firefly,
// glass-jar cards with glowing glyphs, and the four song lanterns. Decoration only, no game state.
import {
  colors,
  glossyCircle,
  glossyRect,
  prng,
  rgba,
  roundRectPath,
  shade,
} from '@pocketcade/toolkit';

type Ctx = CanvasRenderingContext2D;
export type Mood = 'idle' | 'happy' | 'sad';

export const INK = '#140E36';
/** Glyph colour by motif index mod 6 (shape and mark still tell motifs apart without colour). */
const GLYPH_COLORS = [
  colors.orange,
  colors.sky,
  colors.green,
  colors.blue,
  colors.vermillion,
  colors.purple,
];
/** Lantern i: colour and silhouette (circle, square, triangle, hexagon). */
export const LANTERN_COLORS = [colors.orange, colors.sky, colors.green, colors.purple];
const LUMI_BODY = '#8C78FF';

function circle(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

function poly(ctx: Ctx, cx: number, cy: number, r: number, n: number, rot: number): void {
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = rot + (2 * Math.PI * i) / n;
    ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  ctx.closePath();
}

/** Canvas shadow blur ignores the transform; scale it so textures look the same at every render scale. */
const blur = (ctx: Ctx, px: number) => px * ctx.getTransform().a;

function glowDot(ctx: Ctx, x: number, y: number, r: number, color: string): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
  g.addColorStop(0, rgba(color, 0.6));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
  const c = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
  c.addColorStop(0, '#FFFFFF');
  c.addColorStop(1, color);
  ctx.fillStyle = c;
  circle(ctx, x, y, r);
  ctx.fill();
}

// ─── meadow backdrop (drawn over the sky gradient, glows and stars) ───

/** A hill silhouette from x0 to x1, filled down to `bottom`. */
function ridge(
  ctx: Ctx,
  x0: number,
  x1: number,
  bottom: number,
  base: number,
  amp: number,
  color: string,
  phase: number,
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x0, bottom);
  for (let x = x0; x <= x1 + 8; x += 8)
    ctx.lineTo(
      x,
      base - amp * (0.6 * Math.sin(x / 97 + phase) + 0.4 * Math.sin(x / 41 + phase * 2.3)),
    );
  ctx.lineTo(x1, bottom);
  ctx.closePath();
  ctx.fill();
}

/** A tall stalk topped with a daisy, a bluebell or a seed puff. */
function stalk(ctx: Ctx, i: number, x: number, top: number, lean: number, h: number): void {
  ctx.strokeStyle = '#120F38';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x, h);
  ctx.quadraticCurveTo(x + lean * 0.3, (top + h) / 2, x + lean, top);
  ctx.stroke();
  const kind = i % 3;
  const fx = x + lean;
  if (kind === 0) {
    // daisy
    ctx.fillStyle = rgba(['#B9A8FF', '#FF9FD0', '#9FE3FF'][i % 9 === 0 ? 1 : i % 2]!, 0.55);
    for (let p = 0; p < 6; p++) {
      ctx.beginPath();
      ctx.ellipse(
        fx + Math.cos((p * Math.PI) / 3) * 6,
        top + Math.sin((p * Math.PI) / 3) * 6,
        5,
        3,
        (p * Math.PI) / 3,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.fillStyle = rgba(colors.yellow, 0.7);
    circle(ctx, fx, top, 3.2);
    ctx.fill();
  } else if (kind === 1) {
    // bluebell
    ctx.fillStyle = rgba('#7C8CFF', 0.5);
    ctx.beginPath();
    ctx.moveTo(fx - 6, top + 10);
    ctx.quadraticCurveTo(fx - 6, top - 2, fx, top - 2);
    ctx.quadraticCurveTo(fx + 6, top - 2, fx + 6, top + 10);
    ctx.lineTo(fx + 3, top + 7);
    ctx.lineTo(fx, top + 10);
    ctx.lineTo(fx - 3, top + 7);
    ctx.closePath();
    ctx.fill();
  } else {
    // seed puff
    ctx.strokeStyle = 'rgba(220,214,255,0.35)';
    ctx.lineWidth = 1.2;
    for (let p = 0; p < 10; p++) {
      const a = (p / 10) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(fx, top);
      ctx.lineTo(fx + Math.cos(a) * 8, top + Math.sin(a) * 8);
      ctx.stroke();
    }
  }
}

/** One blade of front grass rooted at (x, 676). */
function blade(ctx: Ctx, x: number, bh: number, lean: number): void {
  ctx.beginPath();
  ctx.moveTo(x - 3.5, 676);
  ctx.quadraticCurveTo(x + lean * 0.4, 676 - bh * 0.6, x + lean, 676 - bh);
  ctx.quadraticCurveTo(x + lean * 0.4 + 2, 676 - bh * 0.5, x + 3.5, 676);
  ctx.fill();
}

/**
 * The meadow, drawn over the sky gradient. The design area is `w` × `h`; scenery also runs `bleed` past each side
 * so it covers the whole view when the frame is wider or taller.
 */
export function drawMeadow(ctx: Ctx, w: number, h: number, bleed: { x: number; y: number }): void {
  const rnd = prng(29);
  const [left, right, bottom] = [-bleed.x, w + bleed.x, h + bleed.y];
  // the moon
  const [mx, my, mr] = [560, 150, 56];
  const halo = ctx.createRadialGradient(mx, my, mr * 0.9, mx, my, mr * 3.4);
  halo.addColorStop(0, 'rgba(226,230,255,0.34)');
  halo.addColorStop(1, 'rgba(226,230,255,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(mx - mr * 3.4, my - mr * 3.4, mr * 6.8, mr * 6.8);
  const mg = ctx.createRadialGradient(mx - mr * 0.35, my - mr * 0.35, mr * 0.1, mx, my, mr);
  mg.addColorStop(0, '#FFFEF4');
  mg.addColorStop(0.7, '#F7EDCB');
  mg.addColorStop(1, '#E4D3A4');
  ctx.fillStyle = mg;
  circle(ctx, mx, my, mr);
  ctx.fill();
  ctx.fillStyle = 'rgba(196,170,120,0.3)';
  for (const [dx, dy, r] of [
    [-18, -8, 11],
    [17, 15, 8],
    [12, -24, 6],
    [-8, 24, 5],
    [26, -4, 4],
  ] as const) {
    circle(ctx, mx + dx, my + dy, r);
    ctx.fill();
  }
  // hills, mist and the meadow
  const x0 = -Math.ceil(bleed.x / 8) * 8;
  ridge(ctx, x0, right, bottom, 556, 24, '#2A2470', 0.4);
  const mist = ctx.createLinearGradient(0, 520, 0, 640);
  mist.addColorStop(0, 'rgba(170,160,255,0)');
  mist.addColorStop(0.5, 'rgba(170,160,255,0.16)');
  mist.addColorStop(1, 'rgba(170,160,255,0)');
  ctx.fillStyle = mist;
  ctx.fillRect(left, 520, right - left, 120);
  ridge(ctx, x0, right, bottom, 612, 16, '#1B1850', 2.1);
  // tall stalks and flowers behind the front grass: the design area first, then the overhang
  for (let i = 0; i < 26; i++) {
    const x = rnd() * w;
    const top = 520 + rnd() * 110;
    stalk(ctx, i, x, top, (rnd() - 0.5) * 30, h);
  }
  const extra = prng(31);
  const side = Math.round((bleed.x * 2 * 26) / w);
  for (let i = 0; i < side; i++) {
    const x = extra() < 0.5 ? left + extra() * bleed.x : w + extra() * bleed.x;
    stalk(ctx, i, x, 520 + extra() * 110, (extra() - 0.5) * 30, h);
  }
  // front grass
  ridge(ctx, x0, right, bottom, 672, 8, '#0D0A28', 4.2);
  ctx.fillStyle = '#0D0A28';
  for (let x = -4; x < w + 8; x += 5 + rnd() * 4) {
    const bh = 18 + rnd() * (x < 90 || x > w - 90 ? 90 : 46);
    blade(ctx, x, bh, (rnd() - 0.5) * 22);
  }
  // overhang: the same grass, tall only at the very edge of the view
  for (const [from, to] of [
    [left - 8, -4],
    [w + 8, right + 8],
  ] as const)
    for (let x = from; x < to; x += 5 + extra() * 4) {
      const tall = x < left + 90 || x > right - 90;
      blade(ctx, x, 18 + extra() * (tall ? 90 : 46), (extra() - 0.5) * 22);
    }
  // vignette: darker toward the edges so the play area pops
  const v = ctx.createRadialGradient(w / 2, h * 0.46, h * 0.36, w / 2, h * 0.46, h * 0.86);
  v.addColorStop(0, 'rgba(6,3,22,0)');
  v.addColorStop(1, 'rgba(6,3,22,0.55)');
  ctx.fillStyle = v;
  ctx.fillRect(left, -bleed.y, right - left, bottom + bleed.y);
}

/** Soft round light (tinted and blended additively for fireflies and lantern halos). */
export function drawGlow(ctx: Ctx, s: number): void {
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.75)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.22)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
}

// ─── Lumi (120 × 120; body centre 60, 56) ───

export function drawLumi(ctx: Ctx, mood: Mood): void {
  const [cx, cy] = [60, 56];
  const sad = mood === 'sad';
  // antennae with glowing tips
  ctx.strokeStyle = shade(LUMI_BODY, -0.25);
  ctx.lineWidth = 3.6;
  ctx.lineCap = 'round';
  for (const s of [-1, 1]) {
    const tipY = sad ? cy - 40 : cy - 48;
    ctx.beginPath();
    ctx.moveTo(cx + s * 9, cy - 30);
    ctx.quadraticCurveTo(cx + s * 12, cy - 46, cx + s * 26, tipY);
    ctx.stroke();
    glowDot(ctx, cx + s * 26, tipY, 5, colors.yellow);
  }
  // the glowing tail
  ctx.save();
  ctx.shadowColor = colors.yellow;
  ctx.shadowBlur = blur(ctx, 18);
  const tg = ctx.createRadialGradient(cx, cy + 40, 2, cx, cy + 36, 24);
  tg.addColorStop(0, '#FFFFF2');
  tg.addColorStop(0.5, '#FFF07A');
  tg.addColorStop(1, '#FFC21A');
  ctx.fillStyle = tg;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 35, 23, 20, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = rgba('#D99A00', 0.5);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 36, 19, 9, 0, 0.12 * Math.PI, 0.88 * Math.PI);
  ctx.stroke();
  ctx.strokeStyle = '#E09A00';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 35, 23, 20, 0, 0, Math.PI * 2);
  ctx.stroke();
  // body
  glossyCircle(ctx, cx, cy, 35, LUMI_BODY, { outline: INK, shadow: false });
  // face mask (lighter) for readable eyes
  ctx.fillStyle = rgba('#E9E3FF', 0.5);
  ctx.beginPath();
  ctx.ellipse(cx, cy + 4, 27, 20, 0, 0, Math.PI * 2);
  ctx.fill();
  // cheeks
  ctx.fillStyle = rgba(colors.pink, mood === 'happy' ? 0.75 : 0.5);
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + s * 23, cy + 12, 6.5, 4.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // eyes
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const s of [-1, 1]) {
    const ex = cx + s * 12.5;
    const ey = cy - 1;
    if (mood === 'happy') {
      ctx.strokeStyle = INK;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(ex, ey + 4, 7.5, Math.PI * 1.12, Math.PI * 1.88);
      ctx.stroke();
      continue;
    }
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.ellipse(ex, ey, 10, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    const py = sad ? ey + 4 : ey + 1.5;
    ctx.fillStyle = INK;
    circle(ctx, ex + s * 0.5, py, 6.8);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    circle(ctx, ex + s * 0.5 - 2.4, py - 3, 2.6);
    ctx.fill();
    circle(ctx, ex + s * 0.5 + 2.4, py + 2.6, 1.2);
    ctx.fill();
    if (sad) {
      // droopy lids and worried brows
      ctx.fillStyle = shade(LUMI_BODY, -0.05);
      ctx.beginPath();
      ctx.moveTo(ex - 11, ey - 13);
      ctx.lineTo(ex + 11, ey - 13);
      ctx.lineTo(ex + 11, ey - (s > 0 ? 6 : 1));
      ctx.lineTo(ex - 11, ey - (s > 0 ? 1 : 6));
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(ex - 10, ey - (s > 0 ? 6 : 1.5));
      ctx.lineTo(ex + 10, ey - (s > 0 ? 1.5 : 6));
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(ex - s * 8, ey - 15);
      ctx.lineTo(ex + s * 3, ey - 20);
      ctx.stroke();
    }
  }
  // mouth
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.8;
  if (mood === 'happy') {
    ctx.fillStyle = '#4A1030';
    ctx.beginPath();
    ctx.moveTo(cx - 9, cy + 11);
    ctx.quadraticCurveTo(cx, cy + 27, cx + 9, cy + 11);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = colors.pink;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 18.5, 4.5, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (sad) {
    ctx.beginPath();
    ctx.arc(cx, cy + 20, 6, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    // a tear
    ctx.fillStyle = colors.sky;
    ctx.beginPath();
    ctx.moveTo(cx + 25, cy + 2);
    ctx.quadraticCurveTo(cx + 31, cy + 11, cx + 25, cy + 13);
    ctx.quadraticCurveTo(cx + 19, cy + 11, cx + 25, cy + 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(cx, cy + 9, 6.5, Math.PI * 0.2, Math.PI * 0.8);
    ctx.stroke();
  }
}

/** One wing (64 × 52), root near the bottom-right corner (58, 46); flip it for the other side. */
export function drawWing(ctx: Ctx): void {
  ctx.save();
  ctx.translate(58, 46);
  ctx.rotate(0.65);
  ctx.beginPath();
  ctx.ellipse(-25, 0, 25, 14, 0, 0, Math.PI * 2);
  const g = ctx.createLinearGradient(-50, 0, 0, 0);
  g.addColorStop(0, 'rgba(190,240,255,0.85)');
  g.addColorStop(1, 'rgba(225,215,255,0.55)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = '#FFFFFF';
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-3, 0);
  ctx.quadraticCurveTo(-22, -4, -40, 1);
  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

// ─── glass jars (140 × 140) ───

function jarBody(ctx: Ctx): void {
  roundRectPath(ctx, 6, 22, 128, 112, 30);
}

/** The jar: 'back' shows the firefly emblem, 'face' is lit glass for a glyph on top. */
export function drawJar(ctx: Ctx, kind: 'back' | 'face'): void {
  ctx.save();
  ctx.shadowColor = 'rgba(4,2,16,0.6)';
  ctx.shadowBlur = blur(ctx, 8);
  ctx.shadowOffsetY = blur(ctx, 4);
  ctx.fillStyle = '#1A1A5A';
  jarBody(ctx);
  ctx.fill();
  ctx.restore();
  ctx.save();
  jarBody(ctx);
  ctx.clip();
  if (kind === 'back') {
    const g = ctx.createLinearGradient(0, 22, 0, 134);
    g.addColorStop(0, '#3550B8');
    g.addColorStop(1, '#1B1C62');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 140, 140);
    const glow = ctx.createRadialGradient(70, 80, 4, 70, 80, 56);
    glow.addColorStop(0, rgba(colors.yellow, 0.42));
    glow.addColorStop(1, rgba(colors.yellow, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 140, 140);
    // grass inside the jar
    ctx.fillStyle = '#16245A';
    for (let i = 0; i < 9; i++) {
      const x = 14 + i * 14;
      const bh = 12 + ((i * 7) % 5) * 4;
      ctx.beginPath();
      ctx.moveTo(x - 5, 136);
      ctx.quadraticCurveTo(x, 136 - bh, x + (i % 2 ? 4 : -4), 134 - bh);
      ctx.quadraticCurveTo(x + 1, 130 - bh / 2, x + 5, 136);
      ctx.fill();
    }
    drawEmblem(ctx, 70, 76);
  } else {
    const g = ctx.createRadialGradient(70, 84, 6, 70, 84, 84);
    g.addColorStop(0, '#5E52D8');
    g.addColorStop(1, '#221A68');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 140, 140);
  }
  // glass shine
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  roundRectPath(ctx, 15, 34, 9, 60, 4.5);
  ctx.fill();
  roundRectPath(ctx, 15, 100, 9, 12, 4.5);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  roundRectPath(ctx, 108, 34, 7, 26, 3.5);
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = INK;
  roundRectPath(ctx, 7.5, 23.5, 125, 109, 29);
  ctx.stroke();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  roundRectPath(ctx, 11.5, 27.5, 117, 101, 25);
  ctx.stroke();
  // neck and lid
  ctx.fillStyle = '#2C3488';
  ctx.fillRect(30, 15, 80, 10);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  ctx.strokeRect(30, 15, 80, 10);
  glossyRect(ctx, 22, 3, 96, 22, kind === 'back' ? colors.gold : '#FFDA5C', {
    radius: 8,
    depth: 4,
    outline: INK,
    lineWidth: 2.5,
    shadow: false,
  });
  ctx.fillStyle = rgba(INK, 0.25);
  for (let x = 34; x < 110; x += 12) ctx.fillRect(x, 8, 2.5, 10);
}

/** A small Lumi-like firefly: the card-back emblem. */
function drawEmblem(ctx: Ctx, cx: number, cy: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = 'rgba(214,236,255,0.5)';
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 1.5;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(s * 16, -14, 14, 8, s * -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  glowDot(ctx, 0, 16, 11, colors.yellow);
  glossyCircle(ctx, 0, 0, 15, LUMI_BODY, { outline: INK, shadow: false });
  ctx.fillStyle = '#FFFFFF';
  for (const s of [-1, 1]) {
    circle(ctx, s * 5.5, -1, 4.2);
    ctx.fill();
  }
  ctx.fillStyle = INK;
  for (const s of [-1, 1]) {
    circle(ctx, s * 5.5, 0, 2.6);
    ctx.fill();
  }
  ctx.restore();
}

/** Glowing halo behind a matched jar (180 × 180), drawn as a blurred shadow only. */
export function drawJarGlow(ctx: Ctx): void {
  ctx.save();
  ctx.shadowColor = rgba(colors.yellow, 0.95);
  ctx.shadowBlur = 22;
  ctx.shadowOffsetX = 1000;
  ctx.fillStyle = '#FFFFFF';
  roundRectPath(ctx, 26 - 1000, 34, 128, 120, 32);
  ctx.fill();
  ctx.restore();
}

// ─── glyphs (80 × 80): 6 outer shapes × 4 inner marks ───

function shapePath(ctx: Ctx, shape: number, c: number, r: number): void {
  if (shape === 0) circle(ctx, c, c, r);
  else if (shape === 1) poly(ctx, c, c, r * 1.25, 4, -Math.PI / 4);
  else if (shape === 2) poly(ctx, c, c + r * 0.15, r * 1.25, 3, -Math.PI / 2);
  else if (shape === 3) poly(ctx, c, c, r * 1.25, 4, 0);
  else if (shape === 4) poly(ctx, c, c, r * 1.15, 6, -Math.PI / 2);
  else poly(ctx, c, c, r * 1.2, 5, -Math.PI / 2);
}

export function drawGlyph(ctx: Ctx, i: number): void {
  const shape = Math.floor(i / 4) % 6;
  const mark = i % 4;
  const col = GLYPH_COLORS[i % 6]!;
  const [c, r] = [40, 23];
  const halo = ctx.createRadialGradient(c, c, 6, c, c, 40);
  halo.addColorStop(0, rgba(col, 0.85));
  halo.addColorStop(0.55, rgba(col, 0.3));
  halo.addColorStop(1, rgba(col, 0));
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, 80, 80);
  ctx.save();
  ctx.shadowColor = '#FFFFFF';
  ctx.shadowBlur = blur(ctx, 10);
  const g = ctx.createLinearGradient(0, c - r, 0, c + r);
  g.addColorStop(0, shade(col, 0.55));
  g.addColorStop(0.55, col);
  g.addColorStop(1, shade(col, -0.12));
  ctx.fillStyle = g;
  shapePath(ctx, shape, c, r);
  ctx.fill();
  ctx.restore();
  // rim light inside the edge, then the ink outline
  ctx.save();
  shapePath(ctx, shape, c, r);
  ctx.clip();
  ctx.lineWidth = 7;
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath();
  ctx.ellipse(c - r * 0.35, c - r * 0.5, r * 0.4, r * 0.2, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3.2;
  ctx.strokeStyle = INK;
  shapePath(ctx, shape, c, r);
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.strokeStyle = INK;
  const s = r * 0.32;
  if (mark === 0) {
    circle(ctx, c, c, s * 1.05);
    ctx.fill();
  } else if (mark === 1) {
    roundRectPath(ctx, c - s * 1.7, c - s * 0.48, s * 3.4, s * 0.96, s * 0.4);
    ctx.fill();
  } else if (mark === 2) {
    ctx.lineWidth = 3.6;
    circle(ctx, c, c, s * 1.25);
    ctx.stroke();
  } else {
    roundRectPath(ctx, c - s * 1.5, c - s * 0.42, s * 3, s * 0.84, s * 0.3);
    ctx.fill();
    roundRectPath(ctx, c - s * 0.42, c - s * 1.5, s * 0.84, s * 3, s * 0.3);
    ctx.fill();
  }
}

/** Round state badge (32 × 32): a tick (match) or a cross (miss). */
export function drawBadge(ctx: Ctx, kind: 'tick' | 'cross'): void {
  glossyCircle(ctx, 16, 16, 14, kind === 'tick' ? colors.green : colors.vermillion, {
    outline: INK,
    shadow: false,
  });
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 3.6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (kind === 'tick') {
    ctx.moveTo(9.5, 16.5);
    ctx.lineTo(14, 21);
    ctx.lineTo(22.5, 11);
  } else {
    ctx.moveTo(11, 11);
    ctx.lineTo(21, 21);
    ctx.moveTo(21, 11);
    ctx.lineTo(11, 21);
  }
  ctx.stroke();
}

// ─── lanterns (150 × 230; hangs from the top centre; body centre 75, 128) ───

function lanternPath(ctx: Ctx, i: number, cx: number, cy: number): void {
  if (i === 0) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, 60, 68, 0, 0, Math.PI * 2);
  } else if (i === 1) roundRectPath(ctx, cx - 56, cy - 64, 112, 128, 16);
  else if (i === 2) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - 72);
    ctx.lineTo(cx + 68, cy + 60);
    ctx.lineTo(cx - 68, cy + 60);
    ctx.closePath();
  } else poly(ctx, cx, cy, 70, 6, 0);
}

export function drawLantern(ctx: Ctx, i: number): void {
  const col = LANTERN_COLORS[i]!;
  const [cx, cy] = [75, 128];
  ctx.strokeStyle = 'rgba(194,185,234,0.85)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(cx, 0);
  ctx.lineTo(cx, 50);
  ctx.stroke();
  // body
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.shadowColor = rgba(col, 0.8);
  ctx.shadowBlur = blur(ctx, 18);
  const g = ctx.createRadialGradient(cx, cy + 6, 4, cx, cy, 78);
  g.addColorStop(0, '#FFFFFF');
  g.addColorStop(0.28, shade(col, 0.5));
  g.addColorStop(0.7, col);
  g.addColorStop(1, shade(col, -0.32));
  ctx.fillStyle = g;
  lanternPath(ctx, i, cx, cy);
  ctx.fill();
  ctx.restore();
  // paper ribs
  ctx.save();
  lanternPath(ctx, i, cx, cy);
  ctx.clip();
  ctx.strokeStyle = rgba(shade(col, -0.45), 0.45);
  ctx.lineWidth = 2.2;
  for (const rx of [22, 44]) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, 90, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(cx, cy - 90);
  ctx.lineTo(cx, cy + 90);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.beginPath();
  ctx.ellipse(cx - 30, cy - 26, 9, 24, 0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = INK;
  lanternPath(ctx, i, cx, cy);
  ctx.stroke();
  // caps and tassel
  const [top, bottom] = (
    [
      [68, 68],
      [64, 64],
      [72, 60],
      [61, 61],
    ] as const
  )[i]!;
  glossyRect(ctx, cx - 24, cy - top - 14, 48, 18, colors.gold, {
    radius: 6,
    depth: 4,
    outline: INK,
    lineWidth: 2.5,
    shadow: false,
  });
  glossyRect(ctx, cx - 20, cy + bottom - 4, 40, 16, colors.gold, {
    radius: 6,
    depth: 4,
    outline: INK,
    lineWidth: 2.5,
    shadow: false,
  });
  ctx.strokeStyle = col;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  for (const dx of [-6, 0, 6]) {
    ctx.beginPath();
    ctx.moveTo(cx + dx * 0.5, cy + bottom + 11);
    ctx.lineTo(cx + dx, cy + bottom + 30);
    ctx.stroke();
  }
  // the shape glyph in the glow
  ctx.fillStyle = rgba(INK, 0.82);
  if (i === 0) circle(ctx, cx, cy + 4, 19);
  else if (i === 1) roundRectPath(ctx, cx - 17, cy - 13, 34, 34, 5);
  else if (i === 2) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - 8);
    ctx.lineTo(cx + 21, cy + 28);
    ctx.lineTo(cx - 21, cy + 28);
    ctx.closePath();
  } else poly(ctx, cx, cy + 4, 20, 6, 0);
  ctx.fill();
}

// ─── panels and buttons ───

/** Mode-select card (310 × 430): a glassy night panel. */
export function drawPanel(ctx: Ctx, w: number, h: number): void {
  ctx.save();
  ctx.shadowColor = 'rgba(4,2,16,0.55)';
  ctx.shadowBlur = blur(ctx, 18);
  ctx.shadowOffsetY = blur(ctx, 8);
  roundRectPath(ctx, 4, 4, w - 8, h - 12, 28);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(58,46,138,0.92)');
  g.addColorStop(1, 'rgba(24,18,66,0.94)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  roundRectPath(ctx, 5, 5, w - 10, h - 14, 27);
  ctx.stroke();
  const hg = ctx.createLinearGradient(0, 0, 0, h * 0.4);
  hg.addColorStop(0, 'rgba(255,255,255,0.10)');
  hg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hg;
  roundRectPath(ctx, 9, 9, w - 18, h * 0.4, 24);
  ctx.fill();
}

/** A glossy yellow button face (w × h). */
export function drawChip(ctx: Ctx, w: number, h: number): void {
  glossyRect(ctx, 2, 2, w - 4, h - 4, '#FFD84A', {
    radius: 18,
    depth: 6,
    outline: INK,
    lineWidth: 3,
  });
}

/** The Modes button (124 × 60): dark glass pill with a 2 × 2 grid badge. */
export function drawModesButton(ctx: Ctx, w: number, h: number): void {
  roundRectPath(ctx, 1, 1, w - 2, h - 2, h / 2);
  ctx.fillStyle = rgba(colors.bg, 0.72);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.stroke();
  const r = h / 2 - 7;
  glossyCircle(ctx, h / 2, h / 2, r, colors.violet, { shadow: false });
  ctx.fillStyle = '#FFFFFF';
  const s = r * 0.42;
  for (const [dx, dy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    roundRectPath(ctx, h / 2 + dx * s * 0.62 - s / 2, h / 2 + dy * s * 0.62 - s / 2, s, s, 2);
    ctx.fill();
  }
}

/** Lumi's speech bubble (230 × 84), tail on the left. */
export function drawBubble(ctx: Ctx, w: number, h: number): void {
  ctx.save();
  ctx.shadowColor = 'rgba(4,2,16,0.45)';
  ctx.shadowBlur = blur(ctx, 10);
  ctx.shadowOffsetY = blur(ctx, 4);
  ctx.fillStyle = '#FFF9F2';
  roundRectPath(ctx, 16, 4, w - 20, h - 12, 26);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(22, h * 0.36);
  ctx.lineTo(2, h * 0.5);
  ctx.lineTo(24, h * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Height of the Follow branch's bough above/below its centre line at x. */
export const boughY = (x: number) => Math.sin(x / 120) * 6;

/** A vine branch across the Follow view (720 × 80; the bough runs near y 40). */
export function drawBranch(ctx: Ctx, w: number): void {
  const rnd = prng(5);
  const y = (x: number) => 40 + boughY(x);
  ctx.strokeStyle = '#0E0A2C';
  ctx.lineCap = 'round';
  ctx.lineWidth = 10;
  ctx.beginPath();
  for (let x = -10; x <= w + 10; x += 10) ctx.lineTo(x, y(x));
  ctx.stroke();
  ctx.strokeStyle = 'rgba(140,120,255,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = -10; x <= w + 10; x += 10) ctx.lineTo(x, y(x) - 4);
  ctx.stroke();
  for (let x = 20; x < w; x += 34 + rnd() * 26) {
    const up = rnd() > 0.5 ? -1 : 1;
    ctx.save();
    ctx.translate(x, y(x));
    ctx.rotate(up * (0.5 + rnd() * 0.6));
    ctx.fillStyle = rnd() > 0.5 ? '#173A52' : '#1F2F66';
    ctx.beginPath();
    ctx.ellipse(13, 0, 13, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/** Key hint chip under a lantern (40 × 40). */
export function drawDigitChip(ctx: Ctx, s: number): void {
  circle(ctx, s / 2, s / 2, s / 2 - 1.5);
  ctx.fillStyle = rgba(colors.bg, 0.75);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.stroke();
}
