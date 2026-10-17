import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Renderer root is ./renderer (outDir ../dist for electron/main.cjs).
// Dev: run `vite` here, then `electron .` with VITE_DEV_SERVER_URL set.
export default defineConfig({
  root: 'renderer',
  base: './',
  plugins: [react()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    strictPort: true,
  },
});
