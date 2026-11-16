// Comet Bounce art: the Skiff, the comet, crystal walls and the nebula, all drawn with Canvas 2D once per mount.
// Pure drawing functions; the scene turns them into textures.
import {
  colors,
  fillGradient,
  mixHex,
  prng,
  rgba,
  roundRectPath,
  shade,
  sprinkle,
  starPath,
} from '@pocketcade/toolkit';

type Ctx = CanvasRenderingContext2D;
type Pip = 'circle' | 'square' | 'star';
export type PodKind = 'w' | 'x' | 'z';
export type Mood = 'idle' | 'happy' | 'oops';

const INK = '#1C1850';
/** Crystal colours (light / base / dark facets) and the shape of its hit-point pips (never colour alone). */
const CRYSTAL = {
  '1': { color: '#FF9F2E', light: '#FFE69A', dark: '#C2360C', pip: 'circle' },
  '2': { color: colors.sky, light: '#DDFBFF', dark: '#1D5FCC', pip: 'square' },
  '3': { color: '#D86BFF', light: '#F8D2FF', dark: '#6A22C8', pip: 'star' },
} as const satisfies Record<string, { color: string; light: string; dark: string; pip: Pip }>;
export const POD: Record<PodKind, string> = { w: colors.green, x: colors.purple, z: colors.yellow };
const PLATE = '#8994C4';
export const MINE = '#FF3B4E';

/** The colour effects use for a brick type. */
export function brickColor(type: string): string {
  if (type === '1' || type === '2' || type === '3') return CRYSTAL[type].color;
  if (type === '#') return PLATE;
  if (type === 'f') return MINE;
  return POD[type as PodKind] ?? colors.text;
}

function radial(
  ctx: Ctx,
  x: number,
  y: number,
  r: number,
  stops: readonly (readonly [number, string])[],
): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  for (const [o, c] of stops) g.addColorStop(o, c);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function poly(ctx: Ctx, pts: readonly (readonly [number, number])[]): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

/** A soft white dot / glow (tinted at runtime). */
export function drawSoft(ctx: Ctx, w: number, h: number): void {
  radial(ctx, w / 2, h / 2, w / 2, [
    [0, 'rgba(255,255,255,1)'],
    [0.3, 'rgba(255,255,255,0.6)'],
    [1, 'rgba(255,255,255,0)'],
  ]);
}

/** A four-point twinkle. */
export function drawGlint(ctx: Ctx, w: number): void {
  const c = w / 2;
  radial(ctx, c, c, c * 0.5, [
    [0, 'rgba(255,255,255,0.9)'],
    [1, 'rgba(255,255,255,0)'],
  ]);
  ctx.fillStyle = '#FFFFFF';
  starPath(ctx, c, c, 4, c * 0.95, c * 0.14, 0);
  ctx.fill();
}

/** A crystal sliver for shatter bursts (two tones, tinted at runtime). */
export function drawShard(ctx: Ctx, w: number, h: number): void {
  poly(ctx, [
    [w * 0.5, 0],
    [w * 0.8, h * 0.45],
    [w * 0.5, h],
    [w * 0.28, h * 0.5],
  ]);
  ctx.fillStyle = '#C8C8D0';
  ctx.fill();
  poly(ctx, [
    [w * 0.5, 0],
    [w * 0.5, h],
    [w * 0.28, h * 0.5],
  ]);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
}

/** A soft ring for shock waves. */
export function drawRing(ctx: Ctx, w: number): void {
  const c = w / 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(c, c, c - 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 2.5;
  ctx.stroke();
}

function pips(ctx: Ctx, n: number, shape: Pip, cx: number, cy: number): void {
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = INK;
  ctx.fillStyle = '#FFFDF6';
  for (let i = 0; i < n; i++) {
    const x = cx + (i - (n - 1) / 2) * 13;
    if (shape === 'circle') {
      ctx.beginPath();
      ctx.arc(x, cy, 3.8, 0, Math.PI * 2);
    } else if (shape === 'square') {
      ctx.beginPath();
      ctx.rect(x - 3.5, cy - 3.5, 7, 7);
    } else starPath(ctx, x, cy + 0.4, 5, 5.2, 2.3);
    ctx.fill();
    ctx.stroke();
  }
}

const CRACKS: readonly (readonly (readonly [number, number])[])[] = [
  [
    [0.64, 0.02],
    [0.58, 0.4],
    [0.68, 0.58],
    [0.62, 0.98],
  ],
  [
    [0.58, 0.4],
    [0.47, 0.55],
    [0.42, 0.8],
  ],
  [
    [0.02, 0.3],
    [0.17, 0.52],
    [0.28, 0.4],
    [0.36, 0.98],
  ],
  [
    [0.98, 0.62],
    [0.86, 0.5],
    [0.8, 0.22],
  ],
];

/** A hex-cut space crystal: colour, facet pattern, pips (one per hit point) and cracks all show its state. */
export function drawCrystal(
  ctx: Ctx,
  w: number,
  h: number,
  type: '1' | '2' | '3',
  hp: number,
): void {
  const { color, light, dark, pip } = CRYSTAL[type];
  const max = Number(type);
  const m = h / 2;
  const outer: [number, number][] = [
    [7, 1],
    [w - 7, 1],
    [w - 1, m],
    [w - 7, h - 1],
    [7, h - 1],
    [1, m],
  ];
  const table: [number, number][] = [
    [12, 6],
    [w - 12, 6],
    [w - 7, m],
    [w - 12, h - 6],
    [12, h - 6],
    [7, m],
  ];
  poly(ctx, outer);
  ctx.fillStyle = color;
  ctx.fill();
  // six bevel facets, lit from the top-left
  const tones = [
    light,
    mixHex(light, color, 0.5),
    mixHex(color, dark, 0.55),
    dark,
    mixHex(color, dark, 0.3),
    mixHex(light, color, 0.25),
  ];
  for (let k = 0; k < 6; k++) {
    poly(ctx, [outer[k]!, outer[(k + 1) % 6]!, table[(k + 1) % 6]!, table[k]!]);
    ctx.fillStyle = tones[k]!;
    ctx.fill();
  }
  // the table and its cut: ember 1 facet line, frost a bow-tie, prism a six-point star
  poly(ctx, table);
  const g = ctx.createLinearGradient(0, 6, 0, h - 6);
  g.addColorStop(0, mixHex(light, color, 0.55));
  g.addColorStop(1, mixHex(color, dark, 0.25));
  ctx.fillStyle = g;
  ctx.fill();
  const c: [number, number] = [w / 2, m];
  const tri = (a: [number, number], b: [number, number], fill: string) => {
    poly(ctx, [c, a, b]);
    ctx.fillStyle = fill;
    ctx.fill();
  };
  if (max === 1) tri(table[5]!, table[0]!, 'rgba(255,255,255,0.3)');
  if (max === 2) {
    tri(table[0]!, table[1]!, 'rgba(255,255,255,0.28)');
    tri(table[3]!, table[4]!, 'rgba(20,8,60,0.18)');
  }
  if (max === 3)
    for (let k = 0; k < 6; k++)
      tri(table[k]!, table[(k + 1) % 6]!, k % 2 ? 'rgba(20,8,60,0.16)' : 'rgba(255,255,255,0.24)');
  // sparkle and rim
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  starPath(ctx, 14, 5, 4, 4.2, 0.9, 0);
  ctx.fill();
  poly(ctx, outer);
  ctx.lineJoin = 'round';
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = mixHex(dark, '#120C2C', 0.45);
  ctx.stroke();
  pips(ctx, hp, pip, w / 2, m);
  // cracks: two per lost hit point
  const lost = max - hp;
  if (lost > 0) {
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    CRACKS.slice(0, lost * 2).forEach((path) => {
      for (const [dx, col, lw] of [
        [0.9, 'rgba(255,255,255,0.75)', 1],
        [0, rgba(INK, 0.9), 1.7],
      ] as const) {
        ctx.beginPath();
        path.forEach(([x, y], k) =>
          k ? ctx.lineTo(x * w + dx, y * h + dx) : ctx.moveTo(x * w + dx, y * h + dx),
        );
        ctx.strokeStyle = col;
        ctx.lineWidth = lw;
        ctx.stroke();
      }
    });
  }
}

/** Keystone: an armoured alloy plate with rivets. It never breaks. */
export function drawPlate(ctx: Ctx, w: number, h: number): void {
  roundRectPath(ctx, 1, 1, w - 2, h - 2, 4);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#C3CCEB');
  g.addColorStop(0.45, PLATE);
  g.addColorStop(1, '#3E4675');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  for (let x = -h; x < w; x += 5) {
    ctx.beginPath();
    ctx.moveTo(x, h);
    ctx.lineTo(x + h, 0);
    ctx.stroke();
  }
  ctx.restore();
  roundRectPath(ctx, 6, 5.5, w - 12, h - 11, 2);
  ctx.strokeStyle = 'rgba(28,24,80,0.55)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.beginPath();
  ctx.moveTo(7, h - 4.5);
  ctx.lineTo(w - 7, h - 4.5);
  ctx.stroke();
  // vents and the centre bolt
  ctx.fillStyle = 'rgba(28,24,80,0.7)';
  for (const x of [w / 2 - 19, w / 2 + 9]) {
    roundRectPath(ctx, x, h / 2 - 1.5, 10, 3, 1.5);
    ctx.fill();
  }
  ctx.beginPath();
  for (let k = 0; k < 6; k++)
    ctx.lineTo(
      w / 2 + Math.cos((k * Math.PI) / 3) * 4.2,
      h / 2 + Math.sin((k * Math.PI) / 3) * 4.2,
    );
  ctx.closePath();
  ctx.fillStyle = '#5A6496';
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  for (const [x, y] of [
    [5, 5],
    [w - 5, 5],
    [5, h - 5],
    [w - 5, h - 5],
  ] as const) {
    ctx.beginPath();
    ctx.arc(x, y, 2.3, 0, Math.PI * 2);
    ctx.fillStyle = '#E4E9FA';
    ctx.fill();
    ctx.strokeStyle = 'rgba(28,24,80,0.8)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  roundRectPath(ctx, 1.8, 1.8, w - 3.6, h - 3.6, 4);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.6;
  ctx.stroke();
}

/** Fuse: a plasma mine. A near-black casing with hazard-striped ends and a red core, so it never reads as a crystal. */
export function drawMine(ctx: Ctx, w: number, h: number): void {
  roundRectPath(ctx, 1, 1, w - 2, h - 2, 6);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#3A2C48');
  g.addColorStop(1, '#140A1E');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  const cap = 15;
  for (const x0 of [0, w - cap]) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, 0, cap, h);
    ctx.clip();
    ctx.fillStyle = '#FFD23D';
    ctx.fillRect(x0, 0, cap, h);
    ctx.fillStyle = '#1A1020';
    for (let x = x0 - h; x < x0 + cap; x += 9) {
      poly(ctx, [
        [x, h],
        [x + 4.5, h],
        [x + 4.5 + h, 0],
        [x + h, 0],
      ]);
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.fillStyle = INK;
  ctx.fillRect(cap, 0, 1.5, h);
  ctx.fillRect(w - cap - 1.5, 0, 1.5, h);
  ctx.restore();
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, 8.5, 0, Math.PI * 2);
  const core = ctx.createRadialGradient(w / 2 - 2.5, h / 2 - 2.5, 0, w / 2, h / 2, 8.5);
  core.addColorStop(0, '#FFFFFF');
  core.addColorStop(0.3, '#FFC2B8');
  core.addColorStop(0.7, MINE);
  core.addColorStop(1, '#8E0E2A');
  ctx.fillStyle = core;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  roundRectPath(ctx, 1.8, 1.8, w - 3.6, h - 3.6, 6);
  ctx.strokeStyle = MINE;
  ctx.lineWidth = 2;
  ctx.stroke();
}

/** The charm icons: Wingspan (outward arrows), Scatter (a fan of three) and Stasis (an hourglass). */
function drawIcon(ctx: Ctx, kind: PodKind, cx: number, cy: number, s: number, color: string): void {
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = s * 0.42;
  if (kind === 'w') {
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.7, cy);
    ctx.lineTo(cx + s * 0.7, cy);
    ctx.stroke();
    for (const d of [-1, 1]) {
      poly(ctx, [
        [cx + d * s * 1.65, cy],
        [cx + d * s * 0.7, cy - s * 0.85],
        [cx + d * s * 0.7, cy + s * 0.85],
      ]);
      ctx.fill();
    }
  } else if (kind === 'x') {
    const ends = [
      [-1.15, -0.55],
      [0, -0.85],
      [1.15, -0.55],
    ] as const;
    ctx.lineWidth = s * 0.32;
    ctx.beginPath();
    for (const [dx, dy] of ends) {
      ctx.moveTo(cx, cy + s * 0.85);
      ctx.lineTo(cx + dx * s, cy + dy * s);
    }
    ctx.stroke();
    for (const [dx, dy] of ends) {
      ctx.beginPath();
      ctx.arc(cx + dx * s, cy + dy * s, s * 0.38, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.lineWidth = s * 0.3;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.8, cy - s);
    ctx.lineTo(cx + s * 0.8, cy - s);
    ctx.moveTo(cx - s * 0.8, cy + s);
    ctx.lineTo(cx + s * 0.8, cy + s);
    ctx.stroke();
    poly(ctx, [
      [cx - s * 0.6, cy - s * 0.85],
      [cx + s * 0.6, cy - s * 0.85],
      [cx, cy],
      [cx + s * 0.6, cy + s * 0.85],
      [cx - s * 0.6, cy + s * 0.85],
      [cx, cy],
    ]);
    ctx.fill();
  }
}

/** A glossy charm pod capsule with its icon. */
export function drawPod(
  ctx: Ctx,
  cx: number,
  cy: number,
  pw: number,
  ph: number,
  kind: PodKind,
): void {
  const col = POD[kind];
  roundRectPath(ctx, cx - pw / 2, cy - ph / 2, pw, ph, ph / 2);
  const g = ctx.createLinearGradient(0, cy - ph / 2, 0, cy + ph / 2);
  g.addColorStop(0, shade(col, 0.5));
  g.addColorStop(0.5, col);
  g.addColorStop(1, shade(col, -0.3));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  roundRectPath(ctx, cx - pw / 2 + ph * 0.35, cy - ph / 2 + 2, pw - ph * 0.7, ph * 0.28, ph * 0.14);
  ctx.fill();
  drawIcon(ctx, kind, cx, cy + 0.5, ph * 0.36, INK);
}

/** A falling pod: the capsule inside a white rim so it stands out against any nebula. */
export function drawFallingPod(ctx: Ctx, w: number, h: number, kind: PodKind): void {
  roundRectPath(ctx, 1.5, 1.5, w - 3, h - 3, (h - 3) / 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  drawPod(ctx, w / 2, h / 2, w - 7, h - 7, kind);
}

/** A round pod-colour badge with its icon (the HUD effect timers). */
export function drawBadge(ctx: Ctx, w: number, kind: PodKind): void {
  const c = w / 2;
  ctx.beginPath();
  ctx.arc(c, c, c - 1.5, 0, Math.PI * 2);
  ctx.fillStyle = POD[kind];
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.stroke();
  drawIcon(ctx, kind, c, c + 0.5, 5.4, INK);
}

/** A charm brick: a dark glass case holding a glowing pod. */
export function drawCharmBrick(ctx: Ctx, w: number, h: number, kind: PodKind): void {
  const col = POD[kind];
  roundRectPath(ctx, 1, 1, w - 2, h - 2, 6);
  ctx.fillStyle = '#1A1240';
  ctx.fill();
  ctx.save();
  ctx.clip();
  radial(ctx, w / 2, h / 2, w * 0.55, [
    [0, rgba(col, 0.6)],
    [1, rgba(col, 0)],
  ]);
  ctx.restore();
  drawPod(ctx, w / 2, h / 2, 38, 15, kind);
  roundRectPath(ctx, 1.8, 1.8, w - 3.6, h - 3.6, 6);
  ctx.lineWidth = 2;
  ctx.strokeStyle = col;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (const [x, y, dx, dy] of [
    [4, 4, 1, 1],
    [w - 4, 4, -1, 1],
    [4, h - 4, 1, -1],
    [w - 4, h - 4, -1, -1],
  ] as const) {
    ctx.moveTo(x, y + dy * 5);
    ctx.lineTo(x, y);
    ctx.lineTo(x + dx * 6, y);
  }
  ctx.stroke();
}

// ─── the Skiff (all parts share one frame: local y 0 sits at the texture's row SKIFF_OY) ───

export const SKIFF_OY = 18;
export const SKIFF_H = 48;
export const HULL_W = 84;
export const WING_W = 60;

/** The hull: a glossy white hover-hull with a sky stripe, nav lights and two thruster nozzles. */
export function drawHull(ctx: Ctx, w: number): void {
  const cx = w / 2;
  const o = SKIFF_OY;
  ctx.lineJoin = 'round';
  for (const d of [-1, 1]) {
    poly(ctx, [
      [cx + d * 26, o + 15],
      [cx + d * 16, o + 15],
      [cx + d * 17.5, o + 23],
      [cx + d * 24.5, o + 23],
    ]);
    ctx.fillStyle = '#4A4F86';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.fillStyle = colors.sky;
    ctx.fillRect(cx + d * 21 - 3.5, o + 21, 7, 2);
  }
  ctx.beginPath();
  ctx.moveTo(cx - 40, o + 3);
  ctx.quadraticCurveTo(cx - 41, o - 2, cx - 32, o - 2.5);
  ctx.lineTo(cx + 32, o - 2.5);
  ctx.quadraticCurveTo(cx + 41, o - 2, cx + 40, o + 3);
  ctx.quadraticCurveTo(cx + 37, o + 17, cx + 20, o + 18);
  ctx.lineTo(cx - 20, o + 18);
  ctx.quadraticCurveTo(cx - 37, o + 17, cx - 40, o + 3);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, o - 3, 0, o + 18);
  g.addColorStop(0, '#FFFFFF');
  g.addColorStop(0.45, '#DDF4FF');
  g.addColorStop(1, '#9DB8E6');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = colors.sky;
  ctx.fillRect(cx - 42, o + 6, 84, 3.2);
  ctx.fillStyle = colors.pink;
  ctx.fillRect(cx - 42, o + 9.2, 84, 1.6);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(cx - 34, o - 1.5, 68, 1.6);
  ctx.fillStyle = '#5F72B8';
  ctx.fillRect(cx - 42, o + 13.5, 84, 6);
  ctx.fillStyle = colors.sky;
  for (const x of [-10, -5, 0, 5, 10]) ctx.fillRect(cx + x - 1, o + 15, 2, 2);
  ctx.restore();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.stroke();
  for (const d of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(cx + d * 33, o + 3, 1.9, 0, Math.PI * 2);
    ctx.fillStyle = d < 0 ? colors.vermillion : colors.green;
    ctx.fill();
  }
  // canopy collar
  roundRectPath(ctx, cx - 14, o + 11, 28, 5, 2.5);
  ctx.fillStyle = '#C9D6F2';
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.4;
  ctx.stroke();
}

/** The pilot: a round little flyer in a pink cap with an antenna; three moods. */
export function drawPilot(ctx: Ctx, w: number, mood: Mood): void {
  const cx = w / 2;
  const cy = SKIFF_OY + 4;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(cx + 2, cy - 7);
  ctx.lineTo(cx + 4, cy - 11);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx + 4.3, cy - 11.5, 1.6, 0, Math.PI * 2);
  ctx.fillStyle = colors.gold;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, 7, 0, Math.PI * 2);
  ctx.fillStyle = '#FFE2C6';
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = colors.pink;
  ctx.fillRect(cx - 8, cy - 8, 16, 5.2);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillRect(cx - 8, cy - 3.6, 16, 1);
  ctx.fillStyle = 'rgba(255,79,163,0.45)';
  ctx.beginPath();
  ctx.arc(cx - 4.6, cy + 3, 1.6, 0, Math.PI * 2);
  ctx.arc(cx + 4.6, cy + 3, 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, 7, 0, Math.PI * 2);
  ctx.lineWidth = 1.3;
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.lineWidth = 1.2;
  const ey = cy + 0.6;
  if (mood === 'idle') {
    for (const d of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + d * 2.6, ey, 1.2, 1.7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(cx, cy + 2.6, 1.6, 0.2, Math.PI - 0.2);
    ctx.stroke();
  } else if (mood === 'happy') {
    ctx.beginPath();
    for (const d of [-1, 1]) {
      ctx.moveTo(cx + d * 2.6 - 1.5, ey + 0.6);
      ctx.lineTo(cx + d * 2.6, ey - 1);
      ctx.lineTo(cx + d * 2.6 + 1.5, ey + 0.6);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy + 2.4, 2.2, 0, Math.PI);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.beginPath();
    for (const d of [-1, 1]) {
      ctx.moveTo(cx + d * 3.8, ey - 1.2);
      ctx.lineTo(cx + d * 1.8, ey);
      ctx.lineTo(cx + d * 3.8, ey + 1.2);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx, cy + 3.4, 1.2, 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** The canopy bubble over the pilot. */
export function drawCanopy(ctx: Ctx, w: number): void {
  const cx = w / 2;
  const cy = SKIFF_OY + 4;
  ctx.beginPath();
  ctx.arc(cx, cy, 10, Math.PI, 0);
  ctx.lineTo(cx + 10, cy + 8);
  ctx.lineTo(cx - 10, cy + 8);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, cy - 10, 0, cy + 8);
  g.addColorStop(0, 'rgba(190,245,255,0.42)');
  g.addColorStop(1, 'rgba(120,200,255,0.12)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, 7.4, Math.PI * 1.12, Math.PI * 1.42);
  ctx.stroke();
}

/** A swept wing with a shield pylon at its tip (the right wing; the left is mirrored). */
export function drawWing(ctx: Ctx, w: number, left: boolean): void {
  if (left) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  const o = SKIFF_OY;
  const t = w - 3;
  ctx.lineJoin = 'round';
  poly(ctx, [
    [0, o - 1],
    [t - 14, o - 2],
    [t - 3, o],
    [t, o + 4],
    [t - 6, o + 7],
    [t - 26, o + 12],
    [0, o + 12],
  ]);
  const g = ctx.createLinearGradient(0, o - 2, 0, o + 12);
  g.addColorStop(0, '#FFFFFF');
  g.addColorStop(1, '#93B1E2');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = colors.sky;
  poly(ctx, [
    [0, o + 3],
    [t, o + 1.5],
    [t, o + 4.5],
    [0, o + 6.5],
  ]);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.8;
  ctx.stroke();
  // pylon and emitter
  roundRectPath(ctx, t - 5, o - 8, 4.5, 11, 2.2);
  ctx.fillStyle = '#D9E3FA';
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.3;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(t - 2.75, o - 7, 2.6, 0, Math.PI * 2);
  ctx.fillStyle = '#E9FDFF';
  ctx.fill();
  ctx.strokeStyle = colors.sky;
  ctx.stroke();
}

/** The shield bar the comet bounces on (stretched to the Skiff's width). */
export function drawShield(ctx: Ctx, w: number, h: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(56,214,255,0)');
  g.addColorStop(0.3, 'rgba(56,214,255,0.75)');
  g.addColorStop(0.5, '#F2FEFF');
  g.addColorStop(0.7, 'rgba(56,214,255,0.75)');
  g.addColorStop(1, 'rgba(56,214,255,0)');
  ctx.fillStyle = g;
  roundRectPath(ctx, 0, 0, w, h, h / 2);
  ctx.fill();
}

/** A thruster flame (additive; points down). */
export function drawFlame(ctx: Ctx, w: number, h: number): void {
  for (const [s, col] of [
    [1, 'rgba(123,92,255,0.55)'],
    [0.72, 'rgba(56,214,255,0.9)'],
    [0.4, 'rgba(255,255,255,1)'],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(w / 2 - (w / 2) * s, 0);
    ctx.quadraticCurveTo(w / 2 - (w / 2) * s, h * 0.45 * s, w / 2, h * s);
    ctx.quadraticCurveTo(w / 2 + (w / 2) * s, h * 0.45 * s, w / 2 + (w / 2) * s, 0);
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
  }
}

/** A mini Skiff for the lives pill. */
export function drawShipIcon(ctx: Ctx, w: number, h: number, on: boolean): void {
  const cx = w / 2;
  const cy = h / 2 + 2;
  ctx.globalAlpha = on ? 1 : 0.35;
  ctx.lineJoin = 'round';
  poly(ctx, [
    [cx - 14, cy - 1],
    [cx - 9, cy - 2],
    [cx + 9, cy - 2],
    [cx + 14, cy - 1],
    [cx + 9, cy + 3],
    [cx - 9, cy + 3],
  ]);
  ctx.fillStyle = on ? '#BFD3F5' : '#6A6696';
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.3;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy - 2, 5.2, Math.PI, 0);
  ctx.lineTo(cx + 9, cy + 1);
  ctx.quadraticCurveTo(cx + 8, cy + 6, cx, cy + 6);
  ctx.quadraticCurveTo(cx - 8, cy + 6, cx - 9, cy + 1);
  ctx.closePath();
  ctx.fillStyle = on ? '#FFFFFF' : '#8C88B8';
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy - 2, 3.2, Math.PI, 0);
  ctx.fillStyle = on ? colors.sky : '#4A4680';
  ctx.fill();
  if (on) {
    ctx.fillStyle = colors.pink;
    ctx.fillRect(cx - 8, cy + 2, 16, 1.4);
  }
  ctx.globalAlpha = 1;
}

// ─── the comet ───

/** White-hot core, radius 8 (the collision radius). */
export function drawCometCore(ctx: Ctx, w: number): void {
  const c = w / 2;
  radial(ctx, c, c, c, [
    [0, 'rgba(255,255,255,1)'],
    [0.55, 'rgba(255,252,235,1)'],
    [0.72, 'rgba(160,240,255,0.95)'],
    [1, 'rgba(56,214,255,0)'],
  ]);
}

/** The halo: cyan into pink (additive; stretched along the velocity). */
export function drawCometGlow(ctx: Ctx, w: number): void {
  const c = w / 2;
  radial(ctx, c, c, c, [
    [0, 'rgba(120,230,255,0.85)'],
    [0.22, 'rgba(56,214,255,0.5)'],
    [0.5, 'rgba(255,79,163,0.2)'],
    [1, 'rgba(123,92,255,0)'],
  ]);
}

// ─── the stage ───

/** A zone's look: the tints of the drifting nebula clouds and its ringed planet. */
export interface Zone {
  clouds: readonly string[];
  planet: { light: string; mid: string; dark: string; ring: string; x: number; y: number };
}

/** One zone per five walls: violet drift, blue reach, ember veil, aurora. */
export const ZONES: readonly Zone[] = [
  {
    clouds: [colors.violet, colors.pink, '#2C7DFF', '#3E5BFF', '#9B4DFF'],
    planet: { light: '#FFB9D8', mid: '#C25BD6', dark: '#3A1A78', ring: '#FFD6A0', x: 120, y: 566 },
  },
  {
    clouds: ['#1F8FD8', '#21B8A8', '#3E5BFF', '#2CC6FF', '#1B4FD0'],
    planet: { light: '#D4F6FF', mid: '#4C8FE6', dark: '#152E70', ring: '#BFF6FF', x: 845, y: 590 },
  },
  {
    clouds: ['#E0457B', '#FF6A3D', '#A8306E', '#FF5A5F', '#8E2C8F'],
    planet: { light: '#FFE2A8', mid: '#E07A3A', dark: '#5A1A2E', ring: '#FFC8A0', x: 140, y: 600 },
  },
  {
    clouds: ['#22C47A', '#1FB5A8', '#38D6FF', '#7B5CFF', '#7FD64A'],
    planet: { light: '#D8FFE0', mid: '#2FB59A', dark: '#0E3E4A', ring: '#FFE68A', x: 830, y: 560 },
  },
];

/** Where the soft nebula clouds sit [x, y, radius, alpha] (design units; the last four only show in wide or tall frames). */
export const CLOUDS: readonly (readonly [number, number, number, number])[] = [
  [250, 260, 320, 0.22],
  [760, 170, 280, 0.18],
  [620, 480, 300, 0.16],
  [120, 620, 240, 0.12],
  [880, 640, 220, 0.12],
  [-120, 260, 300, 0.18],
  [1080, 460, 300, 0.18],
  [480, 1000, 380, 0.2],
  [480, 1500, 380, 0.2],
];

/**
 * The static deep-space base: dark gradient, grey nebula wisps, dust lanes, stars, a far moon and a vignette.
 * It covers w × h (the arena width, and the full view height) plus `bx` on each side; the zone colour comes from
 * tinted cloud sprites on top.
 */
export function drawSpace(ctx: Ctx, w: number, h: number, bx: number): void {
  const fw = w + bx * 2;
  const fh = h;
  fillGradient(ctx, 0, 0, fw, fh, ['#06041A', '#0E0A2E', '#120C38', '#0A0624']);
  ctx.translate(bx, 0);
  const rnd = prng(20261110);
  const area = (fw * fh) / (960 * 720);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 70 * area; i++) {
    const t = rnd();
    const x = -bx - 80 + t * (fw + 160);
    const y = fh * (0.1 + 0.8 * rnd()) + Math.sin(t * 8) * 80;
    radial(ctx, x, y, 50 + rnd() * 130, [
      [0, rgba('#8A90C8', 0.03 + rnd() * 0.05)],
      [1, rgba('#8A90C8', 0)],
    ]);
  }
  ctx.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 14 * area; i++)
    radial(ctx, -bx + rnd() * fw, rnd() * fh, 40 + rnd() * 70, [
      [0, 'rgba(6,2,20,0.3)'],
      [1, 'rgba(6,2,20,0)'],
    ]);
  sprinkle(ctx, -bx, 0, fw, fh, Math.round(160 * area), '#FFFFFF', 11, [0.3, 0.9]);
  sprinkle(ctx, -bx, 0, fw, fh, Math.round(26 * area), '#BFF6FF', 12, [0.6, 1.3]);
  // a far moon
  ctx.beginPath();
  ctx.arc(842, 112, 13, 0, Math.PI * 2);
  const mg = ctx.createRadialGradient(846, 108, 2, 842, 112, 13);
  mg.addColorStop(0, '#E2F6FF');
  mg.addColorStop(1, '#5B6FC0');
  ctx.fillStyle = mg;
  ctx.fill();
  // vignette around the arena and a soft HUD band
  const v = ctx.createRadialGradient(w / 2, h * 0.52, h * 0.38, w / 2, h * 0.52, h * 0.95);
  v.addColorStop(0, 'rgba(4,2,16,0)');
  v.addColorStop(1, 'rgba(4,2,16,0.6)');
  ctx.fillStyle = v;
  ctx.fillRect(-bx, 0, fw, fh);
  fillGradient(ctx, 0, 0, w, 64, ['rgba(6,3,22,0.75)', 'rgba(6,3,22,0)']);
}

/** The pink void glow along the arena floor (stretched across the view). */
export function drawVoid(ctx: Ctx, w: number, h: number): void {
  fillGradient(ctx, 0, 0, w, h, [
    'rgba(255,79,163,0)',
    'rgba(255,79,163,0.16)',
    'rgba(255,79,163,0)',
  ]);
}

/** A soft white cloud puff, tinted per zone at runtime. */
export function drawCloud(ctx: Ctx, w: number): void {
  radial(ctx, w / 2, w / 2, w / 2, [
    [0, 'rgba(255,255,255,1)'],
    [0.45, 'rgba(255,255,255,0.5)'],
    [1, 'rgba(255,255,255,0)'],
  ]);
}

/** Shade for the space beside the arena: transparent at x = 0, dark at x = w. */
export function drawShade(ctx: Ctx, w: number, h: number): void {
  fillGradient(ctx, 0, 0, w, h, ['rgba(4,2,16,0)', 'rgba(4,2,16,0.6)'], 'h');
}

export const PLANET_W = 260;
export const PLANET_H = 150;

/** A zone's ringed planet, centred in a PLANET_W × PLANET_H texture. */
export function drawPlanet(ctx: Ctx, z: Zone['planet']): void {
  const cx = PLANET_W / 2;
  const cy = PLANET_H / 2;
  const r = 58;
  const ring = (from: number, to: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.36);
    for (const [k, lw, a] of [
      [1.95, 7, 0.42],
      [1.72, 3, 0.6],
      [1.55, 2, 0.4],
    ] as const) {
      ctx.beginPath();
      ctx.ellipse(0, 0, r * k, r * k * 0.24, 0, from, to);
      ctx.strokeStyle = rgba(k === 1.72 ? mixHex(z.ring, '#FFFFFF', 0.5) : z.ring, a);
      ctx.lineWidth = lw;
      ctx.stroke();
    }
    ctx.restore();
  };
  ring(Math.PI, Math.PI * 2);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  const g = ctx.createRadialGradient(cx + r * 0.4, cy - r * 0.45, r * 0.1, cx, cy, r);
  g.addColorStop(0, z.light);
  g.addColorStop(0.45, z.mid);
  g.addColorStop(1, z.dark);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.clip();
  ctx.globalAlpha = 0.18;
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.ellipse(cx, cy + i * r * 0.26, r * 1.2, r * 0.07, -0.36, 0, Math.PI * 2);
    ctx.fillStyle = i % 2 ? '#FFFFFF' : z.dark;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  radial(ctx, cx - r * 0.55, cy + r * 0.6, r * 1.3, [
    [0, 'rgba(8,3,28,0.75)'],
    [1, 'rgba(8,3,28,0)'],
  ]);
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI * 0.85, Math.PI * 0.15);
  ctx.strokeStyle = 'rgba(200,240,255,0.45)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ring(0, Math.PI);
}

/** A neon side rail (inner edge glows). `left` puts the glow on the right-hand edge. */
export function drawRail(ctx: Ctx, w: number, h: number, left: boolean): void {
  if (!left) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  fillGradient(ctx, 0, 0, w, h, ['#120B34', '#2A2468', '#1A1446'], 'h');
  for (let y = 24; y < h; y += 48) {
    ctx.fillStyle = 'rgba(4,2,16,0.6)';
    ctx.fillRect(0, y, w - 4, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(0, y + 2, w - 4, 1);
    roundRectPath(ctx, 5, y + 14, 5, 12, 2.5);
    ctx.fillStyle = rgba(colors.pink, 0.9);
    ctx.fill();
  }
  ctx.save();
  ctx.shadowColor = colors.sky;
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#BFF6FF';
  ctx.fillRect(w - 3.5, 0, 2.5, h);
  ctx.restore();
  ctx.fillStyle = rgba(colors.sky, 0.55);
  ctx.fillRect(w - 6, 0, 2, h);
}

/** The ceiling bar (glow on its underside). */
export function drawCeiling(ctx: Ctx, w: number, h: number): void {
  fillGradient(ctx, 0, 0, w, h, ['#2A2468', '#120B34']);
  for (let x = 40; x < w; x += 64) {
    ctx.fillStyle = 'rgba(4,2,16,0.55)';
    ctx.fillRect(x, 0, 2, h - 4);
    roundRectPath(ctx, x + 24, 4, 14, 4, 2);
    ctx.fillStyle = rgba(colors.pink, 0.85);
    ctx.fill();
  }
  ctx.save();
  ctx.shadowColor = colors.sky;
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#BFF6FF';
  ctx.fillRect(0, h - 3.5, w, 2.5);
  ctx.restore();
}

/** A glassy neon panel for banners. */
export function drawPanel(ctx: Ctx, w: number, h: number): void {
  ctx.save();
  ctx.shadowColor = rgba(colors.sky, 0.7);
  ctx.shadowBlur = 16;
  roundRectPath(ctx, 10, 10, w - 20, h - 20, 24);
  ctx.fillStyle = 'rgba(14,8,40,0.86)';
  ctx.fill();
  ctx.restore();
  roundRectPath(ctx, 10, 10, w - 20, h - 20, 24);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = colors.sky;
  ctx.stroke();
  ctx.save();
  ctx.clip();
  fillGradient(ctx, 10, 10, w - 20, h * 0.45, [rgba(colors.violet, 0.35), rgba(colors.violet, 0)]);
  ctx.restore();
}
