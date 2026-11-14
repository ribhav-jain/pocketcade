// tools/postbuild: runs after `next build` in @pocketcade/web.
// 1. Turbopack ignores webpackPrefetch hints, so each Phaser game page gets a <link rel="prefetch"> for the
//    shared Phaser chunk (fetched, not evaluated, before Play).
// 2. Writes flat copies of the nested per-segment RSC payloads (see flattenSegmentPayloads).
// Usage: node tools/postbuild.ts [outDir]
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');

/** Only the Phaser chunk contains both of these engine class names. */
export function isPhaserChunk(source: string): boolean {
  return source.includes('WebGLRenderer') && source.includes('SceneManager');
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)],
  );
}

export function findPhaserChunks(outDir: string): string[] {
  const chunks = join(outDir, '_next', 'static');
  if (!existsSync(chunks)) return [];
  return walk(chunks)
    .filter((f) => f.endsWith('.js') && isPhaserChunk(readFileSync(f, 'utf8')))
    .map((f) => `/${relative(outDir, f).split(sep).join('/')}`);
}

/**
 * Next's static export writes per-segment RSC payloads nested, e.g.
 * games/sumslide/__next.games/$d$slug/__PAGE__.txt, but the client router requests the flat name
 * games/sumslide/__next.games.$d$slug.__PAGE__.txt (404, then it falls back to index.txt). Write the flat
 * copies next to the nested files so segment prefetches hit on any static host. Returns the copies written.
 */
export function flattenSegmentPayloads(outDir: string): string[] {
  const written: string[] = [];
  for (const file of walk(outDir)) {
    const rel = relative(outDir, file).split(sep);
    const i = rel.findIndex((part) => part.startsWith('__next.'));
    if (i === -1 || i === rel.length - 1 || !file.endsWith('.txt')) continue;
    const flat = join(outDir, ...rel.slice(0, i), rel.slice(i).join('.'));
    if (!existsSync(flat)) {
      writeFileSync(flat, readFileSync(file));
      written.push(relative(outDir, flat).split(sep).join('/'));
    }
  }
  return written;
}

const MARKER = 'data-pocketcade-prefetch';

/** Game ids whose package depends on phaser. */
export function phaserGameIds(gamesRoot: string): string[] {
  if (!existsSync(gamesRoot)) return [];
  return readdirSync(gamesRoot).filter((id) => {
    const pkg = join(gamesRoot, id, 'package.json');
    if (!existsSync(pkg)) return false;
    const json = JSON.parse(readFileSync(pkg, 'utf8')) as { dependencies?: Record<string, string> };
    return 'phaser' in (json.dependencies ?? {});
  });
}

export function injectPrefetch(html: string, hrefs: readonly string[]): string {
  if (html.includes(MARKER) || hrefs.length === 0) return html;
  const links = hrefs
    .map((h) => `<link rel="prefetch" as="script" href="${h}" ${MARKER}="phaser"/>`)
    .join('');
  return html.replace('</head>', `${links}</head>`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const outDir = process.argv[2] ?? join(root, 'apps', 'web', 'out');
  const phaser = findPhaserChunks(outDir);
  const gamesDir = join(outDir, 'games');
  let pages = 0;
  if (existsSync(gamesDir)) {
    // Only Phaser games get the prefetch; a DOM game (Letterhop) never needs the Phaser chunk.
    const phaserGames = phaserGameIds(join(root, 'packages', 'games'));
    for (const f of walk(gamesDir).filter((p) =>
      phaserGames.some((id) => p.endsWith(join(id, 'index.html'))),
    )) {
      const html = readFileSync(f, 'utf8');
      const next = injectPrefetch(html, phaser);
      if (next !== html) {
        writeFileSync(f, next);
        pages++;
      }
    }
  }
  const flattened = flattenSegmentPayloads(outDir);
  if (flattened.length > 0)
    console.log(
      `postbuild: wrote ${flattened.length} flat segment payload(s): ${flattened.join(', ')}`,
    );
  console.log(
    `postbuild: ${phaser.length} Phaser chunk(s) ${JSON.stringify(phaser)}; prefetch added to ${pages} game page(s)`,
  );
  if (phaser.length !== 1)
    console.warn(`postbuild: expected exactly 1 Phaser chunk, found ${phaser.length}`);
}
