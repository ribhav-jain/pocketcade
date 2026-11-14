import { existsSync, readdirSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';

const gamesDir = new URL('../../../packages/games/', import.meta.url);

/** Every game package in the repo; each must have a page in the build. */
export const GAME_IDS = readdirSync(gamesDir)
  .filter((id) => existsSync(new URL(`${id}/package.json`, gamesDir)))
  .sort();

/** The game the player and smoke specs drive. They use nothing specific to it, so any game works. */
export const GAME = 'sumslide';
export const GAME_PATH = `/games/${GAME}/`;

export const player = (page: Page) => page.locator('.player');
export const containers = (page: Page) => page.locator('[data-pocketcade-game]');

export async function waitForState(page: Page, state: string | RegExp): Promise<void> {
  await expect(player(page)).toHaveAttribute('data-runner-state', state, { timeout: 20_000 });
}

/** Clicks Play on the poster and waits until the game runs. */
export async function play(page: Page): Promise<void> {
  await page.locator('.play-button').click();
  await waitForState(page, 'running');
}

/** Simulates the tab being hidden and shown again (headless browsers never hide a page). */
export async function setVisibility(page: Page, state: 'hidden' | 'visible'): Promise<void> {
  await page.evaluate((s) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => s === 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
}
