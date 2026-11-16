// The pseudo-3D ice canyon. Each frame it projects DRAW + 1 segment edges (track.ts) and draws into one Graphics:
// the ice, its lips, the snow banks and the snowfields near to far (segments hidden behind a crest are skipped,
// partly hidden ones clipped), then the canyon walls far to near. A haze band sits on the horizon above that, and
// two pools of images are filled far to near with props, obstacles, power-ups and letters, scaled by the
// projection: one pool behind Pebble and a small one in front of her for things she has passed. Everything is
// drawn out to the edges of the view it is given, so a wide frame shows more canyon. Typed arrays and the pools
// are reused: a frame allocates nothing.
import type Phaser from 'phaser';
import { colorNum, mixHex } from '@pocketcade/toolkit';
import * as art from './art.ts';
import { EMPTY, ZONES, zoneAt, type Run } from './sim.ts';
import {
  BANK_W,
  CAM_BACK,
  CAM_FOLLOW,
  CAM_H,
  CURVE_M,
  DRAW,
  LANE_W,
  PROP_SPOTS,
  ROAD_HALF,
  SEG,
  VIEW,
  WALL_X,
  curveAt,
  heightAt,
  project,
  propAt,
  propX,
  skyMix,
  wallAt,
  type PropKind,
  type SkyMix,
} from './track.ts';

const FAR_POOL = 190;
const NEAR_POOL = 16;
const FOG_LEVELS = 10;
/** how much of the fog colour the farthest segment takes */
const FOG_MAX = 0.88;
/** edges closer to the camera than this (m) aren't projected */
const NEAR_Z = 0.6;
/** the ice lip at each edge, a lane dash's half-width and the canyon wall's rim (m) */
const LIP = 0.45;
const DASH = 0.09;
const RIM = 1.3;
/** the walls rise out of the haze over the farthest segments */
const WALL_RISE = 10;
/** scenery is drawn this far past the view's edges, so a camera shake never shows a gap */
export const MARGIN = 32;
/** sprites shorter than this (design units) aren't drawn */
const MIN_H = 1.5;
/** sprites fade into the haze over the last part of the drawn distance, down to this alpha */
const HAZE_FROM = 0.62;
const HAZE_ALPHA = 0.25;

/** Texture keys: obstacles by [slot][look], props by kind, letters and power-ups. */
export const OBSTACLE_KEYS = [0, 1, 2, 3].map((s) => [`pp-ob-${s}-0`, `pp-ob-${s}-1`] as const);
export const propKey = (kind: PropKind) => `pp-prop-${kind}`;
const PROP_KEYS = Array.from({ length: 11 }, (_, k) => `pp-prop-${k}`);
export const LETTER_KEY = 'pp-letter';
export const PICKUP_KEYS = { scarf: 'pp-pk-scarf', bell: 'pp-pk-bell' } as const;
export const HAZE_KEY = 'pp-haze';
/** Letters and power-ups bob a little. */
const bob = (t: number, z: number, amp: number) => Math.sin(t / 220 + z * 0.7) * amp;

/** Colour per stripe (0/1) and fog level, as Phaser colour numbers. */
interface Shades {
  ice: number[][];
  lip: number[][];
  bank: number[][];
  field: number[][];
  wall: number[][];
  rim: number[];
  lane: number[];
  /** the fog colour's red, green and blue */
  fog: readonly [number, number, number];
}

function shadesFor(zone: number): Shades {
  const p = art.ZONE_ART[zone]!;
  const ramp = (hex: string) =>
    Array.from({ length: FOG_LEVELS }, (_, l) =>
      colorNum(mixHex(hex, p.fog, (l / (FOG_LEVELS - 1)) * FOG_MAX)),
    );
  const fog = colorNum(p.fog);
  return {
    ice: p.ice.map(ramp),
    lip: p.lip.map(ramp),
    bank: p.bank.map(ramp),
    field: p.field.map(ramp),
    wall: p.wall.map(ramp),
    rim: ramp(p.cap),
    lane: ramp(p.lane),
    fog: [(fog >> 16) & 255, (fog >> 8) & 255, fog & 255],
  };
}

interface Pool {
  imgs: Phaser.GameObjects.Image[];
  keys: string[];
  cropped: Uint8Array;
  used: number;
  shown: number;
}

export type RoadView = ReturnType<typeof createRoadView>;

export function createRoadView(scene: Phaser.Scene) {
  const far = scene.add.container(0, 0).setDepth(100);
  const near = scene.add.container(0, 0).setDepth(400);
  const g = scene.add.graphics();
  const haze = scene.add.image(0, VIEW.horizon - art.HAZE.h * art.HAZE.peak, HAZE_KEY).setOrigin(0);
  far.add([g, haze]);
  const makePool = (n: number, layer: Phaser.GameObjects.Container): Pool => {
    const imgs = Array.from({ length: n }, () => {
      const img = scene.add.image(0, 0, LETTER_KEY).setOrigin(0.5, 1).setVisible(false);
      layer.add(img);
      return img;
    });
    return {
      imgs,
      keys: imgs.map(() => LETTER_KEY),
      cropped: new Uint8Array(n),
      used: 0,
      shown: 0,
    };
  };
  const farPool = makePool(FAR_POOL, far);
  const nearPool = makePool(NEAR_POOL, near);
  const shades = Array.from({ length: ZONES }, (_, z) => shadesFor(z));
  const fogOf = Uint8Array.from({ length: DRAW }, (_, n) =>
    Math.min(FOG_LEVELS - 1, Math.floor((n / DRAW) ** 1.4 * FOG_LEVELS)),
  );
  // projected edges 0..DRAW (edge n = near edge of drawn segment n), and each segment's clip line
  const ex = new Float32Array(DRAW + 1);
  const ey = new Float32Array(DRAW + 1);
  const es = new Float32Array(DRAW + 1);
  const clip = new Float32Array(DRAW);
  const p = { x: 0, y: 0, s: 0 };
  /** the item being placed: screen foot, scale, and its clip line */
  const at = { x: 0, y: 0, s: 0, clip: 0, haze: 1 };
  const mix: SkyMix = { from: 0, to: 0, k: 1 };
  let baseZ = 0;
  /** the drawn span across the screen (the view plus MARGIN) */
  let left = 0;
  let right: number = VIEW.w;
  /** the track's centre line on screen at Pebble's depth (for the scene) */
  const pebble = { roadX: VIEW.w / 2 };

  function trap(x1l: number, x1r: number, y1: number, x2l: number, x2r: number, y2: number): void {
    g.fillTriangle(x1l, y1, x1r, y1, x2r, y2);
    g.fillTriangle(x1l, y1, x2r, y2, x2l, y2);
  }

  /** The ground of segment i between edges n and n + 1, its near edge clipped at `maxy`. */
  function ground(n: number, i: number, maxy: number): void {
    let x1 = ex[n]!;
    let y1 = ey[n]!;
    let s1 = es[n]!;
    const x2 = ex[n + 1]!;
    const y2 = ey[n + 1]!;
    const s2 = es[n + 1]!;
    if (y1 > maxy) {
      const f = (maxy - y2) / (y1 - y2);
      x1 = x2 + (x1 - x2) * f;
      s1 = s2 + (s1 - s2) * f;
      y1 = maxy;
    }
    const sh = shades[zoneAt(i * SEG)]!;
    const fog = fogOf[n]!;
    // the ice changes shade every segment, the snow every two
    const stripe = i & 1;
    const wide = (i >> 1) & 1;
    const w1 = ROAD_HALF * s1;
    const w2 = ROAD_HALF * s2;
    const o1 = w1 + LIP * s1;
    const o2 = w2 + LIP * s2;
    const b1 = o1 + BANK_W * s1;
    const b2 = o2 + BANK_W * s2;
    // the snowfields out to the view's edges, the banks, the lips and the ice: nothing is painted twice
    g.fillStyle(sh.field[wide]![fog]!);
    if (x1 - b1 > left || x2 - b2 > left)
      trap(Math.min(left, x1 - b1), x1 - b1, y1, Math.min(left, x2 - b2), x2 - b2, y2);
    if (x1 + b1 < right || x2 + b2 < right)
      trap(x1 + b1, Math.max(right, x1 + b1), y1, x2 + b2, Math.max(right, x2 + b2), y2);
    g.fillStyle(sh.bank[wide]![fog]!);
    trap(x1 - b1, x1 - o1, y1, x2 - b2, x2 - o2, y2);
    trap(x1 + o1, x1 + b1, y1, x2 + o2, x2 + b2, y2);
    g.fillStyle(sh.lip[stripe]![fog]!);
    trap(x1 - o1, x1 - w1, y1, x2 - o2, x2 - w2, y2);
    trap(x1 + w1, x1 + o1, y1, x2 + w2, x2 + o2, y2);
    g.fillStyle(sh.ice[stripe]![fog]!);
    trap(x1 - w1, x1 + w1, y1, x2 - w2, x2 + w2, y2);
    if (stripe) return;
    // dashes between the lanes
    g.fillStyle(sh.lane[fog]!);
    for (let k = -0.5; k <= 0.5; k++) {
      const c1 = x1 + LANE_W * k * s1;
      const c2 = x2 + LANE_W * k * s2;
      trap(c1 - DASH * s1, c1 + DASH * s1, y1, c2 - DASH * s2, c2 + DASH * s2, y2);
    }
  }

  /** The canyon wall beside segment i on one side (-1 left, 1 right): its face and its rim. */
  function wall(n: number, i: number, sign: number): void {
    const s1 = es[n]!;
    const s2 = es[n + 1]!;
    const xa = ex[n]! + sign * WALL_X * s1;
    const xb = ex[n + 1]! + sign * WALL_X * s2;
    if (sign > 0 ? Math.min(xa, xb) > right : Math.max(xa, xb) < left) return;
    // its foot stops at the nearer ground already drawn; its top is a jagged line from edge to edge
    const ya = Math.min(ey[n]!, clip[n]!);
    const yb = Math.min(ey[n + 1]!, clip[n]!);
    const side = sign > 0 ? 1 : 0;
    const ta = ey[n]! - wallAt(i, side) * Math.min(1, (DRAW - n) / WALL_RISE) * s1;
    const tb = ey[n + 1]! - wallAt(i + 1, side) * Math.min(1, (DRAW - n - 1) / WALL_RISE) * s2;
    if (ta >= ya && tb >= yb) return;
    const sh = shades[zoneAt(i * SEG)]!;
    const fog = fogOf[n]!;
    g.fillStyle(sh.wall[(i >> 1) & 1]![fog]!);
    g.fillTriangle(xa, ta, xa, ya, xb, yb);
    g.fillTriangle(xa, ta, xb, yb, xb, tb);
    g.fillStyle(sh.rim[fog]!);
    const ra = Math.min(ya, ta + RIM * s1);
    const rb = Math.min(yb, tb + RIM * s2);
    g.fillTriangle(xa, ta, xa, ra, xb, rb);
    g.fillTriangle(xa, ta, xb, rb, xb, tb);
  }

  /** Finds where track distance z (`wx` metres right of the centre line, `h` up) lands on screen, into `at`. */
  function spot(z: number, wx: number, h: number): boolean {
    const rel = (z - baseZ) / SEG;
    const n = Math.floor(rel);
    if (n < 1 || n >= DRAW || !es[n] || !es[n + 1]) return false;
    const f = rel - n;
    const s = es[n]! + (es[n + 1]! - es[n]!) * f;
    at.s = s;
    at.x = ex[n]! + (ex[n + 1]! - ex[n]!) * f + wx * s;
    at.y = ey[n]! + (ey[n + 1]! - ey[n]!) * f - h * s;
    at.clip = clip[n]!;
    const from = DRAW * HAZE_FROM;
    at.haze = n > from ? 1 - ((n - from) / (DRAW - from)) * (1 - HAZE_ALPHA) : 1;
    return true;
  }

  /** Shows the next pooled image: bottom-centre on (at.x, at.y), w × h, cropped below its clip line. */
  function place(pool: Pool, key: string, w: number, h: number, alpha: number): void {
    const { x, y, clip: clipY } = at;
    if (h < MIN_H || pool.used >= pool.imgs.length || y - h >= clipY) return;
    if (x + w / 2 < left || x - w / 2 > right) return;
    const k = pool.used++;
    const img = pool.imgs[k]!;
    if (pool.keys[k] !== key) {
      pool.keys[k] = key;
      img.setTexture(key);
    }
    img.setPosition(x, y).setDisplaySize(w, h).setAlpha(alpha).setVisible(true);
    if (y > clipY) {
      img.setCrop(0, 0, img.frame.width, img.frame.height * ((clipY - (y - h)) / h));
      pool.cropped[k] = 1;
    } else if (pool.cropped[k]) {
      img.setCrop();
      pool.cropped[k] = 0;
    }
  }

  /** Things Pebble has just passed are see-through, so she never disappears behind them. */
  function sprite(pool: Pool, key: string, a: art.SpriteArt, wScale = 1): void {
    const w = a.w * at.s * wScale;
    place(pool, key, w, (a.w * at.s * a.th) / a.tw, pool === nearPool ? 0.45 : at.haze);
  }

  /** The drawn segment z falls in. */
  function seg(z: number): number {
    return Math.floor((z - baseZ) / SEG);
  }

  function hide(pool: Pool): void {
    for (let k = pool.used; k < pool.shown; k++) pool.imgs[k]!.setVisible(false);
    pool.shown = pool.used;
    pool.used = 0;
  }

  return {
    far,
    near,
    pebble,
    /**
     * Draws the canyon and its sprites for the run's current position, from `viewLeft` to `viewRight` (design
     * units); `t` (ms) bobs letters and power-ups.
     */
    draw(run: Run, t: number, viewLeft: number, viewRight: number): void {
      left = viewLeft - MARGIN;
      right = viewRight + MARGIN;
      const camZ = run.z - CAM_BACK;
      const baseIdx = Math.floor(camZ / SEG);
      baseZ = baseIdx * SEG;
      const pct = camZ / SEG - baseIdx;
      const camY = heightAt(run.z) + CAM_H;
      const camX = (run.x - 1) * LANE_W * CAM_FOLLOW;

      // 1. project the edges, bending the track by each segment's curve
      let x = 0;
      let dx = -curveAt(baseZ) * pct * CURVE_M;
      for (let n = 0; n <= DRAW; n++) {
        const zz = baseZ + n * SEG;
        const dz = zz - camZ;
        if (dz > NEAR_Z) {
          project(p, x, heightAt(zz), dz, camX, camY);
          ex[n] = p.x;
          ey[n] = p.y;
          es[n] = p.s;
        } else es[n] = 0;
        x += dx;
        dx += curveAt(zz) * CURVE_M;
      }
      // the centre line at Pebble's depth
      const pr = (run.z - baseZ) / SEG;
      const pn = Math.min(DRAW - 1, Math.floor(pr));
      if (es[pn] && es[pn + 1]) pebble.roadX = ex[pn]! + (ex[pn + 1]! - ex[pn]!) * (pr - pn);

      // 2. the ground, near to far; each segment is clipped by the nearer ground already drawn
      g.clear();
      let maxy: number = VIEW.h + MARGIN;
      for (let n = 0; n < DRAW; n++) {
        clip[n] = maxy;
        if (!es[n] || !es[n + 1]) continue;
        const y2 = ey[n + 1]!;
        if (y2 >= ey[n]! || y2 >= maxy) continue;
        ground(n, baseIdx + n, maxy);
        maxy = y2;
      }
      // the haze colour: the zone's fog, blending into the next zone's along with the sky
      skyMix(mix, run.z);
      const a = shades[mix.from]!.fog;
      const b = shades[mix.to]!.fog;
      const fog =
        (Math.round(a[0] + (b[0] - a[0]) * mix.k) << 16) |
        (Math.round(a[1] + (b[1] - a[1]) * mix.k) << 8) |
        Math.round(a[2] + (b[2] - a[2]) * mix.k);
      // past the last segment the ground runs on to the horizon in the haze
      if (maxy > VIEW.horizon) {
        g.fillStyle(fog);
        g.fillRect(left, VIEW.horizon, right - left, maxy - VIEW.horizon);
      }
      // 3. the canyon walls, far to near
      for (let n = DRAW - 1; n >= 0; n--) {
        if (!es[n] || !es[n + 1]) continue;
        wall(n, baseIdx + n, -1);
        wall(n, baseIdx + n, 1);
      }
      haze
        .setPosition(left, haze.y)
        .setDisplaySize(right - left, art.HAZE.h)
        .setTint(fog);

      // 4. sprites, far to near: props per segment, then the course's rows, power-ups and letters in it
      const { rows, letters, pickups } = run.course;
      let ri = rows.length - 1;
      let li = letters.length - 1;
      let pi = pickups.length - 1;
      for (let n = DRAW - 1; n >= 1; n--) {
        const i = baseIdx + n;
        for (let k = 0; k < PROP_SPOTS; k++) {
          const kind = propAt(i, k);
          if (!kind || !spot((i + 0.5) * SEG, propX(i, k), 0)) continue;
          sprite(farPool, PROP_KEYS[kind]!, art.PROP_ART[kind]);
        }
        for (; ri >= 0 && seg(rows[ri]!.z) >= n; ri--) {
          const row = rows[ri]!;
          const pool = row.z < run.z ? nearPool : farPool;
          for (let lane = 0; lane < 3; lane++) {
            const s = row.slots[lane]!;
            if (s === EMPTY || row.hit[lane] || !spot(row.z, (lane - 1) * LANE_W, 0)) continue;
            const look = row.looks[lane]! & 1;
            sprite(pool, OBSTACLE_KEYS[s]![look]!, art.OBSTACLE_ART[s]![look]!);
          }
        }
        for (; pi >= 0 && seg(pickups[pi]!.z) >= n; pi--) {
          const pk = pickups[pi]!;
          if (pk.taken || !spot(pk.z, (pk.lane - 1) * LANE_W, 0.25 + bob(t, pk.z, 0.15))) continue;
          const pool = pk.z < run.z ? nearPool : farPool;
          sprite(pool, PICKUP_KEYS[pk.kind], art.PICKUP_ART, 1 + bob(t, pk.z, 0.05));
        }
        for (; li >= 0 && seg(letters[li]!.z) >= n; li--) {
          const l = letters[li]!;
          const h = l.h - art.LETTER_ART.w * 0.35 + (l.pulled ? 0 : bob(t, l.z, 0.08));
          if (l.taken || !spot(l.z, (l.x - 1) * LANE_W, h)) continue;
          sprite(l.z < run.z ? nearPool : farPool, LETTER_KEY, art.LETTER_ART);
        }
      }
      hide(farPool);
      hide(nearPool);
    },
  };
}
