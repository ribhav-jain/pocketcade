// The player around a game, on desktop Chromium: play, pause and resume, leaving the page, fullscreen, mute,
// the leaderboard sheet and the crash card.
import { expect, test, type Page } from '@playwright/test';
import { GAME_PATH, containers, play, player, setVisibility, waitForState } from './helpers';

const resumeOverlay = (page: Page) =>
  page.getByRole('button', { name: 'Paused — tap or press any key to resume' });

test('poster first; Play mounts the game; a hidden tab pauses it and any key resumes', async ({
  page,
}) => {
  await page.goto(GAME_PATH);
  await expect(page.locator('.play-button')).toBeVisible();
  await expect(containers(page)).toHaveCount(0);

  await play(page);
  await expect(containers(page)).toHaveCount(1);

  await setVisibility(page, 'hidden');
  await waitForState(page, 'paused');
  await expect(player(page)).toHaveAttribute('data-pause-reasons', 'visibility');
  await setVisibility(page, 'visible');
  await expect(resumeOverlay(page)).toBeFocused();
  await page.keyboard.press('KeyK');
  await waitForState(page, 'running');
  await expect(resumeOverlay(page)).toHaveCount(0);
});

test('leaving the page unmounts the game', async ({ page }) => {
  await page.goto(GAME_PATH);
  await play(page);
  await page
    .getByRole('navigation', { name: 'Breadcrumb' })
    .getByRole('link', { name: 'Home' })
    .click();
  await expect(page).toHaveURL('/');
  await expect(containers(page)).toHaveCount(0);
});

test('fullscreen puts the player on screen; leaving it pauses behind the resume overlay', async ({
  page,
}) => {
  await page.goto(GAME_PATH);
  await play(page);
  await page.getByRole('toolbar').getByRole('button', { name: 'Full screen' }).click();
  await expect(player(page)).toHaveAttribute('data-fullscreen', 'native');
  expect(await page.evaluate(() => document.fullscreenElement?.classList.contains('player'))).toBe(
    true,
  );
  await expect(player(page).getByRole('button', { name: 'Exit full screen' })).toBeVisible();

  // The browser handles Esc in native fullscreen and a headless browser cannot press it; this is the same exit.
  await page.evaluate(() => document.exitFullscreen());
  await expect(player(page)).toHaveAttribute('data-fullscreen', 'none');
  await waitForState(page, 'paused');
  await expect(resumeOverlay(page)).toBeVisible();
});

test('mute silences the one shared AudioContext and survives a reload', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __audio: AudioContext[] };
    w.__audio = [];
    const Original = window.AudioContext;
    window.AudioContext = class extends Original {
      constructor(options?: AudioContextOptions) {
        super(options);
        w.__audio.push(this);
      }
    };
  });
  const audio = () =>
    page.evaluate(() => {
      const list = (window as unknown as { __audio: AudioContext[] }).__audio;
      return { count: list.length, state: list[0]?.state ?? null };
    });

  await page.goto(GAME_PATH);
  await play(page);
  await expect.poll(audio).toEqual({ count: 1, state: 'running' });

  const headerMute = page.locator('.site-header').getByRole('button', { name: 'Mute sound' });
  const barMute = page.getByRole('toolbar').getByRole('button', { name: 'Mute sound' });
  await headerMute.click();
  await expect(headerMute).toHaveAttribute('aria-pressed', 'true');
  await expect(barMute).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(audio).toEqual({ count: 1, state: 'suspended' });

  await page.reload();
  await expect(headerMute).toHaveAttribute('aria-pressed', 'true');
  await play(page);
  await expect.poll(audio).toEqual({ count: 1, state: 'suspended' });
  await barMute.click();
  await expect(headerMute).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(audio).toEqual({ count: 1, state: 'running' });
});

test('the leaderboard sheet pauses the game while open and returns focus when closed', async ({
  page,
}) => {
  await page.goto(GAME_PATH);
  await play(page);
  const open = page.getByRole('toolbar').getByRole('button', { name: 'Leaderboard' });
  await open.click();
  const sheet = page.getByRole('dialog', { name: 'Leaderboard' });
  await expect(sheet).toBeVisible();
  await waitForState(page, 'paused');
  await expect(player(page)).toHaveAttribute('data-pause-reasons', 'overlay');

  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await waitForState(page, 'running');
  await expect(open).toBeFocused();
});

test('a game chunk that fails to load shows the crash card; Retry mounts the game', async ({
  page,
}) => {
  // Lazy chunks (the game and what it imports) are the chunk files the page HTML does not reference.
  const html = await (await page.request.get(GAME_PATH)).text();
  const initial = new Set(html.match(/\/_next\/static\/chunks\/[\w.~-]+\.js/g) ?? []);
  const lazyChunks = '**/_next/static/chunks/**';
  await page.route(lazyChunks, (route) => {
    const path = new URL(route.request().url()).pathname;
    return path.endsWith('.js') && !initial.has(path) ? route.abort('failed') : route.continue();
  });

  await page.goto(GAME_PATH);
  await page.locator('.play-button').click();
  const card = player(page).locator('.crash[data-error="ChunkLoadError"]');
  await expect(card).toContainText("Couldn't load the game. Check your connection.");
  await expect(containers(page)).toHaveCount(0);

  await page.unroute(lazyChunks);
  await card.getByRole('button', { name: 'Retry' }).click();
  await waitForState(page, 'running');
  await expect(containers(page)).toHaveCount(1);
});
