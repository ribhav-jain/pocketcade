// The layout keeps everything the player needs inside the view at every frame shape the game accepts.
import { describe, expect, it } from 'vitest';
import { FABRICS, LIGHTS, lightFor } from '../src/art.ts';
import { BIND, CELL_MAX, DESIGN, PILL, PURL_ASPECT, frameFor, trayScale } from '../src/layout.ts';
import { COLOURS, SHAPES, SIZE } from '../src/logic.ts';
import { meta as gameMeta } from '../src/meta.ts';

/** The visible rectangle the toolkit gives a frame of this aspect (see definePhaserGame). */
function viewFor(aspect: number) {
  const base = DESIGN.width / DESIGN.height;
  const width = aspect > base ? Math.round(DESIGN.height * aspect) : DESIGN.width;
  const height = aspect < base ? Math.round(DESIGN.width / aspect) : DESIGN.height;
  return { x: (DESIGN.width - width) / 2, y: (DESIGN.height - height) / 2, width, height };
}

const ASPECTS = [9 / 16, 0.65, 3 / 4, 0.9, 1, 1.2, 4 / 3, 1.5, 16 / 9];
type Box = { x: number; y: number; w: number; h: number };
const overlap = (a: Box, b: Box) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe.each(ASPECTS)('layout at aspect %f', (aspect) => {
  const view = viewFor(aspect);
  const f = frameFor(view);
  const outer = f.cell * SIZE + BIND * 2;
  const quilt: Box = { x: f.gx - BIND, y: f.gy - BIND, w: outer, h: outer };
  const pills: Box[] = [f.score, f.best].map((p) => ({ ...p, w: PILL.w, h: PILL.h }));
  const purl: Box = {
    x: f.purl.x - (f.purl.h * PURL_ASPECT) / 2,
    y: f.purl.y - f.purl.h,
    w: f.purl.h * PURL_ASPECT,
    h: f.purl.h,
  };
  const inside = (b: Box) =>
    b.x >= view.x - 0.5 &&
    b.y >= view.y - 0.5 &&
    b.x + b.w <= view.x + view.width + 0.5 &&
    b.y + b.h <= view.y + view.height + 0.5;

  it('keeps the quilt, tray, score and Purl inside the view', () => {
    for (const box of [quilt, ...f.slots, ...pills, purl]) expect(inside(box)).toBe(true);
  });

  it('keeps the tray and the score off the quilt and off each other', () => {
    for (const box of [...f.slots, ...pills]) expect(overlap(box, quilt)).toBe(false);
    expect(overlap(f.slots[0], f.slots[1])).toBe(false);
    expect(overlap(f.slots[1], f.slots[2])).toBe(false);
    expect(overlap(pills[0]!, pills[1]!)).toBe(false);
    for (const p of pills) expect(overlap(p, purl)).toBe(false);
  });

  it('leaves the pause button corner free of the tray and Purl', () => {
    const corner: Box = { x: view.x + view.width - 100, y: view.y, w: 100, h: 100 };
    for (const box of [...f.slots, ...pills, purl]) expect(overlap(box, corner)).toBe(false);
  });

  it('gives big squares and touch targets', () => {
    expect(f.cell).toBeGreaterThanOrEqual(70);
    expect(f.cell).toBeLessThanOrEqual(CELL_MAX);
    for (const s of f.slots) expect(Math.min(s.w, s.h)).toBeGreaterThanOrEqual(190);
    // every waiting patch fits inside its slot
    for (const shape of SHAPES) {
      const k = trayScale(f, shape.w, shape.h) * f.cell;
      expect(k * shape.w).toBeLessThanOrEqual(f.slots[0].w - 20);
      expect(k * shape.h).toBeLessThanOrEqual(f.slots[0].h - 20);
      expect(k).toBeGreaterThanOrEqual(30);
    }
  });
});

describe('frame', () => {
  it('stacks on a tall view and goes side by side on a wide one', () => {
    expect(frameFor(viewFor(9 / 16)).mode).toBe('stack');
    expect(frameFor(viewFor(3 / 4)).mode).toBe('stack');
    expect(frameFor(viewFor(16 / 9)).mode).toBe('side');
    expect(frameFor(viewFor(16 / 9)).cell).toBe(CELL_MAX);
  });

  it('the design area sits inside the aspect range', () => {
    const ratio = DESIGN.width / DESIGN.height;
    expect(ratio).toBeGreaterThanOrEqual(gameMeta.aspectRatio.min);
    expect(ratio).toBeLessThanOrEqual(gameMeta.aspectRatio.max);
  });
});

describe('art tables', () => {
  it('gives every colour its own pattern, so no patch relies on colour alone', () => {
    expect(FABRICS).toHaveLength(COLOURS);
    expect(new Set(FABRICS.map((f) => f.pattern)).size).toBe(COLOURS);
    expect(new Set(FABRICS.map((f) => f.color)).size).toBe(COLOURS);
  });

  it('moves the light on as the score passes each milestone', () => {
    expect(lightFor(0)).toBe(0);
    LIGHTS.forEach((light, i) => {
      expect(lightFor(light.from)).toBe(i);
      if (i > 0) expect(lightFor(light.from - 1)).toBe(i - 1);
    });
    expect(lightFor(1e9)).toBe(LIGHTS.length - 1);
  });
});
