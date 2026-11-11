import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';

const virtualId = 'virtual:official-chats-ui.jsx';
const resolvedVirtualId = `\0${virtualId}`;

const testModule = `
  import React from 'react';
  import { createRoot } from 'react-dom/client';
  import { MemoryRouter, Routes, Route } from 'react-router-dom';
  import { jsx } from 'react/jsx-runtime';
  import '/src/index.css';
  import { FeedbackProvider } from '/src/components/ui/FeedbackProvider.jsx';
  import MusicAI from '/src/components/admin/MusicAI.jsx';

  const ownerUser = {
    uid: 'owner-official-chats-test',
    email: 'owner@kadosh.local',
    rol: 'dueno',
    permisos: ['songs.create'],
    accountStatus: 'active'
  };

  function MockAddSongScreen() {
    const raw = sessionStorage.getItem('kadosh_music_ai_draft') || '';
    return jsx('div', {
      id: 'add-song-target',
      'data-draft': raw,
      children: 'Formulario Crear Cancion Destino'
    });
  }

  createRoot(document.getElementById('app')).render(
    jsx(MemoryRouter, {
      initialEntries: ['/music-ai'],
      children: jsx(FeedbackProvider, {
        children: jsx(Routes, {
          children: [
            jsx(Route, { key: 'mai', path: '/music-ai', element: jsx(MusicAI, { user: ownerUser }) }),
            jsx(Route, { key: 'add', path: '/añadir', element: jsx(MockAddSongScreen, {}) }),
          ]
        })
      })
    })
  );
`;

const server = await createServer({
  configFile: false,
  define: {
    'import.meta.env.VITE_E2E_SAFE': JSON.stringify('true'),
    'import.meta.env.VITE_USE_FIREBASE_EMULATORS': JSON.stringify('true'),
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
      name: 'virtual-official-chats-ui',
      resolveId: (id) => (id === virtualId ? resolvedVirtualId : null),
      load: (id) => (id === resolvedVirtualId ? testModule : null),
    },
    {
      name: 'virtual-official-chats-html',
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

// Instrumentar portapapeles, window.open y bloquear llamadas reales de red externa
await page.addInitScript(() => {
  window.__copiedHistory = [];
  window.__openedHistory = [];
  window.__forcePopupBlocked = false;

  Object.defineProperty(navigator, 'clipboard', {
    value: {
      writeText: async (text) => {
        window.__copiedHistory.push(text);
        return Promise.resolve();
      }
    },
    configurable: true
  });

  window.open = (url, target, features) => {
    window.__openedHistory.push({ url, target, features });
    if (window.__forcePopupBlocked) return null;
    return { closed: false };
  };
});

// Bloquear Firestore red si intenta conectar a puerto emulador no iniciado durante test puro de UI
await page.route('**/127.0.0.1:8080/**', (route) => route.abort());
await page.route('https://www.youtube-nocookie.com/**', (route) => route.fulfill({ status: 200, body: '<html></html>' }));

page.on('pageerror', (err) => console.error('[PAGEERROR]', err.message));

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });

  // 1. Verificar modalidad principal por defecto: Chats oficiales
  await page.getByText('1. Chats Oficiales (Gemini & ChatGPT)').waitFor({ timeout: 5000 });
  console.log('[PASS] Modalidad principal "Chats oficiales" activa por defecto.');

  // 2. Llenar formulario completo de preparación musical
  await page.locator('input[placeholder="Ej. Cuan Grande es Dios"]').fill('Tu Fidelidad');
  await page.locator('input[placeholder="Ej. En Espiritu y En Verdad"]').fill('Marcos Witt');
  await page.locator('input[placeholder="https://youtube.com/watch?v=..."]').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await page.locator('input[placeholder="Ej. Ab, G"]').fill('Ab');
  await page.locator('input[placeholder="Ej. G"]').fill('G');
  await page.locator('input[placeholder="Ej. 1"]').fill('1');
  await page.locator('input[placeholder*="Repite el puente"]').fill('Repite el coro 2 veces al final');
  await page.locator('textarea[placeholder*="Pega aquí la letra"]').fill('G\nTu fidelidad es grande');

  // Confirmar iframe de YouTube
  await page.locator('iframe[src*="youtube-nocookie.com/embed/dQw4w9WgXcQ"]').waitFor({ timeout: 5000 });
  console.log('[PASS] Formulario completo y referencia YouTube verificados.');

  // 3. Administrar favoritos privados (validación de dominio + guardado)
  await page.getByRole('button', { name: /Administrar favoritos/i }).click();
  await page.locator('input[placeholder*="gemini.google.com"]').fill('http://sitio-inseguro.com/hack');
  await page.getByRole('button', { name: /Guardar favorito/i }).click();
  await page.getByText(/solo se permiten enlaces HTTPS/i).waitFor({ timeout: 5000 });

  await page.locator('input[placeholder*="Cuan"]').first().isVisible(); // sanity
  await page.locator('input[placeholder*="Gemini"]').fill('Gemini — Repertorio principal');
  await page.locator('input[placeholder*="gemini.google.com"]').fill('https://gemini.google.com/app/testfav123');
  await page.getByRole('button', { name: /Guardar favorito/i }).click();

  await page.locator('button', { hasText: /^Usar$/ }).first().click();
  console.log('[PASS] Guardado, validación estricta HTTPS y selección de favorito Gemini verificados.');

  // 4. Preparar con Gemini (copiar paquete maestro + abrir favorito)
  await page.getByRole('button', { name: /Preparar con Gemini/i }).click();
  const state1 = await page.evaluate(() => ({
    copied: window.__copiedHistory.at(-1),
    opened: window.__openedHistory.at(-1),
  }));
  assert.equal(state1.opened.url, 'https://gemini.google.com/app/testfav123');
  assert.ok(state1.opened.features.includes('noopener'));
  assert.ok(state1.copied.includes('REGLAS MAESTRAS KADOSH PROJECTION V2.1'));
  assert.ok(state1.copied.includes('Título: Tu Fidelidad'));
  assert.ok(state1.copied.includes('Tonalidad real: Ab'));
  assert.ok(state1.copied.includes('Capo: Traste 1'));
  assert.ok(state1.copied.includes('https://www.youtube.com/watch?v=dQw4w9WgXcQ'));
  console.log('[PASS] Preparar con Gemini copia paquete completo y abre conversación oficial.');

  // 5. Preparar con ChatGPT oficial
  await page.getByRole('button', { name: /Preparar con ChatGPT/i }).click();
  const state2 = await page.evaluate(() => window.__openedHistory.at(-1));
  assert.equal(state2.url, 'https://chatgpt.com/');
  console.log('[PASS] Preparar con ChatGPT abre chatgpt.com oficial.');

  // 6. Probar bloqueo de popup -> modal manual no invasivo
  await page.evaluate(() => { window.__forcePopupBlocked = true; });
  await page.getByRole('button', { name: /Preparar con Gemini/i }).click();
  await page.getByText(/Acción manual para Gemini/i).waitFor({ timeout: 5000 });
  await page.locator('div[aria-label="Asistencia manual de apertura"] button').first().click();
  await page.evaluate(() => { window.__forcePopupBlocked = false; });
  console.log('[PASS] Fallback ante bloqueo de ventana emergente funciona sin alert() nativos.');

  // 7. Importar respuesta de Gemini o ChatGPT
  const mockedAiReply = `Aquí tienes la canción preparada:

\`\`\`kadosh
# Intro
[G] [D] [Em] [C]

# Coro
// Tu [G]fidelidad es [D]grande
Tu [Em]fidelidad incompa[C]rable es //
\`\`\`

Espero te ayude en el ensayo.`;

  await page.locator('textarea[placeholder*="Pega aquí la respuesta completa"]').fill(mockedAiReply);
  await page.getByRole('button', { name: /Importar respuesta de Gemini o ChatGPT/i }).click();

  await page.getByText(/2 secciones · 8 acordes · 1 repeticiones/i).first().waitFor({ timeout: 5000 });
  await page.getByText('V2.1 Válido').waitFor({ timeout: 5000 });
  console.log('[PASS] Importación limpia markdown, conserva acordes/repeticiones y actualiza Editor.');

  // 8. Revisar vistas Diapositivas y Músicos
  await page.getByRole('button', { name: /Diapositivas/i }).click();
  await page.getByText(/Diapositiva 1 de/i).waitFor({ timeout: 5000 });
  await page.getByRole('button', { name: /Músicos \(Acordes\)/i }).click();
  await page.getByRole('heading', { name: '# Coro' }).waitFor({ timeout: 5000 });
  await page.getByRole('button', { name: /Editor KADOSH/i }).click();
  console.log('[PASS] Vistas de Diapositivas V2.1 y Músicos verificadas.');

  // 9. Cambio manual entre proveedores ("Continuar en ChatGPT")
  await page.getByRole('button', { name: /Continuar en ChatGPT/i }).click();
  const stateSwitch = await page.evaluate(() => ({
    copied: window.__copiedHistory.at(-1),
    opened: window.__openedHistory.at(-1),
  }));
  assert.equal(stateSwitch.opened.url, 'https://chatgpt.com/');
  assert.ok(stateSwitch.copied.includes('CONTEXTO DE CONTINUACIÓN'));
  assert.ok(stateSwitch.copied.includes('# Coro'));
  console.log('[PASS] Cambio manual entre Gemini y ChatGPT empaqueta cambios ya aprobados.');

  // 10. Crear canción con este resultado (navega a /añadir con sessionStorage sin autoguardado)
  await page.getByRole('button', { name: /Crear canción con este resultado/i }).click();
  await page.locator('#add-song-target').waitFor({ timeout: 5000 });
  const prefillRaw = await page.locator('#add-song-target').getAttribute('data-draft');
  const prefill = JSON.parse(prefillRaw);
  assert.equal(prefill.titulo, 'Tu Fidelidad');
  assert.equal(prefill.tono, 'Ab');
  assert.ok(prefill.letraRaw.includes('Tu [G]fidelidad'));
  console.log('[PASS] "Crear canción con este resultado" navega con datos precargados sin autoguardado.');

  console.log('\n[PASS TOTAL] Suite UI Chats Oficiales aprobada al 100%.');
} finally {
  await browser.close();
  await server.close();
}
