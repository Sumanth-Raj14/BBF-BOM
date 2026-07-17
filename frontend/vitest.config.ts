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
