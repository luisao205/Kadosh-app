const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const admin = require('../functions/node_modules/firebase-admin');

process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
if (!admin.apps.length) admin.initializeApp({ projectId: 'kadosh-49600' });

const db = admin.firestore();
const eventId = 'e2e-canva-event';
const email = 'operator-a@e2e.local';
const password = 'LocalE2E-Canva-2026!';
const targets = ['projector', 'singers', 'musicians'];
const labels = { projector: 'Proyector', singers: 'Cantantes', musicians: 'Músicos' };
const externalConsole = [];

const media = (id) => ({ active: true, mediaKey: id, mediaId: id, name: id, url: `https://example.test/${id}.mp4`, type: 'video', mode: 'foreground', playing: true, volume: 0.8, loop: true, updatedAt: 1, updatedBy: 'E2E' });
const waitFor = async (predicate, label) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const value = await predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timeout: ${label}`);
};
const reset = async () => {
  const ref = db.collection('eventos').doc(eventId);
  const operations = await ref.collection('undoOperations').get();
  await Promise.all(operations.docs.map((entry) => entry.ref.delete()));
  await ref.update({
    projectorState: { type: 'lyrics', contentType: 'lyrics', title: 'Estado previo' },
    canvaOutputs: {},
    canvaPageMemory: {},
    mediaOutputs: { projector: media('video-a'), singers: media('video-singers'), musicians: media('video-musicians') },
  });
};
const trackConsole = (page, viewport) => {
  page.on('console', (message) => {
    if (message.type() === 'error') externalConsole.push({ viewport, text: message.text() });
  });
  page.on('pageerror', (error) => externalConsole.push({ viewport, text: `pageerror: ${error.message}` }));
};
const signIn = async (page) => {
  await page.goto('http://127.0.0.1:5174/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !document.body.innerText.includes('Cargando Kadosh App...'));
  if (await page.locator('input[type=email]').count()) {
    await page.locator('input[type=email]').fill(email);
    await page.locator('input[type=password]').fill(password);
    await page.getByRole('button', { name: /Entrar a Kadosh Pro/i }).click();
  }
  await page.waitForFunction(() => !document.querySelector('input[type=email]'));
  await page.goto(`http://127.0.0.1:5174/control-proyector/${eventId}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /^Canva$/i }).click();
};
const savedCard = (page, title) => page.locator('button:visible').filter({ hasText: title }).locator('xpath=..');
const chooseDestinations = async (modal, destinationIds) => {
  for (const target of targets) {
    const button = modal.getByRole('button', { name: labels[target], exact: true });
    const selected = await button.evaluate((node) => node.classList.contains('bg-cyan-400'));
    if (selected !== destinationIds.includes(target)) await button.click();
  }
};
const projectSaved = async (page, title, destinationIds) => {
  const card = savedCard(page, title);
  const mobile = card.getByRole('button', { name: 'Pantallas / Proyectar' });
  if (await mobile.count()) await mobile.click();
  else await card.getByRole('button', { name: 'Proyectar', exact: true }).click();
  const modal = page.locator('div.fixed').filter({ hasText: /Editar Canva|Proyectar Canva/ }).last();
  await modal.waitFor({ state: 'visible' });
  await chooseDestinations(modal, destinationIds);
  const response = page.waitForResponse((candidate) => candidate.request().method() === 'POST' && candidate.url().includes('projectSavedCanva'));
  await modal.getByRole('button', { name: 'Proyectar', exact: true }).click();
  const payload = await (await response).json();
  assert.equal(payload?.result?.ok, true, JSON.stringify(payload));
  await modal.waitFor({ state: 'hidden' });
  return payload.result;
};
const openTemporary = async (page, destinationIds) => {
  await page.getByRole('button', { name: /Nueva/i }).first().click();
  const modal = page.locator('div.fixed').filter({ hasText: 'Nueva presentación' }).last();
  await modal.waitFor({ state: 'visible' });
  const fields = modal.locator('input');
  await fields.nth(0).fill('Auditoría temporal');
  await fields.nth(1).fill('https://www.canva.com/design/audit-temporary/view');
  await fields.nth(2).fill('8');
  await chooseDestinations(modal, destinationIds);
  await modal.getByRole('button', { name: 'Proyectar', exact: true }).click();
  return modal;
};
const selectControlTarget = async (page, label) => page.getByRole('button', { name: new RegExp(`^${label}(?:\\s|$)`) }).first().click();
const current = async () => (await db.collection('eventos').doc(eventId).get()).data();
const pageOf = (data, target) => data.canvaOutputs?.[target]?.page;
const findMessage = async (page, text) => waitFor(async () => (await page.locator('body').innerText()).includes(text), text);

async function desktopSync(browser) {
  await reset();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  trackConsole(page, 'desktop');
  try {
    await signIn(page);
    await projectSaved(page, 'Canva A', ['projector', 'singers']);
    await projectSaved(page, 'Canva B', ['musicians']);
    await selectControlTarget(page, 'Proyector');
    await page.getByRole('button', { name: 'Sincronizar', exact: true }).click();
    await page.getByRole('button', { name: /Siguiente/ }).first().click();
    await waitFor(async () => { const data = await current(); return pageOf(data, 'projector') === 2 && pageOf(data, 'singers') === 2; }, 'desktop sync page 2');
    let data = await current();
    assert.equal(pageOf(data, 'musicians'), 1);
    assert.equal(data.canvaPageMemory.projector['id:canva-a'], 2);
    assert.equal(data.canvaPageMemory.singers['id:canva-a'], 2);
    await page.getByRole('button', { name: 'Individual', exact: true }).click();
    await page.getByRole('button', { name: /Siguiente/ }).first().click();
    await waitFor(async () => pageOf(await current(), 'projector') === 3, 'desktop individual page 3');
    data = await current();
    assert.equal(pageOf(data, 'singers'), 2);
    assert.equal(pageOf(data, 'musicians'), 1);
    return 'PASS';
  } finally { await page.close(); }
}

async function viewportExtended(browser, viewport, name) {
  await reset();
  const page = await browser.newPage({ viewport });
  trackConsole(page, name);
  try {
    await signIn(page);
    const modal = await openTemporary(page, ['projector', 'singers']);
    await waitFor(async () => {
      const data = await current();
      return ['projector', 'singers'].every((target) => data.canvaOutputs?.[target]?.presentationId === '');
    }, `${name} temporary projection`);
    if (await modal.isVisible()) await modal.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await modal.waitFor({ state: 'hidden' });
    await selectControlTarget(page, 'Proyector');
    await page.getByRole('button', { name: /Siguiente/ }).first().click();
    await waitFor(async () => pageOf(await current(), 'projector') === 2, `${name} individual page`);
    let data = await current();
    assert.equal(pageOf(data, 'singers'), 1);
    await page.getByRole('button', { name: 'Sincronizar', exact: true }).click();
    await page.getByRole('button', { name: /Siguiente/ }).first().click();
    await waitFor(async () => { const state = await current(); return pageOf(state, 'projector') === 3 && pageOf(state, 'singers') === 3; }, `${name} sync page`);
    await page.getByRole('button', { name: /Deshacer/i }).click();
    await waitFor(async () => !(await current()).canvaOutputs?.projector, `${name} undo`);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const controls = page.getByRole('button', { name: /^Canva$/i });
    await controls.click();
    await page.getByRole('button', { name: /^Canva$/i }).click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(overflow, false, `${name} horizontal overflow`);
    return 'PASS';
  } finally { await page.close(); }
}

async function mobileThreeTargetsAndMedia(browser) {
  await reset();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  trackConsole(page, 'mobile');
  try {
    await signIn(page);
    const modal = await openTemporary(page, ['projector', 'singers', 'musicians']);
    await waitFor(async () => {
      const data = await current();
      return targets.every((target) => data.canvaOutputs?.[target]?.presentationId === '');
    }, 'mobile three targets');
    await modal.waitFor({ state: 'hidden' });
    const after = await current();
    assert.equal(Object.keys(after.mediaOutputs || {}).length, 0);
    await page.getByRole('button', { name: /Deshacer/i }).click();
    await waitFor(async () => Object.keys((await current()).canvaOutputs || {}).length === 0, 'mobile three targets undo');
    const restored = await current();
    assert.equal(restored.mediaOutputs.projector.mediaId, 'video-a');
    assert.equal(restored.mediaOutputs.singers.mediaId, 'video-singers');
    assert.equal(restored.mediaOutputs.musicians.mediaId, 'video-musicians');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(overflow, false, 'mobile horizontal overflow');
    return 'PASS';
  } finally { await page.close(); }
}

async function interleavedCanvaUndo(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  trackConsole(page, 'interleaved-undo');
  try {
    await reset(); await signIn(page);
    const temporaryModal = await openTemporary(page, ['projector']);
    await waitFor(async () => (await current()).canvaOutputs?.projector?.projectionOperationId, 'temporary before saved');
    const temporaryBeforeSaved = (await current()).canvaOutputs.projector;
    if (await temporaryModal.isVisible()) await temporaryModal.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await projectSaved(page, 'Canva A', ['projector']);
    await page.getByRole('button', { name: /Deshacer/i }).click();
    await waitFor(async () => {
      const route = (await current()).canvaOutputs?.projector;
      return route?.projectionOperationId === temporaryBeforeSaved.projectionOperationId ? route : null;
    }, 'saved undo restores temporary');
    assert.deepEqual((await current()).canvaOutputs.projector, temporaryBeforeSaved);

    await reset(); await page.reload(); await page.getByRole('button', { name: /^Canva$/i }).click();
    await projectSaved(page, 'Canva A', ['projector']);
    const savedBeforeTemporary = (await current()).canvaOutputs.projector;
    const secondTemporaryModal = await openTemporary(page, ['projector']);
    await waitFor(async () => {
      const route = (await current()).canvaOutputs?.projector;
      return route?.presentationId === '' && route?.projectionOperationId ? route : null;
    }, 'temporary after saved');
    if (await secondTemporaryModal.isVisible()) await secondTemporaryModal.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await page.getByRole('button', { name: /Deshacer/i }).click();
    await waitFor(async () => {
      const route = (await current()).canvaOutputs?.projector;
      return route?.projectionOperationId === savedBeforeTemporary.projectionOperationId ? route : null;
    }, 'temporary undo restores saved');
    assert.deepEqual((await current()).canvaOutputs.projector, savedBeforeTemporary);
    return 'PASS';
  } finally { await page.close(); }
}

async function undoSpecialCases(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  trackConsole(page, 'undo-special');
  try {
    await reset(); await signIn(page);
    const expired = await projectSaved(page, 'Canva A', ['projector']);
    const beforeExpired = await current();
    await db.collection('eventos').doc(eventId).collection('undoOperations').doc(expired.operationId).update({ expiresAt: Date.now() - 1 });
    const expiredResponse = page.waitForResponse((candidate) => candidate.url().includes('restoreProjectionUndo') && candidate.request().method() === 'POST');
    await page.getByRole('button', { name: /Deshacer/i }).click();
    await expiredResponse;
    await findMessage(page, 'Esta acción ya no se puede deshacer porque expiró.');
    assert.deepEqual(await current(), beforeExpired);

    await reset(); await page.reload(); await page.getByRole('button', { name: /^Canva$/i }).click();
    const legacy = await projectSaved(page, 'Canva A', ['projector']);
    const operationRef = db.collection('eventos').doc(eventId).collection('undoOperations').doc(legacy.operationId);
    await operationRef.update({ 'groups.route_projector.expectedAfter.canvaOutput.value.projectionOperationId': admin.firestore.FieldValue.delete() });
    const beforeLegacy = await current();
    const legacyResponse = page.waitForResponse((candidate) => candidate.url().includes('restoreProjectionUndo') && candidate.request().method() === 'POST');
    await page.getByRole('button', { name: /Deshacer/i }).click();
    const response = await legacyResponse;
    assert.equal((await response.json())?.result?.status, 'skipped');
    await findMessage(page, 'No se pudo deshacer esta proyecci\u00f3n porque pertenece a una versi\u00f3n anterior.');
    assert.deepEqual(await current(), beforeLegacy);

    await reset(); await page.reload(); await page.getByRole('button', { name: /^Canva$/i }).click();
    const alreadyRestored = await projectSaved(page, 'Canva A', ['projector']);
    await db.collection('eventos').doc(eventId).collection('undoOperations').doc(alreadyRestored.operationId).update({ status: 'restored' });
    const alreadyRestoredResponse = page.waitForResponse((candidate) => candidate.url().includes('restoreProjectionUndo') && candidate.request().method() === 'POST');
    await page.getByRole('button', { name: /Deshacer/i }).click();
    assert.equal((await (await alreadyRestoredResponse).json())?.result?.status, 'already_restored');
    await findMessage(page, 'Esta acci\u00f3n ya fue deshecha.');
    return 'PASS';
  } finally { await page.close(); }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const undoSpecialOnly = process.env.CANVA_E2E_UNDO_SPECIAL_ONLY === '1';
    const outcomes = {
      desktopSync: undoSpecialOnly ? 'SKIPPED_FOCUSED_UNDO' : (process.env.CANVA_E2E_SKIP_SYNC === '1' ? 'SKIPPED_AFTER_PRODUCT_FAILURE' : await desktopSync(browser)),
      tablet: undoSpecialOnly ? 'SKIPPED_FOCUSED_UNDO' : (process.env.CANVA_E2E_SKIP_NAVIGATION === '1' ? 'SKIPPED_AFTER_PRODUCT_FAILURE' : await viewportExtended(browser, { width: 768, height: 1024 }, 'tablet')),
      mobile: undoSpecialOnly ? 'SKIPPED_FOCUSED_UNDO' : (process.env.CANVA_E2E_SKIP_NAVIGATION === '1' ? 'SKIPPED_AFTER_PRODUCT_FAILURE' : await viewportExtended(browser, { width: 390, height: 844 }, 'mobile-two-targets')),
      mobileThreeTargetsAndMedia: undoSpecialOnly ? 'SKIPPED_FOCUSED_UNDO' : (process.env.CANVA_E2E_SKIP_THREE_TARGETS === '1' ? 'SKIPPED_AFTER_PRODUCT_FAILURE' : await mobileThreeTargetsAndMedia(browser)),
      interleavedCanvaUndo: undoSpecialOnly ? 'SKIPPED_FOCUSED_UNDO' : await interleavedCanvaUndo(browser),
      undoSpecialCases: await undoSpecialCases(browser),
    };
    console.log(JSON.stringify({ outcomes, consoleErrors: externalConsole }, null, 2));
  } finally { await browser.close(); }
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
