import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const createPwaPlugin = () => VitePWA({
  registerType: 'autoUpdate',
  injectRegister: 'auto',
  workbox: {
    globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg}'],
    runtimeCaching: [
      {
        urlPattern: ({ url }) => url.pathname.startsWith('/bibles/') && url.pathname.endsWith('.json'),
        handler: 'CacheFirst',
        options: {
          cacheName: 'kadosh-bibles-v2',
          expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 365 }
        }
      }
    ],
    navigateFallback: '/index.html',
  },
  manifest: {
    name: 'Kadosh App',
    short_name: 'Kadosh',
    description: 'Gestión Musical para Iglesias',
    theme_color: '#09090b',
    background_color: '#09090b',
    display: 'standalone',
    orientation: 'portrait',
    icons: [
      {
        src: '/logo.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any maskable'
      },
      {
        src: '/logo.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable'
      }
    ]
  }
})

export default defineConfig(({ mode }) => ({
  base: '/',
  plugins: [
    react(),
    ...(mode === 'android' ? [] : [createPwaPlugin()])
  ]
}))
