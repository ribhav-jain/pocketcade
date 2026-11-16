// Unit tests run in Node. The contract suite runs in Vitest browser mode on Playwright Chromium, so the game gets
// a real canvas, WebGL and audio.
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: { name: 'unit', include: ['test/**/*.test.ts'], exclude: ['test/contract.test.ts'] },
      },
      {
        test: {
          name: 'contract',
          include: ['test/contract.test.ts'],
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
