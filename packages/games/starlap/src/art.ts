// Starlap art (Canvas 2D, drawn once per mount into textures by scene.ts): the sky of each zone, the striped
// sun, mountains and grid floor, the neon ring, Pip the spark-ball and the star target. Decoration only.
import { colors, prng, rgba, sprinkle, starPath } from '@pocketcade/toolkit';

type Ctx = CanvasRenderingContext2D;
export type Face = 'idle' | 'grin' | 'wince';

export const INK = '#1A0B33';
export const SUN_R = 95;

export interface Zone {
  /** sky gradient, top → horizon */
  sky: readonly string[];
  /** colour of the grid, the mountain edges and the rings of light */
  accent: string;
  /** height of the sun's centre above the horizon at the start of the zone, in sun radii */
  sun: number;
  /** star brightness, 0..1 */
  stars: number;
  /** floor scroll speed, relative to the first zone */
  grid: number;
}

/** A run cycles through these, one per ZONE_HITS hits: sunset, dusk, night, aurora, dawn. */
export const ZONES: readonly Zone[] = [
  {
    sky: ['#08041E', '#160A42', '#33106A', '#6A1A7C', '#C2367F'],
    accent: colors.pink,
    sun: 0.3,
    stars: 0.55,
    grid: 1,
  },
  {
    sky: ['#05031A', '#0E0838', '#27106A', '#4D1C8A', '#8A3CB0'],
    accent: '#B67BFF',
    sun: -0.2,
    stars: 0.8,
    grid: 1.25,
  },
  {
    sky: ['#02030F', '#050A26', '#0A1A48', '#10306E', '#1E5A9C'],
    accent: colors.sky,
    sun: -1.5,
    stars: 1,
    grid: 1.5,
  },
  {
    sky: ['#01060F', '#03162A', '#063542', '#0B5E5C', '#22967E'],
    accent: '#5CF2B8',
    sun: -1.5,
    stars: 1,
    grid: 1.75,
  },
  {
    sky: ['#0B0624', '#2A0F52', '#6A1F6E', '#C2416E', '#FF8A4C'],
    accent: colors.orange,
    sun: -0.7,
    stars: 0.4,
    grid: 2,
  },
];

/** Canvas shadow blur ignores the transform; scale it so textures look the same at every render scale. */
const blur = (ctx: Ctx, px: number) => px * ctx.getTransform().a;

function circle(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

/** A vertical sky gradient (stretched over the view by the scene). */
export function drawSky(ctx: Ctx, w: number, h: number, stops: readonly string[]): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

export function drawStars(ctx: Ctx, w: number, h: number): void {
  sprinkle(ctx, 0, 0, w, h, Math.round((w * h) / 6000), '#FFFFFF', 21);
}

/** The striped setting sun (a disc of radius s / 2). */
export function drawSun(ctx: Ctx, s: number): void {
  const r = s / 2;
  ctx.save();
  circle(ctx, r, r, r);
  ctx.clip();
  const g = ctx.createLinearGradient(0, 0, 0, s);
  g.addColorStop(0, '#FFE96B');
  g.addColorStop(0.45, '#FF9F1C');
  g.addColorStop(1, '#FF3F9A');
  ctx.fillStyle = g;
  // solid top, then stripes that thin out as the gaps widen toward the bottom
  ctx.fillRect(0, 0, s, s * 0.42);
  let y = s * 0.42;
  for (let i = 0; y < s; i++) {
    y += 3 + i * 1.6;
    const band = Math.max(4, 15 - i * 1.5);
    ctx.fillRect(0, y, s, band);
    y += band;
  }
  ctx.restore();
}

/**
 * Two mountain ridges along the bottom edge of a w × h strip, drawn in greys with a white edge so the scene can
 * tint them. `dips` are the x positions where the ridges stay low so the sun shows.
 */
export function drawMountains(ctx: Ctx, w: number, h: number, dips: readonly number[]): void {
  const ridge = (seed: number, step: number, tall: number, fill: string, edge: boolean) => {
    const rnd = prng(seed);
    const pts: [number, number][] = [];
    for (let x = -step; x <= w + step; x += step * (0.7 + rnd() * 0.6)) {
      const near = Math.min(...dips.map((d) => Math.abs(x - d)));
      const env = Math.min(1, Math.max(0.12, near / 150));
      pts.push([x, h - (8 + rnd() * tall) * env]);
    }
    ctx.beginPath();
    ctx.moveTo(pts[0]![0], h);
    for (const [x, y] of pts) ctx.lineTo(x, y);
    ctx.lineTo(pts.at(-1)![0], h);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (!edge) return;
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  };
  ridge(5, 46, h - 12, '#6E6A8C', false);
  ridge(11, 38, h * 0.7, '#2C2A3A', true);
}

/**
 * The grid floor (w × h, greys for tinting): a bright horizon line along the top edge and perspective lines that
 * fan out from a vanishing point just above it at x = `vx`.
 */
export function drawFloor(ctx: Ctx, w: number, h: number, vx: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#4A4660');
  g.addColorStop(1, '#14121C');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const vy = -30;
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let i = -60; i <= 60; i++) {
    const bx = vx + i * 70;
    ctx.moveTo(vx + ((bx - vx) * -vy) / (h - vy), 0);
    ctx.lineTo(bx, h);
  }
  ctx.stroke();
  const hg = ctx.createLinearGradient(0, 0, 0, 12);
  hg.addColorStop(0, 'rgba(255,255,255,0.95)');
  hg.addColorStop(0.3, 'rgba(255,255,255,0.5)');
  hg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hg;
  ctx.fillRect(0, 0, w, 12);
}

/** One moving floor line (w × 6, white for tinting). */
export function drawGridLine(ctx: Ctx, w: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, 6);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.9)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, 6);
}

/** A dark disc behind the ring (s × s) that fades out past radius `r`, so play always sits on a calm backdrop. */
export function drawBacking(ctx: Ctx, s: number, r: number): void {
  const c = s / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, 'rgba(7,3,24,0.6)');
  g.addColorStop(r / c, 'rgba(7,3,24,0.6)');
  g.addColorStop(1, 'rgba(7,3,24,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
}

/** The neon track (s × s, radius r): a hot-pink tube with a pale core, and a faint inner guide at `inner`. */
export function drawRing(ctx: Ctx, s: number, r: number, inner: number): void {
  const c = s / 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 3;
  circle(ctx, c, c, inner);
  ctx.stroke();
  ctx.strokeStyle = rgba(colors.pink, 0.2);
  ctx.lineWidth = 16;
  circle(ctx, c, c, r);
  ctx.stroke();
  ctx.save();
  ctx.shadowColor = colors.pink;
  ctx.shadowBlur = blur(ctx, 10);
  ctx.strokeStyle = colors.pink;
  ctx.lineWidth = 7;
  circle(ctx, c, c, r);
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = '#FFE3F2';
  ctx.lineWidth = 2.5;
  circle(ctx, c, c, r);
  ctx.stroke();
}

/** A soft white copy of the track, tinted and added over the ring as the hit flash. */
export function drawRingLight(ctx: Ctx, s: number, r: number): void {
  ctx.shadowColor = '#FFFFFF';
  ctx.shadowBlur = blur(ctx, 12);
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 9;
  circle(ctx, s / 2, s / 2, r);
  ctx.stroke();
}

/** Pip (s × s, body radius `r` at the centre): a cyan spark-ball with a face. */
export function drawPip(ctx: Ctx, s: number, face: Face, r: number): void {
  const c = s / 2;
  // spark points behind the body
  ctx.fillStyle = '#E8FDFF';
  for (let i = 0; i < 4; i++) {
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate((i * Math.PI) / 2 + Math.PI / 4);
    ctx.beginPath();
    ctx.moveTo(0, -r - 7);
    ctx.lineTo(3.5, -r + 2);
    ctx.lineTo(-3.5, -r + 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  const g = ctx.createRadialGradient(c - r * 0.35, c - r * 0.4, 1, c, c, r);
  g.addColorStop(0, '#FFFFFF');
  g.addColorStop(0.45, '#8CF2FF');
  g.addColorStop(1, '#14A6E0');
  ctx.fillStyle = g;
  circle(ctx, c, c, r);
  ctx.fill();
  ctx.lineWidth = 2.8;
  ctx.strokeStyle = INK;
  circle(ctx, c, c, r - 1.4);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath();
  ctx.ellipse(c - r * 0.42, c - r * 0.5, r * 0.26, r * 0.15, -0.6, 0, Math.PI * 2);
  ctx.fill();
  // cheeks
  ctx.fillStyle = rgba(colors.pink, 0.6);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(c + side * r * 0.6, c + r * 0.3, r * 0.2, r * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const ex = r * 0.36;
  const ey = c - r * 0.12;
  if (face === 'idle') {
    for (const side of [-1, 1]) {
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.ellipse(c + side * ex, ey, r * 0.25, r * 0.31, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.fillStyle = INK;
      circle(ctx, c + side * ex + 0.6, ey + 1, r * 0.16);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      circle(ctx, c + side * ex - 0.4, ey - 0.6, r * 0.06);
      ctx.fill();
    }
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(c, c + r * 0.22, r * 0.28, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  } else if (face === 'grin') {
    ctx.lineWidth = 2.6;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(c + side * ex, ey + r * 0.14, r * 0.2, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    }
    ctx.fillStyle = '#4A0F2E';
    ctx.beginPath();
    ctx.moveTo(c - r * 0.48, c + r * 0.14);
    ctx.quadraticCurveTo(c, c + r * 0.95, c + r * 0.48, c + r * 0.14);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = colors.pink;
    ctx.beginPath();
    ctx.ellipse(c, c + r * 0.48, r * 0.2, r * 0.11, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.lineWidth = 2.4;
    for (const side of [-1, 1]) {
      const x = c + side * ex;
      ctx.beginPath();
      ctx.moveTo(x - side * r * 0.2, ey - r * 0.16);
      ctx.lineTo(x + side * r * 0.12, ey);
      ctx.lineTo(x - side * r * 0.2, ey + r * 0.16);
      ctx.stroke();
    }
    ctx.beginPath();
    const my = c + r * 0.42;
    ctx.moveTo(c - r * 0.36, my);
    for (let i = 1; i <= 4; i++)
      ctx.lineTo(c - r * 0.36 + (i * r * 0.72) / 4, my + (i % 2 ? -r * 0.12 : 0));
    ctx.stroke();
  }
}

/** The hit zone around a target star (s × s): a translucent pink bubble with a bright rim. */
export function drawZone(ctx: Ctx, s: number): void {
  const c = s / 2;
  ctx.fillStyle = rgba(colors.pink, 0.36);
  circle(ctx, c, c, c - 2);
  ctx.fill();
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = '#FFB3DA';
  circle(ctx, c, c, c - 2.75);
  ctx.stroke();
}

/** The Perfect bullseye (s × s): a pale-gold disc holding a gold star. */
export function drawBull(ctx: Ctx, s: number): void {
  const c = s / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, '#FFFFFF');
  g.addColorStop(0.7, '#FFF6C4');
  g.addColorStop(1, '#FFD84A');
  ctx.fillStyle = g;
  circle(ctx, c, c, c - 1);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  circle(ctx, c, c, c - 1.5);
  ctx.stroke();
  starPath(ctx, c, c + s * 0.03, 5, s * 0.34, s * 0.15);
  ctx.fillStyle = colors.orange;
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

/** Soft round light (tinted and added for glows, the comet tail and twinkling stars). */
export function drawGlow(ctx: Ctx, s: number): void {
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
}

/** An expanding ring for the Perfect shockwave (s × s). */
export function drawShock(ctx: Ctx, s: number): void {
  ctx.lineWidth = s * 0.05;
  ctx.strokeStyle = '#FFFFFF';
  circle(ctx, s / 2, s / 2, s / 2 - ctx.lineWidth);
  ctx.stroke();
}
