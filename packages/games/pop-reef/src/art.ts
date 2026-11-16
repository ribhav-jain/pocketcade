// Pop Reef art (Canvas 2D, drawn once per mount into textures by scene.ts): the four reef zones, glossy bubbles
// with their shape marks, stones, urchins, the rainbow bubble, Puff the pufferfish (normal and puffed up) with six
// faces, seaweed, light rays, droplets, the aim guide, the danger line and the HUD pieces. Decoration only.
import {
  SHAPES,
  colors,
  glossyCircle,
  glossyRect,
  prng,
  rgba,
  roundRectPath,
  shade,
  starPath,
} from '@pocketcade/toolkit';
import { COLOURS, R, RAINBOW, STONE, TOP, URCHIN } from './sim.ts';

type Ctx = CanvasRenderingContext2D;

/** Layout in design units (720 × 960). */
export const W = 720;
export const H = 960;
export const HUD_H = TOP;
/** Pop Reef's accent: lagoon teal. */
export const ACCENT = '#2DD4BF';
export const INK = colors.ink;
const OUTLINE = '#2B1638';
/** Bubble colours 0–5: a toolkit accent each, drawn with its paired shape (never colour alone). */
export const KIND_COLORS = ['vermillion', 'yellow', 'sky', 'green', 'purple', 'orange'] as const;
/** The colour a bubble kind bursts into (stones grey, urchins plum, the rainbow white). */
export const kindColor = (k: number) =>
  k === STONE
    ? '#9AA3B8'
    : k === URCHIN
      ? '#B45CE0'
      : k === RAINBOW
        ? '#FFFFFF'
        : colors[KIND_COLORS[k]!];
/** Bubble texture size (the bubble is R wide plus a rim). */
export const BUBBLE = 2 * R + 4;
/** Puff's body texture; (cx, cy) is the body centre. */
export const PUFF = { x: 360, y: 914, w: 150, h: 128, cx: 75, cy: 66, r: 40 } as const;
export const FACE = { w: 84, h: 56, ox: 42, oy: 24 } as const;
/** eye centres relative to Puff's centre (the face texture's origin) */
export const EYES = [
  [-15, -2],
  [15, -2],
] as const;
export type Face = 'idle' | 'blink' | 'happy' | 'worried' | 'blow' | 'sad';
export const FACES: readonly Face[] = ['idle', 'blink', 'happy', 'worried', 'blow', 'sad'];
/** faces that show the pupils (which follow the aim) */
export const OPEN_EYES: ReadonlySet<Face> = new Set(['idle', 'worried', 'blow']);
export const NEXT = { x: 226, y: 912 } as const;
export const PIPS = { x: 462, y: 916, gap: 22 } as const;
export const LEAF = { w: 30, h: 42 } as const;
export const RAY = { w: 240, h: 760 } as const;
export const FISH = { w: 44, h: 32 } as const;
export const SIL = { w: 64, h: 32 } as const;
export const CARD = { w: 520, h: 430 } as const;
export const BUTTON = { w: 226, h: 68 } as const;

/** A reef zone's look: backdrop gradient, glow, reef silhouettes near to far, sand, rock and seaweed tints. */
export interface Zone {
  stops: readonly [string, string, string, string];
  glow: string;
  far: string;
  mid: string;
  near: string;
  sand: readonly [string, string];
  /** ceiling and side walls */
  rock: string;
  /** the darker water of the play field */
  field: string;
  weed: readonly [string, string];
  /** light rays from the surface (0 = none) */
  rays: number;
  /** drifting fish silhouettes */
  life: string;
}
export const ZONE_ART: readonly Zone[] = [
  {
    stops: ['#2A86B8', '#1C5F9A', '#16407C', '#122B5C'],
    glow: '#BFF6FF',
    far: '#1E5A94',
    mid: '#184A80',
    near: '#123763',
    sand: ['#3A6E9E', '#254C7E'],
    rock: '#0E2548',
    field: '#0B2146',
    weed: ['#2BD47D', '#1FA39A'],
    rays: 1,
    life: '#3F8FC4',
  },
  {
    stops: ['#1E7A72', '#165E66', '#104552', '#0B2E40'],
    glow: '#C8FFD9',
    far: '#17595F',
    mid: '#12474F',
    near: '#0C343D',
    sand: ['#2C6660', '#1A4448'],
    rock: '#08262E',
    field: '#072229',
    weed: ['#57D96B', '#1FA36A'],
    rays: 0.8,
    life: '#2F8F86',
  },
  {
    stops: ['#5B3A8E', '#40327E', '#2A2A68', '#1A1B4A'],
    glow: '#FFB3D1',
    far: '#3A3478',
    mid: '#2E2A68',
    near: '#221F52',
    sand: ['#4A3A78', '#2C2756'],
    rock: '#15143A',
    field: '#131236',
    weed: ['#FF7AB0', '#C77DFF'],
    rays: 0.6,
    life: '#6A56B0',
  },
  {
    stops: ['#1D1B52', '#15143E', '#0E0E2E', '#090920'],
    glow: '#38D6FF',
    far: '#17174A',
    mid: '#12123A',
    near: '#0C0C2A',
    sand: ['#1E1E4E', '#101030'],
    rock: '#06061A',
    field: '#07071C',
    weed: ['#2DD4BF', '#38D6FF'],
    rays: 0,
    life: '#2A6E9E',
  },
];

function circle(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

function poly(ctx: Ctx, pts: readonly (readonly [number, number])[]): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

/** The shape mark for a bubble kind, as a path of half-size s around (x, y). */
function markPath(
  ctx: Ctx,
  shape: (typeof SHAPES)[keyof typeof SHAPES],
  x: number,
  y: number,
  s: number,
) {
  switch (shape) {
    case 'circle':
      circle(ctx, x, y, s * 0.78);
      break;
    case 'square':
      roundRectPath(ctx, x - s * 0.72, y - s * 0.72, s * 1.44, s * 1.44, s * 0.22);
      break;
    case 'triangle':
      poly(ctx, [
        [x, y - s * 0.95],
        [x + s * 0.95, y + s * 0.7],
        [x - s * 0.95, y + s * 0.7],
      ]);
      break;
    case 'diamond':
      poly(ctx, [
        [x, y - s],
        [x + s * 0.78, y],
        [x, y + s],
        [x - s * 0.78, y],
      ]);
      break;
    case 'star':
      starPath(ctx, x, y + s * 0.06, 5, s, s * 0.45);
      break;
    case 'cross': {
      const a = s * 0.3;
      poly(ctx, [
        [x - a, y - s],
        [x + a, y - s],
        [x + a, y - a],
        [x + s, y - a],
        [x + s, y + a],
        [x + a, y + a],
        [x + a, y + s],
        [x - a, y + s],
        [x - a, y + a],
        [x - s, y + a],
        [x - s, y - a],
        [x - a, y - a],
      ]);
      break;
    }
    case 'hexagon':
      poly(
        ctx,
        Array.from({ length: 6 }, (_, i) => {
          const t = (i * Math.PI) / 3 + Math.PI / 6;
          return [x + Math.cos(t) * s * 0.92, y + Math.sin(t) * s * 0.92] as const;
        }),
      );
      break;
  }
}

/** The body every bubble shares: a flat candy ball with a darker underside, a dark rim and one crisp highlight. */
function ball(ctx: Ctx, c: number, r: number, base: string): void {
  ctx.save();
  circle(ctx, c, c, r);
  ctx.fillStyle = shade(base, -0.24);
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = base;
  circle(ctx, c - r * 0.05, c - r * 0.14, r * 0.97);
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = 3;
  ctx.strokeStyle = shade(base, -0.62);
  circle(ctx, c, c, r - 1.5);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath();
  ctx.ellipse(c - r * 0.42, c - r * 0.5, r * 0.24, r * 0.12, -0.7, 0, Math.PI * 2);
  ctx.fill();
}

/** A bubble of colour k with its shape mark in a deep shade. */
export function drawBubble(ctx: Ctx, s: number, k: number): void {
  const base = kindColor(k);
  const c = s / 2;
  ball(ctx, c, R - 0.5, base);
  markPath(ctx, SHAPES[KIND_COLORS[k]!], c, c + 2, 13);
  ctx.fillStyle = shade(base, -0.62);
  ctx.fill();
}

/** A baby fish seen from the side, facing right, about w × h around (x, y). */
export function drawFish(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  ctx.lineJoin = 'round';
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = OUTLINE;
  ctx.fillStyle = '#FF8F6B';
  poly(ctx, [
    [x - w * 0.18, y],
    [x - w * 0.5, y - h * 0.38],
    [x - w * 0.5, y + h * 0.38],
  ]);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#FFF3D6';
  ctx.beginPath();
  ctx.ellipse(x + w * 0.1, y, w * 0.36, h * 0.44, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = OUTLINE;
  circle(ctx, x + w * 0.24, y - h * 0.08, 3);
  ctx.fill();
}

/** A bubble of colour k carrying a fish; the shape mark moves to a badge on the rim. */
export function drawFishBubble(ctx: Ctx, s: number, k: number): void {
  const base = kindColor(k);
  const c = s / 2;
  ball(ctx, c, R - 0.5, base);
  drawFish(ctx, c - 2, c + 5, 40, 28);
  ctx.fillStyle = shade(base, -0.62);
  circle(ctx, c + 16, c - 17, 11);
  ctx.fill();
  markPath(ctx, SHAPES[KIND_COLORS[k]!], c + 16, c - 17, 7);
  ctx.fillStyle = shade(base, 0.35);
  ctx.fill();
}

/** A stone: a matt grey boulder with a crack, so it never reads as a bubble. */
export function drawStone(ctx: Ctx, s: number): void {
  const c = s / 2;
  const r = R - 1;
  const rnd = prng(0x570e);
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2;
    const d = r * (0.9 + rnd() * 0.1);
    return [c + Math.cos(a) * d, c + Math.sin(a) * d] as const;
  });
  ctx.lineJoin = 'round';
  poly(ctx, pts);
  ctx.fillStyle = '#6F7890';
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = '#9AA3B8';
  circle(ctx, c - 4, c - 9, r * 0.92);
  ctx.fill();
  ctx.restore();
  poly(ctx, pts);
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#2E3348';
  ctx.stroke();
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(c - 4, c - 16);
  ctx.lineTo(c + 3, c - 4);
  ctx.lineTo(c - 5, c + 5);
  ctx.lineTo(c + 2, c + 16);
  ctx.moveTo(c + 3, c - 4);
  ctx.lineTo(c + 13, c - 1);
  ctx.stroke();
}

/** An urchin: a plum ball of pink-tipped spines with a cross little face. */
export function drawUrchin(ctx: Ctx, s: number): void {
  const c = s / 2;
  ctx.lineJoin = 'round';
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = OUTLINE;
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + 0.2;
    const along = (d: number, side: number) =>
      [c + Math.cos(a + side) * d, c + Math.sin(a + side) * d] as const;
    poly(ctx, [along(R * 0.55, -0.2), along(R - 1.5, 0), along(R * 0.55, 0.2)]);
    ctx.fillStyle = i % 2 ? '#FF4FA3' : '#FF8FC6';
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = '#5A2A86';
  circle(ctx, c, c, R * 0.62);
  ctx.fill();
  ctx.stroke();
  for (const side of [-1, 1]) {
    ctx.fillStyle = '#FFFFFF';
    circle(ctx, c + side * 8, c, 5.5);
    ctx.fill();
    ctx.fillStyle = OUTLINE;
    circle(ctx, c + side * 7, c + 1, 2.6);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(c + side * 14, c - 9);
    ctx.lineTo(c + side * 3, c - 5);
    ctx.stroke();
  }
}

/** The rainbow bubble: a wedge of every colour around a white star. */
export function drawRainbow(ctx: Ctx, s: number): void {
  const c = s / 2;
  const r = R - 0.5;
  for (let k = 0; k < COLOURS; k++) {
    ctx.fillStyle = kindColor(k);
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.arc(c, c, r, (k / COLOURS) * Math.PI * 2, ((k + 1) / COLOURS) * Math.PI * 2 + 0.02);
    ctx.closePath();
    ctx.fill();
  }
  ctx.lineWidth = 3;
  ctx.strokeStyle = OUTLINE;
  circle(ctx, c, c, r - 1.5);
  ctx.stroke();
  starPath(ctx, c, c + 1, 5, 17, 8);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath();
  ctx.ellipse(c - r * 0.42, c - r * 0.5, r * 0.24, r * 0.12, -0.7, 0, Math.PI * 2);
  ctx.fill();
}

/** A ring (white; tinted): the burst of a pop, and the mark where the aimed bubble will land. */
export function drawRing(ctx: Ctx, s: number, width: number): void {
  ctx.lineWidth = width;
  ctx.strokeStyle = '#FFFFFF';
  circle(ctx, s / 2, s / 2, s / 2 - width / 2 - 1);
  ctx.stroke();
}

/** A five-point star for the HUD and the result card: gold when earned, a dark socket when not. */
export function drawStar(ctx: Ctx, s: number, on: boolean): void {
  const c = s / 2;
  starPath(ctx, c, c + s * 0.03, 5, c - 2, c * 0.48);
  ctx.lineJoin = 'round';
  ctx.fillStyle = on ? colors.gold : '#2A2456';
  ctx.fill();
  ctx.lineWidth = Math.max(2, s * 0.07);
  ctx.strokeStyle = on ? '#8A4B00' : '#4A3D93';
  ctx.stroke();
  if (!on) return;
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.ellipse(c - s * 0.12, c - s * 0.14, s * 0.1, s * 0.05, -0.6, 0, Math.PI * 2);
  ctx.fill();
}

/** A dark glassy pill for the HUD (the same look as the toolkit's). */
export function drawPill(ctx: Ctx, w: number, h: number): void {
  roundRectPath(ctx, 1, 1, w - 2, h - 2, h / 2);
  ctx.fillStyle = rgba(colors.bg, 0.66);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.stroke();
}

/** The result card: a raised panel with a teal band along the top. */
export function drawCard(ctx: Ctx, w: number, h: number): void {
  glossyRect(ctx, 0, 0, w, h, colors.raised, {
    radius: 34,
    depth: 10,
    gloss: 0.12,
    outline: '#0B0720',
    lineWidth: 4,
    shadow: false,
  });
  ctx.save();
  roundRectPath(ctx, 4, 4, w - 8, h - 18, 30);
  ctx.clip();
  ctx.fillStyle = ACCENT;
  ctx.fillRect(0, 0, w, 12);
  ctx.restore();
}

/** A card button in `color`. */
export function drawButton(ctx: Ctx, w: number, h: number, color: string): void {
  glossyRect(ctx, 0, 0, w, h, color, {
    radius: 22,
    depth: 7,
    outline: shade(color, -0.6),
    lineWidth: 3,
    shadow: false,
  });
}

/** A small glossy droplet (near-white; the scene tints it). */
export function drawDrop(ctx: Ctx, s: number): void {
  const c = s / 2;
  const g = ctx.createRadialGradient(c - s * 0.15, c - s * 0.15, 0, c, c, c);
  g.addColorStop(0, '#FFFFFF');
  g.addColorStop(0.6, '#EAF6FF');
  g.addColorStop(1, '#B9CBE0');
  ctx.fillStyle = g;
  circle(ctx, c, c, c - 0.5);
  ctx.fill();
}

/** One dot of the aim guide: a solid white dot with a dark rim (tinted to the loaded bubble). */
export function drawDot(ctx: Ctx, s: number): void {
  const c = s / 2;
  ctx.fillStyle = '#FFFFFF';
  circle(ctx, c, c, c - 1.5);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(18,12,44,0.75)';
  ctx.stroke();
}

/** A tiny rising bubble for the background (white; shown faint). */
export function drawSpeck(ctx: Ctx, s: number): void {
  const c = s / 2;
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#FFFFFF';
  circle(ctx, c, c, c - 2);
  ctx.stroke();
  ctx.fillStyle = '#FFFFFF';
  circle(ctx, c - c * 0.3, c - c * 0.3, c * 0.2);
  ctx.fill();
}

/** A fish silhouette facing right (white; tinted per zone) for the shoals drifting behind the field. */
export function drawSilhouette(ctx: Ctx, w: number, h: number): void {
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.ellipse(w * 0.58, h / 2, w * 0.36, h * 0.36, 0, 0, Math.PI * 2);
  ctx.fill();
  poly(ctx, [
    [w * 0.3, h / 2],
    [2, h * 0.12],
    [2, h * 0.88],
  ]);
  ctx.fill();
}

// ─── Puff ───

/** Puff's body: a round sunny pufferfish with side fins, a dorsal tuft and spots; spiky when puffed up. */
export function drawPuff(ctx: Ctx, spiky: boolean): void {
  const { cx, cy } = PUFF;
  const r = spiky ? PUFF.r + 5 : PUFF.r;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = OUTLINE;
  // side fins and the dorsal tuft, behind the body
  const fin = (side: number) => {
    ctx.beginPath();
    ctx.moveTo(cx + side * (r - 6), cy - 2);
    ctx.quadraticCurveTo(cx + side * (r + 20), cy - 14, cx + side * (r + 18), cy + 8);
    ctx.quadraticCurveTo(cx + side * (r + 10), cy + 16, cx + side * (r - 4), cy + 12);
    ctx.closePath();
    ctx.fillStyle = '#FF8F6B';
    ctx.fill();
    ctx.stroke();
  };
  fin(-1);
  fin(1);
  ctx.beginPath();
  ctx.moveTo(cx - 12, cy - r + 6);
  ctx.quadraticCurveTo(cx - 6, cy - r - 16, cx + 4, cy - r - 12);
  ctx.quadraticCurveTo(cx + 14, cy - r - 8, cx + 12, cy - r + 6);
  ctx.closePath();
  ctx.fillStyle = '#FF8F6B';
  ctx.fill();
  ctx.stroke();
  if (spiky) {
    // little spines all round
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + 0.17;
      const along = (d: number, side: number) =>
        [cx + Math.cos(a + side) * d, cy + Math.sin(a + side) * d] as const;
      poly(ctx, [along(r - 2, -0.09), along(r + 10, 0), along(r - 2, 0.09)]);
      ctx.fillStyle = '#FFE7A8';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.lineWidth = 3;
  }
  // body
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.45, r * 0.1, cx, cy, r);
  g.addColorStop(0, '#FFE69A');
  g.addColorStop(0.55, '#FFC24D');
  g.addColorStop(1, '#E8952C');
  ctx.fillStyle = g;
  circle(ctx, cx, cy, r);
  ctx.fill();
  ctx.save();
  circle(ctx, cx, cy, r);
  ctx.clip();
  // pale belly and back spots
  ctx.fillStyle = 'rgba(255,246,214,0.85)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.62, r * 0.82, r * 0.52, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(196,108,30,0.45)';
  for (const [dx, dy, s] of [
    [-22, -24, 4.5],
    [-6, -31, 3.5],
    [12, -27, 4],
    [26, -16, 3.2],
    [-30, -8, 3],
  ] as const) {
    ctx.beginPath();
    ctx.ellipse(cx + dx * (r / PUFF.r), cy + dy * (r / PUFF.r), s, s * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // rosy cheeks
  ctx.fillStyle = 'rgba(255,110,140,0.35)';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + side * 26, cy + 6, 7, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  circle(ctx, cx, cy, r - 1.5);
  ctx.stroke();
  // gloss
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.45, cy - r * 0.55, r * 0.2, r * 0.11, -0.6, 0, Math.PI * 2);
  ctx.fill();
}

/** One of Puff's faces (eyes and mouth; the pupils are separate so they can follow the aim). */
export function drawFace(ctx: Ctx, face: Face): void {
  const { ox, oy } = FACE;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = OUTLINE;
  ctx.fillStyle = OUTLINE;
  const eyes = EYES.map(([dx, dy]) => [ox + dx, oy + dy] as const);
  const whites = () => {
    for (const [x, y] of eyes) {
      ctx.beginPath();
      ctx.ellipse(x, y, 10.5, 12, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.lineWidth = 2.6;
      ctx.stroke();
    }
  };
  const arcs = (dy: number, from: number, to: number) => {
    ctx.lineWidth = 3.2;
    for (const [x, y] of eyes) {
      ctx.beginPath();
      ctx.arc(x, y + dy, 7.5, from, to);
      ctx.stroke();
    }
  };
  const mouthY = oy + 22;
  const smile = (r: number) => {
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(ox, mouthY - r * 0.6, r, Math.PI * 0.18, Math.PI * 0.82);
    ctx.stroke();
  };
  const open = (rx: number, ry: number) => {
    ctx.beginPath();
    ctx.ellipse(ox, mouthY, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#7A2340';
    ctx.fill();
    ctx.lineWidth = 2.6;
    ctx.stroke();
  };
  switch (face) {
    case 'idle':
      whites();
      smile(6);
      break;
    case 'blink':
      arcs(-2, Math.PI * 0.15, Math.PI * 0.85);
      smile(6);
      break;
    case 'happy':
      arcs(4, Math.PI * 1.15, Math.PI * 1.85);
      ctx.beginPath();
      ctx.moveTo(ox - 10, mouthY - 4);
      ctx.quadraticCurveTo(ox, mouthY + 14, ox + 10, mouthY - 4);
      ctx.closePath();
      ctx.fillStyle = '#7A2340';
      ctx.fill();
      ctx.lineWidth = 2.6;
      ctx.stroke();
      ctx.fillStyle = '#FF7A9A';
      ctx.beginPath();
      ctx.ellipse(ox, mouthY + 4, 4.5, 2.6, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'worried': {
      whites();
      ctx.lineWidth = 3;
      for (const [x, y] of eyes) {
        const inner = x < ox ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(x - inner * 8, y - 13);
        ctx.lineTo(x + inner * 6, y - 19);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(ox - 8, mouthY);
      ctx.quadraticCurveTo(ox - 4, mouthY - 4, ox, mouthY);
      ctx.quadraticCurveTo(ox + 4, mouthY + 4, ox + 8, mouthY);
      ctx.stroke();
      break;
    }
    case 'blow':
      whites();
      open(5, 5.5);
      break;
    case 'sad':
      arcs(-4, Math.PI * 0.2, Math.PI * 0.8);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(ox, mouthY + 8, 7, Math.PI * 1.2, Math.PI * 1.8);
      ctx.stroke();
      // a little tear under the right eye
      ctx.fillStyle = colors.sky;
      ctx.beginPath();
      ctx.ellipse(ox + 21, oy + 7, 2.6, 3.6, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
  }
}

/** A pupil with a glint. */
export function drawPupil(ctx: Ctx, s: number): void {
  const c = s / 2;
  ctx.fillStyle = OUTLINE;
  circle(ctx, c, c, c - 0.5);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  circle(ctx, c - c * 0.35, c - c * 0.38, c * 0.32);
  ctx.fill();
}

// ─── the reef ───

/** A wavy reef ridge from x 0 to w along `base`, filled down to h. */
function ridge(
  ctx: Ctx,
  w: number,
  h: number,
  base: number,
  amp: number,
  fill: string,
  rnd: () => number,
) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(0, h);
  let y = base;
  for (let x = 0; x <= w + 30; x += 30) {
    y = base + (rnd() - 0.5) * amp;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
}

/** A branching coral silhouette growing up from (x, y). */
function branchCoral(
  ctx: Ctx,
  x: number,
  y: number,
  len: number,
  angle: number,
  width: number,
  depth: number,
  rnd: () => number,
): void {
  const x2 = x + Math.cos(angle) * len;
  const y2 = y + Math.sin(angle) * len;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  if (depth <= 0) {
    circle(ctx, x2, y2, width * 0.75);
    ctx.fill();
    return;
  }
  for (const side of [-1, 1])
    branchCoral(
      ctx,
      x2,
      y2,
      len * (0.62 + rnd() * 0.2),
      angle + side * (0.32 + rnd() * 0.3),
      width * 0.72,
      depth - 1,
      rnd,
    );
}

/** A sea fan: a half disc of fine ribs. */
function fanCoral(ctx: Ctx, x: number, y: number, r: number, color: string): void {
  ctx.fillStyle = rgba(color, 0.55);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.arc(x, y, r, Math.PI * 1.08, Math.PI * 1.92);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI * (1.1 + (0.8 * i) / 8);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    ctx.stroke();
  }
}

/** A brain-coral dome. */
function domeCoral(ctx: Ctx, x: number, y: number, r: number, fill: string, line: string): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, r, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = line;
  ctx.lineWidth = 2;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(x, y, r * (i / 4), Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
  }
}

/**
 * A zone's scenery on top of the backdrop gradient: three reef layers and the sand, drawn right across the widest
 * view (`bx`, `by` are the overhang past the design area on each side).
 */
export function drawZone(
  ctx: Ctx,
  w: number,
  h: number,
  zone: number,
  bx: number,
  by: number,
): void {
  const z = ZONE_ART[zone]!;
  const rnd = prng(0x5eaf + zone * 977);
  const full = w + bx * 2;
  const floor = h + by;
  ctx.save();
  ctx.translate(-bx, 0);
  // far reef
  ridge(ctx, full, floor, h - 310, 60, z.far, rnd);
  ctx.strokeStyle = z.far;
  ctx.fillStyle = z.far;
  ctx.lineCap = 'round';
  for (let x = 60; x < full; x += 150 + rnd() * 120) {
    if (zone === 1) {
      // kelp trunks reaching for the surface
      ctx.lineWidth = 10 + rnd() * 8;
      ctx.beginPath();
      ctx.moveTo(x, h - 300);
      ctx.bezierCurveTo(x - 40, h - 520, x + 50, h - 700, x + (rnd() - 0.5) * 60, 60 + rnd() * 240);
      ctx.stroke();
    } else if (zone === 3) {
      // rock spires
      poly(ctx, [
        [x - 46, h - 290],
        [x - 8, h - 470 - rnd() * 160],
        [x + 14, h - 440],
        [x + 50, h - 290],
      ]);
      ctx.fill();
    } else branchCoral(ctx, x, h - 300, 40 + rnd() * 24, -Math.PI / 2, 9, 3, rnd);
  }
  // middle reef
  ridge(ctx, full, floor, h - 205, 40, z.mid, rnd);
  for (let x = 110; x < full; x += 190 + rnd() * 140) {
    if (rnd() < 0.5) fanCoral(ctx, x, h - 200, 46 + rnd() * 26, z.far);
    else domeCoral(ctx, x, h - 196, 28 + rnd() * 16, z.mid, z.far);
  }
  // near reef: darker clumps
  ridge(ctx, full, floor, h - 100, 30, z.near, rnd);
  ctx.strokeStyle = z.near;
  ctx.fillStyle = z.near;
  for (let x = 40; x < full; x += 120 + rnd() * 130)
    branchCoral(ctx, x, h - 92, 36 + rnd() * 26, -1.57 + (rnd() - 0.5) * 0.4, 11, 3, rnd);
  // sand
  const sand = ctx.createLinearGradient(0, h - 50, 0, h + 20);
  sand.addColorStop(0, z.sand[0]);
  sand.addColorStop(1, z.sand[1]);
  ctx.fillStyle = sand;
  ctx.beginPath();
  ctx.moveTo(0, h - 40);
  for (let x = 0; x <= full; x += 40) ctx.lineTo(x, h - 40 + Math.sin(x / 70) * 6);
  ctx.lineTo(full, floor);
  ctx.lineTo(0, floor);
  ctx.closePath();
  ctx.fill();
  // pebbles and, in the trench, glowing specks
  for (let i = 0; i < 46; i++) {
    ctx.fillStyle = rgba(i % 2 ? z.near : z.far, 0.7);
    ctx.beginPath();
    ctx.ellipse(
      rnd() * full,
      h - 22 + rnd() * (by + 16),
      6 + rnd() * 10,
      3 + rnd() * 4,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  if (zone === 3)
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = rgba(i % 3 ? z.glow : ACCENT, 0.25 + rnd() * 0.4);
      circle(ctx, rnd() * full, 120 + rnd() * (h - 240), 1.5 + rnd() * 2);
      ctx.fill();
    }
  ctx.restore();
}

/** A side wall of the play field: a rock column (near-white; tinted per zone) with knobs along it. */
export function drawWall(ctx: Ctx, w: number, h: number): void {
  const rnd = prng(0xba2d);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#B9BFD2';
  ctx.fillRect(w - 4, 0, 4, h);
  ctx.fillStyle = '#D5D9E6';
  for (let y = 20; y < h; y += 30 + rnd() * 50) {
    circle(ctx, 4 + rnd() * (w - 14), y, 2.5 + rnd() * 3);
    ctx.fill();
  }
}

/** The ceiling's rocky lip the bubbles hang from (near-white; tinted per zone). */
export function drawLip(ctx: Ctx, w: number, h: number): void {
  const rnd = prng(0x11b);
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(w, 0);
  for (let x = w; x >= 0; x -= 16) ctx.lineTo(x, h - 8 + rnd() * 7);
  ctx.closePath();
  ctx.fill();
}

/** A slanted beam of light from the surface (soft layers, fading downward; drawn at scale 1 and added). */
export function drawRay(ctx: Ctx, w: number, h: number): void {
  for (let k = 0; k < 6; k++) {
    const f = 1 - k / 6;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,233,199,0.09)');
    g.addColorStop(0.7, 'rgba(255,233,199,0.03)');
    g.addColorStop(1, 'rgba(255,233,199,0)');
    ctx.fillStyle = g;
    const tw = 6 + 18 * f;
    const bw = 12 + 62 * f;
    poly(ctx, [
      [w * 0.2 - tw, 0],
      [w * 0.2 + tw, 0],
      [w * 0.72 + bw, h],
      [w * 0.72 - bw, h],
    ]);
    ctx.fill();
  }
}

/** A seaweed leaf (near-white; tinted per stalk). */
export function drawLeaf(ctx: Ctx, w: number, h: number): void {
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, '#FFFFFF');
  g.addColorStop(1, '#AEB8C8');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(w * 0.55, h);
  ctx.bezierCurveTo(w * 0.05, h * 0.75, 0, h * 0.25, w * 0.35, 1);
  ctx.bezierCurveTo(w * 0.95, h * 0.2, w, h * 0.7, w * 0.55, h);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(40,50,80,0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(w * 0.55, h - 2);
  ctx.quadraticCurveTo(w * 0.42, h * 0.5, w * 0.36, h * 0.12);
  ctx.stroke();
}

/** The dashed danger line (white; tinted by the scene). */
export function drawDanger(ctx: Ctx, w: number, h: number): void {
  ctx.fillStyle = '#FFFFFF';
  for (let x = 4; x < w - 8; x += 24) {
    roundRectPath(ctx, x, 0, 13, h, h / 2);
    ctx.fill();
  }
}

/** A shots-left pip: a little bubble in `color`, or an empty ring when `color` is null. */
export function drawPip(ctx: Ctx, s: number, color: string | null): void {
  const c = s / 2;
  if (color) {
    glossyCircle(ctx, c, c, c - 1.5, color, { shadow: false, outline: shade(color, -0.55) });
    return;
  }
  ctx.strokeStyle = rgba('#FFFFFF', 0.35);
  ctx.lineWidth = 2;
  circle(ctx, c, c, c - 3);
  ctx.stroke();
}

/** The "ceiling sinks" glyph next to the pips: a bar with a down arrow. */
export function drawSink(ctx: Ctx, s: number): void {
  ctx.fillStyle = colors.textMuted;
  ctx.strokeStyle = colors.textMuted;
  roundRectPath(ctx, 2, 2, s - 4, 4, 2);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(s / 2, 9);
  ctx.lineTo(s / 2, s - 3);
  ctx.moveTo(s / 2 - 5, s - 8);
  ctx.lineTo(s / 2, s - 3);
  ctx.lineTo(s / 2 + 5, s - 8);
  ctx.stroke();
}

/** The HUD Pause button: a square teal candy button with a pause glyph. */
export function drawPauseButton(ctx: Ctx, w: number, h: number): void {
  glossyRect(ctx, 0, 0, w, h, ACCENT, {
    radius: 18,
    depth: 6,
    outline: shade(ACCENT, -0.6),
    lineWidth: 2.5,
    shadow: false,
  });
  ctx.fillStyle = INK;
  for (const x of [w / 2 - 11, w / 2 + 3]) {
    roundRectPath(ctx, x, (h - 6) / 2 - 12, 8, 24, 3);
    ctx.fill();
  }
}
