import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import inject from '@rollup/plugin-inject'

export default defineConfig({
  plugins: [
    react(),
    inject({
      React: 'react',
      ReactDOM: 'react-dom',
    }),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    // Vitest defaults to 5s. That is not enough here: a full run reported 57s
    // of jsdom `environment` time alone, and under that load individual tests
    // were timing out at 5s while passing in isolation — a DIFFERENT test each
    // run (ECRScreen one pass, dataService the next). Those were never product
    // bugs, but a suite that fails randomly trains everyone to ignore red,
    // which costs far more than the flake itself.
    //
    // Kept at 20s rather than something huge on purpose: a genuine hang should
    // still fail the run reasonably fast instead of stalling CI.
    testTimeout: 20000,
    hookTimeout: 20000,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx,js,jsx}', '**/*.test.{ts,tsx,js,jsx}'],
    exclude: ['node_modules', 'dist', 'tests'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['**/*.{js,jsx,ts,tsx}'],
      exclude: ['node_modules', 'dist', 'tests', '*.config.*'],
    },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
})
