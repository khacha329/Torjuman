import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Builds the harness page for scripts/measure-offline.mjs. Kept apart from the
// app's own config so it has no service worker, which is the point: it measures
// the model, not the PWA.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  build: {
    outDir: fileURLToPath(new URL('../../.verify/offline-harness', import.meta.url)),
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
  },
  logLevel: 'warn',
});
