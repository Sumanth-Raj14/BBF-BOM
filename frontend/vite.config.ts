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
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/') || id.includes('node_modules/scheduler/')) {
            return 'vendor';
          }
          if (id.includes('/api.js') || id.includes('/data.js') || id.includes('/projects.js') || id.includes('/root/icons.jsx')) {
            return 'core';
          }
          if (id.includes('/root/enterprise-utils.jsx')) return 'enterprise-utils';
          if (id.includes('/root/enterprise-screens.jsx')) return 'enterprise-screens';
          if (id.includes('/root/advanced-features.jsx')) return 'advanced-features';
          if (id.includes('/root/power-features.jsx')) return 'power-features';
          if (id.includes('/root/integration-screens.jsx')) return 'integration-screens';
          if (id.includes('/root/secondary-screens.jsx')) return 'secondary-screens';
          if (id.includes('/root/overlays.jsx') || id.includes('/root/modals-extra.jsx')) return 'modals';
          if (id.includes('/root/bom-editor.jsx') || id.includes('/root/detail-drawer.jsx')) return 'bom-editor';
          if (id.includes('/root/parts-screen.jsx') || id.includes('/root/pdm-cad.jsx')) return 'parts';
          if (id.includes('/root/app.jsx')) return 'app-shell';
          if (id.includes('/root/dashboard.jsx')) return 'dashboard';
          if (id.includes('/root/auth-onboarding.jsx')) return 'auth';
          if (id.includes('/root/mobile-scanner.jsx')) return 'mobile-scanner';
          if (id.includes('/root/enterprise-final.jsx')) return 'enterprise-final';
          if (id.includes('/root/final-polish.jsx')) return 'final-polish';
          if (id.includes('/root/prod-additions.jsx')) return 'prod-additions';
          if (id.includes('/root/tweaks-panel.jsx')) return 'tweaks-panel';
          if (id.includes('/cloud-sync.js')) return 'cloud-sync';
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
