// Every game package is mounted and unmounted a few times in attract mode on the real host; the leak probe then
// reports anything left behind: listeners on window/document/body, timers, animation frames, WebGL contexts,
// playing audio sources or DOM containers.
import { expect, test, type Page } from '@playwright/test';

const CYCLES = 3;
const RUN_MS = 1000;

async function open(page: Page, query: string): Promise<void> {
  await page.goto(`/?probe=1&storage=memory&muted=1&${query}`);
  await page.waitForFunction(() => !!window.__playground);
  await page.evaluate(() => window.__playground.probe!.baseline());
}

const report = (page: Page) => page.evaluate(() => window.__playground.probe!.report().failures);

test('every game mounts and unmounts without leaving anything behind', async ({ page }) => {
  await open(page, '');
  const games = (await page.evaluate(() => window.__playground.games())).filter(
    (id) => !id.startsWith('fixture-'),
  );
  expect(games.length).toBeGreaterThan(0);
  test.setTimeout(games.length * 30_000);

  for (const game of games) {
    await test.step(game, async () => {
      await open(page, `game=${game}`); // a fresh document per game, so a leak names its game
      for (let i = 0; i < CYCLES; i++) {
        await page.evaluate((g) => window.__playground.mount({ game: g, launch: 'attract' }), game);
        expect
          .soft(await page.evaluate(() => window.__playground.state()), `${game} mounts`)
          .toBe('running');
        await page.waitForTimeout(RUN_MS);
        await page.evaluate(() => window.__playground.unmount());
      }
      await page.waitForTimeout(500); // lets one-shot timers and frames already queued run out
      expect.soft(await report(page), `${game} leaks`).toEqual([]);
    });
  }
});

test('the probe catches a fixture that leaks one window listener per mount', async ({ page }) => {
  await open(page, 'game=fixture-leaky-game');
  await page.evaluate(() =>
    window.__playground.mount({ game: 'fixture-leaky-game', launch: 'attract' }),
  );
  await page.evaluate(() => window.__playground.unmount());
  expect(await report(page)).toContainEqual(expect.stringMatching(/^window listeners: /));
});
