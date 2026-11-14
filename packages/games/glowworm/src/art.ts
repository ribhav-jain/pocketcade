// Glowworm art (Canvas 2D, drawn once per mount into textures by scene.ts): the cave scenery, the board's walls
// and tunnels, crystal blocks, Wick the glowworm, the berries and the HUD pieces. Scenery and walls are drawn in
// greys and tinted by the scene, so one set of textures serves every cave palette. Decoration only.
import {
  colors,
  glossyCircle,
  glossyRect,
  prng,
  rgba,
  roundRectPath,
  shade,
  starPath,
} from '@pocketcade/toolkit';
import { COLS } from './sim.ts';

type Ctx = CanvasRenderingContext2D;
export type Face = 'idle' | 'blink' | 'open' | 'chomp' | 'sad' | 'happy';
export const FACES: readonly Face[] = ['idle', 'blink', 'open', 'chomp', 'sad', 'happy'];

/** Layout in design units: the HUD row, then the 17 × 17 floor with a wall rim around it. */
export const W = 1000;
export const H = 1070;
export const HUD = { y: 10, h: 58 } as const;
export const CELL = 56;
export const BOARD = CELL * COLS;
export const BOARD_X = (W - BOARD) / 2;
export const BOARD_Y = 94;
export const RIM = 20;
/** Glowworm's accent: Wick's mint glow. */
export const ACCENT = '#6CF5C2';
export const INK = colors.ink;
/** Wick's outline */
export const WORM_INK = '#082530';
/** Wick's body colours, neck to tail */
export const RAMP = [
  '#D9FF78',
  '#B6FA86',
  '#93F59A',
  '#78EEAE',
  '#63E3BB',
  '#55D3BE',
  '#4AC2B8',
  '#41AEAE',
] as const;
/** texture sizes: body bead, the link between two beads, their shared outline disc, the head and its extras */
export const BEAD = 42;
export const LINK = 36;
export const OUT = 48;
export const HEAD = 64;
export const ANTENNAE = 100;
export const PUPIL = 12;
/** eye centres from the head centre, in the head's own frame (x forward, y sideways) */
export const EYE = { x: 7, y: 11 } as const;
/** a crystal block: a cell-sized stone with crystals that stand `top` above the cell */
export const BLOCK = { w: CELL, h: CELL + 18, top: 18, variants: 3 } as const;
export const ROCK = { w: 420, h: 460, variants: 2 } as const;
export const SPIRE = { w: 260, h: 340, variants: 3 } as const;

/** One cave palette. */
export interface Biome {
  /** backdrop tint, top and bottom */
  sky: readonly [string, string];
  /** rock formations behind the board, and the dark ones that frame the view */
  rock: string;
  near: string;
  /** the two floor tiles */
  floor: readonly [string, string];
  wall: string;
  /** crystal blocks: the stone and its two crystal colours (also the big scenery crystals) */
  stone: string;
  crystal: readonly [string, string];
  mote: string;
}

export const BIOMES: readonly Biome[] = [
  {
    sky: ['#261B66', '#120B34'],
    rock: '#3B2D8C',
    near: '#150D3C',
    floor: ['#2C2270', '#352A84'],
    wall: '#9B86FF',
    stone: '#5443B8',
    crystal: ['#C3A8FF', '#FF8AD8'],
    mote: '#CDBBFF',
  },
  {
    sky: ['#0C4254', '#06202E'],
    rock: '#125C72',
    near: '#062430',
    floor: ['#0E3C4C', '#12485A'],
    wall: '#4CC6E6',
    stone: '#1E7C96',
    crystal: ['#7CEBFF', '#A99BFF'],
    mote: '#B4F4FF',
  },
  {
    sky: ['#521C46', '#260C28'],
    rock: '#742858',
    near: '#2A0C2A',
    floor: ['#421A40', '#4E1F4A'],
    wall: '#FF9A76',
    stone: '#9A3A6C',
    crystal: ['#FFC062', '#FF8552'],
    mote: '#FFD2AE',
  },
  {
    sky: ['#182A7E', '#0A1240'],
    rock: '#223C9E',
    near: '#0A1444',
    floor: ['#17266C', '#1C2E80'],
    wall: '#7EA6FF',
    stone: '#3454C0',
    crystal: ['#9ADAFF', '#C2B0FF'],
    mote: '#C4DCFF',
  },
  {
    sky: ['#523C16', '#261A0A'],
    rock: '#74561E',
    near: '#2A1C0A',
    floor: ['#3C2E18', '#47371D'],
    wall: '#F0BC5A',
    stone: '#94702C',
    crystal: ['#FFF0BC', '#FF9648'],
    mote: '#FFEAAE',
  },
];

function circle(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

function disc(ctx: Ctx, x: number, y: number, r: number, color: string): void {
  ctx.fillStyle = color;
  circle(ctx, x, y, r);
  ctx.fill();
}

function poly(ctx: Ctx, pts: readonly (readonly [number, number])[]): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

/** A faceted crystal standing at (x, base): lit left facet, shaded right facet, an outline and a glint. */
function prism(
  ctx: Ctx,
  x: number,
  base: number,
  hw: number,
  height: number,
  tilt: number,
  lit: string,
  dark: string,
  line: string,
  lineWidth = 2.4,
): void {
  ctx.save();
  ctx.translate(x, base);
  ctx.rotate(tilt);
  const top = -height;
  const shoulder = top + hw * 1.2;
  poly(ctx, [
    [-hw, 0],
    [-hw, shoulder],
    [0, top],
    [0, 0],
  ]);
  ctx.fillStyle = lit;
  ctx.fill();
  poly(ctx, [
    [0, 0],
    [0, top],
    [hw, shoulder],
    [hw, 0],
  ]);
  ctx.fillStyle = dark;
  ctx.fill();
  poly(ctx, [
    [-hw, 0],
    [-hw, shoulder],
    [0, top],
    [hw, shoulder],
    [hw, 0],
  ]);
  ctx.lineJoin = 'round';
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = line;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1.6, hw * 0.16);
  ctx.beginPath();
  ctx.moveTo(-hw * 0.5, shoulder + hw * 0.4);
  ctx.lineTo(-hw * 0.5, -hw * 0.6);
  ctx.stroke();
  ctx.restore();
}

const colorPrism = (
  ctx: Ctx,
  x: number,
  base: number,
  hw: number,
  height: number,
  tilt: number,
  color: string,
) =>
  prism(ctx, x, base, hw, height, tilt, shade(color, 0.25), shade(color, -0.25), shade(color, -0.65));

// ─── scenery ───

/**
 * The cave wall behind everything, in greys over the backdrop gradient: angular rock planes, a few far crystals
 * and a vignette. Covers the design area plus the bleed (bx, by) on each side.
 */
export function drawBackdrop(ctx: Ctx, w: number, h: number, bx: number, by: number): void {
  const rnd = prng(0x61e0);
  const fw = w + bx * 2;
  const fh = h + by * 2;
  for (let i = 0; i < 90; i++) {
    const cx = -bx + rnd() * fw;
    const cy = -by + rnd() * fh;
    const r = 90 + rnd() * 200;
    const n = 5 + Math.floor(rnd() * 3);
    const a0 = rnd() * 6.28;
    ctx.beginPath();
    for (let j = 0; j < n; j++) {
      const a = a0 + (j / n) * 6.283;
      const rr = r * (0.6 + rnd() * 0.4);
      ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.8);
    }
    ctx.closePath();
    ctx.fillStyle =
      rnd() < 0.35 ? `rgba(255,255,255,${0.05 + rnd() * 0.07})` : `rgba(0,0,0,${0.08 + rnd() * 0.14})`;
    ctx.fill();
  }
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < 18; i++) {
    const x = -bx + rnd() * fw;
    const y = -by + rnd() * fh;
    const s = 0.6 + rnd() * 0.9;
    for (const [dx, tilt, len] of [
      [-16, -0.35, 44],
      [16, 0.3, 38],
      [0, 0, 70],
    ] as const)
      prism(ctx, x + dx * s, y, 10 * s, len * s, tilt, '#FFFFFF', '#B0B0B0', '#707070', 2);
  }
  ctx.globalAlpha = 1;
  const g = ctx.createRadialGradient(w / 2, h / 2, 420, w / 2, h / 2, Math.hypot(fw, fh) / 2);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = g;
  ctx.fillRect(-bx, -by, fw, fh);
}

/** A group of rock columns rising from the bottom edge, in greys (lit left faces, shaded right faces). */
export function drawRock(ctx: Ctx, v: number): void {
  const { w, h } = ROCK;
  const rnd = prng(0x51ab + v * 977);
  const cols = Array.from({ length: 6 }, (_, i) => {
    const mid = 1 - Math.abs(i - 2.5) / 3.2;
    return {
      x: w * (0.14 + 0.145 * i) + (rnd() - 0.5) * 24,
      bw: 46 + rnd() * 34,
      ht: h * (0.3 + 0.62 * mid * (0.75 + rnd() * 0.25)),
      lean: (rnd() - 0.5) * 30,
    };
  }).sort((a, b) => b.ht - a.ht);
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#5C5C5C';
  for (const c of cols) {
    const top = h - c.ht;
    const tx = c.x + c.lean;
    const my = h - c.ht * 0.5;
    const left: [number, number][] = [
      [c.x - c.bw, h],
      [c.x - c.bw * 0.62, my],
      [tx - 7, top],
      [tx + 2, top],
      [c.x + 4, h],
    ];
    const right: [number, number][] = [
      [c.x + 4, h],
      [tx + 2, top],
      [tx + 9, top + 7],
      [c.x + c.bw * 0.66, my + 12],
      [c.x + c.bw, h],
    ];
    poly(ctx, left);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.stroke();
    poly(ctx, right);
    ctx.fillStyle = '#9C9C9C';
    ctx.fill();
    ctx.stroke();
  }
}

/** A fan of big crystals on a rock base, in greys. */
export function drawSpire(ctx: Ctx, v: number): void {
  const { w, h } = SPIRE;
  const rnd = prng(0x77c1 + v * 131);
  const n = 5 + (v % 2);
  const prisms = Array.from({ length: n }, (_, i) => {
    const off = i / (n - 1) - 0.5;
    return {
      x: w / 2 + off * 70,
      tilt: off * 1.15 + (rnd() - 0.5) * 0.12,
      len: (h - 70) * (1 - Math.abs(off) * 1.05) * (0.8 + rnd() * 0.25),
      hw: 20 + rnd() * 10 - Math.abs(off) * 10,
    };
  }).sort((a, b) => b.len - a.len);
  for (const p of prisms)
    prism(ctx, p.x, h - 34, p.hw, p.len, p.tilt, '#E4E4E4', '#9E9E9E', '#3C3C3C', 4);
  ctx.beginPath();
  ctx.ellipse(w / 2, h - 20, 100, 22, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#6A6A6A';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#3C3C3C';
  ctx.stroke();
}

/** One piece of scenery: (x, y) is the middle of its base, or of its top when it hangs. */
export interface Prop {
  kind: 'rock' | 'spire';
  v: number;
  x: number;
  y: number;
  scale: number;
  hang?: boolean;
  flip?: boolean;
  /** rocks: a dark one that frames the view */
  near?: boolean;
  /** spires: which of the cave's two crystal colours */
  hue?: 0 | 1;
}

/**
 * Where the scenery stands. Side pieces show in wide frames, the rows above and below in tall ones; the frame
 * crops whatever lies outside it.
 */
export function props(bx: number, by: number): Prop[] {
  const out: Prop[] = [];
  for (const s of [1, -1]) {
    const x = (d: number) => (s > 0 ? W + d : -d);
    const flip = s < 0;
    const a = s > 0 ? 0 : 1;
    out.push(
      { kind: 'rock', v: a, x: x(150), y: -20, scale: 0.55, hang: true, flip },
      { kind: 'rock', v: 1 - a, x: x(140), y: H + 20, scale: 0.62, flip },
      { kind: 'spire', v: a, x: x(225), y: H - 12, scale: 0.95, hue: 0, flip },
      { kind: 'spire', v: 1 - a, x: x(250), y: 6, scale: 0.7, hang: true, hue: 1, flip },
      { kind: 'spire', v: 2, x: x(78), y: H - 6, scale: 0.5, hue: 1, flip },
      { kind: 'spire', v: 2, x: x(96), y: 4, scale: 0.42, hang: true, hue: 0, flip: !flip },
      { kind: 'rock', v: 1 - a, x: x(bx - 90), y: -30, scale: 1, hang: true, near: true, flip },
      { kind: 'rock', v: a, x: x(bx - 110), y: H + 30, scale: 1, near: true, flip },
    );
  }
  [150, 500, 850].forEach((x, i) => {
    out.push(
      { kind: 'rock', v: i % 2, x, y: -by - 24, scale: 0.42, hang: true, near: true, flip: i > 0 },
      { kind: 'rock', v: (i + 1) % 2, x, y: H + by + 24, scale: 0.42, near: true, flip: i === 1 },
    );
  });
  [320, 690].forEach((x, i) => {
    const hue = i ? 1 : 0;
    out.push(
      { kind: 'spire', v: i, x, y: -by - 6, scale: 0.42, hang: true, hue },
      { kind: 'spire', v: 2 - i, x: x - 10, y: H + by + 8, scale: 0.42, hue: i ? 0 : 1 },
    );
  });
  return out;
}

/** Soft round glow (white; tinted by the scene). */
export function drawGlow(ctx: Ctx, s: number): void {
  const c = s / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.14)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
}

/** A four-point sparkle (white; tinted by the scene). */
export function drawSparkle(ctx: Ctx, s: number): void {
  const c = s / 2;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.moveTo(c, 0);
  ctx.quadraticCurveTo(c, c, s, c);
  ctx.quadraticCurveTo(c, c, c, s);
  ctx.quadraticCurveTo(c, c, 0, c);
  ctx.quadraticCurveTo(c, c, c, 0);
  ctx.fill();
}

// ─── the board ───

/**
 * One wall strip in greys, `len` × RIM with the floor side at the bottom: a bright top, a darker lip toward the
 * floor and a notch at every cell. `corners` rounds the two outer corners (top and bottom walls); without it the
 * strip is drawn turned, RIM × `len` with the floor side on the left (side walls).
 */
export function drawRim(ctx: Ctx, len: number, corners: boolean): void {
  const t = RIM;
  if (!corners) {
    ctx.translate(t, 0);
    ctx.rotate(Math.PI / 2);
  }
  if (corners) roundRectPath(ctx, 0, 0, len, t + 20, 14);
  else {
    ctx.beginPath();
    ctx.rect(0, 0, len, t);
  }
  ctx.save();
  ctx.clip();
  ctx.fillStyle = '#D4D4D4';
  ctx.fillRect(0, 0, len, t);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 3, len, 5);
  ctx.fillStyle = '#787878';
  ctx.fillRect(0, t - 5, len, 5);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  for (let x = corners ? t : 0; x <= len; x += CELL) ctx.fillRect(x - 1, 3, 2, t - 8);
  // the outer outline: half of this stroke falls outside the clip
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#333333';
  if (corners) ctx.stroke();
  else ctx.strokeRect(-6, 0, len + 12, t + 6);
  ctx.restore();
}

/** A tunnel mouth that covers one cell of the top wall: a dark opening, a mint sill and an arrow pointing out. */
export function drawGate(ctx: Ctx): void {
  ctx.fillStyle = '#07051A';
  ctx.fillRect(0, 0, CELL, RIM);
  ctx.fillStyle = ACCENT;
  roundRectPath(ctx, 9, RIM - 7, CELL - 18, 5, 2.5);
  ctx.fill();
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(CELL / 2 - 7, 11);
  ctx.lineTo(CELL / 2, 4.5);
  ctx.lineTo(CELL / 2 + 7, 11);
  ctx.stroke();
}

/** The shadow a wall casts on the floor: dark at the top, fading down (stretched sideways by the scene). */
export function drawShade(ctx: Ctx, w: number, h: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(4,2,16,0.45)');
  g.addColorStop(1, 'rgba(4,2,16,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** A crystal block for one cell: a stone with a lit top and a darker front, and crystals growing out of it. */
export function drawBlock(ctx: Ctx, b: Biome, v: number): void {
  const { w, top } = BLOCK;
  roundRectPath(ctx, 1, top + 1, w - 2, w - 2, 13);
  ctx.fillStyle = shade(b.stone, -0.68);
  ctx.fill();
  roundRectPath(ctx, 4, top + 4, w - 8, w - 8, 10);
  ctx.fillStyle = shade(b.stone, -0.32);
  ctx.fill();
  roundRectPath(ctx, 4, top + 4, w - 8, w - 15, 10);
  ctx.fillStyle = b.stone;
  ctx.fill();
  roundRectPath(ctx, 9, top + 7, w - 18, 4, 2);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fill();
  const [a, c] = b.crystal;
  const base = top + w - 17;
  const m = w / 2;
  if (v === 0) {
    colorPrism(ctx, m - 13, base, 7.5, 26, -0.34, c);
    colorPrism(ctx, m + 13, base, 7, 22, 0.36, c);
    colorPrism(ctx, m, base + 3, 10, 46, 0, a);
  } else if (v === 1) {
    colorPrism(ctx, m + 12, base, 8, 30, 0.3, a);
    colorPrism(ctx, m - 8, base + 3, 10, 42, -0.12, c);
  } else {
    colorPrism(ctx, m - 14, base, 7, 24, -0.4, a);
    colorPrism(ctx, m + 15, base + 1, 6.5, 20, 0.42, c);
    colorPrism(ctx, m + 2, base + 3, 9.5, 44, 0.08, a);
  }
}

// ─── Wick ───

/** A flat disc that fills an s × s texture (Wick's outline). */
export function drawDisc(ctx: Ctx, s: number, color: string): void {
  disc(ctx, s / 2, s / 2, s / 2 - 0.5, color);
}

/** A glossy body bead. */
export function drawBead(ctx: Ctx, s: number, color: string): void {
  glossyCircle(ctx, s / 2, s / 2, s / 2 - 1, color, { outline: null, shadow: false });
}

/** The plain, slightly darker link between two beads. */
export function drawLink(ctx: Ctx, s: number, color: string): void {
  drawDisc(ctx, s, shade(color, -0.14));
}

/** Wick's head: an outlined lime ball. The face and antennae are separate so they can turn. */
export function drawHead(ctx: Ctx): void {
  const c = HEAD / 2;
  drawDisc(ctx, HEAD, WORM_INK);
  glossyCircle(ctx, c, c, 27, '#E2FF6E', { outline: null, shadow: false });
}

/** Two feelers tipped with light, reaching forward (right) from the head centre at the middle of the canvas. */
export function drawAntennae(ctx: Ctx): void {
  const c = ANTENNAE / 2;
  ctx.lineCap = 'round';
  for (const [color, width] of [
    [WORM_INK, 8],
    ['#58B24A', 3.6],
  ] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(c + 14, c + s * 13);
      ctx.quadraticCurveTo(c + 31, c + s * 13, c + 37, c + s * 25);
      ctx.stroke();
    }
  }
  for (const s of [-1, 1]) {
    disc(ctx, c + 37, c + s * 25, 8, WORM_INK);
    glossyCircle(ctx, c + 37, c + s * 25, 5.6, '#FFF59A', { outline: null, shadow: false });
  }
}

/**
 * Wick's face on the head's canvas, seen from above and facing right: eyes side by side across the head, cheeks
 * behind them and the mouth at the front. Open eyes get their pupils from the scene.
 */
export function drawFace(ctx: Ctx, face: Face): void {
  const c = HEAD / 2;
  const ex = c + EYE.x;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.fillStyle = rgba(colors.pink, 0.5);
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(c - 6, c + s * 20, 5, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const whites = (big: number) => {
    for (const s of [-1, 1]) {
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.ellipse(ex, c + s * EYE.y, 7.5 * big, 9 * big, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  };
  const stroke = (width: number) => {
    ctx.strokeStyle = INK;
    ctx.lineWidth = width;
  };
  const mouth = (rx: number, ry: number) => {
    ctx.fillStyle = '#5A1236';
    ctx.beginPath();
    ctx.ellipse(c + 21 - rx * 0.4, c, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    stroke(2);
    ctx.stroke();
  };
  const smile = () => {
    stroke(2.4);
    ctx.beginPath();
    ctx.arc(c + 12, c, 9, -0.55, 0.55);
    ctx.stroke();
  };
  switch (face) {
    case 'idle':
      whites(1);
      smile();
      break;
    case 'open':
      whites(1.08);
      mouth(4.5, 6);
      break;
    case 'blink':
      stroke(3);
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(ex, c + s * EYE.y - 6);
        ctx.lineTo(ex, c + s * EYE.y + 6);
        ctx.stroke();
      }
      smile();
      break;
    case 'chomp':
    case 'happy':
      // closed, smiling eyes: arcs that bulge toward the back of the head
      stroke(3);
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(ex + 5, c + s * EYE.y, 6.5, Math.PI - 1.1, Math.PI + 1.1);
        ctx.stroke();
      }
      if (face === 'chomp') mouth(6, 9.5);
      else smile();
      break;
    case 'sad':
      stroke(3.2);
      for (const s of [-1, 1]) {
        const y = c + s * EYE.y;
        ctx.beginPath();
        ctx.moveTo(ex - 5, y - 5);
        ctx.lineTo(ex + 5, y + 5);
        ctx.moveTo(ex + 5, y - 5);
        ctx.lineTo(ex - 5, y + 5);
        ctx.stroke();
      }
      mouth(3, 3.4);
      break;
  }
}

export function drawPupil(ctx: Ctx): void {
  const c = PUPIL / 2;
  disc(ctx, c, c, 5, INK);
  disc(ctx, c - 1.6, c - 1.8, 1.7, '#FFFFFF');
}

// ─── berries ───

/** A glowberry: a glossy pink berry with a dark outline and a leaf. */
export function drawBerry(ctx: Ctx, w: number, h: number): void {
  const cx = w / 2;
  const cy = h - 24;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#1E4A1C';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 16);
  ctx.lineTo(cx + 2, cy - 25);
  ctx.stroke();
  ctx.fillStyle = colors.lime;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(cx + 11, cy - 24, 9, 4.6, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  disc(ctx, cx, cy, 20.5, shade(colors.pink, -0.72));
  glossyCircle(ctx, cx, cy, 17.5, colors.pink, { outline: null, shadow: false });
  ctx.fillStyle = 'rgba(255,230,242,0.9)';
  for (const [dx, dy] of [
    [6, 4],
    [-6, 8],
    [9, -4],
    [1, 11],
    [-10, 0],
  ] as const) {
    circle(ctx, cx + dx, cy + dy, 1.5);
    ctx.fill();
  }
}

/** The golden berry: a glossy gold star fruit (a star, so it never reads by colour alone). */
export function drawGolden(ctx: Ctx, s: number): void {
  const c = s / 2;
  starPath(ctx, c, c + 2, 5, 24, 12.5);
  const g = ctx.createLinearGradient(0, c - 22, 0, c + 24);
  g.addColorStop(0, colors.yellow);
  g.addColorStop(1, colors.orange);
  ctx.fillStyle = g;
  ctx.lineJoin = 'round';
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#6A3600';
  ctx.stroke();
  ctx.fill();
  starPath(ctx, c, c + 2, 5, 12, 6.4);
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.ellipse(c - 6, c - 5, 3.6, 2.2, -0.6, 0, Math.PI * 2);
  ctx.fill();
}

// ─── HUD ───

/** The HUD Pause button: a mint candy button with a pause glyph on the left. */
export function drawPauseButton(ctx: Ctx, w: number, h: number): void {
  glossyRect(ctx, 0, 0, w, h, ACCENT, {
    radius: 18,
    depth: 6,
    outline: shade(ACCENT, -0.6),
    lineWidth: 2.5,
  });
  ctx.fillStyle = INK;
  for (const x of [24, 36]) {
    roundRectPath(ctx, x, (h - 6) / 2 - 11, 7, 22, 3);
    ctx.fill();
  }
}

/** The cave pill's badge: a mint disc with a tiny glowworm curling across it. */
export function drawBadge(ctx: Ctx, s: number): void {
  const c = s / 2;
  glossyCircle(ctx, c, c, c - 1.5, ACCENT, { shadow: false });
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = shade(ACCENT, -0.6);
  ctx.lineWidth = 1.4;
  const k = s / 46;
  for (const [x, y, r] of [
    [-11, 6, 4],
    [-4, 8, 4.6],
    [4, 5, 5.2],
    [9, -3, 6.4],
  ] as const) {
    circle(ctx, c + x * k, c + y * k, r * k);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = INK;
  circle(ctx, c + 10.5 * k, c - 4 * k, 1.6 * k);
  ctx.fill();
}

/** A berry pip for the cave pill: eaten (a pink berry) or still to eat (an empty ring). */
export function drawPip(ctx: Ctx, s: number, on: boolean): void {
  const c = s / 2;
  if (on) {
    disc(ctx, c, c, c - 0.5, shade(colors.pink, -0.72));
    glossyCircle(ctx, c, c, c - 3, colors.pink, { outline: null, shadow: false });
  } else {
    circle(ctx, c, c, c - 3);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.38)';
    ctx.stroke();
  }
}
