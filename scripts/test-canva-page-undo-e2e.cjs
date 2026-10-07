const { chromium } = require('playwright');
const admin = require('../functions/node_modules/firebase-admin');
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
if (!admin.apps.length) admin.initializeApp({ projectId: 'kadosh-49600' });
const db = admin.firestore(); const eventId = 'e2e-canva-event';
const pick = (data) => ({ canva: data.canvaOutputs?.projector || null, media: data.mediaOutputs?.projector || null, memory: data.canvaPageMemory?.projector?.['id:canva-a'] ?? null });
const waitForProjectedPage = async (ref, expectedPage) => {
 for (let attempt = 0; attempt < 40; attempt += 1) {
  const data = (await ref.get()).data();
  if (data?.canvaOutputs?.projector?.page === expectedPage) return;
  await new Promise((resolve) => setTimeout(resolve, 100));
 }
 throw new Error(`Canva projector did not reach page ${expectedPage}.`);
};
(async () => {
 const browser = await chromium.launch({ headless: true }); const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }); page.setDefaultTimeout(20000);
 try {
  await page.goto('http://127.0.0.1:5174/'); await page.waitForFunction(() => !document.body.innerText.includes('Cargando Kadosh App...'));
  if (await page.locator('input[type=email]').count()) { await page.locator('input[type=email]').fill('operator-a@e2e.local'); await page.locator('input[type=password]').fill('LocalE2E-Canva-2026!'); await page.getByRole('button', { name: /Entrar a Kadosh Pro/i }).click(); }
  await page.waitForFunction(() => !document.querySelector('input[type=email]')); await page.goto(`http://127.0.0.1:5174/control-proyector/${eventId}`); await page.getByRole('button', { name: /^Canva$/i }).click();
  const ref = db.collection('eventos').doc(eventId); const before = pick((await ref.get()).data());
  const card = page.locator('button:visible').filter({ hasText: 'Canva A' }).locator('xpath=..'); await card.getByRole('button', { name: /Canva A/ }).click();
  await page.getByRole('button', { name: '2', exact: true }).last().click();
  await card.getByRole('button', { name: 'Proyectar', exact: true }).click(); const modal = page.locator('div.fixed').filter({ hasText: 'Proyectar Canva' }).last(); await modal.waitFor({ state: 'visible' });
  for (const [label, wanted] of [['Proyector', true], ['Cantantes', false], ['Músicos', false]]) { const button = modal.getByRole('button', { name: label, exact: true }); if ((await button.evaluate(x => x.classList.contains('bg-cyan-400'))) !== wanted) await button.click(); }
  const projectResponse = page.waitForResponse(r => r.url().includes('projectSavedCanva') && r.request().method() === 'POST'); await modal.getByRole('button', { name: 'Proyectar', exact: true }).click(); const project = await projectResponse; const projectedResult = (await project.json()).result; await modal.waitFor({ state: 'hidden' });
  await waitForProjectedPage(ref, 1);
  const after2 = pick((await ref.get()).data());
  const advanceOutputPage = page.locator('button:visible').filter({ hasText: /^Siguiente →$/ }).first();
  await advanceOutputPage.click();
  await waitForProjectedPage(ref, 2);
  await advanceOutputPage.click();
  await waitForProjectedPage(ref, 3);
  const after3 = pick((await ref.get()).data()); const operationRef = ref.collection('undoOperations').doc(projectedResult.operationId); const operationBeforeUndo = (await operationRef.get()).data();
  const undoResponse = page.waitForResponse(r => r.url().includes('restoreProjectionUndo') && r.request().method() === 'POST'); await page.getByRole('button', { name: /Deshacer/i }).click(); const undoHttp = await undoResponse; const undo = (await undoHttp.json()).result; await page.waitForTimeout(300); const afterUndo = pick((await ref.get()).data()); const operationAfterUndo = (await operationRef.get()).data();
  if (after3.canva?.page !== 3 || after3.canva?.projectionOperationId !== projectedResult.operationId || afterUndo.media?.mediaId !== 'video-a' || afterUndo.memory !== 3 || undo.status !== 'restored') throw new Error(JSON.stringify({ after3, afterUndo, undo }));
  console.log(JSON.stringify({ before, afterProjectionPage1: after2, operationId: projectedResult.operationId, afterPage3: after3, undoHttp: undoHttp.status(), undo, afterUndo, undoOperation: { status: operationAfterUndo.status, outcome: operationAfterUndo.outcome }, expectedAfter: operationBeforeUndo.groups.route_projector.expectedAfter, visible: (await page.locator('body').innerText()).match(/No se restauraron[^\n]*/)?.[0] || null }, null, 2));
 } finally { await browser.close(); }
})().catch(e => { console.error(e.stack || e); process.exitCode = 1; });
