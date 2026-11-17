// Screenshot a game running in the playground dev server (pnpm --filter @pocketcade/playground dev).
//
//   node apps/playground/scripts/shot.ts <game> [--size desktop|phone-portrait|WxH] [--launch attract|play]
//        [--at 1500,4000,8000] [--out <dir>] [--keys "ArrowLeft,Space"] [--click "x,y;x,y"] [--wait 1500] [--dpr 1] [--play]
//
// --play  with --launch play: press the how-to card's Play button before anything else
// --at    milliseconds after the game is running (and --wait has passed) at which to capture frames
// --wait  milliseconds to wait after mount before sending clicks and keys (default 1500)
// --keys  key presses sent (150 ms apart) before the first capture; only useful with --launch play
// --click frame-relative CSS px clicks sent before the keys (e.g. to dismiss the how-to card)
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const game = args[0];
if (!game || game.startsWith('--')) throw new Error('usage: shot.ts <game> [options]');
const opt = (name: string, fallback: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1]! : fallback;
};
const size = opt('size', 'desktop');
const launch = opt('launch', 'attract');
const at = opt('at', '1500,5000')
  .split(',')
  .map(Number)
  .sort((a, b) => a - b);
const out = resolve(opt('out', 'reports/shots'));
const keys = opt('keys', '').split(',').filter(Boolean);
const clicks = opt('click', '')
  .split(';')
  .filter(Boolean)
  .map((p) => p.split(',').map(Number) as [number, number]);
const port = opt('port', '5173');

mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1700, height: 1100 },
  deviceScaleFactor: Number(opt('dpr', '1')),
});
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
await page.goto(
  `http://localhost:${port}/?game=${game}&launch=${launch}&size=${size}&storage=memory&muted=1`,
);
const frame = page.locator('#frame');
await frame.locator('canvas, [data-tk-root]').first().waitFor({ timeout: 30_000 });
// Let the how-to card (or the first frame) settle before any input is sent.
await page.waitForTimeout(Number(opt('wait', '1500')));
if (args.includes('--play')) {
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForTimeout(500);
}
const start = Date.now();
const box = (await frame.boundingBox())!;
for (const [x, y] of clicks) {
  await page.mouse.click(box.x + x, box.y + y);
  await page.waitForTimeout(250);
}
for (const k of keys) {
  await page.keyboard.press(k);
  await page.waitForTimeout(150);
}
for (const t of at) {
  await page.waitForTimeout(Math.max(0, t - (Date.now() - start)));
  const file = resolve(out, `${game}-${launch}-${size}-${t}.png`);
  await frame.screenshot({ path: file });
  console.log(file);
}
if (errors.length) console.log(`page errors:\n${errors.join('\n')}`);
await browser.close();
