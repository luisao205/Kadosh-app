const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const admin = require('../functions/node_modules/firebase-admin');

process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
if (!admin.apps.length) admin.initializeApp({ projectId: 'kadosh-49600' });

const db = admin.firestore();
const eventId = 'e2e-canva-event';
const waitFor = async (predicate, label) => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const value = await predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timeout: ${label}`);
};

(async () => {
  const eventRef = db.collection('eventos').doc(eventId);
  await eventRef.update({
    projectorState: {
      type: 'canva',
      contentType: 'canva',
      previousProjectorState: { type: 'lyrics', contentType: 'lyrics', media: null, background: null, backgroundMedia: null }
    },
    proyectorSlide: null,
    proyectorMedia: null,
    proyectorLogo: false,
    proyectorApagado: false,
    proyectorFondo: null,
    proyectorFondoMedia: null,
    proyectorSongId: null,
    proyectorSlideIndex: -1,
    proyectorNextSlide: null,
    proyectorNextSong: null,
    proyectorOffset: 0,
    liveState: {},
    currentSongId: null,
    canvaOutputs: {},
    mediaOutputs: {},
    canvaPageMemory: {}
  });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(20000);
  const requests = [];
  const responses = [];
  const consoleErrors = [];
  page.on('request', (request) => {
    if (request.url().includes('projectSavedCanva') && request.method() === 'POST') requests.push(request);
  });
  page.on('response', async (response) => {
    if (response.url().includes('projectSavedCanva') && response.request().method() === 'POST') {
      responses.push({ status: response.status(), body: await response.text() });
    }
  });
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  try {
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

    const card = page.locator('button:visible').filter({ hasText: 'Canva A' }).locator('xpath=..');
    await card.getByRole('button', { name: /Canva A/ }).click();
    await card.getByRole('button', { name: 'Proyectar', exact: true }).click();
    const modal = page.locator('div.fixed').filter({ hasText: 'Proyectar Canva' }).last();
    await modal.waitFor({ state: 'visible' });
    for (const [label, wanted] of [['Proyector', false], ['Cantantes', false], ['Músicos', true]]) {
      const button = modal.getByRole('button', { name: label, exact: true });
      if ((await button.evaluate((element) => element.classList.contains('bg-cyan-400'))) !== wanted) await button.click();
    }
    await modal.getByRole('button', { name: 'Proyectar', exact: true }).click();

    let event;
    try {
      event = await waitFor(async () => {
        const data = (await eventRef.get()).data();
        return data?.canvaOutputs?.musicians?.projectionOperationId ? data : null;
      }, 'fallback saved Canva moderno');
    } catch (error) {
      const current = (await eventRef.get()).data();
      throw new Error(`${error.message}\n${JSON.stringify({ requests: requests.length, responses, consoleErrors, current }, null, 2)}`);
    }
    assert.equal(event.projectorState.contentType, 'lyrics');
    assert.equal(event.canvaOutputs.musicians.presentationId, 'canva-a');
    assert.equal(event.canvaOutputs.projector, undefined);
    assert.equal(event.canvaOutputs.musicians.projectionOperationId.length > 0, true);
    await waitFor(() => requests.length === 2, 'dos llamadas projectSavedCanva');
    const payloads = requests.map((request) => JSON.parse(request.postData()).data);
    assert.equal(payloads[0].requestId, payloads[1].requestId);
    assert.deepEqual(payloads.map((payload) => payload.destinations), [['musicians'], ['musicians']]);

    await page.getByRole('button', { name: /Deshacer/i }).click();
    const afterUndo = await waitFor(async () => {
      const data = (await eventRef.get()).data();
      return !data?.canvaOutputs?.musicians ? data : null;
    }, 'undo fallback saved Canva');
    assert.equal(afterUndo.projectorState.contentType, 'lyrics');
    console.log('canva legacy fallback e2e: OK');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
