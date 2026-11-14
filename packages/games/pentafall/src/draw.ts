// Pentafall art: glossy jelly cells that carry their family's shape mark (so colour is never the only cue), the
// touch buttons and a few soft effect textures. Canvas 2D only; the scene draws each texture once (cells once per
// cell size) and shows the results as images.
import {
  colors,
  glossyCircle,
  glossyRect,
  luminance,
  rgba,
  roundRectPath,
  shade,
  SHAPES,
  starPath,
} from '@pocketcade/toolkit';
import { family, isMirror, type Family, type PieceId } from './pieces.ts';

type Ctx = CanvasRenderingContext2D;
type Shape = (typeof SHAPES)[keyof typeof SHAPES];

/** Family colours and their paired shapes; chalk pieces are a pale, unmarked jelly. */
export const FAMILY: Record<Family, { color: string; shape: Shape | null }> = {
  bar: { color: colors.purple, shape: SHAPES.purple },
  hook: { color: colors.green, shape: SHAPES.green },
  step: { color: colors.orange, shape: SHAPES.orange },
  block: { color: colors.vermillion, shape: SHAPES.vermillion },
  branch: { color: colors.sky, shape: SHAPES.sky },
  bolt: { color: colors.yellow, shape: SHAPES.yellow },
  kite: { color: colors.blue, shape: SHAPES.blue },
  chalk: { color: '#E6E0FF', shape: null },
};
const STONE = '#77709A';
export const colorOf = (id: PieceId) => FAMILY[family(id)].color;
/** Texture key of a cell: one per family × mirror × (falling | settled) × size in design units. */
export const cellKey = (id: PieceId, settled: boolean, size: number) =>
  `pf-${family(id)}${isMirror(id) ? 'm' : ''}${settled ? 's' : 'a'}-${size}`;

function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number, fill: string): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Adds the path of a family shape centred on (cx, cy). */
function glyphPath(ctx: Ctx, shape: Shape, cx: number, cy: number, r: number): void {
  const ring = (n: number, start: number) => {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = start + (i * 2 * Math.PI) / n;
      ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
    ctx.closePath();
  };
  if (shape === 'circle') {
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2);
  } else if (shape === 'square') ring(4, Math.PI / 4);
  else if (shape === 'triangle') {
    ctx.beginPath();
    for (let i = 0; i < 3; i++)
      ctx.lineTo(
        cx + r * 1.1 * Math.cos(-Math.PI / 2 + (i * 2 * Math.PI) / 3),
        cy + r * 0.2 + r * 1.1 * Math.sin(-Math.PI / 2 + (i * 2 * Math.PI) / 3),
      );
    ctx.closePath();
  } else if (shape === 'diamond') ring(4, -Math.PI / 2);
  else if (shape === 'hexagon') ring(6, 0);
  else if (shape === 'star') starPath(ctx, cx, cy + r * 0.08, 5, r * 1.1, r * 0.48);
  else {
    const t = r * 0.36;
    ctx.beginPath();
    for (const [x, y] of [
      [-t, -r],
      [t, -r],
      [t, -t],
      [r, -t],
      [r, t],
      [t, t],
      [t, r],
      [-t, r],
      [-t, t],
      [-r, t],
      [-r, -t],
      [-t, -t],
    ] as const)
      ctx.lineTo(cx + x, cy + y);
    ctx.closePath();
  }
}

/**
 * One jelly cell (s × s): a glossy candy block with a specular dot and its family mark pressed into the middle
 * (hollow for mirrored pieces). Settled cells are a touch darker and less shiny than the falling piece.
 */
export function jelly(
  ctx: Ctx,
  s: number,
  base: string,
  shape: Shape | null,
  hollow: boolean,
  settled: boolean,
): void {
  const b = settled ? shade(base, -0.14) : base;
  const inset = Math.max(1, s * 0.03);
  glossyRect(ctx, inset, inset, s - inset * 2, s - inset * 2, b, {
    radius: s * 0.26,
    depth: s * 0.1,
    outline: shade(b, -0.6),
    lineWidth: Math.max(1.5, s * 0.05),
    gloss: settled ? 0.3 : 0.5,
    shadow: false,
  });
  ellipse(ctx, s * 0.3, s * 0.24, s * 0.1, s * 0.065, `rgba(255,255,255,${settled ? 0.5 : 0.85})`);
  if (!shape) return;
  const ink = luminance(b) > 0.4;
  glyphPath(ctx, shape, s / 2, s * 0.47, s * 0.2);
  if (hollow) {
    ctx.lineWidth = s * 0.065;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = ink ? rgba(colors.ink, 0.6) : 'rgba(255,255,255,0.85)';
    ctx.stroke();
  } else {
    ctx.fillStyle = ink ? rgba(colors.ink, 0.5) : 'rgba(255,255,255,0.8)';
    ctx.fill();
  }
}

/** A settled cell turned to stone when the well fills. */
export function stone(ctx: Ctx, s: number): void {
  const inset = Math.max(1, s * 0.03);
  glossyRect(ctx, inset, inset, s - inset * 2, s - inset * 2, STONE, {
    radius: s * 0.2,
    depth: s * 0.1,
    outline: '#2E2850',
    lineWidth: Math.max(1.5, s * 0.05),
    gloss: 0.15,
    shadow: false,
  });
  ctx.strokeStyle = 'rgba(30,24,60,0.55)';
  ctx.lineWidth = Math.max(1.5, s * 0.04);
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(s * 0.25, s * 0.3);
  ctx.lineTo(s * 0.45, s * 0.5);
  ctx.lineTo(s * 0.4, s * 0.72);
  ctx.moveTo(s * 0.45, s * 0.5);
  ctx.lineTo(s * 0.7, s * 0.56);
  ctx.stroke();
}

/** A plain white cell: the flash over a piece that just settled. */
export function white(ctx: Ctx, s: number): void {
  const inset = Math.max(1, s * 0.03);
  roundRectPath(ctx, inset, inset, s - inset * 2, s - inset * 2, s * 0.26);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
}

/** Soft radial glow (white; tinted by the scene). */
export function glow(ctx: Ctx, s: number): void {
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
}

/** A vertical fade from nothing (top) to `color` (bottom): the streak behind a dropped piece, the danger glow flipped. */
export function fade(ctx: Ctx, w: number, h: number, color: string, alpha: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, rgba(color, 0));
  g.addColorStop(1, rgba(color, alpha));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

type ButtonIcon = 'turnLeft' | 'stash' | 'drop' | 'lines';

/** A white or ink icon centred on (cx, cy), radius r. */
function icon(ctx: Ctx, kind: ButtonIcon, cx: number, cy: number, r: number, color: string): void {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = r * 0.24;
  ctx.beginPath();
  if (kind === 'turnLeft') {
    ctx.arc(cx, cy + r * 0.1, r * 0.7, Math.PI * 1.15, Math.PI * 2.45);
    ctx.stroke();
    const [ax, ay] = [
      cx + r * 0.7 * Math.cos(Math.PI * 1.15),
      cy + r * 0.1 + r * 0.7 * Math.sin(Math.PI * 1.15),
    ];
    ctx.beginPath();
    ctx.moveTo(ax - r * 0.42, ay + r * 0.05);
    ctx.lineTo(ax + r * 0.05, ay - r * 0.42);
    ctx.lineTo(ax + r * 0.22, ay + r * 0.24);
    ctx.closePath();
    ctx.fill();
  } else if (kind === 'stash') {
    roundRectPath(ctx, cx - r * 0.8, cy - r * 0.35, r * 1.6, r * 1.05, r * 0.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.95, cy - r * 0.62);
    ctx.lineTo(cx + r * 0.95, cy - r * 0.62);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.3, cy + r * 0.05);
    ctx.lineTo(cx + r * 0.3, cy + r * 0.05);
    ctx.stroke();
  } else if (kind === 'drop') {
    ctx.moveTo(cx, cy - r * 0.85);
    ctx.lineTo(cx, cy + r * 0.25);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.55, cy - r * 0.05);
    ctx.lineTo(cx, cy + r * 0.5);
    ctx.lineTo(cx + r * 0.55, cy - r * 0.05);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.75, cy + r * 0.85);
    ctx.lineTo(cx + r * 0.75, cy + r * 0.85);
    ctx.stroke();
  } else {
    for (const dy of [-0.5, 0, 0.5]) {
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.7, cy + dy * r);
      ctx.lineTo(cx + r * 0.7, cy + dy * r);
      ctx.stroke();
    }
  }
}

/** A candy touch button (w × h) with its icon in the upper half; the label is a Phaser text below it. */
export function button(ctx: Ctx, w: number, h: number, base: string, kind: ButtonIcon): void {
  glossyRect(ctx, 2, 2, w - 4, h - 4, base, {
    radius: 22,
    depth: 8,
    outline: colors.ink,
    lineWidth: 3,
    gloss: 0.45,
    shadow: false,
  });
  icon(ctx, kind, w / 2, h * 0.36, h * 0.2, colors.ink);
}

/** Round HUD badge with an icon (swapped into a hudPill). */
export function badge(ctx: Ctx, size: number, base: string, kind: ButtonIcon): void {
  const c = size / 2;
  glossyCircle(ctx, c, c, c - 1.5, base, { shadow: false });
  icon(ctx, kind, c, c, c * 0.55, '#FFFFFF');
}
