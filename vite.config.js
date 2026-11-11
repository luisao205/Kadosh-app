import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'

const excludeE2eFixturesFromBuild = () => {
  let outDir = 'dist'

  return {
    name: 'exclude-e2e-fixtures-from-build',
    apply: 'build',
    configResolved: (config) => {
      outDir = config.build.outDir
    },
    closeBundle: async () => {
      await rm(resolve(outDir, 'e2e-projection-style-video.webm'), { force: true })
    }
  }
}

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
  server: {
    forwardConsole: false,
    ...(mode === 'local.emulator'
      ? {
          hmr: {
            host: '127.0.0.1',
          },
        }
      : {}),
  },
  plugins: [
    react(),
    ...(mode === 'android' ? [] : [createPwaPlugin()]),
    excludeE2eFixturesFromBuild()
  ]
}))
