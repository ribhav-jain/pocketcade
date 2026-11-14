// Pebble Post art (Canvas 2D, drawn once per mount into textures by scene.ts): the three zones' palettes, skies and
// parallax layers, the obstacles (front views), letters, power-up bubbles, scenery props, Pebble from behind in five
// poses plus her scarf, effects and HUD pieces. Decoration only; sizes are in design units.
import {
  colors,
  fillGradient,
  glossyCircle,
  glossyRect,
  prng,
  rgba,
  roundRectPath,
  shade,
  sprinkle,
  starPath,
} from '@pocketcade/toolkit';
import { PROP, VIEW, type PropKind } from './track.ts';

type Ctx = CanvasRenderingContext2D;

/** Pebble Post's accent: postbox red. */
export const ACCENT = '#F2475E';
export const INK = colors.ink;
const OUTLINE = '#1B1440';
/** Obstacle outlines: a dark navy that reads on the pale day ice and on the dark night and cave ice. */
const OB_OUT = '#16205C';
const SNOW_EDGE = '#8FA6D8';
const NAVY = '#232A5C';
const BEAK = '#FFA62B';
const STRAP = '#8A4B2A';
const LEATHER = '#C77A3E';

// ─── small helpers ───

function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number, rot = 0): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
}

function glow(ctx: Ctx, x: number, y: number, r: number, color: string, a: number): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, a));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function stroke(ctx: Ctx, color = OUTLINE, w = 3): void {
  ctx.lineWidth = w;
  ctx.strokeStyle = color;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
}

function vgrad(ctx: Ctx, y0: number, y1: number, a: string, b: string): CanvasGradient {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  return g;
}

function poly(ctx: Ctx, pts: readonly (readonly [number, number])[]): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

// ─── zones ───

export interface ZoneArt {
  /** alternating stripes of the ice, its lip at the edges, the snow banks, the snowfield and the canyon wall */
  ice: readonly [string, string];
  lip: readonly [string, string];
  bank: readonly [string, string];
  field: readonly [string, string];
  wall: readonly [string, string];
  /** the wall's rim: snow, or a glowing crystal seam */
  cap: string;
  /** lane dashes */
  lane: string;
  /** the haze far things fade into */
  fog: string;
  /** snow spray behind Pebble, and the flakes drifting past */
  spray: string;
  flake: string;
}

/** Snowy canyon by day, aurora night, crystal cave. */
export const ZONE_ART: readonly ZoneArt[] = [
  {
    ice: ['#8CC9F2', '#81C0EC'],
    lip: ['#FFFFFF', '#F2F7FF'],
    bank: ['#F1F6FE', '#E6EEFB'],
    field: ['#DDE8F9', '#D4E1F6'],
    wall: ['#93A5D2', '#889BCB'],
    cap: '#FFFFFF',
    lane: '#F6FCFF',
    fog: '#DCE8F8',
    spray: '#FFFFFF',
    flake: '#FFFFFF',
  },
  {
    ice: ['#3A5BA6', '#335298'],
    lip: ['#CFDDFF', '#B4C6F4'],
    bank: ['#2A3978', '#25336C'],
    field: ['#1D2759', '#1A2250'],
    wall: ['#151C4A', '#121840'],
    cap: '#6E8AD8',
    lane: '#8FF0D0',
    fog: '#1D2863',
    spray: '#CFE0FF',
    flake: '#DCE8FF',
  },
  {
    ice: ['#5C4AAE', '#52419E'],
    lip: ['#DCCBFF', '#BBA8F6'],
    bank: ['#32246E', '#2B1F61'],
    field: ['#20164C', '#1B1242'],
    wall: ['#160E39', '#120B30'],
    cap: '#C77DFF',
    lane: '#FF9BD8',
    fog: '#251951',
    spray: '#E8D8FF',
    flake: '#FFB8E6',
  },
];

/** The sky texture runs from SKY_TOP (above the top edge, for camera shake) to just under the horizon. */
export const SKY_TOP = -24;
export const SKY_H = VIEW.horizon + 16 - SKY_TOP;
/** Where the sun and the moon hang (design units): clear of the HUD's rows. */
export const SUN = { x: 408, y: 204, size: 124 } as const;
export const MOON = { x: 420, y: 194, size: 76 } as const;
/** Parallax tiles (they wrap): distant peaks and a nearer ridge, both standing on the horizon. */
export const LAYER_W = 1024;
export const FAR_H = 190;
export const NEAR_H = 120;
/** Aurora curtains and the cave ceiling are drawn half the sky wide and shown twice, the second one mirrored. */
export const AURORA_H = 250;
export const CEILING_H = 210;
export const CLOUDS = [
  { w: 190, h: 64 },
  { w: 140, h: 50 },
] as const;

const HORIZON_STOP = (VIEW.horizon - SKY_TOP) / SKY_H;
const SKIES: readonly (readonly (readonly [number, string])[])[] = [
  [
    [0, '#4F9AE8'],
    [0.5, '#8FC8F4'],
    [0.8, '#D6E3F8'],
    [HORIZON_STOP, '#FFE9E2'],
    [1, '#FFE9E2'],
  ],
  [
    [0, '#060520'],
    [0.5, '#131149'],
    [0.82, '#27226F'],
    [HORIZON_STOP, '#3A2E86'],
    [1, '#3A2E86'],
  ],
  [
    [0, '#06031A'],
    [0.55, '#160D3A'],
    [HORIZON_STOP, '#2E1D66'],
    [1, '#2E1D66'],
  ],
];

/**
 * The sky across the whole view (the design area's centre is at w / 2): a pale winter day with the sun's glow,
 * a starry night, or the dark of a cave lit by crystals.
 */
export function drawSky(ctx: Ctx, w: number, h: number, zone: number): void {
  fillGradient(ctx, 0, 0, w, h, SKIES[zone]!);
  const ox = w / 2 - VIEW.w / 2;
  const oy = -SKY_TOP;
  if (zone === 0) glow(ctx, ox + SUN.x, oy + SUN.y, 260, '#FFF6D0', 0.6);
  else if (zone === 1) {
    sprinkle(ctx, 0, 0, w, h * 0.8, Math.round(w * 0.2), '#FFFFFF', 31, [0.6, 1.7]);
    glow(ctx, ox + MOON.x, oy + MOON.y, 120, '#DCE6FF', 0.35);
  } else {
    const rnd = prng(19);
    for (let i = 0; i < Math.round(w / 70); i++)
      glow(
        ctx,
        rnd() * w,
        30 + rnd() * 230,
        60 + rnd() * 50,
        i % 2 ? colors.pink : colors.sky,
        0.16,
      );
  }
}

/** The low winter sun: a pale disc inside two soft rings. */
export function drawSun(ctx: Ctx, s: number): void {
  const c = s / 2;
  for (const [r, a] of [
    [1, 0.3],
    [0.78, 0.5],
    [0.58, 1],
  ] as const) {
    ctx.fillStyle = rgba('#FFFBE8', a);
    ellipse(ctx, c, c, (c - 1) * r, (c - 1) * r);
    ctx.fill();
  }
}

/** A full moon with a faint halo. */
export function drawMoon(ctx: Ctx, s: number): void {
  const c = s / 2;
  const r = s * 0.34;
  ctx.fillStyle = rgba('#DCE6FF', 0.22);
  ellipse(ctx, c, c, c - 1, c - 1);
  ctx.fill();
  ctx.fillStyle = '#F2F6FF';
  ellipse(ctx, c, c, r, r);
  ctx.fill();
  ctx.fillStyle = '#C3CEEE';
  for (const [x, y, k] of [
    [-0.32, -0.22, 0.24],
    [0.3, 0.26, 0.17],
    [0.16, -0.42, 0.12],
  ] as const) {
    ellipse(ctx, c + x * r, c + y * r, k * r, k * r);
    ctx.fill();
  }
}

/** A flat-bottomed heap of white puffs with a blue-grey underside. */
export function drawCloud(ctx: Ctx, w: number, h: number, seed: number): void {
  const rnd = prng(seed);
  const base = h * 0.8;
  const n = 5;
  ctx.fillStyle = '#FFFFFF';
  for (let k = 0; k < n; k++) {
    const r = h * (0.2 + 0.2 * Math.sin((Math.PI * (k + 0.5)) / n)) * (0.85 + rnd() * 0.3);
    ellipse(ctx, w * (0.16 + (0.68 * k) / (n - 1)), base - r * 0.9, r * 1.3, r);
    ctx.fill();
  }
  roundRectPath(ctx, w * 0.04, base - h * 0.22, w * 0.92, h * 0.3, h * 0.15);
  ctx.fill();
}

/** Aurora curtains: bright at the hem, fading upward. */
export function drawAurora(ctx: Ctx, w: number, h: number): void {
  const curtains = [
    ['#6CF5C2', 0.74, 0.5],
    ['#C77DFF', 0.56, 0.32],
    ['#8FF0D0', 0.9, 0.28],
  ] as const;
  const steps = Math.ceil(w / 12);
  curtains.forEach(([color, hem, a], c) => {
    const base = h * hem;
    const wave = (x: number) => 11 * Math.sin(x / 37 + c);
    ctx.beginPath();
    for (let k = 0; k <= steps; k++) {
      const x = (k / steps) * w;
      const y = base + 26 * Math.sin(x / 95 + c * 2) + wave(x);
      if (k) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    for (let k = steps; k >= 0; k--) {
      const x = (k / steps) * w;
      ctx.lineTo(x, base - 120 - 28 * Math.sin(x / 70 + c * 3) + wave(x));
    }
    ctx.closePath();
    const g = ctx.createLinearGradient(0, base + 30, 0, base - 150);
    g.addColorStop(0, rgba(color, a));
    g.addColorStop(0.35, rgba(color, a * 0.6));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.fill();
  });
}

/** A crystal shard pointing along `dir` (radians; 0 = up). */
function crystal(
  ctx: Ctx,
  x: number,
  y: number,
  hw: number,
  len: number,
  c: string,
  dir = 0,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(dir);
  poly(ctx, [
    [-hw, 0],
    [-hw * 0.8, -len * 0.75],
    [0, -len],
    [hw * 0.8, -len * 0.75],
    [hw, 0],
  ]);
  ctx.fillStyle = vgrad(ctx, -len, 0, shade(c, 0.55), shade(c, -0.25));
  ctx.fill();
  ctx.fillStyle = rgba('#FFFFFF', 0.45);
  poly(ctx, [
    [-hw * 0.5, -2],
    [-hw * 0.4, -len * 0.7],
    [0, -len * 0.92],
    [-hw * 0.05, -2],
  ]);
  ctx.fill();
  ctx.restore();
}

/** The cave's ceiling: two rows of stalactites and glowing crystals hanging from the rock. */
export function drawCeiling(ctx: Ctx, w: number, h: number): void {
  const rnd = prng(29);
  for (const [fill, lo, hi] of [
    ['#1E1450', h * 0.35, h * 0.92],
    ['#0C0724', h * 0.2, h * 0.62],
  ] as const) {
    ctx.fillStyle = fill;
    for (let x = -20; x < w + 20; ) {
      const ww = 30 + rnd() * 56;
      poly(ctx, [
        [x, 0],
        [x + ww / 2, lo + rnd() * (hi - lo)],
        [x + ww, 0],
      ]);
      ctx.fill();
      x += ww * 0.78;
    }
  }
  for (let i = 0; i < Math.round(w / 60); i++) {
    const cx = rnd() * w;
    const cy = 6 + rnd() * 40;
    const c = i % 3 ? colors.sky : colors.pink;
    glow(ctx, cx, cy + 14, 30, c, 0.5);
    crystal(ctx, cx, cy, 6 + rnd() * 6, 18 + rnd() * 16, c, Math.PI);
  }
}

/** A ridge of n peaks and valleys across the tile (n even, so it wraps), filled down to the ground. */
function ridge(
  ctx: Ctx,
  w: number,
  h: number,
  n: number,
  base: number,
  amp: number,
  seed: number,
  fill: string | CanvasGradient,
): number[] {
  const rnd = prng(seed);
  const pts = Array.from(
    { length: n },
    (_, i) => base - amp * (0.4 + rnd() * 0.6) * (i % 2 ? 0.4 : 1),
  );
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let i = 0; i <= n; i++) ctx.lineTo((i / n) * w, pts[i % n]!);
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  return pts;
}

/** Snow on each peak of a ridge, with a ragged lower edge; `reach` is how far down the slopes it comes. */
function caps(ctx: Ctx, w: number, pts: readonly number[], fill: string, reach = 0.45): void {
  const n = pts.length;
  const dx = (w / n) * reach;
  ctx.fillStyle = fill;
  for (let i = 0; i <= n; i += 2) {
    const x = (i / n) * w;
    const y = pts[i % n]!;
    const l = (pts[(i - 1 + n) % n]! - y) * reach;
    const r = (pts[(i + 1) % n]! - y) * reach;
    poly(ctx, [
      [x - dx, y + l],
      [x, y],
      [x + dx, y + r],
      [x + dx * 0.5, y + r * 0.74],
      [x + dx * 0.1, y + Math.min(l, r) * 1.05],
      [x - dx * 0.45, y + l * 0.68],
    ]);
    ctx.fill();
  }
}

/** The far layer: distant peaks, pale by day and dark at night and in the cave. Ground at the bottom. */
export function drawFar(ctx: Ctx, w: number, h: number, zone: number): void {
  if (zone === 0) {
    const pts = ridge(ctx, w, h, 14, h * 0.8, h * 0.74, 3, vgrad(ctx, 0, h, '#B4C8EA', '#DEE8F8'));
    caps(ctx, w, pts, '#F4F8FF', 0.4);
  } else if (zone === 1) {
    const pts = ridge(ctx, w, h, 14, h * 0.8, h * 0.72, 4, vgrad(ctx, 0, h, '#2A3478', '#1F2762'));
    caps(ctx, w, pts, '#4C62B4', 0.4);
  } else {
    ridge(ctx, w, h, 14, h * 0.7, h * 0.6, 5, vgrad(ctx, 0, h, '#2C1D62', '#22164F'));
  }
}

/** The nearer ridge: snowy cliffs, dark hills with a few lit cabins, or cave rock studded with crystals. */
export function drawNear(ctx: Ctx, w: number, h: number, zone: number): void {
  if (zone === 0) {
    const pts = ridge(ctx, w, h, 20, h * 0.8, h * 0.7, 9, vgrad(ctx, 0, h, '#9DB5E0', '#E2EBF9'));
    caps(ctx, w, pts, '#FFFFFF');
  } else if (zone === 1) {
    const pts = ridge(ctx, w, h, 20, h * 0.8, h * 0.68, 11, vgrad(ctx, 0, h, '#1A2262', '#161C52'));
    caps(ctx, w, pts, '#7187D0');
    const rnd = prng(41);
    for (let i = 0; i < 7; i++) {
      const x = 20 + rnd() * (w - 40);
      glow(ctx, x, h - 20, 16, colors.gold, 0.5);
      ctx.fillStyle = '#FFD27A';
      ctx.fillRect(x - 3, h - 23, 6, 6);
    }
  } else {
    ridge(ctx, w, h, 20, h * 0.78, h * 0.62, 13, vgrad(ctx, 0, h, '#22154F', '#1B1142'));
    const rnd = prng(23);
    for (let i = 0; i < 12; i++) {
      const x = 30 + rnd() * (w - 60);
      const y = h - 8 - rnd() * 40;
      const c = i % 2 ? colors.sky : colors.pink;
      glow(ctx, x, y - 14, 36, c, 0.4);
      for (let k = -1; k <= 1; k++) crystal(ctx, x + k * 9, y, 5, 18 + rnd() * 16, c, k * 0.35);
    }
  }
}

// ─── obstacles (front views; bottom-centre on the ice) ───
// Told apart by shape: low and wide (hop over), a beam on two slim posts with open ice underneath (tuck under),
// tall and solid (go around).

/** Texture size (design units) and world width (m) per obstacle look: [slot][look]. */
export interface SpriteArt {
  tw: number;
  th: number;
  /** width on the track (m) */
  w: number;
}
export const OBSTACLE_ART: readonly (readonly [SpriteArt, SpriteArt])[] = [
  [
    { tw: 1, th: 1, w: 0 },
    { tw: 1, th: 1, w: 0 },
  ],
  [
    { tw: 220, th: 96, w: 2.3 },
    { tw: 216, th: 92, w: 2.25 },
  ],
  [
    { tw: 240, th: 250, w: 2.5 },
    { tw: 240, th: 250, w: 2.5 },
  ],
  [
    { tw: 150, th: 300, w: 1.6 },
    { tw: 220, th: 240, w: 2.3 },
  ],
];

/** Where an obstacle touches the ice: a flat dark patch. */
function contact(ctx: Ctx, w: number, h: number): void {
  ctx.fillStyle = rgba('#10164A', 0.3);
  ellipse(ctx, w / 2, h - 7, w * 0.47, 7);
  ctx.fill();
}

/** A low snow drift: a lumpy white mound with blue hollows. */
function drawDrift(ctx: Ctx, w: number, h: number): void {
  contact(ctx, w, h);
  ctx.beginPath();
  ctx.moveTo(6, h - 5);
  ctx.bezierCurveTo(12, h * 0.5, 44, h * 0.12, 86, h * 0.2);
  ctx.bezierCurveTo(112, h * 0.02, 166, h * 0.08, 184, h * 0.32);
  ctx.bezierCurveTo(204, h * 0.42, 214, h * 0.7, w - 6, h - 5);
  ctx.closePath();
  ctx.fillStyle = vgrad(ctx, 0, h, '#FFFFFF', '#C0D4F4');
  ctx.fill();
  stroke(ctx, OB_OUT, 4);
  ctx.fillStyle = '#A4BDE8';
  ellipse(ctx, 70, h * 0.7, 34, 9, -0.15);
  ctx.fill();
  ellipse(ctx, 158, h * 0.64, 28, 8, 0.2);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ellipse(ctx, 98, h * 0.31, 30, 7, -0.1);
  ctx.fill();
}

/** A low fallen log lying across the lane, with snow along its top and a sawn end showing its rings. */
function drawLog(ctx: Ctx, w: number, h: number): void {
  contact(ctx, w, h);
  const top = 24;
  const bottom = h - 6;
  const mid = (top + bottom) / 2;
  // a stub of a branch
  ctx.fillStyle = '#8A5730';
  roundRectPath(ctx, 58, 6, 16, 30, 6);
  ctx.fill();
  stroke(ctx, OB_OUT, 3.5);
  const trunk = () => roundRectPath(ctx, 6, top, w - 12, bottom - top, (bottom - top) / 2);
  trunk();
  ctx.fillStyle = vgrad(ctx, top, bottom, '#C4813F', '#7C4A24');
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = '#5C3618';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  for (const [x, y, len] of [
    [26, mid + 2, 44],
    [92, mid + 16, 50],
    [84, mid - 6, 30],
    [136, mid + 4, 28],
    [36, mid + 20, 30],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y);
    ctx.stroke();
  }
  ctx.restore();
  trunk();
  stroke(ctx, OB_OUT, 4);
  // the sawn end
  const ex = w - 34;
  ellipse(ctx, ex, mid, 22, (bottom - top) / 2 - 3);
  ctx.fillStyle = '#F3D5A0';
  ctx.fill();
  stroke(ctx, OB_OUT, 3.5);
  ellipse(ctx, ex, mid, 13, 17);
  stroke(ctx, '#BE8C54', 3);
  ctx.fillStyle = '#BE8C54';
  ellipse(ctx, ex, mid, 4, 6);
  ctx.fill();
  // snow lying along the top
  ctx.beginPath();
  ctx.moveTo(16, top + 14);
  ctx.bezierCurveTo(20, top - 8, 60, top - 10, 96, top - 6);
  ctx.bezierCurveTo(130, top - 12, 160, top - 6, w - 58, top + 10);
  ctx.bezierCurveTo(w - 80, top + 20, 140, top + 8, 118, top + 18);
  ctx.bezierCurveTo(96, top + 8, 70, top + 22, 50, top + 12);
  ctx.bezierCurveTo(40, top + 22, 24, top + 20, 16, top + 14);
  ctx.closePath();
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  stroke(ctx, SNOW_EDGE, 2.5);
}

/** An icon of a sealed envelope, centred on (x, y), w wide. */
function envelopeIcon(ctx: Ctx, x: number, y: number, w: number, paper = '#FFF6EA'): void {
  const h = w * 0.68;
  roundRectPath(ctx, x - w / 2, y - h / 2, w, h, w * 0.08);
  ctx.fillStyle = paper;
  ctx.fill();
  stroke(ctx, OUTLINE, Math.max(1.5, w * 0.06));
  ctx.beginPath();
  ctx.moveTo(x - w / 2 + 2, y - h / 2 + 2);
  ctx.lineTo(x, y + h * 0.08);
  ctx.lineTo(x + w / 2 - 2, y - h / 2 + 2);
  stroke(ctx, OUTLINE, Math.max(1.2, w * 0.05));
  ctx.fillStyle = ACCENT;
  ellipse(ctx, x, y + h * 0.06, w * 0.12, w * 0.12);
  ctx.fill();
}

/** Three chevrons pointing down across a beam at height y: tuck. */
function chevrons(ctx: Ctx, w: number, y: number, color: string): void {
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  for (const cx of [w * 0.28, w * 0.5, w * 0.72]) {
    ctx.beginPath();
    ctx.moveTo(cx - 15, y - 9);
    ctx.lineTo(cx, y + 9);
    ctx.lineTo(cx + 15, y - 9);
    ctx.stroke();
  }
}

/** The beam of a high obstacle ends here (from the top); the ice below it is open between the posts. */
const BEAM_BOTTOM = 112;

/** A high icicle arch: a deep-blue ice beam on two slim ice posts, fringed with icicles, open underneath. */
function drawArch(ctx: Ctx, w: number, h: number): void {
  for (const x of [8, w - 34]) {
    glossyRect(ctx, x, 60, 26, h - 64, '#7CC4F4', {
      radius: 9,
      depth: 6,
      outline: OB_OUT,
      lineWidth: 3.5,
      gloss: 0.4,
      shadow: false,
    });
  }
  const rnd = prng(7);
  for (let x = 46; x < w - 40; x += 17) {
    const len = 16 + rnd() * 24;
    poly(ctx, [
      [x - 8, BEAM_BOTTOM - 8],
      [x, BEAM_BOTTOM + len],
      [x + 8, BEAM_BOTTOM - 8],
    ]);
    ctx.fillStyle = vgrad(ctx, BEAM_BOTTOM, BEAM_BOTTOM + len, '#FFFFFF', '#A9DDFB');
    ctx.fill();
    stroke(ctx, OB_OUT, 2.5);
  }
  glossyRect(ctx, 0, 24, w, BEAM_BOTTOM - 24, '#4A8BE0', {
    radius: 20,
    depth: 10,
    outline: OB_OUT,
    lineWidth: 4,
    gloss: 0.4,
    shadow: false,
  });
  chevrons(ctx, w, 68, '#FFFFFF');
  ctx.fillStyle = '#FFFFFF';
  roundRectPath(ctx, 6, 12, w - 12, 24, 12);
  ctx.fill();
  stroke(ctx, SNOW_EDGE, 2.5);
}

/** A high banner of frozen mail: two striped poles holding a cloth hung with envelopes and parcels. */
function drawBanner(ctx: Ctx, w: number, h: number): void {
  const pole = 16;
  for (const x of [10, w - 10 - pole]) {
    roundRectPath(ctx, x, 6, pole, h - 8, 7);
    ctx.fillStyle = '#FFF6EA';
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = ACCENT;
    for (let y = 0; y < h; y += 28) {
      poly(ctx, [
        [x, y],
        [x + pole, y - 12],
        [x + pole, y + 2],
        [x, y + 14],
      ]);
      ctx.fill();
    }
    ctx.restore();
    roundRectPath(ctx, x, 6, pole, h - 8, 7);
    stroke(ctx, OUTLINE, 3.5);
    glossyCircle(ctx, x + pole / 2, 11, 11, colors.gold, { shadow: false });
  }
  // the cloth
  const top = 24;
  const bottom = BEAM_BOTTOM - 8;
  ctx.beginPath();
  ctx.moveTo(24, top);
  ctx.quadraticCurveTo(w / 2, top + 20, w - 24, top);
  ctx.lineTo(w - 28, bottom);
  ctx.quadraticCurveTo(w / 2, bottom + 22, 28, bottom);
  ctx.closePath();
  ctx.fillStyle = vgrad(ctx, top, bottom + 10, '#6A7CF0', '#3B48B4');
  ctx.fill();
  stroke(ctx, OUTLINE, 4);
  // frost along the top
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.moveTo(24, top);
  ctx.quadraticCurveTo(w / 2, top + 20, w - 24, top);
  ctx.lineTo(w - 26, top + 11);
  ctx.quadraticCurveTo(w / 2, top + 31, 26, top + 11);
  ctx.closePath();
  ctx.fill();
  chevrons(ctx, w, (top + bottom) / 2 + 16, '#FFE27A');
  // frozen mail hanging from the hem
  for (let i = 0; i < 4; i++) {
    const x = 56 + i * ((w - 112) / 3);
    const y = bottom + 20 - Math.abs(i - 1.5) * 6;
    ctx.strokeStyle = '#DDE8FF';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x, y - 18);
    ctx.lineTo(x, y - 6);
    ctx.stroke();
    if (i % 2) envelopeIcon(ctx, x, y + 6, 34);
    else {
      glossyRect(ctx, x - 15, y - 8, 30, 28, '#D9A066', {
        radius: 5,
        depth: 4,
        outline: OUTLINE,
        shadow: false,
      });
      ctx.fillStyle = ACCENT;
      ctx.fillRect(x - 2, y - 8, 4, 24);
    }
  }
}

/** A tall ice pillar: a faceted crystal column with frost bands, as wide as the lane's middle. */
function drawPillar(ctx: Ctx, w: number, h: number): void {
  contact(ctx, w, h);
  const body = () =>
    poly(ctx, [
      [12, h - 7],
      [20, 52],
      [w / 2, 8],
      [w - 20, 52],
      [w - 12, h - 7],
    ]);
  body();
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, '#3D86E0');
  g.addColorStop(0.42, '#C4EDFF');
  g.addColorStop(0.62, '#7CC4F4');
  g.addColorStop(1, '#2E6BCB');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.fillStyle = rgba('#FFFFFF', 0.5);
  poly(ctx, [
    [w * 0.37, 44],
    [w * 0.5, 16],
    [w * 0.55, 46],
    [w * 0.53, h - 10],
    [w * 0.39, h - 10],
  ]);
  ctx.fill();
  ctx.strokeStyle = '#2A5FBE';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(w * 0.7, 48);
  ctx.lineTo(w * 0.73, h - 10);
  ctx.stroke();
  // frost bands
  ctx.fillStyle = '#FFFFFF';
  for (const y of [h * 0.36, h * 0.7]) {
    ctx.beginPath();
    ctx.moveTo(15, y);
    ctx.quadraticCurveTo(w / 2, y + 16, w - 15, y);
    ctx.lineTo(w - 14, y + 10);
    ctx.quadraticCurveTo(w / 2, y + 27, 14, y + 10);
    ctx.closePath();
    ctx.fill();
  }
  body();
  stroke(ctx, OB_OUT, 5);
}

/** A parked mail sled, piled high with sacks and parcels (seen from the front). */
function drawSled(ctx: Ctx, w: number, h: number): void {
  contact(ctx, w, h);
  // runners curling up at the front
  ctx.strokeStyle = '#C9CFE6';
  ctx.lineWidth = 7;
  for (const x of [28, w - 28]) {
    ctx.beginPath();
    ctx.moveTo(x, h - 8);
    ctx.lineTo(x, h - 40);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(14, h - 8);
  ctx.lineTo(w - 14, h - 8);
  stroke(ctx, '#8E96BC', 7);
  // the red sled body
  glossyRect(ctx, 8, h - 92, w - 16, 62, ACCENT, {
    radius: 14,
    depth: 8,
    outline: OUTLINE,
    lineWidth: 4,
    shadow: false,
  });
  envelopeIcon(ctx, w / 2, h - 64, 44, '#FFE9A8');
  // the load: parcels stacked up
  const parcels = [
    [20, h - 150, 80, 64, '#D9A066'],
    [104, h - 160, 96, 74, '#E4B47C'],
    [44, h - 210, 70, 62, '#C88B52'],
    [118, h - 220, 66, 64, '#D9A066'],
  ] as const;
  for (const [x, y, pw, ph, c] of parcels) {
    glossyRect(ctx, x, y, pw, ph, c, {
      radius: 8,
      depth: 6,
      outline: OUTLINE,
      lineWidth: 3.5,
      shadow: false,
    });
    ctx.fillStyle = ACCENT;
    ctx.fillRect(x + pw / 2 - 3, y + 3, 6, ph - 10);
    ctx.fillRect(x + 3, y + ph / 2 - 6, pw - 6, 5);
  }
  // a mail sack on top
  ctx.beginPath();
  ctx.moveTo(78, 70);
  ctx.bezierCurveTo(60, 40, 90, 14, 110, 18);
  ctx.bezierCurveTo(140, 12, 160, 44, 146, 72);
  ctx.closePath();
  ctx.fillStyle = vgrad(ctx, 14, 72, '#F2E2C4', '#CDB48C');
  ctx.fill();
  stroke(ctx, OUTLINE, 3.5);
  envelopeIcon(ctx, 112, 50, 30);
  // snow on the load
  ctx.fillStyle = '#FFFFFF';
  ellipse(ctx, 70, h - 212, 30, 8);
  ctx.fill();
  ellipse(ctx, 150, h - 222, 28, 7);
  ctx.fill();
}

export function drawObstacle(ctx: Ctx, slot: number, look: number, w: number, h: number): void {
  if (slot === 1) (look ? drawLog : drawDrift)(ctx, w, h);
  else if (slot === 2) (look ? drawBanner : drawArch)(ctx, w, h);
  else (look ? drawSled : drawPillar)(ctx, w, h);
}

// ─── letters and power-ups ───

/** A letter: an airmail envelope with a red-and-blue striped border and a red seal. */
export const LETTER_ART: SpriteArt = { tw: 72, th: 52, w: 0.8 };
export function drawLetter(ctx: Ctx, w: number, h: number): void {
  const r = 7;
  roundRectPath(ctx, 3, 3, w - 6, h - 6, r);
  ctx.fillStyle = '#FFF6EA';
  ctx.fill();
  // airmail border
  ctx.save();
  roundRectPath(ctx, 3, 3, w - 6, h - 6, r);
  ctx.clip();
  for (let k = -h; k < w + h; k += 12) {
    ctx.fillStyle = (k / 12) % 2 ? '#3E6DE0' : ACCENT;
    ctx.beginPath();
    ctx.moveTo(k, 0);
    ctx.lineTo(k + 6, 0);
    ctx.lineTo(k + 6 - h, h);
    ctx.lineTo(k - h, h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = '#FFF6EA';
  roundRectPath(ctx, 10, 9, w - 20, h - 18, 4);
  ctx.fill();
  ctx.restore();
  roundRectPath(ctx, 3, 3, w - 6, h - 6, r);
  stroke(ctx, OUTLINE, 3);
  ctx.beginPath();
  ctx.moveTo(11, 10);
  ctx.lineTo(w / 2, h * 0.56);
  ctx.lineTo(w - 11, 10);
  stroke(ctx, '#B7A6C9', 2.5);
  glossyCircle(ctx, w / 2, h * 0.56, 7.5, ACCENT, { shadow: false });
}

/** A power-up bubble: a glossy orb with the scarf or the bell inside. */
export const PICKUP_ART: SpriteArt = { tw: 104, th: 104, w: 1.25 };
export function drawPickup(ctx: Ctx, s: number, kind: 'scarf' | 'bell'): void {
  const c = s / 2;
  const tint = kind === 'bell' ? colors.gold : ACCENT;
  ctx.fillStyle = rgba(tint, 0.35);
  ellipse(ctx, c, c, c - 2, c - 2);
  ctx.fill();
  ctx.fillStyle = rgba('#FFFFFF', 0.4);
  ellipse(ctx, c, c, c * 0.8, c * 0.8);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#FFFFFF';
  ctx.stroke();
  if (kind === 'scarf') scarfIcon(ctx, c, c, s * 0.5);
  else bellIcon(ctx, c, c + 2, s * 0.46);
  ctx.fillStyle = rgba('#FFFFFF', 0.8);
  ellipse(ctx, c - c * 0.38, c - c * 0.44, c * 0.18, c * 0.1, -0.6);
  ctx.fill();
}

/** A red-and-white striped scarf, folded (icon). */
function scarfIcon(ctx: Ctx, x: number, y: number, s: number): void {
  ctx.save();
  ctx.translate(x, y);
  const band = (x0: number, y0: number, x1: number, y1: number, wd: number) => {
    const ang = Math.atan2(y1 - y0, x1 - x0);
    const len = Math.hypot(x1 - x0, y1 - y0);
    ctx.save();
    ctx.translate(x0, y0);
    ctx.rotate(ang);
    roundRectPath(ctx, 0, -wd / 2, len, wd, wd / 2.5);
    ctx.fillStyle = '#FFF6EA';
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = ACCENT;
    for (let k = 4; k < len; k += wd * 0.7) ctx.fillRect(k, -wd, wd * 0.35, wd * 2);
    ctx.restore();
    roundRectPath(ctx, 0, -wd / 2, len, wd, wd / 2.5);
    stroke(ctx, OUTLINE, 2.5);
    ctx.restore();
  };
  band(-s * 0.48, -s * 0.18, s * 0.48, -s * 0.18, s * 0.26);
  band(s * 0.12, -s * 0.1, s * 0.22, s * 0.5, s * 0.22);
  band(-s * 0.08, -s * 0.1, -s * 0.26, s * 0.44, s * 0.22);
  ctx.restore();
}

/** A golden hand bell with a red bow (icon). */
function bellIcon(ctx: Ctx, x: number, y: number, s: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(-s * 0.5, s * 0.36);
  ctx.bezierCurveTo(-s * 0.42, s * 0.2, -s * 0.36, -s * 0.36, 0, -s * 0.4);
  ctx.bezierCurveTo(s * 0.36, -s * 0.36, s * 0.42, s * 0.2, s * 0.5, s * 0.36);
  ctx.closePath();
  ctx.fillStyle = vgrad(ctx, -s * 0.4, s * 0.36, '#FFF0A0', '#E8A322');
  ctx.fill();
  stroke(ctx, OUTLINE, 3);
  glossyCircle(ctx, 0, s * 0.44, s * 0.1, '#E8A322', { shadow: false });
  ctx.fillStyle = ACCENT;
  ellipse(ctx, -s * 0.14, -s * 0.42, s * 0.14, s * 0.08, 0.4);
  ctx.fill();
  ellipse(ctx, s * 0.14, -s * 0.42, s * 0.14, s * 0.08, -0.4);
  ctx.fill();
  ellipse(ctx, 0, -s * 0.42, s * 0.06, s * 0.06);
  ctx.fill();
  ctx.fillStyle = rgba('#FFFFFF', 0.6);
  ellipse(ctx, -s * 0.18, -s * 0.05, s * 0.06, s * 0.16, 0.2);
  ctx.fill();
  ctx.restore();
}

// ─── scenery props (front views; bottom-centre on the snow) ───

export const PROP_ART: Record<PropKind, SpriteArt> = {
  [PROP.pine]: { tw: 130, th: 230, w: 3 },
  [PROP.rock]: { tw: 150, th: 96, w: 2.4 },
  [PROP.sign]: { tw: 100, th: 170, w: 1.4 },
  [PROP.nightPine]: { tw: 130, th: 230, w: 3 },
  [PROP.lantern]: { tw: 100, th: 210, w: 1.4 },
  [PROP.crystalPink]: { tw: 140, th: 180, w: 2.4 },
  [PROP.crystalBlue]: { tw: 140, th: 180, w: 2.4 },
  [PROP.hut]: { tw: 200, th: 170, w: 5 },
  [PROP.igloo]: { tw: 190, th: 120, w: 4.4 },
  [PROP.spire]: { tw: 120, th: 230, w: 2.8 },
};

function pine(ctx: Ctx, w: number, h: number, leaf: string, snow: string): void {
  ctx.fillStyle = '#6B4330';
  ctx.fillRect(w / 2 - 8, h - 34, 16, 30);
  for (let k = 0; k < 4; k++) {
    const y = h - 30 - k * 46;
    const hw = 58 - k * 11;
    ctx.beginPath();
    ctx.moveTo(w / 2 - hw, y);
    ctx.lineTo(w / 2, y - 70);
    ctx.lineTo(w / 2 + hw, y);
    ctx.closePath();
    ctx.fillStyle = vgrad(ctx, y - 70, y, shade(leaf, 0.15), shade(leaf, -0.2));
    ctx.fill();
    stroke(ctx, shade(leaf, -0.55), 2.5);
    ctx.fillStyle = snow;
    ctx.beginPath();
    ctx.moveTo(w / 2 - hw * 0.55, y - 30);
    ctx.lineTo(w / 2, y - 70);
    ctx.lineTo(w / 2 + hw * 0.55, y - 30);
    ctx.quadraticCurveTo(w / 2, y - 40, w / 2 - hw * 0.55, y - 30);
    ctx.fill();
  }
}

/** A little post hut: timber walls, a snowed-over red roof, a lit window and an envelope sign by the door. */
function hut(ctx: Ctx, w: number, h: number): void {
  glossyRect(ctx, 34, 76, 132, h - 80, '#C98B55', {
    radius: 6,
    depth: 0,
    outline: OUTLINE,
    lineWidth: 3,
    gloss: 0.12,
    shadow: false,
  });
  ctx.strokeStyle = '#9A6337';
  ctx.lineWidth = 2.5;
  for (let y = 98; y < h - 10; y += 20) {
    ctx.beginPath();
    ctx.moveTo(38, y);
    ctx.lineTo(162, y);
    ctx.stroke();
  }
  roundRectPath(ctx, 86, 108, 30, h - 112, 6);
  ctx.fillStyle = '#6B3F22';
  ctx.fill();
  stroke(ctx, OUTLINE, 3);
  roundRectPath(ctx, 126, 100, 28, 26, 5);
  ctx.fillStyle = '#FFD97A';
  ctx.fill();
  stroke(ctx, OUTLINE, 3);
  envelopeIcon(ctx, 60, 112, 32);
  // the roof, then the snow lying on it
  poly(ctx, [
    [14, 88],
    [w / 2, 20],
    [w - 14, 88],
  ]);
  ctx.fillStyle = vgrad(ctx, 20, 88, shade(ACCENT, 0.1), shade(ACCENT, -0.25));
  ctx.fill();
  stroke(ctx, OUTLINE, 3);
  ctx.beginPath();
  ctx.moveTo(6, 86);
  ctx.lineTo(w / 2, 8);
  ctx.lineTo(w - 6, 86);
  ctx.quadraticCurveTo(w - 16, 94, w - 30, 84);
  ctx.lineTo(w / 2, 40);
  ctx.lineTo(30, 84);
  ctx.quadraticCurveTo(16, 94, 6, 86);
  ctx.closePath();
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  stroke(ctx, SNOW_EDGE, 2.5);
}

/** An igloo of snow blocks with a warm light in its doorway. */
function igloo(ctx: Ctx, w: number, h: number): void {
  const dome = () => {
    ctx.beginPath();
    ctx.moveTo(8, h - 5);
    ctx.bezierCurveTo(8, -24, w - 8, -24, w - 8, h - 5);
    ctx.closePath();
  };
  dome();
  ctx.fillStyle = vgrad(ctx, 0, h, '#F6F9FF', '#B4C7EC');
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = '#8198D0';
  ctx.lineWidth = 2.5;
  for (const [y, n] of [
    [h * 0.3, 3],
    [h * 0.54, 5],
    [h * 0.78, 6],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    for (let k = 1; k < n; k++) {
      ctx.moveTo((k / n) * w, y);
      ctx.lineTo((k / n) * w + 6, y + h * 0.24);
    }
    ctx.stroke();
  }
  ctx.restore();
  dome();
  stroke(ctx, '#33478F', 3.5);
  ctx.beginPath();
  ctx.moveTo(w / 2 - 24, h - 5);
  ctx.lineTo(w / 2 - 24, h - 34);
  ctx.arc(w / 2, h - 34, 24, Math.PI, 0);
  ctx.lineTo(w / 2 + 24, h - 5);
  ctx.closePath();
  ctx.fillStyle = vgrad(ctx, h - 58, h, '#FFE08A', '#F0A030');
  ctx.fill();
  stroke(ctx, '#33478F', 3.5);
}

export function drawProp(ctx: Ctx, kind: PropKind, w: number, h: number): void {
  if (kind === PROP.pine) pine(ctx, w, h, '#2E8C7A', '#FFFFFF');
  else if (kind === PROP.nightPine) {
    pine(ctx, w, h, '#1F4A6E', '#C9D8FF');
    // fairy lights
    const rnd = prng(3);
    for (let i = 0; i < 9; i++) {
      const y = 60 + rnd() * (h - 100);
      const x = w / 2 + (rnd() - 0.5) * (h - y) * 0.45;
      glow(ctx, x, y, 8, colors.gold, 0.8);
    }
  } else if (kind === PROP.rock) {
    ctx.beginPath();
    ctx.moveTo(8, h - 4);
    ctx.lineTo(20, 34);
    ctx.lineTo(62, 10);
    ctx.lineTo(112, 22);
    ctx.lineTo(w - 8, h - 4);
    ctx.closePath();
    ctx.fillStyle = vgrad(ctx, 10, h, '#8A97C4', '#5D6898');
    ctx.fill();
    stroke(ctx, '#353E70', 3);
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.moveTo(18, 38);
    ctx.lineTo(62, 10);
    ctx.lineTo(112, 22);
    ctx.lineTo(128, 44);
    ctx.quadraticCurveTo(70, 30, 18, 38);
    ctx.fill();
  } else if (kind === PROP.sign) {
    ctx.fillStyle = '#7A4A30';
    ctx.fillRect(w / 2 - 6, 50, 12, h - 52);
    glossyRect(ctx, 6, 8, w - 12, 64, ACCENT, {
      radius: 12,
      depth: 6,
      outline: shade(ACCENT, -0.6),
      lineWidth: 3,
      shadow: false,
    });
    envelopeIcon(ctx, w / 2, 38, 46);
    ctx.fillStyle = '#FFFFFF';
    roundRectPath(ctx, 8, 4, w - 16, 12, 6);
    ctx.fill();
  } else if (kind === PROP.lantern) {
    ctx.fillStyle = '#2B2350';
    ctx.fillRect(w / 2 - 5, 60, 10, h - 62);
    glow(ctx, w / 2, 50, 50, colors.gold, 0.55);
    glossyRect(ctx, w / 2 - 20, 26, 40, 50, '#FFD27A', {
      radius: 8,
      depth: 4,
      outline: '#5A3B12',
      lineWidth: 3,
      gloss: 0.6,
      shadow: false,
    });
    ctx.fillStyle = '#2B2350';
    roundRectPath(ctx, w / 2 - 24, 18, 48, 12, 5);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ellipse(ctx, w / 2, 18, 22, 6);
    ctx.fill();
  } else if (kind === PROP.hut) hut(ctx, w, h);
  else if (kind === PROP.igloo) igloo(ctx, w, h);
  else if (kind === PROP.spire) {
    // a stalagmite tipped with crystals
    glow(ctx, w / 2, h * 0.2, 54, colors.pink, 0.35);
    poly(ctx, [
      [8, h - 4],
      [w * 0.34, h * 0.48],
      [w * 0.43, h * 0.22],
      [w * 0.57, h * 0.22],
      [w * 0.67, h * 0.52],
      [w - 8, h - 4],
    ]);
    ctx.fillStyle = vgrad(ctx, h * 0.2, h, '#6247B4', '#2A1A66');
    ctx.fill();
    stroke(ctx, '#120A30', 3);
    ctx.fillStyle = rgba('#FFFFFF', 0.16);
    poly(ctx, [
      [w * 0.43, h * 0.24],
      [w * 0.5, h * 0.24],
      [w * 0.46, h - 8],
      [w * 0.24, h - 8],
    ]);
    ctx.fill();
    crystal(ctx, w / 2 - 15, h * 0.26, 8, 26, colors.sky, -0.45);
    crystal(ctx, w / 2 + 15, h * 0.26, 8, 28, colors.sky, 0.45);
    crystal(ctx, w / 2, h * 0.25, 13, 46, colors.pink, 0);
  } else {
    const c = kind === PROP.crystalPink ? colors.pink : colors.sky;
    glow(ctx, w / 2, h * 0.55, w * 0.55, c, 0.35);
    crystal(ctx, w / 2 - 34, h - 6, 16, 90, c, -0.4);
    crystal(ctx, w / 2 + 34, h - 6, 16, 100, c, 0.35);
    crystal(ctx, w / 2, h - 4, 24, h - 16, c, 0);
    crystal(ctx, w / 2 + 12, h - 4, 12, 70, shade(c, 0.3), 0.15);
  }
}

// ─── Pebble (seen from behind and above, belly-sliding) ───

/** Pebble's textures: bottom-centre on the ice. */
export const PEB = { w: 180, h: 200 } as const;
/** How big she is drawn on screen (Pebble's texture units → design units). */
export const PEB_SCALE = 0.72;
export const POSES = ['slide', 'lean', 'tuck', 'hop', 'tumble'] as const;
export type Pose = (typeof POSES)[number];
/** Where her neck is in each pose (texture units), for the scarf. */
export const NECK: Record<Pose, { x: number; y: number }> = {
  slide: { x: 90, y: 74 },
  lean: { x: 100, y: 76 },
  tuck: { x: 90, y: 124 },
  hop: { x: 90, y: 66 },
  tumble: { x: 90, y: 92 },
};

function flipper(ctx: Ctx, x: number, y: number, len: number, ang: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(0, -9);
  ctx.quadraticCurveTo(len * 0.6, -14, len, 0);
  ctx.quadraticCurveTo(len * 0.6, 12, 0, 9);
  ctx.closePath();
  ctx.fillStyle = vgrad(ctx, -14, 12, '#3A438A', '#1A1F48');
  ctx.fill();
  stroke(ctx, OUTLINE, 3);
  ctx.restore();
}

function foot(ctx: Ctx, x: number, y: number, s = 1): void {
  ctx.beginPath();
  ctx.moveTo(x - 13 * s, y - 10 * s);
  ctx.quadraticCurveTo(x - 16 * s, y + 8 * s, x - 9 * s, y + 10 * s);
  ctx.lineTo(x - 3 * s, y + 4 * s);
  ctx.lineTo(x, y + 12 * s);
  ctx.lineTo(x + 3 * s, y + 4 * s);
  ctx.lineTo(x + 9 * s, y + 10 * s);
  ctx.quadraticCurveTo(x + 16 * s, y + 8 * s, x + 13 * s, y - 10 * s);
  ctx.closePath();
  ctx.fillStyle = vgrad(ctx, y - 10 * s, y + 12 * s, '#FFC069', BEAK);
  ctx.fill();
  stroke(ctx, '#7A3D10', 2.5);
}

/** The beanie: postbox-red knit dome with a ribbed cuff and a white pom-pom. */
function beanie(ctx: Ctx, x: number, y: number, r: number, tilt = 0): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  // pom-pom
  ctx.fillStyle = '#FFFFFF';
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    ellipse(ctx, Math.cos(a) * r * 0.2, -r * 1.12 + Math.sin(a) * r * 0.2, r * 0.24, r * 0.24);
    ctx.fill();
  }
  ellipse(ctx, 0, -r * 1.12, r * 0.3, r * 0.3);
  ctx.fill();
  ellipse(ctx, 0, -r * 1.12, r * 0.38, r * 0.38);
  stroke(ctx, '#B8B2D8', 2);
  // dome
  ctx.beginPath();
  ctx.moveTo(-r * 1.02, r * 0.05);
  ctx.bezierCurveTo(-r * 1.02, -r * 1.05, r * 1.02, -r * 1.05, r * 1.02, r * 0.05);
  ctx.closePath();
  ctx.fillStyle = vgrad(ctx, -r, r * 0.1, shade(ACCENT, 0.2), shade(ACCENT, -0.15));
  ctx.fill();
  stroke(ctx, OUTLINE, 3);
  // knit lines
  ctx.strokeStyle = rgba(shade(ACCENT, -0.45), 0.6);
  ctx.lineWidth = 2;
  for (let k = -2; k <= 2; k++) {
    ctx.beginPath();
    ctx.moveTo(k * r * 0.34, r * 0.0);
    ctx.quadraticCurveTo(k * r * 0.4, -r * 0.5, k * r * 0.12, -r * 0.82);
    ctx.stroke();
  }
  // ribbed cuff
  roundRectPath(ctx, -r * 1.1, -r * 0.08, r * 2.2, r * 0.46, r * 0.2);
  ctx.fillStyle = shade(ACCENT, -0.12);
  ctx.fill();
  stroke(ctx, OUTLINE, 3);
  ctx.strokeStyle = rgba(shade(ACCENT, -0.5), 0.7);
  ctx.lineWidth = 2;
  for (let k = -r; k <= r; k += r * 0.2) {
    ctx.beginPath();
    ctx.moveTo(k, -r * 0.02);
    ctx.lineTo(k, r * 0.32);
    ctx.stroke();
  }
  // a little white stripe
  ctx.fillStyle = rgba('#FFFFFF', 0.85);
  ctx.fillRect(-r * 1.04, -r * 0.24, r * 2.08, r * 0.08);
  ctx.restore();
}

/** Pebble's body from behind: dark back with a white rim, satchel strap and bag, flippers, feet, head and beanie. */
function backView(
  ctx: Ctx,
  o: { body: number; head: number; flipL: number; flipR: number; feet: number; squash: number },
): void {
  const cx = 90;
  const by = o.body;
  const ry = 62 * o.squash;
  // feet at the near end
  foot(ctx, cx - 22, o.feet);
  foot(ctx, cx + 22, o.feet);
  // flippers
  flipper(ctx, cx - 40, by - ry * 0.3, 46, Math.PI + o.flipL);
  flipper(ctx, cx + 40, by - ry * 0.3, 46, -o.flipR);
  // white belly rim, then the dark back
  ctx.fillStyle = '#F4F1FF';
  ellipse(ctx, cx, by + 6, 54, ry + 2);
  ctx.fill();
  stroke(ctx, OUTLINE, 3);
  ellipse(ctx, cx, by - 2, 47, ry - 4);
  const g = ctx.createRadialGradient(cx - 16, by - ry * 0.5, 6, cx, by, ry);
  g.addColorStop(0, '#4A55A8');
  g.addColorStop(0.55, NAVY);
  g.addColorStop(1, '#141838');
  ctx.fillStyle = g;
  ctx.fill();
  // tail
  ctx.beginPath();
  ctx.moveTo(cx - 12, by + ry - 6);
  ctx.lineTo(cx, by + ry + 10);
  ctx.lineTo(cx + 12, by + ry - 6);
  ctx.closePath();
  ctx.fillStyle = NAVY;
  ctx.fill();
  stroke(ctx, OUTLINE, 2.5);
  // satchel strap from the right shoulder to the left hip, and the bag
  ctx.beginPath();
  ctx.moveTo(cx + 34, by - ry * 0.62);
  ctx.lineTo(cx - 40, by + ry * 0.5);
  ctx.lineWidth = 11;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  ctx.lineWidth = 7;
  ctx.strokeStyle = STRAP;
  ctx.stroke();
  glossyRect(ctx, cx - 70, by + ry * 0.2, 46, 40, LEATHER, {
    radius: 9,
    depth: 6,
    outline: OUTLINE,
    lineWidth: 3,
  });
  ctx.fillStyle = shade(LEATHER, -0.2);
  roundRectPath(ctx, cx - 70, by + ry * 0.2, 46, 18, 9);
  ctx.fill();
  stroke(ctx, OUTLINE, 2.5);
  envelopeIcon(ctx, cx - 47, by + ry * 0.2 + 24, 18, '#FFE9A8');
  // head and beanie
  ctx.fillStyle = NAVY;
  ellipse(ctx, cx, o.head, 33, 31);
  ctx.fill();
  stroke(ctx, OUTLINE, 3);
  beanie(ctx, cx, o.head - 2, 33);
}

/** One of Pebble's poses. */
export function drawPebble(ctx: Ctx, pose: Pose): void {
  if (pose === 'tumble') return drawTumble(ctx);
  if (pose === 'lean') {
    // leaning into a lane change (right; mirrored for left)
    ctx.save();
    ctx.translate(90, 196);
    ctx.rotate(0.14);
    ctx.translate(-90, -196);
    backView(ctx, { body: 116, head: 58, flipL: 0.35, flipR: -0.25, feet: 178, squash: 1 });
    ctx.restore();
    return;
  }
  if (pose === 'tuck')
    return backView(ctx, {
      body: 150,
      head: 112,
      flipL: -0.15,
      flipR: -0.15,
      feet: 186,
      squash: 0.62,
    });
  if (pose === 'hop')
    return backView(ctx, {
      body: 112,
      head: 52,
      flipL: -0.7,
      flipR: -0.7,
      feet: 166,
      squash: 0.98,
    });
  backView(ctx, { body: 116, head: 58, flipL: 0.25, flipR: 0.25, feet: 180, squash: 1 });
}

/** Tumbling: rolled over, facing the camera with dizzy eyes and her beanie askew. */
function drawTumble(ctx: Ctx): void {
  const cx = 90;
  flipper(ctx, cx - 44, 104, 48, Math.PI + 0.9);
  flipper(ctx, cx + 44, 104, 48, -0.9);
  foot(ctx, cx - 26, 182, 1);
  foot(ctx, cx + 26, 182, 1);
  ctx.fillStyle = NAVY;
  ellipse(ctx, cx, 120, 56, 64);
  ctx.fill();
  stroke(ctx, OUTLINE, 3);
  ctx.fillStyle = '#F7F4FF';
  ellipse(ctx, cx, 132, 40, 50);
  ctx.fill();
  // face
  ctx.fillStyle = NAVY;
  ellipse(ctx, cx, 72, 38, 34);
  ctx.fill();
  stroke(ctx, OUTLINE, 3);
  ctx.fillStyle = '#F7F4FF';
  ellipse(ctx, cx - 13, 78, 15, 15);
  ctx.fill();
  ellipse(ctx, cx + 13, 78, 15, 15);
  ctx.fill();
  // spiral eyes
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2.5;
  for (const ex of [cx - 13, cx + 13]) {
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 4; a += 0.3) {
      const r = 1 + a * 0.8;
      const x = ex + Math.cos(a) * r;
      const y = 78 + Math.sin(a) * r;
      if (a === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // open beak
  ctx.beginPath();
  ctx.moveTo(cx - 9, 94);
  ctx.lineTo(cx + 9, 94);
  ctx.lineTo(cx, 108);
  ctx.closePath();
  ctx.fillStyle = BEAK;
  ctx.fill();
  stroke(ctx, '#7A3D10', 2.5);
  // satchel strap across the front and cheeks
  ctx.fillStyle = rgba(colors.pink, 0.5);
  ellipse(ctx, cx - 27, 92, 7, 4);
  ctx.fill();
  ellipse(ctx, cx + 27, 92, 7, 4);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - 34, 110);
  ctx.lineTo(cx + 40, 168);
  ctx.lineWidth = 7;
  ctx.strokeStyle = STRAP;
  ctx.stroke();
  beanie(ctx, cx + 10, 46, 32, 0.45);
  // dizzy stars
  ctx.fillStyle = colors.yellow;
  for (const [x, y] of [
    [cx - 58, 34],
    [cx + 62, 52],
    [cx - 40, 8],
  ] as const) {
    starPath(ctx, x, y, 5, 10, 4);
    ctx.fill();
    stroke(ctx, OUTLINE, 2);
  }
}

/** Her scarf (power-up): wrapped round the neck, the ends streaming back toward the camera. */
export const SCARF = { w: 120, h: 90 } as const;
export function drawScarf(ctx: Ctx): void {
  const stripe = (path: () => void) => {
    path();
    ctx.fillStyle = '#FFF6EA';
    ctx.fill();
    ctx.save();
    path();
    ctx.clip();
    ctx.fillStyle = ACCENT;
    for (let x = -20; x < SCARF.w + 20; x += 18) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 9, 0);
      ctx.lineTo(x + 9 + 20, SCARF.h);
      ctx.lineTo(x + 20, SCARF.h);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    path();
    stroke(ctx, OUTLINE, 3);
  };
  // the tails
  stripe(() => {
    ctx.beginPath();
    ctx.moveTo(52, 18);
    ctx.quadraticCurveTo(40, 50, 22, 82);
    ctx.lineTo(38, 86);
    ctx.quadraticCurveTo(56, 54, 66, 22);
    ctx.closePath();
  });
  stripe(() => {
    ctx.beginPath();
    ctx.moveTo(64, 18);
    ctx.quadraticCurveTo(80, 46, 92, 76);
    ctx.lineTo(106, 70);
    ctx.quadraticCurveTo(92, 42, 78, 16);
    ctx.closePath();
  });
  // the wrap
  stripe(() => {
    roundRectPath(ctx, 18, 4, 84, 24, 12);
  });
}

// ─── effects and HUD ───

/** A soft white dot (tinted for snow spray, glows and sparkles). */
export function drawPuff(ctx: Ctx, s: number): void {
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
}

/** Pebble's shadow on the ice. */
export function drawShadow(ctx: Ctx, w: number, h: number): void {
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  g.addColorStop(0, 'rgba(20,16,60,0.45)');
  g.addColorStop(0.7, 'rgba(20,16,60,0.25)');
  g.addColorStop(1, 'rgba(20,16,60,0)');
  ctx.fillStyle = g;
  ctx.save();
  ctx.scale(1, h / w);
  ctx.fillRect(0, 0, w, w);
  ctx.restore();
}

/** A speed line: a vertical streak fading at both ends. */
export function drawStreak(ctx: Ctx, w: number, h: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.9)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  roundRectPath(ctx, 0, 0, w, h, w / 2);
  ctx.fill();
}

/** The horizon haze: a white band, strongest just under the horizon, tinted with the zone's fog colour. */
export const HAZE = { h: 130, peak: 0.45 } as const;
export function drawHaze(ctx: Ctx, w: number, h: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(HAZE.peak, 'rgba(255,255,255,0.92)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** The HUD Pause button: a postbox-red candy button with a pause glyph on the left. */
export function drawPauseButton(ctx: Ctx, w: number, h: number): void {
  glossyRect(ctx, 0, 0, w, h, ACCENT, {
    radius: 18,
    depth: 6,
    outline: shade(ACCENT, -0.6),
    lineWidth: 2.5,
    shadow: false,
  });
  ctx.fillStyle = INK;
  for (const x of [22, 34]) {
    roundRectPath(ctx, x, 16, 7, 22, 3);
    ctx.fill();
  }
}

/** HUD pill badges (same size as the stock icons): a letter, the scarf or the bell. */
export function drawBadge(ctx: Ctx, s: number, kind: 'letter' | 'scarf' | 'bell'): void {
  const c = s / 2;
  glossyCircle(
    ctx,
    c,
    c,
    c - 1.5,
    kind === 'bell' ? colors.gold : kind === 'scarf' ? colors.sky : ACCENT,
    {
      shadow: false,
    },
  );
  if (kind === 'letter') envelopeIcon(ctx, c, c + 1, s * 0.56);
  else if (kind === 'scarf') scarfIcon(ctx, c, c - 1, s * 0.6);
  else bellIcon(ctx, c, c + 1, s * 0.56);
}

/** The touch hint: a chevron pointing right. */
export function drawHintArrow(ctx: Ctx, s: number): void {
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s / 2 - 3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(18,12,44,0.55)';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.stroke();
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(s * 0.42, s * 0.28);
  ctx.lineTo(s * 0.64, s * 0.5);
  ctx.lineTo(s * 0.42, s * 0.72);
  ctx.stroke();
}
