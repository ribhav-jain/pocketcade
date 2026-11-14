// Unit tests run in Node; the contract suite runs in Vitest browser mode on Playwright Chromium so Phaser gets
// a real canvas and WebGL.
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
