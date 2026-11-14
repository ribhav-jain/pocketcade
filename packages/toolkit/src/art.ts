// Shared 2D art helpers for the Pocketcade look (candy-glossy shapes, stars, gradients) and brand-font loading.
// Plain Canvas 2D, so DOM games and Phaser canvas textures draw the same way. Importing does no work.
import { FONT_DISPLAY, FONT_STACK, mixHex } from './tokens.ts';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Lighten (amt > 0, towards white) or darken (amt < 0, towards black) a '#RRGGBB' colour. */
export function shade(hex: string, amt: number): string {
  return amt >= 0 ? mixHex(hex, '#FFFFFF', amt) : mixHex(hex, '#000000', -amt);
}

/** '#RRGGBB' + alpha → 'rgba(…)'. */
export function rgba(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** Adds a rounded-rectangle path (does not fill or stroke). */
export function roundRectPath(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Adds an n-pointed star path centred on (cx, cy). */
export function starPath(
  ctx: Ctx,
  cx: number,
  cy: number,
  points: number,
  outer: number,
  inner: number,
  rotation = -Math.PI / 2,
): void {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = rotation + (i * Math.PI) / points;
    const [x, y] = [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.closePath();
}

export interface GlossyOptions {
  /** corner radius (default 22 % of the shorter side) */
  radius?: number;
  /** height of the darker bottom "lip" that makes the tile look pressable (default 8 % of h; 0 = flat) */
  depth?: number;
  /** outline colour (default a darker shade of the base) */
  outline?: string | null;
  /** outline width (default 2) */
  lineWidth?: number;
  /** top highlight strength 0..1 (default 0.35) */
  gloss?: number;
  /** soft drop shadow under the tile (default true) */
  shadow?: boolean;
}

/**
 * The house "candy tile": a rounded rectangle with a top-to-bottom gradient, a darker lip underneath, a glossy
 * highlight band and an outline. Fits inside (x, y, w, h), lip included.
 */
export function glossyRect(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  base: string,
  o: GlossyOptions = {},
): void {
  const r = o.radius ?? Math.min(w, h) * 0.22;
  const depth = o.depth ?? Math.round(h * 0.08);
  const face = h - depth;
  ctx.save();
  if (o.shadow ?? true) {
    ctx.shadowColor = 'rgba(8,4,24,0.45)';
    ctx.shadowBlur = Math.max(2, h * 0.08);
    ctx.shadowOffsetY = Math.max(1, h * 0.04);
  }
  // lip
  ctx.fillStyle = shade(base, -0.38);
  roundRectPath(ctx, x, y + depth, w, face, r);
  ctx.fill();
  ctx.restore();
  // face
  ctx.save();
  const g = ctx.createLinearGradient(0, y, 0, y + face);
  g.addColorStop(0, shade(base, 0.22));
  g.addColorStop(1, shade(base, -0.08));
  ctx.fillStyle = g;
  roundRectPath(ctx, x, y, w, face, r);
  ctx.fill();
  // gloss band
  const gloss = o.gloss ?? 0.35;
  if (gloss > 0) {
    ctx.clip();
    const hg = ctx.createLinearGradient(0, y, 0, y + face * 0.5);
    hg.addColorStop(0, `rgba(255,255,255,${gloss})`);
    hg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hg;
    roundRectPath(ctx, x + w * 0.06, y + face * 0.05, w * 0.88, face * 0.42, r * 0.8);
    ctx.fill();
  }
  ctx.restore();
  const outline = o.outline === undefined ? shade(base, -0.45) : o.outline;
  if (outline) {
    ctx.save();
    ctx.lineWidth = o.lineWidth ?? 2;
    ctx.strokeStyle = outline;
    roundRectPath(
      ctx,
      x + ctx.lineWidth / 2,
      y + ctx.lineWidth / 2,
      w - ctx.lineWidth,
      h - ctx.lineWidth,
      r,
    );
    ctx.stroke();
    ctx.restore();
  }
}

/** A glossy ball: radial gradient body, rim shade and a specular dot. */
export function glossyCircle(
  ctx: Ctx,
  cx: number,
  cy: number,
  r: number,
  base: string,
  o: { outline?: string | null; shadow?: boolean } = {},
): void {
  ctx.save();
  if (o.shadow ?? true) {
    ctx.shadowColor = 'rgba(8,4,24,0.45)';
    ctx.shadowBlur = r * 0.35;
    ctx.shadowOffsetY = r * 0.12;
  }
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
  g.addColorStop(0, shade(base, 0.45));
  g.addColorStop(0.55, base);
  g.addColorStop(1, shade(base, -0.35));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  const outline = o.outline === undefined ? shade(base, -0.5) : o.outline;
  if (outline) {
    ctx.lineWidth = Math.max(1.5, r * 0.08);
    ctx.strokeStyle = outline;
    ctx.beginPath();
    ctx.arc(cx, cy, r - ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.35, cy - r * 0.42, r * 0.22, r * 0.14, -0.6, 0, Math.PI * 2);
  ctx.fill();
}

/** Fills the whole rect with a vertical gradient through `stops` (evenly spaced unless [offset, colour] pairs). */
export function fillGradient(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  stops: readonly (string | readonly [number, string])[],
  dir: 'v' | 'h' = 'v',
): void {
  const g =
    dir === 'v'
      ? ctx.createLinearGradient(0, y, 0, y + h)
      : ctx.createLinearGradient(x, 0, x + w, 0);
  stops.forEach((s, i) =>
    typeof s === 'string'
      ? g.addColorStop(stops.length > 1 ? i / (stops.length - 1) : 0, s)
      : g.addColorStop(s[0], s[1]),
  );
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

/** Small seeded PRNG (mulberry32) returning [0, 1), for decoration only; game state uses createRng. */
export function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

/** Scatters soft dots ("stars" or "bokeh") deterministically from `seed` over the rect. */
export function sprinkle(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  count: number,
  color: string,
  seed = 1,
  size: readonly [number, number] = [0.8, 2.2],
): void {
  const rnd = prng(seed);
  for (let i = 0; i < count; i++) {
    const r = size[0] + rnd() * (size[1] - size[0]);
    ctx.globalAlpha = 0.35 + rnd() * 0.65;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + rnd() * w, y + rnd() * h, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** CSS font shorthand in the brand faces: font('display', 700, 32). */
export function font(face: 'display' | 'body', weight: number, px: number): string {
  return `${weight} ${px}px ${face === 'display' ? FONT_DISPLAY : FONT_STACK}`;
}

/**
 * Waits (≤ `timeoutMs`) for the brand faces, so canvas text drawn right after uses them. Resolves at once where the
 * page doesn't declare them (no @font-face → nothing to load) or the Font Loading API is missing.
 */
export function loadBrandFonts(timeoutMs = 800): Promise<void> {
  const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
  if (!fonts?.load) return Promise.resolve();
  const loads = Promise.all([
    fonts.load('700 32px "Fredoka Variable"'),
    fonts.load('500 32px "Fredoka Variable"'),
    fonts.load('400 16px "Nunito Variable"'),
    fonts.load('700 16px "Nunito Variable"'),
  ]).then(
    () => undefined,
    () => undefined,
  );
  return new Promise((resolve) => {
    const t = setTimeout(resolve, timeoutMs);
    void loads.then(() => {
      clearTimeout(t);
      resolve();
    });
  });
}
