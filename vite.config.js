import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves this as a project site under /accordeur/, so the base
// path must match there but stay '/' for local dev/preview.
const base = process.env.GITHUB_PAGES === 'true' ? '/accordeur/' : '/';

export default defineConfig({
  base,
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icons/favicon-16-v2.png', 'icons/favicon-32-v2.png', 'icons/apple-touch-icon-v3.png'],
      manifest: {
        name: 'Accordeur — Guitare & Ukulélé',
        short_name: 'Accordeur',
        description: "Accordeur chromatique pour guitare et ukulélé, fonctionne hors-ligne.",
        lang: 'fr',
        display: 'standalone',
        background_color: '#0a0a12',
        theme_color: '#0a66d9',
        icons: [
          { src: 'icons/icon-192-v2.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512-v2.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-192-v2.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/maskable-512-v2.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
        // Force any waiting service worker to activate and take control
        // immediately, and drop stale precaches from previous deploys,
        // instead of leaving an old version running until every tab closes.
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
