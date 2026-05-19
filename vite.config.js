import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg}'], // Permite trabajar offline
        navigateFallback: '/index.html',
      },
      manifest: {
        name: 'Kadosh App',
        short_name: 'Kadosh',
        description: 'Gestión Musical para Iglesias',
        theme_color: '#09090b', 
        background_color: '#09090b',
        display: 'standalone', // Esto esconde el navegador y la hace ver nativa
        orientation: 'portrait',
        icons: [
          {
            src: '/KADOSH_APP.jpg', // Asegúrate de tener este logo en public/
            sizes: '192x192',
            type: 'image/jpeg',
            purpose: 'any maskable'
          },
          {
            src: '/KADOSH_APP.jpg',
            sizes: '512x512',
            type: 'image/jpeg',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ]
})
