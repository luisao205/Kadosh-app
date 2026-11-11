import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');

if (!admin.apps.length) {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
  admin.initializeApp({ projectId: 'demo-kadosh-e2e' });
}

const adminDb = admin.firestore();

const BASE_URL = 'http://127.0.0.1:5175';
const PASSWORD = 'LocalE2E-Canva-2026!';
const TEST_TITLE = 'Tómalo (Validación E2E)';
const TEST_EVENT_ID = 'e2e_tomalo_validation_evt';

const TOMALO_DRAFT = [
  '# Intro',
  '[E] [B] [C#m] [A]',
  '',
  '# Verso 1',
  '[E]De este mundo tú me sacaste',
  '[C#m]Tu amor me alcanzó',
  '',
  '# Coro',
  '// [C#m]Toma, tómalo //',
  '',
  '# Puente',
  '[A]Santo es el Señor',
].join('\n');

const GPT_WRAPPED_TOMALO = [
  '```kadosh',
  `Título: ${TEST_TITLE}`,
  'Artista: Hillsong United',
  'Tono: E',
  '',
  TOMALO_DRAFT,
  '```',
].join('\n');

const browser = await chromium.launch({ headless: true });
const ownerContext = await browser.newContext({ viewport: { width: 1366, height: 860 } });
const ownerPage = await ownerContext.newPage();

const cdp = await ownerContext.newCDPSession(ownerPage);
await cdp.send('Network.enable');

const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
const wsConnections = [];

cdp.on('Network.webSocketHandshakeResponseReceived', (evt) => {
  wsConnections.push({ status: evt.response?.status });
});

const attachDiagnostics = (targetPage, label) => {
  targetPage.on('pageerror', (err) => pageErrors.push(`[${label}] ${err.message}`));
  targetPage.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(`[${label}] ${msg.text()}`);
  });
  targetPage.on('requestfailed', (req) => {
    const url = req.url();
    if (url.includes('127.0.0.1')) {
      failedRequests.push({ label, url, reason: req.failure()?.errorText || 'unknown' });
    }
  });
};

attachDiagnostics(ownerPage, 'owner');

let createdSongId = null;

try {
  // 1. Login Owner y entorno aislado
  await ownerPage.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await ownerPage.locator('input[type="email"]').waitFor({ timeout: 20000 });
  const envOk = await ownerPage.evaluate(() => window.__KADOSH_E2E_EMULATORS__ === true);
  assert.equal(envOk, true, 'El frontend debe ejecutarse en modo aislado de emuladores');

  await ownerPage.locator('input[type="email"]').fill('owner@e2e.local');
  await ownerPage.locator('input[type="password"]').fill(PASSWORD);
  await ownerPage.getByRole('button', { name: /Entrar a Kadosh Pro/i }).click();

  const musicAiLink = ownerPage.getByRole('link', { name: /KADOSH Music AI/i }).first();
  await musicAiLink.waitFor({ timeout: 20000 });
  await musicAiLink.click();
  await ownerPage.getByText('1. Chats Oficiales (Gemini & ChatGPT)').waitFor({ timeout: 10000 });

  // Verificar recarga directa SPA de /music-ai y ocultación de "Asistente integrado (API)"
  await ownerPage.reload({ waitUntil: 'domcontentloaded' });
  await ownerPage.getByText('1. Chats Oficiales (Gemini & ChatGPT)').waitFor({ timeout: 15000 });
  await ownerPage.getByRole('button', { name: /Chats oficiales/i }).waitFor({ timeout: 5000 });
  await ownerPage.getByRole('button', { name: /Conversor local sin IA/i }).waitFor({ timeout: 5000 });
  assert.equal(
    await ownerPage.getByRole('button', { name: /Asistente integrado \(API\)/i }).count(),
    0,
    'La pestaña Asistente integrado (API) debe estar oculta en el primer lanzamiento Web'
  );
  console.log('[PASS] /music-ai recarga limpia en SPA; solo Chats oficiales y Conversor local visibles.');

  // 2. Importar "Tómalo" con // [C#m]Toma, tómalo // y comprobar coherencia en Studio
  await ownerPage.locator('textarea[placeholder*="Pega aquí la respuesta completa"]').fill(GPT_WRAPPED_TOMALO);
  await ownerPage.getByRole('button', { name: /Importar respuesta de Gemini o ChatGPT/i }).click();

  const kadoshEditor = ownerPage.locator('textarea[placeholder*="# Intro"]');
  const editorText = await kadoshEditor.inputValue();
  assert.ok(editorText.includes('// [C#m]Toma, tómalo //'), 'El Editor KADOSH debe conservar // [C#m]Toma, tómalo //');
  assert.ok(editorText.includes('# Intro') && editorText.includes('# Puente'), 'Las demás secciones deben permanecer intactas');

  await ownerPage.getByText(/4 secciones · 8 acordes · 1 repeticiones/).waitFor({ timeout: 5000 });

  // Revisar Diapositivas en MusicAI Studio
  await ownerPage.getByRole('button', { name: /Diapositivas \(4\)/i }).click();
  const studioStage = ownerPage.locator('.projection-preset-clean');
  await studioStage.getByText('(Sección instrumental o sin texto)').waitFor({ timeout: 5000 });
  // Avanzar a Verso 1 y luego a Coro
  await ownerPage.getByRole('button', { name: /^Siguiente$/i }).click();
  await studioStage.getByText('De este mundo tú me sacaste').waitFor({ timeout: 5000 });
  await ownerPage.getByRole('button', { name: /^Siguiente$/i }).click();
  await studioStage.getByText(/Coro · 2x/i).waitFor({ timeout: 5000 });
  await studioStage.getByText('Toma, tómalo').waitFor({ timeout: 5000 });
  const slideStageText = await studioStage.innerText();
  assert.equal(slideStageText.includes('//'), false, 'Diapositivas Studio no debe mostrar barras //');
  assert.equal(slideStageText.includes('[C#m]'), false, 'Diapositivas Studio no debe mostrar corchetes de acorde');

  // Revisar Acordes para Músicos en MusicAI Studio
  await ownerPage.getByRole('button', { name: /Músicos/i }).first().click();
  const chordsTabPanel = ownerPage.locator('h4:has-text("# Coro")').locator('..');
  await chordsTabPanel.waitFor({ timeout: 5000 });
  const chordsTabText = await chordsTabPanel.innerText();
  assert.ok(chordsTabText.includes('C#m'), 'Vista Músicos en Studio debe preservar acorde C#m');
  assert.ok(chordsTabText.includes('Toma,') && chordsTabText.includes('tómalo'), 'Vista Músicos debe mostrar letra completa');
  assert.equal(chordsTabText.includes('//'), false, 'Vista Músicos no debe mostrar // dentro de la letra');
  console.log('[PASS] MusicAI Studio: Editor, Diapositivas V2.1 (2x, sin //) y Acordes Músicos ([C#m]) coherentes.');

  // 3. Crear canción desde Music AI -> /añadir y guardar en Firestore Emulator
  await ownerPage.getByRole('button', { name: /Crear canción con este resultado/i }).click();
  await ownerPage.getByText('Fondo de Proyección Automático').waitFor({ timeout: 10000 });

  const addLyricsEl = ownerPage.locator('textarea').first();
  const addLyricsVal = await addLyricsEl.inputValue();
  assert.ok(addLyricsVal.includes('// [C#m]Toma, tómalo //'), '/añadir debe recibir // [C#m]Toma, tómalo //');

  // Verificar scrollbars ocultas en /añadir antes de guardar
  const addSbStyle = await addLyricsEl.evaluate((el) => window.getComputedStyle(el).scrollbarWidth);
  assert.equal(addSbStyle, 'none');

  await ownerPage.getByRole('button', { name: /Guardar Cancion/i }).click();
  await ownerPage.getByText(/guardada exitosamente en Kadosh App/i).waitFor({ timeout: 10000 });

  // Confirmar documento real creado en Firestore Emulator
  const songQuerySnap = await adminDb.collection('canciones').where('titulo', '==', TEST_TITLE).get();
  assert.equal(songQuerySnap.size, 1, 'Debe existir exactamente 1 documento guardado para Tómalo en Firestore Emulator');
  const savedDoc = songQuerySnap.docs[0];
  createdSongId = savedDoc.id;
  const savedData = savedDoc.data();
  assert.equal(savedData.tonoOriginal, 'E');
  assert.equal(savedData.letraRaw, TOMALO_DRAFT);
  console.log(`[PASS] Guardado real en Firestore Emulator (canciones/${createdSongId}).`);

  // 4. Recuperación desde /canciones -> apertura en /editar/:id -> verificar conservación total + scrollbars
  await ownerPage.getByRole('link', { name: /Repertorio/i }).first().click();
  const searchInput = ownerPage.locator('input[placeholder*="Buscar por titulo"]');
  await searchInput.waitFor({ timeout: 10000 });
  await searchInput.fill(TEST_TITLE);
  await ownerPage.getByRole('heading', { name: TEST_TITLE }).waitFor({ timeout: 10000 });

  await ownerPage.locator('button[title="Editar"]').first().click();
  await ownerPage.waitForURL(new RegExp(`/editar/${createdSongId}`), { timeout: 10000 });
  await ownerPage.getByRole('heading', { name: /Editar Cancion/i }).waitFor({ timeout: 10000 });

  const editLyricsEl = ownerPage.locator('textarea').first();
  const editLyricsVal = await editLyricsEl.inputValue();
  assert.equal(editLyricsVal, TOMALO_DRAFT, 'Al reabrir en /editar/:id debe conservarse exactamente toda la estructura y // [C#m]Toma, tómalo //');

  // Comprobar scrollbar oculta y funcional con rueda + teclado en EditSong textarea
  const longEnoughLyrics = `${editLyricsVal}\n\n` + Array.from({ length: 24 }, (_, idx) => `[E]Línea extra scroll ${idx + 1}`).join('\n');
  await editLyricsEl.fill(longEnoughLyrics);
  const editMetrics = await editLyricsEl.evaluate((el) => {
    const style = window.getComputedStyle(el);
    return {
      scrollbarWidth: style.scrollbarWidth,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    };
  });
  assert.equal(editMetrics.scrollbarWidth, 'none', 'Textarea de Editar Canción debe tener scrollbar-width: none');
  assert.ok(editMetrics.scrollHeight > editMetrics.clientHeight, 'El textarea debe tener contenido desplazable');
  const editBox = await editLyricsEl.boundingBox();
  await ownerPage.mouse.move(editBox.x + editBox.width / 2, editBox.y + editBox.height / 2);
  await ownerPage.mouse.wheel(0, 200);
  await ownerPage.waitForTimeout(200);
  const editWheelTop = await editLyricsEl.evaluate((el) => el.scrollTop);
  assert.ok(editWheelTop > 0, 'Scroll por rueda del mouse debe funcionar en Editar Canción sin scrollbar visible');
  console.log('[PASS] Reapertura desde /canciones -> /editar/:id con integridad 100% y scroll funcional sin scrollbar visible.');

  // 5. Motor REAL de Proyección V2.1: ProyectorController -> Proyector -> StageDisplayMusicos
  await adminDb.collection('eventos').doc(TEST_EVENT_ID).set({
    titulo: 'Servicio Validación E2E Tómalo',
    fecha: '2026-11-11',
    tipoEvento: 'Culto de prueba',
    lugar: 'Emulador local',
    estado: 'activo',
    setlist: [{ type: 'song', value: createdSongId, idLocal: 'item-tomalo-1' }],
    canciones: [createdSongId],
    projectorState: { type: 'lyrics', contentType: 'lyrics', title: TEST_TITLE },
    projectionTargets: { projector: true, singers: true, musicians: true },
    proyectorSlide: null,
    proyectorApagado: false,
    canvaOutputs: {},
    mediaOutputs: {},
    liveState: {
      activeSongId: createdSongId,
      activeSongTitle: TEST_TITLE,
      activeSongIndex: 0,
      activeSectionIndex: -1,
      activeSectionTitle: '',
      activeContentType: 'lyrics',
      activeContentTitle: TEST_TITLE,
      updatedAt: Date.now(),
      updatedBy: 'E2E validation',
    },
    fechaCreacion: Date.now(),
    fechaActualizacion: Date.now(),
  });

  const controllerPage = await ownerContext.newPage();
  const projectorPage = await ownerContext.newPage();
  const musicosPage = await ownerContext.newPage();
  attachDiagnostics(controllerPage, 'controller');
  attachDiagnostics(projectorPage, 'projector');
  attachDiagnostics(musicosPage, 'musicos');

  await Promise.all([
    controllerPage.goto(`${BASE_URL}/control-proyector/${TEST_EVENT_ID}`, { waitUntil: 'domcontentloaded' }),
    projectorPage.goto(`${BASE_URL}/proyector/${TEST_EVENT_ID}`, { waitUntil: 'domcontentloaded' }),
    musicosPage.goto(`${BASE_URL}/retorno-musicos/${TEST_EVENT_ID}`, { waitUntil: 'domcontentloaded' }),
  ]);

  const songSelectBtn = controllerPage.getByRole('button', { name: new RegExp(`1\\. ${TEST_TITLE.replace(/[()]/g, '\\$&')}`) }).first();
  await songSelectBtn.waitFor({ timeout: 15000 });
  await songSelectBtn.click();

  const coroCard = controllerPage.locator('div.cursor-pointer').filter({ hasText: 'Toma, tómalo' }).first();
  await coroCard.waitFor({ timeout: 10000 });
  const coroCardText = await coroCard.innerText();
  assert.equal(coroCardText.includes('//'), false, 'La tarjeta de diapositiva en ProyectorController no debe mostrar //');
  assert.equal(coroCardText.includes('[C#m]'), false, 'La tarjeta de diapositiva en ProyectorController no debe mostrar [C#m]');

  // Proyectar Coro con doble clic real en ProyectorController
  await coroCard.dblclick();
  await projectorPage.getByText('Toma, tómalo').waitFor({ timeout: 10000 });

  // Esperar confirmación persistida en Firestore Emulator (no solo caché optimista)
  let evtData = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const snap = await adminDb.collection('eventos').doc(TEST_EVENT_ID).get();
    if (snap.data()?.proyectorSlide?.titulo === 'Coro') {
      evtData = snap.data();
      break;
    }
    await ownerPage.waitForTimeout(100);
  }
  assert.ok(evtData?.proyectorSlide, `proyectorSlide no se persistió en Firestore Emulator; consoleErrors=${JSON.stringify(consoleErrors)}`);
  assert.equal(evtData.proyectorSlide?.titulo, 'Coro');
  assert.equal(evtData.proyectorSlide?.texto, 'Toma, tómalo');
  assert.equal(evtData.proyectorSlide?.repetition, true, 'El motor real debe interpretar // ... // con repetition: true');
  assert.equal(evtData.proyectorSlide?.repeatCount, 2, 'El motor real debe interpretar // ... // como repeatCount: 2');

  // Validar pantalla real del Proyector (sin // y sin [C#m])
  const projectorBodyText = await projectorPage.locator('body').innerText();
  assert.ok(projectorBodyText.includes('Toma, tómalo'), 'El Proyector real debe mostrar "Toma, tómalo"');
  assert.equal(projectorBodyText.includes('//'), false, 'El Proyector real jamás debe proyectar barras //');
  assert.equal(projectorBodyText.includes('C#m'), false, 'El Proyector real jamás debe proyectar acordes [C#m]');

  // Validar StageDisplayMusicos (acorde [C#m] preservado y sin barras //)
  await musicosPage.getByText('Toma,').waitFor({ timeout: 10000 });
  const coroSectionMusicos = musicosPage.locator('section').filter({ hasText: 'Toma,' }).first();
  const coroMusicosText = await coroSectionMusicos.innerText();
  assert.ok(coroMusicosText.includes('C#m'), 'Retorno de músicos debe preservar el acorde C#m');
  assert.ok(coroMusicosText.includes('Toma,') && coroMusicosText.includes('tómalo'), 'Retorno de músicos debe mostrar la letra completa');
  assert.equal(coroMusicosText.includes('//'), false, 'Retorno de músicos no debe mostrar barras // en la letra');

  // Validar que las demás secciones/diapositivas no se alteraron (proyectar Puente)
  const puenteCard = controllerPage.locator('div.cursor-pointer').filter({ hasText: 'Santo es el Señor' }).first();
  await puenteCard.dblclick();
  await projectorPage.getByText('Santo es el Señor').waitFor({ timeout: 10000 });
  let evtAfterPuente = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const snap = await adminDb.collection('eventos').doc(TEST_EVENT_ID).get();
    if (snap.data()?.proyectorSlide?.titulo === 'Puente') {
      evtAfterPuente = snap.data();
      break;
    }
    await ownerPage.waitForTimeout(100);
  }
  assert.ok(evtAfterPuente?.proyectorSlide, 'Puente no se persistió en Firestore Emulator');
  assert.equal(evtAfterPuente.proyectorSlide?.titulo, 'Puente');
  assert.equal(evtAfterPuente.proyectorSlide?.repetition, false);
  assert.equal(evtAfterPuente.proyectorSlide?.repeatCount, 1);

  await Promise.all([controllerPage.close(), projectorPage.close(), musicosPage.close()]);
  console.log('[PASS] Proyección real V2.1: repeatCount=2, sin // en Proyector, C#m en Músicos, demás secciones inalteradas.');

  // 6. Permisos: usuario músico NO puede acceder a Music AI ni crear/editar canciones ni escribir en canciones
  const musicoContext = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  const musicoPage = await musicoContext.newPage();
  attachDiagnostics(musicoPage, 'musico');

  await musicoPage.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await musicoPage.locator('input[type="email"]').fill('musico@e2e.local');
  await musicoPage.locator('input[type="password"]').fill(PASSWORD);
  await musicoPage.getByRole('button', { name: /Entrar a Kadosh Pro/i }).click();
  await musicoPage.getByRole('link', { name: /Repertorio/i }).first().waitFor({ timeout: 15000 });

  assert.equal(await musicoPage.getByRole('link', { name: /KADOSH Music AI/i }).count(), 0, 'Músico no debe ver enlace a Music AI');
  await musicoPage.goto(`${BASE_URL}/music-ai`, { waitUntil: 'domcontentloaded' });
  await musicoPage.getByText(/KADOSH Music AI requiere autorización expresa del dueño/i).waitFor({ timeout: 10000 });

  await musicoPage.goto(`${BASE_URL}/añadir`, { waitUntil: 'domcontentloaded' });
  await musicoPage.getByText(/Solo el equipo autorizado puede agregar canciones/i).waitFor({ timeout: 10000 });

  // Comprobar denegación directa en Firestore Emulator Rules y aprobación/revocación real vía callable
  const firebase = await import('firebase/app');
  const authSdk = await import('firebase/auth');
  const fsSdk = await import('firebase/firestore');
  const fnSdk = await import('firebase/functions');
  const secApp = firebase.initializeApp({ apiKey: 'demo-api-key', projectId: 'demo-kadosh-e2e' }, 'musico-rules-check');
  const secAuth = authSdk.getAuth(secApp);
  authSdk.connectAuthEmulator(secAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const secDb = fsSdk.getFirestore(secApp);
  fsSdk.connectFirestoreEmulator(secDb, '127.0.0.1', 8080);
  const secFunctions = fnSdk.getFunctions(secApp);
  fnSdk.connectFunctionsEmulator(secFunctions, '127.0.0.1', 5001);
  const callSetAccess = fnSdk.httpsCallable(secFunctions, 'setMusicAIAccess');

  // Guardar favorito privado como dueño antes de probar acceso cruzado
  await authSdk.signInWithEmailAndPassword(secAuth, 'owner@e2e.local', PASSWORD);
  await fsSdk.setDoc(fsSdk.doc(secDb, 'usuarios', 'e2e-owner', 'notas', 'music_ai_official_chats'), {
    ownerUid: 'e2e-owner',
    kind: 'music_ai_official_chats',
    favorites: [{ id: 'fav-1', name: 'Chat Test', provider: 'gemini', url: 'https://gemini.google.com/app' }],
  });
  const approvedRes = await callSetAccess({ targetUid: 'e2e-musico', authorized: true });
  assert.equal(approvedRes.data?.authorized, true);
  const revokedRes = await callSetAccess({ targetUid: 'e2e-musico', authorized: false });
  assert.equal(revokedRes.data?.authorized, false);

  // Admin intentando aprobar Music AI debe ser rechazado tanto en callable como en Firestore Rules
  await authSdk.signInWithEmailAndPassword(secAuth, 'admin@e2e.local', PASSWORD);
  await assert.rejects(() => callSetAccess({ targetUid: 'e2e-musico', authorized: true }), /permission-denied|Solo el dueño/);
  await assert.rejects(
    () => fsSdk.updateDoc(fsSdk.doc(secDb, 'usuarios', 'e2e-musico'), { musicAIAccess: { authorized: true } }),
    (err) => err?.code === 'permission-denied',
    'Firestore Rules debe bloquear que admin conceda musicAIAccess directamente'
  );

  // Músico intentando autoautorizarse o leer favoritos del dueño o escribir canciones debe ser rechazado
  await authSdk.signInWithEmailAndPassword(secAuth, 'musico@e2e.local', PASSWORD);
  await assert.rejects(
    () => fsSdk.updateDoc(fsSdk.doc(secDb, 'usuarios', 'e2e-musico'), { musicAIAccess: { authorized: true } }),
    (err) => err?.code === 'permission-denied',
    'Firestore Rules debe bloquear autoautorización de musicAIAccess'
  );
  await assert.rejects(
    () => fsSdk.getDoc(fsSdk.doc(secDb, 'usuarios', 'e2e-owner', 'notas', 'music_ai_official_chats')),
    (err) => err?.code === 'permission-denied',
    'Favoritos del dueño deben permanecer privados'
  );
  await assert.rejects(
    () => fsSdk.setDoc(fsSdk.doc(secDb, 'canciones', 'e2e_denied_write_check'), { titulo: 'Denied' }),
    (err) => err?.code === 'permission-denied',
    'Firestore Rules debe bloquear escritura de músico en canciones'
  );
  await firebase.deleteApp(secApp);
  await musicoContext.close();
  console.log('[PASS] Permisos UI, callable owner-only, bloqueo autoautorización/admin y favoritos privados verificados.');

  // 7. Verificar consola, red y WebSocket Vite HMR
  const hasRefused = [...consoleErrors, ...failedRequests.map((r) => `${r.url}:${r.reason}`)]
    .some((e) => e.includes('ERR_CONNECTION_REFUSED'));
  const hasSendBeforeConnect = [...consoleErrors, ...pageErrors]
    .some((e) => e.includes('send was called before connect'));
  const ownerConsoleErrors = consoleErrors.filter((e) => e.startsWith('[owner]') || e.startsWith('[musico]'));
  const nonHeadlessPermissionErrors = consoleErrors.filter((e) => (
    !e.includes('Error detectando pantallas: NotAllowedError')
    && !e.includes('SongExportCenter')
  ));
  assert.equal(hasRefused, false, `Se detectó ERR_CONNECTION_REFUSED: ${JSON.stringify({ consoleErrors, failedRequests })}`);
  assert.equal(hasSendBeforeConnect, false, `Se detectó send was called before connect: ${JSON.stringify({ consoleErrors, pageErrors })}`);
  assert.equal(ownerConsoleErrors.length, 0, `Errores de consola en Music AI/Editor: ${JSON.stringify(ownerConsoleErrors)}`);
  assert.equal(nonHeadlessPermissionErrors.length, 0, `Errores inesperados de consola en live views: ${JSON.stringify(nonHeadlessPermissionErrors)}`);
  assert.equal(pageErrors.length, 0, `Errores de página: ${JSON.stringify(pageErrors)}`);
  assert.ok(wsConnections.some((w) => w.status === 101), 'Debe existir handshake WebSocket 101 de Vite HMR');
  console.log(`[PASS] Consola limpia (owner/musico=0 errores, 0 ERR_CONNECTION_REFUSED, 0 send before connect, WS 101 OK; total raw=${consoleErrors.length}).`);
} finally {
  // 8. Limpieza estricta de registros de prueba únicamente
  if (createdSongId) {
    await adminDb.collection('canciones').doc(createdSongId).delete().catch(() => {});
  }
  await adminDb.collection('eventos').doc(TEST_EVENT_ID).delete().catch(() => {});
  await adminDb.collection('usuarios').doc('e2e-owner').collection('notas').doc('music_ai_official_chats').delete().catch(() => {});
  await adminDb.collection('usuarios').doc('e2e-musico').update({ musicAIAccess: admin.firestore.FieldValue.delete() }).catch(() => {});
  const auditDocs = await adminDb.collection('usuarios').doc('e2e-musico').collection('musicAIAudit').get().catch(() => null);
  if (auditDocs) {
    await Promise.all(auditDocs.docs.map((d) => d.ref.delete().catch(() => {})));
  }
  const notifSnap = await adminDb.collection('notificaciones').where('mensaje', '==', `Se ha añadido "${TEST_TITLE}" al repertorio general.`).get();
  await Promise.all(notifSnap.docs.map((d) => d.ref.delete().catch(() => {})));

  const leftover = createdSongId ? await adminDb.collection('canciones').doc(createdSongId).get() : null;
  const seedSong = await adminDb.collection('canciones').doc('preview-demo-song').get();
  if (leftover?.exists) {
    throw new Error(`No se limpió la canción de prueba canciones/${createdSongId}`);
  }
  if (!seedSong.exists) {
    throw new Error('La canción demo seed preview-demo-song desapareció inesperadamente');
  }
  console.log('[PASS] Limpieza estricta completada en demo-kadosh-e2e; registros base preservados.');
  await ownerContext.close();
  await browser.close();
}
