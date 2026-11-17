// Unit tests run in Node. The contract suite runs in Vitest browser mode on Playwright Chromium, so the game gets
// a real canvas, WebGL and audio.
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['test/**/*.test.ts'],
          exclude: ['test/contract.test.ts'],
          // Some rules tests play whole games with an autopilot. They take about a second on a laptop and several
          // times that on a small, busy CI runner, so the default 5 s limit is too tight.
          testTimeout: 30_000,
        },
      },
      {
        test: {
          name: 'contract',
          include: ['test/contract.test.ts'],
          // The suite enforces real-time limits (unmount within 2 s). A CI runner starved by parallel jobs can
          // miss one, so a failed test gets a second and third try there.
          retry: process.env.CI ? 2 : 0,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});
