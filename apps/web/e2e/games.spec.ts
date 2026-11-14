// Every game in the repo has a page, starts from its poster and runs without a page error or console error.
import { expect, test } from '@playwright/test';
import { GAME_IDS, containers, waitForState } from './helpers';

for (const id of GAME_IDS) {
  test(`${id} starts from its page`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });

    const response = await page.goto(`/games/${id}/`);
    expect(response?.status()).toBe(200);
    await page.locator('.play-button').click();
    // A landscape game on a portrait phone mounts, then pauses behind the rotate notice.
    await waitForState(page, /^(running|paused)$/);
    await expect(containers(page)).toHaveCount(1);
    await expect(page.locator('.frame').locator('canvas, [data-tk-root]').first()).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(page.locator('.crash')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
