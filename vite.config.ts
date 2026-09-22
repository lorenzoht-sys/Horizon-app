import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  define: {
    global: 'globalThis',
    // VERCEL_ENV est une variable système fournie par Vercel au build ('production' /
    // 'preview' / absente en dev local) — jamais préfixée VITE_, donc invisible au bundle
    // client par défaut. Réinjectée explicitement pour src/lib/config.ts (getAppHost/
    // getAppOrigin) : seule la PRODUCTION réelle doit ignorer window.location pour les
    // artefacts longue durée (QR code patient…) — Preview doit rester testable comme
    // n'importe quel autre déploiement. Voir src/lib/config.ts pour le détail.
    'import.meta.env.VITE_VERCEL_ENV': JSON.stringify(process.env.VERCEL_ENV ?? ''),
  },
  optimizeDeps: {
    include: ['buffer'],
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-horizon.png.png', 'favicon.ico'],

      manifest: {
        name: "Mouv'APA Suivis",
        short_name: 'MouvAPA',
        description: "Suivi patient en Activité Physique Adaptée",
        theme_color: '#032c28',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: '/icon-horizon.png.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-horizon.png.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-horizon.png.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },

      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Ajoute la gestion des notifications push (rappels-patients) au
        // service worker généré, sans toucher à la stratégie de cache
        // existante — voir public/push-sw.js.
        importScripts: ['push-sw.js'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
})
