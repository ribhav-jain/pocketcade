import { defineConfig } from 'vite';

export default defineConfig({
  // Phaser is one ~1.4 MB chunk by design (not tree-shakeable).
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 2000 },
  server: { port: 5173 },
});
