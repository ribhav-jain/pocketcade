// The districts Bao runs through. Each one is data: sky colours, sun or moon, cloud tint, two skyline painters,
// the colour of its hanging lights, the look of the rooftop and what drifts through the air. To add a district,
// add an entry to THEMES and its name to strings.districts; the scene and the route pick it up from there.
import {
  fillGradient,
  glossyCircle,
  prng,
  rgba,
  roundRectPath,
  sprinkle,
} from '@pocketcade/toolkit';
import { ell, fillStroke, GOLD, INK, q, vgrad, type Ctx } from './art.ts';

const TAU = Math.PI * 2;

export interface Anchor {
  x: number;
  y: number;
}

export type Ambient = 'embers' | 'rain' | 'birds' | 'petals';

interface RoofLook {
  /** ribbed sheet metal instead of barrel tiles */
  ribbed?: boolean;
  /** across one tile: edge, highlight, body, far edge */
  tile: readonly [string, string, string, string];
  /** the channel between tiles: edge, middle */
  pan: readonly [string, string];
  base: string;
  /** ridge beam, top to bottom */
  beam: readonly [string, string, string];
  trim: string;
  stud: string;
  /** the wall under the eave, top to bottom */
  wall: readonly [string, string];
  windowGlow: string;
}

export interface Theme {
  /** sky colours as [design y, colour], from above the tallest view down to the horizon */
  sky: readonly (readonly [number, string])[];
  /** star field strength, 0 to 1 */
  stars: number;
  orb: { kind: 'moon' | 'sun'; x: number; y: number; scale: number; alpha: number };
  cloud: { tint: number; alpha: number };
  far(ctx: Ctx, w: number, h: number): void;
  /** Paints the near skyline and returns where its hanging lights go (x within the tile). */
  mid(ctx: Ctx, w: number, h: number): Anchor[];
  lantern: string;
  roof: RoofLook;
  ambient: Ambient;
}

// ─── shared pieces ───

/** A curved roof with upturned eaves; (cx, y) is the centre of the eave line. */
function roofPath(ctx: Ctx, cx: number, y: number, w: number, h: number): void {
  const hw = w / 2;
  ctx.beginPath();
  ctx.moveTo(cx - hw, y - h * 0.36);
  ctx.quadraticCurveTo(cx - hw * 0.82, y + h * 0.06, cx - hw * 0.6, y);
  ctx.lineTo(cx + hw * 0.6, y);
  ctx.quadraticCurveTo(cx + hw * 0.82, y + h * 0.06, cx + hw, y - h * 0.36);
  ctx.quadraticCurveTo(cx + hw * 0.5, y - h * 0.32, cx + hw * 0.3, y - h);
  ctx.lineTo(cx - hw * 0.3, y - h);
  ctx.quadraticCurveTo(cx - hw * 0.5, y - h * 0.32, cx - hw, y - h * 0.36);
  ctx.closePath();
}

function pagoda(ctx: Ctx, cx: number, base: number, w: number, tiers: number, th: number): void {
  let y = base;
  let tw = w;
  for (let i = 0; i < tiers; i++) {
    ctx.fillRect(cx - tw * 0.3, y - th, tw * 0.6, th);
    roofPath(ctx, cx, y - th * 0.62, tw, th * 0.58);
    ctx.fill();
    y -= th;
    tw *= 0.84;
  }
  ctx.fillRect(cx - 1.5, y - th * 1.1, 3, th * 1.1 + 2);
  ell(ctx, cx, y - th * 0.5, 3, 3);
  ctx.fill();
}

/** Calls draw at x and at its wrapped copies so a tiling layer has no seam. */
function wrapped(w: number, x: number, half: number, draw: (x: number) => void): void {
  draw(x);
  if (x - half < 0) draw(x + w);
  if (x + half > w) draw(x - w);
}

/** A hill line that tiles: `waves` whole sine waves across the width, plus a finer ripple. */
function ridge(
  ctx: Ctx,
  w: number,
  h: number,
  color: string,
  base: number,
  amp: number,
  waves: number,
  phase: number,
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w; x += 16) {
    const t = (x / w) * TAU;
    const y = 0.65 * Math.sin(t * waves + phase) + 0.35 * Math.sin(t * (waves * 2 + 1) + phase * 2);
    ctx.lineTo(x, h - base - amp * y);
  }
  ctx.lineTo(w, h);
  ctx.fill();
}

/**
 * Strings a sagging rope from pole to pole, the last one wrapping round to the first, and returns the points
 * along it where the scene hangs its swaying lights.
 */
function hang(ctx: Ctx, w: number, poles: readonly Anchor[], color: string): Anchor[] {
  const anchors: Anchor[] = [];
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  poles.forEach((a, i) => {
    const n = poles[(i + 1) % poles.length]!;
    const b = { x: i + 1 < poles.length ? n.x : n.x + w, y: n.y };
    const midY = Math.max(a.y, b.y) + 34 + (i % 3) * 8;
    for (const off of [0, -w]) {
      ctx.beginPath();
      ctx.moveTo(a.x + off, a.y);
      ctx.quadraticCurveTo((a.x + b.x) / 2 + off, midY, b.x + off, b.y);
      ctx.stroke();
    }
    const count = Math.max(1, Math.round((b.x - a.x) / 56) - 1);
    for (let k = 1; k <= count; k++) {
      const t = k / (count + 1);
      anchors.push({ x: q(t, a.x, (a.x + b.x) / 2, b.x) % w, y: q(t, a.y, midY, b.y) });
    }
  });
  return anchors;
}

function pole(ctx: Ctx, x: number, top: number, bottom: number, color: string): Anchor {
  ctx.fillStyle = color;
  ctx.fillRect(x - 1.5, top, 3, bottom - top);
  return { x, y: top };
}

// ─── Dumpling Alley: the lantern-lit night market ───

function marketFar(ctx: Ctx, w: number, h: number): void {
  const rnd = prng(9);
  ctx.fillStyle = '#4A2068';
  for (let x = 0; x < w; x += 46) {
    const bh = 30 + rnd() * 50;
    wrapped(w, x, 30, (bx) => {
      ctx.fillRect(bx - 22, h - bh, 44, bh);
      roofPath(ctx, bx, h - bh, 60, 12);
      ctx.fill();
    });
  }
  ctx.fillStyle = '#5A2A7A';
  wrapped(w, 110, 40, (x) => pagoda(ctx, x, h, 76, 5, 26));
  wrapped(w, 470, 40, (x) => pagoda(ctx, x, h, 70, 7, 24));
  wrapped(w, 820, 46, (x) => pagoda(ctx, x, h, 88, 4, 30));
  wrapped(w, 300, 90, (x) => {
    ctx.fillRect(x - 70, h - 60, 140, 60);
    roofPath(ctx, x, h - 58, 190, 34);
    ctx.fill();
    roofPath(ctx, x, h - 84, 120, 24);
    ctx.fill();
  });
  wrapped(w, 640, 30, (x) => {
    ctx.fillRect(x - 14, h - 150, 28, 150);
    ell(ctx, x, h - 150, 22, 16);
    ctx.fill();
    ctx.fillRect(x - 1.5, h - 190, 3, 30);
  });
  ctx.fillStyle = 'rgba(255,180,92,0.7)';
  for (let i = 0; i < 46; i++) ctx.fillRect(rnd() * w, h - 10 - rnd() * 120, 2.5, 3.5);
  fillGradient(ctx, 0, h - 70, w, 70, ['rgba(220,80,120,0)', 'rgba(230,90,120,0.45)']);
}

function marketMid(ctx: Ctx, w: number, h: number): Anchor[] {
  const rnd = prng(23);
  const poles: Anchor[] = [];
  for (let x = 10; x < w - 60;) {
    const bw = 110 + rnd() * 80;
    const bh = 80 + rnd() * 90;
    const lit = prng(Math.floor(rnd() * 1000));
    const top = h - bh;
    wrapped(w, x + bw / 2, bw / 2 + 20, (cx) => {
      const bx = cx - bw / 2;
      fillGradient(ctx, bx, top, bw, bh, ['#3A1A58', '#24103C']);
      for (let wy = top + 16; wy < h - 20; wy += 26) {
        for (let wx = bx + 12; wx < bx + bw - 20; wx += 24) {
          if (lit() < 0.45) continue;
          ctx.fillStyle = 'rgba(255,150,60,0.28)';
          roundRectPath(ctx, wx - 2.5, wy - 2.5, 16, 18, 5);
          ctx.fill();
          ctx.fillStyle = lit() < 0.3 ? '#FF8FB0' : '#FFB45C';
          roundRectPath(ctx, wx, wy, 11, 13, 3);
          ctx.fill();
          ctx.fillStyle = 'rgba(42,20,70,0.85)';
          ctx.fillRect(wx + 5, wy, 1.2, 13);
        }
      }
      roofPath(ctx, cx, top + 4, bw + 30, 26);
      ctx.fillStyle = vgrad(ctx, top - 22, top + 4, ['#4A2270', '#2C1446']);
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = 'rgba(230,110,170,0.75)';
      ctx.stroke();
      ctx.fillStyle = '#1C0C2E';
      ctx.fillRect(bx + bw * 0.15 - 1.5, top - 62, 3, 50);
    });
    poles.push({ x: x + bw * 0.15, y: top - 62 });
    x += bw + 12 + rnd() * 40;
  }
  return hang(ctx, w, poles, '#1A0A28');
}

// ─── Neon Row: towers, glowing signs and rain ───

const NEON = ['#38D6FF', '#FF4FA3', '#FFE14D', '#7CFFB2'] as const;

function neonFar(ctx: Ctx, w: number, h: number): void {
  const rnd = prng(31);
  for (const [color, base, extra] of [
    ['#2B3186', 90, 110],
    ['#1F2568', 46, 80],
  ] as const) {
    for (let x = 0; x < w;) {
      const bw = Math.min(34 + rnd() * 36, w - x);
      const bh = base + rnd() * extra;
      ctx.fillStyle = color;
      ctx.fillRect(x, h - bh, bw, bh);
      const top = rnd();
      if (top < 0.3) ctx.fillRect(x + bw / 2 - 1, h - bh - 26, 2, 26);
      else if (top < 0.6) ctx.fillRect(x + bw * 0.2, h - bh - 12, bw * 0.6, 12);
      for (let wy = h - bh + 8; wy < h - 12; wy += 12) {
        for (let wx = x + 5; wx < x + bw - 6; wx += 9) {
          const r = rnd();
          if (r > 0.2) continue;
          ctx.fillStyle = r < 0.12 ? 'rgba(120,220,255,0.6)' : 'rgba(255,130,200,0.6)';
          ctx.fillRect(wx, wy, 3, 4);
        }
      }
      x += bw + (rnd() < 0.4 ? 0 : 6 + rnd() * 12);
    }
  }
  fillGradient(ctx, 0, h - 90, w, 90, ['rgba(200,70,170,0)', 'rgba(210,80,170,0.45)']);
}

/** Strokes the current path as a neon tube: a wide dim line under a bright thin one. */
function neon(ctx: Ctx, color: string): void {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = rgba(color, 0.25);
  ctx.lineWidth = 7;
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.4;
  ctx.stroke();
}

function neonMid(ctx: Ctx, w: number, h: number): Anchor[] {
  const rnd = prng(47);
  const poles: Anchor[] = [];
  for (let x = 0, i = 0; x < w; i++) {
    let bw = 100 + rnd() * 70;
    if (x + bw > w - 50) bw = w - x;
    const bh = 100 + rnd() * 90;
    const top = h - bh;
    fillGradient(ctx, x, top, bw, bh, ['#171D4E', '#0C1030']);
    ctx.fillStyle = 'rgba(130,160,255,0.2)';
    ctx.fillRect(x, top, bw, 2);
    ctx.fillRect(x, top, 2, bh);
    for (let wy = top + 16; wy < h - 84; wy += 22) {
      for (let wx = x + 12; wx < x + bw - 34; wx += 18) {
        const r = rnd();
        if (r < 0.5) continue;
        ctx.fillStyle =
          r < 0.72
            ? 'rgba(90,200,255,0.5)'
            : r < 0.9
              ? 'rgba(255,110,190,0.5)'
              : 'rgba(255,214,130,0.7)';
        ctx.fillRect(wx, wy, 8, 10);
      }
    }
    const color = NEON[i % NEON.length]!;
    if (i % 2 === 0) {
      // a blade sign down the side: three lit squares stand in for characters
      const sh = Math.min(76, bh - 96);
      roundRectPath(ctx, x + bw - 26, top + 14, 18, sh, 4);
      ctx.fillStyle = '#080A22';
      ctx.fill();
      neon(ctx, color);
      ctx.fillStyle = color;
      for (let k = 0; k < 3; k++) ctx.fillRect(x + bw - 21, top + 22 + (k * (sh - 22)) / 3, 8, 8);
      // water tank
      ctx.fillStyle = '#0C1030';
      ctx.fillRect(x + bw * 0.3 - 13, top - 24, 26, 18);
      ell(ctx, x + bw * 0.3, top - 24, 13, 5);
      ctx.fill();
      ctx.fillRect(x + bw * 0.3 - 11, top - 7, 2.5, 7);
      ctx.fillRect(x + bw * 0.3 + 8.5, top - 7, 2.5, 7);
    } else {
      // a billboard on the roof with a picture sign
      const cx = x + bw * 0.58;
      ctx.fillStyle = '#0C1030';
      ctx.fillRect(cx - 24, top - 8, 3, 8);
      ctx.fillRect(cx + 21, top - 8, 3, 8);
      roundRectPath(ctx, cx - 34, top - 38, 68, 30, 5);
      ctx.fillStyle = '#080A22';
      ctx.fill();
      neon(ctx, color);
      ctx.beginPath();
      if (i % 4 === 1) {
        // noodle bowl
        ctx.moveTo(cx - 13, top - 26);
        ctx.quadraticCurveTo(cx, top - 6, cx + 13, top - 26);
        ctx.closePath();
      } else {
        // fish
        ctx.ellipse(cx - 3, top - 23, 11, 6, 0, 0, TAU);
        ctx.moveTo(cx + 8, top - 23);
        ctx.lineTo(cx + 16, top - 29);
        ctx.lineTo(cx + 16, top - 17);
        ctx.closePath();
      }
      neon(ctx, NEON[(i + 1) % NEON.length]!);
    }
    poles.push(pole(ctx, x + bw * 0.14, top - 46, top, '#0C1030'));
    x += bw + (rnd() < 0.5 ? 0 : 8 + rnd() * 14);
  }
  // shopfronts along the bottom: dark and calm, since the running happens in front of them
  fillGradient(ctx, 0, h - 72, w, 72, ['#0D1134', '#070920']);
  ctx.fillStyle = 'rgba(255,79,163,0.55)';
  ctx.fillRect(0, h - 72, w, 2);
  ctx.fillStyle = 'rgba(255,190,120,0.2)';
  for (let x = 12; x < w; x += 64) {
    roundRectPath(ctx, x, h - 58, 40, 30, 4);
    ctx.fill();
  }
  return hang(ctx, w, poles, '#05071A');
}

// ─── Crane Harbour at dawn: boats, cranes and warehouses ───

function junk(ctx: Ctx, x: number, y: number, s: number): void {
  ctx.beginPath();
  ctx.moveTo(x - 30 * s, y - 8 * s);
  ctx.quadraticCurveTo(x, y + 4 * s, x + 34 * s, y - 12 * s);
  ctx.lineTo(x + 26 * s, y);
  ctx.lineTo(x - 22 * s, y);
  ctx.closePath();
  ctx.fill();
  for (const [mx, mh, mw] of [
    [-10, 46, 26],
    [12, 34, 20],
  ] as const) {
    ctx.fillRect(x + mx * s - 1, y - (mh + 10) * s, 2, mh * s);
    ctx.beginPath();
    ctx.moveTo(x + (mx - mw * 0.5) * s, y - 14 * s);
    ctx.quadraticCurveTo(
      x + (mx - mw * 0.7) * s,
      y - mh * 0.6 * s,
      x + (mx - mw * 0.3) * s,
      y - (mh + 8) * s,
    );
    ctx.lineTo(x + (mx + mw * 0.5) * s, y - (mh + 2) * s);
    ctx.lineTo(x + (mx + mw * 0.6) * s, y - 16 * s);
    ctx.closePath();
    ctx.fill();
  }
}

function gantry(ctx: Ctx, x: number, base: number, s: number): void {
  ctx.lineWidth = 4 * s;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - 24 * s, base);
  ctx.lineTo(x - 9 * s, base - 92 * s);
  ctx.moveTo(x + 24 * s, base);
  ctx.lineTo(x + 9 * s, base - 92 * s);
  ctx.moveTo(x - 17 * s, base - 44 * s);
  ctx.lineTo(x + 17 * s, base - 44 * s);
  ctx.moveTo(x - 46 * s, base - 96 * s);
  ctx.lineTo(x + 78 * s, base - 110 * s);
  ctx.moveTo(x, base - 132 * s);
  ctx.lineTo(x - 46 * s, base - 96 * s);
  ctx.moveTo(x, base - 132 * s);
  ctx.lineTo(x + 78 * s, base - 110 * s);
  ctx.moveTo(x, base - 132 * s);
  ctx.lineTo(x, base - 96 * s);
  ctx.stroke();
  ctx.fillRect(x - 12 * s, base - 104 * s, 24 * s, 14 * s);
}

function harbourFar(ctx: Ctx, w: number, h: number): void {
  const rnd = prng(71);
  ridge(ctx, w, h, '#9A93D2', 84, 16, 2, 0.6);
  fillGradient(ctx, 0, h - 66, w, 66, ['#A39BD6', '#7682C4']);
  ctx.fillStyle = 'rgba(255,236,200,0.5)';
  for (let i = 0; i < 46; i++) {
    const y = h - 60 + rnd() * 52;
    ctx.fillRect(rnd() * (w - 30), y, 8 + rnd() * 20, 1.6);
  }
  ctx.fillStyle = '#6E67B2';
  ctx.strokeStyle = '#6E67B2';
  gantry(ctx, 250, h - 62, 0.9);
  gantry(ctx, 640, h - 62, 1.1);
  ctx.fillStyle = '#5F58A6';
  junk(ctx, 120, h - 34, 1);
  junk(ctx, 450, h - 46, 0.7);
  junk(ctx, 830, h - 28, 1.2);
}

const CONTAINERS = ['#2F6C7A', '#9C4A3C', '#A9803A', '#46569A'] as const;

function harbourMid(ctx: Ctx, w: number, h: number): Anchor[] {
  const rnd = prng(61);
  const poles: Anchor[] = [];
  const base = h - 34;
  const stack = (x: number, cols: number, minRows: number, i: number) => {
    for (let c = 0; c < cols; c++) {
      const rows = minRows + Math.floor(rnd() * 3);
      for (let r = 0; r < rows; r++) {
        const cx = x + c * 64;
        const cy = base - (r + 1) * 28;
        ctx.fillStyle = CONTAINERS[(i + c + r * 3) % CONTAINERS.length]!;
        ctx.fillRect(cx, cy, 62, 27);
        ctx.fillStyle = 'rgba(20,10,50,0.22)';
        for (let rx = cx + 6; rx < cx + 58; rx += 8) ctx.fillRect(rx, cy + 3, 2.5, 21);
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        ctx.fillRect(cx, cy, 62, 2);
      }
    }
  };
  for (let x = 0, i = 0; x < w; i++) {
    const kind = i % 3 === 2 && x > w - 220 ? 0 : i % 3;
    if (kind === 0) {
      // warehouse with a saw-tooth roof
      let bw = 170 + rnd() * 40;
      if (x + bw > w - 70) bw = w - x;
      const bh = 100 + rnd() * 26;
      const top = h - bh;
      fillGradient(ctx, x, top, bw, bh, ['#56488C', '#3A2F66']);
      const teeth = Math.max(2, Math.round(bw / 60));
      const tw = bw / teeth;
      for (let t = 0; t < teeth; t++) {
        ctx.fillStyle = '#483C7C';
        ctx.beginPath();
        ctx.moveTo(x + t * tw, top + 1);
        ctx.lineTo(x + t * tw, top - 26);
        ctx.lineTo(x + (t + 1) * tw, top + 1);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,214,150,0.55)';
        ctx.fillRect(x + t * tw + 2, top - 20, 3, 18);
      }
      ctx.fillStyle = 'rgba(255,206,140,0.7)';
      for (let wx = x + 14; wx < x + bw - 20; wx += 26) ctx.fillRect(wx, top + 18, 12, 9);
      ctx.fillStyle = '#2A2250';
      roundRectPath(ctx, x + bw / 2 - 24, base - 48, 48, 48, 4);
      ctx.fill();
      poles.push(pole(ctx, x + 10, top - 60, top, '#2A2250'));
      x += bw + 6;
    } else if (kind === 1) {
      const cols = Math.min(2 + (rnd() < 0.5 ? 1 : 0), Math.max(1, Math.floor((w - x) / 64)));
      stack(x, cols, 2, i);
      x += cols * 64 + 6;
    } else {
      // dockside crane over a low row of containers
      stack(x, 1, 2, i);
      const cx = x + 32;
      ctx.strokeStyle = '#2A2250';
      ctx.fillStyle = '#2A2250';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - 11, base);
      ctx.lineTo(cx - 11, base - 196);
      ctx.moveTo(cx + 11, base);
      ctx.lineTo(cx + 11, base - 196);
      ctx.moveTo(cx - 30, base - 190);
      ctx.lineTo(cx + 124, base - 204);
      ctx.moveTo(cx, base - 226);
      ctx.lineTo(cx + 124, base - 204);
      ctx.moveTo(cx, base - 226);
      ctx.lineTo(cx - 30, base - 190);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let y = base - 24; y > base - 190; y -= 44) {
        ctx.moveTo(cx - 11, y);
        ctx.lineTo(cx + 11, y - 22);
        ctx.lineTo(cx - 11, y - 44);
      }
      ctx.moveTo(cx + 96, base - 201);
      ctx.lineTo(cx + 96, base - 150);
      ctx.stroke();
      ctx.fillRect(cx - 16, base - 214, 32, 22);
      ctx.fillRect(cx + 90, base - 152, 12, 9);
      ctx.fillStyle = '#FF6A5A';
      ell(ctx, cx, base - 228, 3, 3);
      ctx.fill();
      poles.push({ x: cx + 60, y: base - 198 });
      x += 70;
    }
  }
  // the quay
  fillGradient(ctx, 0, base, w, 34, ['#32295E', '#241D48']);
  ctx.fillStyle = 'rgba(255,220,170,0.3)';
  ctx.fillRect(0, base, w, 2);
  ctx.fillStyle = '#241D48';
  for (let x = 30; x < w; x += 96) {
    roundRectPath(ctx, x, base - 9, 12, 11, 3);
    ctx.fill();
  }
  return hang(ctx, w, poles, '#2A2250');
}

// ─── Temple Gardens at sunrise: misty hills, halls and blossom ───

function templeFar(ctx: Ctx, w: number, h: number): void {
  ridge(ctx, w, h, '#B4CDEA', 128, 46, 2, 0.4);
  ridge(ctx, w, h, '#9DBBE0', 84, 34, 3, 2.1);
  ctx.fillStyle = '#8FAEDA';
  pagoda(ctx, 610, h - 92, 46, 4, 17);
  pagoda(ctx, 140, h - 74, 34, 3, 15);
  ridge(ctx, w, h, '#86A8D6', 44, 22, 4, 4);
  fillGradient(ctx, 0, h - 84, w, 84, ['rgba(255,244,224,0)', 'rgba(255,240,214,0.65)']);
}

function tree(ctx: Ctx, cx: number, cy: number, r: number, dark: string, light: string): void {
  ctx.fillStyle = dark;
  for (const [dx, dy, k] of [
    [-0.55, 0.25, 0.7],
    [0.55, 0.25, 0.7],
    [0, -0.15, 0.85],
  ] as const) {
    ell(ctx, cx + dx * r, cy + dy * r, k * r, k * r);
    ctx.fill();
  }
  ctx.fillStyle = light;
  ell(ctx, cx - r * 0.22, cy - r * 0.38, r * 0.42, r * 0.34);
  ctx.fill();
  ell(ctx, cx + r * 0.5, cy + r * 0.1, r * 0.26, r * 0.2);
  ctx.fill();
}

function templeMid(ctx: Ctx, w: number, h: number): Anchor[] {
  const rnd = prng(83);
  const poles: Anchor[] = [];
  // a deep green tree line: the calm band the running happens in front of
  for (let x = 0; x < w; x += 46) {
    const r = 30 + rnd() * 14;
    const cy = h - 62 - rnd() * 28;
    wrapped(w, x + rnd() * 10, r * 1.3, (cx) => tree(ctx, cx, cy, r, '#2A6149', '#3A7E5E'));
  }
  ctx.fillStyle = '#2A6149';
  ctx.fillRect(0, h - 64, w, 64);
  for (const [cx, bw, bh] of [
    [170, 170, 76],
    [520, 210, 92],
    [820, 150, 70],
  ] as const) {
    const top = h - 30 - bh;
    const x = cx - bw / 2;
    fillGradient(ctx, x, top, bw, bh, ['#7C2A38', '#561A26']);
    ctx.fillStyle = 'rgba(255,206,130,0.6)';
    for (let wx = x + 20; wx < x + bw - 26; wx += 30) ctx.fillRect(wx, top + 22, 14, 20);
    ctx.fillStyle = '#461420';
    for (let px = x + 6; px < x + bw; px += 30) ctx.fillRect(px, top, 5, bh);
    // upper storey, then the two roofs
    ctx.fillStyle = '#6A2230';
    ctx.fillRect(cx - bw * 0.26, top - 42, bw * 0.52, 26);
    for (const [ry, rw, rh] of [
      [top + 4, bw + 46, 30],
      [top - 38, bw * 0.74, 24],
    ] as const) {
      roofPath(ctx, cx, ry, rw, rh);
      ctx.fillStyle = vgrad(ctx, ry - rh, ry, ['#3A6072', '#213A48']);
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = 'rgba(255,205,110,0.75)';
      ctx.stroke();
    }
    poles.push(pole(ctx, x + 4, top - 74, top - 10, '#3A2430'));
  }
  // blossom trees in front of the halls
  for (const [cx, r] of [
    [40, 34],
    [345, 40],
    [680, 36],
    [935, 30],
  ] as const) {
    wrapped(w, cx, r * 1.3, (x) => {
      ctx.fillStyle = '#5A3A2E';
      ctx.fillRect(x - 3, h - 70, 6, 46);
      tree(ctx, x, h - 92, r, '#E486AC', '#F6B6CF');
    });
  }
  // clipped hedge along the bottom
  ridge(ctx, w, h, '#1F4A3A', 38, 5, 24, 0);
  return hang(ctx, w, poles, '#3A2430');
}

// ─── the route ───

export const THEMES: readonly Theme[] = [
  {
    sky: [
      [-400, '#0E0628'],
      [0, '#1A0B3B'],
      [115, '#3D1766'],
      [230, '#7E2585'],
      [345, '#D84A7A'],
      [460, '#FF934F'],
    ],
    stars: 0.9,
    orb: { kind: 'moon', x: 740, y: 118, scale: 1, alpha: 1 },
    cloud: { tint: 0xb04f9c, alpha: 0.95 },
    far: marketFar,
    mid: marketMid,
    lantern: '#FF4B4B',
    roof: {
      tile: ['#16514F', '#3FAE9A', '#2A8C7E', '#123F40'],
      pan: ['#0B2A30', '#123E44'],
      base: '#0A1C26',
      beam: ['#7FF0D4', '#2FA592', '#16605E'],
      trim: 'rgba(255,214,120,0.85)',
      stud: GOLD,
      wall: ['#16343E', '#070E16'],
      windowGlow: 'rgba(255,190,110,0.4)',
    },
    ambient: 'embers',
  },
  {
    sky: [
      [-400, '#04081A'],
      [0, '#0A1230'],
      [200, '#1B1D5A'],
      [340, '#3B2A86'],
      [460, '#C2409A'],
    ],
    stars: 0.35,
    orb: { kind: 'moon', x: 210, y: 96, scale: 0.6, alpha: 0.75 },
    cloud: { tint: 0x3a4286, alpha: 0.95 },
    far: neonFar,
    mid: neonMid,
    lantern: '#38D6FF',
    roof: {
      tile: ['#1C2458', '#5466D0', '#3A49A8', '#141A40'],
      pan: ['#0C1030', '#161C4A'],
      base: '#080A22',
      beam: ['#FF9AD8', '#E0409A', '#7A1E60'],
      trim: 'rgba(130,232,255,0.95)',
      stud: '#7CE8FF',
      wall: ['#161C4C', '#060818'],
      windowGlow: 'rgba(120,220,255,0.35)',
    },
    ambient: 'rain',
  },
  {
    sky: [
      [-400, '#34478A'],
      [0, '#5B6FB0'],
      [180, '#9C8CC4'],
      [320, '#F0A0A0'],
      [460, '#FFD08A'],
    ],
    stars: 0.12,
    orb: { kind: 'sun', x: 700, y: 372, scale: 1, alpha: 1 },
    cloud: { tint: 0xffc2b4, alpha: 0.9 },
    far: harbourFar,
    mid: harbourMid,
    lantern: '#FFE9A8',
    roof: {
      ribbed: true,
      tile: ['#7A3324', '#E58A5A', '#C2603A', '#5E2618'],
      pan: ['#4A1C14', '#6E2E20'],
      base: '#3A1610',
      beam: ['#FFE2B0', '#E0A860', '#8A5A28'],
      trim: 'rgba(255,244,214,0.85)',
      stud: '#FFF4D0',
      wall: ['#4E2A44', '#160C1E'],
      windowGlow: 'rgba(255,214,150,0.4)',
    },
    ambient: 'birds',
  },
  {
    sky: [
      [-400, '#3476BC'],
      [0, '#6FA8DC'],
      [170, '#A8D0E8'],
      [320, '#FFE2A8'],
      [460, '#FFB870'],
    ],
    stars: 0,
    orb: { kind: 'sun', x: 250, y: 150, scale: 0.7, alpha: 1 },
    cloud: { tint: 0xfff4e0, alpha: 0.95 },
    far: templeFar,
    mid: templeMid,
    lantern: '#FFC83D',
    roof: {
      tile: ['#2E4A54', '#8CC4BC', '#5E9C96', '#22383E'],
      pan: ['#1A2E36', '#284650'],
      base: '#14222A',
      beam: ['#FF9478', '#E2483C', '#8E1F24'],
      trim: 'rgba(255,214,120,0.9)',
      stud: GOLD,
      wall: ['#5E202C', '#180A10'],
      windowGlow: 'rgba(255,200,120,0.4)',
    },
    ambient: 'petals',
  },
];

// ─── textures the districts share ───

/** One column of sky from y0 down to y1 (design y); the scene stretches it across the view. */
export function drawSky(ctx: Ctx, w: number, h: number, theme: Theme, y0: number): void {
  const first = theme.sky[0]![0];
  const last = theme.sky[theme.sky.length - 1]![0];
  const g = ctx.createLinearGradient(0, first - y0, 0, last - y0);
  for (const [y, color] of theme.sky) g.addColorStop((y - first) / (last - first), color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

export function drawStars(ctx: Ctx, w: number, h: number): void {
  sprinkle(ctx, 4, 4, w - 8, h - 8, 120, '#FFF6EA', 41, [0.6, 1.7]);
}

/** The moon with its halo (260 × 260, disc radius 60). */
export function drawMoon(ctx: Ctx, w: number): void {
  const c = w / 2;
  const halo = ctx.createRadialGradient(c, c, 50, c, c, c);
  halo.addColorStop(0, 'rgba(255,236,200,0.34)');
  halo.addColorStop(1, 'rgba(255,236,200,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, w, w);
  ell(ctx, c, c, 60, 60);
  const m = ctx.createRadialGradient(c - 18, c - 20, 6, c, c, 60);
  m.addColorStop(0, '#FFFEF6');
  m.addColorStop(0.7, '#FFEFC9');
  m.addColorStop(1, '#F6D49A');
  ctx.fillStyle = m;
  ctx.fill();
  ctx.fillStyle = 'rgba(226,186,130,0.45)';
  for (const [x, y, r] of [
    [18, -20, 11],
    [-18, 18, 8],
    [30, 22, 6],
    [-10, -26, 5],
  ] as const) {
    ell(ctx, c + x, c + y, r, r);
    ctx.fill();
  }
}

/** A soft sun with a wide glow (360 × 360, disc radius 66). */
export function drawSun(ctx: Ctx, w: number): void {
  const c = w / 2;
  const halo = ctx.createRadialGradient(c, c, 40, c, c, c);
  halo.addColorStop(0, 'rgba(255,240,190,0.6)');
  halo.addColorStop(0.45, 'rgba(255,214,150,0.22)');
  halo.addColorStop(1, 'rgba(255,214,150,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, w, w);
  ell(ctx, c, c, 66, 66);
  const s = ctx.createRadialGradient(c, c - 10, 10, c, c, 66);
  s.addColorStop(0, '#FFFDF0');
  s.addColorStop(1, '#FFE6A6');
  ctx.fillStyle = s;
  ctx.fill();
}

/** A puffy flat-bottomed cloud in near-white; the scene tints it per district. */
export function drawCloud(ctx: Ctx, w: number, h: number): void {
  const base = h * 0.74;
  const n = 9;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, base + 4);
  ctx.clip();
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const edge = Math.sin((i / n) * Math.PI);
    const r = h * (0.2 + 0.26 * edge * (0.6 + 0.4 * Math.sin(i * 2.3) ** 2));
    const x = h * 0.36 + (i * (w - h * 0.72)) / n;
    ctx.moveTo(x + r, base - r * 0.5);
    ctx.arc(x, base - r * 0.5, r, 0, TAU);
  }
  ctx.fillStyle = vgrad(ctx, base - h * 0.6, base + 4, ['#FFFFFF', '#B8B0C4']);
  ctx.fill();
  ctx.restore();
  roundRectPath(ctx, h * 0.16, base - h * 0.14, w - h * 0.32, h * 0.26, h * 0.13);
  ctx.fillStyle = '#B8B0C4';
  ctx.fill();
}

/** A paper lantern with its glow (30 × 42; the string's top is at (15, 0)). */
export function drawLantern(ctx: Ctx, color: string): void {
  const g = ctx.createRadialGradient(15, 20, 2, 15, 20, 15);
  g.addColorStop(0, rgba(color, 0.5));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 5, 30, 30);
  ctx.fillStyle = '#2A1424';
  ctx.fillRect(14.3, 0, 1.4, 9);
  ell(ctx, 15, 20, 8.5, 8.8);
  const body = ctx.createRadialGradient(13, 17, 1, 15, 20, 9);
  body.addColorStop(0, '#FFF8DC');
  body.addColorStop(0.5, color);
  body.addColorStop(1, rgba(INK, 0.9));
  fillStroke(ctx, body, 1.3);
  ctx.strokeStyle = 'rgba(43,22,56,0.4)';
  ctx.lineWidth = 0.8;
  for (const rx of [3.5, 6.5]) {
    ell(ctx, 15, 20, rx, 8.6);
    ctx.stroke();
  }
  ctx.fillStyle = GOLD;
  ctx.fillRect(11, 9.5, 8, 3);
  ctx.fillRect(11, 27.5, 8, 3);
  ctx.fillStyle = '#FF9F1C';
  ctx.fillRect(14, 30, 2, 8);
}

/** How far down the tiles run before the eave. */
const EAVE = 150;

/**
 * The running surface and what is under it (240 wide, tiles horizontally): a ridge beam with studs, courses of
 * tiles down to the eave, then the building's wall fading into shadow. Only the top 90 px show in a 16:9 view;
 * taller views see further down.
 */
export function drawRoof(ctx: Ctx, w: number, h: number, k: RoofLook): void {
  ctx.fillStyle = k.base;
  ctx.fillRect(0, 0, w, h);
  if (k.ribbed) {
    for (let x = 0; x < w; x += 12) fillGradient(ctx, x, 14, 12, EAVE - 14, k.tile, 'h');
    ctx.fillStyle = 'rgba(20,6,10,0.3)';
    for (let y = 50; y < EAVE; y += 38) ctx.fillRect(0, y, w, 2);
  } else {
    for (let x = 0; x < w; x += 24) {
      fillGradient(ctx, x, 14, 24, EAVE - 14, [k.pan[0], k.pan[1], k.pan[0]], 'h');
      const cx = x + 12;
      const g = ctx.createLinearGradient(cx - 9.5, 0, cx + 9.5, 0);
      k.tile.forEach((c, i) => g.addColorStop(i / 3, c));
      for (let y = EAVE - 7; y > 4; y -= 19) {
        ctx.beginPath();
        ctx.moveTo(cx - 9.5, y);
        ctx.lineTo(cx - 9.5, y - 17);
        ctx.arc(cx, y - 17, 9.5, Math.PI, 0);
        ctx.lineTo(cx + 9.5, y);
        ctx.arc(cx, y, 9.5, 0, Math.PI);
        ctx.closePath();
        ctx.fillStyle = g;
        ctx.fill();
        ctx.lineWidth = 1.3;
        ctx.strokeStyle = k.base;
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.fillRect(cx - 5, y - 20, 1.6, 14);
      }
    }
  }
  fillGradient(ctx, 0, 16, w, EAVE - 16, ['rgba(8,4,24,0)', 'rgba(8,4,24,0.6)']);
  // ridge beam
  fillGradient(ctx, 0, 0, w, 14, k.beam);
  ctx.fillStyle = k.trim;
  ctx.fillRect(0, 0, w, 2);
  ctx.fillStyle = k.base;
  ctx.fillRect(0, 14, w, 2);
  for (let x = 30; x < w; x += 60)
    glossyCircle(ctx, x, 7.5, 3.4, k.stud, { shadow: false, outline: rgba(INK, 0.7) });
  // eave, then the wall below it
  fillGradient(ctx, 0, EAVE, w, h - EAVE, [
    [0, k.wall[0]],
    [0.5, k.wall[1]],
    [1, k.wall[1]],
  ]);
  for (const cx of [60, 180]) {
    roundRectPath(ctx, cx - 30, EAVE + 60, 60, 46, 6);
    ctx.fillStyle = k.windowGlow;
    ctx.fill();
    ctx.fillStyle = k.wall[1];
    ctx.fillRect(cx - 1.5, EAVE + 60, 3, 46);
    ctx.fillRect(cx - 30, EAVE + 81.5, 60, 3);
  }
  ctx.fillStyle = 'rgba(8,4,24,0.35)';
  for (const px of [0, 120]) ctx.fillRect(px - 7, EAVE, 14, h - EAVE);
  ctx.fillRect(w - 7, EAVE, 7, h - EAVE);
  fillGradient(ctx, 0, EAVE, w, 44, ['rgba(8,4,24,0.7)', 'rgba(8,4,24,0)']);
  fillGradient(ctx, 0, EAVE - 3, w, 12, [k.beam[1], k.beam[2]]);
  for (let x = 12; x < w; x += 24)
    glossyCircle(ctx, x, EAVE + 3, 7, k.tile[2], { shadow: false, outline: k.base });
}

/** The gate that marks a district's edge (240 × 320): lacquer posts, a tiled roof and a gold plaque. */
export function drawGate(ctx: Ctx, w: number, h: number): void {
  const cx = w / 2;
  for (const x of [38, w - 38]) {
    roundRectPath(ctx, x - 9, 70, 18, h - 70, 3);
    fillStroke(ctx, vgrad(ctx, 70, h, ['#B8323E', '#7E1C2C']), 2.4);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(x - 5.5, 74, 3, h - 78);
  }
  for (const y of [78, 112]) {
    roundRectPath(ctx, 14, y, w - 28, 13, 3);
    fillStroke(ctx, vgrad(ctx, y, y + 13, ['#C23A44', '#8A2030']), 2.4);
  }
  roundRectPath(ctx, cx - 34, 84, 68, 36, 5);
  fillStroke(ctx, '#3A1E2E', 2.4);
  roundRectPath(ctx, cx - 29, 89, 58, 26, 3);
  ctx.lineWidth = 2;
  ctx.strokeStyle = GOLD;
  ctx.stroke();
  // a little gold bun on the plaque
  ctx.beginPath();
  ctx.moveTo(cx - 11, 110);
  ctx.quadraticCurveTo(cx - 12, 94, cx, 94);
  ctx.quadraticCurveTo(cx + 12, 94, cx + 11, 110);
  ctx.closePath();
  ctx.fillStyle = GOLD;
  ctx.fill();
  for (const [y, rw, rh] of [
    [70, w - 4, 40],
    [34, w * 0.62, 28],
  ] as const) {
    roofPath(ctx, cx, y, rw, rh);
    fillStroke(ctx, vgrad(ctx, y - rh, y, ['#3F7A84', '#1E3F4C']), 2.4);
  }
  ctx.fillStyle = '#7E1C2C';
  ctx.fillRect(cx - 30, 40, 60, 8);
  for (const x of [70, w - 70]) {
    ctx.fillStyle = '#2A1424';
    ctx.fillRect(x - 0.8, 125, 1.6, 12);
    ell(ctx, x, 148, 10, 11.5);
    fillStroke(ctx, '#E8453E', 1.8);
    ctx.fillStyle = GOLD;
    ctx.fillRect(x - 5, 135, 10, 3);
    ctx.fillRect(x - 5, 158, 10, 3);
  }
}

/** A slanted streak of rain (10 × 30). */
export function drawRain(ctx: Ctx): void {
  ctx.strokeStyle = 'rgba(170,214,255,0.9)';
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(8.5, 1.5);
  ctx.lineTo(1.5, 28.5);
  ctx.stroke();
}

/** A distant gull (30 × 16); `up` picks the wing position. */
export function drawBird(ctx: Ctx, up: boolean): void {
  ctx.strokeStyle = '#4A4580';
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(2, up ? 3 : 10);
  ctx.quadraticCurveTo(9, up ? 3 : 6, 15, 9);
  ctx.quadraticCurveTo(21, up ? 3 : 6, 28, up ? 3 : 10);
  ctx.stroke();
}

/** A blossom petal (12 × 9). */
export function drawPetal(ctx: Ctx): void {
  ctx.beginPath();
  ctx.moveTo(1, 4.5);
  ctx.quadraticCurveTo(5, -1, 11, 3.5);
  ctx.quadraticCurveTo(6, 9.5, 1, 4.5);
  ctx.fillStyle = '#FFC2D8';
  ctx.fill();
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = '#E486AC';
  ctx.stroke();
}

/** The district call-out's backing pill. */
export function drawBanner(ctx: Ctx, w: number, h: number): void {
  roundRectPath(ctx, 2, 2, w - 4, h - 4, (h - 4) / 2);
  ctx.fillStyle = 'rgba(24,10,44,0.86)';
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = GOLD;
  ctx.stroke();
  ctx.fillStyle = GOLD;
  for (const x of [26, w - 26]) {
    ctx.beginPath();
    ctx.moveTo(x, h / 2 - 7);
    ctx.lineTo(x + 7, h / 2);
    ctx.lineTo(x, h / 2 + 7);
    ctx.lineTo(x - 7, h / 2);
    ctx.closePath();
    ctx.fill();
  }
}
