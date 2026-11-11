import { expect } from '@playwright/test';
import { allowExpectedConsoleError, login, test, USERS, CONTROLLER_EVENT_ID } from '../fixtures/app.js';
import {
  createE2EMedia,
  createE2ESong,
  deleteE2EResource,
  e2eId,
  findFirestoreDocumentsByTitle,
  readFirestoreDocument,
  resetControllerE2EEvent,
  updateControllerE2EEvent,
  updateE2EMedia,
} from '../helpers/firestoreAdmin.js';

const controllerPath = `/control-proyector/${CONTROLLER_EVENT_ID}`;
const projectorPath = `/proyector/${CONTROLLER_EVENT_ID}`;
const trackedFixtures = {
  canciones: new Set(),
  mediaLibrary: new Set(),
};

function trackFixture(collectionName, id) {
  trackedFixtures[collectionName].add(id);
  return id;
}

async function cleanupTrackedFixtures() {
  for (const [collectionName, ids] of Object.entries(trackedFixtures)) {
    for (const id of [...ids]) {
      await deleteE2EResource(collectionName, id);
      ids.delete(id);
    }
  }
}

async function applyFormatting(page, { slide = 0, bold = false, uppercase = false, scale = 'md', color = 'default' } = {}) {
  const editor = page.getByLabel('Borrador de formato especial');
  await expect(editor).toBeVisible();
  await editor.locator('label').filter({ hasText: /^Diapositiva/ }).locator('select').selectOption({ index: slide });
  await editor.getByLabel(/activar formato solo/i).check();
  const phrase = editor.getByRole('group', { name: /frases seleccionadas/i }).getByRole('checkbox').first();
  await phrase.check();
  if (bold) await editor.getByLabel('Negrita').check();
  if (uppercase) await editor.getByLabel(/may.sculas/i).check();
  const phraseText = (await phrase.locator('xpath=following-sibling::span').textContent())?.trim() || '';
  await editor.getByLabel(new RegExp(`Tama.o de ${phraseText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i')).selectOption(scale);
  await editor.getByLabel(new RegExp(`Color de ${phraseText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i')).selectOption(color);
  await editor.getByRole('button', { name: /aplicar al borrador/i }).click();
  await expect(editor.getByRole('status')).toContainText(/sin guardar/i);
}

async function saveFormatting(page) {
  const response = page.waitForResponse((item) => item.request().method() === 'POST' && item.url().includes('saveLyric'));
  await page.getByRole('button', { name: /^guardar cambios$/i }).last().click();
  expect((await response).status()).toBe(200);
  await expect(page.getByText(/canci.n actualizada exitosamente/i)).toBeVisible({ timeout: 30_000 });
}

test.describe.serial('Projection V2.1 callable browser certification', () => {
  let originalEvent;

  test.beforeAll(async () => {
    originalEvent = await readFirestoreDocument('eventos', CONTROLLER_EVENT_ID);
    if (!originalEvent) throw new Error('Falta el evento E2E del Controller.');
  });

  test.afterEach(async () => {
    await resetControllerE2EEvent(originalEvent);
    await cleanupTrackedFixtures();
  });

  test('V21-E2E-001 persists identical slides, duplicates safely, and renders both formats', async ({ page, browser }) => {
    test.setTimeout(120_000);
    const title = e2eId('V21-FORMATTED');
    const media = await createE2EMedia({ title: e2eId('V21-MEDIA') });
    trackFixture('mediaLibrary', media.id);
    const song = await createE2ESong({
      titulo: title,
      letraRaw: '# Coro\nMISMA FRASE\n\nMISMA FRASE',
      fondoMediaId: media.id,
      fondoUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
    });
    trackFixture('canciones', song.id);
    let copyId;
    const outputContext = await browser.newContext();
    const output = await outputContext.newPage();
    try {
      await login(page, USERS.owner);
      await page.goto(`/editar/${song.id}`);
      await applyFormatting(page, { slide: 0, bold: true, uppercase: true, scale: 'xl', color: 'accent' });
      await saveFormatting(page);

      await page.goto(`/editar/${song.id}`);
      await expect(page.getByLabel('Borrador de formato especial').getByText('resolved', { exact: true })).toBeVisible();
      await applyFormatting(page, { slide: 1, scale: 'sm', color: 'muted' });
      await saveFormatting(page);

      const persisted = await readFirestoreDocument('canciones', song.id);
      expect(persisted.lyricFormatting.blocks).toHaveLength(2);
      expect(new Set(persisted.lyricFormatting.blocks.map((block) => block.scope.slideId)).size).toBe(2);
      expect((await readFirestoreDocument('mediaLibrary', media.id)).usedBy).toEqual([]);

      await page.goto('/canciones');
      const card = page.getByTestId(`song-card-${song.id}`);
      await expect(card).toBeVisible();
      const duplicateResponse = page.waitForResponse((item) => item.request().method() === 'POST' && item.url().includes('duplicateSongV21'));
      await card.getByTitle(/duplicar canci.n/i).click();
      expect((await duplicateResponse).status()).toBe(200);
      await expect(page.getByText(/canci.n duplicada correctamente/i)).toBeVisible();
      const copies = await findFirestoreDocumentsByTitle('canciones', `${title} (Copia)`);
      expect(copies).toHaveLength(1);
      copyId = copies[0].id;
      trackFixture('canciones', copyId);
      expect(copies[0].lyricFormatting).toEqual(persisted.lyricFormatting);
      expect((await readFirestoreDocument('canciones', song.id)).lyricFormatting).toEqual(persisted.lyricFormatting);

      await page.goto(`/editar/${copyId}`);
      await expect(page.getByLabel('Borrador de formato especial').getByText('resolved', { exact: true })).toBeVisible();

      await updateControllerE2EEvent({
        setlist: [{ idLocal: 'e2e-v21-rich', type: 'song', value: song.id }],
        canciones: [song.id],
        proyectorApagado: false,
        songProjectionStyleOverrides: {},
      });
      await login(output, USERS.owner);
      await output.goto(projectorPath);
      await page.goto(controllerPath);
      await page.getByRole('button', { name: new RegExp(title) }).click();
      const slides = page.locator('div.grid.grid-cols-2.gap-3 > div').filter({ hasText: 'MISMA FRASE' });
      await expect(slides).toHaveCount(2);

      await slides.nth(0).dispatchEvent('click');
      const first = output.locator('[data-rich-lyric-container="true"]');
      await expect(first).toBeVisible();
      await expect(first.locator('[data-rich-lyric-run]').first()).toHaveCSS('font-weight', '900');

      await slides.nth(1).dispatchEvent('click');
      const second = output.locator('[data-rich-lyric-container="true"]');
      await expect(second).toBeVisible();
      await expect(second.locator('[data-rich-lyric-run]').first()).not.toHaveCSS('font-weight', '900');
    } finally {
      await outputContext.close();
      await cleanupTrackedFixtures();
    }
  });

  test('V21-E2E-002 performs atomic lyrics+format save and preserves a conflicting draft', async ({ browser }) => {
    test.setTimeout(120_000);
    const song = await createE2ESong({ titulo: e2eId('V21-CAS'), letraRaw: '# Coro\nPRIMERA FRASE\n\nSEGUNDA FRASE' });
    trackFixture('canciones', song.id);
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    try {
      await Promise.all([login(pageA, USERS.owner), login(pageB, USERS.owner)]);
      await Promise.all([pageA.goto(`/editar/${song.id}`), pageB.goto(`/editar/${song.id}`)]);

      await applyFormatting(pageA, { slide: 0, bold: true, scale: 'lg' });
      const lyricsA = pageA.getByLabel(/estructura de la canci.n/i);
      await lyricsA.fill('# Coro\nPRIMERA FRASE EDITADA\n\nSEGUNDA FRASE');
      await applyFormatting(pageA, { slide: 0, bold: true, scale: 'lg' });
      const atomicResponse = pageA.waitForResponse((item) => item.request().method() === 'POST' && item.url().includes('saveLyricsAndFormattingV21'));
      await pageA.getByRole('button', { name: /^guardar cambios$/i }).last().click();
      expect((await atomicResponse).status()).toBe(200);
      await expect.poll(async () => (await readFirestoreDocument('canciones', song.id))?.letraRaw).toContain('EDITADA');

      await applyFormatting(pageB, { slide: 1, uppercase: true, color: 'accent' });
      await pageB.getByRole('button', { name: /^guardar cambios$/i }).last().click();
      const status = pageB.getByLabel('Borrador de formato especial').getByRole('status');
      await expect(status).toContainText(/cambio|conflicto|recarga/i, { timeout: 30_000 });
      await expect(pageB.getByRole('button', { name: /restablecer borrador/i })).toBeVisible();
      await expect(pageB.getByText(/cambios sin guardar/i).first()).toBeVisible();
    } finally {
      await Promise.all([contextA.close(), contextB.close()]);
      await cleanupTrackedFixtures();
    }
  });

  test('V21-E2E-003 retries idempotently, ignores double click, and reports partial metadata save', async ({ page }) => {
    test.setTimeout(120_000);
    allowExpectedConsoleError(/ERR_CONNECTION_FAILED|network|failed to fetch|internal/i);
    const song = await createE2ESong({ titulo: e2eId('V21-RETRY'), letraRaw: '# Coro\nREINTENTO SEGURO\n\nGUARDADO PARCIAL' });
    trackFixture('canciones', song.id);
    try {
      await login(page, USERS.owner);
      await page.goto(`/editar/${song.id}`);
      await applyFormatting(page, { slide: 0, bold: true, scale: 'lg' });

      const requestIds = [];
      let failFirst = true;
      await page.route('**/saveLyricFormattingV21', async (route) => {
        const body = route.request().postDataJSON();
        requestIds.push(body?.data?.requestId);
        if (failFirst) {
          failFirst = false;
          await route.abort('connectionfailed');
          return;
        }
        await route.continue();
      });

      await page.getByRole('button', { name: /^guardar ahora$/i }).click();
      await expect(page.getByLabel('Borrador de formato especial').getByRole('status')).toContainText(/no se pudo completar.*sin guardar/i);
      await page.getByRole('button', { name: /^guardar ahora$/i }).click();
      await expect(page.getByText(/canci.n actualizada exitosamente/i)).toBeVisible({ timeout: 30_000 });
      expect(requestIds).toHaveLength(2);
      expect(requestIds[1]).toBe(requestIds[0]);
      await page.unroute('**/saveLyricFormattingV21');

      await applyFormatting(page, { slide: 1, uppercase: true, color: 'accent' });
      let doubleClickRequests = 0;
      page.on('request', (request) => {
        if (request.method() === 'POST' && request.url().includes('saveLyricFormattingV21')) doubleClickRequests += 1;
      });
      await page.getByRole('button', { name: /^guardar ahora$/i }).evaluate((button) => {
        button.click();
        button.click();
      });
      await expect(page.getByText(/canci.n actualizada exitosamente/i)).toBeVisible({ timeout: 30_000 });
      expect(doubleClickRequests).toBe(1);

      await page.goto(`/editar/${song.id}`);
      const originalTitle = song.titulo;
      await page.getByLabel(/titulo de la canci.n/i).fill(`${originalTitle} NO-PERSISTE`);
      await applyFormatting(page, { slide: 0, scale: 'xl', color: 'primary' });
      await page.route('**/updateSongMetadata', (route) => route.abort('connectionfailed'));
      await page.getByRole('button', { name: /^guardar ahora$/i }).click();
      await expect(page.getByText(/guardado confirmado: content.*pendiente: metadatos/i)).toBeVisible({ timeout: 30_000 });
      expect((await readFirestoreDocument('canciones', song.id)).titulo).toBe(originalTitle);
      expect((await readFirestoreDocument('canciones', song.id)).lyricFormatting.blocks.length).toBeGreaterThan(0);
    } finally {
      await cleanupTrackedFixtures();
    }
  });

  test('V21-E2E-004 duplicates and projects a legacy song without inventing formatting', async ({ page, browser }) => {
    test.setTimeout(90_000);
    const title = e2eId('V21-LEGACY');
    const lyrics = '# Verso\n[C]LINEA LEGACY UNO\n[G]LINEA LEGACY DOS\n\n# Coro\n[Am]CORO LEGACY';
    const song = await createE2ESong({ titulo: title, artista: 'Artista E2E-QA Legacy', bpm: 88, letraRaw: lyrics });
    trackFixture('canciones', song.id);
    const outputContext = await browser.newContext();
    const output = await outputContext.newPage();
    try {
      await login(page, USERS.owner);
      await page.goto('/canciones');
      const card = page.getByTestId(`song-card-${song.id}`);
      await expect(card).toBeVisible();
      const response = page.waitForResponse((item) => item.request().method() === 'POST' && item.url().includes('duplicateSongV21'));
      await card.getByTitle(/duplicar canci.n/i).click();
      expect((await response).status()).toBe(200);
      await expect(page.getByText(/canci.n duplicada correctamente/i)).toBeVisible();
      const copies = await findFirestoreDocumentsByTitle('canciones', `${title} (Copia)`);
      expect(copies).toHaveLength(1);
      trackFixture('canciones', copies[0].id);
      expect(copies[0]).toMatchObject({ artista: 'Artista E2E-QA Legacy', bpm: 88, letraRaw: lyrics });
      expect(Object.hasOwn(copies[0], 'lyricFormatting')).toBe(false);
      expect(await readFirestoreDocument('canciones', song.id)).toMatchObject({ titulo: title, letraRaw: lyrics });
      await page.screenshot({ path: 'artifacts/v21-c3c5-legacy-duplication.png', fullPage: true });

      await updateControllerE2EEvent({
        setlist: [{ idLocal: 'e2e-v21-legacy', type: 'song', value: song.id }],
        canciones: [song.id],
        proyectorApagado: false,
        songProjectionStyleOverrides: {},
      });
      await login(output, USERS.owner);
      await output.goto(projectorPath);
      await page.goto(controllerPath);
      await page.getByRole('button', { name: new RegExp(title) }).click();
      const legacySlide = page.locator('div.grid.grid-cols-2.gap-3 > div').filter({ hasText: 'LINEA LEGACY UNO' }).first();
      await legacySlide.dispatchEvent('click');
      const projected = output.locator('.projection-lyric-text');
      await expect(projected).toContainText('LINEA LEGACY UNO');
      await expect(projected).toContainText('LINEA LEGACY DOS');
      await expect(output.locator('[data-rich-lyric-container="true"]')).toHaveCount(0);
      expect(await projected.evaluate((element) => getComputedStyle(element).whiteSpace)).toMatch(/pre/);
      await output.screenshot({ path: 'artifacts/v21-c3c5-legacy-projection.png', fullPage: true });
    } finally {
      await outputContext.close();
      await cleanupTrackedFixtures();
    }
  });

  test('V21-E2E-005 duplicates formatted section media and keeps usedBy idempotent', async ({ page }) => {
    test.setTimeout(90_000);
    const media = await createE2EMedia({ title: e2eId('V21-USED-BY') });
    trackFixture('mediaLibrary', media.id);
    const title = e2eId('V21-MEDIA-SOURCE');
    const song = await createE2ESong({
      titulo: title,
      letraRaw: '# Coro\nMEDIA FORMATEADA',
      sectionMedia: {
        Coro: [{
          id: 'e2e-source-resource',
          mediaId: media.id,
          title: 'E2E-QA-V21 Section Media',
          type: 'image',
          url: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
          provider: 'url',
          source: 'library',
          sectionTitle: 'Coro',
        }],
      },
    });
    trackFixture('canciones', song.id);
    const originalUsage = {
      songId: song.id,
      songTitle: title,
      location: 'section',
      sectionKey: 'Coro',
      sectionTitle: 'Coro',
      resourceId: 'e2e-source-resource',
    };
    await updateE2EMedia(media.id, { usedBy: [originalUsage], usageCount: 1 });
    try {
      await login(page, USERS.owner);
      await page.goto(`/editar/${song.id}`);
      await applyFormatting(page, { slide: 0, bold: true, scale: 'lg', color: 'accent' });
      await saveFormatting(page);
      await page.goto('/canciones');
      const card = page.getByTestId(`song-card-${song.id}`);
      let originalRequestBody = null;
      page.on('request', (request) => {
        if (request.method() === 'POST' && request.url().includes('duplicateSongV21') && !originalRequestBody) {
          originalRequestBody = request.postData();
        }
      });
      const firstResponse = page.waitForResponse((item) => item.request().method() === 'POST' && item.url().includes('duplicateSongV21'));
      await card.getByTitle(/duplicar canci.n/i).click();
      expect((await firstResponse).status()).toBe(200);
      const copies = await findFirestoreDocumentsByTitle('canciones', `${title} (Copia)`);
      expect(copies).toHaveLength(1);
      trackFixture('canciones', copies[0].id);

      const afterFirst = await readFirestoreDocument('mediaLibrary', media.id);
      expect(afterFirst.usedBy).toHaveLength(2);
      expect(afterFirst.usedBy).toEqual(expect.arrayContaining([
        expect.objectContaining({ songId: song.id, resourceId: 'e2e-source-resource' }),
        expect.objectContaining({ songId: copies[0].id, location: 'section', sectionKey: 'Coro' }),
      ]));

      let replayed = false;
      await page.route('**/duplicateSongV21', async (route) => {
        if (!replayed && originalRequestBody) {
          replayed = true;
          await route.continue({ postData: originalRequestBody });
          return;
        }
        await route.continue();
      });
      await page.goto('/canciones');
      const retryCard = page.getByTestId(`song-card-${song.id}`);
      await expect(retryCard).toBeVisible();
      const retryResponse = page.waitForResponse((item) => item.request().method() === 'POST' && item.url().includes('duplicateSongV21'));
      await retryCard.getByTitle(/duplicar canci.n/i).click();
      expect((await retryResponse).status()).toBe(200);
      const afterRetry = await readFirestoreDocument('mediaLibrary', media.id);
      expect(afterRetry.usedBy).toEqual(afterFirst.usedBy);
      expect(afterRetry.usageCount).toBe(2);
      expect(await findFirestoreDocumentsByTitle('canciones', `${title} (Copia)`)).toHaveLength(1);
      expect((await readFirestoreDocument('canciones', song.id)).sectionMedia.Coro[0].mediaId).toBe(media.id);
      await page.screenshot({ path: 'artifacts/v21-c3c5-media-duplication.png', fullPage: true });
    } finally {
      await cleanupTrackedFixtures();
    }
  });
});
