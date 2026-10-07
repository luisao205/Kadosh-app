const { chromium } = require('playwright');
const admin = require('../functions/node_modules/firebase-admin');

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
if (!admin.apps.length) admin.initializeApp({ projectId: 'kadosh-49600' });

const EMAIL = 'operator-a@e2e.local';
const PASSWORD = 'LocalE2E-Canva-2026!';
const EVENT_ID = 'e2e-canva-event';

const savedCanvaCard = (page, title) => page
  .locator('button:visible')
  .filter({ hasText: title })
  .locator('xpath=..');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.setDefaultTimeout(15_000);

    await page.goto('http://127.0.0.1:5174/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Entrar a Kadosh Pro/i }).waitFor();
    await page.locator('input[type="email"]').fill(EMAIL);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole('button', { name: /Entrar a Kadosh Pro/i }).click();
    await page.waitForFunction(() => !document.querySelector('input[type="email"]'));

    await page.goto(`http://127.0.0.1:5174/control-proyector/${EVENT_ID}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /^Canva$/i }).click();

    const card = savedCanvaCard(page, 'Canva A');
    await card.getByRole('button', { name: 'Pantallas / Proyectar' }).click();

    // The mobile editor is intentionally not a role=dialog portal. Its visible
    // project action is unique after opening Canva A's card.
    const modal = page.locator('div.fixed').filter({ hasText: 'Editar Canva' }).last();
    const targetIsSelected = async (name) => modal.getByRole('button', { name, exact: true })
      .evaluate((button) => button.classList.contains('bg-cyan-400'));
    if (!await targetIsSelected('Proyector')) await modal.getByRole('button', { name: 'Proyector', exact: true }).click();
    for (const target of ['Cantantes', 'Músicos']) {
      if (await targetIsSelected(target)) await modal.getByRole('button', { name: target, exact: true }).click();
    }
    const projectResponse = page.waitForResponse((response) =>
      response.request().method() === 'POST' && response.url().includes('projectSavedCanva')
    );
    await modal.getByRole('button', { name: 'Proyectar', exact: true }).click();
    const response = await projectResponse;
    const payload = await response.json();
    if (response.status() !== 200 || !payload?.result?.ok || !payload.result.operationId) {
      throw new Error(`Proyección móvil fallida: ${response.status()} ${JSON.stringify(payload)}`);
    }

    await modal.waitFor({ state: 'hidden' });
    const eventRef = admin.firestore().collection('eventos').doc(EVENT_ID);
    const projected = (await eventRef.get()).data();
    if (projected.canvaOutputs?.projector?.presentationId !== 'canva-a' || projected.mediaOutputs?.projector !== undefined) {
      throw new Error('La salida móvil no quedó en Canva A para Proyector.');
    }

    const undoResponse = page.waitForResponse((candidate) =>
      candidate.request().method() === 'POST' && candidate.url().includes('restoreProjectionUndo')
    );
    await page.getByRole('button', { name: /Deshacer/i }).click();
    const undo = await undoResponse;
    const undoPayload = await undo.json();
    const restored = (await eventRef.get()).data();
    if (undo.status() !== 200 || !undoPayload?.result?.ok || restored.mediaOutputs?.projector?.mediaId !== 'video-a'
      || restored.canvaOutputs?.projector !== undefined) {
      throw new Error(`Deshacer móvil falló: ${undo.status()} ${JSON.stringify(undoPayload)}`);
    }

    console.log(JSON.stringify({ mobileProjectionUndo: 'OK', operationId: payload.result.operationId }, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
