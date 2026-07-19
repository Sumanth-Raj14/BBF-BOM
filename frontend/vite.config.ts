import { defineConfig } from 'vite'
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
  root: '.',
  server: {
    port: 3001,
    strictPort: false,
  },
  define: {
    __MOCK_MODE__: 'false',
    'import.meta.env.VITE_MOCK_MODE': JSON.stringify('false'),
    'window.__USE_MOCK_DATA': 'false',
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Only split out the stable React vendor code (safe: app imports
          // react, react never imports app -> no cycle). Do NOT manually chunk
          // the app's /root/*.jsx modules: they cross-import each other
          // (modals <-> parts <-> enterprise-utils <-> bom-editor, etc.), and
          // splitting a circular-dependency group across named chunks makes
          // Rollup emit chunks that access each other's exports before they are
          // initialized -> a runtime "Cannot access 'X' before initialization"
          // (temporal dead zone) crash the moment the app loads. Returning
          // undefined lets Rollup/Vite auto-chunk, which keeps cyclic modules
          // together and is cycle-safe. Dynamic imports (LazyScreens) still
          // code-split automatically.
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/scheduler/')
          ) {
            return 'vendor';
          }
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom'],
  },
})
