// @vitest-environment node
// Rules checks for the pure simulation: speed, lane changes, hops, tucks and the input buffer, collisions with each
// obstacle kind, bonuses, the scarf and the mail bell, letters and scoring, zones and the sky between them, the
// course generator's fairness over many seeds and speeds, the autopilot, and the save guards.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRng } from '@pocketcade/toolkit';
import { describe, expect, it } from 'vitest';
import { autopilot } from '../src/attract.ts';
import { freshStats, isStatsV1, withRun } from '../src/save.ts';
import {
  BODY,
  BONUS_POINTS,
  BUFFER_S,
  CLOSE_S,
  EMPTY,
  FIRST_ROW,
  FULL,
  GHOST_MS,
  HALF_LEN,
  HIGH,
  HOP_H,
  HOP_S,
  LANE_S,
  LETTER_H,
  LETTER_POINTS,
  LOW,
  LOW_TOP,
  MAGNET_AHEAD,
  MIN_GAP_S,
  POWER_MS,
  RAMP_M,
  START_SPEED,
  STEP_MS,
  TOP_SPEED,
  TUCK_S,
  TUMBLE_MS,
  ZONE_M,
  createCourse,
  createRun,
  makeRow,
  need,
  passable,
  speedAt,
  zoneAt,
  type Course,
  type Letter,
  type Pickup,
  type Row,
  type Run,
  type SimEvent,
  type Slot,
} from '../src/sim.ts';
import { SKY_FADE, skyMix } from '../src/track.ts';

const SPS = 60;
/** A hand-made course (nothing more is generated). */
function fixed(rows: Row[], letters: Letter[] = [], pickups: Pickup[] = []): Course {
  return { rows, letters, pickups, ensure() {}, trim() {} };
}
const run = (course?: Course) => createRun(createRng('t'), course);
/** Steps for `s` seconds, collecting the events. */
function go(r: Run, s: number): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < Math.round(s * SPS); i++) out.push(...r.step());
  return out;
}
const types = (es: readonly SimEvent[]) => es.map((e) => e.type);
const letter = (z: number, x: number, h = LETTER_H): Letter => ({
  z,
  x,
  h,
  taken: false,
  pulled: false,
});

describe('speed', () => {
  it('starts at 18 m/s and eases up to 30 m/s by the end of the ramp, never slowing', () => {
    expect(speedAt(0)).toBe(START_SPEED);
    expect(speedAt(RAMP_M)).toBe(TOP_SPEED);
    expect(speedAt(RAMP_M * 3)).toBe(TOP_SPEED);
    for (let d = 0; d < RAMP_M; d += 50) expect(speedAt(d + 50)).toBeGreaterThanOrEqual(speedAt(d));
  });

  it('reaches top speed in a little over two minutes', () => {
    const r = run(fixed([]));
    let s = 0;
    while (r.speed < TOP_SPEED - 1e-6) {
      r.step();
      s += STEP_MS / 1000;
    }
    expect(s).toBeGreaterThan(120);
    expect(s).toBeLessThan(150);
  });

  it('counts distance in whole metres and 5 points per letter', () => {
    const r = run(fixed([], [letter(3, 1)]));
    go(r, 1);
    expect(r.distance).toBe(Math.floor(r.z));
    expect(r.letters).toBe(1);
    expect(r.score).toBe(r.distance + LETTER_POINTS);
  });
});

describe('moves and the input buffer', () => {
  it('changes one lane per input with a quick slide, and not past the edge', () => {
    const r = run(fixed([]));
    expect(types(r.input('left'))).toEqual(['lane']);
    expect(r.lane).toBe(0);
    go(r, LANE_S / 2);
    expect(r.x).toBeGreaterThan(0.2);
    expect(r.x).toBeLessThan(0.8);
    go(r, LANE_S / 2 + 0.02);
    expect(r.x).toBe(0);
    expect(types(r.input('left'))).toEqual([]);
    expect(r.lane).toBe(0);
  });

  it('holds one early input: a second swipe mid-slide moves on when the first slide ends', () => {
    const r = run(fixed([]));
    r.input('right');
    go(r, 0.05);
    expect(types(r.input('left'))).toEqual([]);
    expect(r.lane).toBe(2);
    go(r, LANE_S);
    expect(r.lane).toBe(1);
  });

  it('drops a held input after the buffer time', () => {
    const r = run(fixed([]));
    r.input('hop');
    go(r, 0.05);
    r.input('hop');
    go(r, HOP_S);
    // the second hop was pressed far too early: still on the ice after the first one
    expect(r.airborne).toBe(false);
    r.input('hop');
    let air = 0;
    while (r.airborne) {
      r.step();
      air++;
    }
    expect(air / SPS).toBeGreaterThan(HOP_S - 0.05);
    expect(air / SPS).toBeLessThan(HOP_S + 0.05);
  });

  it('a hop pressed just before landing happens on landing', () => {
    const r = run(fixed([]));
    r.input('hop');
    go(r, HOP_S - BUFFER_S / 2);
    expect(r.airborne).toBe(true);
    r.input('hop');
    const es = go(r, BUFFER_S);
    expect(types(es)).toContain('land');
    expect(types(es)).toContain('hop');
    expect(r.airborne).toBe(true);
  });

  it('hops HOP_H high', () => {
    const r = run(fixed([]));
    r.input('hop');
    let top = 0;
    for (let i = 0; i < SPS; i++) {
      r.step();
      top = Math.max(top, r.y);
    }
    expect(top).toBeGreaterThan(HOP_H - 0.05);
    expect(top).toBeLessThan(HOP_H + 0.05);
  });

  it('tucks for about 0.6 s; a tuck in the air drops fast and tucks on landing', () => {
    const r = run(fixed([]));
    r.input('tuck');
    expect(r.tucked).toBe(true);
    expect(r.height).toBe(BODY.tuck);
    go(r, TUCK_S - 0.05);
    expect(r.tucked).toBe(true);
    go(r, 0.1);
    expect(r.tucked).toBe(false);

    r.input('hop');
    go(r, 0.2);
    expect(r.y).toBeGreaterThan(1);
    r.input('tuck');
    let fall = 0;
    while (r.airborne) {
      r.step();
      fall++;
    }
    expect(fall / SPS).toBeLessThan(0.15);
    expect(r.tuckS).toBeGreaterThan(TUCK_S - 0.05);
  });

  it('a hop cancels a tuck', () => {
    const r = run(fixed([]));
    r.input('tuck');
    r.input('hop');
    expect(r.airborne).toBe(true);
    expect(r.tucked).toBe(false);
  });
});

describe('obstacles', () => {
  /** One row 12 m ahead with `slot` in the middle lane. */
  const ahead = (slot: Slot, look = 0) =>
    run(fixed([makeRow(12, [EMPTY, slot, EMPTY], [0, look, 0])]));

  it('a low obstacle ends the run unless Pebble hops over it', () => {
    const r = ahead(LOW);
    const es = go(r, 1.2);
    expect(types(es)).toContain('crash');
    expect(r.phase).toBe('tumble');
    expect(r.z).toBeLessThan(12);

    const h = ahead(LOW);
    while ((12 - h.z) / h.speed > HOP_S / 2) h.step();
    h.input('hop');
    go(h, 1.2);
    expect(h.phase).toBe('run');
    expect(h.z).toBeGreaterThan(14);
  });

  it('a high obstacle ends the run unless Pebble tucks under it (hopping hits it too)', () => {
    expect(types(go(ahead(HIGH), 1.2))).toContain('crash');
    expect(types(go(ahead(HIGH, 1), 1.2))).toContain('crash');

    const t = ahead(HIGH);
    while ((12 - t.z) / t.speed > 0.2) t.step();
    t.input('tuck');
    go(t, 1.2);
    expect(t.phase).toBe('run');

    const h = ahead(HIGH);
    while ((12 - h.z) / h.speed > HOP_S / 2) h.step();
    h.input('hop');
    expect(types(go(h, 1.2))).toContain('crash');
  });

  it('a full obstacle ends the run whatever Pebble does, but not from the next lane', () => {
    for (const m of ['hop', 'tuck'] as const) {
      const r = ahead(FULL, 1);
      while ((12 - r.z) / r.speed > 0.2) r.step();
      r.input(m);
      expect(types(go(r, 1.2))).toContain('crash');
    }
    const side = ahead(FULL);
    side.input('left');
    go(side, 1.2);
    expect(side.phase).toBe('run');
  });

  it('a lane change into an obstacle alongside ends the run', () => {
    const r = run(fixed([makeRow(12, [FULL, EMPTY, EMPTY], [1, 0, 0])]));
    while (r.z < 11.5) r.step();
    r.input('left');
    expect(types(go(r, 0.5))).toContain('crash');
  });

  it('the crash knockback never takes metres off the score', () => {
    const r = ahead(FULL);
    let shown = 0;
    while (r.phase === 'run') {
      shown = r.distance;
      r.step();
    }
    expect(r.distance).toBeGreaterThanOrEqual(shown);
  });

  it('tumbles for a moment, then the run is over', () => {
    const r = ahead(FULL);
    const es = go(r, 1);
    expect(types(es)).toContain('crash');
    const z = r.z;
    const end = go(r, TUMBLE_MS / 1000 + 0.05);
    expect(types(end)).toEqual(['over']);
    expect(r.phase).toBe('over');
    expect(r.z).toBe(z);
    expect(r.speed).toBe(0);
  });
});

describe('bonuses', () => {
  /** One row 12 m ahead: `slot` in the middle lane, the side lanes empty. */
  const ahead = (slot: Slot) => run(fixed([makeRow(12, [EMPTY, slot, EMPTY])]));
  const bonuses = (es: readonly SimEvent[]) =>
    es.flatMap((e) => (e.type === 'bonus' ? [e.kind] : []));

  it('hopping a low obstacle or tucking under a high one scores a bonus, once', () => {
    const h = ahead(LOW);
    while ((12 - h.z) / h.speed > HOP_S / 2) h.step();
    h.input('hop');
    expect(bonuses(go(h, 1.5))).toEqual(['hop']);
    expect(h.score).toBe(h.distance + BONUS_POINTS);

    const t = ahead(HIGH);
    while ((12 - t.z) / t.speed > 0.2) t.step();
    t.input('tuck');
    expect(bonuses(go(t, 1.5))).toEqual(['tuck']);
    expect(t.bonuses).toBe(1);
  });

  it('sliding past in an empty lane scores nothing, however early the dodge', () => {
    const r = ahead(FULL);
    r.input('left');
    expect(bonuses(go(r, 1.5))).toEqual([]);
    expect(r.score).toBe(r.distance);
  });

  it('leaving the lane of an obstacle at the last moment is a close call', () => {
    const r = ahead(FULL);
    const front = 12 - HALF_LEN[FULL]![0]! - BODY.halfLen;
    while ((front - r.z) / r.speed > CLOSE_S * 0.8) r.step();
    r.input('left');
    expect(bonuses(go(r, 1.5))).toEqual(['close']);
    expect(r.phase).toBe('run');
  });

  it('an obstacle the scarf shattered scores nothing', () => {
    const r = run(
      fixed(
        [makeRow(14, [EMPTY, LOW, EMPTY])],
        [],
        [{ z: 5, lane: 1, kind: 'scarf', taken: false }],
      ),
    );
    const es = go(r, 2);
    expect(types(es)).toContain('scarf-save');
    expect(bonuses(es)).toEqual([]);
  });
});

describe('power-ups', () => {
  it('the scarf takes one hit, shatters the obstacle and leaves a moment of safety; the next hit counts', () => {
    const rows = [makeRow(14, [EMPTY, FULL, EMPTY]), makeRow(14 + 30, [EMPTY, FULL, EMPTY])];
    const r = run(fixed(rows, [], [{ z: 5, lane: 1, kind: 'scarf', taken: false }]));
    const got = go(r, 0.5);
    expect(got).toContainEqual({ type: 'power', kind: 'scarf' });
    expect(r.power).toBe('scarf');
    const es = go(r, 0.6);
    expect(types(es)).toContain('scarf-save');
    expect(types(es)).not.toContain('crash');
    expect(rows[0]!.hit[1]).toBe(true);
    expect(r.power).toBe(null);
    expect(r.ghostMs).toBeGreaterThan(GHOST_MS - 700);
    expect(types(go(r, 2))).toContain('crash');
  });

  it('the scarf wears off after 20 s and the bell after 8 s', () => {
    for (const kind of ['scarf', 'bell'] as const) {
      const r = run(fixed([], [], [{ z: 2, lane: 1, kind, taken: false }]));
      go(r, 0.2);
      expect(r.power).toBe(kind);
      go(r, POWER_MS[kind] / 1000 - 0.3);
      expect(r.power).toBe(kind);
      expect(go(r, 0.2)).toContainEqual({ type: 'power-end', kind });
      expect(r.power).toBe(null);
    }
  });

  it('the mail bell pulls in letters from every lane and height ahead', () => {
    const far = [letter(30, 0), letter(31, 2, 2.5), letter(32, 1)];
    const r = run(fixed([], far, [{ z: 2, lane: 1, kind: 'bell', taken: false }]));
    go(r, 0.2);
    expect(r.power).toBe('bell');
    // out of reach until they come within MAGNET_AHEAD
    while (r.z < 30 - MAGNET_AHEAD - 1) r.step();
    expect(r.letters).toBe(0);
    go(r, 1.2);
    expect(r.letters).toBe(3);
  });

  it('without the bell, letters in other lanes or high up are missed', () => {
    const r = run(fixed([], [letter(10, 0), letter(11, 2), letter(12, 1, 2.5), letter(13, 1)]));
    go(r, 1.5);
    expect(r.letters).toBe(1);
  });
});

describe('the course', () => {
  const SEEDS = 60;
  const SPEEDS: [string, (z: number) => number][] = [
    ['the ramp', speedAt],
    ['17 m/s', () => 17],
    ['24 m/s', () => 24],
    ['30 m/s', () => 30],
    ['36 m/s', () => 36],
  ];
  /** Rows up to 7 km (past the end of the ramp) for each seed. */
  function* courses(speed: (z: number) => number): Generator<[Course, (z: number) => number]> {
    for (let s = 0; s < SEEDS; s++) {
      const c = createCourse(createRng(`course:${s}`), speed);
      c.ensure(7000);
      yield [c, speed];
    }
  }

  it.each(SPEEDS)(
    'at %s, every row is passable, and every lane passable in a row can reach the next row in time',
    (_name, speed) => {
      let pairs = 0;
      for (const [c] of courses(speed)) {
        const rows = c.rows;
        expect(rows[0]!.front).toBe(FIRST_ROW);
        for (let r = 0; r < rows.length; r++) {
          const row = rows[r]!;
          expect(row.slots.some(passable)).toBe(true);
          expect(row.slots.some((s) => s !== EMPTY)).toBe(true);
          if (r === 0) continue;
          const prev = rows[r - 1]!;
          const gapS = (row.front - prev.back - 2 * BODY.halfLen) / speed(row.front);
          expect(gapS).toBeGreaterThanOrEqual(MIN_GAP_S);
          for (let i = 0; i < 3; i++) {
            if (!passable(prev.slots[i]!)) continue;
            const ok = [0, 1, 2].some(
              (j) =>
                passable(row.slots[j]!) &&
                gapS >= need(prev.slots[i]!, Math.abs(i - j), row.slots[j]!),
            );
            expect(ok).toBe(true);
            pairs++;
          }
        }
      }
      expect(pairs).toBeGreaterThan(SEEDS * 100);
    },
  );

  it('the timing model is enough: the autopilot gets through every pair of rows spaced exactly as `need` says', () => {
    const slots: Slot[] = [EMPTY, LOW, HIGH];
    let tried = 0;
    for (const z0 of [60, 1800, 5000]) {
      for (const a of slots)
        for (const b of slots)
          for (const [i, j] of [
            [1, 1],
            [1, 0],
            [0, 2],
            [2, 0],
          ] as const) {
            if (i === j && b === EMPTY) continue;
            for (const look of [0, 1]) {
              const prev = makeRow(
                z0,
                [FULL, FULL, FULL].map((s, l) => (l === i ? a : s)) as Slot[],
                [look, look, look],
              );
              const front0 = prev.back + 2 * BODY.halfLen;
              const v = speedAt(front0 + 40);
              const gap = Math.max(need(a, Math.abs(i - j), b), 0.01) * v;
              const rowSlots = [FULL, FULL, FULL].map((s, l) => (l === j ? b : s)) as Slot[];
              const looks = [look, look, look];
              const maxHalf = Math.max(...rowSlots.map((s) => HALF_LEN[s]![look]!));
              const row = makeRow(front0 + gap + maxHalf, rowSlots, looks);
              const r = run(fixed([prev, row]));
              r.z = z0 - 30;
              r.lane = i;
              r.x = i;
              for (let k = 0; k < 4 * SPS && r.z < row.back + 2; k++) {
                const m = autopilot(r);
                if (m) r.input(m);
                r.step();
              }
              expect(r.phase, `z ${z0} ${a}→${b} lanes ${i}→${j} look ${look}`).toBe('run');
              tried++;
            }
          }
    }
    expect(tried).toBeGreaterThan(150);
  });

  it('letters never sit inside an obstacle, except arcs over low ones', () => {
    for (const [c] of courses(speedAt)) {
      for (const l of c.letters) {
        const lane = Math.round(l.x);
        for (const row of c.rows) {
          const s = row.slots[lane]!;
          if (s === EMPTY || Math.abs(l.z - row.z) > row.halfLen[lane]! + 0.5) continue;
          expect(s).toBe(LOW);
          expect(l.h).toBeGreaterThan(LOW_TOP);
        }
      }
    }
  });

  it('places letters on most stretches, and a rare power-up spaced so two never overlap', () => {
    let letters = 0;
    let rows = 0;
    for (const [c] of courses(speedAt)) {
      letters += c.letters.length;
      rows += c.rows.length;
      const ps = c.pickups;
      expect(ps.length).toBeGreaterThanOrEqual(5);
      expect(ps.length).toBeLessThanOrEqual(9);
      for (let k = 1; k < ps.length; k++)
        expect(ps[k]!.z - ps[k - 1]!.z).toBeGreaterThan((TOP_SPEED * POWER_MS.scarf) / 1000);
      expect(new Set(ps.map((p) => p.kind)).size).toBe(2);
      // letters are kept in order along the track
      for (let k = 1; k < c.letters.length; k++)
        expect(c.letters[k]!.z).toBeGreaterThanOrEqual(c.letters[k - 1]!.z);
    }
    expect(letters / rows).toBeGreaterThan(2);
  });

  it('is the same for a seed', () => {
    const a = createCourse(createRng('same'));
    const b = createCourse(createRng('same'));
    a.ensure(2000);
    b.ensure(2000);
    expect(a.rows).toEqual(b.rows);
    expect(a.letters).toEqual(b.letters);
  });

  it('gets busier with distance', () => {
    let early = 0;
    let late = 0;
    for (const [c] of courses(speedAt)) {
      for (const row of c.rows) {
        const busy = row.slots.filter((s) => s !== EMPTY).length;
        if (row.z < 1000) early += busy / 1000;
        else if (row.z > 6000) late += busy / 1000;
      }
    }
    expect(late).toBeGreaterThan(early);
  });
});

describe('zones', () => {
  it('change every 600 m, cycling three', () => {
    expect(ZONE_M).toBe(600);
    expect([0, 599, 600, 1500, 1800, 2500].map(zoneAt)).toEqual([0, 0, 1, 2, 0, 1]);
    const r = run(fixed([]));
    const zones: number[] = [];
    while (r.z < ZONE_M * 4 + 1)
      for (const e of r.step()) if (e.type === 'zone') zones.push(e.zone);
    expect(zones).toEqual([1, 2, 0, 1]);
  });
});

describe('the sky between zones', () => {
  const at = (z: number) => skyMix({ from: 0, to: 0, k: 0 }, z);

  it('shows one sky in the middle of a zone', () => {
    expect(at(0)).toEqual({ from: 0, to: 0, k: 1 });
    expect(at(ZONE_M / 2)).toEqual({ from: 0, to: 0, k: 1 });
    expect(at(ZONE_M * 4.5)).toEqual({ from: 1, to: 1, k: 1 });
  });

  it('fades the next sky in smoothly across each boundary', () => {
    for (const b of [ZONE_M, ZONE_M * 3]) {
      const from = (b / ZONE_M - 1) % 3;
      let last = 0;
      for (let z = b - SKY_FADE.before; z < b + SKY_FADE.after; z += 5) {
        const m = at(z);
        expect([m.from, m.to]).toEqual([from, (from + 1) % 3]);
        expect(m.k).toBeGreaterThanOrEqual(last);
        expect(m.k - last).toBeLessThan(0.05);
        last = m.k;
      }
      expect(last).toBeGreaterThan(0.95);
    }
  });
});

describe('autopilot', () => {
  it('survives the whole ramp on several seeds and collects letters', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'pebble-post:attract']) {
      const r = createRun(createRng(seed));
      while (r.phase === 'run' && r.z < 6000) {
        const m = autopilot(r);
        if (m) r.input(m);
        r.step();
      }
      expect(r.phase, `seed ${seed} at ${r.distance} m`).toBe('run');
      expect(r.letters).toBeGreaterThan(300);
    }
  });

  it('is deterministic for a seed', () => {
    const play = () => {
      const r = createRun(createRng('det'));
      for (let i = 0; i < 60 * SPS; i++) {
        const m = autopilot(r);
        if (m) r.input(m);
        r.step();
      }
      return [r.z, r.letters, r.lane];
    };
    expect(play()).toEqual(play());
  });

  it('a player who never moves crashes early', () => {
    const r = createRun(createRng('idle'));
    while (r.phase === 'run') r.step();
    expect(r.distance).toBeLessThan(400);
  });
});

describe('save guards', () => {
  const fixture = JSON.parse(
    readFileSync(join(import.meta.dirname, 'fixtures/save/stats.v1.json'), 'utf8'),
  );

  it('accepts the committed fixture and the defaults', () => {
    expect(isStatsV1(fixture)).toBe(true);
    expect(isStatsV1(freshStats())).toBe(true);
  });

  it('rejects bad shapes', () => {
    for (const bad of [
      null,
      [],
      { ...fixture, best: -1 },
      { ...fixture, runs: 1.5 },
      { ...fixture, bestDistance: '9' },
      { best: 1, runs: 1, bestDistance: 1 },
    ])
      expect(isStatsV1(bad)).toBe(false);
  });

  it('records a finished run', () => {
    const s = withRun(fixture, { score: 7000, distance: 4000, letters: 20 });
    expect(s).toEqual({ best: 7000, runs: 18, bestDistance: 4870, letters: 1332 });
    expect(withRun(freshStats(), { score: 0, distance: 0, letters: 0 }).runs).toBe(1);
  });
});
