// Bao Bolt's run as a pure fixed-step simulation; the scene only draws it.
// Heights are measured up from the ground top; x is in wu from the left of the view.
import type { Rng } from '@pocketcade/toolkit';
import { BREATHERS, CHUNKS, chunkById, type Chunk, type ObstacleKind } from './chunks.ts';
import {
  BUN_X,
  CRUMB_R,
  EATEN_MS,
  FAST_DROP_V,
  G,
  G_HELD,
  HITBOX,
  JUMP_BUFFER_MS,
  MAX_HOLD_MS,
  MIN_HOLD_MS,
  PIN_ROLL,
  SHELF_JUMP_BUFFER_MS,
  SLIDE,
  SLIDE_EXTEND_MS,
  SLIDE_MS,
  SPAWN_X,
  STAND,
  STEP_MS,
  STEP_S,
  STUMBLE,
  TAKEOFF_V,
  TERMINAL_V,
  TIERS,
  baseSpeed,
  districtIndex,
  tierIndex,
} from './tuning.ts';

export interface Intents {
  jumpDown?: boolean;
  jumpUp?: boolean;
  slide?: boolean;
}

export type SimEvent =
  | { type: 'start' }
  | { type: 'jump' }
  | { type: 'land' }
  | { type: 'slide' }
  | { type: 'crumb'; streak: number }
  | { type: 'mult'; multiplier: number }
  | { type: 'stumble' }
  | { type: 'gulp-leaves' }
  | { type: 'eaten' }
  | { type: 'over' }
  | { type: 'district'; index: number }
  | { type: 'best' };

export interface Obstacle {
  id: number;
  kind: ObstacleKind;
  x: number;
  /** visual width (wu) */
  w: number;
  knocked: boolean;
}
interface Crumb {
  id: number;
  x: number;
  /** centre height above the ground */
  y: number;
  taken: boolean;
}

type Move = 'grounded' | 'airborne' | 'fastdrop' | 'sliding';
type Phase = 'ready' | 'running' | 'eaten' | 'over';

interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface Sim {
  readonly phase: Phase;
  readonly move: Move;
  /** bun feet height above the ground */
  readonly h: number;
  readonly steps: number;
  readonly speed: number;
  readonly distance: number;
  readonly metres: number;
  readonly points: number;
  readonly streak: number;
  readonly multiplier: number;
  readonly maxMultiplier: number;
  readonly crumbs: number;
  readonly invulnMs: number;
  readonly gulpMs: number;
  readonly obstacles: readonly Obstacle[];
  readonly crumbList: readonly Crumb[];
  readonly chunkIds: readonly string[];
  readonly bestMetres: number;
  /** next obstacle ahead of the bun, with time to contact (s) at the current closing speed */
  next(): { kind: ObstacleKind; ttcS: number; width: number } | null;
  step(intents: Intents): SimEvent[];
}

const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

export function obstacleBox(o: Obstacle): Box {
  if (o.kind === 'shelf')
    return {
      x0: o.x + HITBOX.shelf.dx,
      x1: o.x + o.w - HITBOX.shelf.dx,
      y0: HITBOX.shelf.bottom,
      y1: HITBOX.shelf.top,
    };
  const hb = HITBOX[o.kind];
  return { x0: o.x + hb.dx, x1: o.x + hb.dx + hb.w, y0: hb.bottom, y1: hb.top };
}

export function createSim(
  rng: Rng,
  opts: { bestMetres?: number; reel?: readonly string[]; autoStart?: boolean } = {},
): Sim {
  const chunkRng = rng.fork('chunks');
  const crumbRng = rng.fork('crumbs');
  const reel = [...(opts.reel ?? ['w0'])];
  let phase: Phase = opts.autoStart ? 'running' : 'ready';
  let move: Move = 'grounded';
  let h = 0;
  let vy = 0;
  let holding = false;
  let holdMs = 0;
  let minHoldLeft = 0;
  let slideMs = 0;
  let extendMs = 0;
  let jumpBuffer = 0;
  let slideJumpBuffer = 0;
  let steps = 0;
  let speed = baseSpeed(0);
  let distance = 0;
  let metres = 0;
  let points = 0;
  let streak = 0;
  let multiplier = 1;
  let maxMultiplier = 1;
  let crumbs = 0;
  let invulnMs = 0;
  let gulpMs = 0;
  let stumbleMs = Infinity;
  let eatenMs = 0;
  let nextChunkX = SPAWN_X;
  let sinceBreather = 0;
  let district = 0;
  let calmNext = false;
  let passedBest = false;
  let ids = 0;
  const bestMetres = opts.bestMetres ?? 0;
  const obstacles: Obstacle[] = [];
  const crumbList: Crumb[] = [];
  const chunkIds: string[] = [];

  const box = (m: Move = move): Box => {
    const s = m === 'sliding' ? SLIDE : STAND;
    return { x0: BUN_X - s.w / 2, x1: BUN_X + s.w / 2, y0: h, y1: h + s.h };
  };
  const underShelf = () => {
    const b = box('grounded');
    return obstacles.some((o) => o.kind === 'shelf' && !o.knocked && overlaps(b, obstacleBox(o)));
  };

  function pickChunk(): Chunk {
    const fromReel = reel.shift();
    if (fromReel) return chunkById(fromReel);
    const tier = TIERS[tierIndex(metres)]!;
    const tierNo = Math.min(4, tierIndex(metres) + 1);
    // a new district opens with a coins-only stretch, so there is a moment to look at it
    if (calmNext || sinceBreather >= tier.breatherEvery) {
      calmNext = false;
      sinceBreather = 0;
      return chunkById(chunkRng.pick(BREATHERS));
    }
    const recent = chunkIds.slice(-4);
    const lastHard = chunkById(chunkIds.at(-1) ?? 'w0').difficulty === 5;
    const weighted = CHUNKS.filter(
      (c) =>
        c.difficulty > 0 &&
        c.minTier <= tierNo &&
        c.difficulty >= tier.min &&
        c.difficulty <= tier.max &&
        !recent.includes(c.id) &&
        !(lastHard && c.difficulty === 5),
    ).map(
      (c) =>
        [
          c,
          c.difficulty === tier.target ? 4 : Math.abs(c.difficulty - tier.target) === 1 ? 2 : 1,
        ] as const,
    );
    sinceBreather++;
    return weighted.length ? chunkRng.weighted(weighted) : chunkById('b1');
  }

  function spawn(): void {
    const c = pickChunk();
    chunkIds.push(c.id);
    const start = nextChunkX;
    for (const o of c.obstacles) {
      const closing = speed + (o.kind === 'pin' ? PIN_ROLL : 0);
      const w = o.kind === 'shelf' ? (o.width ?? 1.0) : HITBOX[o.kind].visualW;
      obstacles.push({ id: ids++, kind: o.kind, x: start + o.at * closing, w, knocked: false });
    }
    for (const run of c.crumbs) {
      const centre = start + run.at * speed + 0.45;
      const spacing = 0.6;
      const half = ((run.count - 1) / 2) * spacing;
      const lift = run.shape === 'arc' ? 1.2 + crumbRng.float(0, 0.4) : 0;
      for (let i = 0; i < run.count; i++) {
        const off = i * spacing - half;
        const y =
          run.shape === 'low'
            ? 0.2
            : run.shape === 'line'
              ? 0.45
              : 0.6 + lift * (1 - (off / (half + 0.3)) ** 2);
        crumbList.push({ id: ids++, x: centre + off, y, taken: false });
      }
    }
    nextChunkX = start + (c.lengthS + TIERS[tierIndex(metres)]!.leadInS) * speed;
  }

  function takeoff(ev: SimEvent[]): void {
    move = 'airborne';
    vy = TAKEOFF_V;
    holding = true;
    holdMs = 0;
    minHoldLeft = MIN_HOLD_MS;
    jumpBuffer = 0;
    slideJumpBuffer = 0;
    ev.push({ type: 'jump' });
  }

  function startSlide(ev: SimEvent[]): void {
    move = 'sliding';
    slideMs = SLIDE_MS;
    extendMs = SLIDE_EXTEND_MS;
    ev.push({ type: 'slide' });
  }

  function hit(ev: SimEvent[], o: Obstacle): void {
    if (gulpMs > 0) {
      phase = 'eaten';
      eatenMs = EATEN_MS;
      ev.push({ type: 'eaten' });
      return;
    }
    o.knocked = true;
    stumbleMs = 0;
    invulnMs = STUMBLE.invulnMs;
    gulpMs = STUMBLE.gulpMs;
    streak = 0;
    multiplier = 1;
    ev.push({ type: 'stumble' });
  }

  const sim: Sim = {
    get phase() {
      return phase;
    },
    get move() {
      return move;
    },
    get h() {
      return h;
    },
    get steps() {
      return steps;
    },
    get speed() {
      return speed;
    },
    get distance() {
      return distance;
    },
    get metres() {
      return metres;
    },
    get points() {
      return points;
    },
    get streak() {
      return streak;
    },
    get multiplier() {
      return multiplier;
    },
    get maxMultiplier() {
      return maxMultiplier;
    },
    get crumbs() {
      return crumbs;
    },
    get invulnMs() {
      return invulnMs;
    },
    get gulpMs() {
      return gulpMs;
    },
    obstacles,
    crumbList,
    chunkIds,
    bestMetres,
    next() {
      const b = box();
      let best: { kind: ObstacleKind; ttcS: number; width: number } | null = null;
      for (const o of obstacles) {
        if (o.knocked) continue;
        const ob = obstacleBox(o);
        if (ob.x1 < b.x0) continue;
        const ttcS = (ob.x0 - b.x1) / (speed + (o.kind === 'pin' ? PIN_ROLL : 0));
        if (!best || ttcS < best.ttcS) best = { kind: o.kind, ttcS, width: o.w };
      }
      return best;
    },

    step(intents) {
      const ev: SimEvent[] = [];
      if (phase === 'over') return ev;
      if (phase === 'eaten') {
        eatenMs -= STEP_MS;
        if (eatenMs <= 0) {
          phase = 'over';
          ev.push({ type: 'over' });
        }
        return ev;
      }
      if (phase === 'ready') {
        if (!intents.jumpDown && !intents.slide) return ev;
        phase = 'running'; // the first intent starts the run and is consumed
        ev.push({ type: 'start' });
        if (chunkIds.length === 0) spawn();
        return ev;
      }
      if (chunkIds.length === 0) spawn();

      // ─── intents ───
      if (intents.jumpDown) {
        if (move === 'grounded') takeoff(ev);
        else if (move === 'sliding') {
          if (underShelf()) slideJumpBuffer = SHELF_JUMP_BUFFER_MS;
          else takeoff(ev);
        } else jumpBuffer = JUMP_BUFFER_MS;
      }
      if (intents.jumpUp) holding = false;
      if (intents.slide) {
        if (move === 'grounded') startSlide(ev);
        else if (move === 'sliding') slideMs = SLIDE_MS;
        else if (move === 'airborne') {
          move = 'fastdrop';
          vy = -FAST_DROP_V;
          holding = false;
        }
      }

      // ─── bun ───
      if (move === 'airborne' || move === 'fastdrop') {
        const rising = vy > 0;
        const held =
          (holding || minHoldLeft > 0) && rising && holdMs < MAX_HOLD_MS && move === 'airborne';
        const v0 = vy;
        vy = Math.max(-TERMINAL_V, vy - (held ? G_HELD : G) * STEP_S);
        h += ((v0 + vy) / 2) * STEP_S; // exact for constant gravity within a step
        holdMs += STEP_MS;
        minHoldLeft = Math.max(0, minHoldLeft - STEP_MS);
        jumpBuffer = Math.max(0, jumpBuffer - STEP_MS);
        if (h <= 0) {
          h = 0;
          vy = 0;
          const dropped = move === 'fastdrop';
          move = 'grounded';
          ev.push({ type: 'land' });
          if (dropped) startSlide(ev);
          else if (jumpBuffer > 0) takeoff(ev);
        }
      } else if (move === 'sliding') {
        slideMs -= STEP_MS;
        slideJumpBuffer = Math.max(0, slideJumpBuffer - STEP_MS);
        const blocked = underShelf();
        if (slideJumpBuffer > 0 && !blocked) takeoff(ev);
        else if (slideMs <= 0) {
          if (blocked && extendMs > 0) extendMs -= STEP_MS;
          else move = 'grounded';
        }
      }

      // ─── world ───
      steps++;
      stumbleMs += STEP_MS;
      const factor =
        stumbleMs < STUMBLE.slowMs
          ? STUMBLE.factor
          : stumbleMs < STUMBLE.slowMs + STUMBLE.recoverMs
            ? STUMBLE.factor +
              (1 - STUMBLE.factor) * ((stumbleMs - STUMBLE.slowMs) / STUMBLE.recoverMs)
            : 1;
      speed = baseSpeed(steps / 60) * factor;
      const dx = speed * STEP_S;
      distance += dx;
      while (metres < Math.floor(distance)) {
        metres++;
        points += multiplier;
      }
      if (!passedBest && bestMetres > 0 && metres >= bestMetres) {
        passedBest = true;
        ev.push({ type: 'best' });
      }
      const d = districtIndex(metres);
      if (d !== district) {
        district = d;
        calmNext = true;
        ev.push({ type: 'district', index: d });
      }
      for (const o of obstacles) o.x -= dx + (o.kind === 'pin' ? PIN_ROLL * STEP_S : 0);
      for (const c of crumbList) c.x -= dx;
      nextChunkX -= dx;
      while (nextChunkX <= SPAWN_X) spawn();
      for (let i = obstacles.length - 1; i >= 0; i--)
        if (obstacles[i]!.x + obstacles[i]!.w < -2) obstacles.splice(i, 1);
      for (let i = crumbList.length - 1; i >= 0; i--)
        if (crumbList[i]!.x < -2 || crumbList[i]!.taken) crumbList.splice(i, 1);

      // ─── timers ───
      invulnMs = Math.max(0, invulnMs - STEP_MS);
      if (gulpMs > 0) {
        gulpMs = Math.max(0, gulpMs - STEP_MS);
        if (gulpMs === 0) ev.push({ type: 'gulp-leaves' });
      }

      // ─── collisions: several overlaps in one step count as one hit ───
      const b = box();
      if (invulnMs === 0) {
        const o = obstacles.find((x) => !x.knocked && overlaps(b, obstacleBox(x)));
        if (o) hit(ev, o);
      }
      for (const c of crumbList) {
        if (c.taken) continue;
        const nx = Math.max(b.x0, Math.min(c.x, b.x1));
        const ny = Math.max(b.y0, Math.min(c.y, b.y1));
        if ((c.x - nx) ** 2 + (c.y - ny) ** 2 > CRUMB_R ** 2) continue;
        c.taken = true;
        crumbs++;
        streak++;
        ev.push({ type: 'crumb', streak });
        if (gulpMs > 0) {
          gulpMs = Math.max(0, gulpMs - STUMBLE.coinShooMs);
          if (gulpMs === 0) ev.push({ type: 'gulp-leaves' });
        }
        const m = Math.min(5, 1 + Math.floor(streak / 10));
        if (m !== multiplier) {
          multiplier = m;
          maxMultiplier = Math.max(maxMultiplier, m);
          ev.push({ type: 'mult', multiplier: m });
        }
      }
      return ev;
    },
  };
  return sim;
}
