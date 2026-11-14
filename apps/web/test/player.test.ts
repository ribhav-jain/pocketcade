import type { CrashReport } from '@pocketcade/host';
import { describe, expect, it } from 'vitest';
import { bugReportUrl, crashDetails, formatValue } from '../src/lib/player';

const report: CrashReport = {
  gameId: 'sumslide',
  gameVersion: '1.0.0',
  apiVersion: 1,
  hostVersion: '0.2.0',
  buildId: 'local',
  phase: 'running',
  errorName: 'TypeError',
  message: 'x is undefined',
  stack: Array.from(
    { length: 400 },
    (_, i) =>
      `    at frame${i} (https://example.test/_next/static/chunks/${'a'.repeat(40)}.js:1:${i})`,
  ).join('\n'),
  fullscreenMode: 'none',
  inputPrimary: 'keyboard',
  storagePersistent: true,
  reportedErrors: { count: 0, last: [] },
  userAgent: 'test',
  occurredAt: '2026-11-10T00:00:00.000Z',
  path: '/games/sumslide/',
  crashLoop: false,
  primaryAction: 'restart',
};

describe('formatValue', () => {
  it('formats integers, moves and times', () => {
    expect(formatValue('integer', 1234567)).toBe('1,234,567');
    expect(formatValue('moves', 1)).toBe('1 move');
    expect(formatValue('moves', 12)).toBe('12 moves');
    expect(formatValue('duration_ms', 83_456)).toBe('1:23.45');
    expect(formatValue('duration_ms', 3_723_009)).toBe('1:02:03.00');
  });
});

describe('crash reporting', () => {
  it('bug report URLs stay within 8,000 characters by trimming the stack', () => {
    const url = bugReportUrl('https://github.com/o/r', report);
    expect(url.length).toBeLessThanOrEqual(8000);
    expect(url.startsWith('https://github.com/o/r/issues/new?title=')).toBe(true);
    expect(decodeURIComponent(url)).toContain('TypeError');
  });

  it('copy details lists the facts and at most 30 stack lines', () => {
    const text = crashDetails(report);
    expect(text).toContain('TypeError: x is undefined');
    expect(text).toContain('phase: running');
    expect(text.split('\n').filter((l) => l.includes(' at frame'))).toHaveLength(30);
  });
});
