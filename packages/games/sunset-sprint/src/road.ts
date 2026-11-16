// The pseudo-3D road view. Each frame it projects DRAW + 1 segment edges (track.ts), draws the road near to far into
// one Graphics (cleared each frame; segments hidden behind a crest are skipped, partly hidden ones clipped), then
// fills a pool of images far to near with props, the checkpoint arch and traffic, scaled by the projection and
// cropped where a nearer crest hides them. Near the camera every segment is drawn with its stripes; farther out,
// where a stripe is thinner than a pixel, runs of segments are drawn as one piece in the stripes' average colour.
// The road and roadside reach past the design area on every side, so they fill wide and tall frames.
// Typed arrays and the pool are reused: a frame allocates nothing.
import type Phaser from 'phaser';
import { colorNum, mixHex } from '@pocketcade/toolkit';
import * as art from './art.ts';
import { MAX_CARS, type Run } from './sim.ts';
import {
  CAM_H,
  CURVE_M,
  DRAW,
  LINE_CP,
  PLAYER_DIST,
  PROP,
  ROAD_HALF,
  SEG,
  STRIPE_SEGS,
  VIEW,
  heightAt,
  project,
  segmentAt,
  themeAtZ,
  type PropKind,
  type Theme,
} from './track.ts';

const POOL = 140;
const FOG_LEVELS = 8;
/** how much of the fog colour the farthest segment takes */
const FOG_MAX = 0.82;
/** edges closer to the camera than this (m) aren't projected */
const NEAR_Z = 0.6;
/** rumble strip and lane line widths, as fractions of the road half-width */
const RUMBLE_W = 0.13;
const LINE_W = 0.014;
const CHECKS = 10;
/** the lane lines between the three lanes, in road half-widths */
const LANES = [-1 / 3, 1 / 3] as const;
const HALF_W = VIEW.w / 2;
/** scenery reaches this far past the widest and tallest view, so a camera shake never shows a gap */
export const MARGIN = 24;
/** sprites shorter than this (design units) aren't drawn */
const MIN_H = 2;
/** from this segment on, the road is drawn in runs of FAR_RUN segments (one pair of stripes) */
const FAR_FROM = 48;
const FAR_RUN = STRIPE_SEGS * 2;
/** the colour slot of a far run: the average of the two stripes */
const AVG = 2;
/** a car this close to the camera (m) has faded out; it is solid from NEAR_FADE further */
const NEAR_GONE = 2.2;
const NEAR_FADE = 2.6;

export const PROP_KEYS: readonly string[] = Array.from({ length: 11 }, (_, k) => `ss-p-${k}`);
export const WARM_ROCK = 'ss-p-rock-warm';
export const CAR_KEYS: readonly string[] = ['ss-car0', 'ss-car1', 'ss-car2', 'ss-car3'];

/** Colour per stripe (0, 1 or their average) and fog level, as Phaser colour numbers. */
interface Shades {
  road: number[][];
  rumble: number[][];
  band: number[][];
  check: number[][];
  /** lane lines: on a striped segment, and averaged with the road for far runs */
  lane: number[][];
  ground: number;
}

function shadesFor(t: Theme): Shades {
  const p = art.ROAD[t];
  const ramp = (hex: string) =>
    Array.from({ length: FOG_LEVELS }, (_, l) =>
      colorNum(mixHex(hex, p.fog, (l / (FOG_LEVELS - 1)) * FOG_MAX)),
    );
  const stripes = (pair: readonly [string, string]) =>
    [pair[0], pair[1], mixHex(pair[0], pair[1], 0.5)].map(ramp);
  return {
    road: stripes(p.road),
    rumble: stripes(p.rumble),
    band: stripes(p.band),
    check: ['#2B1638', '#FFF6EA'].map(ramp),
    lane: [p.lane, mixHex(mixHex(p.road[0], p.road[1], 0.5), p.lane, 0.5)].map(ramp),
    ground: colorNum(art.farGround(t)),
  };
}

export type RoadView = ReturnType<typeof createRoadView>;

/** `bleed`: how far the widest and tallest views reach past the design area (design units). */
export function createRoadView(scene: Phaser.Scene, bleed: { x: number; y: number }) {
  const left = -bleed.x - MARGIN;
  const right = VIEW.w + bleed.x + MARGIN;
  const bottom = VIEW.h + bleed.y + MARGIN;
  const layer = scene.add.container(0, 0).setDepth(100);
  const g = scene.add.graphics();
  layer.add(g);
  const pool: Phaser.GameObjects.Image[] = [];
  for (let k = 0; k < POOL; k++) {
    const img = scene.add.image(0, 0, CAR_KEYS[0]!).setOrigin(0.5, 1).setVisible(false);
    pool.push(img);
    layer.add(img);
  }
  const keys: string[] = pool.map(() => CAR_KEYS[0]!);
  const cropped = new Uint8Array(POOL);
  const flipped = new Uint8Array(POOL);
  const foot = new Float32Array(POOL).fill(0.5);
  const shades = [shadesFor(0), shadesFor(1), shadesFor(2)];
  const fogOf = Uint8Array.from({ length: DRAW }, (_, n) =>
    Math.min(FOG_LEVELS - 1, Math.floor((n / DRAW) ** 1.5 * FOG_LEVELS)),
  );
  // projected edges 0..DRAW (edge n = near edge of drawn segment n), and each segment's clip line
  const ex = new Float32Array(DRAW + 1);
  const ey = new Float32Array(DRAW + 1);
  const ew = new Float32Array(DRAW + 1);
  const es = new Float32Array(DRAW + 1);
  const clip = new Float32Array(DRAW);
  const carN = new Int16Array(MAX_CARS);
  const carF = new Float32Array(MAX_CARS);
  const p = { x: 0, y: 0, w: 0, s: 0 };
  let used = 0;
  let shown = 0;

  function trap(x1l: number, x1r: number, y1: number, x2l: number, x2r: number, y2: number): void {
    g.fillTriangle(x1l, y1, x1r, y1, x2r, y2);
    g.fillTriangle(x1l, y1, x2r, y2, x2l, y2);
  }

  /**
   * The road between edges n and m in colour slot `stripe`. Its near edge is clipped at `maxy`; `stretch` instead
   * carries the nearest piece down to `maxy`, so the road always reaches the bottom of a tall view.
   */
  function piece(
    n: number,
    m: number,
    theme: Theme,
    stripe: number,
    line: number,
    maxy: number,
    stretch: boolean,
  ): void {
    let x1 = ex[n]!;
    let y1 = ey[n]!;
    let w1 = ew[n]!;
    const x2 = ex[m]!;
    const y2 = ey[m]!;
    const w2 = ew[m]!;
    if (y1 > maxy || stretch) {
      const f = Math.min(4, (maxy - y2) / (y1 - y2));
      x1 = x2 + (x1 - x2) * f;
      w1 = w2 + (w1 - w2) * f;
      y1 = y2 + (y1 - y2) * f;
    }
    const sh = shades[theme]!;
    const fog = fogOf[n]!;
    const r1 = w1 * RUMBLE_W;
    const r2 = w2 * RUMBLE_W;
    // the roadside either side of the rumble strips (the road isn't painted twice)
    const o1 = w1 + r1;
    const o2 = w2 + r2;
    g.fillStyle(sh.band[stripe]![fog]!);
    if (x1 - o1 > left || x2 - o2 > left)
      trap(Math.min(left, x1 - o1), x1 - o1, y1, Math.min(left, x2 - o2), x2 - o2, y2);
    if (x1 + o1 < right || x2 + o2 < right)
      trap(x1 + o1, Math.max(right, x1 + o1), y1, x2 + o2, Math.max(right, x2 + o2), y2);
    g.fillStyle(sh.rumble[stripe]![fog]!);
    trap(x1 - w1 - r1, x1 - w1, y1, x2 - w2 - r2, x2 - w2, y2);
    trap(x1 + w1, x1 + w1 + r1, y1, x2 + w2, x2 + w2 + r2, y2);
    if (line) {
      // a checkered start or checkpoint line, two rows deep
      for (let c = 0; c < CHECKS; c++) {
        const a = -1 + (2 * c) / CHECKS;
        const b = a + 2 / CHECKS;
        g.fillStyle(sh.check[(c + line) & 1]![fog]!);
        trap(x1 + w1 * a, x1 + w1 * b, y1, x2 + w2 * a, x2 + w2 * b, y2);
      }
      return;
    }
    g.fillStyle(sh.road[stripe]![fog]!);
    trap(x1 - w1, x1 + w1, y1, x2 - w2, x2 + w2, y2);
    // lane dashes on every other stripe; far runs get a fainter unbroken line
    if (!stripe) return;
    g.fillStyle(sh.lane[stripe - 1]![fog]!);
    for (const k of LANES) {
      const c1 = x1 + w1 * k;
      const c2 = x2 + w2 * k;
      const l1 = w1 * LINE_W;
      const l2 = w2 * LINE_W;
      trap(c1 - l1, c1 + l1, y1, c2 - l2, c2 + l2, y2);
    }
  }

  /** Shows the next pooled image: bottom-centre (at its foot) on (x, y), w × h, cropped below `clipY`. */
  function place(
    key: string,
    x: number,
    y: number,
    w: number,
    h: number,
    footX: number,
    flip: boolean,
    clipY: number,
    alpha: number,
  ): void {
    if (h < MIN_H || used >= POOL || y - h >= clipY || x + w < left || x - w > right) return;
    const k = used++;
    const img = pool[k]!;
    if (keys[k] !== key) {
      keys[k] = key;
      img.setTexture(key);
    }
    // Phaser mirrors a flipped image around its origin, so the foot stays put
    if (foot[k] !== footX) {
      foot[k] = footX;
      img.setOrigin(footX, 1);
    }
    if (flipped[k] !== +flip) {
      flipped[k] = +flip;
      img.setFlipX(flip);
    }
    img.setPosition(x, y).setDisplaySize(w, h).setAlpha(alpha).setVisible(true);
    if (y > clipY) {
      img.setCrop(0, 0, img.frame.width, img.frame.height * ((clipY - (y - h)) / h));
      cropped[k] = 1;
    } else if (cropped[k]) {
      img.setCrop();
      cropped[k] = 0;
    }
  }

  return {
    /** Draws the road and its sprites for the run's current position. */
    draw(run: Run): void {
      const t = run.track;
      const camZ = run.z - PLAYER_DIST;
      const baseIdx = Math.floor(camZ / SEG);
      const base = segmentAt(t, camZ);
      const pct = camZ / SEG - baseIdx;
      const camY = heightAt(t, run.z) + CAM_H;
      const camX = run.x * ROAD_HALF;

      // 1. project the edges, bending the road by each segment's curve
      let x = 0;
      let dx = -t.curve[base]! * pct * CURVE_M;
      for (let n = 0; n <= DRAW; n++) {
        const i = (base + n) % t.n;
        const dz = (baseIdx + n) * SEG - camZ;
        if (dz > NEAR_Z) {
          project(p, x, t.y[i]!, dz, camX, camY);
          ex[n] = p.x;
          ey[n] = p.y;
          ew[n] = p.w;
          es[n] = p.s;
        } else es[n] = 0;
        x += dx;
        dx += t.curve[i]! * CURVE_M;
      }

      // 2. the road, near to far; each piece is clipped by the nearer road already drawn
      g.clear();
      let maxy = bottom;
      let nearest = true;
      for (let n = 0; n < DRAW;) {
        // far runs start on a stripe pair, so the pattern doesn't swim as the camera moves
        const far = n >= FAR_FROM && (baseIdx + n) % FAR_RUN === 0;
        const m = far ? Math.min(DRAW, n + FAR_RUN) : n + 1;
        for (let k = n; k < m; k++) clip[k] = maxy;
        const y2 = ey[m]!;
        if (es[n] && es[m] && y2 < ey[n]! && y2 < maxy) {
          const i = (base + n) % t.n;
          const stripe = far ? AVG : Math.floor(i / STRIPE_SEGS) & 1;
          piece(n, m, t.theme[i] as Theme, stripe, far ? 0 : t.line[i]!, maxy, nearest);
          maxy = y2;
          nearest = false;
        }
        n = m;
      }
      // where the road dips below the horizon, the far ground fills the gap above it (nothing is drawn twice)
      if (maxy > VIEW.horizon + 2) {
        g.fillStyle(shades[themeAtZ(run.z)]!.ground);
        g.fillRect(left, VIEW.horizon + 2, right - left, maxy - VIEW.horizon - 2);
      }

      // 3. sprites, far to near
      for (let k = 0; k < MAX_CARS; k++) {
        const c = run.cars[k]!;
        const rel = (c.z - baseIdx * SEG) / SEG;
        const n = Math.floor(rel);
        carN[k] = c.on && n >= 1 && n < DRAW ? n : -1;
        carF[k] = rel - n;
      }
      used = 0;
      for (let n = DRAW - 1; n >= 1; n--) {
        const s = es[n]!;
        if (!s) continue;
        const i = (base + n) % t.n;
        const haze = n > DRAW * 0.55 ? 1 - ((n - DRAW * 0.55) / (DRAW * 0.45)) * 0.75 : 1;
        for (let side = 0; side < 2; side++) {
          const kind = t.prop[i * 2 + side]! as PropKind;
          if (!kind) continue;
          const a = art.PROP_ART[kind];
          const w = s * a.w * HALF_W;
          const key = kind === PROP.rock && t.theme[i] === 1 ? WARM_ROCK : PROP_KEYS[kind]!;
          const px = ex[n]! + t.propX[i * 2 + side]! * ew[n]!;
          place(key, px, ey[n]!, w, (w * a.th) / a.tw, a.foot, side === 1, clip[n]!, haze);
        }
        if (t.line[i] === LINE_CP) {
          const w = ew[n]! * art.ARCH.halfWidths * 2;
          place(
            'ss-arch',
            ex[n]!,
            ey[n]!,
            w,
            (w * art.ARCH.th) / art.ARCH.tw,
            0.5,
            false,
            clip[n]!,
            haze,
          );
        }
        for (let k = 0; k < MAX_CARS; k++) {
          if (carN[k] !== n) continue;
          const c = run.cars[k]!;
          const f = carF[k]!;
          const cs = s + (es[n + 1]! - s) * f;
          const cw = ew[n]! + (ew[n + 1]! - ew[n]!) * f;
          const cx = ex[n]! + (ex[n + 1]! - ex[n]!) * f + c.x * cw;
          const cy = ey[n]! + (ey[n + 1]! - ey[n]!) * f;
          const w = cs * art.CAR_WORLD_W * HALF_W;
          // a passed car fades out as it drops back to the camera (a tall view shows the road behind Miso)
          const near = Math.min(1, (c.z - camZ - NEAR_GONE) / NEAR_FADE);
          if (near <= 0) continue;
          place(
            CAR_KEYS[c.kind]!,
            cx,
            cy,
            w,
            (w * art.CAR_TEX.h) / art.CAR_TEX.w,
            0.5,
            false,
            clip[n]!,
            haze * near,
          );
        }
      }
      for (let k = used; k < shown; k++) pool[k]!.setVisible(false);
      shown = used;
    },
  };
}
