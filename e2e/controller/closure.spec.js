import { expect } from '@playwright/test';
import { allowExpectedConsoleError, test, CONTROLLER_EVENT_ID, login, USERS } from '../fixtures/app.js';
import {
  readCanvaE2EEvent,
  readE2EUserProfile,
  readFirestoreDocument,
  resetCanvaE2EEvent,
  resetControllerE2EEvent,
  restoreE2EUserProfile,
  updateControllerE2EEvent,
  updateE2EUserProfile,
} from '../helpers/firestoreAdmin.js';

const controllerPath = `/control-proyector/${CONTROLLER_EVENT_ID}`;
const projectorPath = `/proyector/${CONTROLLER_EVENT_ID}`;
const singersPath = `/retorno/${CONTROLLER_EVENT_ID}`;
const musiciansPath = `/retorno-musicos/${CONTROLLER_EVENT_ID}`;
const CANVA_EVENT_ID = 'e2e-canva-event';
const canvaControllerPath = `/control-proyector/${CANVA_EVENT_ID}`;
const CANVA_EMBED_ORIGIN = 'https://www.canva.com';

const imageUrl = (color) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="100%" height="100%" fill="${color}"/></svg>`)}`;

const mediaRoute = (id, sessionId = `session-${id}`) => ({
  active: true,
  mediaKey: id,
  mediaId: id,
  name: `E2E ${id}`,
  url: imageUrl(id === 'a' ? '#1e1b4b' : '#164e63'),
  type: 'image',
  mode: 'foreground',
  sessionId,
  positionSec: 4,
  anchorAt: Date.now(),
  syncVersion: 1,
  playing: true,
  volume: 0,
  loop: false,
  updatedAt: Date.now(),
  updatedBy: 'E2E closure',
});

const videoRoute = (id, sessionId = `session-${id}`) => ({
  ...mediaRoute(id, sessionId),
  url: 'data:video/mp4;base64,AAAA',
  type: 'video',
});

const canvaRoute = (title, page = 1) => ({
  active: true,
  title,
  sourceUrl: `data:text/html,${encodeURIComponent(`<h1>${title}</h1>`)}`,
  embedUrl: `data:text/html,${encodeURIComponent(`<h1>${title} pagina ${page}</h1>`)}`,
  page,
  pageCount: 3,
  projectionOperationId: `closure-${title}-${page}`,
  updatedAt: Date.now(),
  updatedBy: 'E2E closure',
});

const bibleState = () => ({
  type: 'preaching', contentType: 'bible', preachingType: 'bible',
  title: 'Juan 11:35', reference: 'Juan 11:35', translation: 'RVR60',
  content: 'Jesús lloró.', bibleSlideIndex: 0,
  bible: { slideIndex: 0, slides: [{ reference: 'Juan 11:35', text: 'Jesús lloró.', translation: 'RVR60' }] },
  media: null, background: null, backgroundMedia: null, updatedAt: Date.now(),
});

async function openOutput(browser, path, { mockCanva = false } = {}) {
  const context = await browser.newContext();
  const canva403Responses = new Set();
  if (mockCanva) {
    await context.route(`${CANVA_EMBED_ORIGIN}/**`, (route) => route.fulfill({
      status: 403,
      contentType: 'text/html',
      body: '<!doctype html><title>Canva embed blocked in local E2E</title>',
    }));
  }
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console.error: ${message.text()}`);
  });
  page.on('response', (response) => {
    if (response.status() === 403 && response.url().startsWith(`${CANVA_EMBED_ORIGIN}/`)) {
      canva403Responses.add(response.url());
    }
  });
  await login(page, USERS.multimedia);
  await page.goto(path);
  return { context, page, errors, canva403Responses };
}

async function openSavedCanvaProjection(page, destinations) {
  await page.getByRole('button', { name: 'Canva', exact: true }).click();
  const card = page.locator('button:visible').filter({ hasText: 'Canva A' }).locator('xpath=..');
  await card.getByRole('button', { name: 'Proyectar', exact: true }).click();
  const modal = page.locator('div.fixed').filter({ hasText: 'Proyectar Canva' }).last();
  await expect(modal).toBeVisible();
  for (const [id, label] of Object.entries({ projector: 'Proyector', singers: 'Cantantes', musicians: 'Músicos' })) {
    const target = modal.getByRole('button', { name: label, exact: true });
    const selected = await target.evaluate((element) => element.classList.contains('bg-cyan-400'));
    if (selected !== destinations.includes(id)) await target.click();
  }
  const response = page.waitForResponse((item) => item.request().method() === 'POST' && item.url().includes('projectSavedCanva'));
  await modal.getByRole('button', { name: 'Proyectar', exact: true }).click();
  const payload = await (await response).json();
  expect(payload.result?.ok).toBe(true);
  await expect(modal).toBeHidden();
  return payload.result.operationId;
}

test.describe.serial('Cierre visual Controller', () => {
  let originalController;
  let originalCanva;
  let originalMultimedia;

  test.beforeAll(async () => {
    [originalController, originalCanva, originalMultimedia] = await Promise.all([
      readFirestoreDocument('eventos', CONTROLLER_EVENT_ID),
      readCanvaE2EEvent(),
      readE2EUserProfile('e2e-multimedia'),
    ]);
  });

  test.afterEach(async () => {
    await Promise.all([
      resetControllerE2EEvent(originalController),
      resetCanvaE2EEvent(originalCanva),
      restoreE2EUserProfile('e2e-multimedia', originalMultimedia),
    ]);
  });

  test('CG-LIVE-001 through CG-LIVE-004 render one, two, three outputs and prioritize PANIC without legacy controls', async ({ page }) => {
    await login(page, USERS.multimedia);
    await page.goto(controllerPath);
    await updateControllerE2EEvent({
      proyectorApagado: false,
      mediaOutputs: { projector: mediaRoute('a') }, canvaOutputs: {},
      projectionTargets: { projector: true, singers: false, musicians: false },
    });
    await expect(page.locator('article').filter({ hasText: 'E2E a' })).toHaveCount(1);
    await updateControllerE2EEvent({ mediaOutputs: { projector: mediaRoute('a'), singers: mediaRoute('b') } });
    await expect(page.locator('article').filter({ hasText: /E2E [ab]/ })).toHaveCount(2);
    await updateControllerE2EEvent({
      mediaOutputs: { projector: mediaRoute('a'), singers: mediaRoute('b') },
      canvaOutputs: { musicians: canvaRoute('Canva monitor', 2) },
    });
    await expect(page.locator('article')).toHaveCount(3);
    await expect(page.getByText('PROYECTANDO VIDEO', { exact: true })).toHaveCount(0);
    await expect(page.getByText('QUITAR MULTIMEDIA', { exact: true })).toHaveCount(0);
    await updateControllerE2EEvent({ proyectorApagado: true });
    await expect(page.getByText('Pantalla negra', { exact: true })).toHaveCount(3);
  });

  test('CG-PANIC-LYRICS-001, CG-PANIC-BIBLE-001, and CG-PANIC-CANVA-001 restore exact visual state', async ({ page, browser }) => {
    const output = await openOutput(browser, projectorPath);
    try {
      await login(page, USERS.multimedia);
      await page.goto(controllerPath);
      const cases = [
        { label: 'lyrics', changes: { projectorState: { type: 'lyrics', contentType: 'lyrics', title: 'Canción PANIC' }, proyectorSlide: { titulo: 'Canción PANIC', texto: 'Letra PANIC' }, mediaOutputs: {}, canvaOutputs: {} }, visible: 'Letra PANIC' },
        { label: 'bible', changes: { projectorState: bibleState(), proyectorSlide: null, mediaOutputs: {}, canvaOutputs: {} }, visible: 'Jesús lloró.' },
        { label: 'canva', changes: { mediaOutputs: {}, canvaOutputs: { projector: canvaRoute('Canva PANIC', 2) } }, visible: null },
      ];
      for (const current of cases) {
        await updateControllerE2EEvent({ ...current.changes, proyectorApagado: false });
        if (current.visible) await expect(output.page.getByText(current.visible)).toBeVisible();
        else await expect(output.page.locator('iframe[title="Canva PANIC"]')).toBeVisible();
        const before = await readFirestoreDocument('eventos', CONTROLLER_EVENT_ID);
        await page.getByRole('button', { name: 'PANIC', exact: true }).click();
        await expect.poll(async () => (await readFirestoreDocument('eventos', CONTROLLER_EVENT_ID)).proyectorApagado).toBe(true);
        await page.getByRole('button', { name: 'Apagado', exact: true }).click();
        await expect.poll(async () => (await readFirestoreDocument('eventos', CONTROLLER_EVENT_ID)).proyectorApagado).toBe(false);
        const restored = await readFirestoreDocument('eventos', CONTROLLER_EVENT_ID);
        expect(restored.projectorState).toEqual(before.projectorState);
        expect(restored.proyectorSlide).toEqual(before.proyectorSlide);
        expect(restored.canvaOutputs).toEqual(before.canvaOutputs);
        if (current.visible) await expect(output.page.getByText(current.visible)).toBeVisible();
        else await expect(output.page.locator('iframe[title="Canva PANIC"]')).toBeVisible();
      }
      expect(output.errors, output.errors.join('\n')).toEqual([]);
    } finally {
      await output.context.close();
    }
  });

  test('CG-CANVA-001/002/004/005/009 project saved Canva to routes, persist page, reload, and undo server-authoritatively', async ({ page, browser }) => {
    test.setTimeout(60_000);
    allowExpectedConsoleError((message) => {
      const text = message.text();
      const isCanvaXFrameOptions = /Refused to display ['"]https:\/\/www\.canva\.com\//.test(text)
        && /X-Frame-Options/.test(text);
      const isGenericResource403 = /^Failed to load resource: the server responded with a status of 403(?: \(Forbidden\)| \(\))?$/.test(text);
      return isCanvaXFrameOptions || isGenericResource403;
    });
    const projector = await openOutput(browser, `/proyector/${CANVA_EVENT_ID}`, { mockCanva: true });
    const singers = await openOutput(browser, `/retorno/${CANVA_EVENT_ID}`, { mockCanva: true });
    const musicians = await openOutput(browser, `/retorno-musicos/${CANVA_EVENT_ID}`, { mockCanva: true });
    try {
      await login(page, USERS.operatorA);
      await page.goto(canvaControllerPath);
      await openSavedCanvaProjection(page, ['projector', 'singers', 'musicians']);
      await expect.poll(async () => (await readCanvaE2EEvent()).canvaOutputs?.projector?.active).toBe(true);
      const projected = await readCanvaE2EEvent();
      expect(Object.keys(projected.canvaOutputs).sort()).toEqual(['musicians', 'projector', 'singers']);
      expect(projected.mediaOutputs).toEqual({});
      expect(projected.canvaOutputs.projector.projectionOperationId).toEqual(expect.any(String));
      await Promise.all([
        expect(projector.page.locator('iframe[title="Canva A"]')).toBeVisible(),
        expect(singers.page.locator('iframe[title="Canva A"]')).toBeVisible(),
        expect(musicians.page.locator('iframe[title="Canva A"]')).toBeVisible(),
      ]);
      expect(projector.canva403Responses.size + singers.canva403Responses.size + musicians.canva403Responses.size).toBeGreaterThan(0);
      await page.getByRole('button', { name: /^Siguiente →$/ }).first().click();
      await expect.poll(async () => (await readCanvaE2EEvent()).canvaOutputs?.projector?.page).toBe(2);
      await projector.page.reload();
      await expect(projector.page.locator('iframe[title="Canva A"]')).toBeVisible();
      await expect.poll(async () => {
        const event = await readCanvaE2EEvent();
        return ['projector', 'singers', 'musicians'].map((target) => ({
          operationId: event.canvaOutputs?.[target]?.projectionOperationId,
          hasMedia: Boolean(event.mediaOutputs?.[target]),
        }));
      }).toEqual([
        { operationId: projected.canvaOutputs.projector.projectionOperationId, hasMedia: false },
        { operationId: projected.canvaOutputs.projector.projectionOperationId, hasMedia: false },
        { operationId: projected.canvaOutputs.projector.projectionOperationId, hasMedia: false },
      ]);
      const undoResponse = page.waitForResponse((item) => item.request().method() === 'POST' && item.url().includes('restoreProjectionUndo'));
      await page.getByRole('button', { name: /Deshacer/i }).click();
      expect((await (await undoResponse).json()).result.status).toBe('restored');
      const restored = await readCanvaE2EEvent();
      expect(restored.canvaOutputs).toEqual({});
      expect(restored.mediaOutputs.projector.mediaId).toBe('video-a');
      expect(restored.mediaOutputs.singers.mediaId).toBe('video-singers');
      expect(restored.mediaOutputs.musicians.mediaId).toBe('video-musicians');
    } finally {
      await Promise.all([projector.context.close(), singers.context.close(), musicians.context.close()]);
    }
  });

  test('CG-CONTROLLER-002 and CG-PERM-RT-001/CG-ACCOUNT-RT-001 converge realtime and block a revoked or suspended operator', async ({ browser }) => {
    test.setTimeout(60_000);
    const first = await browser.newContext();
    const second = await browser.newContext();
    const pageA = await first.newPage();
    const pageB = await second.newPage();
    try {
      await Promise.all([login(pageA, USERS.multimedia), login(pageB, USERS.multimedia)]);
      await Promise.all([pageA.goto(controllerPath), pageB.goto(controllerPath)]);
      await updateControllerE2EEvent({
        projectorState: { type: 'media', contentType: 'media', title: 'Dos controladores' }, proyectorSlide: null,
        mediaOutputs: { projector: videoRoute('a', 'controller-a'), singers: videoRoute('b', 'controller-b') }, canvaOutputs: {}, proyectorApagado: false,
      });
      await Promise.all([
        pageA.getByRole('button', { name: 'Multimedia', exact: true }).first().click(),
        pageB.getByRole('button', { name: 'Multimedia', exact: true }).first().click(),
      ]);
      const pauseA = pageA.locator('button[title="Pausar"]:visible').first();
      const pauseB = pageB.locator('button[title="Pausar"]:visible').last();
      await Promise.all([expect(pauseA).toBeVisible(), expect(pauseB).toBeVisible()]);
      await pauseA.click();
      await pauseB.click();
      await expect.poll(async () => {
        const outputs = (await readFirestoreDocument('eventos', CONTROLLER_EVENT_ID)).mediaOutputs;
        return [outputs.projector.playing, outputs.singers.playing];
      }).toEqual([false, false]);
      await pageA.reload();
      await pageA.getByRole('button', { name: 'Multimedia', exact: true }).first().click();
      await expect(pageA.getByText(/reproducciones activas/i).first()).toBeVisible();
      const profile = await readE2EUserProfile('e2e-multimedia');
      await updateE2EUserProfile('e2e-multimedia', { ...profile, permissionOverrides: { ...(profile.permissionOverrides || {}), 'multimedia.project': false } });
      await expect(pageA.getByRole('button', { name: /proyectar en seleccionadas/i })).toBeDisabled();
      await updateE2EUserProfile('e2e-multimedia', { ...profile, accountStatus: 'suspended' });
      await expect(pageB.getByRole('heading', { name: /cuenta suspendida/i })).toBeVisible();
      await updateE2EUserProfile('e2e-multimedia', { ...profile, accountStatus: 'active' });
      await expect(pageB.getByRole('heading', { name: /cuenta suspendida/i })).toHaveCount(0);
      await expect(pageB.getByRole('button', { name: 'PANIC', exact: true })).toBeVisible();
    } finally {
      await Promise.all([first.close(), second.close()]);
    }
  });
});
