// serve-static must route and set headers the way Vercel does, or the e2e tests prove nothing about production.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { headersFor, resolvePath, sourceToRegExp, type VercelConfig } from '../serve-static.ts';

const dir = mkdtempSync(join(tmpdir(), 'pocketcade-out-'));
mkdirSync(join(dir, 'games', 'sumslide'), { recursive: true });
writeFileSync(join(dir, 'index.html'), 'home');
writeFileSync(join(dir, 'games', 'sumslide', 'index.html'), 'game');
writeFileSync(join(dir, 'version.json'), '{}');
writeFileSync(join(dir, '404.html'), 'missing');
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const config: VercelConfig = {
  trailingSlash: true,
  cleanUrls: true,
  headers: [
    { source: '/(.*)', headers: [{ key: 'X-Frame-Options', value: 'DENY' }] },
    { source: '/_next/static/(.*)', headers: [{ key: 'Cache-Control', value: 'immutable' }] },
    { source: '/version.json', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
  ],
};

describe('sourceToRegExp', () => {
  it('handles groups, params and literal dots', () => {
    expect(sourceToRegExp('/(.*)').test('/anything/at/all')).toBe(true);
    expect(sourceToRegExp('/_next/static/(.*)').test('/_next/static/chunks/a.js')).toBe(true);
    expect(sourceToRegExp('/_next/static/(.*)').test('/media/x.png')).toBe(false);
    expect(sourceToRegExp('/version.json').test('/versionXjson')).toBe(false);
    expect(sourceToRegExp('/games/:slug').test('/games/sumslide')).toBe(true);
  });
});

describe('resolvePath', () => {
  it('308s extension-less paths to the slash form, keeping the query', () => {
    expect(resolvePath(dir, config, '/games/sumslide', '?a=1')).toEqual({
      kind: 'redirect',
      location: '/games/sumslide/?a=1',
    });
  });
  it('308s *.html to the clean URL', () => {
    expect(resolvePath(dir, config, '/games/sumslide/index.html', '')).toEqual({
      kind: 'redirect',
      location: '/games/sumslide/',
    });
  });
  it('serves directories and files, and reports misses', () => {
    expect(resolvePath(dir, config, '/', '')).toEqual({
      kind: 'file',
      file: join(dir, 'index.html'),
    });
    expect(resolvePath(dir, config, '/version.json', '')).toEqual({
      kind: 'file',
      file: join(dir, 'version.json'),
    });
    expect(resolvePath(dir, config, '/games/nope/', '')).toEqual({ kind: 'missing' });
  });
  it('rejects path traversal', () => {
    expect(resolvePath(dir, config, '/../../etc/passwd.txt', '')).toEqual({ kind: 'missing' });
  });
});

describe('headersFor', () => {
  it('applies every matching rule and the default cache class', () => {
    expect(headersFor(config, '/')).toEqual({
      'X-Frame-Options': 'DENY',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    });
    expect(headersFor(config, '/_next/static/chunks/a.js')).toEqual({
      'X-Frame-Options': 'DENY',
      'Cache-Control': 'immutable',
    });
    expect(headersFor(config, '/version.json')['Cache-Control']).toBe('no-cache');
  });
});
