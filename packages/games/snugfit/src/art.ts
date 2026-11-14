// Snugfit art, drawn with Canvas 2D in design units: fabric patches, the quilt, tray slots, Purl the cat, the
// sewing props, the needle and thread, and the room's light. Pure drawing; the scene turns these into textures.
import { rgba, roundRectPath, shade } from '@pocketcade/toolkit';
import { BIND } from './layout.ts';
import { SIZE } from './logic.ts';

type Ctx = CanvasRenderingContext2D;

export type Pattern = 'gingham' | 'dots' | 'stripes' | 'chevrons' | 'plus' | 'diamonds';

/** Fabric for colour codes 1..6. Each colour has its own pattern, so no patch relies on colour alone. */
export const FABRICS: readonly { color: string; pattern: Pattern }[] = [
  { color: '#FF4FA3', pattern: 'gingham' },
  { color: '#3F8CFF', pattern: 'dots' },
  { color: '#FFB61F', pattern: 'stripes' },
  { color: '#1FC777', pattern: 'chevrons' },
  { color: '#8A63FF', pattern: 'plus' },
  { color: '#FF7438', pattern: 'diamonds' },
];

export const QUILT = {
  base: '#FFF6EA',
  well: '#F0E0CB',
  bind: '#3A2A8A',
  stitch: '#FFDF94',
} as const;

export const INK = '#3B2466';
const CAT = { fur: '#FFA64D', stripe: '#EE7B22', cream: '#FFF1DC', pink: '#FF7FA8' } as const;

/**
 * The room's light by score: morning, afternoon, golden hour, lamplit night. `table` tints the table and props,
 * `beam` and `beamAlpha` colour the window light, `lamp` is the strength of the lamp glow.
 */
export const LIGHTS = [
  { from: 0, table: '#C4EAFF', beam: '#FFFFFF', beamAlpha: 0.62, lamp: 0 },
  { from: 300, table: '#FFEBAE', beam: '#FFF7C9', beamAlpha: 0.6, lamp: 0 },
  { from: 1000, table: '#FFC08C', beam: '#FFE08A', beamAlpha: 0.58, lamp: 0 },
  { from: 2500, table: '#5148B4', beam: '#8F86FF', beamAlpha: 0, lamp: 1 },
] as const;

export function lightFor(score: number): number {
  let i = 0;
  while (i + 1 < LIGHTS.length && score >= LIGHTS[i + 1]!.from) i++;
  return i;
}

function fabricPattern(ctx: Ctx, pattern: Pattern, x: number, y: number, w: number, h: number) {
  const s = w;
  ctx.fillStyle = 'rgba(255,255,255,0.26)';
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
  switch (pattern) {
    case 'gingham': {
      const band = s / 5;
      for (const k of [1, 3]) {
        ctx.fillRect(x + band * k, y, band, h);
        ctx.fillRect(x, y + band * k, w, band);
      }
      break;
    }
    case 'dots': {
      ctx.fillStyle = 'rgba(255,255,255,0.72)';
      const step = s / 3;
      for (let r = 0; r < 4; r++)
        for (let c = 0; c < 4; c++) {
          ctx.beginPath();
          ctx.arc(
            x + step * (c + (r % 2 ? 0 : 0.5)),
            y + step * (r + 0.42),
            s * 0.062,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
      break;
    }
    case 'stripes': {
      ctx.lineWidth = s * 0.105;
      ctx.strokeStyle = 'rgba(255,255,255,0.46)';
      for (let k = -h; k < w; k += s * 0.3) {
        ctx.beginPath();
        ctx.moveTo(x + k, y + h);
        ctx.lineTo(x + k + h, y);
        ctx.stroke();
      }
      break;
    }
    case 'chevrons': {
      ctx.lineWidth = s * 0.07;
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      const step = s / 4;
      for (const fy of [0.3, 0.56, 0.82]) {
        ctx.beginPath();
        for (let i = -1; i <= 5; i++) {
          const px = x + step * i;
          const py = y + h * fy + (i % 2 ? -s * 0.085 : s * 0.085);
          if (i === -1) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      break;
    }
    case 'plus': {
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      const arm = s * 0.085;
      const thick = s * 0.05;
      for (const [fx, fy] of [
        [0.3, 0.3],
        [0.7, 0.3],
        [0.5, 0.52],
        [0.3, 0.74],
        [0.7, 0.74],
      ] as const) {
        const cx = x + w * fx;
        const cy = y + h * fy;
        ctx.fillRect(cx - arm, cy - thick / 2, arm * 2, thick);
        ctx.fillRect(cx - thick / 2, cy - arm, thick, arm * 2);
      }
      break;
    }
    case 'diamonds': {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      const d = s * 0.105;
      for (const [fx, fy] of [
        [0.3, 0.3],
        [0.7, 0.3],
        [0.5, 0.52],
        [0.3, 0.74],
        [0.7, 0.74],
      ] as const) {
        const cx = x + w * fx;
        const cy = y + h * fy;
        ctx.beginPath();
        ctx.moveTo(cx, cy - d);
        ctx.lineTo(cx + d, cy);
        ctx.lineTo(cx, cy + d);
        ctx.lineTo(cx - d, cy);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
  }
}

/** One fabric square of size s: a puffy patch with its pattern, a darker rim and a stitched edge. */
export function drawPatch(ctx: Ctx, s: number, colour: number): void {
  const { color, pattern } = FABRICS[colour - 1]!;
  const gap = s * 0.03;
  const lip = s * 0.065;
  const w = s - gap * 2;
  const face = w - lip;
  const r = s * 0.17;
  ctx.fillStyle = shade(color, -0.38);
  roundRectPath(ctx, gap, gap + lip, w, face, r);
  ctx.fill();
  const g = ctx.createLinearGradient(0, gap, 0, gap + face);
  g.addColorStop(0, shade(color, 0.16));
  g.addColorStop(1, color);
  ctx.fillStyle = g;
  roundRectPath(ctx, gap, gap, w, face, r);
  ctx.fill();
  ctx.save();
  ctx.clip();
  fabricPattern(ctx, pattern, gap, gap, w, face);
  ctx.restore();
  const lw = Math.max(1.5, s * 0.03);
  ctx.lineWidth = lw;
  ctx.strokeStyle = shade(color, -0.34);
  roundRectPath(ctx, gap + lw / 2, gap + lw / 2, w - lw, face - lw, r - lw / 2);
  ctx.stroke();
  // stitches
  const inset = s * 0.115;
  ctx.setLineDash([s * 0.085, s * 0.08]);
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1.5, s * 0.034);
  ctx.strokeStyle = '#FFFFFF';
  roundRectPath(ctx, gap + inset, gap + inset, w - inset * 2, face - inset * 2, r * 0.5);
  ctx.stroke();
  ctx.setLineDash([]);
}

/** Margin around the quilt texture for its shadow. */
export const QUILT_PAD = 14;

/** The empty quilt: shadow, stitched binding and 8 × 8 pale squares. Canvas is the quilt plus QUILT_PAD all round. */
export function drawQuilt(ctx: Ctx, cell: number): void {
  const grid = cell * SIZE;
  const outer = grid + BIND * 2;
  const p = QUILT_PAD;
  ctx.save();
  ctx.shadowColor = 'rgba(40,20,90,0.35)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 5;
  ctx.fillStyle = QUILT.bind;
  roundRectPath(ctx, p, p, outer, outer, 24);
  ctx.fill();
  ctx.restore();
  // binding highlight and stitches
  ctx.strokeStyle = shade(QUILT.bind, 0.2);
  ctx.lineWidth = 2;
  roundRectPath(ctx, p + 1, p + 1, outer - 2, outer - 2, 23);
  ctx.stroke();
  ctx.setLineDash([9, 7]);
  ctx.lineCap = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = QUILT.stitch;
  roundRectPath(ctx, p + BIND / 2, p + BIND / 2, outer - BIND, outer - BIND, 18);
  ctx.stroke();
  ctx.setLineDash([]);
  // field
  ctx.fillStyle = QUILT.base;
  roundRectPath(ctx, p + BIND - 2, p + BIND - 2, grid + 4, grid + 4, 12);
  ctx.fill();
  ctx.fillStyle = QUILT.well;
  const inset = Math.max(2, cell * 0.035);
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) {
      roundRectPath(
        ctx,
        p + BIND + c * cell + inset,
        p + BIND + r * cell + inset,
        cell - inset * 2,
        cell - inset * 2,
        cell * 0.15,
      );
      ctx.fill();
    }
}

/** A felt-lined tray slot; `selected` adds a gold rim. */
export function drawSlot(ctx: Ctx, w: number, h: number, selected: boolean): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#3D2E92');
  g.addColorStop(1, '#2C2070');
  ctx.fillStyle = g;
  roundRectPath(ctx, 2, 2, w - 4, h - 4, 26);
  ctx.fill();
  ctx.lineWidth = selected ? 5 : 3;
  ctx.strokeStyle = selected ? '#FFC83D' : '#231A5C';
  roundRectPath(ctx, 2.5, 2.5, w - 5, h - 5, 26);
  ctx.stroke();
  ctx.setLineDash([9, 8]);
  ctx.lineCap = 'round';
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = selected ? 'rgba(255,225,150,0.85)' : 'rgba(170,155,245,0.7)';
  roundRectPath(ctx, 11, 11, w - 22, h - 22, 18);
  ctx.stroke();
  ctx.setLineDash([]);
}

/** A soft ground shadow under a prop. */
function groundShadow(ctx: Ctx, cx: number, cy: number, rx: number, ry: number): void {
  ctx.fillStyle = 'rgba(40,20,90,0.16)';
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

export type Mood = 'doze' | 'perk' | 'worry';
export const PURL_TEX = { w: 300, h: 240 } as const;

function ear(ctx: Ctx, pts: readonly [number, number][], inner: readonly [number, number][]) {
  const path = (p: readonly [number, number][]) => {
    ctx.beginPath();
    ctx.moveTo(p[0]![0], p[0]![1]);
    ctx.lineTo(p[1]![0], p[1]![1]);
    ctx.lineTo(p[2]![0], p[2]![1]);
    ctx.closePath();
  };
  ctx.lineJoin = 'round';
  ctx.lineWidth = 5;
  ctx.strokeStyle = INK;
  ctx.fillStyle = CAT.fur;
  path(pts);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = CAT.pink;
  path(inner);
  ctx.fill();
}

/** Purl, a round marmalade cat, in a 300 × 240 box with the feet on the bottom edge. */
export function drawPurl(ctx: Ctx, mood: Mood): void {
  const cx = 150;
  groundShadow(ctx, cx, 228, 118, 10);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // tail: curled round the feet while dozing, up when perky, tucked low when worried
  const tail = new Path2D(
    mood === 'perk'
      ? 'M246 186 C292 176 296 120 268 96'
      : mood === 'worry'
        ? 'M244 200 C276 206 290 196 284 178'
        : 'M240 196 C282 214 250 232 196 226',
  );
  ctx.strokeStyle = INK;
  ctx.lineWidth = 32;
  ctx.stroke(tail);
  ctx.strokeStyle = CAT.fur;
  ctx.lineWidth = 22;
  ctx.stroke(tail);

  // ears (behind the body)
  if (mood === 'worry') {
    ear(
      ctx,
      [
        [70, 112],
        [36, 70],
        [112, 74],
      ],
      [
        [74, 100],
        [54, 78],
        [98, 80],
      ],
    );
    ear(
      ctx,
      [
        [230, 112],
        [264, 70],
        [188, 74],
      ],
      [
        [226, 100],
        [246, 78],
        [202, 80],
      ],
    );
  } else {
    const tip = mood === 'perk' ? 22 : 34;
    ear(
      ctx,
      [
        [66, 104],
        [80, tip],
        [130, 66],
      ],
      [
        [80, 92],
        [86, tip + 22],
        [112, 72],
      ],
    );
    ear(
      ctx,
      [
        [234, 104],
        [220, tip],
        [170, 66],
      ],
      [
        [220, 92],
        [214, tip + 22],
        [188, 72],
      ],
    );
  }

  // body
  const body = new Path2D();
  body.ellipse(cx, 146, 114, 86, 0, 0, Math.PI * 2);
  ctx.fillStyle = CAT.fur;
  ctx.fill(body);
  ctx.save();
  ctx.clip(body);
  // stripes on the forehead and flanks
  ctx.strokeStyle = CAT.stripe;
  ctx.lineWidth = 9;
  for (const d of [
    'M150 60 L150 86',
    'M128 64 L132 84',
    'M172 64 L168 84',
    'M36 132 L62 138',
    'M38 160 L62 160',
    'M264 132 L238 138',
    'M262 160 L238 160',
  ])
    ctx.stroke(new Path2D(d));
  // cream chest
  ctx.fillStyle = CAT.cream;
  ctx.beginPath();
  ctx.ellipse(cx, 200, 62, 46, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5;
  ctx.stroke(body);

  // cheeks
  ctx.fillStyle = rgba(CAT.pink, 0.55);
  for (const x of [84, 216]) {
    ctx.beginPath();
    ctx.ellipse(x, 152, 15, 9, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // eyes
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineWidth = 5;
  for (const x of [110, 190]) {
    if (mood === 'doze') {
      ctx.beginPath();
      ctx.arc(x, 122, 14, Math.PI * 0.12, Math.PI * 0.88);
      ctx.stroke();
    } else if (mood === 'perk') {
      ctx.beginPath();
      ctx.ellipse(x, 126, 13, 17, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(x - 4, 119, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + 5, 132, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = INK;
    } else {
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(x, 128, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(x, 130, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (mood === 'worry') {
    ctx.lineWidth = 5;
    ctx.stroke(new Path2D('M90 104 L122 96 M210 104 L178 96'));
    // sweat drop
    ctx.fillStyle = '#6FD3FF';
    ctx.lineWidth = 3;
    const drop = new Path2D('M246 70 C256 86 258 94 246 98 C234 94 236 86 246 70 Z');
    ctx.fill(drop);
    ctx.stroke(drop);
  }

  // nose and mouth
  ctx.fillStyle = CAT.pink;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  const nose = new Path2D('M142 146 L158 146 L150 156 Z');
  ctx.fill(nose);
  ctx.stroke(nose);
  ctx.lineWidth = 4;
  if (mood === 'perk') {
    const mouth = new Path2D('M134 160 Q150 186 166 160 Z');
    ctx.fillStyle = '#E8456F';
    ctx.fill(mouth);
    ctx.stroke(mouth);
  } else if (mood === 'worry') {
    ctx.stroke(new Path2D('M132 170 Q138 162 144 170 T156 170 T168 170'));
  } else {
    ctx.stroke(new Path2D('M150 156 Q150 166 140 166 M150 156 Q150 166 160 166'));
  }
  // whiskers
  ctx.lineWidth = 3;
  ctx.stroke(new Path2D('M70 140 L46 134 M70 150 L44 152 M230 140 L254 134 M230 150 L256 152'));

  // paws
  ctx.fillStyle = CAT.cream;
  ctx.lineWidth = 5;
  for (const x of [118, 182]) {
    ctx.beginPath();
    ctx.ellipse(x, 222, 24, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  if (mood === 'doze') {
    ctx.lineWidth = 5;
    ctx.stroke(new Path2D('M244 50 L262 50 L244 72 L262 72'));
    ctx.lineWidth = 4;
    ctx.stroke(new Path2D('M272 18 L285 18 L272 34 L285 34'));
  }
}

/** A ball of yarn (100 × 100) with a loose end. */
export function drawYarn(ctx: Ctx, color: string): void {
  groundShadow(ctx, 50, 92, 38, 6);
  ctx.lineCap = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 9;
  const loose = new Path2D('M30 84 C14 92 8 78 4 88');
  ctx.stroke(loose);
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.stroke(loose);
  const ball = new Path2D();
  ball.arc(50, 54, 38, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill(ball);
  ctx.save();
  ctx.clip(ball);
  ctx.strokeStyle = shade(color, 0.38);
  ctx.lineWidth = 4;
  for (const d of [
    'M10 40 Q50 10 92 46',
    'M8 58 Q50 30 94 64',
    'M14 78 Q52 52 90 84',
    'M36 14 Q70 50 44 96',
    'M60 12 Q92 52 66 96',
  ])
    ctx.stroke(new Path2D(d));
  ctx.restore();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4.5;
  ctx.stroke(ball);
}

/** A spool of thread (76 × 96). */
export function drawSpool(ctx: Ctx, color: string): void {
  groundShadow(ctx, 38, 90, 34, 6);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  ctx.fillStyle = color;
  roundRectPath(ctx, 12, 16, 52, 62, 6);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = shade(color, -0.25);
  ctx.lineWidth = 3;
  for (let y = 26; y < 74; y += 9) {
    ctx.beginPath();
    ctx.moveTo(15, y + 3);
    ctx.lineTo(61, y);
    ctx.stroke();
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  ctx.fillStyle = '#FFE9C4';
  for (const y of [4, 72]) {
    roundRectPath(ctx, 4, y, 68, 16, 7);
    ctx.fill();
    ctx.stroke();
  }
}

/** A tomato pincushion with pins (120 × 100). */
export function drawPincushion(ctx: Ctx): void {
  groundShadow(ctx, 60, 92, 50, 7);
  ctx.lineCap = 'round';
  // pins behind the dome
  const pins: readonly [number, number, number, number, string][] = [
    [40, 44, 22, 12, '#FFC83D'],
    [60, 38, 62, 6, '#38D6FF'],
    [80, 44, 100, 14, '#B8F34A'],
  ];
  for (const [x0, y0, x1, y1, color] of pins) {
    ctx.strokeStyle = '#8D93B8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x1, y1, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  const dome = new Path2D('M10 78 C10 30 110 30 110 78 C110 96 10 96 10 78 Z');
  ctx.fillStyle = '#FF5A7A';
  ctx.fill(dome);
  ctx.save();
  ctx.clip(dome);
  ctx.strokeStyle = '#E03A62';
  ctx.lineWidth = 3;
  ctx.stroke(new Path2D('M60 36 L60 96 M60 38 C30 50 24 76 26 96 M60 38 C90 50 96 76 94 96'));
  ctx.restore();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  ctx.stroke(dome);
  ctx.fillStyle = '#1FC777';
  const leaf = new Path2D('M60 36 L50 28 L60 30 L62 20 L66 30 L76 28 L66 38 Z');
  ctx.fill(leaf);
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.stroke(leaf);
}

/** A pair of scissors lying open (150 × 130). */
export function drawScissors(ctx: Ctx): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const blade = (d: string) => {
    const p = new Path2D(d);
    ctx.fillStyle = '#DDE3F5';
    ctx.fill(p);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    ctx.stroke(p);
  };
  blade('M56 58 L146 26 L72 80 Z');
  blade('M56 74 L146 106 L72 52 Z');
  for (const cy of [34, 98]) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.ellipse(32, cy, 20, 15, cy < 66 ? 0.5 : -0.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#FF4FA3';
    ctx.lineWidth = 8;
    ctx.stroke();
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 14;
  ctx.stroke(new Path2D('M48 44 L66 62 M48 88 L66 70'));
  ctx.strokeStyle = '#FF4FA3';
  ctx.lineWidth = 6;
  ctx.stroke(new Path2D('M48 44 L66 62 M48 88 L66 70'));
  ctx.fillStyle = '#FFC83D';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(70, 66, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

/** A sewing needle pointing right, `w` long and 16 tall. */
export function drawNeedle(ctx: Ctx, w: number): void {
  const body = new Path2D(`M3 8 C3 2 14 2 22 4 L${w - 2} 8 L22 12 C14 14 3 14 3 8 Z`);
  ctx.fillStyle = '#EEF2FF';
  ctx.fill(body);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.stroke(body);
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.ellipse(13, 8, 5.5, 2.2, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** A run of gold stitches `w` long and 12 tall, laid along a stitched line. */
export function drawThread(ctx: Ctx, w: number): void {
  ctx.lineCap = 'round';
  ctx.setLineDash([w / 26, w / 34]);
  for (const [color, width] of [
    [INK, 9],
    ['#FFD24D', 5],
  ] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(6, 6);
    ctx.lineTo(w - 6, 6);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

/** A coat button of size s in a fabric colour. */
export function drawButton(ctx: Ctx, s: number, colour: number): void {
  const color = FABRICS[colour - 1]!.color;
  const c = s / 2;
  ctx.fillStyle = color;
  ctx.strokeStyle = shade(color, -0.42);
  ctx.lineWidth = s * 0.09;
  ctx.beginPath();
  ctx.arc(c, c, c - ctx.lineWidth / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = shade(color, 0.4);
  ctx.lineWidth = s * 0.07;
  ctx.beginPath();
  ctx.arc(c, c, c * 0.56, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = shade(color, -0.5);
  for (const dx of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(c + dx * s * 0.11, c, s * 0.065, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** A white thread scrap (32 × 14); tint it to a fabric colour. */
export function drawScrap(ctx: Ctx): void {
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 4.5;
  ctx.stroke(new Path2D('M4 8 Q10 0 16 7 T28 6'));
}

/**
 * The sewing table across the whole canvas (the design area plus the bleed): near-white boards, so the scene
 * takes the colour of whatever light tints it.
 */
export function drawTable(ctx: Ctx, w: number, h: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#FFFFFF');
  g.addColorStop(1, '#F1ECF7');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const board = 172;
  ctx.fillStyle = 'rgba(96,84,160,0.07)';
  for (let y = 0, row = 0; y < h; y += board, row++) {
    if (row % 2) ctx.fillRect(0, y, w, board);
  }
  ctx.strokeStyle = 'rgba(70,56,140,0.22)';
  ctx.lineWidth = 3;
  for (let y = 0, row = 0; y < h; y += board, row++) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
    // board ends, staggered like floorboards
    for (let x = (row % 3) * 310 + 140; x < w; x += 930) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + board);
      ctx.stroke();
    }
  }
}

export const BEAM = { w: 820, h: 760 } as const;

/** Sunlight through a four-pane window, falling across the table as soft skewed patches (white; tint it). */
export function drawBeam(ctx: Ctx): void {
  // drawn far off-canvas with a shadow offset, so only the blurred copy lands on the texture
  const far = 4000;
  ctx.shadowColor = '#FFFFFF';
  ctx.shadowBlur = 26;
  ctx.shadowOffsetX = far;
  ctx.fillStyle = '#FFFFFF';
  const pane = (x: number, y: number) => {
    ctx.beginPath();
    ctx.moveTo(x - far, y);
    ctx.lineTo(x + 250 - far, y + 40);
    ctx.lineTo(x + 420 - far, y + 300);
    ctx.lineTo(x + 170 - far, y + 260);
    ctx.closePath();
    ctx.fill();
  };
  pane(40, 30);
  pane(320, 76);
  pane(226, 316);
  pane(506, 362);
}

/** A soft round glow of size s (white; tint it). */
export function drawGlow(ctx: Ctx, s: number): void {
  const c = s / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.4)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
}
