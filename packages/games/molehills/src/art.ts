// Molehills art: a sunny cartoon garden, drawn once per mount with Canvas 2D (no Phaser here): grass tufts, dug
// soil, numbers, daisies, the moles (asleep in nightcaps, or grumpy and awake), the wooden garden-bed frame,
// buttons, and the sky and lawn behind the board.
import {
  fillGradient,
  font,
  glossyCircle,
  glossyRect,
  prng,
  rgba,
  roundRectPath,
  shade,
  sprinkle,
} from '@pocketcade/toolkit';

type Ctx = CanvasRenderingContext2D;

/** Tile textures are TEX × TEX pixels (drawn at scale 1, shown at the cell size). */
export const TEX = 128;
const INK = '#2A1630';
const SOIL_LINE = '#4A2614';
const GRASS_LINE = '#1E5E22';
const WOOD_LINE = '#5A3014';
/**
 * Number colours 1–8, one clearly different hue each (blue, green, red, purple, orange, teal, pink, white) so
 * neighbouring counts never look alike; the ink-outlined digit is still the main cue.
 */
const NUMBER_COLORS = [
  '#4FB6FF',
  '#5EE05A',
  '#FF5A5F',
  '#C98BFF',
  '#FFA62B',
  '#2EE6D0',
  '#FF8AD8',
  '#F4F4F4',
];

function ellipse(
  ctx: Ctx,
  x: number,
  y: number,
  rx: number,
  ry: number,
  fill: string,
  rot = 0,
): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

function outlined(ctx: Ctx, width: number, color = INK): void {
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  ctx.stroke();
}

// ─── tiles ───

/** A plump grass blade from its base (bx, by) to its tip; the base edge is left open so it melts into the tuft. */
function blade(
  ctx: Ctx,
  bx: number,
  by: number,
  tx: number,
  ty: number,
  w: number,
  tip: string,
): void {
  const mx = bx + (tx - bx) * 0.35;
  const my = by + (ty - by) * 0.45;
  ctx.beginPath();
  ctx.moveTo(bx - w, by);
  ctx.quadraticCurveTo(mx - w * 1.15, my, tx, ty);
  ctx.quadraticCurveTo(mx + w * 1.15, my, bx + w, by);
  const g = ctx.createLinearGradient(0, by, 0, ty);
  g.addColorStop(0, '#48B93C');
  g.addColorStop(1, tip);
  ctx.fillStyle = g;
  ctx.fill();
  outlined(ctx, 2.5, GRASS_LINE);
}

/** Covered patch: a plump grass cushion with a crown of blades (3 variants). */
export function grass(ctx: Ctx, v: number): void {
  glossyRect(ctx, 3, 3, 122, 122, ['#4FBE3A', '#55C33E', '#4AB737'][v % 3]!, {
    radius: 30,
    depth: 12,
    outline: GRASS_LINE,
    lineWidth: 3,
    gloss: 0.4,
    shadow: false,
  });
  const r = prng(17 + v * 31);
  for (const k of [0, 4, 1, 3, 2]) {
    const t = (k + 0.5) / 5;
    const tx = 64 + (t - 0.5) * 92 + (r() - 0.5) * 10;
    const ty = 26 + Math.abs(t - 0.5) * 48 + r() * 10;
    blade(ctx, 40 + t * 48, 98, tx, ty, 11, k % 2 ? '#B8F34A' : '#DDFB7A');
  }
  // a soft front lip hides the blade roots
  ellipse(ctx, 64, 101, 38, 11, '#45B238');
  ellipse(ctx, 50, 97, 12, 3, 'rgba(255,255,255,0.3)');
}

/**
 * A patch with a daisy planted on it: flat, darker grass with no raised cushion, so it reads as settled rather
 * than as another patch to tap.
 */
export function planted(ctx: Ctx): void {
  roundRectPath(ctx, 5, 5, 118, 118, 26);
  ctx.fillStyle = '#2F7F2B';
  ctx.fill();
  ctx.save();
  ctx.clip();
  const sh = ctx.createLinearGradient(0, 5, 0, 30);
  sh.addColorStop(0, 'rgba(10,30,8,0.5)');
  sh.addColorStop(1, 'rgba(10,30,8,0)');
  ctx.fillStyle = sh;
  ctx.fillRect(0, 0, TEX, 30);
  const r = prng(77);
  for (let k = 0; k < 14; k++)
    ellipse(ctx, 18 + r() * 92, 22 + r() * 92, 3 + r() * 3, 2, 'rgba(120,200,90,0.35)', r() * 3);
  ctx.restore();
  roundRectPath(ctx, 5, 5, 118, 118, 26);
  outlined(ctx, 3, GRASS_LINE);
}

/** Dug patch: warm soil sitting a little lower than the lawn, with pebbles round the edge (2 variants). */
export function soil(ctx: Ctx, v: number, glow?: string): void {
  roundRectPath(ctx, 3, 3, 122, 122, 24);
  const g = ctx.createLinearGradient(0, 3, 0, 125);
  g.addColorStop(0, '#6E3D20');
  g.addColorStop(0.3, '#9A6038');
  g.addColorStop(1, '#B27645');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  const sh = ctx.createLinearGradient(0, 3, 0, 34);
  sh.addColorStop(0, 'rgba(40,16,6,0.55)');
  sh.addColorStop(1, 'rgba(40,16,6,0)');
  ctx.fillStyle = sh;
  ctx.fillRect(0, 0, TEX, 34);
  if (glow) {
    const rg = ctx.createRadialGradient(64, 66, 4, 64, 66, 70);
    rg.addColorStop(0, rgba(glow, 0.85));
    rg.addColorStop(1, rgba(glow, 0.15));
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, TEX, TEX);
  }
  const r = prng(5 + v * 13);
  for (let k = 0; k < 8; k++) {
    const a = r() * Math.PI * 2;
    const d = 44 + r() * 10;
    const s = 2.5 + r() * 4;
    ellipse(
      ctx,
      64 + Math.cos(a) * d,
      66 + Math.sin(a) * d * 0.9,
      s * 1.3,
      s,
      k % 3 ? 'rgba(70,32,12,0.45)' : 'rgba(236,190,140,0.55)',
    );
  }
  ctx.restore();
  roundRectPath(ctx, 4, 4, 120, 120, 23);
  outlined(ctx, 3, SOIL_LINE);
}

/** A bold Fredoka number with an ink outline, a drop shadow and a light-to-colour fill. */
export function digit(ctx: Ctx, n: number): void {
  const c = NUMBER_COLORS[n - 1]!;
  const [x, y] = [64, 70];
  ctx.font = font('display', 700, 92);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.fillStyle = 'rgba(30,10,4,0.4)';
  ctx.fillText(String(n), x + 2, y + 6);
  ctx.lineWidth = 15;
  ctx.strokeStyle = INK;
  ctx.strokeText(String(n), x, y);
  const g = ctx.createLinearGradient(0, y - 34, 0, y + 34);
  g.addColorStop(0, shade(c, 0.55));
  g.addColorStop(0.45, c);
  g.addColorStop(1, shade(c, -0.15));
  ctx.fillStyle = g;
  ctx.fillText(String(n), x, y);
}

// ─── daisies ───

/** A daisy head: white petals around a glossy golden centre with a tiny smile. */
function daisyHead(
  ctx: Ctx,
  cx: number,
  cy: number,
  r: number,
  petal = '#FFFFFF',
  centre = '#FFC83D',
  face = true,
): void {
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(
      cx + Math.cos(a) * r * 0.58,
      cy + Math.sin(a) * r * 0.58,
      r * 0.46,
      r * 0.22,
      a,
      0,
      Math.PI * 2,
    );
    const g = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
    g.addColorStop(0, shade(petal, -0.12));
    g.addColorStop(1, petal);
    ctx.fillStyle = g;
    ctx.fill();
    outlined(ctx, Math.max(1.5, r * 0.06), '#5D4E86');
  }
  glossyCircle(ctx, cx, cy, r * 0.36, centre, { outline: '#9A5A00', shadow: false });
  if (!face) return;
  ellipse(ctx, cx - r * 0.12, cy - r * 0.02, r * 0.045, r * 0.065, INK);
  ellipse(ctx, cx + r * 0.12, cy - r * 0.02, r * 0.045, r * 0.065, INK);
  ctx.beginPath();
  ctx.arc(cx, cy + r * 0.06, r * 0.1, 0.15 * Math.PI, 0.85 * Math.PI);
  outlined(ctx, Math.max(1.2, r * 0.035));
}

function stem(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, bend: number): void {
  for (const [w, c] of [
    [10, INK],
    [5.5, '#3DB04A'],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo((x0 + x1) / 2 + bend, (y0 + y1) / 2, x1, y1);
    outlined(ctx, w, c);
  }
}

function leaf(ctx: Ctx, x: number, y: number, dir: 1 | -1, color = '#4CC456'): void {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + dir * 12, y - 16, x + dir * 26, y - 10);
  ctx.quadraticCurveTo(x + dir * 14, y + 4, x, y);
  ctx.fillStyle = color;
  ctx.fill();
  outlined(ctx, 2.5, GRASS_LINE);
}

/** A planted daisy (sits on a grass tuft). */
export function flower(ctx: Ctx): void {
  ellipse(ctx, 64, 112, 26, 7, 'rgba(20,50,10,0.35)');
  stem(ctx, 64, 112, 64, 60, -6);
  leaf(ctx, 62, 96, -1);
  leaf(ctx, 65, 88, 1);
  daisyHead(ctx, 64, 48, 36);
}

/** A flower planted on a safe patch, shown wilted after the game, with a red cross badge. */
export function wilted(ctx: Ctx): void {
  ellipse(ctx, 60, 112, 24, 6, 'rgba(20,50,10,0.3)');
  stem(ctx, 58, 112, 82, 70, -22);
  leaf(ctx, 62, 98, -1, '#9DAA6A');
  ctx.save();
  ctx.translate(84, 78);
  ctx.rotate(0.9);
  ctx.scale(1, 0.75);
  daisyHead(ctx, 0, 0, 26, '#D9D0C3', '#B88A4A', false);
  ctx.restore();
  glossyCircle(ctx, 30, 30, 20, '#FF5A5F', { outline: INK, shadow: false });
  ctx.beginPath();
  ctx.moveTo(23, 23);
  ctx.lineTo(37, 37);
  ctx.moveTo(37, 23);
  ctx.lineTo(23, 37);
  outlined(ctx, 5, '#FFFFFF');
}

// ─── moles ───

type MoleMood = 'sleep' | 'grump' | 'bloom';

function mound(ctx: Ctx): void {
  ctx.beginPath();
  ctx.moveTo(8, 122);
  ctx.bezierCurveTo(14, 88, 44, 84, 64, 84);
  ctx.bezierCurveTo(84, 84, 114, 88, 120, 122);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, 84, 0, 122);
  g.addColorStop(0, '#B97C4A');
  g.addColorStop(1, '#7A4526');
  ctx.fillStyle = g;
  ctx.fill();
  outlined(ctx, 3, SOIL_LINE);
  const r = prng(99);
  for (let k = 0; k < 7; k++)
    ellipse(
      ctx,
      22 + r() * 84,
      100 + r() * 16,
      2.5 + r() * 2.5,
      2 + r() * 1.5,
      k % 2 ? 'rgba(70,32,12,0.5)' : 'rgba(236,190,140,0.6)',
    );
}

function capPath(ctx: Ctx): void {
  ctx.beginPath();
  ctx.moveTo(34, 52);
  ctx.bezierCurveTo(34, 14, 82, 6, 102, 28);
  ctx.quadraticCurveTo(114, 42, 112, 66);
  ctx.quadraticCurveTo(100, 44, 92, 48);
  ctx.closePath();
}

function cap(ctx: Ctx): void {
  capPath(ctx);
  ctx.fillStyle = '#5B8CFF';
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 7;
  for (let k = 0; k < 4; k++) {
    ctx.beginPath();
    ctx.moveTo(40 + k * 22, 60);
    ctx.lineTo(62 + k * 22, 4);
    ctx.stroke();
  }
  ctx.restore();
  capPath(ctx);
  outlined(ctx, 3);
  for (const [w, c] of [
    [13, INK],
    [7.5, '#FFF6EA'],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(32, 54);
    ctx.quadraticCurveTo(62, 40, 94, 48);
    outlined(ctx, w, c);
  }
  glossyCircle(ctx, 112, 68, 10, '#FFE14D', { outline: INK, shadow: false });
}

/** An original mole: dusky-violet velvet, pink nose and paws, peeking from its molehill. */
export function mole(ctx: Ctx, mood: MoleMood): void {
  const awake = mood === 'grump';
  // head and shoulders
  ctx.beginPath();
  ctx.ellipse(64, 72, 34, 36, 0, 0, Math.PI * 2);
  const g = ctx.createRadialGradient(52, 56, 6, 64, 72, 40);
  g.addColorStop(0, '#9A86AE');
  g.addColorStop(1, '#5E4A70');
  ctx.fillStyle = g;
  ctx.fill();
  outlined(ctx, 3.5);
  mound(ctx);
  // paws on the rim
  for (const x of [40, 88]) {
    ellipse(ctx, x, 94, 11, 8, '#FFB3C8');
    outlined(ctx, 2.5);
    ctx.beginPath();
    for (const d of [-5, 0, 5]) {
      ctx.moveTo(x + d, 89);
      ctx.lineTo(x + d, 93);
    }
    outlined(ctx, 1.8);
  }
  // face
  ellipse(ctx, 42, 80, 7, 4.5, 'rgba(255,111,159,0.45)');
  ellipse(ctx, 86, 80, 7, 4.5, 'rgba(255,111,159,0.45)');
  ellipse(ctx, 64, 83, 17, 11, '#F4CDBD');
  if (awake) {
    for (const x of [50, 78]) {
      ellipse(ctx, x, 66, 8, 8.5, '#FFFFFF');
      outlined(ctx, 2.5);
      ellipse(ctx, x + (x < 64 ? 2 : -2), 68, 3.6, 4, INK);
    }
    ctx.beginPath();
    ctx.moveTo(39, 52);
    ctx.lineTo(58, 59);
    ctx.moveTo(89, 52);
    ctx.lineTo(70, 59);
    outlined(ctx, 5);
    ctx.beginPath();
    ctx.arc(64, 96, 6, 1.15 * Math.PI, 1.85 * Math.PI);
    outlined(ctx, 3);
  } else {
    for (const x of [51, 77]) {
      ctx.beginPath();
      ctx.arc(x, 63, 6.5, 0.12 * Math.PI, 0.88 * Math.PI);
      outlined(ctx, 3.5);
    }
  }
  glossyCircle(ctx, 64, 78, 8.5, '#FF6F9F', { outline: INK, shadow: false });
  if (awake) {
    ctx.save();
    ctx.translate(64, 50);
    ctx.rotate(-0.38);
    ctx.translate(-64, -58);
    cap(ctx);
    ctx.restore();
    // "!" bubble
    glossyCircle(ctx, 24, 26, 19, '#FF5A5F', { outline: INK, shadow: false });
    ctx.font = font('display', 700, 30);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('!', 24, 28);
    return;
  }
  cap(ctx);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 5;
  ctx.strokeStyle = INK;
  for (const [x, y, s] of [
    [20, 38, 1],
    [30, 20, 0.75],
  ] as const) {
    ctx.font = font('display', 700, 22 * s);
    ctx.strokeText('z', x, y);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('z', x, y);
  }
  if (mood === 'bloom') {
    stem(ctx, 112, 120, 110, 100, 0);
    daisyHead(ctx, 110, 96, 16, '#FFFFFF', '#FFC83D', false);
  }
}

// ─── markers, particles and frame ───

/** Hint marker for a safe patch: a glossy down arrow (the flower hint is a round badge: shape, not just colour). */
export function hintArrow(ctx: Ctx): void {
  ctx.beginPath();
  ctx.moveTo(22, 6);
  ctx.lineTo(42, 6);
  ctx.lineTo(42, 30);
  ctx.lineTo(56, 30);
  ctx.lineTo(32, 58);
  ctx.lineTo(8, 30);
  ctx.lineTo(22, 30);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, 6, 0, 58);
  g.addColorStop(0, '#9DF7C2');
  g.addColorStop(1, '#1FB866');
  ctx.fillStyle = g;
  ctx.fill();
  outlined(ctx, 4);
}

export function hintBadge(ctx: Ctx): void {
  glossyCircle(ctx, 32, 32, 26, '#FF9F1C', { outline: INK, shadow: false });
  daisyHead(ctx, 32, 33, 17, '#FFFFFF', '#FFE14D', false);
}

/** A white petal (tinted per particle). */
export function petal(ctx: Ctx): void {
  ctx.beginPath();
  ctx.ellipse(12, 12, 10, 5, -0.5, 0, Math.PI * 2);
  const g = ctx.createLinearGradient(4, 4, 20, 20);
  g.addColorStop(0, '#FFFFFF');
  g.addColorStop(1, '#D8D8D8');
  ctx.fillStyle = g;
  ctx.fill();
}

/** A horizontal wooden plank (w × h); the vertical one is the same drawing rotated. */
export function plank(ctx: Ctx, w: number, h: number, vertical = false): void {
  if (vertical) {
    ctx.translate(w, 0);
    ctx.rotate(Math.PI / 2);
    [w, h] = [h, w];
  }
  fillGradient(ctx, 0, 0, w, h, ['#E0A866', '#BF7E42', '#94582B']);
  ctx.strokeStyle = 'rgba(90,45,15,0.35)';
  ctx.lineWidth = 1.2;
  for (const f of [0.32, 0.55, 0.78]) {
    ctx.beginPath();
    ctx.moveTo(0, h * f);
    for (let x = 0; x <= w; x += 20) ctx.lineTo(x, h * f + Math.sin(x * 0.07 + f * 9) * 1.4);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,240,210,0.35)';
  ctx.fillRect(0, 1.5, w, 2);
  ctx.strokeStyle = WOOD_LINE;
  ctx.lineWidth = 2.5;
  ctx.strokeRect(1.25, 1.25, w - 2.5, h - 2.5);
}

/** A chunky corner post seen from above, with a nail. */
export function post(ctx: Ctx, s: number): void {
  glossyRect(ctx, 1, 1, s - 2, s - 2, '#D08F50', {
    radius: s * 0.22,
    depth: s * 0.12,
    outline: WOOD_LINE,
    lineWidth: 2.5,
    shadow: false,
  });
  glossyCircle(ctx, s / 2, s * 0.44, s * 0.13, '#C9C3D6', { outline: '#4A4458', shadow: false });
}

// ─── HUD bits ───

export type Glyph = 'daisy' | 'mound' | 'bulb' | 'zoom' | 'shovel';

/** A glyph centred on (cx, cy) of radius r, for badges and buttons. */
function glyph(ctx: Ctx, kind: Glyph, cx: number, cy: number, r: number, color = '#FFFFFF'): void {
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (kind === 'daisy') {
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      ellipse(
        ctx,
        cx + Math.cos(a) * r * 0.5,
        cy + Math.sin(a) * r * 0.5,
        r * 0.36,
        r * 0.2,
        color,
        a,
      );
    }
    glossyCircle(ctx, cx, cy, r * 0.3, '#FFC83D', { outline: null, shadow: false });
  } else if (kind === 'mound') {
    ctx.beginPath();
    ctx.moveTo(cx - r, cy + r * 0.55);
    ctx.bezierCurveTo(
      cx - r * 0.8,
      cy - r * 0.55,
      cx + r * 0.8,
      cy - r * 0.55,
      cx + r,
      cy + r * 0.55,
    );
    ctx.closePath();
    ctx.fill();
    ellipse(ctx, cx, cy + r * 0.05, r * 0.26, r * 0.18, 'rgba(42,22,48,0.55)');
  } else if (kind === 'bulb') {
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.2, r * 0.58, Math.PI * 0.8, Math.PI * 2.2);
    ctx.lineTo(cx + r * 0.26, cy + r * 0.5);
    ctx.lineTo(cx - r * 0.26, cy + r * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(cx - r * 0.26, cy + r * 0.62, r * 0.52, r * 0.2);
  } else if (kind === 'zoom') {
    ctx.lineWidth = r * 0.22;
    ctx.beginPath();
    ctx.arc(cx - r * 0.15, cy - r * 0.15, r * 0.52, 0, Math.PI * 2);
    ctx.moveTo(cx + r * 0.25, cy + r * 0.25);
    ctx.lineTo(cx + r * 0.75, cy + r * 0.75);
    ctx.stroke();
  } else {
    // a garden spade, tilted
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 4);
    ctx.lineWidth = r * 0.2;
    ctx.beginPath();
    ctx.moveTo(-r * 0.3, -r * 0.95);
    ctx.lineTo(r * 0.3, -r * 0.95);
    ctx.moveTo(0, -r * 0.95);
    ctx.lineTo(0, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-r * 0.36, -r * 0.05);
    ctx.lineTo(r * 0.36, -r * 0.05);
    ctx.lineTo(r * 0.36, r * 0.45);
    ctx.quadraticCurveTo(r * 0.34, r * 0.85, 0, r * 1.0);
    ctx.quadraticCurveTo(-r * 0.34, r * 0.85, -r * 0.36, r * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

/** A round glossy badge with a glyph (used to swap the HUD pill icon). */
export function badge(ctx: Ctx, size: number, base: string, kind: Glyph): void {
  const c = size / 2;
  glossyCircle(ctx, c, c, c - 1.5, base, { shadow: false });
  glyph(ctx, kind, c, c, c * 0.62);
}

/** A candy button face with an ink glyph on the left; the label is a Phaser text on top. */
export function button(ctx: Ctx, w: number, h: number, base: string, kind: Glyph | null): void {
  glossyRect(ctx, 3, 3, w - 6, h - 6, base, {
    radius: h * 0.32,
    depth: h * 0.1,
    outline: INK,
    lineWidth: 4,
  });
  if (kind) glyph(ctx, kind, h * 0.56, h / 2 - 3, h * 0.3, INK);
}

/** A dark glass tab like the HUD pills (an unselected choice), with an optional white glyph. */
export function glassTab(ctx: Ctx, w: number, h: number, kind: Glyph | null = null): void {
  roundRectPath(ctx, 2, 2, w - 4, h - 4, h * 0.32);
  ctx.fillStyle = 'rgba(18,12,44,0.7)';
  ctx.fill();
  outlined(ctx, 3, 'rgba(255,255,255,0.3)');
  if (kind) glyph(ctx, kind, h * 0.56, h / 2, h * 0.3, '#FFFFFF');
}

// ─── backdrop ───

/** A soft white cloud centred on (x, y); also used as a drifting sprite. */
export function cloud(ctx: Ctx, x: number, y: number, s: number): void {
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  for (const [dx, dy, r] of [
    [-48, 8, 26],
    [-18, -8, 34],
    [20, -14, 40],
    [56, 4, 28],
    [0, 14, 30],
  ] as const) {
    ctx.beginPath();
    ctx.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2);
    ctx.fill();
  }
  ellipse(ctx, x + 4 * s, y + 26 * s, 70 * s, 10 * s, 'rgba(150,200,240,0.45)');
}

function bush(ctx: Ctx, x: number, y: number, r: number, base: string): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, shade(base, 0.25));
  g.addColorStop(1, shade(base, -0.25));
  ctx.fillStyle = g;
  ctx.fill();
}

/** The strip of sky behind the top HUD row: sky, sun and a hedge along its bottom edge (w × h). */
export function sky(ctx: Ctx, w: number, h: number, sunX: number): void {
  fillGradient(ctx, 0, 0, w, h, ['#4FC0FF', '#8FDBFF', '#D2F4FF']);
  const sun = ctx.createRadialGradient(sunX, h * 0.4, 6, sunX, h * 0.4, 150);
  sun.addColorStop(0, 'rgba(255,240,150,0.9)');
  sun.addColorStop(1, 'rgba(255,240,150,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(sunX - 150, 0, 300, h);
  ellipse(ctx, sunX, h * 0.4, 34, 34, '#FFF07A');
  const r = prng(41);
  for (let x = -20; x < w + 40; x += 42) bush(ctx, x, h + 4 + r() * 8, 26 + r() * 10, '#2F9E46');
  for (let x = 0; x < w + 40; x += 56) bush(ctx, x, h + 16, 22 + r() * 8, '#3AAE4C');
}

/** The lawn under everything: mowing stripes and tiny wildflowers, darker toward the edges (x, y, w × h). */
export function lawn(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  for (let sx = x; sx < x + w; sx += 120) ctx.fillRect(sx, y, 60, h);
  const density = (w * h) / 1e6;
  sprinkle(ctx, x, y, w, h, Math.round(70 * density), '#FFFFFF', 5, [1.5, 3.2]);
  sprinkle(ctx, x, y, w, h, Math.round(40 * density), '#FFE14D', 9, [1.5, 3]);
  sprinkle(ctx, x, y, w, h, Math.round(30 * density), '#FF8FC4', 13, [1.5, 3]);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const v = ctx.createRadialGradient(cx, cy, Math.min(w, h) * 0.35, cx, cy, Math.max(w, h) * 0.7);
  v.addColorStop(0, 'rgba(10,40,20,0)');
  v.addColorStop(1, 'rgba(10,40,20,0.35)');
  ctx.fillStyle = v;
  ctx.fillRect(x, y, w, h);
}
