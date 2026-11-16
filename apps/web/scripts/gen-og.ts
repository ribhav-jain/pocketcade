// scripts/gen-og: renders the share images (Open Graph, 1200 × 630) into public/og/: one per game from its cover
// art and title, plus _site.jpg for every other page. JPEG because lossless PNGs of these gradients are
// 360–540 KB, over the 300 KB limit for a share image. It drives Playwright's Chromium, so it runs on a dev
// machine rather than in the Vercel build, and the images are committed. Re-run after a cover or title changes:
//   pnpm og
// (`gen-registry --check` fails while a game has no image.)
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { parse } from 'yaml';

const web = fileURLToPath(new URL('..', import.meta.url));
const gamesDir = join(web, '..', '..', 'packages', 'games');
const outDir = join(web, 'public', 'og');
const MAX_BYTES = 300 * 1024;
/** The covers on the site-wide image (Pentafall is left out until its name and look have had a legal review). */
const SITE_COVERS = ['bao-bolt', 'pop-reef', 'sunset-sprint', 'sumslide', 'pebble-post', 'rowbot'];

const dataUrl = (file: string, type: string) =>
  `data:${type};base64,${readFileSync(file).toString('base64')}`;
const font = (pkg: string) =>
  dataUrl(
    join(
      web,
      'node_modules',
      '@fontsource-variable',
      pkg,
      'files',
      `${pkg}-latin-wght-normal.woff2`,
    ),
    'font/woff2',
  );
const cover = (id: string) => dataUrl(join(gamesDir, id, 'media', 'cover.svg'), 'image/svg+xml');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

const logo = dataUrl(join(web, 'src', 'app', 'icon.svg'), 'image/svg+xml');
const wordmark = (px: number) =>
  `<div class="brand"><img src="${logo}" width="${px * 1.3}" height="${px * 1.3}" alt="">` +
  `<span class="word" style="font-size:${px}px">Pocket<span>cade</span></span></div>`;

const CSS = `
@font-face { font-family: Fredoka; src: url(${font('fredoka')}); font-weight: 300 700; }
@font-face { font-family: Nunito; src: url(${font('nunito')}); font-weight: 200 1000; }
* { margin: 0; box-sizing: border-box; }
body { width: 1200px; height: 630px; overflow: hidden; position: relative; background: #120c2c; color: #fff9f2;
  font-family: Nunito, sans-serif; }
.word { font-family: Fredoka, sans-serif; font-weight: 700; line-height: 1; }
.word span { background: linear-gradient(90deg, #ff4fa3, #ff9f1c); -webkit-background-clip: text; color: transparent; }
.brand { display: flex; align-items: center; gap: 16px; }
.pill { align-self: flex-start; padding: 14px 30px; border-radius: 999px; font-size: 30px; font-weight: 800;
  background: linear-gradient(90deg, #ff4fa3, #ff9f1c); color: #120c2c; }
`;

function gameCard(title: string, art: string): string {
  return `<style>${CSS}
.bg { position: absolute; inset: -120px; width: 1440px; height: 870px; object-fit: cover; filter: blur(70px) saturate(1.4);
  opacity: .6; }
.shade { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(18,12,44,.2), rgba(18,12,44,.88) 55%); }
.cover { position: absolute; left: 60px; top: 60px; width: 510px; height: 510px; border-radius: 48px;
  box-shadow: 0 0 0 6px rgba(255,255,255,.14), 0 34px 60px -18px rgba(4,2,16,.85); }
.text { position: absolute; left: 630px; right: 56px; top: 0; bottom: 0; display: flex; flex-direction: column;
  justify-content: center; gap: 34px; }
h1 { font-size: 86px; line-height: 1.02; }
</style>
<img class="bg" src="${art}" alt=""><div class="shade"></div><img class="cover" src="${art}" alt="">
<div class="text">${wordmark(40)}<h1 class="word">${esc(title)}</h1><p class="pill">Play free in your browser</p></div>`;
}

function siteCard(): string {
  const covers = SITE_COVERS.map(
    (id, i) =>
      `<img src="${cover(id)}" alt="" style="transform: rotate(${i % 2 ? 4 : -4}deg) translateY(${i % 2 ? 10 : -6}px)">`,
  ).join('');
  return `<style>${CSS}
body { display: flex; flex-direction: column; align-items: center; padding-top: 62px; gap: 22px;
  background: radial-gradient(circle at 18% 10%, rgba(255,79,163,.35), transparent 45%),
    radial-gradient(circle at 85% 20%, rgba(123,92,255,.4), transparent 45%), #120c2c; }
.tag { font-size: 40px; font-weight: 800; color: #c2b9ea; }
.row { display: flex; gap: 22px; margin-top: 34px; }
.row img { width: 168px; height: 168px; border-radius: 30px; box-shadow: 0 0 0 4px rgba(255,255,255,.14),
  0 22px 40px -14px rgba(4,2,16,.9); }
</style>
${wordmark(104)}<p class="tag">A whole arcade in your pocket · free, no downloads</p><div class="row">${covers}</div>`;
}

function titleOf(id: string): string {
  const md = readFileSync(join(gamesDir, id, 'game.md'), 'utf8');
  const front = parse(md.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '') as { title?: unknown };
  if (typeof front.title !== 'string') throw new Error(`${id}: game.md has no title`);
  return front.title;
}

const ids = readdirSync(gamesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();
const cards: Array<[file: string, html: string]> = [
  ['_site.jpg', siteCard()],
  ...ids.map((id): [string, string] => [`${id}.jpg`, gameCard(titleOf(id), cover(id))]),
];

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  const tooBig: string[] = [];
  for (const [file, html] of cards) {
    await page.setContent(`<!doctype html><html><body>${html}</body></html>`);
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((i) => i.decode()));
    });
    const out = join(outDir, file);
    writeFileSync(out, await page.screenshot({ type: 'jpeg', quality: 88 }));
    const bytes = statSync(out).size;
    console.log(`${file.padEnd(20)} ${Math.round(bytes / 1024)} KB`);
    if (bytes > MAX_BYTES) tooBig.push(file);
  }
  if (tooBig.length) throw new Error(`over ${MAX_BYTES / 1024} KB (CAT-706): ${tooBig.join(', ')}`);
} finally {
  await browser.close();
}
