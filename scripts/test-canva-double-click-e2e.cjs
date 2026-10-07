const { chromium } = require('playwright');
const admin = require('../functions/node_modules/firebase-admin');

process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
if (!admin.apps.length) admin.initializeApp({ projectId: 'kadosh-49600' });

const db = admin.firestore();
const eventId = 'e2e-canva-event';
const email = 'operator-a@e2e.local';
const password = 'LocalE2E-Canva-2026!';

const clearOperations = async () => {
  const eventRef = db.collection('eventos').doc(eventId);
  const operations = await eventRef.collection('undoOperations').get();
  await Promise.all(operations.docs.map((operation) => operation.ref.delete()));
  await eventRef.update({ canvaOutputs: {}, canvaPageMemory: {} });
};

const openCanva = async (page) => {
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

const openProjection = async (page) => {
  const card = page.locator('button:visible').filter({ hasText: 'Canva A' }).locator('xpath=..');
  await card.getByRole('button', { name: 'Proyectar', exact: true }).click();
  const modal = page.locator('div.fixed').filter({ hasText: 'Proyectar Canva' }).last();
  await modal.waitFor({ state: 'visible' });
  return modal;
};

const waitForCallable = (page) => page.waitForResponse((response) => (
  response.request().method() === 'POST' && response.url().includes('projectSavedCanva')
));

(async () => {
  await clearOperations();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(20_000);
  try {
    await openCanva(page);
    const pendingModal = await openProjection(page);
    const firstResponse = waitForCallable(page);
    await pendingModal.getByRole('button', { name: 'Proyectar', exact: true }).dblclick({ delay: 0 });
    const firstResult = (await (await firstResponse).json()).result;
    await pendingModal.waitFor({ state: 'hidden' });
    const firstOperations = await db.collection('eventos').doc(eventId).collection('undoOperations').get();
    if (!firstResult?.ok || firstOperations.size !== 1) {
      throw new Error(JSON.stringify({ firstResult, operationCount: firstOperations.size }));
    }

    const deliberateModal = await openProjection(page);
    const secondResponse = waitForCallable(page);
    await deliberateModal.getByRole('button', { name: 'Proyectar', exact: true }).click();
    const secondResult = (await (await secondResponse).json()).result;
    await deliberateModal.waitFor({ state: 'hidden' });
    const secondOperations = await db.collection('eventos').doc(eventId).collection('undoOperations').get();
    if (!secondResult?.ok || secondResult.operationId === firstResult.operationId || secondOperations.size !== 2) {
      throw new Error(JSON.stringify({ firstResult, secondResult, operationCount: secondOperations.size }));
    }
    console.log(JSON.stringify({
      pendingDoubleClick: { operationId: firstResult.operationId, operations: firstOperations.size },
      deliberateSecondClick: { operationId: secondResult.operationId, operations: secondOperations.size }
    }, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
