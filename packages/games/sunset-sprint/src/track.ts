// Sunset Sprint's road: a fixed, seeded track of short segments, each with a
// curve and a height, plus the stage themes, checkpoint lines and roadside props; and the projection that turns a
// point on it into screen space. Pure: no Phaser. Distances and heights are in metres; lateral x is in road
// half-widths, so −1..1 is the road and anything beyond is off-road.
import { createRng } from '@pocketcade/toolkit';

/** Segment length and half the road's width. */
export const SEG = 2;
export const ROAD_HALF = 9;
/** Three lanes: their centres in road half-widths. */
export const LANE_X = [-2 / 3, 0, 2 / 3] as const;
/** Segments projected per frame (360 m). */
export const DRAW = 180;
/** Camera: height above the road under the car, depth (1 / tan(fov / 2), about 100°), distance behind the car. */
export const CAM_H = 7.5;
export const CAM_DEPTH = 0.84;
export const PLAYER_DIST = CAM_H * CAM_DEPTH;
/** Screen in design units; a flat road meets the sky at `horizon`. */
export const VIEW = { w: 960, h: 720, horizon: 340 } as const;
/** Curve strength (−3..3, positive bends right) → lateral metres per segment² in the projection. */
export const CURVE_M = 0.045;
/** Rumble strips and roadside bands alternate every this many segments. */
export const STRIPE_SEGS = 3;

/** The start line, the first checkpoint's distance from it, then the gap between checkpoints (metres). */
export const START_Z = 40;
export const FIRST_LEG = 1900;
export const LEG = 1500;
/** Checkpoints on the track (a run never gets near the last one). */
export const LEGS = 24;
/** The stage (and its theme) changes at every second checkpoint. */
export const CPS_PER_STAGE = 2;
/** Stage themes, in the order the road cycles through them. */
export const THEMES = ['coast', 'canyon', 'city'] as const;
export type Theme = 0 | 1 | 2;
export const themeOfStage = (stage: number) => (stage % THEMES.length) as Theme;
/** z of checkpoint k (0-based). */
export const checkpointZ = (k: number) => START_Z + FIRST_LEG + k * LEG;
/** The stage of leg k: the stretch that ends at checkpoint k. */
export const stageOfLeg = (k: number) => Math.floor(k / CPS_PER_STAGE);

/** Roadside props (0 = none). */
export const PROP = {
  palm: 1,
  hut: 2,
  lighthouse: 3,
  rock: 4,
  cactus: 5,
  butte: 6,
  neonPink: 7,
  neonCyan: 8,
  lamp: 9,
  chevron: 10,
} as const;
export type PropKind = (typeof PROP)[keyof typeof PROP];
/** Each theme's scatter: [kind, weight, min |x|, max |x|]. */
const SCATTER: Record<Theme, readonly (readonly [PropKind, number, number, number])[]> = {
  0: [
    [PROP.palm, 6, 2.2, 3.6],
    [PROP.hut, 1.2, 2.7, 3.6],
    [PROP.rock, 1.6, 2.1, 3.2],
    [PROP.lighthouse, 0.12, 5, 7],
  ],
  1: [
    [PROP.cactus, 5, 2.2, 3.6],
    [PROP.butte, 1.5, 3.4, 5.5],
    [PROP.rock, 2, 2.1, 3.2],
  ],
  2: [
    [PROP.neonPink, 1, 2.4, 3],
    [PROP.neonCyan, 1, 2.4, 3],
  ],
};
/** Chance per segment and side of a scattered prop. */
const SCATTER_P: Record<Theme, number> = { 0: 0.16, 1: 0.14, 2: 0.07 };
/** City streetlights stand on both sides every this many segments. */
const LAMP_EVERY = 9;
/** Line marks under the road: the start line and the checkpoint lines (two checkered rows each). */
export const LINE_START = 1;
export const LINE_CP = 3;

export interface Track {
  /** segments; lookups wrap after n (a run never gets there) */
  readonly n: number;
  /** per segment, −3..3 */
  readonly curve: Float32Array;
  /** height at each segment's near edge (n + 1 entries, so segment i spans y[i] → y[i + 1]) */
  readonly y: Float32Array;
  readonly theme: Uint8Array;
  /** 0, or LINE_START / LINE_CP + row (0 or 1) for a checkered line */
  readonly line: Uint8Array;
  /** two per segment (left, right): prop kind, and its lateral position in road half-widths */
  readonly prop: Uint8Array;
  readonly propX: Float32Array;
}

const smooth = (t: number) => t * t * (3 - 2 * t);
/** 0 → 1 over the first quarter, 1 → 0 over the last. */
const ease = (t: number) => smooth(Math.min(1, t / 0.25)) * smooth(Math.min(1, (1 - t) / 0.25));

/** The segment index at z (wrapping). */
export function segmentAt(t: Track, z: number): number {
  const i = Math.floor(z / SEG) % t.n;
  return i < 0 ? i + t.n : i;
}

/** Road height at z, between the segment's edges. */
export function heightAt(t: Track, z: number): number {
  const i = segmentAt(t, z);
  const f = z / SEG - Math.floor(z / SEG);
  return t.y[i]! + (t.y[i + 1]! - t.y[i]!) * f;
}

export const curveAt = (t: Track, z: number) => t.curve[segmentAt(t, z)]!;

/** The backdrop starts turning into the next stage's this far before the arch between them, and ends this far past. */
const FADE_BEFORE = 280;
const FADE_AFTER = 120;

export interface ThemeBlend {
  from: Theme;
  to: Theme;
  /** how much of `to` shows over `from`, 0..1 */
  k: number;
}

/** The backdrops at z: one stage's scenery, turning into the next around the arch where the theme changes. */
export function themeBlend(out: ThemeBlend, z: number): ThemeBlend {
  const span = LEG * CPS_PER_STAGE;
  const first = checkpointZ(CPS_PER_STAGE - 1);
  // the nearest arch that changes the theme: stage n ends there
  const n = Math.max(0, Math.round((z - first) / span));
  const d = z - (first + n * span);
  out.from = themeOfStage(n);
  out.to = themeOfStage(n + 1);
  out.k = smooth(Math.max(0, Math.min(1, (d + FADE_BEFORE) / (FADE_BEFORE + FADE_AFTER))));
  return out;
}

/** The theme of the stretch that contains z. */
export function themeAtZ(z: number): Theme {
  const leg = z < checkpointZ(0) ? 0 : 1 + Math.floor((z - checkpointZ(0)) / LEG);
  return themeOfStage(stageOfLeg(leg));
}

/**
 * Builds the track from a fixed seed, so every run races the same road. Sections of 120–400 m each get a curve
 * (eased in and out) and a hill or dip that starts and ends at height 0.
 */
export function createTrack(): Track {
  const rng = createRng('sunset-sprint:track:v1');
  const deco = createRng('sunset-sprint:props:v1');
  const n = Math.ceil((checkpointZ(LEGS - 1) + DRAW * SEG * 2) / SEG);
  const curve = new Float32Array(n);
  const y = new Float32Array(n + 1);
  const theme = new Uint8Array(n);
  const line = new Uint8Array(n);
  const prop = new Uint8Array(n * 2);
  const propX = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) theme[i] = themeAtZ(i * SEG);
  const mark = (z: number, kind: number) => {
    const i = Math.floor(z / SEG);
    line[i] = kind;
    line[i + 1] = kind + 1;
  };
  mark(START_Z, LINE_START);
  for (let k = 0; k < LEGS; k++) mark(checkpointZ(k), LINE_CP);
  const put = (i: number, side: 0 | 1, kind: PropKind, x: number) => {
    if (i < 0 || i >= n || prop[i * 2 + side]) return;
    prop[i * 2 + side] = kind;
    propX[i * 2 + side] = side ? x : -x;
  };

  // a straight, flat run-up past the start line, then random sections
  let i = Math.ceil((START_Z + 160) / SEG);
  while (i < n) {
    const len = Math.min(n - i, rng.int(60, 200));
    const c =
      rng.weighted([
        [0, 3],
        [1, 3],
        [2, 2.5],
        [3, 1.5],
      ] as const) * (rng.chance(0.5) ? 1 : -1);
    const hMax = Math.min(26, len * SEG * 0.11);
    const h =
      rng.weighted([
        [0, 3],
        [1, 4],
        [-1, 2],
      ] as const) *
      rng.float(0.4, 1) *
      hMax;
    for (let k = 0; k < len; k++) {
      const t = k / len;
      curve[i + k] = c * ease(t);
      y[i + k] = (h * (1 - Math.cos(2 * Math.PI * t))) / 2;
    }
    // chevron signs on the outside of the bend as a medium or sharp curve comes in
    if (Math.abs(c) >= 2)
      for (let k = 2; k < len * 0.3; k += 5) put(i + k, c > 0 ? 0 : 1, PROP.chevron, 2.15);
    i += len;
  }

  for (let s = 0; s < n; s++) {
    const z = s * SEG;
    // keep the checkpoint arches' feet clear
    let nearCp = false;
    for (let k = 0; k < LEGS && !nearCp; k++) nearCp = Math.abs(z - checkpointZ(k)) < 14;
    if (nearCp) continue;
    const th = theme[s] as Theme;
    if (th === 2 && s % LAMP_EVERY === 0) {
      put(s, 0, PROP.lamp, 2.2);
      put(s, 1, PROP.lamp, 2.2);
    }
    for (const side of [0, 1] as const) {
      if (!deco.chance(SCATTER_P[th])) continue;
      const [kind, , lo, hi] = deco.weighted(SCATTER[th].map((e) => [e, e[1]] as const));
      put(s, side, kind, deco.float(lo, hi));
    }
  }
  return { n, curve, y, theme, line, prop, propX };
}

/** A projected road point: centre-line x and y on screen, the road's half-width there, and the scale. */
export interface Screen {
  x: number;
  y: number;
  w: number;
  s: number;
}

/**
 * Projects a point `dz` metres ahead of the camera, `wx` metres right of the camera's track line and at height
 * `wy`, onto the screen (design units). The camera sits at lateral `camX` and height `camY`. Writes into `out`.
 */
export function project(
  out: Screen,
  wx: number,
  wy: number,
  dz: number,
  camX: number,
  camY: number,
): Screen {
  const s = CAM_DEPTH / dz;
  out.s = s;
  out.x = VIEW.w / 2 + s * (wx - camX) * (VIEW.w / 2);
  out.y = VIEW.horizon - s * (wy - camY) * (VIEW.h / 2);
  out.w = s * ROAD_HALF * (VIEW.w / 2);
  return out;
}
