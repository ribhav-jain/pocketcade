// @vitest-environment node
// Every toolkit entry imports in Node with no DOM globals, starts no timers, and does not load Phaser
// (mocked here to throw): games must be importable by the portal build and by unit tests.
import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => {
  throw new Error('phaser must not be imported at module load');
});

describe('toolkit entries are side-effect free', () => {
  it('has no DOM in this environment', () => {
    expect(typeof (globalThis as { window?: unknown }).window).toBe('undefined');
    expect(typeof (globalThis as { document?: unknown }).document).toBe('undefined');
  });

  it.each([
    ['core', '../src/index.ts'],
    ['phaser', '../src/phaser/index.ts'],
  ])('imports the %s entry', async (_name, path) => {
    const timers = vi.spyOn(globalThis, 'setTimeout');
    const intervals = vi.spyOn(globalThis, 'setInterval');
    const mod = (await import(path)) as Record<string, unknown>;
    expect(Object.keys(mod).length).toBeGreaterThan(0);
    expect(timers).not.toHaveBeenCalled();
    expect(intervals).not.toHaveBeenCalled();
  });
});
