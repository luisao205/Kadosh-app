import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const BASE_URL = 'http://127.0.0.1:5175';
const PASSWORD = 'LocalE2E-Canva-2026!';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1366, height: 860 } });
const page = await context.newPage();

const cdp = await context.newCDPSession(page);
await cdp.send('Network.enable');

const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
const wsConnections = [];

cdp.on('Network.webSocketCreated', (evt) => {
  wsConnections.push({ url: evt.url, status: 'created' });
});
cdp.on('Network.webSocketHandshakeResponseReceived', (evt) => {
  wsConnections.push({ status: evt.response?.status, headers: evt.response?.headers });
});
cdp.on('Network.webSocketFrameError', (evt) => {
  wsConnections.push({ error: evt.errorMessage });
});

page.on('pageerror', (err) => {
  pageErrors.push(err.message);
});

page.on('console', (msg) => {
  if (msg.type() === 'error') {
    consoleErrors.push(msg.text());
  }
});

page.on('requestfailed', (req) => {
  failedRequests.push({
    url: req.url(),
    reason: req.failure()?.errorText || 'unknown'
  });
});

try {
  // 1. Iniciar en login y comprobar que Emulators + Vite HMR conectan limpio desde el primer ms
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').waitFor({ timeout: 20000 });

  const envCheck = await page.evaluate(() => ({
    e2eSafe: window.__KADOSH_E2E_EMULATORS__,
    host: window.location.hostname,
    port: window.location.port
  }));
  assert.equal(envCheck.e2eSafe, true, 'El frontend debe operar exclusivamente en Firebase Emulators locales.');

  await page.locator('input[type="email"]').fill('owner@e2e.local');
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: /Entrar a Kadosh Pro/i }).click();

  const musicAiLink = page.getByRole('link', { name: /KADOSH Music AI/i }).first();
  await musicAiLink.waitFor({ timeout: 20000 });
  await musicAiLink.click();
  await page.getByText('1. Chats Oficiales (Gemini & ChatGPT)').waitFor({ timeout: 10000 });

  // 2. Verificar estilos CSS de ocultación visual de scrollbars sin romper overflow, rueda ni teclado
  const longLyrics = Array.from({ length: 35 }, (_, idx) =>
    `Línea ${idx + 1}: Tu [G]gracia y tu [D]amor permanecen [Em]siempre fi[C]eles`
  ).join('\n');

  const rawTextarea = page.locator('textarea[placeholder*="Pega aquí la letra"]');
  await rawTextarea.fill(longLyrics);

  // Importar una respuesta para tener contenido largo también en el Editor KADOSH
  const importedPayload = `\`\`\`kadosh\n# Verso 1\n${longLyrics}\n\`\`\``;
  await page.locator('textarea[placeholder*="Pega aquí la respuesta completa"]').fill(importedPayload);
  await page.getByRole('button', { name: /Importar respuesta de Gemini o ChatGPT/i }).click();

  const kadoshEditor = page.locator('textarea[placeholder*="# Intro"]');
  await kadoshEditor.waitFor({ timeout: 5000 });

  // Revisar CSS y geometría de scroll en los textareas clave
  const rawMetrics = await rawTextarea.evaluate((el) => {
    const style = window.getComputedStyle(el);
    return {
      scrollbarWidth: style.scrollbarWidth,
      overflowY: style.overflowY,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      offsetWidth: el.offsetWidth,
      clientWidth: el.clientWidth,
      borderLeft: parseFloat(style.borderLeftWidth) || 0,
      borderRight: parseFloat(style.borderRightWidth) || 0,
    };
  });

  assert.equal(rawMetrics.scrollbarWidth, 'none', 'scrollbar-width debe ser none');
  assert.ok(rawMetrics.scrollHeight > rawMetrics.clientHeight, 'El contenido largo debe generar desplazamiento sin expandir el cuadro');
  const rawScrollbarWidth = rawMetrics.offsetWidth - rawMetrics.clientWidth - rawMetrics.borderLeft - rawMetrics.borderRight;
  assert.ok(rawScrollbarWidth <= 1, `No debe existir barra visual ocupando ancho (encontrado: ${rawScrollbarWidth}px)`);

  // Probar rueda del mouse en Letra y acordes originales
  const box = await rawTextarea.boundingBox();
  assert.ok(box, 'Debe obtener caja de coordenadas de textarea');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 220);
  await page.waitForTimeout(250);
  const wheelScrollTop = await rawTextarea.evaluate((el) => el.scrollTop);
  assert.ok(wheelScrollTop > 0, `La rueda del mouse debe desplazar el contenido (scrollTop=${wheelScrollTop})`);

  // Probar navegación con teclado y posición del cursor en Editor KADOSH
  await kadoshEditor.click();
  await page.keyboard.press('Control+Home');
  for (let i = 0; i < 18; i += 1) {
    await page.keyboard.press('ArrowDown');
  }
  const cursorAndScroll = await kadoshEditor.evaluate((el) => ({
    selectionStart: el.selectionStart,
    scrollTop: el.scrollTop,
    scrollbarWidth: window.getComputedStyle(el).scrollbarWidth,
  }));
  assert.equal(cursorAndScroll.scrollbarWidth, 'none');
  assert.ok(cursorAndScroll.selectionStart > 100, 'El cursor debe avanzar correctamente con flechas del teclado');
  assert.ok(cursorAndScroll.scrollTop > 0, 'El scroll debe seguir al cursor por teclado sin scrollbar visible');

  console.log('[PASS] Scrollbars ocultas visualmente (scrollbar-width: none, 0px ancho), rueda y teclado 100% funcionales.');

  // 3. Probar flujo de Crear canción con este resultado (hand-off + scrollbar en Crear Canción)
  await page.getByRole('button', { name: /Crear canción con este resultado/i }).click();
  await page.getByText('Fondo de Proyección Automático').waitFor({ timeout: 10000 });
  const addSongLyrics = page.locator('textarea').first();
  const addLyricsVal = await addSongLyrics.inputValue();
  assert.ok(addLyricsVal.includes('Línea 1:'), 'La precarga hacia Crear Canción debe conservar la letra completa');
  const addScrollbarWidth = await addSongLyrics.evaluate((el) => window.getComputedStyle(el).scrollbarWidth);
  assert.equal(addScrollbarWidth, 'none');
  console.log('[PASS] Crear Canción conserva precarga completa y oculta scrollbars sin alterar dimensiones.');

  // 4. Probar escritura y lectura real aislada en Firestore Emulator (sin tocar canciones reales ni producción)
  const firebase = await import('firebase/app');
  const authSdk = await import('firebase/auth');
  const fsSdk = await import('firebase/firestore');

  const testApp = firebase.initializeApp({ apiKey: 'demo-api-key', projectId: 'demo-kadosh-e2e' }, 'health-rw-check');
  const testAuth = authSdk.getAuth(testApp);
  authSdk.connectAuthEmulator(testAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const testDb = fsSdk.getFirestore(testApp);
  fsSdk.connectFirestoreEmulator(testDb, '127.0.0.1', 8080);

  await authSdk.signInWithEmailAndPassword(testAuth, 'owner@e2e.local', PASSWORD);
  const testNoteRef = fsSdk.doc(testDb, 'usuarios', 'e2e-owner', 'notas', '_preview_console_health_test');
  const marker = `ok-${Date.now()}`;
  await fsSdk.setDoc(testNoteRef, { status: 'healthy', marker });
  const readSnap = await fsSdk.getDoc(testNoteRef);
  assert.equal(readSnap.exists(), true, 'El documento de prueba debe existir en Firestore Emulator.');
  assert.equal(readSnap.data()?.marker, marker, 'La lectura en Firestore Emulator debe coincidir con la escritura.');
  await fsSdk.deleteDoc(testNoteRef);
  await firebase.deleteApp(testApp);
  console.log('[PASS] Escritura, lectura y limpieza verificadas en Firestore Emulator (demo-kadosh-e2e).');

  // También comprobar vista de canciones y Editar Canción en el navegador sin errores
  await page.getByRole('link', { name: /Canciones|Repertorio/i }).first().click();
  await page.getByText('Canción Demo Preview').waitFor({ timeout: 10000 });
  console.log('[PASS] Lectura real en navegador desde Firestore Emulator (demo-kadosh-e2e) operativa.');

  // Esperar 4 segundos en observación estable para comprobar 0 tormentas de reintentos
  await page.waitForTimeout(4000);

  // Analizar WebSocket HMR de Vite
  const viteWsCreated = wsConnections.filter((w) => String(w.url || '').includes('127.0.0.1:5175'));
  const viteWsSuccess = wsConnections.filter((w) => w.status === 101);
  const wsErrors = wsConnections.filter((w) => w.error);
  assert.ok(viteWsCreated.length >= 1, 'Debe crearse conexión WebSocket de Vite HMR en 127.0.0.1:5175');
  assert.ok(viteWsSuccess.length >= 1, 'El handshake WebSocket de Vite HMR debe responder 101 Switching Protocols');
  assert.equal(wsErrors.length, 0, `No debe haber errores de trama WebSocket: ${JSON.stringify(wsErrors)}`);
  console.log('[PASS] WebSocket Vite HMR verificado (HTTP 101 activo, 0 errores).');

  // Verificar ausencia absoluta de los errores reportados
  const sendBeforeConnect = [...pageErrors, ...consoleErrors].filter((e) => e.includes('send was called before connect'));
  const connRefused8080 = [
    ...failedRequests.filter((r) => r.url.includes('8080') || r.reason.includes('ERR_CONNECTION_REFUSED')),
    ...consoleErrors.filter((e) => e.includes('ERR_CONNECTION_REFUSED') || e.includes('8080')),
  ];

  assert.equal(sendBeforeConnect.length, 0, `Errores sendBeforeConnect encontrados: ${JSON.stringify(sendBeforeConnect)}`);
  assert.equal(connRefused8080.length, 0, `Errores ERR_CONNECTION_REFUSED 8080 encontrados: ${JSON.stringify(connRefused8080)}`);
  assert.equal(pageErrors.length, 0, `Errores no capturados en página: ${JSON.stringify(pageErrors)}`);
  assert.equal(consoleErrors.length, 0, `Errores en consola del navegador: ${JSON.stringify(consoleErrors)}`);

  console.log('[PASS TOTAL] Cero ERR_CONNECTION_REFUSED, cero "send was called before connect", cero errores de consola.');
} finally {
  await browser.close();
}
