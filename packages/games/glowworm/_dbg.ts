import { chromium } from 'playwright';
const browser = await chromium.launch();
for (const spec of process.argv.slice(2)) {
  const [game, size] = spec.split('@');
  const page = await browser.newPage({ viewport: { width: 1700, height: 1100 } });
  page.on('pageerror', (e) => console.log('pageerror', String(e).slice(0, 300)));
  await page.goto(`http://localhost:5173/?game=${game}&launch=attract&size=${size}&storage=memory&muted=1`);
  await page.locator('#frame canvas').first().waitFor({ timeout: 30000 });
  const t0 = Date.now();
  let phase: string | null | undefined = '';
  while (Date.now() - t0 < 25000) {
    phase = await page.evaluate(() => document.querySelector('[data-tk-attract]')?.getAttribute('data-tk-attract'));
    if (phase && phase !== 'warmup') break;
    await page.waitForTimeout(100);
  }
  console.log(spec, 'left warmup after', Date.now() - t0, 'ms', phase);
  await page.close();
}
await browser.close();
