// A Comet Bounce run as a pure fixed-step simulation. Phaser only draws it.
// Design units of the 960 × 720 stage; y grows downward; the comet steps at 240 Hz (4 substeps per frame).
// Events carry positions so the scene can place effects; they never feed back into the simulation.
import type { Rng } from '@pocketcade/toolkit';
import {
  COLS,
  HIT_POINTS,
  ROWS,
  LEVELS,
  batWidth,
  isBreakable,
  levelHitPoints,
  ZONE_SIZE,
  levelPar,
  startSpeed,
  type LevelCell,
} from './levels.ts';

export const STAGE = { width: 960, height: 720 } as const;
export const WALL_L = 24;
export const WALL_R = 936;
export const CEIL = 72;
export const GRID = { x: 32, y: 120, cellW: 64, cellH: 28, brickW: 60, brickH: 24 } as const;
export const R = 8;
/** Bottom of the brick grid: comets and pods below it move with the floor when the arena height changes. */
const GRID_BOTTOM = GRID.y + ROWS * GRID.cellH;

/**
 * The arena runs from the ceiling down to `floor`: 720 in the design area, more on a tall frame so the Skiff sits
 * near the player's thumb. The bricks stay anchored to the top; only the Skiff's line and the loss line move.
 */
export function arenaLines(floor: number) {
  return { floor, batY: floor - 56, batTop: floor - 64, restY: floor - 72, lossY: floor + 16 };
}
export type ArenaLines = ReturnType<typeof arenaLines>;
const STEP_MS = 1000 / 60;
const SUBSTEPS = 4;
const SUB_S = 1 / 240;
const MAX_SPEED = 780;
/** Comets never fly flatter than this from horizontal, so they cannot crawl wall to wall. */
const MIN_ANGLE = (22 * Math.PI) / 180;
const DEG = Math.PI / 180;
/** A comet that touches no breakable brick and no Skiff for this long gets a small random turn. */
const IDLE_NUDGE_MS = 6000;
const MAX_LIVES = 3;

type PodKind = 'w' | 'x' | 'z';
type Phase = 'ready' | 'play' | 'beat' | 'clear' | 'over' | 'complete';

export interface Brick {
  idx: number;
  col: number;
  row: number;
  /** top-left of the 60 × 24 brick */
  x: number;
  y: number;
  type: LevelCell;
  hp: number;
  alive: boolean;
}
interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  idleMs: number;
}
interface Pod {
  kind: PodKind;
  x0: number;
  x: number;
  y: number;
  t: number;
}

export interface Controls {
  left?: boolean;
  right?: boolean;
  fine?: boolean;
  /** absolute pointer target (design x); null = keyboard owns the bat */
  pointerX?: number | null;
  /** relative touch drag since the last step */
  dragDx?: number;
  launch?: boolean;
}

export type SimEvent =
  | { type: 'level-start'; level: number }
  | { type: 'launch' }
  | { type: 'bat'; x: number }
  | { type: 'wall'; x: number; y: number }
  | { type: 'keystone'; brick: Brick }
  | { type: 'crack'; brick: Brick }
  | { type: 'break'; multiplier: number; brick: Brick; points: number }
  | { type: 'fuse'; link: number }
  | { type: 'pod'; kind: PodKind; x: number; y: number }
  /** a comet fell out of the bottom (the life may go on with others) */
  | { type: 'fizzle'; x: number }
  | { type: 'effect-end'; kind: 'w' | 'z' }
  | { type: 'life-lost' }
  /** `repaired`: clearing a zone's last wall gave back a lost ship */
  | { type: 'clear'; level: number; speedBonus: number; clean: boolean; repaired: boolean }
  | { type: 'over' }
  | { type: 'complete' };

export interface RunState {
  level: number;
  score: number;
  lives: number;
  startLevel: number;
  levelsCleared: number;
  cleanLevels: number;
}

/** streak n → multiplier ×1 (1–3), ×2 (4–7), ×3 (8–11), ×4 (≥ 12) */
export const multiplierFor = (n: number): number => (n >= 12 ? 4 : n >= 8 ? 3 : n >= 4 ? 2 : 1);

const BREAK_POINTS: Record<string, number> = {
  '1': 50,
  '2': 100,
  '3': 150,
  f: 60,
  w: 50,
  x: 50,
  z: 50,
};

export function createRun(
  rng: Rng,
  start: RunState,
  opts: { attract?: boolean; reducedMotion?: boolean; floor?: number } = {},
) {
  const nudgeRng = rng.fork('nudge');
  const launchRng = rng.fork('launch');
  const run: RunState = { ...start };
  let lines = arenaLines(opts.floor ?? STAGE.height);
  let phase: Phase = 'ready';
  let phaseMs = 0;
  let bricks: Brick[] = [];
  let totalHp = 1;
  let hpDealt = 0;
  let par = 0;
  let levelTimeMs = 0;
  let scoreAtLevelStart = run.score;
  let lifeLostThisLevel = false;
  const bat = {
    x: STAGE.width / 2,
    w: batWidth(run.level),
    vx: 0,
    lastDir: 0,
    sinceMoveMs: Infinity,
    keyMs: 0,
  };
  let balls: Ball[] = [];
  let pods: Pod[] = [];
  let wingMs = 0;
  let stasisMs = 0;
  let slow = 1;
  let streak = 0;
  let chains: Array<{ frontier: number[]; seen: Set<number>; inMs: number; link: number }> = [];

  function loadLevel(n: number, ev: SimEvent[]): void {
    const l = LEVELS[n - 1]!;
    bricks = [];
    l.rows.forEach((row, r) =>
      [...row].forEach((c, col) => {
        const type = c as LevelCell;
        if (type === '.') return;
        const hp = type === '#' ? Infinity : HIT_POINTS[type]; // keystones never break
        bricks.push({
          idx: r * COLS + col,
          col,
          row: r,
          x: GRID.x + col * GRID.cellW + 2,
          y: GRID.y + r * GRID.cellH + 2,
          type,
          hp,
          alive: true,
        });
      }),
    );
    totalHp = Math.max(1, levelHitPoints(l));
    par = levelPar(l);
    hpDealt = 0;
    levelTimeMs = 0;
    lifeLostThisLevel = false;
    scoreAtLevelStart = run.score;
    resetLife();
    ev.push({ type: 'level-start', level: n });
  }

  function resetLife(): void {
    phase = 'ready';
    balls = [{ x: bat.x, y: lines.restY, vx: 0, vy: 0, idleMs: 0 }];
    pods = [];
    wingMs = 0;
    stasisMs = 0;
    slow = 1;
    streak = 0;
    chains = [];
    bat.w = batWidth(run.level);
  }

  const baseWidth = () => batWidth(run.level);
  const speed = () =>
    Math.min(MAX_SPEED, startSpeed(run.level) + 16 * Math.floor((10 * hpDealt) / totalHp)) * slow;
  const breakableLeft = () => bricks.some((b) => b.alive && isBreakable(b.type));
  const brickAt = (row: number, col: number) =>
    bricks.find((b) => b.row === row && b.col === col && b.alive);

  function setVelocity(b: Ball, angleFromVertical: number, s = speed()): void {
    b.vx = Math.sin(angleFromVertical) * s;
    b.vy = -Math.cos(angleFromVertical) * s;
  }
  /** Minimum 18° from horizontal, then renormalise to the current target speed. */
  function normalise(b: Ball): void {
    const s = speed();
    const len = Math.hypot(b.vx, b.vy) || 1;
    let vx = b.vx / len;
    let vy = b.vy / len;
    if (Math.abs(vy) < Math.sin(MIN_ANGLE)) {
      vy = (vy < 0 ? -1 : 1) * Math.sin(MIN_ANGLE);
      vx = (vx < 0 ? -1 : 1) * Math.cos(MIN_ANGLE);
    }
    b.vx = vx * s;
    b.vy = vy * s;
  }
  function rotate(b: Ball, rad: number): void {
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    [b.vx, b.vy] = [b.vx * c - b.vy * s, b.vx * s + b.vy * c];
  }

  function award(points: number): void {
    run.score += points;
  }

  function breakBrick(b: Brick, ev: SimEvent[]): void {
    b.alive = false;
    streak++;
    const m = multiplierFor(streak);
    const points = BREAK_POINTS[b.type]! * m;
    award(points);
    ev.push({ type: 'break', multiplier: m, brick: b, points });
    if (b.type === 'w' || b.type === 'x' || b.type === 'z')
      pods.push({ kind: b.type, x0: b.x + 30, x: b.x + 30, y: b.y + 12, t: 0 });
  }

  function damage(b: Brick, ev: SimEvent[]): void {
    if (b.type === '#') return void ev.push({ type: 'keystone', brick: b });
    hpDealt++;
    b.hp--;
    if (b.hp > 0) {
      award(10);
      return void ev.push({ type: 'crack', brick: b });
    }
    breakBrick(b, ev);
    if (b.type === 'f')
      chains.push({ frontier: [b.idx], seen: new Set([b.idx]), inMs: 60, link: 0 });
  }

  function stepFuse(ev: SimEvent[]): void {
    for (const c of chains) {
      c.inMs -= STEP_MS;
      if (c.inMs > 0) continue;
      const next: number[] = [];
      for (const idx of c.frontier) {
        const row = Math.floor(idx / COLS);
        const col = idx % COLS;
        for (const [dr, dc] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ] as const) {
          const n = brickAt(row + dr, col + dc);
          if (!n || n.type !== 'f' || c.seen.has(n.idx)) continue;
          c.seen.add(n.idx);
          hpDealt++;
          n.hp = 0;
          breakBrick(n, ev);
          ev.push({ type: 'fuse', link: ++c.link });
          next.push(n.idx);
        }
      }
      c.frontier = next;
      c.inMs = 60;
    }
    chains = chains.filter((c) => c.frontier.length > 0);
  }

  function moveBat(c: Controls): void {
    const dt = STEP_MS / 1000;
    const before = bat.x;
    const dir = (c.right ? 1 : 0) - (c.left ? 1 : 0);
    if (dir !== 0) {
      bat.keyMs += STEP_MS;
      bat.x += dir * (c.fine ? 300 : 720) * Math.min(1, bat.keyMs / 60) * dt;
    } else {
      // Pointer and touch move the Skiff one to one, with no smoothing, so it never trails the hand.
      bat.keyMs = 0;
      if (c.pointerX !== undefined && c.pointerX !== null) bat.x = c.pointerX;
      if (c.dragDx) bat.x += c.dragDx;
    }
    // Wingspan grows from the centre over 150 ms (instant with reduced motion).
    const targetW = baseWidth() * (wingMs > 0 ? 1.5 : 1);
    const growth = opts.reducedMotion ? Infinity : (baseWidth() * 0.5 * STEP_MS) / 150;
    bat.w += Math.max(-growth, Math.min(growth, targetW - bat.w));
    bat.x = Math.max(WALL_L + bat.w / 2, Math.min(WALL_R - bat.w / 2, bat.x));
    bat.vx = (bat.x - before) / dt;
    if (Math.abs(bat.x - before) > 0.01) {
      bat.lastDir = Math.sign(bat.x - before);
      bat.sinceMoveMs = 0;
    } else bat.sinceMoveMs += STEP_MS;
  }

  function launch(ev: SimEvent[]): void {
    const b = balls[0]!;
    let sign =
      bat.sinceMoveMs <= 200 && bat.lastDir !== 0 ? bat.lastDir : launchRng.chance(0.5) ? 1 : -1;
    if (bat.x - bat.w / 2 - WALL_L < 8) sign = 1;
    if (WALL_R - (bat.x + bat.w / 2) < 8) sign = -1;
    setVelocity(b, sign * 20 * DEG);
    phase = 'play';
    ev.push({ type: 'launch' });
    if (opts.attract) scatter(); // the demo plays with three comets from the start
  }

  function scatter(): number {
    const top = balls.reduce((a, b) => (b.y < a.y ? b : a), balls[0]!);
    let added = 0;
    for (const deg of [20, -20]) {
      if (balls.length >= 3) break;
      const nb = { ...top, idleMs: 0 };
      rotate(nb, deg * DEG);
      normalise(nb);
      balls.push(nb);
      added++;
    }
    return added;
  }

  function substep(ev: SimEvent[]): void {
    for (const b of balls) {
      b.x += b.vx * SUB_S;
      b.y += b.vy * SUB_S;
      b.idleMs += SUB_S * 1000;
      let bounced = false;
      if (b.x < WALL_L + R && b.vx < 0) {
        b.vx = -b.vx;
        bounced = true;
      }
      if (b.x > WALL_R - R && b.vx > 0) {
        b.vx = -b.vx;
        bounced = true;
      }
      if (b.y < CEIL + R && b.vy < 0) {
        b.vy = -b.vy;
        bounced = true;
      }
      if (bounced) ev.push({ type: 'wall', x: b.x, y: b.y });

      // Skiff: only a descending comet; the top face sets the angle, an end face pushes it sideways.
      const half = bat.w / 2;
      if (
        b.vy > 0 &&
        b.y + R >= lines.batTop &&
        b.y - R <= lines.batTop + 16 &&
        b.x + R >= bat.x - half &&
        b.x - R <= bat.x + half
      ) {
        if (b.y < lines.batTop + 4) {
          const o = Math.max(-1, Math.min(1, (b.x - bat.x) / half));
          const theta = Math.max(
            -65,
            Math.min(65, 60 * o + 10 * Math.max(-1, Math.min(1, bat.vx / 1800))),
          );
          setVelocity(b, theta * DEG);
          b.y = lines.batTop - R;
          streak = 0;
          b.idleMs = 0;
          ev.push({ type: 'bat', x: b.x });
        } else b.vx = (b.x < bat.x ? -1 : 1) * Math.abs(b.vx);
      }

      // Bricks: at most 2 damaged per substep, one reflection per axis.
      let hits = 0;
      let flippedX = false;
      let flippedY = false;
      for (const k of bricks) {
        if (!k.alive || hits >= 2) continue;
        const cx = Math.max(k.x, Math.min(b.x, k.x + GRID.brickW));
        const cy = Math.max(k.y, Math.min(b.y, k.y + GRID.brickH));
        if ((b.x - cx) ** 2 + (b.y - cy) ** 2 >= R * R) continue;
        const penX = Math.min(b.x + R - k.x, k.x + GRID.brickW - (b.x - R));
        const penY = Math.min(b.y + R - k.y, k.y + GRID.brickH - (b.y - R));
        const left = b.x < k.x + GRID.brickW / 2;
        const above = b.y < k.y + GRID.brickH / 2;
        const xAxis = penX < penY;
        const approaching = xAxis ? (left ? b.vx > 0 : b.vx < 0) : above ? b.vy > 0 : b.vy < 0;
        if (!approaching) continue;
        if (xAxis && !flippedX) {
          b.vx = left ? -Math.abs(b.vx) : Math.abs(b.vx);
          flippedX = true;
        }
        if (!xAxis && !flippedY) {
          b.vy = above ? -Math.abs(b.vy) : Math.abs(b.vy);
          flippedY = true;
        }
        hits++;
        damage(k, ev);
        if (k.type !== '#') b.idleMs = 0;
      }
      if (b.idleMs > IDLE_NUDGE_MS) {
        rotate(b, (nudgeRng.chance(0.5) ? 7 : -7) * DEG); // nudge a comet that has hit nothing for a while
        b.idleMs = 0;
      }
      normalise(b);
    }
    for (const b of balls) if (b.y > lines.lossY) ev.push({ type: 'fizzle', x: b.x });
    balls = balls.filter((b) => b.y <= lines.lossY);
  }

  function movePods(ev: SimEvent[]): void {
    const dt = STEP_MS / 1000;
    const half = bat.w / 2;
    for (const m of pods) {
      m.t += dt;
      m.y += 150 * dt;
      m.x = m.x0 + 24 * Math.sin((2 * Math.PI * m.t) / 1.2);
    }
    pods = pods.filter((m) => {
      if (m.y > lines.lossY) return false;
      const caught = Math.abs(m.x - bat.x) < half + 20 && Math.abs(m.y - lines.batY) < 12 + 14;
      if (!caught) return true;
      if (m.kind === 'w') wingMs = 15_000;
      if (m.kind === 'z') stasisMs = 10_000;
      award(m.kind === 'x' && phase === 'play' && scatter() === 0 ? 250 : 100);
      ev.push({ type: 'pod', kind: m.kind, x: m.x, y: m.y });
      return false;
    });
  }

  const sim = {
    get phase() {
      return phase;
    },
    get state(): RunState {
      return { ...run };
    },
    get scoreAtLevelStart() {
      return scoreAtLevelStart;
    },
    bat,
    get balls(): readonly Ball[] {
      return balls;
    },
    get bricks(): readonly Brick[] {
      return bricks;
    },
    get pods(): readonly Pod[] {
      return pods;
    },
    get multiplier() {
      return multiplierFor(streak);
    },
    get arena(): ArenaLines {
      return lines;
    },
    /** Move the floor (frame resized); comets and pods below the bricks keep their place relative to it. */
    setFloor(floor: number): void {
      const next = arenaLines(Math.max(STAGE.height, floor));
      if (next.floor === lines.floor) return;
      const k = (next.batY - GRID_BOTTOM) / (lines.batY - GRID_BOTTOM);
      for (const o of [...balls, ...pods])
        if (o.y > GRID_BOTTOM) o.y = GRID_BOTTOM + (o.y - GRID_BOTTOM) * k;
      lines = next;
    },
    get wingMs() {
      return wingMs;
    },
    get stasisMs() {
      return stasisMs;
    },
    /** breakable hit points left per column (attract AI) */
    hpByColumn(): number[] {
      const out = new Array<number>(COLS).fill(0);
      for (const b of bricks) if (b.alive && isBreakable(b.type)) out[b.col]! += b.hp;
      return out;
    },
    /** load the run's level; call once before stepping */
    begin(): SimEvent[] {
      const ev: SimEvent[] = [];
      loadLevel(run.level, ev);
      return ev;
    },
    step(c: Controls): SimEvent[] {
      const ev: SimEvent[] = [];
      if (phase === 'over' || phase === 'complete') return ev;
      if (phase === 'beat' || phase === 'clear') {
        phaseMs -= STEP_MS;
        if (phaseMs > 0) return ev;
        if (phase === 'beat') {
          if (run.lives <= 0) {
            phase = 'over';
            ev.push({ type: 'over' });
          } else resetLife();
        } else if (run.level >= LEVELS.length) {
          award(2000 * run.lives);
          phase = 'complete';
          ev.push({ type: 'complete' });
        } else {
          run.level++;
          loadLevel(run.level, ev);
        }
        return ev;
      }
      moveBat(c);
      if (phase === 'ready') {
        balls[0]!.x = bat.x;
        balls[0]!.y = lines.restY;
        if (c.launch) launch(ev);
        return ev;
      }
      levelTimeMs += STEP_MS;
      for (let i = 0; i < SUBSTEPS; i++) substep(ev);
      stepFuse(ev);
      movePods(ev);
      slow += Math.max(-0.3 / 18, Math.min(0.3 / 18, (stasisMs > 0 ? 0.7 : 1) - slow)); // eased over 300 ms
      for (const [k, ms] of [
        ['w', wingMs],
        ['z', stasisMs],
      ] as const) {
        if (ms <= 0) continue;
        const left = Math.max(0, ms - STEP_MS);
        if (k === 'w') wingMs = left;
        else stasisMs = left;
        if (left === 0) ev.push({ type: 'effect-end', kind: k });
      }
      // A clear in the same step as the last comet falling wins.
      if (!breakableLeft()) {
        const clean = !lifeLostThisLevel;
        const speedBonus = 10 * Math.max(0, par - Math.floor(levelTimeMs / 1000));
        award(1000 + speedBonus + (clean ? 500 : 0));
        run.levelsCleared++;
        if (clean) run.cleanLevels++;
        const repaired =
          run.level % ZONE_SIZE === 0 && run.level < LEVELS.length && run.lives < MAX_LIVES;
        if (repaired) run.lives++;
        phase = 'clear';
        phaseMs = 1500;
        ev.push({ type: 'clear', level: run.level, speedBonus, clean, repaired });
      } else if (balls.length === 0 && chains.length === 0) {
        run.lives--;
        lifeLostThisLevel = true;
        phase = 'beat';
        phaseMs = 800;
        pods = [];
        ev.push({ type: 'life-lost' });
      }
      return ev;
    },
  };
  return sim;
}

export type CometRun = ReturnType<typeof createRun>;
