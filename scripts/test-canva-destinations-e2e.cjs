const { chromium } = require('playwright');
const admin = require('../functions/node_modules/firebase-admin');

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
if (!admin.apps.length) admin.initializeApp({ projectId: 'kadosh-49600' });

const db = admin.firestore();
const EVENT_ID = 'e2e-canva-event';
const EMAIL = 'operator-a@e2e.local';
const PASSWORD = 'LocalE2E-Canva-2026!';
const allTargets = ['projector', 'singers', 'musicians'];
const labels = { projector: 'Proyector', singers: 'Cantantes', musicians: 'Músicos' };
const defaultTargets = { projector: true, singers: true, musicians: false };

const mediaOutput = (id, title) => ({
  active: true,
  mediaKey: id,
  mediaId: id,
  name: title,
  url: `https://example.test/${id}.mp4`,
  type: 'video',
  mode: 'foreground',
  playing: true,
  volume: 0.8,
  loop: true,
  updatedAt: 1735689600000,
  updatedBy: 'E2E seed'
});

const initialMediaOutputs = () => ({
  projector: mediaOutput('video-a', 'Video A'),
  singers: mediaOutput('video-singers', 'Video Cantantes'),
  musicians: mediaOutput('video-musicians', 'Video Músicos')
});

const resetFixture = async () => {
  const eventRef = db.collection('eventos').doc(EVENT_ID);
  const operations = await eventRef.collection('undoOperations').get();
  await Promise.all(operations.docs.map((item) => item.ref.delete()));
  await Promise.all([
    eventRef.update({ canvaOutputs: {}, mediaOutputs: initialMediaOutputs(), canvaPageMemory: {} }),
    db.collection('canvaPresentations').doc('canva-a').update({ defaultTargets }),
  ]);
};

const signIn = async (page) => {
  await page.goto('http://127.0.0.1:5174/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !document.body.innerText.includes('Cargando Kadosh App...'), null, { timeout: 30_000 });
  if (await page.locator('input[type=email]').count()) {
    await page.getByRole('button', { name: /Entrar a Kadosh Pro/i }).waitFor();
    await page.locator('input[type=email]').fill(EMAIL);
    await page.locator('input[type=password]').fill(PASSWORD);
    await page.getByRole('button', { name: /Entrar a Kadosh Pro/i }).click();
  }
  await page.waitForFunction(() => !document.querySelector('input[type=email]'), null, { timeout: 30_000 });
  await page.goto(`http://127.0.0.1:5174/control-proyector/${EVENT_ID}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /^Canva$/i }).click();
};

const projectSavedCanvaDesktop = async (page, targets, assertInitialTargets) => {
  const card = page.locator('button:visible').filter({ hasText: 'Canva A' }).locator('xpath=..');
  await card.getByRole('button', { name: 'Proyectar', exact: true }).click();
  const selector = page.locator('div.fixed').filter({ hasText: 'Proyectar Canva' }).last();
  await selector.waitFor({ state: 'visible' });
  for (const target of allTargets) {
    const button = selector.getByRole('button', { name: labels[target], exact: true });
    const selected = await button.evaluate((item) => item.classList.contains('bg-cyan-400'));
    if (assertInitialTargets && selected !== Boolean(defaultTargets[target])) throw new Error(`${target} no inició con defaultTargets`);
    if (selected !== targets.includes(target)) await button.click();
  }
  const responsePromise = page.waitForResponse((response) => (
    response.request().method() === 'POST' && response.url().includes('projectSavedCanva')
  ));
  await selector.getByRole('button', { name: 'Proyectar', exact: true }).click();
  const response = await responsePromise;
  const responsePayload = await response.json();
  const rawRequest = response.request().postData();
  const requestPayload = rawRequest ? JSON.parse(rawRequest) : null;
  if (response.status() !== 200 || !responsePayload?.result?.ok) throw new Error(`callable inválido: ${JSON.stringify(responsePayload)}`);
  if (JSON.stringify(requestPayload?.data?.destinations) !== JSON.stringify(targets)) throw new Error(`destinations incorrectos: ${JSON.stringify(requestPayload)}`);
  await selector.waitFor({ state: 'hidden' });
  return responsePayload.result;
};

const assertProjection = async (targets) => {
  const event = (await db.collection('eventos').doc(EVENT_ID).get()).data();
  const saved = (await db.collection('canvaPresentations').doc('canva-a').get()).data();
  if (JSON.stringify(saved.defaultTargets) !== JSON.stringify(defaultTargets)) throw new Error(`defaultTargets fue modificado: ${JSON.stringify(saved.defaultTargets)}`);
  for (const target of allTargets) {
    const selected = targets.includes(target);
    if (selected && event.canvaOutputs?.[target]?.presentationId !== 'canva-a') throw new Error(`${target} no recibió Canva A`);
    if (selected && event.mediaOutputs?.[target] !== undefined) throw new Error(`${target} conservó multimedia`);
    if (!selected && event.canvaOutputs?.[target] !== undefined) throw new Error(`${target} recibió Canva sin ser seleccionado`);
    if (!selected && event.mediaOutputs?.[target]?.mediaId !== initialMediaOutputs()[target].mediaId) throw new Error(`${target} fue alterado`);
  }
};

const undoProjection = async (page, targets) => {
  const responsePromise = page.waitForResponse((response) => (
    response.request().method() === 'POST' && response.url().includes('restoreProjectionUndo')
  ));
  await page.getByRole('button', { name: /Deshacer/i }).click();
  const response = await responsePromise;
  const payload = await response.json();
  if (!payload?.result?.ok || payload.result.status !== 'restored') throw new Error(`undo inválido: ${JSON.stringify(payload)}`);
  const event = (await db.collection('eventos').doc(EVENT_ID).get()).data();
  for (const target of allTargets) {
    if (targets.includes(target) && event.canvaOutputs?.[target] !== undefined) throw new Error(`${target} no fue restaurado`);
    if (event.mediaOutputs?.[target]?.mediaId !== initialMediaOutputs()[target].mediaId) throw new Error(`${target} no recuperó su multimedia original`);
  }
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const outcomes = [];
  try {
    const combinations = [
      ['projector'], ['singers'], ['musicians'], ['projector', 'singers'],
      ['projector', 'musicians'], ['singers', 'musicians'], allTargets,
    ];
    for (const [index, targets] of combinations.entries()) {
      await resetFixture();
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      page.setDefaultTimeout(15_000);
      await signIn(page);
      const operation = await projectSavedCanvaDesktop(page, targets, index === 0);
      await assertProjection(targets);
      await undoProjection(page, targets);
      outcomes.push({ targets, operationId: operation.operationId, status: 'restored' });
      await page.close();
    }
    console.log(JSON.stringify({ destinations: 'OK', outcomes }, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
