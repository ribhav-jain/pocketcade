import { chromium } from 'playwright';
const browser = await chromium.launch();
for (const game of process.argv.slice(2)) {
  const page = await browser.newPage({ viewport: { width: 1700, height: 1100 } });
  page.on('pageerror', (e) => console.log('pageerror', String(e)));
  await page.goto(`http://localhost:5173/?game=${game}&launch=attract&size=1031x580&storage=memory&muted=1`);
  await page.locator('#frame canvas').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  const fps = await page.evaluate(() => new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else r(n / 3); }; requestAnimationFrame(f); }));
  const info = await page.evaluate(() => { const c = document.querySelector('#frame canvas') as HTMLCanvasElement; return [c.width, c.height]; });
  console.log(game, 'fps', fps, info);
  await page.close();
}
await browser.close();
