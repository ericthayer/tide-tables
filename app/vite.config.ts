import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/app/',
  build: {
    outDir: '../dist/app',
    emptyOutDir: true,
    target: 'es2022',
    cssMinify: true,
    modulePreload: { polyfill: false },
    assetsInlineLimit: 0,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
