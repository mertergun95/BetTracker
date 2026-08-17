import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// GitHub Pages serves a project site from /<repo>/, but the Capacitor Android
// build loads files from the app bundle root. BUILD_TARGET=android (set by the
// android:sync script) switches the base path accordingly.
const isAndroid = process.env.BUILD_TARGET === 'android';
const base = isAndroid ? './' : (process.env.PAGES_BASE ?? '/BetTracker/');

export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        // Split the heavy, rarely-changing dependencies into their own chunks
        // so an app update does not invalidate them in the browser cache, and
        // so the charting library is not parsed before the first paint.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          db: ['dexie'],
        },
      },
    },
  },
});
