// The layout keeps everything the player needs inside the view, readable and tappable, at every frame shape and
// for every number of bottles.
import { describe, expect, it } from 'vitest';
import {
  BOTTLE,
  BOTTLE_MAX,
  BUTTONS,
  DESIGN,
  PAUSE_CSS,
  PILL,
  SHELF,
  bottleAt,
  buttonAt,
  frameFor,
  neighbourRow,
} from '../src/layout.ts';
import { MAX_BOTTLES } from '../src/logic.ts';
import { meta as gameMeta } from '../src/meta.ts';

/** The visible rectangle the toolkit gives a frame of this aspect (see definePhaserGame). */
function viewFor(aspect: number) {
  const base = DESIGN.width / DESIGN.height;
  const width = aspect > base ? Math.round(DESIGN.height * aspect) : DESIGN.width;
  const height = aspect < base ? Math.round(DESIGN.width / aspect) : DESIGN.height;
  return { x: (DESIGN.width - width) / 2, y: (DESIGN.height - height) / 2, width, height };
}

/** Frames in CSS px: phones, a small desktop frame, a square, a wide one. */
const FRAMES: readonly (readonly [number, number])[] = [
  [320, 568],
  [360, 640],
  [390, 700],
  [390, 844],
  [700, 700],
  [768, 1024],
  [1031, 580],
  [844, 390],
  [1600, 900],
];
const COUNTS = [5, 7, 9, 11, 14, MAX_BOTTLES];
type Box = { x: number; y: number; w: number; h: number };
const overlap = (a: Box, b: Box) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('the frame', () => {
  it('has a design area inside the aspect range', () => {
    const ratio = DESIGN.width / DESIGN.height;
    expect(ratio).toBeGreaterThanOrEqual(gameMeta.aspectRatio.min);
    expect(ratio).toBeLessThanOrEqual(gameMeta.aspectRatio.max);
  });
});

describe.each(FRAMES)('layout in a %i × %i frame', (cssW, cssH) => {
  const { min, max } = gameMeta.aspectRatio;
  const view = viewFor(Math.min(max, Math.max(min, cssW / cssH)));
  const css = Math.min(cssW / view.width, cssH / view.height);
  const right = view.x + view.width;
  const bottom = view.y + view.height;
  const inside = (b: Box) =>
    b.x >= view.x - 0.5 &&
    b.y >= view.y - 0.5 &&
    b.x + b.w <= right + 0.5 &&
    b.y + b.h <= bottom + 0.5;
  const corner: Box = {
    x: right - PAUSE_CSS / css,
    y: view.y,
    w: PAUSE_CSS / css,
    h: PAUSE_CSS / css,
  };

  it.each(COUNTS)('fits %i bottles', (count) => {
    const f = frameFor(view, css, count);
    const w = BOTTLE.w * f.scale;
    const h = BOTTLE.h * f.scale;
    expect(f.spots).toHaveLength(count);
    expect(f.scale).toBeLessThanOrEqual(BOTTLE_MAX + 1e-9);

    // bottles: inside the view even when lifted, apart from each other, clear of the pause button
    const bottles = f.spots.map((s) => ({ x: s.x - w / 2, y: s.y - h - f.lift, w, h: h + f.lift }));
    for (const b of bottles) {
      expect(inside(b)).toBe(true);
      expect(overlap({ ...b, y: b.y + f.lift, h }, corner)).toBe(false);
    }
    for (let i = 0; i < count; i++)
      for (let j = i + 1; j < count; j++) expect(overlap(bottles[i]!, bottles[j]!)).toBe(false);
    expect(f.pitch).toBeGreaterThanOrEqual(w * 1.2);

    // big enough to tap and to read: a slot at least 44 CSS px wide, a bottle at least 90 tall
    expect(f.pitch * css).toBeGreaterThanOrEqual(44);
    expect(h * css).toBeGreaterThanOrEqual(90);

    // HUD pills: readable, inside the view, clear of the pause button and of the bottles
    const pills: Box[] = [
      { ...f.level, w: PILL.level * f.pillScale, h: PILL.h * f.pillScale },
      { ...f.moves, w: PILL.moves * f.pillScale, h: PILL.h * f.pillScale },
    ];
    expect(PILL.h * f.pillScale * css).toBeGreaterThanOrEqual(28);
    expect(overlap(pills[0]!, pills[1]!)).toBe(false);
    for (const p of pills) {
      expect(inside(p)).toBe(true);
      expect(overlap(p, corner)).toBe(false);
      for (const b of bottles) expect(overlap(p, { ...b, y: b.y + f.lift, h })).toBe(false);
    }

    // helper buttons: at least 48 CSS px, inside the view, apart, below the last shelf
    expect(f.buttons).toHaveLength(BUTTONS);
    expect(f.buttonSize * css).toBeGreaterThanOrEqual(48);
    const lastShelf = f.shelves[f.shelves.length - 1]!;
    const buttons = f.buttons.map((b) => ({
      x: b.x - f.buttonSize / 2,
      y: b.y - f.buttonSize / 2,
      w: f.buttonSize,
      h: f.buttonSize * 1.3,
    }));
    buttons.forEach((b, i) => {
      expect(inside(b)).toBe(true);
      expect(b.y).toBeGreaterThanOrEqual(lastShelf.y + SHELF);
      if (i > 0) expect(overlap(b, buttons[i - 1]!)).toBe(false);
    });

    // Pekoe: on the counter, beside the buttons, below the last shelf
    if (f.pekoe) {
      const pw = (f.pekoe.h * 220) / 200;
      const pekoe = { x: f.pekoe.x - pw / 2, y: f.pekoe.y - f.pekoe.h, w: pw, h: f.pekoe.h };
      expect(inside(pekoe)).toBe(true);
      expect(pekoe.y).toBeGreaterThanOrEqual(lastShelf.y + SHELF);
      for (const b of buttons) expect(overlap(pekoe, b)).toBe(false);
    }
  });

  it('finds bottles and buttons under a tap', () => {
    const f = frameFor(view, css, 11);
    const h = BOTTLE.h * f.scale;
    f.spots.forEach((s, i) => {
      expect(bottleAt(f, s.x, s.y - h / 2)).toBe(i);
      expect(bottleAt(f, s.x + f.pitch * 0.4, s.y - h * 0.9)).toBe(i);
      expect(buttonAt(f, s.x, s.y - h / 2)).toBe(-1);
    });
    f.buttons.forEach((b, i) => {
      expect(buttonAt(f, b.x, b.y)).toBe(i);
      expect(bottleAt(f, b.x, b.y)).toBe(-1);
    });
    expect(bottleAt(f, view.x + 2, bottom - 2)).toBe(-1);
  });

  it('moves the keyboard cursor between rows', () => {
    const f = frameFor(view, css, MAX_BOTTLES);
    for (let i = 0; i < MAX_BOTTLES; i++) {
      const up = neighbourRow(f, i, -1);
      const down = neighbourRow(f, i, 1);
      expect(f.rowOf[up]).toBe(Math.max(0, f.rowOf[i]! - 1));
      expect(f.rowOf[down]).toBe(Math.min(f.rows - 1, f.rowOf[i]! + 1));
    }
  });
});

describe('rows', () => {
  it('uses one row when the bottles fit and more when that makes them larger', () => {
    const wide = viewFor(16 / 9);
    expect(frameFor(wide, 0.6, 5).rows).toBe(1);
    const tall = viewFor(9 / 16);
    expect(frameFor(tall, 0.54, 5).rows).toBeGreaterThan(1);
    expect(frameFor(tall, 0.54, 14).rows).toBe(3);
    // every row holds as many bottles as the next, or one more
    const f = frameFor(tall, 0.54, 13);
    const perRow = [0, 1, 2].map((r) => f.rowOf.filter((row) => row === r).length);
    expect(perRow).toEqual([5, 4, 4]);
  });
});
