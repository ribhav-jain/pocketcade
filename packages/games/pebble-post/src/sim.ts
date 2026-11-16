// Pebble Post's run as a pure simulation. Phaser only draws it.
// Pebble belly-slides forward on her own along three lanes in 60 Hz steps; the player changes lane, hops and tucks.
// A seeded course generator lays rows of obstacles, letters and power-ups ahead, and guarantees every row can be
// passed from every lane you could have passed the row before in. Events tell the scene what to draw.
import type { Rng } from '@pocketcade/toolkit';

export const STEP_MS = 1000 / 60;
const DT = 1 / 60;

/** Forward speed (m/s) by distance: 18 → 30 m/s, eased over the first 3,200 m (about 2 min 15 s). */
export const START_SPEED = 18;
export const TOP_SPEED = 30;
export const RAMP_M = 3200;
const smooth = (t: number) => t * t * (3 - 2 * t);
export const speedAt = (d: number) =>
  START_SPEED + (TOP_SPEED - START_SPEED) * smooth(Math.min(1, Math.max(0, d) / RAMP_M));

/** Moves: a lane change slides for LANE_S; a hop is HOP_S long and HOP_H high; a tuck lasts TUCK_S (seconds, m). */
export const LANE_S = 0.16;
export const HOP_S = 0.62;
export const HOP_H = 1.5;
export const HOP_V = (4 * HOP_H) / HOP_S;
export const GRAVITY = (2 * HOP_V) / HOP_S;
/** Tucking in the air drops Pebble at this speed (m/s), then she tucks on landing. */
export const FAST_FALL = 14;
export const TUCK_S = 0.6;
/** A move that can't happen yet (a hop in the air, a lane change mid-slide) waits this long, then is dropped. */
export const BUFFER_S = 0.18;

/** Pebble's body: half-width (lanes), half-length (m), height sliding and tucked (m). */
export const BODY = { halfW: 0.28, halfLen: 0.35, stand: 1, tuck: 0.45 } as const;

/** What a lane of a row holds. Low: hop over. High: tuck under. Full: change lane. */
export const EMPTY = 0;
export const LOW = 1;
export const HIGH = 2;
export const FULL = 3;
export type Slot = 0 | 1 | 2 | 3;
/** Each kind has two looks: low = snow drift | fallen log, high = icicle arch | frozen-mail banner,
 * full = ice pillar | mail sled. Half-lengths along the track (m) per [slot][look]. */
export const HALF_LEN: readonly (readonly [number, number])[] = [
  [0, 0],
  [0.8, 0.6],
  [0.3, 0.25],
  [0.7, 1.5],
];
/** An obstacle's half-width (lanes); a low one's top and a high one's clearance (m). */
export const OB_HALF_W = 0.42;
export const LOW_TOP = 0.75;
export const HIGH_GAP = 0.7;

export const LETTER_POINTS = 5;
/** A bonus for each obstacle hopped or tucked past, and for a lane change that leaves an obstacle's lane late. */
export const BONUS_POINTS = 10;
/** A lane change counts as a close call when it starts less than this long (s) before the obstacle it dodges. */
export const CLOSE_S = 0.3;
/** Letter and power-up pick-up reach: along the track (m) and across (lanes). */
const LETTER_REACH = { z: 1, x: 0.55, h: 0.35 } as const;
const PICKUP_REACH = { z: 1.2, x: 0.6 } as const;
/** Letters sit at Pebble's middle on the ice; a mail bell pulls in letters this far ahead (m). */
export const LETTER_H = 0.5;
export const MAGNET_AHEAD = 16;
const PULL_SPEED = 18;

export type PowerKind = 'scarf' | 'bell';
/** The scarf absorbs one hit (or wears off); the bell pulls letters in. Ghost time after the scarf breaks. */
export const POWER_MS: Record<PowerKind, number> = { scarf: 20_000, bell: 8_000 };
export const GHOST_MS = 1_000;
export const TUMBLE_MS = 1_000;

/** The scenery changes every ZONE_M metres, cycling three zones. */
export const ZONE_M = 600;
export const ZONES = 3;
export const zoneAt = (d: number) => Math.floor(Math.max(0, d) / ZONE_M) % ZONES;

// ─── the course ───

export interface Row {
  /** centre of the row along the track (m) */
  z: number;
  /** per lane (0 left … 2 right) */
  slots: Slot[];
  looks: number[];
  halfLen: number[];
  /** shattered by the scarf */
  hit: boolean[];
  /** Pebble is past it (bonuses are counted once) */
  passed: boolean;
  /** the lane the generator kept passable */
  safe: number;
  /** the nearest and farthest obstacle edges (m) */
  front: number;
  back: number;
}

export interface Letter {
  z: number;
  /** lane position (0..2) and height of its centre (m) */
  x: number;
  h: number;
  taken: boolean;
  /** being pulled in by the mail bell */
  pulled: boolean;
}

export interface Pickup {
  z: number;
  lane: number;
  kind: PowerKind;
  taken: boolean;
}

export interface Course {
  readonly rows: Row[];
  readonly letters: Letter[];
  readonly pickups: Pickup[];
  /** generates rows until the last one is past z */
  ensure(z: number): void;
  /** drops everything behind z */
  trim(z: number): void;
}

/** A row at z from its slots (looks default to 0). */
export function makeRow(z: number, slots: Slot[], looks: number[] = [0, 0, 0], safe = -1): Row {
  const halfLen = slots.map((s, i) => HALF_LEN[s]![looks[i]! & 1]!);
  let front = Infinity;
  let back = -Infinity;
  slots.forEach((s, i) => {
    if (s === EMPTY) return;
    front = Math.min(front, z - halfLen[i]!);
    back = Math.max(back, z + halfLen[i]!);
  });
  if (front === Infinity) front = back = z;
  return {
    z,
    slots,
    looks,
    halfLen,
    hit: [false, false, false],
    passed: false,
    safe,
    front,
    back,
  };
}

export const passable = (s: Slot) => s !== FULL;

/**
 * The clear time (s) Pebble needs between passing a row in slot `a` and reaching the next row's front in slot `b`,
 * `k` lanes over: time to react, the lane slides with some slack, getting airborne or tucked before the front,
 * and landing first when hopping twice (or after a hop, dropping before a tuck).
 */
export const REACT_S = 0.34;
export function need(a: Slot, k: number, b: Slot): number {
  if (k === 0 && b === EMPTY) return 0;
  let t = REACT_S + k * LANE_S * 1.25;
  if (b === LOW) t += 0.14 + (a === LOW ? HOP_S * 0.6 : 0);
  if (b === HIGH) t += 0.06 + (a === LOW ? 0.12 : 0);
  return t;
}

/** Rows are never closer than this (s), whatever the moves. */
export const MIN_GAP_S = 0.55;
/** The first row's front (m). */
export const FIRST_ROW = 80;
/** The generator keeps this much course ahead of the asked-for z (m). */
const LEAD = 20;
/** Power-ups: the first one after this far, then one every POWER_GAP metres (spaced so two never overlap). */
const POWER_FIRST = 420;
const POWER_GAP = [800, 1200] as const;
/** Letter lines: spacing (m) and the most letters in one line. */
export const LETTER_GAP = 3.5;
const LINE_MAX = 8;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 0 → 1 over the first 4,000 m. */
export const difficulty = (z: number) => smooth(Math.min(1, Math.max(0, z) / 4000));

/**
 * The seeded course. Each new row picks the lane that stays passable (staying, or moving one or two lanes), what
 * that lane holds, and random obstacles in the other lanes; then it is placed far enough after the previous row
 * that every lane passable there can reach it in time (see `need`), plus a random extra that shrinks with distance.
 * `speed` is the forward speed at a distance (tests pass constant speeds).
 */
export function createCourse(rng: Rng, speed: (z: number) => number = speedAt): Course {
  const rows: Row[] = [];
  const letters: Letter[] = [];
  const pickups: Pickup[] = [];
  let last: Row | null = null;
  let lastArc = -1;
  let nextPower = POWER_FIRST;
  let lastPower: PowerKind = rng.chance(0.5) ? 'scarf' : 'bell';

  const look = () => (rng.chance(0.5) ? 1 : 0);

  function addLine(lane: number, from: number, to: number): void {
    let n = 0;
    for (let z = from; z <= to && n < LINE_MAX; z += LETTER_GAP, n++)
      letters.push({ z, x: lane, h: LETTER_H, taken: false, pulled: false });
  }

  /** Five letters along a hop centred on the obstacle at z, at the speed there. */
  function addArc(lane: number, z: number, v: number): void {
    const half = (v * HOP_S) / 2;
    for (let k = -2; k <= 2; k++) {
      const dz = k * half * 0.36;
      const y = HOP_H * (1 - (dz / half) ** 2);
      letters.push({ z: z + dz, x: lane, h: LETTER_H + y, taken: false, pulled: false });
    }
  }

  function addRow(): void {
    const prev = last;
    const z0 = prev ? prev.back : FIRST_ROW;
    const d = difficulty(z0);
    // the fastest speed anywhere in the next gap (speed never drops, and no gap lasts 4 s)
    const v = speed(z0 + 4 * speed(z0));
    const from = prev ? prev.safe : 1;

    // the lane that stays passable, and what it holds
    const wall = rng.chance(lerp(0.04, 0.1, d));
    const shift = rng.weighted([
      [0, lerp(0.55, 0.35, d)],
      [1, lerp(0.37, 0.45, d)],
      [2, lerp(0.08, 0.2, d)],
    ] as const);
    const safe =
      shift === 0
        ? from
        : shift === 2 && from !== 1
          ? 2 - from
          : from === 1
            ? rng.chance(0.5)
              ? 0
              : 2
            : 1;
    const act = lerp(0.35, 0.6, d);
    const safeSlot: Slot = wall
      ? rng.chance(0.55)
        ? LOW
        : HIGH
      : rng.weighted([
          [EMPTY, 1 - act],
          [LOW, act * 0.55],
          [HIGH, act * 0.45],
        ] as const);

    // the other lanes
    const full = lerp(0.3, 0.45, d);
    const slots: Slot[] = [0, 1, 2].map((l) =>
      l === safe || wall
        ? safeSlot
        : rng.weighted([
            [EMPTY, 0.65 - full],
            [LOW, 0.2],
            [HIGH, 0.15],
            [FULL, full],
          ] as const),
    );
    // never an empty row
    if (!slots.some((s) => s !== EMPTY)) slots[(safe + 1 + rng.int(0, 1)) % 3] = FULL;

    // long enough from every lane passable in the previous row to the safe lane
    let needS = MIN_GAP_S;
    if (prev)
      for (let i = 0; i < 3; i++)
        if (passable(prev.slots[i]!))
          needS = Math.max(needS, need(prev.slots[i]!, Math.abs(i - safe), safeSlot));
    const gapS = needS + rng.float(lerp(0.5, 0.15, d), lerp(1.4, 0.75, d));
    const front = prev ? prev.back + 2 * BODY.halfLen + gapS * v : FIRST_ROW;
    const looks = slots.map(look);
    const maxHalf = Math.max(...slots.map((s, i) => (s === EMPTY ? 0 : HALF_LEN[s]![looks[i]!]!)));
    const row = makeRow(front + maxHalf, slots, looks, safe);
    rows.push(row);

    // letters in the gap (a line in the safe lane, sometimes one in another open lane) and arcs over low ones
    const gapFrom = prev ? prev.back + 3 : front - 40;
    let power = false;
    if (front >= nextPower && front - gapFrom > 14) {
      power = true;
      lastPower = rng.chance(0.7) ? (lastPower === 'scarf' ? 'bell' : 'scarf') : lastPower;
      const z = (gapFrom + front) / 2;
      pickups.push({ z, lane: safe, kind: lastPower, taken: false });
      nextPower = z + rng.float(POWER_GAP[0], POWER_GAP[1]);
    }
    const lineFrom = (lane: number) => gapFrom + (lane === lastArc ? 0.22 * v : 0);
    if (!power && rng.chance(lerp(0.6, 0.45, d))) addLine(safe, lineFrom(safe), front - 2.5);
    if (rng.chance(0.25)) {
      const other = (safe + 1 + rng.int(0, 1)) % 3;
      if (passable(slots[other]!)) addLine(other, lineFrom(other), front - 2.5);
    }
    lastArc = -1;
    const lows = [0, 1, 2].filter((l) => slots[l] === LOW);
    if (lows.length && rng.chance(0.55)) {
      lastArc = slots[safe] === LOW ? safe : rng.pick(lows);
      addArc(lastArc, row.z, speed(row.z));
    }
    // lines, arcs and the next row's lines overlap in z: keep the letters in order (a few dozen at most)
    letters.sort((a, b) => a.z - b.z);
    last = row;
  }

  return {
    rows,
    letters,
    pickups,
    ensure(z) {
      while (!last || last.z < z + LEAD) addRow();
    },
    trim(z) {
      while (rows.length && rows[0]!.back < z) rows.shift();
      while (letters.length && letters[0]!.z < z) letters.shift();
      while (pickups.length && pickups[0]!.z < z) pickups.shift();
    },
  };
}

// ─── the run ───

export type Phase = 'run' | 'tumble' | 'over';
export type Move = 'left' | 'right' | 'hop' | 'tuck';
/** What earned a bonus: hopping a low obstacle, tucking under a high one, or a late dodge. */
export type BonusKind = 'hop' | 'tuck' | 'close';

export type SimEvent =
  | { type: 'lane'; dir: -1 | 1 }
  | { type: 'hop' }
  | { type: 'tuck' }
  | { type: 'land' }
  | { type: 'letter'; letter: Letter }
  | { type: 'bonus'; kind: BonusKind }
  | { type: 'power'; kind: PowerKind }
  | { type: 'power-end'; kind: PowerKind }
  | { type: 'scarf-save'; row: Row; lane: number }
  | { type: 'crash'; row: Row; lane: number }
  | { type: 'zone'; zone: number }
  | { type: 'over' };

/** Generate this far ahead of Pebble (past the drawn view), and drop things this far behind. */
const AHEAD = 200;
const BEHIND = 12;

export type Run = ReturnType<typeof createRun>;

/** A new run. `rng` seeds the course; tests may pass their own course. */
export function createRun(rng: Rng, course: Course = createCourse(rng.fork('course'))) {
  const events: SimEvent[] = [];
  let buffered: Move | null = null;
  let bufferS = 0;
  let from = 1;
  /** where the last lane change began (m) */
  let laneStartZ = -Infinity;
  let fastFall = false;
  /** how far she got before a crash knocked her back (the score never goes down) */
  let reached = 0;

  const run = {
    course,
    phase: 'run' as Phase,
    /** distance along the track (m) */
    z: 0,
    /** the lane Pebble is in or sliding to, her lane position (0..2) and the slide's progress (1 = done) */
    lane: 1,
    x: 1,
    laneT: 1,
    /** height above the ice (m) and vertical speed (m/s) */
    y: 0,
    vy: 0,
    airborne: false,
    /** tuck time left (s) */
    tuckS: 0,
    letters: 0,
    bonuses: 0,
    power: null as PowerKind | null,
    powerMs: 0,
    ghostMs: 0,
    tumbleMs: 0,
    zoneIndex: 0,
    steps: 0,
    get speed(): number {
      return run.phase === 'run' ? speedAt(run.z) : 0;
    },
    get distance(): number {
      return Math.floor(Math.max(reached, run.z));
    },
    get score(): number {
      return run.distance + LETTER_POINTS * run.letters + BONUS_POINTS * run.bonuses;
    },
    /** flattened: tucked on the ice, or dropping fast to tuck */
    get tucked(): boolean {
      return run.tuckS > 0 || fastFall;
    },
    get height(): number {
      return run.tucked ? BODY.tuck : BODY.stand;
    },
    input,
    step,
  };

  /** Tries a move now; false if it has to wait (mid-slide, or a hop in the air). */
  function tryMove(m: Move): boolean {
    if (run.phase !== 'run') return true;
    if (m === 'left' || m === 'right') {
      const dir = m === 'left' ? -1 : 1;
      const to = run.lane + dir;
      if (to < 0 || to > 2) return true;
      if (run.laneT < 1) return false;
      from = run.lane;
      laneStartZ = run.z;
      run.lane = to;
      run.laneT = 0;
      events.push({ type: 'lane', dir });
      return true;
    }
    if (m === 'hop') {
      if (run.airborne) return false;
      run.airborne = true;
      run.vy = HOP_V;
      run.tuckS = 0;
      events.push({ type: 'hop' });
      return true;
    }
    if (run.airborne) {
      fastFall = true;
      run.vy = Math.min(run.vy, -FAST_FALL);
    } else run.tuckS = TUCK_S;
    events.push({ type: 'tuck' });
    return true;
  }

  /** A player move: applied at once if it can be, else held for up to BUFFER_S (one move is held at a time). */
  function input(m: Move): readonly SimEvent[] {
    events.length = 0;
    if (tryMove(m)) buffered = null;
    else {
      buffered = m;
      bufferS = 0;
    }
    return events;
  }

  function hitTest(row: Row, lane: number): boolean {
    const s = row.slots[lane]!;
    if (s === EMPTY || row.hit[lane]) return false;
    if (Math.abs(row.z - run.z) >= row.halfLen[lane]! + BODY.halfLen) return false;
    if (Math.abs(lane - run.x) >= OB_HALF_W + BODY.halfW) return false;
    if (s === LOW) return run.y < LOW_TOP;
    if (s === HIGH) return run.y + run.height > HIGH_GAP;
    return true;
  }

  function collide(): void {
    if (run.ghostMs > 0) return;
    for (const row of course.rows) {
      if (row.front > run.z + BODY.halfLen) break;
      for (let lane = 0; lane < 3; lane++) {
        if (!hitTest(row, lane)) continue;
        if (run.power === 'scarf') {
          row.hit[lane] = true;
          run.power = null;
          run.powerMs = 0;
          run.ghostMs = GHOST_MS;
          events.push({ type: 'scarf-save', row, lane });
          return;
        }
        run.phase = 'tumble';
        run.tumbleMs = TUMBLE_MS;
        // knocked back to just in front of it
        reached = run.z;
        run.z = Math.min(run.z, row.z - row.halfLen[lane]! - BODY.halfLen - 0.2);
        events.push({ type: 'crash', row, lane });
        return;
      }
    }
  }

  function collect(): void {
    const mid = run.y + run.height / 2;
    const bell = run.power === 'bell';
    const pull = Math.min(1, 10 * DT);
    for (const l of course.letters) {
      if (l.z > run.z + MAGNET_AHEAD) break;
      if (l.taken) continue;
      if (bell && l.z > run.z - 1) l.pulled = true;
      if (l.pulled) {
        l.x += (run.x - l.x) * pull;
        l.h += (mid - l.h) * pull;
        l.z = Math.max(run.z, l.z - PULL_SPEED * DT);
      }
      if (
        Math.abs(l.z - run.z) < LETTER_REACH.z &&
        Math.abs(l.x - run.x) < LETTER_REACH.x &&
        Math.abs(l.h - mid) < run.height / 2 + LETTER_REACH.h
      ) {
        l.taken = true;
        run.letters++;
        events.push({ type: 'letter', letter: l });
      }
    }
    for (const p of course.pickups) {
      if (p.z > run.z + PICKUP_REACH.z) break;
      if (p.taken || Math.abs(p.z - run.z) >= PICKUP_REACH.z) continue;
      if (Math.abs(p.lane - run.x) >= PICKUP_REACH.x) continue;
      p.taken = true;
      run.power = p.kind;
      run.powerMs = POWER_MS[p.kind];
      events.push({ type: 'power', kind: p.kind });
    }
  }

  function bonus(kind: BonusKind): void {
    run.bonuses++;
    events.push({ type: 'bonus', kind });
  }

  /** Bonuses for each row Pebble has just cleared: what she hopped or tucked past, and a late dodge. */
  function award(): void {
    for (const row of course.rows) {
      if (row.back + BODY.halfLen >= run.z) break;
      if (row.passed) continue;
      row.passed = true;
      const lane = Math.round(run.x);
      const s = row.slots[lane]!;
      // not while blinking after the scarf broke: she may have slid straight through
      if (run.ghostMs > 0) continue;
      if (!row.hit[lane] && (s === LOW || s === HIGH)) bonus(s === LOW ? 'hop' : 'tuck');
      if (from === lane || row.slots[from] === EMPTY || row.hit[from]) continue;
      const reach = row.z - row.halfLen[from]! - BODY.halfLen;
      if (laneStartZ <= reach && reach - laneStartZ < CLOSE_S * speedAt(reach)) bonus('close');
    }
  }

  /** One 60 Hz step. The returned array is reused by the next step or input. */
  function step(): readonly SimEvent[] {
    events.length = 0;
    if (run.phase === 'over') return events;
    run.steps++;
    if (run.phase === 'tumble') {
      run.tumbleMs -= STEP_MS;
      if (run.tumbleMs <= 0) {
        run.phase = 'over';
        events.push({ type: 'over' });
      }
      return events;
    }
    if (buffered) {
      const m = buffered;
      if (tryMove(m)) buffered = null;
      else if ((bufferS += DT) > BUFFER_S) buffered = null;
    }

    run.z += speedAt(run.z) * DT;
    if (run.laneT < 1) {
      run.laneT = Math.min(1, run.laneT + DT / LANE_S);
      run.x = from + (run.lane - from) * smooth(run.laneT);
    }
    if (run.airborne) {
      run.y += run.vy * DT - (GRAVITY * DT * DT) / 2;
      run.vy -= GRAVITY * DT;
      if (run.y <= 0) {
        run.y = 0;
        run.vy = 0;
        run.airborne = false;
        if (fastFall) {
          fastFall = false;
          run.tuckS = TUCK_S;
        }
        events.push({ type: 'land' });
      }
    } else run.tuckS = Math.max(0, run.tuckS - DT);
    run.ghostMs = Math.max(0, run.ghostMs - STEP_MS);
    if (run.power) {
      run.powerMs -= STEP_MS;
      if (run.powerMs <= 0) {
        events.push({ type: 'power-end', kind: run.power });
        run.power = null;
        run.powerMs = 0;
      }
    }

    course.ensure(run.z + AHEAD);
    course.trim(run.z - BEHIND);
    collide();
    if (run.phase !== 'run') return events;
    award();
    collect();
    const zone = Math.floor(run.z / ZONE_M);
    if (zone !== run.zoneIndex) {
      run.zoneIndex = zone;
      events.push({ type: 'zone', zone: zone % ZONES });
    }
    return events;
  }

  course.ensure(AHEAD);
  return run;
}
