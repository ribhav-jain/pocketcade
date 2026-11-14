import { defineConfig } from 'vitest/config';

// Unit tests only; Playwright specs in e2e/ run with `playwright test`.
export default defineConfig({ test: { include: ['test/**/*.test.ts'] } });
