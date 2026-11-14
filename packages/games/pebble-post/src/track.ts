// Pebble Post's ice canyon as seen from behind and above Pebble: the endless track's gentle bends and hills (pure
// functions of distance, the same every run), the scenery beside it (props on the snowfields, the canyon walls),
// how the sky blends from one zone to the next, and the projection that turns a point on the track into screen
// space. Pure: no Phaser. Distances and heights are in metres; lanes are 0..2 (left to right), LANE_W apart.
import { ZONE_M, ZONES, zoneAt } from './sim.ts';

/** Segment length (m) and segments drawn per frame (184 m). */
export const SEG = 4;
export const DRAW = 46;
/** Lane spacing and half the track's width (m). */
export const LANE_W = 2.6;
export const ROAD_HALF = LANE_W * 1.5;
/** The design area; flat ice meets the sky at `horizon`. A wider frame shows more of the canyon to each side. */
export const VIEW = { w: 540, h: 960, horizon: 300 } as const;
/**
 * Camera: height above the ice under Pebble, distance behind her, focal length (design units). A long lens from
 * well back keeps the lanes wide and the obstacles large far down the track.
 */
export const CAM_H = 6;
export const CAM_BACK = 14.4;
export const FOCAL = 1200;
/** Design units per metre at Pebble's depth; her feet are always on this line. */
export const PEBBLE_SCALE = FOCAL / CAM_BACK;
export const PEBBLE_Y = VIEW.horizon + CAM_H * PEBBLE_SCALE;
/** How much of Pebble's lane position the camera follows. */
export const CAM_FOLLOW = 0.5;
/** Bend strength (−1..1, positive bends right) → lateral metres per segment² in the projection. */
export const CURVE_M = 0.036;
/** The snow bank's width past the ice lip (m); the snowfield starts there and runs out to the canyon wall. */
export const BANK_W = 4.5;
export const WALL_X = 26;

const TAU = Math.PI * 2;

/** The bend at z: two slow waves with a dead zone, so straights come between gentle bends. */
export function curveAt(z: number): number {
  const c = Math.sin((z * TAU) / 1100) + 0.6 * Math.sin((z * TAU) / 430 + 2.1);
  return Math.sign(c) * Math.min(1, Math.max(0, Math.abs(c) - 0.5) / 1.1);
}

/** The ice's height at z (m): gentle rolling hills (under 7 % steep), flat at the start. */
export function heightAt(z: number): number {
  const h =
    3 * Math.sin((z * TAU) / 640) + 1.5 * Math.sin((z * TAU) / 260 + 1.1) - 1.5 * Math.sin(1.1);
  return h * Math.min(1, Math.max(0, z) / 150);
}

/** A stable hash of an integer to 0..1 (decoration only). */
function hash(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 2 ** 32;
}

/** Scenery props per zone (0 = none). */
export const PROP = {
  pine: 1,
  rock: 2,
  sign: 3,
  nightPine: 4,
  lantern: 5,
  crystalPink: 6,
  crystalBlue: 7,
  hut: 8,
  igloo: 9,
  spire: 10,
} as const;
export type PropKind = (typeof PROP)[keyof typeof PROP];
const ROADSIDE: readonly (readonly PropKind[])[] = [
  [PROP.pine, PROP.pine, PROP.rock, PROP.sign],
  [PROP.nightPine, PROP.nightPine, PROP.lantern],
  [PROP.crystalPink, PROP.crystalBlue, PROP.crystalBlue],
];
const FIELD: readonly (readonly PropKind[])[] = [
  [PROP.pine, PROP.pine, PROP.pine, PROP.rock, PROP.hut],
  [PROP.nightPine, PROP.nightPine, PROP.nightPine, PROP.rock, PROP.igloo],
  [PROP.spire, PROP.crystalBlue, PROP.spire, PROP.crystalPink],
];
/**
 * Each segment has four spots for a prop: by the track and out on the snowfield, on the left (even spots) and
 * the right (odd). The chance of a prop per spot, and how far from the centre line it stands (m).
 */
export const PROP_SPOTS = 4;
const SPOT_P = [0.3, 0.5] as const;
const SPOT_X = [
  [ROAD_HALF + 1.8, 4.5],
  [12.5, 11],
] as const;

/** The prop on segment i's spot, or 0. */
export function propAt(i: number, spot: number): PropKind | 0 {
  const field = spot >> 1;
  const p = SPOT_P[field]!;
  const h = hash(i * PROP_SPOTS + spot);
  if (i < 3 || h >= p) return 0;
  const kinds = (field ? FIELD : ROADSIDE)[zoneAt(i * SEG)]!;
  return kinds[Math.floor((h / p) * kinds.length)]!;
}

/** That prop's place across the track: metres right of the centre line (negative on the left). */
export function propX(i: number, spot: number): number {
  const [from, span] = SPOT_X[spot >> 1]!;
  return (spot & 1 ? 1 : -1) * (from + hash(i * 7 * PROP_SPOTS + spot + 1) * span);
}

/** The canyon wall's height (m above the ice) at segment edge i, on the left (side 0) or right: a rolling rim. */
export function wallAt(i: number, side: number): number {
  const k = i / 6;
  const a = Math.floor(k);
  const f = k - a;
  const from = hash(a * 2 + side + 91);
  const to = hash(a * 2 + side + 93);
  return 9 + 6 * (from + (to - from) * f * f * (3 - 2 * f)) + hash(i * 2 + side + 17);
}

/** The sky starts turning into the next zone's this far before the boundary and finishes this far past it (m). */
export const SKY_FADE = { before: 190, after: 30 } as const;
export interface SkyMix {
  /** the zone whose sky is fading out, the one fading in, and how far in it is (0..1; 1 when from = to) */
  from: number;
  to: number;
  k: number;
}

/** Which skies show at distance z. Writes into `out`. */
export function skyMix(out: SkyMix, z: number): SkyMix {
  const d = Math.max(0, z);
  const n = Math.floor(d / ZONE_M);
  const into = d - n * ZONE_M;
  const span = SKY_FADE.before + SKY_FADE.after;
  if (into >= ZONE_M - SKY_FADE.before) {
    out.from = n % ZONES;
    out.to = (n + 1) % ZONES;
    out.k = (into - (ZONE_M - SKY_FADE.before)) / span;
  } else if (n > 0 && into < SKY_FADE.after) {
    out.from = (n - 1) % ZONES;
    out.to = n % ZONES;
    out.k = (into + SKY_FADE.before) / span;
  } else {
    out.from = out.to = n % ZONES;
    out.k = 1;
  }
  return out;
}

/** A projected point: x and y on screen, and design units per metre there. */
export interface Screen {
  x: number;
  y: number;
  s: number;
}

/**
 * Projects a point `dz` metres ahead of the camera, `wx` metres right of the track's centre line and at height
 * `wy`, onto the screen. The camera sits at lateral `camX` and height `camY`. Writes into `out`.
 */
export function project(
  out: Screen,
  wx: number,
  wy: number,
  dz: number,
  camX: number,
  camY: number,
): Screen {
  const s = FOCAL / dz;
  out.s = s;
  out.x = VIEW.w / 2 + (wx - camX) * s;
  out.y = VIEW.horizon + (camY - wy) * s;
  return out;
}
