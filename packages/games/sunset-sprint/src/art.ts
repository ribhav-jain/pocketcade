// Sunset Sprint art (Canvas 2D, drawn once per mount into textures by scene.ts): the three stage skies and their
// parallax layers, roadside props, traffic seen from behind, Miso's lime convertible in parts (steering frames,
// tyres, brake glow, head poses, tail, scarf), the checkpoint arch, effects and HUD pieces. Decoration only; sizes
// are in design units (960 × 720).
import {
  colors,
  fillGradient,
  font,
  glossyRect,
  mixHex,
  prng,
  rgba,
  roundRectPath,
  shade,
  sprinkle,
  starPath,
} from '@pocketcade/toolkit';
import { PROP, type PropKind, type Theme } from './track.ts';

type Ctx = CanvasRenderingContext2D;

/** Sunset Sprint's accent: sunset coral. */
export const ACCENT = '#FF7A59';
export const INK = colors.ink;
const OUTLINE = '#2B1638';
/** Miso's car */
export const LIME = '#B8F34A';
const FUR = '#D9572B';

// ─── road palettes ───

export interface RoadPalette {
  /** alternating stripes: road, rumble strip, roadside band */
  road: readonly [string, string];
  rumble: readonly [string, string];
  band: readonly [string, string];
  lane: string;
  /** the haze far segments fade into */
  fog: string;
  /** off-road dust (or sparks in the city) */
  dust: readonly string[];
}

export const ROAD: Record<Theme, RoadPalette> = {
  0: {
    road: ['#6E6788', '#665F80'],
    rumble: ['#FF5A5F', '#FFF6EA'],
    band: ['#F4CD8A', '#EBC07B'],
    lane: '#FFF6EA',
    fog: '#FFB98A',
    dust: ['#C9944E', '#E2B26E', '#FFF6E2'],
  },
  1: {
    road: ['#5E5170', '#574A68'],
    rumble: ['#FF9F1C', '#FFF6EA'],
    band: ['#D9734A', '#CC6840'],
    lane: '#FFE9C8',
    fog: '#E2786A',
    dust: ['#FFD2B0', '#8E3A26', '#F2A27A'],
  },
  2: {
    road: ['#3A3556', '#34304E'],
    rumble: ['#FF4FA3', '#38D6FF'],
    band: ['#4E4676', '#47406C'],
    lane: '#E8E4FF',
    fog: '#5A3A86',
    dust: [colors.yellow, colors.orange, '#FFFFFF'],
  },
};

/** The far ground colour of a theme (what the road fades into at the horizon). */
export const farGround = (t: Theme) => mixHex(ROAD[t].band[0], ROAD[t].fog, 0.7);

// ─── sky and parallax layers ───

/** The sky's design area; the texture also covers `padX` either side and `padY` above for wide and tall frames. */
export const SKY = { w: 960, h: 400 } as const;
/** parallax layer textures tile horizontally; their ground line sits on the horizon */
export const LAYER_W = 1440;
export const FAR = { h: 170, ground: 150 } as const;
export const NEAR = { h: 210, ground: 186 } as const;

const SKIES: Record<Theme, readonly (readonly [number, string])[]> = {
  0: [
    [0, '#3E2A84'],
    [0.38, '#9A3FA0'],
    [0.66, '#F0608C'],
    [0.84, '#FF9E6B'],
    [1, '#FFD08A'],
  ],
  1: [
    [0, '#2A1B5E'],
    [0.4, '#6E2C8C'],
    [0.7, '#D9466F'],
    [1, '#FF7A45'],
  ],
  2: [
    [0, '#0B0826'],
    [0.45, '#1E1450'],
    [0.75, '#46257E'],
    [1, '#9A3C8E'],
  ],
};

function glow(ctx: Ctx, x: number, y: number, r: number, color: string, a: number): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, a));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/**
 * The sky: the sun sinks and the sky darkens from stage to stage (horizon at y 340). Drawn in design coordinates
 * on a canvas that reaches `padX` past both sides and `padY` above the top.
 */
export function drawSky(ctx: Ctx, t: Theme, padX: number, padY: number): void {
  const { w, h } = SKY;
  const full = w + padX * 2;
  ctx.translate(padX, padY);
  ctx.fillStyle = SKIES[t][0]![1];
  ctx.fillRect(-padX, -padY, full, padY + 1);
  fillGradient(ctx, -padX, 0, full, h, SKIES[t]);
  const hz = 340;
  if (t === 0) {
    sprinkle(ctx, -padX, -padY, full, padY + 60, 50, '#FFFFFF', 5, [0.8, 1.8]);
    glow(ctx, 300, 250, 330, '#FFE38A', 0.5);
    sun(ctx, 300, 250, 82);
    // long thin clouds catching the light
    ctx.fillStyle = 'rgba(255,180,200,0.35)';
    for (const [x, y, len] of [
      [80, 120, 260],
      [560, 90, 320],
      [640, 190, 220],
      [140, 210, 180],
      [-170, 160, 200],
      [960, 130, 240],
      [330, -40, 280],
      [-60, -150, 220],
      [700, -110, 300],
    ] as const) {
      roundRectPath(ctx, x, y, len, 10, 5);
      ctx.fill();
    }
  } else if (t === 1) {
    glow(ctx, 640, hz, 380, '#FF8A3D', 0.55);
    sun(ctx, 640, hz - 18, 116);
    sprinkle(ctx, -padX, -padY, full, padY + 120, 70, '#FFFFFF', 11, [0.8, 1.8]);
  } else {
    sprinkle(ctx, -padX, -padY, full, padY + 260, 220, '#FFFFFF', 23, [0.8, 2]);
    glow(ctx, 480, hz + 20, 620, '#FF7A59', 0.32);
    // a thin crescent moon: the disc minus an offset disc
    ctx.save();
    ctx.beginPath();
    ctx.arc(770, 96, 26, 0, Math.PI * 2);
    ctx.clip();
    ctx.beginPath();
    ctx.rect(740, 66, 60, 60);
    ctx.arc(782, 88, 24, 0, Math.PI * 2);
    ctx.fillStyle = '#FFF3C8';
    ctx.fill('evenodd');
    ctx.restore();
    glow(ctx, 770, 96, 60, '#FFF3C8', 0.18);
  }
}

function sun(ctx: Ctx, x: number, y: number, r: number): void {
  const g = ctx.createLinearGradient(0, y - r, 0, y + r);
  g.addColorStop(0, '#FFF4B8');
  g.addColorStop(0.6, '#FFC65A');
  g.addColorStop(1, '#FF8A3D');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** Draws `draw` at dx 0 and one layer-width either side, so shapes crossing the edge tile seamlessly. */
function tiled(w: number, draw: (dx: number) => void): void {
  for (const dx of [-w, 0, w]) draw(dx);
}

function ridge(
  ctx: Ctx,
  w: number,
  ground: number,
  peaks: readonly (readonly [number, number, number])[],
  color: string,
): void {
  // smooth hills: [centre x, half width, height]
  ctx.fillStyle = color;
  tiled(w, (dx) => {
    for (const [cx, hw, hh] of peaks) {
      ctx.beginPath();
      ctx.moveTo(dx + cx - hw, ground + 1);
      ctx.bezierCurveTo(
        dx + cx - hw * 0.5,
        ground - hh,
        dx + cx + hw * 0.5,
        ground - hh,
        dx + cx + hw,
        ground + 1,
      );
      ctx.fill();
    }
  });
}

function mesa(ctx: Ctx, x: number, ground: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - w / 2 - h * 0.35, ground + 1);
  ctx.lineTo(x - w / 2, ground - h);
  ctx.lineTo(x + w / 2, ground - h);
  ctx.lineTo(x + w / 2 + h * 0.35, ground + 1);
  ctx.fill();
}

/** Far layer: the sea and distant headlands, far mesas, or the far skyline. */
export function drawFar(ctx: Ctx, w: number, h: number, t: Theme): void {
  const g = FAR.ground;
  const rnd = prng(41 + t);
  if (t === 0) {
    // the sea shows as a band above the beach, with distant headlands on it
    const sea = g - 18;
    ridge(
      ctx,
      w,
      sea,
      [
        [180, 220, 46],
        [700, 160, 30],
        [1180, 260, 58],
      ],
      '#8E5AA6',
    );
    fillGradient(ctx, 0, sea, w, h - sea, ['#F08AA8', '#B05EA6', '#7E4C9E']);
    ctx.fillStyle = 'rgba(255,230,210,0.7)';
    for (let i = 0; i < 46; i++) ctx.fillRect(rnd() * w, sea + 3 + rnd() * 14, 6 + rnd() * 26, 1.5);
  } else if (t === 1) {
    tiled(w, (dx) => {
      mesa(ctx, dx + 160, g, 180, 64, '#8A3D6B');
      mesa(ctx, dx + 520, g, 90, 40, '#8A3D6B');
      mesa(ctx, dx + 900, g, 260, 78, '#7E3765');
      mesa(ctx, dx + 1270, g, 120, 52, '#8A3D6B');
    });
    ctx.fillStyle = farGround(1);
    ctx.fillRect(0, g, w, h - g);
  } else {
    let x = 0;
    while (x < w) {
      const bw = 40 + rnd() * 70;
      const bh = 30 + rnd() * 90;
      ctx.fillStyle = '#2B2160';
      ctx.fillRect(x, g - bh, bw - 4, bh + 1);
      for (let wy = g - bh + 8; wy < g - 6; wy += 10)
        for (let wx = x + 6; wx < x + bw - 10; wx += 9)
          if (rnd() < 0.3) {
            ctx.fillStyle = rnd() < 0.7 ? '#FFD86B' : rnd() < 0.5 ? '#FF7FC0' : '#7FE8FF';
            ctx.fillRect(wx, wy, 3, 4);
          }
      if (rnd() < 0.2) {
        ctx.fillStyle = '#FF5A5F';
        ctx.fillRect(x + bw / 2 - 1, g - bh - 14, 2, 14);
        glow(ctx, x + bw / 2, g - bh - 14, 6, '#FF5A5F', 0.9);
      }
      x += bw;
    }
    ctx.fillStyle = farGround(2);
    ctx.fillRect(0, g, w, h - g);
  }
}

/** Near layer: green headlands with palms, red rock towers, or the nearer city blocks. */
export function drawNear(ctx: Ctx, w: number, h: number, t: Theme): void {
  const g = NEAR.ground;
  const rnd = prng(73 + t);
  if (t === 0) {
    ridge(
      ctx,
      w,
      g,
      [
        [120, 230, 70],
        [560, 150, 44],
        [1000, 260, 92],
        [1330, 120, 40],
      ],
      '#2F7A74',
    );
    ridge(
      ctx,
      w,
      g,
      [
        [240, 140, 38],
        [1080, 150, 50],
      ],
      '#3C9483',
    );
    // palm silhouettes on the headlands
    ctx.fillStyle = '#1F5560';
    ctx.strokeStyle = '#1F5560';
    ctx.lineCap = 'round';
    tiled(w, (dx) => {
      for (const [px, py, s] of [
        [70, g - 58, 1],
        [130, g - 64, 0.8],
        [960, g - 84, 1.1],
        [1040, g - 88, 0.9],
      ] as const) {
        ctx.lineWidth = 3 * s;
        ctx.beginPath();
        ctx.moveTo(dx + px, py + 14);
        ctx.quadraticCurveTo(dx + px + 6 * s, py - 10 * s, dx + px + 2 * s, py - 30 * s);
        ctx.stroke();
        for (let k = 0; k < 5; k++) {
          const a = -Math.PI / 2 + (k - 2) * 0.62;
          ctx.beginPath();
          ctx.ellipse(
            dx + px + 2 * s + Math.cos(a) * 9 * s,
            py - 30 * s + Math.sin(a) * 6 * s + 3,
            11 * s,
            3 * s,
            a,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
      }
    });
  } else if (t === 1) {
    tiled(w, (dx) => {
      for (const [x, bw, bh] of [
        [90, 70, 110],
        [300, 160, 70],
        [640, 60, 130],
        [720, 90, 84],
        [1080, 180, 96],
        [1340, 70, 120],
      ] as const) {
        const grad = ctx.createLinearGradient(dx + x - bw / 2, 0, dx + x + bw / 2, 0);
        grad.addColorStop(0, '#C45A42');
        grad.addColorStop(1, '#8E3A36');
        mesa(ctx, dx + x, g, bw, bh, '#000');
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.fillStyle = 'rgba(255,190,140,0.25)';
        for (let k = 1; k < 4; k++) ctx.fillRect(dx + x - bw / 2, g - bh + k * (bh / 4), bw, 3);
      }
    });
    ctx.fillStyle = farGround(1);
    ctx.fillRect(0, g, w, h - g);
  } else {
    let x = 0;
    while (x < w) {
      const bw = 70 + rnd() * 90;
      const bh = 60 + rnd() * 110;
      ctx.fillStyle = '#3B2E73';
      ctx.fillRect(x, g - bh, bw - 6, bh + 1);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(x, g - bh, 6, bh);
      for (let wy = g - bh + 10; wy < g - 10; wy += 14)
        for (let wx = x + 8; wx < x + bw - 14; wx += 12)
          if (rnd() < 0.35) {
            ctx.fillStyle = rnd() < 0.75 ? '#FFD86B' : '#FFB3E0';
            ctx.fillRect(wx, wy, 5, 6);
          }
      if (rnd() < 0.5) {
        const neon = rnd() < 0.5 ? colors.pink : colors.sky;
        ctx.save();
        ctx.shadowColor = neon;
        ctx.shadowBlur = 10;
        ctx.fillStyle = neon;
        ctx.fillRect(x + 4, g - bh + 6, bw - 14, 3);
        ctx.restore();
      }
      x += bw;
    }
    ctx.fillStyle = farGround(2);
    ctx.fillRect(0, g, w, h - g);
  }
}

// ─── roadside props ───

/**
 * Each prop: world width in metres, the size its drawing code works in, where its foot is (fraction of the width)
 * and `show`, the widest it gets on screen before it leaves a 16:9 view (its texture is made that wide).
 */
export interface PropArt {
  w: number;
  tw: number;
  th: number;
  foot: number;
  show: number;
}
export const PROP_ART: Record<PropKind, PropArt> = {
  [PROP.palm]: { w: 6.5, tw: 150, th: 230, foot: 0.42, show: 210 },
  [PROP.hut]: { w: 7, tw: 180, th: 150, foot: 0.5, show: 186 },
  [PROP.lighthouse]: { w: 4.4, tw: 90, th: 260, foot: 0.5, show: 90 },
  [PROP.rock]: { w: 4.2, tw: 140, th: 84, foot: 0.5, show: 144 },
  [PROP.cactus]: { w: 3.2, tw: 110, th: 180, foot: 0.5, show: 110 },
  [PROP.butte]: { w: 11, tw: 220, th: 170, foot: 0.5, show: 232 },
  [PROP.neonPink]: { w: 5, tw: 140, th: 200, foot: 0.5, show: 150 },
  [PROP.neonCyan]: { w: 5, tw: 140, th: 200, foot: 0.5, show: 150 },
  [PROP.lamp]: { w: 4.8, tw: 120, th: 260, foot: 0.16, show: 156 },
  [PROP.chevron]: { w: 1.7, tw: 70, th: 110, foot: 0.5, show: 70 },
};

function stroke(ctx: Ctx, lw = 3): void {
  ctx.lineWidth = lw;
  ctx.strokeStyle = OUTLINE;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function shadowBlob(ctx: Ctx, x: number, y: number, rx: number, ry: number): void {
  ctx.fillStyle = 'rgba(30,10,40,0.28)';
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function palm(ctx: Ctx, w: number, h: number): void {
  const bx = w * 0.42;
  shadowBlob(ctx, bx, h - 6, 30, 6);
  // trunk: a curved stack of rings
  for (let i = 0; i < 9; i++) {
    const t = i / 9;
    const x = bx + Math.sin(t * 1.6) * 30;
    const y = h - 10 - t * (h - 80);
    ctx.beginPath();
    ctx.ellipse(x, y, 11 - t * 3, 13, 0, 0, Math.PI * 2);
    ctx.fillStyle = i % 2 ? '#B5793F' : '#9C6436';
    ctx.fill();
    stroke(ctx, 2.5);
  }
  const tx = bx + Math.sin(1.6) * 30;
  const ty = 72;
  // fronds
  for (let k = 0; k < 7; k++) {
    const a = Math.PI + (k / 6) * Math.PI + (k % 2 ? 0.1 : -0.1);
    const len = 62 + (k % 3) * 8;
    const ex = tx + Math.cos(a) * len;
    const ey = ty + Math.sin(a) * len * 0.55 + 26;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.quadraticCurveTo((tx + ex) / 2, ty - 26 + (k % 2) * 8, ex, ey);
    ctx.quadraticCurveTo((tx + ex) / 2 + 6, ty - 4, tx, ty + 8);
    ctx.fillStyle = k % 2 ? '#2BD47D' : '#1FAE6A';
    ctx.fill();
    stroke(ctx, 2.5);
  }
  for (const [cx, cy] of [
    [tx - 7, ty + 10],
    [tx + 6, ty + 12],
  ] as const) {
    ctx.beginPath();
    ctx.arc(cx, cy, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#7A4A26';
    ctx.fill();
    stroke(ctx, 2);
  }
}

function hut(ctx: Ctx, w: number, h: number): void {
  shadowBlob(ctx, w / 2, h - 6, 80, 8);
  // stilts
  ctx.fillStyle = '#8A5A34';
  for (const x of [28, 76, 104, 152]) ctx.fillRect(x, 96, 8, h - 104);
  // striped walls
  const wx = 20;
  const ww = w - 40;
  ctx.save();
  roundRectPath(ctx, wx, 64, ww, 46, 6);
  ctx.clip();
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? '#FFF6EA' : '#38C9D8';
    ctx.fillRect(wx + (i * ww) / 8, 64, ww / 8 + 1, 46);
  }
  ctx.restore();
  roundRectPath(ctx, wx, 64, ww, 46, 6);
  stroke(ctx);
  ctx.fillStyle = '#5A3A2A';
  roundRectPath(ctx, w / 2 - 14, 74, 28, 36, 4);
  ctx.fill();
  // thatched roof
  ctx.beginPath();
  ctx.moveTo(6, 70);
  ctx.lineTo(w / 2, 14);
  ctx.lineTo(w - 6, 70);
  ctx.closePath();
  ctx.fillStyle = '#F2B45A';
  ctx.fill();
  stroke(ctx);
  ctx.strokeStyle = 'rgba(140,80,30,0.5)';
  ctx.lineWidth = 2;
  for (let i = 1; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(w / 2, 18);
    ctx.lineTo(6 + (i * (w - 12)) / 6, 68);
    ctx.stroke();
  }
  // a surfboard leaning on it
  ctx.beginPath();
  ctx.ellipse(w - 26, 100, 9, 40, 0.18, 0, Math.PI * 2);
  ctx.fillStyle = colors.pink;
  ctx.fill();
  stroke(ctx, 2.5);
  ctx.fillStyle = '#FFF6EA';
  ctx.fillRect(w - 28, 64, 3, 72);
}

function lighthouse(ctx: Ctx, w: number, h: number): void {
  // rocky base
  ctx.beginPath();
  ctx.ellipse(w / 2, h - 14, w / 2 - 2, 16, 0, Math.PI, 0);
  ctx.lineTo(w - 2, h - 2);
  ctx.lineTo(2, h - 2);
  ctx.fillStyle = '#6E6A86';
  ctx.fill();
  stroke(ctx);
  // tower in red and white bands
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(w * 0.26, h - 18);
  ctx.lineTo(w * 0.36, 66);
  ctx.lineTo(w * 0.64, 66);
  ctx.lineTo(w * 0.74, h - 18);
  ctx.closePath();
  ctx.clip();
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = i % 2 ? '#FFF6EA' : '#FF5A5F';
    ctx.fillRect(0, 66 + (i * (h - 84)) / 6, w, (h - 84) / 6 + 1);
  }
  ctx.restore();
  ctx.beginPath();
  ctx.moveTo(w * 0.26, h - 18);
  ctx.lineTo(w * 0.36, 66);
  ctx.lineTo(w * 0.64, 66);
  ctx.lineTo(w * 0.74, h - 18);
  stroke(ctx);
  // lamp room with its light
  glow(ctx, w / 2, 46, 44, '#FFE38A', 0.8);
  roundRectPath(ctx, w * 0.3, 34, w * 0.4, 32, 4);
  ctx.fillStyle = '#FFF2A8';
  ctx.fill();
  stroke(ctx);
  ctx.beginPath();
  ctx.moveTo(w * 0.24, 36);
  ctx.lineTo(w / 2, 8);
  ctx.lineTo(w * 0.76, 36);
  ctx.closePath();
  ctx.fillStyle = '#3A3556';
  ctx.fill();
  stroke(ctx);
}

/** Boulders: grey-violet on the coast, red in the canyon (`warm`). */
export function drawRock(ctx: Ctx, w: number, h: number, warm: boolean): void {
  shadowBlob(ctx, w / 2, h - 5, w / 2 - 4, 6);
  const [a, b] = warm ? ['#D9734A', '#A84A34'] : ['#A49CC0', '#6E6A8E'];
  for (const [x, y, rx, ry] of [
    [w * 0.36, h - 32, 42, 30],
    [w * 0.66, h - 26, 34, 24],
  ] as const) {
    const g = ctx.createLinearGradient(0, y - ry, 0, y + ry);
    g.addColorStop(0, a);
    g.addColorStop(1, b);
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, Math.PI, 0);
    ctx.lineTo(x + rx, h - 6);
    ctx.lineTo(x - rx, h - 6);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
    stroke(ctx);
  }
}

function cactus(ctx: Ctx, w: number, h: number): void {
  shadowBlob(ctx, w / 2, h - 6, 30, 6);
  const fill = (path: () => void) => {
    path();
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#5ED88A');
    g.addColorStop(1, '#2A9A5C');
    ctx.fillStyle = g;
    ctx.fill();
    stroke(ctx);
  };
  // arms, then the trunk over them
  fill(() => {
    roundRectPath(ctx, 12, 66, 18, 58, 9);
    roundRectPath(ctx, 12, 108, 40, 18, 9);
  });
  fill(() => {
    roundRectPath(ctx, w - 30, 46, 18, 64, 9);
    roundRectPath(ctx, w - 56, 92, 44, 18, 9);
  });
  fill(() => roundRectPath(ctx, w / 2 - 17, 20, 34, h - 26, 17));
  ctx.strokeStyle = 'rgba(20,80,50,0.45)';
  ctx.lineWidth = 2;
  for (const dx of [-7, 7]) {
    ctx.beginPath();
    ctx.moveTo(w / 2 + dx, 32);
    ctx.lineTo(w / 2 + dx, h - 12);
    ctx.stroke();
  }
  ctx.fillStyle = colors.pink;
  starPath(ctx, w / 2, 22, 5, 9, 4);
  ctx.fill();
}

function butte(ctx: Ctx, w: number, h: number): void {
  ctx.beginPath();
  ctx.moveTo(4, h - 4);
  ctx.lineTo(34, 40);
  ctx.lineTo(70, 26);
  ctx.lineTo(w - 60, 22);
  ctx.lineTo(w - 30, 44);
  ctx.lineTo(w - 4, h - 4);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, '#E07A4E');
  g.addColorStop(0.6, '#B8513A');
  g.addColorStop(1, '#8E3A36');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = 'rgba(255,200,150,0.3)';
  for (let k = 0; k < 5; k++) ctx.fillRect(0, 50 + k * 24, w, 5);
  ctx.restore();
  ctx.beginPath();
  ctx.moveTo(4, h - 4);
  ctx.lineTo(34, 40);
  ctx.lineTo(70, 26);
  ctx.lineTo(w - 60, 22);
  ctx.lineTo(w - 30, 44);
  ctx.lineTo(w - 4, h - 4);
  stroke(ctx);
}

function neon(ctx: Ctx, w: number, h: number, pink: boolean): void {
  const c = pink ? colors.pink : colors.sky;
  // pole
  ctx.fillStyle = '#5A5478';
  ctx.fillRect(w / 2 - 5, 100, 10, h - 104);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2;
  ctx.strokeRect(w / 2 - 5, 100, 10, h - 104);
  // the board
  roundRectPath(ctx, 8, 8, w - 16, 100, 16);
  ctx.fillStyle = '#1E1846';
  ctx.fill();
  stroke(ctx, 4);
  ctx.save();
  ctx.shadowColor = c;
  ctx.shadowBlur = 14;
  ctx.strokeStyle = shade(c, 0.35);
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  roundRectPath(ctx, 18, 18, w - 36, 80, 10);
  ctx.stroke();
  if (pink) {
    // a neon star with a swoosh
    starPath(ctx, w / 2, 56, 5, 26, 11);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(30, 86);
    ctx.quadraticCurveTo(w / 2, 70, w - 30, 86);
    ctx.stroke();
  } else {
    // a neon palm by a wave
    ctx.beginPath();
    ctx.moveTo(w / 2 - 10, 88);
    ctx.quadraticCurveTo(w / 2 - 4, 60, w / 2 + 4, 42);
    for (const a of [-2.6, -1.9, -1.2, -0.5]) {
      ctx.moveTo(w / 2 + 4, 42);
      ctx.quadraticCurveTo(
        w / 2 + 4 + Math.cos(a) * 14,
        30,
        w / 2 + 4 + Math.cos(a) * 26,
        42 + Math.sin(a) * -8,
      );
    }
    ctx.moveTo(26, 82);
    ctx.quadraticCurveTo(40, 70, 52, 82);
    ctx.quadraticCurveTo(64, 94, 78, 82);
    ctx.stroke();
  }
  ctx.restore();
}

function lamp(ctx: Ctx, w: number, h: number): void {
  const px = w * 0.16;
  // a cone of warm light under the head
  ctx.save();
  const g = ctx.createLinearGradient(0, 40, 0, h);
  g.addColorStop(0, 'rgba(255,225,140,0.3)');
  g.addColorStop(1, 'rgba(255,225,140,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(w - 30, 40);
  ctx.lineTo(w - 4, h - 10);
  ctx.lineTo(w - 70, h - 10);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // post and arm
  ctx.beginPath();
  ctx.moveTo(px - 6, h - 4);
  ctx.lineTo(px - 4, 30);
  ctx.quadraticCurveTo(px - 2, 14, px + 22, 14);
  ctx.lineTo(w - 22, 14);
  ctx.lineTo(w - 22, 24);
  ctx.lineTo(px + 22, 24);
  ctx.quadraticCurveTo(px + 6, 24, px + 6, 36);
  ctx.lineTo(px + 6, h - 4);
  ctx.closePath();
  ctx.fillStyle = '#6A6490';
  ctx.fill();
  stroke(ctx, 2.5);
  // the lamp head
  roundRectPath(ctx, w - 46, 18, 36, 16, 6);
  ctx.fillStyle = '#4A4470';
  ctx.fill();
  stroke(ctx, 2.5);
  glow(ctx, w - 28, 36, 26, '#FFE38A', 0.9);
  ctx.fillStyle = '#FFF2B8';
  roundRectPath(ctx, w - 42, 31, 28, 6, 3);
  ctx.fill();
}

function chevron(ctx: Ctx, w: number, h: number): void {
  ctx.fillStyle = '#5A5478';
  ctx.fillRect(w / 2 - 3, 60, 6, h - 62);
  glossyRect(ctx, 4, 4, w - 8, 62, colors.yellow, {
    radius: 8,
    depth: 4,
    outline: OUTLINE,
    lineWidth: 3,
  });
  ctx.fillStyle = OUTLINE;
  ctx.beginPath();
  ctx.moveTo(22, 14);
  ctx.lineTo(48, 34);
  ctx.lineTo(22, 54);
  ctx.lineTo(16, 46);
  ctx.lineTo(32, 34);
  ctx.lineTo(16, 22);
  ctx.closePath();
  ctx.fill();
}

/** Draws prop `kind` (rocks are drawn by drawRock). */
export function drawProp(ctx: Ctx, kind: PropKind, w: number, h: number): void {
  switch (kind) {
    case PROP.palm:
      return palm(ctx, w, h);
    case PROP.hut:
      return hut(ctx, w, h);
    case PROP.lighthouse:
      return lighthouse(ctx, w, h);
    case PROP.rock:
      return drawRock(ctx, w, h, false);
    case PROP.cactus:
      return cactus(ctx, w, h);
    case PROP.butte:
      return butte(ctx, w, h);
    case PROP.neonPink:
      return neon(ctx, w, h, true);
    case PROP.neonCyan:
      return neon(ctx, w, h, false);
    case PROP.lamp:
      return lamp(ctx, w, h);
    case PROP.chevron:
      return chevron(ctx, w, h);
  }
}

// ─── traffic (seen from behind) ───

/** The size the drawing code works in (world width 2.6 m) and `show`, a car's width on screen level with Miso. */
export const CAR_TEX = { w: 150, h: 128, show: 170 } as const;
export const CAR_WORLD_W = 2.6;

function wheels(ctx: Ctx, w: number, h: number, inset: number): void {
  ctx.fillStyle = '#1E1A30';
  for (const x of [inset, w - inset - 22]) {
    roundRectPath(ctx, x, h - 34, 22, 26, 6);
    ctx.fill();
  }
}

function tailLights(ctx: Ctx, y: number, xs: readonly number[], r: number): void {
  for (const x of xs) {
    glow(ctx, x, y, r * 2.2, '#FF3A4A', 0.55);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#FF4A5A';
    ctx.fill();
    stroke(ctx, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function plate(ctx: Ctx, x: number, y: number): void {
  roundRectPath(ctx, x - 16, y, 32, 12, 3);
  ctx.fillStyle = '#FFF6EA';
  ctx.fill();
  stroke(ctx, 1.5);
}

/** Traffic car `k` from behind: a hatchback, a delivery van, a camper and a pickup. */
export function drawTraffic(ctx: Ctx, k: number, w: number, h: number): void {
  shadowBlob(ctx, w / 2, h - 8, w / 2 - 4, 9);
  if (k === 0) {
    wheels(ctx, w, h, 14);
    ctx.beginPath();
    ctx.moveTo(10, h - 22);
    ctx.lineTo(12, 64);
    ctx.quadraticCurveTo(22, 26, w / 2, 24);
    ctx.quadraticCurveTo(w - 22, 26, w - 12, 64);
    ctx.lineTo(w - 10, h - 22);
    ctx.quadraticCurveTo(w / 2, h - 14, 10, h - 22);
    ctx.fillStyle = colors.sky;
    ctx.fill();
    stroke(ctx);
    roundRectPath(ctx, 30, 34, w - 60, 28, 10);
    ctx.fillStyle = '#2E3A6E';
    ctx.fill();
    stroke(ctx, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(38, 38, 22, 5);
    tailLights(ctx, 76, [26, w - 26], 7);
    plate(ctx, w / 2, 80);
  } else if (k === 1) {
    wheels(ctx, w, h, 12);
    glossyRect(ctx, 8, 8, w - 16, h - 26, '#FFF0D6', {
      radius: 12,
      depth: 6,
      outline: OUTLINE,
      lineWidth: 3,
    });
    ctx.fillStyle = colors.orange;
    ctx.fillRect(10, 50, w - 20, 12);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w / 2, 12);
    ctx.lineTo(w / 2, h - 26);
    ctx.stroke();
    for (const x of [w / 2 - 20, w / 2 + 12]) {
      roundRectPath(ctx, x, 70, 8, 4, 2);
      ctx.fillStyle = '#6A6490';
      ctx.fill();
    }
    tailLights(ctx, 90, [20, w - 20], 6);
    plate(ctx, w / 2, 92);
  } else if (k === 2) {
    wheels(ctx, w, h, 14);
    glossyRect(ctx, 10, 18, w - 20, h - 36, '#7FE3C4', {
      radius: 18,
      depth: 6,
      outline: OUTLINE,
      lineWidth: 3,
    });
    ctx.fillStyle = '#FFF6EA';
    roundRectPath(ctx, 12, 20, w - 24, 42, 16);
    ctx.fill();
    roundRectPath(ctx, 32, 28, w - 64, 24, 8);
    ctx.fillStyle = '#2E3A6E';
    ctx.fill();
    stroke(ctx, 2);
    // roof rack and a spare wheel
    ctx.fillStyle = '#4A4470';
    ctx.fillRect(22, 10, w - 44, 6);
    ctx.beginPath();
    ctx.arc(w / 2, 82, 15, 0, Math.PI * 2);
    ctx.fillStyle = '#2B2540';
    ctx.fill();
    stroke(ctx, 2);
    ctx.beginPath();
    ctx.arc(w / 2, 82, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#C8C2E0';
    ctx.fill();
    tailLights(ctx, 84, [22, w - 22], 6);
  } else {
    wheels(ctx, w, h, 12);
    ctx.beginPath();
    ctx.moveTo(30, 56);
    ctx.lineTo(36, 26);
    ctx.lineTo(w - 36, 26);
    ctx.lineTo(w - 30, 56);
    ctx.closePath();
    ctx.fillStyle = colors.purple;
    ctx.fill();
    stroke(ctx);
    roundRectPath(ctx, 42, 32, w - 84, 20, 6);
    ctx.fillStyle = '#2E3A6E';
    ctx.fill();
    glossyRect(ctx, 8, 52, w - 16, h - 70, colors.purple, {
      radius: 10,
      depth: 6,
      outline: OUTLINE,
      lineWidth: 3,
    });
    // a surfboard sticking out of the bed
    ctx.beginPath();
    ctx.ellipse(w - 40, 40, 8, 26, 0.5, 0, Math.PI * 2);
    ctx.fillStyle = colors.yellow;
    ctx.fill();
    stroke(ctx, 2);
    ctx.strokeStyle = shade(colors.purple, -0.4);
    ctx.lineWidth = 2;
    ctx.strokeRect(24, 64, w - 48, 22);
    tailLights(ctx, 74, [20, w - 20], 6);
    plate(ctx, w / 2, 90);
  }
}

// ─── Miso and her lime convertible ───
// The car is a stack of separate textures, each drawn at the size it is shown. They share one origin: the ground
// under the middle of the rear bumper (x grows right, y is negative upward). The scene rolls the body, head, tail
// and scarf together about the axle while the tyres and the shadow stay on the road.

/** Steering frames either side of straight ahead. */
export const LEAN_STEPS = 3;
/** How far the nose swings sideways at full lock. */
const YAW = 44;
/** Body texture; (ox, oy) is the shared origin in it. */
export const BODY = { w: 256, h: 184, ox: 128, oy: 184 } as const;
/** A rear tyre (centre `x` from the car's middle, standing on the ground); `frames` tread positions. */
export const TYRE = { w: 38, h: 46, x: 85, frames: 3 } as const;
/** The brake-light glow, centred on the lamps. */
export const BRAKE = { w: 236, h: 64, y: -66 } as const;
/** Miso's head (its origin is the neck: bottom centre). */
export const HEAD = { w: 100, h: 104, y: -122 } as const;
/** The tail (origin at its base) and where the base sits. */
export const TAIL = { w: 92, h: 100, ox: 16, oy: 88, x: 30, y: -122 } as const;
/** The scarf ends (origin at the knot, on the right edge) and where the knot sits relative to the neck. */
export const SCARF = { w: 72, h: 44, ox: 68, oy: 22, x: -27, y: -10, frames: 3 } as const;
/** The waving paw (origin at the shoulder: bottom centre) relative to the neck. */
export const PAW = { w: 36, h: 56, x: 40, y: -6 } as const;
export const SHADOW = { w: 264, h: 50 } as const;
export const STAR = 22;
export const HEADS = ['back', 'happy', 'dizzy', 'sad'] as const;
export type HeadPose = (typeof HEADS)[number];

/** Sideways shift of a part at depth `d` (0 = rear bumper, 1 = nose) on steering frame `step`. */
export const yawShift = (step: number, d: number) => (step / LEAN_STEPS) * YAW * (d - 0.4);

const LIME_TOP = shade(LIME, 0.22);
const LIME_SIDE = shade(LIME, -0.2);
const LIME_LINE = shade(LIME, -0.42);
const CREAM = '#FFF6EA';
const SEAT = '#E8475A';
const CABIN = '#3B2850';

/**
 * The car body from behind and a little above, on steering frame `step` (−LEAN_STEPS..LEAN_STEPS, positive turns
 * right): the nose swings toward the turn and the side facing the camera comes into view.
 */
export function drawMisoBody(ctx: Ctx, step: number): void {
  const q = step / LEAN_STEPS;
  /** screen x of a point `x` right of the centre line at depth d; farther parts are a little narrower */
  const X = (x: number, d: number) => x * (1 - 0.08 * d) + q * YAW * (d - 0.4);
  /** screen y of the body's top edge and its underside at depth d */
  const top = (d: number) => -86 - 80 * d;
  const under = (d: number) => -24 - 64 * d;
  const line = (pts: readonly (readonly [number, number])[]) => {
    ctx.beginPath();
    pts.forEach(([x, d], k) => (k ? ctx.lineTo(X(x, d), top(d)) : ctx.moveTo(X(x, d), top(d))));
  };
  ctx.save();
  ctx.translate(BODY.ox, BODY.oy);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // the sides, each with its front tyre; the top and the rear panel are drawn over whatever the turn hides
  for (const s of [-1, 1]) {
    roundRectPath(ctx, X(s * 93, 0.84) - 9, under(0.84) - 12, 18, 34, 7);
    ctx.fillStyle = '#1E1A30';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(X(s * 96, 0), top(0));
    ctx.lineTo(X(s * 94, 0.3), top(0.3));
    ctx.lineTo(X(s * 88, 0.72), top(0.72));
    ctx.lineTo(X(s * 74, 1), top(1));
    ctx.lineTo(X(s * 80, 1), under(1));
    ctx.lineTo(X(s * 100, 0), under(0));
    ctx.closePath();
    ctx.fillStyle = LIME_SIDE;
    ctx.fill();
    stroke(ctx, 3);
    // the wheel arch over the front tyre
    ctx.beginPath();
    ctx.ellipse(X(s * 92, 0.84), under(0.84) + 2, 13, 17, 0, Math.PI, 0);
    ctx.strokeStyle = LIME_LINE;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // the top: boot deck, door tops and bonnet in one shape
  ctx.beginPath();
  ctx.moveTo(X(-96, 0), top(0));
  ctx.lineTo(X(-94, 0.3), top(0.3));
  ctx.lineTo(X(-88, 0.72), top(0.72));
  ctx.lineTo(X(-74, 1), top(1));
  ctx.quadraticCurveTo(X(0, 1.16), top(1.16), X(74, 1), top(1));
  ctx.lineTo(X(88, 0.72), top(0.72));
  ctx.lineTo(X(94, 0.3), top(0.3));
  ctx.lineTo(X(96, 0), top(0));
  ctx.closePath();
  const tg = ctx.createLinearGradient(0, top(1.1), 0, top(0));
  tg.addColorStop(0, LIME);
  tg.addColorStop(1, LIME_TOP);
  ctx.fillStyle = tg;
  ctx.fill();
  stroke(ctx, 3);
  // twin racing stripes down the bonnet and the boot
  ctx.fillStyle = CREAM;
  for (const [d0, d1] of [
    [0.72, 1.06],
    [0, 0.3],
  ] as const)
    for (const x of [-12, 3]) {
      line([
        [x, d0],
        [x, d1],
        [x + 9, d1],
        [x + 9, d0],
      ]);
      ctx.fill();
    }

  // the cabin: a dark tub with the dashboard at the front
  line([
    [-80, 0.3],
    [-75, 0.72],
    [75, 0.72],
    [80, 0.3],
  ]);
  ctx.closePath();
  ctx.fillStyle = CABIN;
  ctx.fill();
  stroke(ctx, 2.5);
  line([
    [-76, 0.62],
    [-75, 0.72],
    [75, 0.72],
    [76, 0.62],
  ]);
  ctx.closePath();
  ctx.fillStyle = '#5A4474';
  ctx.fill();

  // windscreen: tinted glass in a chrome frame, the bonnet showing through
  const wy = top(0.72);
  const glass = () => {
    ctx.beginPath();
    ctx.moveTo(X(-80, 0.72), wy);
    ctx.lineTo(X(-70, 0.8), wy - 30);
    ctx.quadraticCurveTo(X(0, 0.8), wy - 36, X(70, 0.8), wy - 30);
    ctx.lineTo(X(80, 0.72), wy);
    ctx.closePath();
  };
  glass();
  ctx.fillStyle = 'rgba(196,236,255,0.62)';
  ctx.fill();
  ctx.save();
  glass();
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  for (const x of [-52, -34]) {
    ctx.beginPath();
    ctx.moveTo(X(x, 0.76), wy);
    ctx.lineTo(X(x + 9, 0.76), wy);
    ctx.lineTo(X(x + 23, 0.76), wy - 36);
    ctx.lineTo(X(x + 14, 0.76), wy - 36);
    ctx.fill();
  }
  ctx.restore();
  glass();
  ctx.lineWidth = 7;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#EDEAFB';
  ctx.stroke();
  // wing mirrors
  for (const s of [-1, 1]) {
    roundRectPath(ctx, X(s * 100, 0.7) - 10, wy - 12, 20, 13, 5);
    ctx.fillStyle = LIME;
    ctx.fill();
    stroke(ctx, 2.5);
  }

  // two seat backs
  for (const s of [-1, 1]) {
    const sx = X(s * 40, 0.36);
    roundRectPath(ctx, sx - 31, -150, 62, 46, 15);
    ctx.fillStyle = SEAT;
    ctx.fill();
    stroke(ctx, 3);
    roundRectPath(ctx, sx - 22, -144, 44, 7, 3.5);
    ctx.fillStyle = shade(SEAT, 0.3);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(sx, -132);
    ctx.lineTo(sx, -112);
    ctx.strokeStyle = shade(SEAT, -0.3);
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  // the boot's front edge closes over the seats
  line([
    [-80, 0.3],
    [80, 0.3],
  ]);
  stroke(ctx, 2.5);

  // the rear panel
  const cx = X(0, 0);
  ctx.beginPath();
  ctx.moveTo(cx - 96, -86);
  ctx.quadraticCurveTo(cx, -91, cx + 96, -86);
  ctx.quadraticCurveTo(cx + 105, -62, cx + 100, -30);
  ctx.quadraticCurveTo(cx + 99, -24, cx + 92, -24);
  ctx.lineTo(cx - 92, -24);
  ctx.quadraticCurveTo(cx - 99, -24, cx - 100, -30);
  ctx.quadraticCurveTo(cx - 105, -62, cx - 96, -86);
  ctx.closePath();
  const rg = ctx.createLinearGradient(0, -88, 0, -24);
  rg.addColorStop(0, shade(LIME, 0.12));
  rg.addColorStop(0.45, LIME);
  rg.addColorStop(1, shade(LIME, -0.28));
  ctx.fillStyle = rg;
  ctx.fill();
  stroke(ctx, 3.5);
  ctx.fillStyle = CREAM;
  for (const x of [-12, 3]) ctx.fillRect(cx + x, -86, 9, 22);
  // a bright lip where the boot rolls over into the rear panel
  ctx.beginPath();
  ctx.moveTo(cx - 84, -81);
  ctx.quadraticCurveTo(cx, -85.5, cx + 84, -81);
  ctx.strokeStyle = shade(LIME, 0.55);
  ctx.lineWidth = 3.5;
  ctx.stroke();
  // tail lights: red lens, amber outer end
  for (const s of [-1, 1]) {
    const lx = cx + (s > 0 ? 54 : -92);
    roundRectPath(ctx, lx, -77, 38, 19, 8);
    ctx.fillStyle = '#E02A44';
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = '#FFB02E';
    ctx.fillRect(s > 0 ? lx + 27 : lx, -77, 11, 19);
    ctx.fillStyle = '#FF7A84';
    ctx.fillRect(lx, -77, 38, 6);
    ctx.restore();
    roundRectPath(ctx, lx, -77, 38, 19, 8);
    stroke(ctx, 2.5);
  }
  // number plate with Miso's star
  roundRectPath(ctx, cx - 23, -64, 46, 19, 4);
  ctx.fillStyle = CREAM;
  ctx.fill();
  stroke(ctx, 2);
  ctx.fillStyle = ACCENT;
  starPath(ctx, cx, -54, 5, 7, 3);
  ctx.fill();
  // valance, exhausts and the chrome bumper
  roundRectPath(ctx, cx - 60, -28, 120, 13, 4);
  ctx.fillStyle = '#3A3350';
  ctx.fill();
  stroke(ctx, 2);
  for (const x of [-46, -31]) {
    ctx.beginPath();
    ctx.arc(cx + x, -19, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = '#A9A3C6';
    ctx.fill();
    stroke(ctx, 2);
    ctx.beginPath();
    ctx.arc(cx + x, -19, 2.4, 0, Math.PI * 2);
    ctx.fillStyle = OUTLINE;
    ctx.fill();
  }
  roundRectPath(ctx, cx - 104, -41, 208, 15, 7.5);
  const bg = ctx.createLinearGradient(0, -41, 0, -26);
  bg.addColorStop(0, '#FBFAFF');
  bg.addColorStop(0.5, '#DAD5EE');
  bg.addColorStop(1, '#9D97BC');
  ctx.fillStyle = bg;
  ctx.fill();
  stroke(ctx, 2.5);
  ctx.restore();
}

/** A rear tyre from behind; `frame` moves the tread so cycling the frames reads as spin. */
export function drawTyre(ctx: Ctx, frame: number): void {
  const { w, h } = TYRE;
  roundRectPath(ctx, 1.5, 1.5, w - 3, h - 3, 9);
  ctx.fillStyle = '#231E36';
  ctx.fill();
  ctx.save();
  ctx.clip();
  // chevron tread, moving up the back of the tyre as the car drives away
  ctx.strokeStyle = '#57507A';
  ctx.lineWidth = 3;
  const gap = 12;
  for (let y = -gap - (frame * gap) / TYRE.frames; y < h + gap; y += gap) {
    ctx.beginPath();
    ctx.moveTo(4, y + 5);
    ctx.lineTo(w / 2, y);
    ctx.lineTo(w - 4, y + 5);
    ctx.stroke();
  }
  ctx.restore();
  roundRectPath(ctx, 1.5, 1.5, w - 3, h - 3, 9);
  stroke(ctx, 3);
}

/** The lit brake lamps with their red glow, laid over the tail lights. */
export function drawBrakeGlow(ctx: Ctx): void {
  const { w, h } = BRAKE;
  for (const s of [-1, 1]) {
    const x = w / 2 + s * 73;
    glow(ctx, x, h / 2, 32, '#FF2A3C', 0.6);
    roundRectPath(ctx, x - 19, h / 2 - 9.5, 38, 19, 8);
    ctx.fillStyle = '#FF5A4A';
    ctx.fill();
    roundRectPath(ctx, x - 13, h / 2 - 5, 26, 10, 5);
    ctx.fillStyle = '#FFE9C8';
    ctx.fill();
  }
}

/** The soft shadow under the car. */
export function drawCarShadow(ctx: Ctx): void {
  const { w, h } = SHADOW;
  for (const [k, a] of [
    [1, 0.14],
    [0.86, 0.16],
    [0.7, 0.16],
  ] as const) {
    ctx.fillStyle = `rgba(30,10,40,${a})`;
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, (w / 2) * k, (h / 2) * k, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Miso's bushy ringed tail, curling up from its base: a chain of discs, thickest in the middle. */
export function drawTail(ctx: Ctx): void {
  const N = 40;
  const at = (t: number): [number, number, number] => {
    const u = 1 - t;
    const x = u * u * u * 16 + 3 * u * u * t * 62 + 3 * u * t * t * 22 + t * t * t * 68;
    const y = u * u * u * 88 + 3 * u * u * t * 84 + 3 * u * t * t * 40 + t * t * t * 20;
    return [x, y, 9 + 9 * Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.8))];
  };
  ctx.fillStyle = OUTLINE;
  for (let i = 0; i <= N; i++) {
    const [x, y, r] = at(i / N);
    ctx.beginPath();
    ctx.arc(x, y, r + 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const [x, y, r] = at(t);
    const band = Math.floor(t * 7.4);
    ctx.fillStyle = band >= 7 ? '#5A2A1E' : band % 2 ? '#F6C9A0' : FUR;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** The scarf's two ends streaming left from the knot; `frame` moves the ripple along them. */
export function drawScarfEnds(ctx: Ctx, frame: number): void {
  const ph = frame / SCARF.frames;
  const ribbon = (len: number, dy: number, wide: number, amp: number, shift: number, c: string) => {
    const N = 12;
    const mid = (t: number) => dy + amp * t * Math.sin(Math.PI * 2 * (t * 1.15 - ph - shift));
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      ctx.lineTo(SCARF.ox - t * len, SCARF.oy + mid(t) - wide * (1 - 0.25 * t));
    }
    // a notched tip
    ctx.lineTo(SCARF.ox - len + 7, SCARF.oy + mid(1));
    for (let i = N; i >= 0; i--) {
      const t = i / N;
      ctx.lineTo(SCARF.ox - t * len, SCARF.oy + mid(t) + wide * (1 - 0.25 * t));
    }
    ctx.closePath();
    ctx.fillStyle = c;
    ctx.fill();
    stroke(ctx, 2.5);
  };
  ribbon(50, 5, 6, 6, 0.35, colors.orange);
  ribbon(62, -3, 7, 7, 0, colors.pink);
}

/** Miso's raised paw, seen from behind: a dark sleeve of fur with a round mitt. */
export function drawPaw(ctx: Ctx): void {
  const { w, h } = PAW;
  ctx.beginPath();
  ctx.moveTo(w / 2 - 8, h - 2);
  ctx.lineTo(w / 2 - 8, 20);
  ctx.arc(w / 2, 16, 13, Math.PI, 0);
  ctx.lineTo(w / 2 + 8, 20);
  ctx.lineTo(w / 2 + 8, h - 2);
  ctx.closePath();
  ctx.fillStyle = '#4A2418';
  ctx.fill();
  stroke(ctx, 2.5);
  ctx.strokeStyle = '#7A4630';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  for (const x of [-5, 0, 5]) {
    ctx.beginPath();
    ctx.moveTo(w / 2 + x, 6);
    ctx.lineTo(w / 2 + x, 11);
    ctx.stroke();
  }
}

/** A dizzy star. */
export function drawStar(ctx: Ctx): void {
  starPath(ctx, STAR / 2, STAR / 2 + 0.5, 5, STAR / 2 - 2, STAR / 4.4);
  ctx.fillStyle = colors.yellow;
  ctx.fill();
  stroke(ctx, 2.5);
}

/** An ear leaning outward (`out`: −1 left, 1 right): cream-rimmed with a dark middle, or its furry back. */
function ear(ctx: Ctx, x: number, y: number, out: number, back: boolean): void {
  const shape = () => {
    ctx.beginPath();
    ctx.moveTo(-16, 12);
    ctx.quadraticCurveTo(-12 + out * 6, -12, out * 9, -26);
    ctx.quadraticCurveTo(14 + out * 6, -10, 16, 12);
    ctx.closePath();
  };
  ctx.save();
  ctx.translate(x, y);
  shape();
  ctx.fillStyle = '#FFF3E6';
  ctx.fill();
  stroke(ctx, 2.5);
  ctx.translate(out, 4);
  ctx.scale(back ? 0.7 : 0.62, back ? 0.7 : 0.62);
  shape();
  ctx.fillStyle = back ? '#B8451F' : '#4A2418';
  ctx.fill();
  ctx.restore();
}

/** Miso's head: from behind (`back`), or turned to look back at us with a happy, dizzy or sad face. */
export function drawHead(ctx: Ctx, pose: HeadPose): void {
  const { w, h } = HEAD;
  const cx = w / 2;
  const cy = h - 48;
  const back = pose === 'back';
  // sad ears droop
  const droop = pose === 'sad' ? 7 : 0;
  ear(ctx, cx - 30 - droop * 0.4, cy - 24 + droop, -1, back);
  ear(ctx, cx + 30 + droop * 0.4, cy - 24 + droop, 1, back);
  // fluffy white cheek tufts poke out at the sides
  for (const d of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + d * 26, cy - 2);
    ctx.lineTo(cx + d * 46, cy + 6);
    ctx.lineTo(cx + d * 36, cy + 12);
    ctx.lineTo(cx + d * 44, cy + 20);
    ctx.lineTo(cx + d * 24, cy + 22);
    ctx.closePath();
    ctx.fillStyle = '#FFF3E6';
    ctx.fill();
    stroke(ctx, 2.5);
  }
  // head
  ctx.beginPath();
  ctx.ellipse(cx, cy, 38, 33, 0, 0, Math.PI * 2);
  const g = ctx.createRadialGradient(cx - 10, cy - 14, 4, cx, cy, 40);
  g.addColorStop(0, '#F07A45');
  g.addColorStop(1, FUR);
  ctx.fillStyle = g;
  ctx.fill();
  if (back) {
    // darker fur at the nape and a few fur strokes
    ctx.save();
    ctx.clip();
    ctx.fillStyle = '#A8401F';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 30, 40, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#A8401F';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (const [x0, y0, x1, y1] of [
      [-14, -20, -8, -8],
      [0, -24, 2, -12],
      [14, -20, 10, -8],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(cx + x0, cy + y0);
      ctx.lineTo(cx + x1, cy + y1);
      ctx.stroke();
    }
  }
  ctx.beginPath();
  ctx.ellipse(cx, cy, 38, 33, 0, 0, Math.PI * 2);
  stroke(ctx, 3);
  // the sunset scarf around her neck, knotted on the left (its ends are a separate texture)
  ctx.beginPath();
  ctx.moveTo(cx - 30, cy + 22);
  ctx.quadraticCurveTo(cx, cy + 36, cx + 30, cy + 22);
  ctx.lineTo(cx + 32, cy + 34);
  ctx.quadraticCurveTo(cx, cy + 46, cx - 32, cy + 34);
  ctx.closePath();
  ctx.fillStyle = colors.pink;
  ctx.fill();
  stroke(ctx, 2.5);
  roundRectPath(ctx, cx - 36, cy + 22, 15, 15, 5);
  ctx.fillStyle = shade(colors.pink, -0.15);
  ctx.fill();
  stroke(ctx, 2.5);
  if (back) return;
  // the face: white muzzle, brows and cheeks, rust tear marks, then the expression
  ctx.fillStyle = '#FFF3E6';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 12, 20, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  for (const d of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + d * 15, cy - 16, 7, 4, d * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + d * 30, cy + 8, 9, 11, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#A8401F';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  for (const d of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + d * 19, cy + 3);
    ctx.quadraticCurveTo(cx + d * 24, cy + 12, cx + d * 20, cy + 20);
    ctx.stroke();
  }
  ctx.fillStyle = OUTLINE;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 6, 6, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 3;
  for (const d of [-1, 1]) {
    const ex = cx + d * 16;
    const ey = cy - 4;
    ctx.beginPath();
    if (pose === 'happy') ctx.arc(ex, ey + 3, 6, Math.PI * 1.1, Math.PI * 1.9);
    else if (pose === 'dizzy') {
      for (let a = 0; a < Math.PI * 3.2; a += 0.3) {
        const r = 1 + a * 0.6;
        const px = ex + Math.cos(a) * r;
        const py = ey + Math.sin(a) * r;
        if (a === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
    } else {
      ctx.moveTo(ex - 6, ey - 1 - d * 2);
      ctx.lineTo(ex + 6, ey - 1 + d * 2);
      ctx.moveTo(ex, ey + 2);
      ctx.arc(ex, ey + 4, 4, 0, Math.PI * 2);
    }
    ctx.stroke();
  }
  ctx.beginPath();
  if (pose === 'happy') {
    ctx.moveTo(cx - 9, cy + 13);
    ctx.quadraticCurveTo(cx, cy + 26, cx + 9, cy + 13);
    ctx.closePath();
    ctx.fillStyle = '#C2304A';
    ctx.fill();
    ctx.stroke();
  } else if (pose === 'dizzy') {
    ctx.moveTo(cx - 9, cy + 18);
    ctx.quadraticCurveTo(cx - 4, cy + 13, cx, cy + 18);
    ctx.quadraticCurveTo(cx + 4, cy + 23, cx + 9, cy + 18);
    ctx.stroke();
  } else {
    ctx.moveTo(cx - 8, cy + 21);
    ctx.quadraticCurveTo(cx, cy + 14, cx + 8, cy + 21);
    ctx.stroke();
    ctx.fillStyle = colors.sky;
    ctx.beginPath();
    ctx.ellipse(cx + 22, cy + 8, 3, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ─── the checkpoint arch ───

/** Spans the road plus margins: world width = ARCH_W road half-widths × 2. */
export const ARCH = { tw: 640, th: 300, halfWidths: 1.32 } as const;

export function drawArch(ctx: Ctx, w: number, h: number, label: string): void {
  // posts
  for (const x of [10, w - 46]) {
    glossyRect(ctx, x, 40, 36, h - 44, ACCENT, {
      radius: 12,
      depth: 0,
      outline: OUTLINE,
      lineWidth: 3,
    });
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (let y = 70; y < h - 20; y += 44) ctx.fillRect(x + 4, y, 28, 10);
  }
  // banner
  glossyRect(ctx, 0, 8, w, 92, '#2A1F60', { radius: 22, depth: 8, outline: OUTLINE, lineWidth: 4 });
  // checkered trim
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = i % 2 ? '#FFF6EA' : OUTLINE;
    ctx.fillRect(28 + i * 14.6, 16, 14.6, 8);
    ctx.fillStyle = i % 2 ? OUTLINE : '#FFF6EA';
    ctx.fillRect(28 + i * 14.6, 80, 14.6, 8);
  }
  ctx.font = font('display', 700, 46);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 8;
  ctx.strokeStyle = OUTLINE;
  ctx.strokeText(label, w / 2, 54);
  const g = ctx.createLinearGradient(0, 30, 0, 78);
  g.addColorStop(0, colors.yellow);
  g.addColorStop(1, colors.orange);
  ctx.fillStyle = g;
  ctx.fillText(label, w / 2, 54);
  // bulbs
  for (const x of [26, w - 26]) {
    glow(ctx, x, 54, 20, colors.yellow, 0.9);
    ctx.fillStyle = '#FFF6C8';
    ctx.beginPath();
    ctx.arc(x, 54, 7, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ─── effects and HUD ───

/** A soft white dot (tinted for dust, sparks and glows). */
export function drawPuff(ctx: Ctx, s: number): void {
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
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

/** The HUD Pause button: a coral candy button with a pause glyph on the left. */
export function drawPauseButton(ctx: Ctx, w: number, h: number): void {
  glossyRect(ctx, 0, 0, w, h, ACCENT, {
    radius: 18,
    depth: 6,
    outline: shade(ACCENT, -0.6),
    lineWidth: 2.5,
  });
  ctx.fillStyle = INK;
  for (const x of [22, 34]) {
    roundRectPath(ctx, x, 16, 7, 22, 3);
    ctx.fill();
  }
}

/** The big timer badge behind the seconds. */
export function drawTimer(ctx: Ctx, w: number, h: number): void {
  roundRectPath(ctx, 2, 2, w - 4, h - 4, 26);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, rgba('#2A1F60', 0.88));
  g.addColorStop(1, rgba(colors.bg, 0.88));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = ACCENT;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  roundRectPath(ctx, 8, 6, w - 16, h * 0.4, 20);
  ctx.fill();
}

/** The touch hint: a chevron pointing right. */
export function drawHintArrow(ctx: Ctx, s: number): void {
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s / 2 - 3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(18,12,44,0.45)';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
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
