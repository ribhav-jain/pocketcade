// Bao Bolt's art: Bao, Gulp, the obstacles, coins and the interface pieces. Plain Canvas 2D, drawn once per mount
// by the scene. The districts' scenery is in themes.ts.
import { font, glossyCircle, roundRectPath, starPath } from '@pocketcade/toolkit';

export type Ctx = CanvasRenderingContext2D;

export const INK = '#2B1638';
const CREAM = '#FFF4E0';
const CRUST = '#E8C394';
const RED_DARK = '#8E1530';
export const GOLD = '#FFC83D';
const TAU = Math.PI * 2;

/** Bao's standing canvas (design px) and where his feet and bandana knot sit in it. */
export const BAO = { w: 64, h: 64, feetY: 58, knot: { x: 5, y: 32 } } as const;
/** The slide pose canvas: bun centre x, bottom y and knot. */
export const SLIDE_POSE = { w: 88, h: 44, cx: 40, bottom: 40, knot: { x: 6, y: 26 } } as const;
export const TAILS = { w: 36, h: 22, kx: 34, ky: 8 } as const;
export const GULP = { w: 120, h: 90 } as const;
export const SIGN_H = 68;
export type Face = 'run' | 'joy' | 'blink' | 'yikes' | 'dizzy' | 'sad' | 'grit';
export const FACES: readonly Face[] = ['run', 'joy', 'blink', 'yikes', 'dizzy', 'sad'];

export const ell = (ctx: Ctx, x: number, y: number, rx: number, ry: number, rot = 0) => {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
};

/** Strokes the current path as a cartoon line: a dark outline with the colour on top. */
function inkLine(ctx: Ctx, color: string, w: number): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = w + 3;
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.stroke();
}

export function fillStroke(ctx: Ctx, fill: string | CanvasGradient, lw = 2, stroke = INK): void {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

/** Evenly spaced colour stops on a gradient. */
const spread = (g: CanvasGradient, stops: readonly string[]) => {
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  return g;
};
export const vgrad = (ctx: Ctx, y0: number, y1: number, stops: readonly string[]) =>
  spread(ctx.createLinearGradient(0, y0, 0, y1), stops);
export const hgrad = (ctx: Ctx, x0: number, x1: number, stops: readonly string[]) =>
  spread(ctx.createLinearGradient(x0, 0, x1, 0), stops);
/** A point on a quadratic curve through a, control b, c. */
export const q = (t: number, a: number, b: number, c: number) =>
  (1 - t) * (1 - t) * a + 2 * t * (1 - t) * b + t * t * c;

// ─── Bao ───

interface Bun {
  cx: number;
  top: number;
  w: number;
  bottom: number;
}

function bunPath(ctx: Ctx, b: Bun): void {
  const l = b.cx - b.w / 2;
  const r = b.cx + b.w / 2;
  const h = b.bottom - b.top;
  ctx.beginPath();
  ctx.moveTo(l + 2, b.bottom - h * 0.14);
  ctx.bezierCurveTo(l - 2, b.bottom - h * 0.52, b.cx - b.w * 0.36, b.top, b.cx, b.top);
  ctx.bezierCurveTo(
    b.cx + b.w * 0.36,
    b.top,
    r + 2,
    b.bottom - h * 0.52,
    r - 2,
    b.bottom - h * 0.14,
  );
  ctx.quadraticCurveTo(r - 3, b.bottom, r - h * 0.25, b.bottom);
  ctx.lineTo(l + h * 0.25, b.bottom);
  ctx.quadraticCurveTo(l + 3, b.bottom, l + 2, b.bottom - h * 0.14);
  ctx.closePath();
}

/** The bun: soft cream dome, pleats, red polka-dot bandana, knot, cowlick swirl and gloss. */
function drawBun(ctx: Ctx, b: Bun, knot: { x: number; y: number }, swirl: boolean): void {
  const h = b.bottom - b.top;
  const l = b.cx - b.w / 2;
  const r = b.cx + b.w / 2;
  ctx.save();
  ctx.shadowColor = 'rgba(20,6,40,0.35)';
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 1.5;
  bunPath(ctx, b);
  const g = ctx.createRadialGradient(
    b.cx - b.w * 0.16,
    b.top + h * 0.34,
    2,
    b.cx,
    b.top + h * 0.55,
    b.w * 0.64,
  );
  g.addColorStop(0, '#FFFFFF');
  g.addColorStop(0.5, CREAM);
  g.addColorStop(1, CRUST);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  ctx.save();
  bunPath(ctx, b);
  ctx.clip();
  ctx.fillStyle = vgrad(ctx, b.bottom - h * 0.32, b.bottom, [
    'rgba(214,150,90,0)',
    'rgba(214,140,80,0.5)',
  ]);
  ctx.fillRect(l - 4, b.top, b.w + 8, h + 2);
  // pleats twisting into the top knot
  ctx.strokeStyle = 'rgba(180,122,70,0.55)';
  ctx.lineWidth = 1.3;
  ctx.lineCap = 'round';
  for (let i = -3; i <= 3; i++) {
    if (!i) continue;
    ctx.beginPath();
    ctx.moveTo(b.cx + i * 0.7, b.top + 2);
    ctx.quadraticCurveTo(
      b.cx + i * b.w * 0.075,
      b.top + h * 0.04,
      b.cx + i * b.w * 0.115,
      b.top + h * (0.21 - Math.abs(i) * 0.012),
    );
    ctx.stroke();
  }
  // bandana band
  const y0 = [b.top + 0.38 * h, b.top + 0.04 * h, b.top + 0.33 * h];
  const y1 = [b.top + 0.54 * h, b.top + 0.22 * h, b.top + 0.48 * h];
  ctx.beginPath();
  ctx.moveTo(l - 6, y0[0]!);
  ctx.quadraticCurveTo(b.cx, y0[1]!, r + 6, y0[2]!);
  ctx.lineTo(r + 6, y1[2]!);
  ctx.quadraticCurveTo(b.cx, y1[1]!, l - 6, y1[0]!);
  ctx.closePath();
  fillStroke(
    ctx,
    vgrad(ctx, b.top + h * 0.1, b.top + h * 0.5, ['#FF6F6F', '#E8323C', '#B81B33']),
    1.4,
    RED_DARK,
  );
  ctx.fillStyle = 'rgba(255,246,234,0.92)';
  for (const t of [0.2, 0.42, 0.64, 0.86]) {
    const x = q(t, l - 6, b.cx, r + 6);
    const y = (q(t, y0[0]!, y0[1]!, y0[2]!) + q(t, y1[0]!, y1[1]!, y1[2]!)) / 2;
    ell(ctx, x, y, h * 0.032 + 0.4, h * 0.03 + 0.3);
    ctx.fill();
  }
  ctx.restore();
  bunPath(ctx, b);
  ctx.lineWidth = 2.6;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK;
  ctx.stroke();
  // bandana knot at the back
  ell(ctx, knot.x + 1, knot.y - 2.5, 3.6, 2.6, -0.5);
  fillStroke(ctx, '#E8323C', 1.6);
  ell(ctx, knot.x + 1, knot.y + 2.5, 3.6, 2.6, 0.5);
  fillStroke(ctx, '#D42A3A', 1.6);
  ell(ctx, knot.x + 2, knot.y, 2.6, 2.6);
  fillStroke(ctx, '#FF5A5F', 1.6);
  if (swirl) {
    ell(ctx, b.cx, b.top + 1.2, 4.6, 2.6);
    fillStroke(ctx, CREAM, 2);
    ctx.beginPath();
    ctx.moveTo(b.cx + 1, b.top + 1);
    ctx.bezierCurveTo(b.cx + 2, b.top - 5, b.cx - 5, b.top - 9, b.cx - 9, b.top - 5);
    ctx.bezierCurveTo(b.cx - 11.5, b.top - 2, b.cx - 7.5, b.top + 0.5, b.cx - 6.5, b.top - 2.5);
    inkLine(ctx, CREAM, 3.4);
  }
  // gloss
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ell(ctx, b.cx - b.w * 0.2, b.top + h * 0.15, b.w * 0.075, h * 0.045, -0.5);
  ctx.fill();
  ell(ctx, b.cx - b.w * 0.33, b.top + h * 0.62, b.w * 0.035, h * 0.06, 0.2);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fill();
}

function eye(ctx: Ctx, x: number, y: number, look = 0): void {
  ell(ctx, x, y, 4.3, 5.9);
  ctx.fillStyle = vgrad(ctx, y - 6, y + 6, [INK, INK, '#5B3A92']);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ell(ctx, x - 1.2 + look, y - 2.2, 1.9, 2.3);
  ctx.fill();
  ell(ctx, x + 1.5 + look, y + 2.4, 0.95, 0.95);
  ctx.fill();
}

function strokeLine(ctx: Ctx, pts: readonly number[], w = 2.2): void {
  ctx.beginPath();
  ctx.moveTo(pts[0]!, pts[1]!);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i]!, pts[i + 1]!);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = w;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

function openMouth(ctx: Ctx, w: number, d: number): void {
  ctx.beginPath();
  ctx.moveTo(-w, 6.5);
  ctx.quadraticCurveTo(0, 6.5 + d * 2, w, 6.5);
  ctx.closePath();
  fillStroke(ctx, '#8A1A36', 1.5);
  ctx.save();
  ctx.clip();
  ell(ctx, 0.6, 6.5 + d, w * 0.6, d * 0.5);
  ctx.fillStyle = '#FF7A8A';
  ctx.fill();
  ctx.restore();
}

function tear(ctx: Ctx, x: number, y: number, s = 1): void {
  ctx.beginPath();
  ctx.moveTo(x, y - 3.4 * s);
  ctx.quadraticCurveTo(x + 2.6 * s, y, x, y + 2 * s);
  ctx.quadraticCurveTo(x - 2.6 * s, y, x, y - 3.4 * s);
  fillStroke(ctx, '#8FE3FF', 1.1, '#2A6FA0');
}

/** A face centred between the eyes at (x, y), scale s. Eyes at ±6, mouth at +9. */
function drawFace(ctx: Ctx, f: Face, x: number, y: number, s: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = 'rgba(255,120,150,0.62)';
  ell(ctx, -11.5, 6.5, 3.6, 2.2);
  ctx.fill();
  ell(ctx, 11, 6, 3, 2);
  ctx.fill();
  switch (f) {
    case 'run':
    case 'blink':
      if (f === 'run') {
        eye(ctx, -6, 0);
        eye(ctx, 6, 0);
      } else {
        strokeLine(ctx, [-9, 0.5, -6, 1.8, -3, 0.5]);
        strokeLine(ctx, [3, 0.5, 6, 1.8, 9, 0.5]);
      }
      strokeLine(ctx, [-9, -8, -3.5, -6.8], 1.8);
      strokeLine(ctx, [3.5, -6.9, 9, -8.2], 1.8);
      openMouth(ctx, 3.6, 3);
      break;
    case 'joy':
      ctx.beginPath();
      ctx.moveTo(-9.5, 1.5);
      ctx.quadraticCurveTo(-6, -6, -2.5, 1.5);
      ctx.moveTo(2.5, 1.5);
      ctx.quadraticCurveTo(6, -6, 9.5, 1.5);
      ctx.lineCap = 'round';
      ctx.lineWidth = 2.6;
      ctx.strokeStyle = INK;
      ctx.stroke();
      openMouth(ctx, 4.8, 4.2);
      break;
    case 'yikes':
      for (const ex of [-6, 6]) {
        ell(ctx, ex, 0, 4.7, 6.1);
        fillStroke(ctx, '#FFFFFF', 1.6);
        ell(ctx, ex - 2, 0.8, 2.1, 2.4);
        ctx.fillStyle = INK;
        ctx.fill();
      }
      strokeLine(ctx, [-9.5, -8.5, -3.5, -10.8], 1.8);
      strokeLine(ctx, [3.5, -10.8, 9.5, -8.5], 1.8);
      ell(ctx, 0.5, 9.5, 2.4, 3);
      fillStroke(ctx, '#8A1A36', 1.4);
      tear(ctx, 14.5, -9, 1.1);
      break;
    case 'dizzy':
      for (const ex of [-6, 6]) {
        ctx.beginPath();
        for (let a = 0; a < 4.2 * Math.PI; a += 0.3) {
          const r = 0.3 + a * 0.36;
          const px = ex + Math.cos(a) * r;
          const py = Math.sin(a) * r * 1.15;
          if (a) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
        }
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = INK;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(-4.5, 9);
      ctx.quadraticCurveTo(-3, 7, -1.5, 9);
      ctx.quadraticCurveTo(0, 11, 1.5, 9);
      ctx.quadraticCurveTo(3, 7, 4.5, 9);
      ctx.lineWidth = 1.8;
      ctx.stroke();
      break;
    case 'sad':
      eye(ctx, -6, 1);
      eye(ctx, 6, 1);
      strokeLine(ctx, [-9.5, -6, -3.5, -8.8], 1.8);
      strokeLine(ctx, [3.5, -8.8, 9.5, -6], 1.8);
      ctx.beginPath();
      ctx.moveTo(-3.6, 11);
      ctx.quadraticCurveTo(0, 7, 3.6, 11);
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.strokeStyle = INK;
      ctx.stroke();
      tear(ctx, -8.5, 8.5, 1.2);
      tear(ctx, 9, 8, 1);
      break;
    case 'grit':
      for (const [ex, rot] of [
        [-6, 0.28],
        [6, -0.28],
      ] as const) {
        ctx.beginPath();
        ctx.ellipse(ex, 0, 4.2, 4.8, rot, -0.1, Math.PI + 0.1);
        ctx.closePath();
        ctx.fillStyle = INK;
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ell(ctx, ex - 1, 1.6, 1.3, 1.3);
        ctx.fill();
      }
      strokeLine(ctx, [-10, -4.5, -3, -1.6], 2.2);
      strokeLine(ctx, [3, -1.6, 10, -4.5], 2.2);
      roundRectPath(ctx, -4.4, 6.2, 8.8, 4, 1.8);
      fillStroke(ctx, '#FFFFFF', 1.4);
      strokeLine(ctx, [0, 6.4, 0, 10], 1);
      break;
  }
  ctx.restore();
}

const BODY: Bun = { cx: 32, top: 10, w: 52, bottom: BAO.feetY };
export const drawBaoBody = (ctx: Ctx) => drawBun(ctx, BODY, BAO.knot, true);
export const drawBaoFace = (f: Face) => (ctx: Ctx) => drawFace(ctx, f, 45, 37, 1);

function drawBoot(ctx: Ctx, x: number, y: number, rot = 0): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.moveTo(-7, 4);
  ctx.lineTo(-7, -2);
  ctx.quadraticCurveTo(-7, -5, -4, -5);
  ctx.lineTo(-1, -5);
  ctx.quadraticCurveTo(2, -5, 2, -2);
  ctx.quadraticCurveTo(8, -2, 8, 2.5);
  ctx.quadraticCurveTo(8, 5, 5.5, 5);
  ctx.lineTo(-6, 5);
  ctx.quadraticCurveTo(-7, 5, -7, 4);
  ctx.closePath();
  fillStroke(ctx, vgrad(ctx, -5, 5, ['#6A4080', '#3E2350', '#2B1638']), 1.6);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ell(ctx, 4.5, -0.3, 1.8, 1);
  ctx.fill();
  ctx.fillStyle = '#FFC83D';
  ctx.fillRect(-6.5, 3, 13.5, 1.4);
  ctx.restore();
}
export const drawBaoBoot = (ctx: Ctx) => drawBoot(ctx, 9, 6);

/** The slide: flattened and leaning in, gritted teeth, boots out front. */
export function drawBaoSlide(ctx: Ctx): void {
  const b: Bun = { cx: SLIDE_POSE.cx, top: 13, w: 66, bottom: SLIDE_POSE.bottom };
  drawBun(ctx, b, SLIDE_POSE.knot, false);
  ctx.beginPath();
  ctx.moveTo(b.cx - 2, b.top + 1);
  ctx.bezierCurveTo(b.cx - 6, b.top - 3, b.cx - 14, b.top - 4, b.cx - 20, b.top - 1);
  inkLine(ctx, CREAM, 3);
  drawFace(ctx, 'grit', 55, 27, 0.74);
  drawBoot(ctx, 76, 36, -0.25);
  drawBoot(ctx, 70, 38, -0.12);
}

/** Bandana tails streaming left from the knot at (kx, ky); `phase` makes the flap frames. */
export function drawTails(ctx: Ctx, phase: number): void {
  const { kx, ky } = TAILS;
  for (const [len, dy, hw, ph] of [
    [32, -2.5, 3.4, 0],
    [24, 3.5, 2.8, 1.7],
  ] as const) {
    const top: [number, number][] = [];
    const bot: [number, number][] = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const x = kx - t * len;
      const y = ky + dy * t + Math.sin(phase + ph + t * 4.2) * 3.2 * t;
      const w = hw * (1 - t * 0.35);
      top.push([x, y - w]);
      bot.push([x, y + w]);
    }
    ctx.beginPath();
    ctx.moveTo(kx, ky - 1.5);
    for (const [x, y] of top) ctx.lineTo(x, y);
    const end = bot[bot.length - 1]!;
    ctx.lineTo(end[0] + 3, (end[1] + top[top.length - 1]![1]) / 2); // notched end
    for (let i = bot.length - 1; i >= 0; i--) ctx.lineTo(bot[i]![0], bot[i]![1]);
    ctx.lineTo(kx, ky + 1.5);
    ctx.closePath();
    fillStroke(ctx, vgrad(ctx, ky - 6, ky + 8, ['#FF6F6F', '#D42A3A']), 1.5);
  }
}

// ─── Gulp the gull ───

function wing(ctx: Ctx, x: number, y: number, angle: number, dark: boolean): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(4, -2);
  ctx.bezierCurveTo(-8, -12, -32, -14, -46, -5);
  ctx.lineTo(-41, -1);
  ctx.quadraticCurveTo(-37, 5, -32, 1);
  ctx.quadraticCurveTo(-28, 8, -22, 3);
  ctx.quadraticCurveTo(-16, 10, -10, 5);
  ctx.quadraticCurveTo(-4, 10, 2, 7);
  ctx.closePath();
  fillStroke(
    ctx,
    hgrad(
      ctx,
      -46,
      0,
      dark ? ['#3E3656', '#7C7396', '#9E95B8'] : ['#4E4766', '#B9B1CF', '#E6E0F2'],
    ),
    2,
  );
  ctx.restore();
}

/** Gulp: a chubby, greedy gull in a gingham napkin bib. wing: angle (radians, + = up); chomp: beak wide open. */
export function drawGulp(ctx: Ctx, wingAngle: number, chomp: boolean): void {
  wing(ctx, 60, 38, wingAngle + 0.25, true);
  // tail
  ctx.beginPath();
  ctx.moveTo(30, 42);
  ctx.lineTo(6, 36);
  ctx.lineTo(13, 47);
  ctx.lineTo(7, 58);
  ctx.lineTo(32, 56);
  ctx.closePath();
  fillStroke(ctx, hgrad(ctx, 6, 32, ['#4E4766', '#E6E0F2']), 2);
  // feet
  for (const fx of [46, 57]) {
    ctx.beginPath();
    ctx.moveTo(fx, 68);
    ctx.lineTo(fx - 5, 78);
    ctx.lineTo(fx + 5, 78);
    ctx.closePath();
    fillStroke(ctx, '#FF9F1C', 1.6);
  }
  // body and head
  ell(ctx, 52, 50, 31, 24);
  fillStroke(ctx, vgrad(ctx, 26, 74, ['#FFFFFF', '#F2EEFA', '#C9C0DE']), 2.4);
  // scruffy, swept-back head tuft
  ctx.beginPath();
  ctx.moveTo(86, 15);
  ctx.quadraticCurveTo(80, 9, 70, 9);
  ctx.quadraticCurveTo(76, 12, 78, 15);
  ctx.quadraticCurveTo(72, 14, 66, 17);
  ctx.quadraticCurveTo(73, 17, 76, 19);
  fillStroke(ctx, '#FFFFFF', 2);
  ell(ctx, 82, 31, 18, 17);
  fillStroke(ctx, vgrad(ctx, 14, 48, ['#FFFFFF', '#E9E4F4']), 2.4);
  // napkin bib (gingham)
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(68, 42);
  ctx.quadraticCurveTo(82, 47, 96, 40);
  ctx.lineTo(84, 68);
  ctx.closePath();
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = 'rgba(232,50,60,0.55)';
  for (let gx = 64; gx < 100; gx += 8) ctx.fillRect(gx, 38, 4, 32);
  for (let gy = 38; gy < 70; gy += 8) ctx.fillRect(64, gy, 36, 4);
  ctx.restore(); // the bib path survives restore(), so outline it
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.stroke();
  // bib ties
  ctx.beginPath();
  ctx.moveTo(68, 42);
  ctx.lineTo(62, 37);
  ctx.lineTo(63, 45);
  ctx.closePath();
  fillStroke(ctx, '#FFFFFF', 1.6);
  // near wing
  wing(ctx, 56, 44, wingAngle, false);
  // beak
  ctx.save();
  ctx.translate(96, 30);
  ctx.beginPath(); // lower mandible
  ctx.moveTo(-2, 4);
  ctx.quadraticCurveTo(10, chomp ? 18 : 9, 18, chomp ? 16 : 8);
  ctx.quadraticCurveTo(10, chomp ? 9 : 4, -2, 4);
  ctx.closePath();
  fillStroke(ctx, '#FFB627', 1.8);
  ell(ctx, 13, chomp ? 13.5 : 7, 1.8, 1.5);
  ctx.fillStyle = '#FF5A5F';
  ctx.fill();
  if (chomp) {
    ctx.beginPath();
    ctx.moveTo(0, 3);
    ctx.quadraticCurveTo(10, 12, 15, 13);
    ctx.lineTo(16, 4);
    ctx.closePath();
    ctx.fillStyle = '#8A1A36';
    ctx.fill();
  }
  ctx.beginPath(); // upper mandible, hooked
  ctx.moveTo(-3, -6);
  ctx.quadraticCurveTo(12, -6, 22, chomp ? -1 : 3);
  ctx.quadraticCurveTo(22, chomp ? 4 : 8, 18, chomp ? 2 : 7);
  ctx.quadraticCurveTo(10, chomp ? 1 : 5, -3, 4);
  ctx.closePath();
  fillStroke(ctx, vgrad(ctx, -6, 6, ['#FFE14D', '#FF9F1C']), 1.8);
  ctx.restore();
  // greedy grin line
  strokeLine(ctx, [93, 34, 90, 31.5], 1.6);
  // half-lidded greedy eye and heavy brow
  ell(ctx, 85, 27, 5, 5.6);
  fillStroke(ctx, '#FFFFFF', 1.5);
  ell(ctx, 86.6, 28.6, 2.5, 2.7);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ell(ctx, 85.8, 27.6, 0.9, 0.9);
  ctx.fill();
  if (!chomp) {
    ctx.beginPath();
    ctx.ellipse(85, 27, 5.4, 6, 0, Math.PI + 0.25, TAU - 0.05);
    ctx.lineTo(90.6, 26.2);
    ctx.closePath();
    fillStroke(ctx, '#C9C0DE', 1.4);
  }
  strokeLine(ctx, chomp ? [78, 18, 91, 19.5] : [78, 19.5, 92, 23.5], 3);
  ctx.fillStyle = 'rgba(255,120,150,0.5)';
  ell(ctx, 80, 37, 3.4, 2);
  ctx.fill();
}

// ─── obstacles and pickups ───

/** A crab scuttled off a seafood stall, facing left (towards Bao). `step` alternates the leg frames. */
export function drawCrab(ctx: Ctx, step: number): void {
  const k = step ? 2 : -2;
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    for (const side of [-1, 1]) {
      const bx = 29 + side * (8 + i * 4);
      const swing = (i % 2 ? k : -k) * (side < 0 ? 1 : -1);
      ctx.beginPath();
      ctx.moveTo(bx, 29);
      ctx.lineTo(bx + side * 6 + swing, 31);
      ctx.lineTo(bx + side * 8 + swing, 37);
      inkLine(ctx, '#E8452E', 2.2);
    }
  }
  // arms and claws
  for (const [cx, cy, s, ax] of [
    [9, 15, 1, 18],
    [50, 16, 0.85, 41],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(ax, 25);
    ctx.quadraticCurveTo(ax - (cx < 29 ? 6 : -6), 24, cx, cy + 5);
    inkLine(ctx, '#E8452E', 3);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(cx < 29 ? -s : s, s);
    ctx.beginPath();
    ctx.moveTo(-6, 4);
    ctx.quadraticCurveTo(-8, -7, 1, -8);
    ctx.quadraticCurveTo(7, -8, 7, -3);
    ctx.lineTo(1, -2.5);
    ctx.lineTo(7, 1);
    ctx.quadraticCurveTo(5, 6, -6, 4);
    ctx.closePath();
    fillStroke(ctx, vgrad(ctx, -8, 6, ['#FF8A5C', '#E03A2C']), 1.8);
    ctx.restore();
  }
  // eye stalks
  for (const [sx, ex, ey] of [
    [24, 20, 8],
    [32, 30, 7],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(sx, 20);
    ctx.lineTo(ex + 0.5, ey + 3);
    inkLine(ctx, '#E8452E', 1.6);
    ell(ctx, ex, ey, 3.6, 3.8);
    fillStroke(ctx, '#FFFFFF', 1.5);
    ell(ctx, ex - 1.2, ey + 0.3, 1.7, 2);
    ctx.fillStyle = INK;
    ctx.fill();
  }
  // shell
  ell(ctx, 29, 26, 18.5, 9.5);
  fillStroke(ctx, vgrad(ctx, 16, 36, ['#FF9363', '#F0522F', '#C42F2A']), 2.2);
  ctx.fillStyle = 'rgba(255,230,200,0.75)';
  for (const [x, y, r] of [
    [24, 22, 1.8],
    [31, 21, 1.3],
    [37, 24, 1.5],
  ] as const) {
    ell(ctx, x, y, r, r);
    ctx.fill();
  }
  // grumpy brows and mouth (on the shell front)
  strokeLine(ctx, [16, 4, 23, 6.5], 1.6);
  strokeLine(ctx, [26.5, 3.5, 33, 5], 1.6);
  strokeLine(ctx, [15.5, 29, 18, 27.6, 20.5, 29], 1.5);
}

function basket(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  roundRectPath(ctx, x, y, w, h, 4);
  ctx.fillStyle = hgrad(ctx, x, x + w, ['#B87A34', '#F6D28A', '#E6B565', '#B07030']);
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = 'rgba(120,70,20,0.35)';
  ctx.lineWidth = 1;
  for (let sx = x + 4; sx < x + w; sx += 5) {
    ctx.beginPath();
    ctx.moveTo(sx, y + 5);
    ctx.lineTo(sx, y + h - 5);
    ctx.stroke();
  }
  ctx.fillStyle = hgrad(ctx, x, x + w, ['#8A5520', '#C98C3E', '#A86A28']);
  ctx.fillRect(x, y, w, 5);
  ctx.fillRect(x, y + h - 5, w, 5);
  ctx.fillStyle = 'rgba(255,240,200,0.6)';
  ctx.fillRect(x, y + 1, w, 1.2);
  ctx.fillRect(x, y + h - 4, w, 1);
  ctx.restore();
  roundRectPath(ctx, x, y, w, h, 4);
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

/** Three bamboo steamer baskets and a domed lid (56 × 96; the stack top sits 90 px above the ground). */
export function drawSteamers(ctx: Ctx): void {
  ctx.save();
  ctx.shadowColor = 'rgba(8,4,24,0.4)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 2;
  basket(ctx, 3, 70, 50, 25);
  ctx.restore();
  basket(ctx, 2, 45, 52, 26);
  basket(ctx, 3, 20, 50, 26);
  // lid
  ctx.beginPath();
  ctx.moveTo(1, 21);
  ctx.quadraticCurveTo(4, 7, 28, 6);
  ctx.quadraticCurveTo(52, 7, 55, 21);
  ctx.closePath();
  fillStroke(ctx, vgrad(ctx, 6, 21, ['#F8DA98', '#D59A48']), 2);
  ctx.strokeStyle = 'rgba(120,70,20,0.4)';
  ctx.lineWidth = 1;
  for (const dx of [-18, -9, 0, 9, 18]) {
    ctx.beginPath();
    ctx.moveTo(28 + dx * 0.25, 8);
    ctx.lineTo(28 + dx * 1.2, 20);
    ctx.stroke();
  }
  ell(ctx, 28, 6, 5, 3);
  fillStroke(ctx, '#C98C3E', 1.8);
  // red paper tag with a tiny gold bun
  ctx.save();
  ctx.translate(38, 58);
  ctx.rotate(0.12);
  roundRectPath(ctx, -7, -8, 14, 16, 2);
  fillStroke(ctx, '#E8323C', 1.5, '#7E1022');
  ctx.beginPath();
  ctx.moveTo(-4, 3);
  ctx.quadraticCurveTo(-4, -4, 0, -4);
  ctx.quadraticCurveTo(4, -4, 4, 3);
  ctx.closePath();
  ctx.fillStyle = GOLD;
  ctx.fill();
  ctx.restore();
}

/** Soft rising steam curls. */
export function drawSteam(ctx: Ctx): void {
  ctx.lineCap = 'round';
  for (const [x, a] of [
    [14, 0.45],
    [24, 0.6],
    [32, 0.4],
  ] as const) {
    for (const [w, al] of [
      [7, 0.12],
      [3.5, 0.5],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(x, 54);
      ctx.bezierCurveTo(x - 8, 40, x + 8, 30, x, 16);
      ctx.bezierCurveTo(x - 5, 9, x + 2, 4, x + 4, 2);
      ctx.strokeStyle = `rgba(255,248,240,${a * al * 2})`;
      ctx.lineWidth = w;
      ctx.stroke();
    }
  }
}

/** A hanging shop signboard (w × 68): a dark beam with rings, a red lacquer board, gold border and a pictogram. */
export function drawSign(ctx: Ctx, w: number, motif: number): void {
  roundRectPath(ctx, 0.5, 2, w - 1, 8, 3);
  fillStroke(ctx, vgrad(ctx, 2, 10, ['#6B3A2A', '#3A1E1A']), 1.6);
  for (const rx of [8, w - 8]) {
    ell(ctx, rx, 2.5, 2.6, 2.6);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = GOLD;
    ctx.stroke();
  }
  ctx.save();
  ctx.shadowColor = 'rgba(8,4,24,0.5)';
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 2;
  roundRectPath(ctx, 3, 10, w - 6, SIGN_H - 11, 6);
  ctx.fillStyle = vgrad(ctx, 10, SIGN_H, ['#E33A4A', '#B71F35', '#8A1428']);
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.stroke();
  roundRectPath(ctx, 7, 14, w - 14, SIGN_H - 19, 4);
  ctx.lineWidth = 2;
  ctx.strokeStyle = GOLD;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  roundRectPath(ctx, 8, 15, w - 16, 10, 3);
  ctx.fill();
  // pictogram, centred
  const cx = w / 2;
  const cy = 38;
  ctx.fillStyle = '#FFD65A';
  ctx.strokeStyle = '#FFD65A';
  ctx.lineCap = 'round';
  ctx.lineWidth = 2.4;
  if (motif === 0) {
    // noodle bowl with chopsticks and steam
    ctx.beginPath();
    ctx.moveTo(cx - 13, cy - 2);
    ctx.quadraticCurveTo(cx, cy + 22, cx + 13, cy - 2);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + 2, cy - 4);
    ctx.lineTo(cx + 12, cy - 16);
    ctx.moveTo(cx + 6, cy - 3);
    ctx.lineTo(cx + 15, cy - 13);
    ctx.moveTo(cx - 7, cy - 6);
    ctx.quadraticCurveTo(cx - 10, cy - 11, cx - 6, cy - 15);
    ctx.stroke();
  } else if (motif === 1) {
    // fish
    ctx.beginPath();
    ctx.ellipse(cx - 2, cy, 13, 7.5, 0, 0, TAU);
    ctx.moveTo(cx + 9, cy);
    ctx.lineTo(cx + 19, cy - 7);
    ctx.lineTo(cx + 19, cy + 7);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#B71F35';
    ell(ctx, cx - 9, cy - 1.5, 1.8, 1.8);
    ctx.fill();
  } else {
    // teapot and a bun
    ctx.beginPath();
    ctx.ellipse(cx - 9, cy + 2, 10, 8, 0, 0, TAU);
    ctx.fill();
    ctx.fillRect(cx - 12, cy - 9, 6, 4);
    ctx.beginPath();
    ctx.moveTo(cx - 1, cy + 1);
    ctx.lineTo(cx + 5, cy - 6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + 6, cy + 9);
    ctx.quadraticCurveTo(cx + 6, cy - 3, cx + 13, cy - 3);
    ctx.quadraticCurveTo(cx + 20, cy - 3, cx + 20, cy + 9);
    ctx.closePath();
    ctx.fill();
  }
  // corner studs
  ctx.fillStyle = GOLD;
  for (const [sx, sy] of [
    [11, 18],
    [w - 11, 18],
    [11, SIGN_H - 9],
    [w - 11, SIGN_H - 9],
  ] as const) {
    ell(ctx, sx, sy, 1.6, 1.6);
    ctx.fill();
  }
}

/** Two ropes for a sign of width w (stretched vertically by the scene). */
export function drawRopes(ctx: Ctx, w: number, h: number): void {
  for (const rx of [8, w - 8]) {
    ctx.fillStyle = '#2A1424';
    ctx.fillRect(rx - 1.5, 0, 3, h);
    ctx.fillStyle = 'rgba(255,200,150,0.35)';
    ctx.fillRect(rx - 0.5, 0, 1, h);
  }
}

/** A golden sesame coin (32 × 32). */
export function drawCoin(ctx: Ctx): void {
  glossyCircle(ctx, 16, 16, 13, GOLD, { outline: '#8A4B0A' });
  ell(ctx, 16, 16, 9, 9);
  ctx.lineWidth = 1.3;
  ctx.strokeStyle = 'rgba(160,90,10,0.6)';
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(16, 9.5);
  ctx.quadraticCurveTo(21, 15.5, 16, 22);
  ctx.quadraticCurveTo(11, 15.5, 16, 9.5);
  fillStroke(ctx, '#FFF4C8', 1.3, '#B06A10');
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ell(ctx, 14.5, 13.5, 1.2, 2.2, 0.3);
  ctx.fill();
}

export function drawTwinkle(ctx: Ctx): void {
  ctx.fillStyle = '#FFFFFF';
  starPath(ctx, 8, 8, 4, 8, 1.8, 0);
  ctx.fill();
}

export function drawDizzyStar(ctx: Ctx): void {
  starPath(ctx, 9, 9.5, 5, 8, 3.6);
  fillStroke(ctx, '#FFE14D', 1.6);
}

export function drawShadow(ctx: Ctx, w: number, h: number): void {
  const g = ctx.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2);
  g.addColorStop(0, 'rgba(10,4,30,0.55)');
  g.addColorStop(1, 'rgba(10,4,30,0)');
  ctx.fillStyle = g;
  ctx.save();
  ctx.scale(1, h / w);
  ctx.beginPath();
  ctx.arc(w / 2, w / 2, w / 2, 0, TAU);
  ctx.fill();
  ctx.restore();
}

export function drawGlow(ctx: Ctx, w: number): void {
  const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, w);
}

export function drawSpeedLine(ctx: Ctx, w: number, h: number): void {
  ctx.fillStyle = hgrad(ctx, 0, w, [
    'rgba(255,255,255,0)',
    'rgba(255,240,220,0.85)',
    'rgba(255,255,255,0)',
  ]);
  roundRectPath(ctx, 0, 0, w, h, h / 2);
  ctx.fill();
}

/** The best-distance marker: a bamboo pole with a gold star pennant (40 × 110, foot at the bottom left). */
export function drawBestFlag(ctx: Ctx): void {
  roundRectPath(ctx, 3, 4, 5, 106, 2.5);
  fillStroke(ctx, hgrad(ctx, 3, 8, ['#C98C3E', '#F6D28A', '#B07030']), 1.4);
  ctx.beginPath();
  ctx.moveTo(8, 6);
  ctx.quadraticCurveTo(24, 10, 38, 8);
  ctx.quadraticCurveTo(30, 18, 38, 30);
  ctx.quadraticCurveTo(24, 26, 8, 32);
  ctx.closePath();
  fillStroke(ctx, vgrad(ctx, 6, 32, ['#FFE14D', '#FF9F1C']), 1.8);
  starPath(ctx, 21, 19.5, 5, 6.5, 2.8);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
}

/** The game title in the brand face with a sunset-gold fill and a bolt. */
export function drawTitle(ctx: Ctx, w: number, h: number, text: string): void {
  ctx.font = font('display', 700, 86);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const tw = ctx.measureText(text).width;
  const x = w / 2 - 22;
  const y = h / 2 + 4;
  ctx.strokeStyle = 'rgba(8,4,24,0.55)';
  ctx.lineWidth = 16;
  ctx.strokeText(text, x, y + 7);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 14;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = vgrad(ctx, y - 40, y + 34, ['#FFF6B0', '#FFC83D', '#FF8A1C', '#FF4FA3']);
  ctx.fillText(text, x, y);
  // bolt
  ctx.save();
  ctx.translate(x + tw / 2 + 34, y - 6);
  ctx.rotate(0.18);
  ctx.beginPath();
  ctx.moveTo(4, -32);
  ctx.lineTo(-16, 4);
  ctx.lineTo(-2, 4);
  ctx.lineTo(-8, 32);
  ctx.lineTo(16, -6);
  ctx.lineTo(2, -6);
  ctx.closePath();
  ctx.lineWidth = 10;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = vgrad(ctx, -32, 32, ['#FFF6B0', '#FFE14D', '#FF9F1C']);
  ctx.fill();
  ctx.restore();
}

/** The sunset "press to run" pill. */
export function drawPromptPill(ctx: Ctx, w: number, h: number): void {
  ctx.save();
  ctx.shadowColor = 'rgba(8,4,24,0.5)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;
  roundRectPath(ctx, 2, 6, w - 4, h - 8, (h - 8) / 2);
  ctx.fillStyle = '#B5305E';
  ctx.fill();
  ctx.restore();
  roundRectPath(ctx, 2, 2, w - 4, h - 8, (h - 8) / 2);
  ctx.fillStyle = hgrad(ctx, 0, w, ['#FF4FA3', '#FF9F1C']);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  roundRectPath(ctx, 10, 5, w - 20, (h - 8) * 0.4, (h - 8) * 0.2);
  ctx.fill();
  roundRectPath(ctx, 2, 2, w - 4, h - 8, (h - 8) / 2);
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

/** The Gulp warning pill: dark glass with a danger rim and a little Gulp head. */
export function drawWarnPill(ctx: Ctx, w: number, h: number): void {
  roundRectPath(ctx, 1, 1, w - 2, h - 2, h / 2);
  ctx.fillStyle = 'rgba(70,10,30,0.82)';
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#FF5A5F';
  ctx.stroke();
  ctx.save();
  ctx.translate(h / 2, h / 2);
  ctx.scale(0.62, 0.62);
  ctx.translate(-84, -31);
  ell(ctx, 82, 31, 18, 17);
  fillStroke(ctx, '#FFFFFF', 2.4);
  ctx.beginPath();
  ctx.moveTo(94, 24);
  ctx.quadraticCurveTo(108, 24, 118, 33);
  ctx.quadraticCurveTo(106, 38, 94, 36);
  ctx.closePath();
  fillStroke(ctx, '#FFB627', 2);
  ell(ctx, 85, 27, 4.5, 5);
  fillStroke(ctx, '#FFFFFF', 1.4);
  ell(ctx, 86.5, 28.5, 2.2, 2.4);
  ctx.fillStyle = INK;
  ctx.fill();
  strokeLine(ctx, [77, 19.5, 92, 23.5], 3);
  ctx.restore();
}

/** The multiplier badge: a glossy orange disc (the number is live text on top). */
export function drawMultBadge(ctx: Ctx): void {
  glossyCircle(ctx, 22, 22, 19, '#FF9F1C', { shadow: false, outline: INK });
}
