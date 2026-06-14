import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  define: {
    global: 'globalThis',
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
        description: "Suivi patient APA — Pierre Clavier",
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
