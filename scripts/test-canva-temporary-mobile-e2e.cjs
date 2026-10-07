const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const admin = require('../functions/node_modules/firebase-admin');

process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
if (!admin.apps.length) admin.initializeApp({ projectId: 'kadosh-49600' });

const db = admin.firestore();
const eventId = 'e2e-canva-event';
const temporaryUrl = 'https://www.canva.com/design/temporary-mobile/view';
const desktop = process.env.CANVA_E2E_DESKTOP === '1';
const targetIds = (process.env.CANVA_E2E_TARGETS || 'projector').split(',').filter(Boolean);
const targetLabels = { projector: 'Proyector', singers: 'Cantantes', musicians: 'Músicos' };
if (!targetIds.length || targetIds.some((targetId) => !targetLabels[targetId])) {
  throw new Error('CANVA_E2E_TARGETS must contain projector, singers, and/or musicians.');
}
const waitFor = async (predicate, label) => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const value = await predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timeout: ${label}`);
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: desktop ? { width: 1440, height: 900 } : { width: 390, height: 844 } });
  page.setDefaultTimeout(20000);
  const eventRef = db.collection('eventos').doc(eventId);
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  try {
    const before = (await eventRef.get()).data();
    await page.goto('http://127.0.0.1:5174/');
    await page.waitForFunction(() => !document.body.innerText.includes('Cargando Kadosh App...'));
    if (await page.locator('input[type=email]').count()) {
      await page.locator('input[type=email]').fill('operator-a@e2e.local');
      await page.locator('input[type=password]').fill('LocalE2E-Canva-2026!');
      await page.getByRole('button', { name: /Entrar a Kadosh Pro/i }).click();
    }
    await page.waitForFunction(() => !document.querySelector('input[type=email]'));
    await page.goto(`http://127.0.0.1:5174/control-proyector/${eventId}`);
    await page.getByRole('button', { name: /^Canva$/i }).click();
    await page.getByRole('button', { name: /Nueva/i }).first().click();

    const editor = page.locator('div.fixed').filter({ hasText: 'Nueva presentación' }).last();
    await editor.waitFor({ state: 'visible' });
    const inputs = editor.locator('input');
    await inputs.nth(0).fill('Temporal móvil');
    await inputs.nth(1).fill(temporaryUrl);
    await inputs.nth(2).fill('3');
    if (!targetIds.includes('projector')) {
      await editor.getByRole('button', { name: targetLabels.projector, exact: true }).click();
    }
    for (const targetId of targetIds) {
      if (targetId !== 'projector') {
        await editor.getByRole('button', { name: targetLabels[targetId], exact: true }).click();
      }
    }
    await editor.getByRole('button', { name: 'Proyectar', exact: true }).click();

    let temporary;
    try {
      temporary = await waitFor(async () => {
        const data = (await eventRef.get()).data();
        return targetIds.every((targetId) => data?.canvaOutputs?.[targetId]?.presentationId === '') ? data : null;
      }, 'ruta temporal');
    } catch (error) {
      throw new Error(`${error.message}\n${JSON.stringify({ consoleErrors, current: (await eventRef.get()).data() }, null, 2)}`);
    }
    const temporaryRoutes = Object.fromEntries(targetIds.map((targetId) => [targetId, temporary.canvaOutputs[targetId]]));
    for (const temporaryRoute of Object.values(temporaryRoutes)) {
      assert.equal(typeof temporaryRoute.projectionOperationId, 'string');
      assert.equal(temporaryRoute.embedUrl, `${temporaryUrl}?embed#1`);
    }
    for (const targetId of targetIds) assert.equal(temporary.mediaOutputs?.[targetId], undefined);
    for (const targetId of Object.keys(targetLabels).filter((targetId) => !targetIds.includes(targetId))) {
      assert.ok(temporary.mediaOutputs?.[targetId], `${targetId} media route remains intact: ${JSON.stringify(temporary.mediaOutputs)}`);
    }
    if (await editor.getByRole('button', { name: 'Cerrar', exact: true }).count()) await editor.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await editor.waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: /Deshacer/i }).click();
    const restored = await waitFor(async () => {
      const data = (await eventRef.get()).data();
      return targetIds.every((targetId) => data?.mediaOutputs?.[targetId]?.mediaId === before?.mediaOutputs?.[targetId]?.mediaId) ? data : null;
    }, 'undo restaura media');
    for (const targetId of targetIds) {
      assert.deepEqual(restored.mediaOutputs[targetId], before.mediaOutputs[targetId]);
      assert.equal(restored.canvaOutputs?.[targetId], undefined);
    }
    await page.getByText('\u00daltimo env\u00edo deshecho.', { exact: true }).waitFor({ state: 'visible' });
    console.log(`canva temporary ${desktop ? 'desktop' : 'mobile'} ${targetIds.join('+')} undo e2e: OK`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
