import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';

const virtualId = 'virtual:music-ai-ui-modes.jsx';
const resolvedVirtualId = `\0${virtualId}`;

const testModule = `
  import React from 'react';
  import { createRoot } from 'react-dom/client';
  import { MemoryRouter } from 'react-router-dom';
  import { jsx } from 'react/jsx-runtime';
  import '/src/index.css';
  import { FeedbackProvider } from '/src/components/ui/FeedbackProvider.jsx';
  import MusicAI from '/src/components/admin/MusicAI.jsx';

  const ownerUser = {
    uid: 'owner-ui-test',
    email: 'owner@kadosh.local',
    rol: 'dueno',
    accountStatus: 'active'
  };

  createRoot(document.getElementById('app')).render(
    jsx(MemoryRouter, {
      children: jsx(FeedbackProvider, {
        children: jsx(MusicAI, { user: ownerUser })
      })
    })
  );
`;

const server = await createServer({
  configFile: false,
  define: {
    'import.meta.env.VITE_E2E_SAFE': JSON.stringify('true'),
    'import.meta.env.VITE_USE_FIREBASE_EMULATORS': JSON.stringify('true'),
    'import.meta.env.VITE_MUSIC_AI_API_MODE_ENABLED': JSON.stringify('true'),
    'import.meta.env.VITE_PROJECT_ID': JSON.stringify('demo-kadosh-e2e'),
    'import.meta.env.VITE_API_KEY': JSON.stringify('demo-api-key'),
    'import.meta.env.VITE_AUTH_DOMAIN': JSON.stringify('demo-kadosh-e2e.localhost'),
    'import.meta.env.VITE_FIREBASE_EMULATOR_HOST': JSON.stringify('127.0.0.1'),
    'import.meta.env.VITE_AUTH_EMULATOR_PORT': JSON.stringify('9099'),
    'import.meta.env.VITE_FIRESTORE_EMULATOR_PORT': JSON.stringify('8080'),
    'import.meta.env.VITE_FUNCTIONS_EMULATOR_PORT': JSON.stringify('5001'),
  },
  plugins: [
    react(),
    {
      name: 'virtual-music-ai-ui',
      resolveId: (id) => (id === virtualId ? resolvedVirtualId : null),
      load: (id) => (id === resolvedVirtualId ? testModule : null),
    },
    {
      name: 'virtual-music-ai-html',
      configureServer: (viteServer) => {
        viteServer.middlewares.use('/', async (req, res, next) => {
          if (req.url !== '/' && req.url !== '/index.html') return next();
          res.setHeader('Content-Type', 'text/html');
          const html = await viteServer.transformIndexHtml(
            req.url,
            `<!doctype html><html><body class="bg-zinc-950 text-white"><div id="app"></div><script type="module" src="/@id/${virtualId}"></script></body></html>`
          );
          res.end(html);
        });
      },
    },
  ],
  server: { host: '127.0.0.1', port: 0, strictPort: false },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react-router-dom',
      'lucide-react',
      'firebase/app',
      'firebase/auth',
      'firebase/firestore',
      'firebase/functions',
      'firebase/messaging',
    ],
  },
  logLevel: 'silent',
});

await server.listen();
const address = server.httpServer.address();
const baseUrl = `http://127.0.0.1:${address.port}/`;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

page.on('pageerror', (err) => console.error('[PAGEERROR]', err.message));

let mockScenario = 'gemini_error';

// Interceptar exclusivamente llamadas al endpoint local del Functions Emulator (cero llamadas externas)
await page.route('**/processMusicAI', async (route) => {
  if (mockScenario === 'gemini_error') {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        result: {
          ok: false,
          source: 'gemini_error',
          model: 'gemini-3.8-flash',
          status: 503,
          errorCode: 'UNAVAILABLE',
          error: 'This model is currently experiencing high demand.',
          fallbackAvailable: true
        }
      })
    });
    return;
  }

  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      result: {
        ok: true,
        source: 'gemini',
        model: 'gemini-3.8-flash',
        message: 'Estructura verificada.',
        kadoshContent: '# Verso 1\nCamino en tu [G]luz',
        youtubeAnalysis: { verified: false, mode: 'none' }
      }
    })
  });
});

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });

  // Cambiar al modo Asistente integrado (API) para verificar sus estados visuales
  await page.getByRole('button', { name: /Asistente integrado \(API\)/i }).click();

  // 1. Verificar estado 1: Conversor Local
  await page.locator('textarea[placeholder*="Pega aquí la letra"]').fill('Verso 1\nCamino en tu luz');
  await page.getByRole('button', { name: /Convertir directamente/i }).click();
  await page.getByText('Modo Conversor Local (Determinista)').waitFor({ timeout: 5000 });
  await page.getByText('Motor Determinista Local').first().waitFor({ timeout: 5000 });
  console.log('[PASS] UI distingue claramente: Modo Conversor Local.');

  // 2. Verificar estado 2: Error / Cuota de API (503)
  mockScenario = 'gemini_error';
  await page.locator('input[placeholder*="Escribe una instrucci"]').fill('Prueba error API');
  await page.locator('form button[type="submit"]').click();
  await page.getByText('Error de API / Cuota Agotada').waitFor({ timeout: 5000 });
  await page.getByText('Error de Gemini API').first().waitFor({ timeout: 5000 });
  console.log('[PASS] UI distingue claramente: Error de API / Cuota sin disfrazarlo de Gemini.');

  // 3. Verificar estado 3: Modo Gemini Conectado
  mockScenario = 'gemini_connected';
  await page.locator('input[placeholder*="Escribe una instrucci"]').fill('Prueba exito Gemini');
  await page.locator('form button[type="submit"]').click();
  await page.getByText('Modo Gemini Conectado (gemini-3.8-flash)').waitFor({ timeout: 5000 });
  await page.getByText('gemini-3.8-flash').first().waitFor({ timeout: 5000 });
  console.log('[PASS] UI distingue claramente: Modo Gemini Conectado (gemini-3.8-flash).');
} finally {
  await browser.close();
  await server.close();
}
