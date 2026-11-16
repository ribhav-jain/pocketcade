// @vitest-environment node
// Rules checks for the pure simulation: level data, multiplier, bounce angle, fuse chains, lives, an autopiloted
// level clear, and the checkpoint guard.
import { createRng } from '@pocketcade/toolkit';
import { describe, expect, it } from 'vitest';
import { autopilotTarget } from '../src/attract.ts';
import { COLS, LEVELS, ROWS, isBreakable } from '../src/levels.ts';
import { isRunSlotV1 } from '../src/save.ts';
import {
  R,
  createRun,
  multiplierFor,
  type CometRun,
  type Controls,
  type SimEvent,
} from '../src/sim.ts';

const run = (level = 1, lives = 3, floor?: number) => {
  const r = createRun(
    createRng(`t${level}`),
    {
      level,
      score: 0,
      lives,
      startLevel: level,
      levelsCleared: 0,
      cleanLevels: 0,
    },
    { floor },
  );
  r.begin();
  return r;
};
const steps = (r: CometRun, n: number, c: Controls = {}) => {
  const out: SimEvent[] = [];
  for (let i = 0; i < n; i++) out.push(...r.step(c));
  return out;
};
/** The attract AI, steering by pointer. */
const autopilot = (r: CometRun): Controls => {
  if (r.phase === 'ready') return { launch: true };
  const target = autopilotTarget({
    batX: r.bat.x,
    batWidth: r.bat.w,
    balls: r.balls,
    hpByColumn: r.hpByColumn(),
    ready: false,
    restY: r.arena.restY,
  });
  return target === null ? {} : { pointerX: target };
};

describe('levels', () => {
  it('has 20 named 14 × 12 walls with something to break', () => {
    expect(LEVELS).toHaveLength(20);
    expect(new Set(LEVELS.map((l) => l.name)).size).toBe(20);
    for (const l of LEVELS) {
      expect(l.rows).toHaveLength(ROWS);
      for (const row of l.rows) expect(row).toMatch(new RegExp(`^[.123#fwxz]{${COLS}}$`));
      expect(l.rows.join('').split('').some(isBreakable), l.name).toBe(true);
      expect(l.rows.join('').replace(/[^wxz]/g, '').length, l.name).toBeLessThanOrEqual(3);
    }
  });
  it('leaves no breakable brick sealed off behind alloy plates', () => {
    // The bricks are anchored to the top, so this holds for every arena floor.
    // Flood from below the grid through every cell that is not a plate (4-connected: diagonal plates seal, and
    // the lane under the ceiling is open). Plates in the outer columns sit too close to the side walls to pass.
    for (const l of LEVELS) {
      const open = (r: number, c: number) =>
        c >= 0 && c < COLS && (r < 0 || r >= ROWS || l.rows[r]![c] !== '#');
      const seen = new Set<string>();
      const queue: [number, number][] = [];
      for (let c = 0; c < COLS; c++) queue.push([ROWS, c]);
      while (queue.length) {
        const [r, c] = queue.pop()!;
        const k = `${r},${c}`;
        if (r < -1 || r > ROWS || !open(r, c) || seen.has(k)) continue;
        seen.add(k);
        queue.push([r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]);
      }
      l.rows.forEach((row, r) =>
        [...row].forEach((cell, c) => {
          if (isBreakable(cell)) expect(seen.has(`${r},${c}`), `${l.name} ${r},${c}`).toBe(true);
        }),
      );
    }
  });
  it('introduces each element no earlier than the schedule allows', () => {
    const first: Record<string, number> = { '2': 3, w: 4, z: 5, '#': 6, f: 7, x: 8, '3': 9 };
    for (const l of LEVELS)
      for (const [cell, from] of Object.entries(first))
        if (l.id < from) expect(l.rows.join(''), `${cell} in ${l.name}`).not.toContain(cell);
  });
});

describe('scoring', () => {
  it('streak multiplier bands; 8 crystals in one flight score 700', () => {
    expect([1, 3, 4, 7, 8, 11, 12, 30].map(multiplierFor)).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
    let total = 0;
    for (let n = 1; n <= 8; n++) total += 50 * multiplierFor(n);
    expect(total).toBe(700);
  });
});

describe('physics', () => {
  it('a centre hit goes straight up and a wing-tip hit leaves at about 60°', () => {
    for (const [offset, deg] of [
      [0, 0],
      [60, 60],
    ] as const) {
      const r = run();
      const ball = r.balls[0] as { x: number; y: number; vx: number; vy: number };
      r.step({ launch: true });
      Object.assign(ball, { x: r.bat.x + offset, y: r.arena.batTop - R - 1, vx: 0, vy: 400 });
      const ev = r.step({});
      expect(ev.some((e) => e.type === 'bat')).toBe(true);
      expect((Math.atan2(ball.vx, -ball.vy) * 180) / Math.PI).toBeCloseTo(deg, 0);
    }
  });
  it('a fuse brick sets off every touching fuse brick, one ring per 60 ms', () => {
    const r = run(7);
    const fuse = r.bricks.filter((b) => b.type === 'f');
    const tail = fuse.find((b) => b.row === 4 && b.col === 1)!;
    const ball = r.balls[0] as { x: number; y: number; vx: number; vy: number };
    r.step({ launch: true });
    Object.assign(ball, { x: tail.x + 30, y: tail.y + 24 + R + 2, vx: 0, vy: -500 });
    const ev = steps(r, 120);
    const links = ev.filter((e) => e.type === 'fuse').length;
    expect(links).toBeGreaterThanOrEqual(9); // snake A: 10 bricks; the tail breaks first
    expect(fuse.filter((b) => b.alive).length).toBeLessThanOrEqual(fuse.length - 10);
  });
  it('missing the comet costs a life; the third miss ends the run', () => {
    const r = run(1, 3);
    const events: string[] = [];
    for (let i = 0; i < 60 * 120 && r.phase !== 'over'; i++)
      for (const e of r.step(
        r.phase === 'ready' ? { launch: true, pointerX: 30 } : { pointerX: 30 },
      ))
        events.push(e.type);
    expect(events.filter((e) => e === 'life-lost')).toHaveLength(3);
    expect(events).toContain('over');
  });
  it('the autopilot clears level 1 and the clear bonus is paid', () => {
    const r = run(1);
    const events: SimEvent[] = [];
    for (let i = 0; i < 60 * 600 && r.state.level === 1 && r.phase !== 'over'; i++)
      events.push(...r.step(autopilot(r)));
    const clear = events.find((e) => e.type === 'clear');
    expect(clear, 'level 1 cleared within 10 minutes of game time').toBeDefined();
    expect(r.state.score).toBeGreaterThan(56 * 50 + 1000);
  });
});

describe('arena height', () => {
  it('a tall arena moves the Skiff down and the autopilot still clears level 1', () => {
    const r = run(1, 3, 1600);
    expect(r.arena.batY).toBe(1544);
    for (let i = 0; i < 60 * 600 && r.phase !== 'clear' && r.phase !== 'over'; i++)
      r.step(autopilot(r));
    expect(r.phase).toBe('clear');
  });
  it('resizing keeps a comet below the bricks at the same place relative to the floor', () => {
    const r = run(1, 3, 1600);
    r.step({ launch: true });
    const ball = r.balls[0] as { y: number };
    ball.y = 1000;
    r.setFloor(720);
    expect(ball.y).toBeCloseTo(456 + (544 * (664 - 456)) / (1544 - 456), 5);
    expect(r.arena.batY).toBe(664);
  });
});

describe('lives', () => {
  it("clearing a zone's last wall repairs a lost ship", () => {
    const r = run(5, 2);
    for (const b of r.bricks) if (b.type !== '#') (b as { alive: boolean }).alive = false;
    r.step({ launch: true });
    const ev = r.step({});
    expect(ev.find((e) => e.type === 'clear')).toMatchObject({ repaired: true });
    expect(r.state.lives).toBe(3);
  });
});

describe('checkpoint', () => {
  it('accepts a valid run and rejects one that starts after its own level', () => {
    expect(isRunSlotV1(null)).toBe(true);
    const ok = {
      level: 5,
      scoreAtLevelStart: 900,
      lives: 2,
      startLevel: 1,
      levelsCleared: 4,
      cleanLevels: 3,
    };
    expect(isRunSlotV1(ok)).toBe(true);
    expect(isRunSlotV1({ ...ok, level: 2, startLevel: 3 })).toBe(false);
  });
});
