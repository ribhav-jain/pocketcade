// tools/check-budgets: gzip sizes of the exported build against tools/budgets.json.
// Usage: node tools/check-budgets.ts [outDir]   → prints a table; exits 1 when anything is over budget.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { findPhaserChunks } from './postbuild.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Bytes after gzip -9. */
interface Budgets {
  /** all JS the home page loads up front */
  catalogPageJs: number;
  /** the one shared Phaser chunk */
  phaserChunk: number;
  /** one game's lazy chunks, toolkit included, Phaser excluded */
  gameCode: number;
}

/**
 * Unique /_next/static/**.js files referenced by <script src> and <link rel="modulepreload"> (initial JS). Legacy
 * `noModule` scripts are skipped: modern browsers never download them.
 */
function initialScripts(html: string): string[] {
  const srcs = [...html.matchAll(/<script[^>]*\ssrc="(\/_next\/static\/[^"]+\.js)"[^>]*>/g)]
    .filter((m) => !/\snomodule\b/i.test(m[0]))
    .map((m) => m[1]!);
  const preloads = [
    ...html.matchAll(/<link[^>]*rel="modulepreload"[^>]*href="(\/_next\/static\/[^"]+\.js)"/g),
  ].map((m) => m[1]!);
  return [...new Set([...srcs, ...preloads])];
}

/**
 * The files the player downloads when a game starts, read from the build itself so no per-game table is needed.
 * The registry (`'<id>': () => import('@pocketcade/game-<id>')`) compiles to `<id>:()=>e.A(<module>)`, and
 * Turbopack emits one loader per lazy module: `<module>,e=>{e.v(t=>Promise.all(["static/chunks/a.js", …]`.
 * Phaser is a further lazy import inside the toolkit, so it is not in the list. Returns [] when the build does
 * not have that shape.
 */
export function gameChunks(sources: readonly string[], id: string): string[] {
  const key = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const entry = new RegExp(`["{,]${key}"?:\\(\\)=>\\w+\\.A\\((\\d+)\\)`);
  const moduleId = sources.map((s) => entry.exec(s)?.[1]).find(Boolean);
  if (!moduleId) return [];
  const loader = new RegExp(
    `\\b${moduleId},\\w+=>\\{\\w+\\.v\\(\\w+=>Promise\\.all\\(\\[([^\\]]*)\\]`,
  );
  const files = sources.map((s) => loader.exec(s)?.[1]).find((list) => list !== undefined);
  return [...(files ?? '').matchAll(/"([^"]+\.js)"/g)].map((m) => `/_next/${m[1]!}`);
}

type Row = [name: string, value: number, limit: number, note: string];

function main(outDir: string): void {
  const budgets = JSON.parse(readFileSync(join(root, 'tools', 'budgets.json'), 'utf8')) as Budgets;
  const file = (url: string) => readFileSync(join(outDir, url));
  const gzip = (urls: string[]) =>
    urls.reduce((sum, u) => sum + gzipSync(file(u), { level: 9 }).length, 0);

  const home = initialScripts(readFileSync(join(outDir, 'index.html'), 'utf8'));
  const phaser = findPhaserChunks(outDir);
  const chunkDir = join(outDir, '_next', 'static', 'chunks');
  const sources = readdirSync(chunkDir)
    .filter((f) => f.endsWith('.js'))
    .map((f) => readFileSync(join(chunkDir, f), 'utf8'));
  const gamesDir = join(outDir, 'games');
  const games = readdirSync(gamesDir).filter((id) => existsSync(join(gamesDir, id, 'index.html')));

  const problems: string[] = [];
  const rows: Row[] = [
    ['catalog page JS (/)', gzip(home), budgets.catalogPageJs, `${home.length} files`],
    ['Phaser chunks on the catalog page', home.filter((u) => phaser.includes(u)).length, 0, ''],
    ['Phaser chunk', gzip(phaser), budgets.phaserChunk, `${phaser.length} file(s)`],
    ...games.map((id): Row => {
      const urls = gameChunks(sources, id);
      if (urls.length === 0)
        problems.push(`${id}: cannot find its lazy chunks in the build (see gameChunks)`);
      return [`${id} (code incl. toolkit)`, gzip(urls), budgets.gameCode, `${urls.length} files`];
    }),
  ];
  if (phaser.length !== 1) problems.push(`expected exactly 1 Phaser chunk, found ${phaser.length}`);
  if (games.length === 0) problems.push(`no game pages under ${gamesDir}`);

  console.log('check-budgets: bytes after gzip -9');
  for (const [name, value, limit, note] of rows) {
    const status = value <= limit ? 'ok' : 'OVER';
    console.log(
      `  ${name.padEnd(36)} ${String(value).padStart(8)} / ${String(limit).padEnd(8)} ${status.padEnd(5)} ${note}`,
    );
    if (value > limit) problems.push(`${name} is over budget`);
  }
  for (const p of problems) console.error(`✗ ${p}`);
  if (problems.length > 0) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main(resolve(process.argv[2] ?? join(root, 'apps', 'web', 'out')));
}
