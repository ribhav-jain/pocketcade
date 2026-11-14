// Rowdy's art, drawn with Canvas 2D once per mount: the rack, the coins, Rowdy's head, body and LED faces, the
// speech bubbles and small HUD glyphs. Pure drawing in design units; no Phaser.
import {
  colors,
  fillGradient,
  glossyRect,
  rgba,
  roundRectPath,
  shade,
  starPath,
} from '@pocketcade/toolkit';
import { COLS, ROWS, type Side } from './rules.ts';

type Ctx = CanvasRenderingContext2D;

export const OUTLINE = '#1A1450';
const BLUE = colors.blue;
export const COIN = { you: colors.sky, bot: colors.orange } as const;

// ─── the board block (local units): an aiming lane on top, the rack below ───
export const CELL = 92;
export const LANE = 92;
export const RACK = { x: 22, y: LANE + 20, w: CELL * COLS, h: CELL * ROWS };
export const FRAME = { x: 0, y: LANE, w: RACK.w + 44, h: RACK.h + 50, lip: 10 };
export const BLOCK = { w: FRAME.w, h: LANE + FRAME.h + FRAME.lip };
/** Coins are wider than the holes, so the front panel overlaps their rim. */
export const HOLE = 37;
export const DISC_R = 42;
export const colX = (c: number) => RACK.x + CELL / 2 + c * CELL;
export const rowY = (r: number) => RACK.y + CELL / 2 + (ROWS - 1 - r) * CELL;

// ─── scenery ───
/** Faint dot grid over the wall gradient; called by the toolkit backdrop, which may paint past the design area. */
export function drawWall(ctx: Ctx, w: number, h: number, bleedX: number, bleedY: number): void {
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (let y = -bleedY + 24; y < h + bleedY; y += 48)
    for (let x = -bleedX + 24; x < w + bleedX; x += 48) {
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
}

export function drawFloor(ctx: Ctx, w: number, h: number): void {
  fillGradient(ctx, 0, 0, w, h, ['#2C2274', '#171040']);
  ctx.fillStyle = colors.line;
  ctx.fillRect(0, 0, w, 3);
}

// ─── the rack: a front panel with punched holes; coins sit behind it ───
export function drawFrame(ctx: Ctx): void {
  const { w, h, lip } = FRAME;
  const rx = RACK.x - FRAME.x;
  const ry = RACK.y - FRAME.y;
  const holes = (each: (x: number, y: number) => void) => {
    for (let c = 0; c < COLS; c++)
      for (let r = 0; r < ROWS; r++) each(rx + CELL / 2 + c * CELL, ry + CELL / 2 + r * CELL);
  };
  // base lip with the one soft shadow
  ctx.save();
  ctx.shadowColor = 'rgba(6,3,24,0.5)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = shade(BLUE, -0.55);
  roundRectPath(ctx, 2, lip, w - 4, h - 2, 30);
  ctx.fill();
  ctx.restore();
  // face
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, shade(BLUE, 0.2));
  g.addColorStop(0.4, BLUE);
  g.addColorStop(1, shade(BLUE, -0.2));
  ctx.fillStyle = g;
  roundRectPath(ctx, 2, 2, w - 4, h - 4, 30);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  roundRectPath(ctx, 30, 6, w - 60, 5, 2.5);
  ctx.fill();
  // recessed inner panel
  ctx.fillStyle = shade(BLUE, -0.14);
  roundRectPath(ctx, rx - 8, ry - 8, RACK.w + 16, RACK.h + 16, 22);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = rgba(OUTLINE, 0.5);
  ctx.stroke();
  // holes
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  holes((x, y) => {
    ctx.beginPath();
    ctx.arc(x, y, HOLE, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
  holes((x, y) => {
    // the panel's shadow on whatever sits in the hole
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, HOLE, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(8,4,30,0.4)';
    ctx.beginPath();
    ctx.rect(x - HOLE, y - HOLE, HOLE * 2, HOLE * 2);
    ctx.arc(x, y + 9, HOLE + 1, 0, Math.PI * 2, true);
    ctx.fill('evenodd');
    ctx.restore();
    // dark edge, and a light catch on the lower rim
    ctx.lineWidth = 4;
    ctx.strokeStyle = OUTLINE;
    ctx.beginPath();
    ctx.arc(x, y, HOLE + 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.arc(x, y, HOLE + 5.5, Math.PI * 0.2, Math.PI * 0.8);
    ctx.stroke();
  });
  // outlines
  ctx.lineWidth = 3;
  ctx.strokeStyle = rgba(OUTLINE, 0.6);
  roundRectPath(ctx, 2, 2, w - 4, h - 4, 30);
  ctx.stroke();
  ctx.lineWidth = 4;
  ctx.strokeStyle = OUTLINE;
  roundRectPath(ctx, 2, 2, w - 4, h + lip - 4, 30);
  ctx.stroke();
  for (const [x, y] of [
    [15, 15],
    [w - 15, 15],
    [15, h - 16],
    [w - 15, h - 16],
  ] as const)
    stud(ctx, x, y, 5, colors.gold);
}

/** A small glossy ball (rivets, panel lights). */
function stud(ctx: Ctx, x: number, y: number, r: number, c: string): void {
  ctx.fillStyle = OUTLINE;
  ctx.beginPath();
  ctx.arc(x, y, r + 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.3, 0, Math.PI * 2);
  ctx.fill();
}

// ─── coins ───
/** A flat candy coin with a raised rim and a mark for colour-blind play: a square for you, a gear for Rowdy. */
export function drawCoin(ctx: Ctx, side: Side, cx: number, cy: number, R: number): void {
  const base = COIN[side];
  const dark = shade(base, -0.55);
  const disc = (r: number, fill: string) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  };
  disc(R, dark);
  disc(R - 3, shade(base, 0.3));
  disc(R * 0.76 + 2.5, shade(base, -0.28));
  disc(R * 0.76, base);
  const mark = (dy: number, fill: string) => {
    ctx.fillStyle = fill;
    if (side === 'you') {
      const s = R * 0.33;
      roundRectPath(ctx, cx - s, cy - s + dy, s * 2, s * 2, R * 0.1);
      ctx.fill();
    } else {
      gearPath(ctx, cx, cy + dy, R * 0.46, R * 0.31, 6);
      ctx.arc(cx, cy + dy, R * 0.13, 0, Math.PI * 2, true);
      ctx.fill('evenodd');
    }
  };
  mark(R * 0.07, dark);
  mark(0, shade(base, 0.8));
  // one highlight on the rim
  ctx.lineWidth = R * 0.09;
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.88, Math.PI * 1.1, Math.PI * 1.4);
  ctx.stroke();
}

function gearPath(
  ctx: Ctx,
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  teeth: number,
): void {
  ctx.beginPath();
  const steps = teeth * 4;
  for (let i = 0; i <= steps; i++) {
    const a = ((i - 1.5) / steps) * Math.PI * 2 - Math.PI / 2;
    const r = i % 4 === 1 || i % 4 === 2 ? outer : inner;
    const [x, y] = [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.closePath();
}

/** A ring around a hole: thin and white for the last move, thick and gold for the winning four. */
export function drawRing(ctx: Ctx, s: number, win: boolean): void {
  const c = s / 2;
  const r = HOLE + (win ? 4 : 5);
  const stroke = (width: number, colour: string) => {
    ctx.lineWidth = width;
    ctx.strokeStyle = colour;
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.stroke();
  };
  if (win) stroke(11, OUTLINE);
  stroke(win ? 6 : 4, win ? colors.yellow : colors.text);
}

// ─── Rowdy (robot units: the head is 200 × 176, the body 220 × 196) ───
export const HEAD = { w: 200, h: 176, faceY: 108, bulbY: 17, shellTop: 50 };
export const BODY = { w: 220, h: 196 };
export const PAD = { w: 240, h: 56 };
export const STAND = { w: 150, h: 46 };
export const BULB = 30;

export function drawHead(ctx: Ctx): void {
  const top = HEAD.shellTop;
  // antenna stalk and collar (the bulb is its own image, tinted by mood)
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(100, top);
  ctx.lineTo(100, 26);
  ctx.stroke();
  ctx.strokeStyle = '#B9C6E8';
  ctx.lineWidth = 4;
  ctx.stroke();
  glossyRect(ctx, 82, top - 12, 36, 18, colors.gold, {
    radius: 9,
    depth: 4,
    outline: OUTLINE,
    lineWidth: 3,
    shadow: false,
  });
  // ears
  for (const x of [4, 168]) {
    glossyRect(ctx, x, 92, 28, 46, colors.orange, {
      radius: 10,
      depth: 5,
      outline: OUTLINE,
      lineWidth: 3,
      shadow: false,
    });
    ctx.fillStyle = rgba(OUTLINE, 0.35);
    for (let i = 0; i < 3; i++) ctx.fillRect(x + 6, 102 + i * 9, 16, 3);
  }
  // head shell
  glossyRect(ctx, 16, top, 168, 126, '#6F96FF', {
    radius: 36,
    depth: 10,
    outline: OUTLINE,
    lineWidth: 4,
    gloss: 0.3,
    shadow: false,
  });
  // screen bezel (the face image sits inside it)
  ctx.fillStyle = OUTLINE;
  roundRectPath(ctx, 30, top + 10, 140, 96, 22);
  ctx.fill();
  // cheeks and a tiny grille
  ctx.fillStyle = colors.pink;
  for (const x of [38, 162]) {
    ctx.beginPath();
    ctx.ellipse(x, top + 112, 8, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = rgba(OUTLINE, 0.6);
  for (let i = 0; i < 3; i++) {
    roundRectPath(ctx, 86 + i * 10, top + 109, 6, 7, 3);
    ctx.fill();
  }
}

/** The antenna bulb in white, so a tint gives it the mood's colour. */
export function drawBulb(ctx: Ctx): void {
  const c = BULB / 2;
  ctx.fillStyle = OUTLINE;
  ctx.beginPath();
  ctx.arc(c, c, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#E6E6EE';
  ctx.beginPath();
  ctx.arc(c, c, 10.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(c - 3, c - 3, 5, 0, Math.PI * 2);
  ctx.fill();
}

function neckSpring(ctx: Ctx, cx: number): void {
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = i % 2 ? '#8796C8' : '#5D6CA8';
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(cx, 6 + i * 8, 22 - i, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

export function drawBody(ctx: Ctx): void {
  const cx = BODY.w / 2;
  // arms (behind the torso): bent pipes with rings, claw hands
  for (const dir of [-1, 1]) {
    const sx = cx + dir * 54;
    const hx = cx + dir * 92;
    ctx.lineCap = 'round';
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.moveTo(sx, 50);
    ctx.quadraticCurveTo(cx + dir * 96, 58, hx, 112);
    ctx.stroke();
    ctx.strokeStyle = '#A9B8E6';
    ctx.lineWidth = 11;
    ctx.stroke();
    ctx.strokeStyle = rgba(OUTLINE, 0.45);
    ctx.lineWidth = 3;
    for (let k = 1; k <= 3; k++) {
      const t = k / 4;
      const x = (1 - t) ** 2 * sx + 2 * (1 - t) * t * (cx + dir * 96) + t * t * hx;
      const y = (1 - t) ** 2 * 50 + 2 * (1 - t) * t * 58 + t * t * 112;
      ctx.beginPath();
      ctx.moveTo(x - 6, y - 2 * dir);
      ctx.lineTo(x + 6, y + 2 * dir);
      ctx.stroke();
    }
    // claw: a C open to the bottom
    ctx.lineWidth = 9;
    ctx.strokeStyle = OUTLINE;
    ctx.beginPath();
    ctx.arc(hx, 124, 13, Math.PI * 0.72, Math.PI * 2.28);
    ctx.stroke();
    ctx.lineWidth = 5;
    ctx.strokeStyle = colors.orange;
    ctx.stroke();
  }
  neckSpring(ctx, cx);
  // treads
  glossyRect(ctx, cx - 66, 140, 132, 52, '#3A3270', {
    radius: 26,
    depth: 6,
    outline: OUTLINE,
    lineWidth: 4,
    gloss: 0.2,
    shadow: false,
  });
  for (const dx of [-40, 0, 40]) {
    ctx.fillStyle = OUTLINE;
    ctx.beginPath();
    ctx.arc(cx + dx, 164, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colors.gold;
    ctx.beginPath();
    ctx.arc(cx + dx, 164, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = OUTLINE;
    ctx.beginPath();
    ctx.arc(cx + dx, 164, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // torso
  glossyRect(ctx, cx - 60, 24, 120, 120, '#5B7CF2', {
    radius: 34,
    depth: 9,
    outline: OUTLINE,
    lineWidth: 4,
    gloss: 0.3,
    shadow: false,
  });
  // chest panel: gauge and three lights
  glossyRect(ctx, cx - 40, 48, 80, 58, colors.paper, {
    radius: 14,
    depth: 4,
    outline: OUTLINE,
    lineWidth: 3,
    gloss: 0.2,
    shadow: false,
  });
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx - 16, 76, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.lineWidth = 2;
  for (let k = 0; k < 5; k++) {
    const a = Math.PI * (1.1 + k * 0.2);
    ctx.beginPath();
    ctx.moveTo(cx - 16 + Math.cos(a) * 10, 76 + Math.sin(a) * 10);
    ctx.lineTo(cx - 16 + Math.cos(a) * 13, 76 + Math.sin(a) * 13);
    ctx.stroke();
  }
  ctx.strokeStyle = colors.vermillion;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - 16, 77);
  ctx.lineTo(cx - 7, 68);
  ctx.stroke();
  [colors.pink, colors.gold, colors.lime].forEach((c, i) => stud(ctx, cx + 20, 60 + i * 15, 5, c));
}

/** The round pad Rowdy stands on. */
export function drawPad(ctx: Ctx): void {
  const cx = PAD.w / 2;
  ctx.fillStyle = 'rgba(8,4,30,0.45)';
  ctx.beginPath();
  ctx.ellipse(cx, 34, 116, 20, 0, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createLinearGradient(0, 4, 0, 46);
  g.addColorStop(0, '#42339A');
  g.addColorStop(1, '#231A5C');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, 25, 104, 20, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = colors.sky;
  ctx.stroke();
}

/** A neck and base for when only Rowdy's head fits. */
export function drawStand(ctx: Ctx): void {
  const cx = STAND.w / 2;
  glossyRect(ctx, cx - 60, 20, 120, 24, '#3A3270', {
    radius: 12,
    depth: 5,
    outline: OUTLINE,
    lineWidth: 4,
    gloss: 0.2,
    shadow: false,
  });
  neckSpring(ctx, cx);
}

// ─── LED faces ───
const LED = { cool: '#6FF3FF', warm: '#FFD54A', low: '#FF7CC0' } as const;
export const SCREEN = { w: 124, h: 82 };
const GRID = { cols: 16, rows: 9, pitch: 7.2 };

// 4 × 5 eye glyphs and 8 × 3 mouth glyphs ('#' = lit LED)
const EYES = {
  open: ['....', '.##.', '####', '####', '.##.'],
  blink: ['....', '....', '....', '####', '....'],
  happy: ['....', '.##.', '#..#', '#..#', '....'],
  wide: ['.##.', '#..#', '#..#', '#..#', '.##.'],
  x: ['....', '#..#', '.##.', '.##.', '#..#'],
} as const;
const MOUTHS = {
  smile: ['#......#', '.######.', '........'],
  grin: ['########', '.######.', '..####..'],
  o: ['...##...', '..#..#..', '...##...'],
  frown: ['........', '.######.', '#......#'],
  dots: ['........', '.#..#..#', '........'],
} as const;
interface FaceSpec {
  eye: keyof typeof EYES;
  mouth: keyof typeof MOUTHS;
  led: string;
  /** eye shift in LEDs (looking left/right) */
  look?: number;
}

export const FACES = {
  idle: { eye: 'open', mouth: 'smile', led: LED.cool },
  blink: { eye: 'blink', mouth: 'smile', led: LED.cool },
  thinking: { eye: 'open', mouth: 'dots', led: LED.cool, look: -1 },
  pleased: { eye: 'happy', mouth: 'grin', led: LED.warm },
  surprised: { eye: 'wide', mouth: 'o', led: LED.cool },
  defeated: { eye: 'x', mouth: 'frown', led: LED.low },
} as const satisfies Record<string, FaceSpec>;
export type FaceKey = keyof typeof FACES;

export function drawFace(ctx: Ctx, f: FaceSpec): void {
  const { w, h } = SCREEN;
  ctx.fillStyle = '#07102B';
  roundRectPath(ctx, 0, 0, w, h, 16);
  ctx.fill();
  const lit = new Set<string>();
  const put = (glyph: readonly string[], c0: number, r0: number, mirror = false) =>
    glyph.forEach((row, r) =>
      [...row].forEach(
        (ch, c) => ch === '#' && lit.add(`${c0 + (mirror ? row.length - 1 - c : c)},${r0 + r}`),
      ),
    );
  const look = f.look ?? 0;
  put(EYES[f.eye], 2 + look, 0);
  put(EYES[f.eye], 10 + look, 0, true);
  put(MOUTHS[f.mouth], 4, 6);
  const ox = (w - GRID.cols * GRID.pitch) / 2 + GRID.pitch / 2;
  const oy = (h - GRID.rows * GRID.pitch) / 2 + GRID.pitch / 2;
  const s = GRID.pitch * 0.8;
  for (let r = 0; r < GRID.rows; r++)
    for (let c = 0; c < GRID.cols; c++) {
      ctx.fillStyle = lit.has(`${c},${r}`) ? f.led : rgba(f.led, 0.09);
      roundRectPath(ctx, ox + c * GRID.pitch - s / 2, oy + r * GRID.pitch - s / 2, s, s, 1.5);
      ctx.fill();
    }
}

// ─── speech bubbles ───
const BUBBLE_BODY = { w: 264, h: 84 };
/** Texture size, the tail tip, and the centre of the text area, per tail direction. */
export const BUBBLES = {
  down: { w: 272, h: 122, tip: [126, 118], text: [136, 46] },
  left: { w: 298, h: 96, tip: [3, 50], text: [162, 46] },
} as const;
export type BubbleKey = keyof typeof BUBBLES;

export function drawBubble(ctx: Ctx, kind: BubbleKey): void {
  const bx = kind === 'down' ? 4 : 30;
  const [tx, ty] = BUBBLES[kind].tip;
  const body = () => roundRectPath(ctx, bx, 4, BUBBLE_BODY.w, BUBBLE_BODY.h, 24);
  const tail = () => {
    ctx.beginPath();
    if (kind === 'down') {
      ctx.moveTo(bx + 114, 80);
      ctx.lineTo(tx, ty - 4);
      ctx.lineTo(bx + 150, 80);
    } else {
      ctx.moveTo(bx + 8, 32);
      ctx.lineTo(tx + 4, ty);
      ctx.lineTo(bx + 8, 62);
    }
    ctx.closePath();
  };
  // Outline both shapes first, then fill both, so the tail joins the body without a seam.
  ctx.lineJoin = 'round';
  ctx.lineWidth = 6;
  ctx.strokeStyle = OUTLINE;
  ctx.fillStyle = colors.paper;
  for (const shape of [body, tail]) {
    shape();
    ctx.stroke();
  }
  for (const shape of [body, tail]) {
    shape();
    ctx.fill();
  }
}

// ─── glyphs, buttons, panels ───
export function drawBolt(ctx: Ctx, w: number, h: number, on: boolean): void {
  const pts = [
    [0.68, 0.06],
    [0.1, 0.58],
    [0.44, 0.58],
    [0.3, 0.94],
    [0.9, 0.4],
    [0.56, 0.4],
  ] as const;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h)));
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 2;
  ctx.strokeStyle = on ? shade(colors.orange, -0.45) : 'rgba(194,185,234,0.45)';
  ctx.stroke();
  ctx.fillStyle = on ? colors.yellow : colors.raised;
  ctx.fill();
}

export function drawStar(ctx: Ctx, s: number): void {
  starPath(ctx, s / 2, s / 2 + 1, 5, s / 2 - 1.5, s / 4.6);
  ctx.lineJoin = 'round';
  ctx.lineWidth = 2;
  ctx.fillStyle = colors.gold;
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
}

/** Candy button face: 'sunset' (primary, ink text), 'blue' or 'raised'. */
export function drawButton(
  ctx: Ctx,
  w: number,
  h: number,
  kind: 'sunset' | 'blue' | 'raised',
): void {
  const tile = { radius: 20, depth: 7, outline: OUTLINE, lineWidth: 3, shadow: false };
  if (kind !== 'sunset')
    return glossyRect(ctx, 0, 0, w, h, kind === 'blue' ? '#4B6FE0' : colors.raised, tile);
  glossyRect(ctx, 0, 0, w, h, colors.orange, tile);
  ctx.save();
  roundRectPath(ctx, 1.5, 1.5, w - 3, h - 10, 19);
  ctx.clip();
  fillGradient(ctx, 0, 0, w, h - 7, [shade(colors.pink, 0.15), colors.orange], 'h');
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(0, 0, w, (h - 7) * 0.45);
  ctx.restore();
  ctx.lineWidth = 3;
  ctx.strokeStyle = OUTLINE;
  roundRectPath(ctx, 1.5, 1.5, w - 3, h - 3, 20);
  ctx.stroke();
}

export function drawPanel(ctx: Ctx, w: number, h: number): void {
  glossyRect(ctx, 0, 0, w, h, colors.raised, {
    radius: 28,
    depth: 10,
    outline: OUTLINE,
    lineWidth: 4,
    gloss: 0.15,
    shadow: false,
  });
  ctx.strokeStyle = colors.line;
  ctx.lineWidth = 2;
  roundRectPath(ctx, 10, 10, w - 20, h - 30, 20);
  ctx.stroke();
}
