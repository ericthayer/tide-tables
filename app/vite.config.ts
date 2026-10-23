import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/app/',
  // The design system lives at the repo root (design/); the app imports it directly.
  server: { fs: { allow: ['..'] } },
  build: {
    outDir: '../dist/app',
    emptyOutDir: true,
    target: 'es2022',
    cssMinify: true,
    // No preload helper: the one lazy chunk (currents) has no CSS and its deps are all in the entry.
    modulePreload: false,
    assetsInlineLimit: 0,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
