import { chromium } from 'playwright';
const out = process.argv[2]!;
const browser = await chromium.launch();
const shoot = async (size: string, dpr: number, name: string) => {
  const page = await browser.newPage({ viewport: { width: 1700, height: 1100 }, deviceScaleFactor: dpr });
  page.on('pageerror', (e) => console.log('pageerror', String(e)));
  page.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text()); });
  await page.goto(`http://localhost:5173/?game=glowworm&launch=play&size=${size}&storage=memory&muted=1`);
  const frame = page.locator('#frame');
  await frame.locator('canvas').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.locator('button:has-text("Play")').first().click();
  await page.waitForTimeout(1200);
  await frame.screenshot({ path: `${out}/${name}-ready.png` });
  for (const k of ['ArrowRight', 'ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowRight']) {
    await page.keyboard.press(k);
    await page.waitForTimeout(700);
  }
  await frame.screenshot({ path: `${out}/${name}-play.png` });
  await page.waitForTimeout(6000);
  await frame.screenshot({ path: `${out}/${name}-end.png` });
  await page.close();
};
await shoot('1031x580', 1, 'desktop');
await shoot('390x700', 2, 'phone');
await browser.close();
