// Design tokens: the colour pairs games use meet WCAG contrast, and reduced motion turns animation off.
import { describe, expect, it } from 'vitest';
import { SHAPES, colorNum, colors, contrastRatio, mixHex } from '../src/tokens.ts';
import { createMotion, defineStrings, formatScore } from '../src/util.ts';

describe('colour tokens', () => {
  it.each([
    ['text', 'bg', 4.5],
    ['text', 'surface', 4.5],
    ['text', 'raised', 4.5],
    ['textMuted', 'bg', 4.5],
    ['textMuted', 'surface', 4.5],
    ['textMuted', 'raised', 4.5],
    ['ink', 'paper', 4.5],
    ['ink', 'orange', 4.5],
    ['ink', 'yellow', 4.5],
    ['orange', 'bg', 3],
    ['sky', 'bg', 3],
    ['green', 'bg', 3],
    ['yellow', 'bg', 3],
    ['blue', 'bg', 3],
    ['vermillion', 'bg', 3],
    ['purple', 'bg', 3],
  ] as const)('%s on %s ≥ %s:1', (fg, bg, min) => {
    expect(contrastRatio(colors[fg], colors[bg])).toBeGreaterThanOrEqual(min);
  });

  it('every accent has a distinct shape', () => {
    expect(new Set(Object.values(SHAPES)).size).toBe(Object.keys(SHAPES).length);
  });

  it('converts and mixes colours', () => {
    expect(colorNum('bg')).toBe(Number.parseInt(colors.bg.slice(1), 16));
    expect(mixHex('#000000', '#FFFFFF', 0.5)).toBe('#808080');
  });
});

describe('motion and util', () => {
  it('collapses every duration to 0 under reduced motion', () => {
    expect(createMotion(true).ms('celebrate')).toBe(0);
    expect(createMotion(false).ms('fast')).toBe(120);
    expect(createMotion(true).shake()).toBe(false);
  });

  it('formats scores per leaderboard format', () => {
    expect(formatScore(12345, 'integer', 'en-US')).toBe('12,345');
    expect(formatScore(1, 'moves', 'en-US')).toBe('1 move');
    expect(formatScore(65_490, 'duration_ms', 'en-US')).toBe('1:05.4');
    expect(formatScore(3_725_000, 'duration_ms', 'en-US')).toBe('1:02:05.0');
  });

  it('fills string placeholders', () => {
    const s = defineStrings({ toast: 'Rung {n} · {value}' });
    expect(s.t('toast', { n: 3, value: '320' })).toBe('Rung 3 · 320');
  });
});
