// The HUD layout at every frame shape the game accepts, and the tile numbers' contrast.
import { contrastRatio } from '@pocketcade/toolkit';
import { describe, expect, it } from 'vitest';
import { tileFill, tileInk } from '../src/art.ts';
import { layoutHud, type Rect } from '../src/layout.ts';

/** The view the toolkit gives a 720 × 720 design area at a frame aspect ratio. */
function viewFor(aspect: number) {
  const width = aspect > 1 ? Math.round(720 * aspect) : 720;
  const height = aspect < 1 ? Math.round(720 / aspect) : 720;
  return { x: (720 - width) / 2, y: (720 - height) / 2, width, height };
}

const overlap = (a: Rect, b: Rect) =>
  a.x < b.x + b.w - 0.01 &&
  b.x < a.x + a.w - 0.01 &&
  a.y < b.y + b.h - 0.01 &&
  b.y < a.y + a.h - 0.01;

const ASPECTS = [9 / 16, 0.7, 3 / 4, 0.9, 1, 1.15, 1.25, 4 / 3, 1.5, 16 / 10, 16 / 9];

describe('layoutHud()', () => {
  for (const aspect of ASPECTS)
    for (const pause of [0, 70, 130])
      it(`aspect ${aspect.toFixed(2)}, pause corner ${pause}`, () => {
        const view = viewFor(aspect);
        const L = layoutHud(view, pause);
        const tray = { x: L.tray.x, y: L.tray.y, w: L.tray.size, h: L.tray.size };
        const cards = [L.score, L.goal, L.echo, L.undo];
        const corner = { x: view.x + view.width - pause, y: view.y, w: pause, h: pause };
        for (const r of [tray, ...cards]) {
          expect(r.x).toBeGreaterThanOrEqual(view.x);
          expect(r.y).toBeGreaterThanOrEqual(view.y);
          expect(r.x + r.w).toBeLessThanOrEqual(view.x + view.width + 0.01);
          expect(r.y + r.h).toBeLessThanOrEqual(view.y + view.height + 0.01);
          expect(overlap(r, corner)).toBe(false);
        }
        cards.forEach((a, i) => {
          expect(overlap(a, tray)).toBe(false);
          expect(a.w).toBeGreaterThanOrEqual(70);
          expect(a.h).toBeGreaterThanOrEqual(76);
          for (const b of cards.slice(i + 1)) expect(overlap(a, b)).toBe(false);
        });
        expect(L.tray.size).toBeGreaterThanOrEqual(pause > 100 ? 570 : 600);
      });
});

describe('tile colours', () => {
  it('every number stands out from its tile (at least 3:1), and neighbours differ', () => {
    for (let level = 1; level <= 12; level++) {
      expect(contrastRatio(tileInk(level), tileFill(level))).toBeGreaterThanOrEqual(3);
      if (level < 11) expect(tileFill(level)).not.toBe(tileFill(level + 1));
    }
  });
});
