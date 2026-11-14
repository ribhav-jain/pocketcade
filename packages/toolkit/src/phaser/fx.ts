// Shared game-feel helpers for Phaser games (Pocketcade look): crisp canvas textures, particle bursts, floating
// score text, shake/flash, HUD pills and gradient backdrops. Every effect honours reduced motion. Phaser is used
// through the scene only (types-only import).
import type Phaser from 'phaser';
import { glossyCircle, prng, rgba, roundRectPath, sprinkle, starPath } from '../art.ts';
import type { TkContext } from '../context.ts';
import { FONT_DISPLAY, colorNum, colors } from '../tokens.ts';

type Ctx = CanvasRenderingContext2D;

const tkOf = (scene: Phaser.Scene) => scene.registry.get('tk') as TkContext | undefined;
const reduced = (scene: Phaser.Scene) => tkOf(scene)?.motion.reduced ?? false;
/** The camera zoom is the render scale (design units → canvas pixels). */
const zoomOf = (scene: Phaser.Scene) => Math.max(1, scene.cameras?.main?.zoom || 1);

function scales(scene: Phaser.Scene): Map<string, number> {
  let m = scene.registry.get('tk.texScale') as Map<string, number> | undefined;
  if (!m) {
    m = new Map();
    scene.registry.set('tk.texScale', m);
  }
  return m;
}

/**
 * Draws a texture once per mount with Canvas 2D, at the render scale so it stays crisp. `draw` works in design
 * units (w × h). Show it with `canvasImage()` (or scale the image by `1 / texScale(scene, key)`). Pass
 * `scale: 1` for big, soft backdrops to save memory.
 */
export function canvasTexture(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  draw: (ctx: Ctx, w: number, h: number) => void,
  o: { scale?: number } = {},
): string {
  if (scene.textures.exists(key)) return key;
  const z = o.scale ?? zoomOf(scene);
  const t = scene.textures.createCanvas(
    key,
    Math.max(1, Math.ceil(w * z)),
    Math.max(1, Math.ceil(h * z)),
  );
  if (!t) return key;
  const ctx = t.getContext();
  ctx.save();
  ctx.scale(z, z);
  draw(ctx, w, h);
  ctx.restore();
  t.refresh();
  scales(scene).set(key, z);
  return key;
}

/** Scale a texture made by `canvasTexture` was drawn at (1 for any other texture). */
export function texScale(scene: Phaser.Scene, key: string): number {
  return scales(scene).get(key) ?? 1;
}

/** Adds an image of a `canvasTexture` at design size. */
export function canvasImage(
  scene: Phaser.Scene,
  x: number,
  y: number,
  key: string,
): Phaser.GameObjects.Image {
  return scene.add.image(x, y, key).setScale(1 / texScale(scene, key));
}

// ─── particles ───

export type FxShape = 'dot' | 'star' | 'spark' | 'square' | 'heart';

function fxTexture(scene: Phaser.Scene, shape: FxShape): string {
  return canvasTexture(
    scene,
    `tk-fx-${shape}`,
    32,
    32,
    (ctx) => {
      ctx.fillStyle = '#FFFFFF';
      if (shape === 'dot') {
        ctx.beginPath();
        ctx.arc(16, 16, 14, 0, Math.PI * 2);
        ctx.fill();
      } else if (shape === 'star') {
        starPath(ctx, 16, 17, 5, 15, 6.5);
        ctx.fill();
      } else if (shape === 'square') {
        roundRectPath(ctx, 4, 4, 24, 24, 5);
        ctx.fill();
      } else if (shape === 'heart') {
        ctx.beginPath();
        ctx.moveTo(16, 28);
        ctx.bezierCurveTo(2, 18, 2, 6, 10, 5);
        ctx.bezierCurveTo(14, 5, 16, 8, 16, 10);
        ctx.bezierCurveTo(16, 8, 18, 5, 22, 5);
        ctx.bezierCurveTo(30, 6, 30, 18, 16, 28);
        ctx.fill();
      } else {
        const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.35, 'rgba(255,255,255,0.7)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 32, 32);
      }
    },
    { scale: 1 },
  );
}

/** Decoration-only randomness (never game state, so attract and replays stay deterministic). */
const rnd = prng(0x9e3779b9);

export interface BurstOptions {
  /** default 12 (4 with reduced motion) */
  count?: number;
  /** '#RRGGBB' colours picked in turn (default the brand candy set) */
  colors?: readonly string[];
  shape?: FxShape;
  /** travel distance in design units (default 90) */
  distance?: number;
  /** particle size in design units (default 10) */
  size?: number;
  lifeMs?: number;
  /** extra downward drift in design units (default 0) */
  gravity?: number;
  /** direction (radians) and spread (default full circle) */
  angle?: number;
  spread?: number;
  depth?: number;
  /** additive glow (default true for 'spark') */
  additive?: boolean;
}

const CANDY = [colors.pink, colors.gold, colors.sky, colors.lime, colors.purple, colors.orange];

/** A short particle burst at (x, y) in design units. */
export function burst(scene: Phaser.Scene, x: number, y: number, o: BurstOptions = {}): void {
  const calm = reduced(scene);
  const count = calm ? Math.min(4, o.count ?? 12) : (o.count ?? 12);
  const shape = o.shape ?? 'dot';
  const key = fxTexture(scene, shape);
  const palette = o.colors ?? CANDY;
  const size = o.size ?? 10;
  const dist = (o.distance ?? 90) * (calm ? 0.25 : 1);
  const life = o.lifeMs ?? 600;
  const spread = o.spread ?? Math.PI * 2;
  const additive = o.additive ?? shape === 'spark';
  for (let i = 0; i < count; i++) {
    const img = scene.add.image(x, y, key).setDepth(o.depth ?? 1000);
    img.setTint(colorNum(palette[i % palette.length]!));
    if (additive) img.setBlendMode('ADD');
    const s = (size * (0.6 + rnd() * 0.8)) / 32;
    img.setScale(s);
    const a = (o.angle ?? -Math.PI / 2) + (rnd() - 0.5) * spread;
    const d = dist * (0.45 + rnd() * 0.75);
    scene.tweens.add({
      targets: img,
      x: x + Math.cos(a) * d,
      y: y + Math.sin(a) * d + (o.gravity ?? 0),
      alpha: 0,
      scale: s * 0.35,
      angle: shape === 'star' || shape === 'square' ? (rnd() - 0.5) * 540 : 0,
      duration: life * (0.7 + rnd() * 0.5),
      ease: 'Cubic.easeOut',
      onComplete: () => img.destroy(),
    });
  }
}

export interface PopTextOptions {
  color?: string;
  px?: number;
  /** how far it floats up (default 36) */
  rise?: number;
  ms?: number;
  depth?: number;
}

/** Floating text ("+120", "Perfect!") that pops in and drifts up. */
export function popText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  o: PopTextOptions = {},
): Phaser.GameObjects.Text {
  const px = o.px ?? 26;
  const t = scene.add
    .text(x, y, text, {
      fontFamily: FONT_DISPLAY,
      fontSize: `${px}px`,
      fontStyle: 'bold',
      color: o.color ?? colors.gold,
      stroke: colors.ink,
      strokeThickness: Math.max(3, Math.round(px * 0.2)),
      align: 'center',
    })
    .setOrigin(0.5)
    .setDepth(o.depth ?? 1001);
  t.setResolution(Math.ceil(zoomOf(scene)));
  const ms = o.ms ?? 750;
  if (reduced(scene)) {
    scene.tweens.add({
      targets: t,
      alpha: 0,
      delay: ms * 0.6,
      duration: ms * 0.4,
      onComplete: () => t.destroy(),
    });
    return t;
  }
  t.setScale(0.4);
  scene.tweens.add({ targets: t, scale: 1, duration: 160, ease: 'Back.easeOut' });
  scene.tweens.add({
    targets: t,
    y: y - (o.rise ?? 36),
    alpha: 0,
    delay: 160,
    duration: ms - 160,
    ease: 'Cubic.easeIn',
    onComplete: () => t.destroy(),
  });
  return t;
}

/** Camera shake (skipped with reduced motion). Intensity is a fraction of the view (default 0.008). */
export function shake(scene: Phaser.Scene, ms = 160, intensity = 0.008): void {
  if (tkOf(scene)?.motion.shake() === false) return;
  scene.cameras.main.shake(ms, intensity);
}

/** A soft full-screen colour flash (half strength with reduced motion). */
export function flash(
  scene: Phaser.Scene,
  color: string = colors.text,
  ms = 160,
  alpha = 0.45,
): void {
  const cam = scene.cameras.main;
  const w = cam.width / cam.zoom;
  const h = cam.height / cam.zoom;
  const r = scene.add
    .rectangle(0, 0, w, h, colorNum(color), reduced(scene) ? alpha / 2 : alpha)
    .setOrigin(0)
    .setDepth(9000);
  r.setScrollFactor(0);
  scene.tweens.add({
    targets: r,
    alpha: 0,
    duration: ms,
    ease: 'Quad.easeOut',
    onComplete: () => r.destroy(),
  });
}

/** Scale "pop" on any object (counters, buttons), skipped with reduced motion. */
export function bump(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject,
  amount = 1.18,
  ms = 180,
): void {
  if (reduced(scene)) return;
  const base = (target as unknown as { __tkBase?: number }).__tkBase ?? target.scaleX;
  (target as unknown as { __tkBase?: number }).__tkBase = base;
  scene.tweens.killTweensOf(target);
  target.setScale(base * amount);
  scene.tweens.add({
    targets: target,
    scaleX: base,
    scaleY: base,
    duration: ms,
    ease: 'Back.easeOut',
  });
}

// ─── HUD ───

export type HudIcon =
  'star' | 'heart' | 'clock' | 'coin' | 'flag' | 'trophy' | 'bolt' | 'moves' | 'none';

function drawGlyph(ctx: Ctx, icon: HudIcon, c: number, r: number): void {
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const s = r * 0.62;
  switch (icon) {
    case 'star':
      starPath(ctx, c, c + s * 0.05, 5, s, s * 0.45);
      ctx.fill();
      break;
    case 'heart':
      ctx.beginPath();
      ctx.moveTo(c, c + s * 0.8);
      ctx.bezierCurveTo(c - s * 1.2, c, c - s * 0.6, c - s * 0.9, c, c - s * 0.35);
      ctx.bezierCurveTo(c + s * 0.6, c - s * 0.9, c + s * 1.2, c, c, c + s * 0.8);
      ctx.fill();
      break;
    case 'clock':
      ctx.lineWidth = r * 0.16;
      ctx.beginPath();
      ctx.arc(c, c, s * 0.85, 0, Math.PI * 2);
      ctx.moveTo(c, c - s * 0.5);
      ctx.lineTo(c, c);
      ctx.lineTo(c + s * 0.4, c + s * 0.2);
      ctx.stroke();
      break;
    case 'coin':
      ctx.lineWidth = r * 0.14;
      ctx.beginPath();
      ctx.arc(c, c, s * 0.8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillRect(c - r * 0.07, c - s * 0.45, r * 0.14, s * 0.9);
      break;
    case 'flag':
      ctx.lineWidth = r * 0.14;
      ctx.beginPath();
      ctx.moveTo(c - s * 0.55, c + s * 0.85);
      ctx.lineTo(c - s * 0.55, c - s * 0.8);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(c - s * 0.5, c - s * 0.8);
      ctx.lineTo(c + s * 0.75, c - s * 0.45);
      ctx.lineTo(c - s * 0.5, c - s * 0.05);
      ctx.fill();
      break;
    case 'trophy':
      ctx.beginPath();
      ctx.moveTo(c - s * 0.7, c - s * 0.75);
      ctx.lineTo(c + s * 0.7, c - s * 0.75);
      ctx.quadraticCurveTo(c + s * 0.65, c + s * 0.2, c, c + s * 0.25);
      ctx.quadraticCurveTo(c - s * 0.65, c + s * 0.2, c - s * 0.7, c - s * 0.75);
      ctx.fill();
      ctx.fillRect(c - r * 0.07, c + s * 0.2, r * 0.14, s * 0.4);
      ctx.fillRect(c - s * 0.45, c + s * 0.6, s * 0.9, s * 0.22);
      break;
    case 'bolt':
      ctx.beginPath();
      ctx.moveTo(c + s * 0.15, c - s * 0.9);
      ctx.lineTo(c - s * 0.55, c + s * 0.1);
      ctx.lineTo(c - s * 0.02, c + s * 0.1);
      ctx.lineTo(c - s * 0.2, c + s * 0.9);
      ctx.lineTo(c + s * 0.55, c - s * 0.15);
      ctx.lineTo(c + s * 0.02, c - s * 0.15);
      ctx.closePath();
      ctx.fill();
      break;
    case 'moves':
      ctx.lineWidth = r * 0.15;
      ctx.beginPath();
      ctx.arc(c, c, s * 0.7, Math.PI * 0.15, Math.PI * 1.75);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(c + s * 0.85, c - s * 0.75);
      ctx.lineTo(c + s * 0.75, c - s * 0.1);
      ctx.lineTo(c + s * 0.15, c - s * 0.4);
      ctx.closePath();
      ctx.fill();
      break;
    case 'none':
      break;
  }
}

/** A round gradient badge with a white glyph, as a texture key (size in design units). */
export function iconTexture(
  scene: Phaser.Scene,
  icon: HudIcon,
  accent: string = colors.pink,
  size = 32,
): string {
  return canvasTexture(scene, `tk-icon-${icon}-${accent}-${size}`, size, size, (ctx) => {
    const c = size / 2;
    glossyCircle(ctx, c, c, c - 1.5, accent, { shadow: false });
    drawGlyph(ctx, icon, c, c);
  });
}

export interface HudPillOptions {
  icon?: HudIcon;
  /** icon badge colour */
  accent?: string;
  /** small caption above the value (e.g. "Score") */
  label?: string;
  value?: string;
  /** design units (default 150 × 48) */
  width?: number;
  height?: number;
  depth?: number;
}

export interface HudPill {
  readonly container: Phaser.GameObjects.Container;
  set(value: string): void;
  setLabel(text: string): void;
  /** quick scale pop (no-op with reduced motion) */
  bump(): void;
}

/** The house HUD element: a dark glassy pill with an icon badge, an optional caption and a bold value. */
export function hudPill(
  scene: Phaser.Scene,
  x: number,
  y: number,
  o: HudPillOptions = {},
): HudPill {
  const w = o.width ?? 150;
  const h = o.height ?? 48;
  const bg = canvasTexture(scene, `tk-pill-${w}x${h}`, w, h, (ctx) => {
    roundRectPath(ctx, 1, 1, w - 2, h - 2, h / 2);
    ctx.fillStyle = rgba(colors.bg, 0.66);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.stroke();
    const g = ctx.createLinearGradient(0, 0, 0, h * 0.5);
    g.addColorStop(0, 'rgba(255,255,255,0.10)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    roundRectPath(ctx, 3, 3, w - 6, h * 0.48, h / 2.4);
    ctx.fill();
  });
  const parts: Phaser.GameObjects.GameObject[] = [canvasImage(scene, 0, 0, bg).setOrigin(0)];
  const pad = h * 0.14;
  let tx = h * 0.42;
  if ((o.icon ?? 'none') !== 'none') {
    const size = h - pad * 2;
    const key = iconTexture(scene, o.icon!, o.accent ?? colors.pink, Math.round(size));
    parts.push(canvasImage(scene, pad + size / 2, h / 2, key));
    tx = pad + size + h * 0.2;
  }
  const z = Math.ceil(zoomOf(scene));
  const label = scene.add
    .text(tx, h * 0.27, o.label ?? '', {
      fontFamily: FONT_DISPLAY,
      fontSize: `${Math.round(h * 0.24)}px`,
      fontStyle: '600',
      color: colors.textMuted,
    })
    .setOrigin(0, 0.5)
    .setResolution(z);
  const value = scene.add
    .text(tx, o.label ? h * 0.62 : h / 2, o.value ?? '', {
      fontFamily: FONT_DISPLAY,
      fontSize: `${Math.round(h * (o.label ? 0.42 : 0.5))}px`,
      fontStyle: 'bold',
      color: colors.text,
    })
    .setOrigin(0, 0.5)
    .setResolution(z);
  label.visible = !!o.label;
  parts.push(label, value);
  const container = scene.add.container(x, y, parts).setDepth(o.depth ?? 500);
  container.setSize(w, h);
  return {
    container,
    set(v) {
      if (value.text !== v) value.setText(v);
    },
    setLabel(t) {
      if (label.text !== t) label.setText(t);
      label.visible = !!t;
    },
    bump() {
      bump(scene, value, 1.2);
    },
  };
}

// ─── backdrops ───

export interface BackdropOptions {
  /** gradient stops top → bottom */
  stops: readonly string[];
  /** twinkles/bokeh count (default 0) */
  stars?: number;
  starColor?: string;
  seed?: number;
  /** soft radial glows: [x, y, radius, colour, alpha] in design units */
  glows?: readonly (readonly [number, number, number, string, number])[];
  /** extra drawing on top (hills, skylines …), in design units */
  draw?: (ctx: Ctx, w: number, h: number) => void;
}

/**
 * A background image drawn once per mount (scale 1, depth -1000). It covers the design area (w × h) plus the
 * bleed around it, so it fills the view at every frame shape. `draw` works in design units and may paint past
 * the edges, from -bleed to w + bleed.
 */
export function backdrop(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  o: BackdropOptions,
): Phaser.GameObjects.Image {
  const { x: bx, y: by } = tkOf(scene)?.layout.bleed ?? { x: 0, y: 0 };
  const fullW = w + bx * 2;
  const fullH = h + by * 2;
  canvasTexture(
    scene,
    key,
    fullW,
    fullH,
    (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 0, fullH);
      o.stops.forEach((s, i) =>
        g.addColorStop(o.stops.length > 1 ? i / (o.stops.length - 1) : 0, s),
      );
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, fullW, fullH);
      ctx.translate(bx, by);
      for (const [gx, gy, gr, gc, ga] of o.glows ?? []) {
        const rg = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
        rg.addColorStop(0, rgba(gc, ga));
        rg.addColorStop(1, rgba(gc, 0));
        ctx.fillStyle = rg;
        ctx.fillRect(gx - gr, gy - gr, gr * 2, gr * 2);
      }
      if (o.stars) {
        const count = Math.round((o.stars * fullW * fullH) / (w * h));
        sprinkle(ctx, -bx, -by, fullW, fullH, count, o.starColor ?? '#FFFFFF', o.seed ?? 7);
      }
      o.draw?.(ctx, w, h);
    },
    { scale: 1 },
  );
  return scene.add.image(-bx, -by, key).setOrigin(0).setDepth(-1000);
}
