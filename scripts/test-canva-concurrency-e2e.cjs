const { chromium } = require('playwright');
const admin = require('../functions/node_modules/firebase-admin');
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
if (!admin.apps.length) admin.initializeApp({ projectId: 'kadosh-49600' });
const db = admin.firestore();
const eventId = 'e2e-canva-event';
const login = { a: 'operator-a@e2e.local', b: 'operator-b@e2e.local' };
const password = 'LocalE2E-Canva-2026!';
const targets = ['projector', 'singers', 'musicians'];
const labels = { projector: 'Proyector', singers: 'Cantantes', musicians: 'Músicos' };
const cardFor = (page, title) => page.locator('button:visible').filter({ hasText: title }).locator('xpath=..');

async function open(page, operator) {
  await page.goto('http://127.0.0.1:5174/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !document.body.innerText.includes('Cargando Kadosh App...'));
  if (await page.locator('input[type=email]').count()) {
    await page.locator('input[type=email]').fill(login[operator]);
    await page.locator('input[type=password]').fill(password);
    await page.getByRole('button', { name: /Entrar a Kadosh Pro/i }).click();
  }
  await page.waitForFunction(() => !document.querySelector('input[type=email]'));
  await page.goto(`http://127.0.0.1:5174/control-proyector/${eventId}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /^Canva$/i }).click();
}
async function project(page, title, selected) {
  const card = cardFor(page, title);
  await card.getByRole('button', { name: 'Proyectar', exact: true }).click();
  const modal = page.locator('div.fixed').filter({ hasText: 'Proyectar Canva' }).last();
  await modal.waitFor({ state: 'visible' });
  for (const target of targets) { const b = modal.getByRole('button', { name: labels[target], exact: true }); if ((await b.evaluate(x => x.classList.contains('bg-cyan-400'))) !== selected.includes(target)) await b.click(); }
  const response = page.waitForResponse(r => r.request().method() === 'POST' && r.url().includes('projectSavedCanva'));
  await modal.getByRole('button', { name: 'Proyectar', exact: true }).click();
  const result = await (await response).json(); if (!result?.result?.ok) throw new Error(JSON.stringify(result)); await modal.waitFor({ state: 'hidden' }); return result.result;
}
async function projectTemporary(page, selected) {
  await page.getByRole('button', { name: /Nueva/i }).first().click();
  const modal = page.locator('div.fixed').filter({ hasText: /Nueva presentaci/i }).last();
  await modal.waitFor({ state: 'visible' });
  const fields = modal.locator('input');
  await fields.nth(0).fill('Temporal concurrencia');
  await fields.nth(1).fill('https://www.canva.com/design/concurrency-temporary/view');
  await fields.nth(2).fill('3');
  for (const target of targets) {
    const button = modal.getByRole('button', { name: labels[target], exact: true });
    if ((await button.evaluate((node) => node.classList.contains('bg-cyan-400'))) !== selected.includes(target)) await button.click();
  }
  const response = page.waitForResponse((request) => request.request().method() === 'POST' && request.url().includes('projectTemporaryCanva'));
  await modal.getByRole('button', { name: 'Proyectar', exact: true }).click();
  const result = await (await response).json();
  if (!result?.result?.ok) throw new Error(JSON.stringify(result));
  if (await modal.getByRole('button', { name: 'Cerrar', exact: true }).count()) await modal.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await modal.waitFor({ state: 'hidden' });
  return result.result;
}
(async () => {
  const browser = await chromium.launch({ headless: true }); const aCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const bCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const a = await aCtx.newPage(); const b = await bCtx.newPage();
  try {
    await Promise.all([open(a, 'a'), open(b, 'b')]);
    await project(a, 'Canva A', ['projector', 'singers']); await project(b, 'Canva B', ['singers']);
    const undoResponse = a.waitForResponse(r => r.request().method() === 'POST' && r.url().includes('restoreProjectionUndo')); await a.getByRole('button', { name: /Deshacer/i }).click(); const undo = await (await undoResponse).json();
    const event = (await db.collection('eventos').doc(eventId).get()).data(); const message = await a.locator('body').innerText();
    if (undo.result?.status !== 'partial' || event.canvaOutputs?.projector || event.canvaOutputs?.singers?.presentationId !== 'canva-b') throw new Error(JSON.stringify({ undo, event }));
    await db.collection('eventos').doc(eventId).update({ canvaOutputs: {}, canvaPageMemory: {} });
    await a.reload(); await b.reload(); await a.getByRole('button', { name: /^Canva$/i }).click(); await b.getByRole('button', { name: /^Canva$/i }).click();
    await project(a, 'Canva A', ['projector']); await project(b, 'Canva B', ['projector']);
    const skippedResponse = a.waitForResponse(r => r.request().method() === 'POST' && r.url().includes('restoreProjectionUndo')); await a.getByRole('button', { name: /Deshacer/i }).click(); const skipped = await (await skippedResponse).json();
    const skippedEvent = (await db.collection('eventos').doc(eventId).get()).data(); const skippedMessage = await a.locator('body').innerText();
    if (skipped.result?.status !== 'skipped' || skippedEvent.canvaOutputs?.projector?.presentationId !== 'canva-b') throw new Error(JSON.stringify({ skipped, skippedEvent }));
    await db.collection('eventos').doc(eventId).update({ canvaOutputs: {}, canvaPageMemory: {} });
    await a.reload(); await b.reload(); await a.getByRole('button', { name: /^Canva$/i }).click(); await b.getByRole('button', { name: /^Canva$/i }).click();
    const sameCanvaX = await project(a, 'Canva A', ['projector']);
    const sameCanvaY = await project(b, 'Canva A', ['projector']);
    if (sameCanvaX.operationId === sameCanvaY.operationId) throw new Error('La reproyección deliberada reutilizó la identidad de instancia.');
    const sameCanvaUndoResponse = a.waitForResponse(r => r.request().method() === 'POST' && r.url().includes('restoreProjectionUndo'));
    await a.getByRole('button', { name: /Deshacer/i }).click();
    const sameCanvaUndo = await (await sameCanvaUndoResponse).json();
    const sameCanvaEvent = (await db.collection('eventos').doc(eventId).get()).data();
    if (sameCanvaUndo.result?.status !== 'skipped' || sameCanvaEvent.canvaOutputs?.projector?.projectionOperationId !== sameCanvaY.operationId) {
      throw new Error(JSON.stringify({ sameCanvaUndo, sameCanvaEvent }));
    }
    await db.collection('eventos').doc(eventId).update({
      canvaOutputs: {},
      canvaPageMemory: {},
      mediaOutputs: {
        projector: { active: true, mediaId: 'video-a' },
        singers: { active: true, mediaId: 'video-singers' },
        musicians: { active: true, mediaId: 'video-musicians' },
      },
    });
    await a.reload(); await b.reload(); await a.getByRole('button', { name: /^Canva$/i }).click(); await b.getByRole('button', { name: /^Canva$/i }).click();
    const temporaryX = await projectTemporary(a, ['projector', 'singers']);
    const temporaryY = await projectTemporary(b, ['singers']);
    const temporaryPartialResponse = a.waitForResponse((request) => request.request().method() === 'POST' && request.url().includes('restoreProjectionUndo'));
    await a.getByRole('button', { name: /Deshacer/i }).click();
    const temporaryPartial = await (await temporaryPartialResponse).json();
    const temporaryPartialEvent = (await db.collection('eventos').doc(eventId).get()).data();
    if (temporaryPartial.result?.status !== 'partial'
      || temporaryPartialEvent.mediaOutputs?.projector?.mediaId !== 'video-a'
      || temporaryPartialEvent.canvaOutputs?.singers?.projectionOperationId !== temporaryY.operationId) {
      throw new Error(JSON.stringify({ temporaryPartial, temporaryPartialEvent }));
    }
    await a.getByText('Se deshizo en algunas pantallas; otras cambiaron despu\u00e9s.', { exact: true }).waitFor({ state: 'visible' });
    await db.collection('eventos').doc(eventId).update({ canvaOutputs: {}, canvaPageMemory: {} });
    await a.reload(); await b.reload(); await a.getByRole('button', { name: /^Canva$/i }).click(); await b.getByRole('button', { name: /^Canva$/i }).click();
    const temporaryReplaceX = await projectTemporary(a, ['projector']);
    const temporaryReplaceY = await projectTemporary(b, ['projector']);
    const temporarySkippedResponse = a.waitForResponse((request) => request.request().method() === 'POST' && request.url().includes('restoreProjectionUndo'));
    await a.getByRole('button', { name: /Deshacer/i }).click();
    const temporarySkipped = await (await temporarySkippedResponse).json();
    const temporarySkippedEvent = (await db.collection('eventos').doc(eventId).get()).data();
    if (temporarySkipped.result?.status !== 'skipped' || temporarySkippedEvent.canvaOutputs?.projector?.projectionOperationId !== temporaryReplaceY.operationId) {
      throw new Error(JSON.stringify({ temporarySkipped, temporarySkippedEvent, temporaryReplaceX }));
    }
    await a.getByText('No se deshizo porque esa pantalla ya cambi\u00f3.', { exact: true }).waitFor({ state: 'visible' });
    console.log(JSON.stringify({ partial: undo.result, partialMessage: message.includes('No se restauraron'), skipped: skipped.result, skippedMessage: skippedMessage.includes('No se restauraron'), sameCanvaReprojection: sameCanvaUndo.result, temporaryPartial: temporaryPartial.result, temporarySkipped: temporarySkipped.result }, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e.stack || e); process.exitCode = 1; });
