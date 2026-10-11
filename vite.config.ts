import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 3002, host: true },
  preview: { port: 3002, host: true },
  build: { target: 'es2020', outDir: 'dist' }
});
