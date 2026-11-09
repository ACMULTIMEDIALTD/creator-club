import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `vite build --mode demo` → a self-contained demo (mock API in the browser, one JS + one CSS
// file, logo inlined) that any static host can serve: GitHub Pages or a claude.ai artifact.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'demo' ? './' : '/',
  build: mode === 'demo'
    ? {
      outDir: 'dist-demo',
      assetsInlineLimit: 100_000_000,
      cssCodeSplit: false,
      rollupOptions: { output: { inlineDynamicImports: true } },
    }
    : {},
  server: {
    port: 5173,
    // Same-origin /api in dev, like the Vercel rewrite in production
    proxy: { '/api': process.env.API_PROXY_TARGET || 'http://localhost:4000' },
  },
}));
