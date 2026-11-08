import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*/vitest.config.ts', 'apps/*/vitest.config.ts'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**', 'apps/*/src/**'],
      // Platform wiring that only runs inside Cloudflare, covered by the deployed checks.
      exclude: [
        '**/*.test.ts',
        'apps/worker/src/index.ts',
        'apps/worker/src/store-object.ts',
        'apps/worker/src/runtime.ts',
        'apps/worker/src/env.ts',
      ],
      thresholds: {
        'packages/engine/src/**': {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        'apps/worker/src/**': { lines: 90, functions: 90, branches: 85, statements: 90 },
        'packages/shared/src/**': {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
      },
    },
  },
});
