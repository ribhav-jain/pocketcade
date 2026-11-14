// End-to-end tests run against the static export, served by tools/serve-static with the vercel.json headers.
import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `node ../../tools/serve-static.ts --dir out --config vercel.json --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/version.json`,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // The player spec covers desktop behaviour (native fullscreen, keyboard), so the phone profile skips it.
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] }, testIgnore: 'player.spec.ts' },
  ],
});
