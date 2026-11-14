import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { findPhaserChunks, flattenSegmentPayloads, injectPrefetch } from '../postbuild.ts';

const dir = mkdtempSync(join(tmpdir(), 'pocketcade-post-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('postbuild', () => {
  it('finds the Phaser chunk and no other', () => {
    const chunks = join(dir, '_next', 'static', 'chunks');
    mkdirSync(chunks, { recursive: true });
    writeFileSync(join(chunks, 'p.js'), 'class WebGLRenderer{} class SceneManager{}');
    writeFileSync(join(chunks, 'game.js'), 'scene.renderer instanceof WebGLRenderer');
    writeFileSync(join(chunks, 'app.js'), 'console.log("app")');
    expect(findPhaserChunks(dir)).toEqual(['/_next/static/chunks/p.js']);
  });

  it('adds one prefetch link per Phaser chunk, once', () => {
    const once = injectPrefetch('<head></head>', ['/x.js']);
    expect(once).toBe(
      '<head><link rel="prefetch" as="script" href="/x.js" data-pocketcade-prefetch="phaser"/></head>',
    );
    expect(injectPrefetch(once, ['/x.js'])).toBe(once);
  });

  it('writes flat copies of nested per-segment RSC payloads', () => {
    const nested = join(dir, 'games', 'sumslide', '__next.games', '$d$slug');
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(nested, '__PAGE__.txt'), 'payload');
    expect(flattenSegmentPayloads(dir)).toEqual([
      'games/sumslide/__next.games.$d$slug.__PAGE__.txt',
    ]);
    expect(
      readFileSync(join(dir, 'games', 'sumslide', '__next.games.$d$slug.__PAGE__.txt'), 'utf8'),
    ).toBe('payload');
    expect(existsSync(join(nested, '__PAGE__.txt'))).toBe(true);
  });
});
