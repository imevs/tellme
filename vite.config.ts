import { defineConfig } from 'vite';

export default defineConfig({
  // Vitest configuration lives here — no separate vitest.config.ts needed
  test: {
    environment: 'jsdom',
    setupFiles:  ['./tests/setup.ts'],
    globals:     true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include:  ['src/**/*.ts'],
      exclude:  ['src/main.ts'],   // entry wiring is tested manually
    },
  },
  resolve: {
    alias: { '@': '/src' },
  },
});
