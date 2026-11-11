import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const BASE_URL = 'http://127.0.0.1:5175';
const PASSWORD = 'LocalE2E-Canva-2026!';

const browser = await chromium.launch({ headless: true });

try {
  // ─────────────────────────────────────────────────────────────
  // 1. SESIÓN DUEÑO (owner@e2e.local)
  // ─────────────────────────────────────────────────────────────
  const ownerCtx = await browser.newContext();
  const page = await ownerCtx.newPage();
  page.on('pageerror', (err) => console.error('[PAGEERROR]', err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') console.error('[CONSOLE ERROR]', msg.text()); });

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').waitFor({ timeout: 15000 });
  const isE2EEmulators = await page.evaluate(() => window.__KADOSH_E2E_EMULATORS__);
  assert.equal(isE2EEmulators, true, 'El frontend debe confirmar aislamiento __KADOSH_E2E_EMULATORS__.');

  await page.locator('input[type="email"]').fill('owner@e2e.local');
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: /Entrar a Kadosh Pro/i }).click();

  // Esperar navegación autenticada y visibilidad del menú Music AI
  const musicAiLink = page.getByRole('link', { name: /KADOSH Music AI/i }).first();
  await musicAiLink.waitFor({ timeout: 15000 });
  console.log('[PASS] Dueño autenticado en preview aislado; enlace KADOSH Music AI visible en menú.');

  await musicAiLink.click();
  await page.getByText('1. Chats Oficiales (Gemini & ChatGPT)').waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: /Preparar con Gemini/i }).waitFor({ timeout: 5000 });
  await page.getByRole('button', { name: /Preparar con ChatGPT/i }).waitFor({ timeout: 5000 });
  await page.getByRole('button', { name: /Importar respuesta de Gemini o ChatGPT/i }).waitFor({ timeout: 5000 });
  await page.getByRole('button', { name: /Crear canción con este resultado/i }).waitFor({ timeout: 5000 });
  console.log('[PASS] Modalidad Chats Oficiales activa por defecto con todos sus controles listos.');

  // Verificar Crear Canción (/añadir) paneles plegables
  await page.goto(`${BASE_URL}/a%C3%B1adir`, { waitUntil: 'domcontentloaded' });
  await page.getByText('Fondo de Proyección Automático').waitFor({ timeout: 15000 });
  await page.getByText('Estilo de Proyección y Formato especial de letras').waitFor({ timeout: 5000 });
  console.log('[PASS] Paneles plegables verificados en Crear Canción.');

  // Verificar Editar Canción (/editar/preview-demo-song)
  try {
    await page.goto(`${BASE_URL}/editar/preview-demo-song`, { waitUntil: 'domcontentloaded' });
    await page.getByText('Fondo de Proyección Automático').waitFor({ timeout: 15000 });
    await page.getByText('Multimedia por Sección').waitFor({ timeout: 5000 });
    console.log('[PASS] Paneles plegables verificados en Editar Canción.');
  } catch (err) {
    console.log('[DEBUG EDIT URL]', page.url());
    console.log('[DEBUG EDIT BODY]', (await page.evaluate(() => document.body.innerText)).slice(0, 400));
    throw err;
  }

  await ownerCtx.close();

  // ─────────────────────────────────────────────────────────────
  // 2. SESIÓN MÚSICO NO AUTORIZADO (musico@e2e.local)
  // ─────────────────────────────────────────────────────────────
  const musicianCtx = await browser.newContext();
  const mPage = await musicianCtx.newPage();

  await mPage.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await mPage.locator('input[type="email"]').waitFor({ timeout: 15000 });
  await mPage.locator('input[type="email"]').fill('musico@e2e.local');
  await mPage.locator('input[type="password"]').fill(PASSWORD);
  await mPage.getByRole('button', { name: /Entrar a Kadosh Pro/i }).click();

  // Esperar que cargue el layout del músico
  await mPage.getByRole('link', { name: /Inicio|Repertorio|Canciones|Dashboard/i }).first().waitFor({ timeout: 15000 });
  const visibleMusicLinks = await mPage.getByRole('link', { name: /KADOSH Music AI/i }).count();
  assert.equal(visibleMusicLinks, 0, 'Un usuario no autorizado NO debe ver KADOSH Music AI en el menú.');

  await mPage.goto(`${BASE_URL}/music-ai`, { waitUntil: 'domcontentloaded' });
  await mPage.waitForTimeout(2000);
  const officialChatsVisibleForUnauthorized = await mPage.getByText('1. Chats Oficiales (Gemini & ChatGPT)').count();
  assert.equal(officialChatsVisibleForUnauthorized, 0, 'Un usuario no autorizado NO debe poder abrir /music-ai.');
  console.log('[PASS] Usuario no autorizado (musico@e2e.local) no ve el menú ni accede a /music-ai.');

  await musicianCtx.close();
  console.log('\n[PASS TOTAL] Preview vivo verificado end-to-end para dueño y no autorizado.');
} finally {
  await browser.close();
}
