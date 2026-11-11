import { expect } from '@playwright/test';
import { CONTROLLER_EVENT_ID, login, test, USERS } from '../fixtures/app.js';
import { createE2ESong, deleteE2EResource, readFirestoreDocument, resetControllerE2EEvent, updateControllerE2EEvent } from '../helpers/firestoreAdmin.js';

const paths = {
  projector: `/proyector/${CONTROLLER_EVENT_ID}`,
  singers: `/retorno/${CONTROLLER_EVENT_ID}`,
  musicians: `/retorno-musicos/${CONTROLLER_EVENT_ID}`,
};

const shortText = 'FIT CORTO';
const outputViewports = [
  { width: 320, height: 568 },
  { width: 360, height: 800 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
  { width: 768, height: 1024 },
  { width: 820, height: 1180 },
  { width: 812, height: 375 },
  { width: 844, height: 390 },
  { width: 915, height: 412 },
  { width: 1024, height: 768 },
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
  { width: 3840, height: 2160 },
];
const longText = Array.from({ length: 8 }, (_, index) => `Línea ${index + 1} con contenido largo para verificar el ajuste real de la salida.`).join('\n');

async function openOutput(browser, path) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, USERS.multimedia);
  await page.goto(path);
  return { context, page };
}

async function expectContained(page, text) {
  const compactText = text.replace(/\s+/g, '');
  await expect.poll(() => page.locator('body').innerText().then((value) => value.replace(/\s+/g, '').includes(compactText))).toBe(true);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test.describe.serial('Auto-fit de proyección y retornos', () => {
  let originalEvent;
  let song;

  test.beforeAll(async () => {
    originalEvent = await readFirestoreDocument('eventos', CONTROLLER_EVENT_ID);
    song = await createE2ESong({
      titulo: `E2E-QA-FIT-${Date.now()}`,
      tonoOriginal: 'F#m',
      letraRaw: `# Verso\n[F#m]${shortText}\n\n# Largo\n[F#m]${longText}`,
    });
  });

  test.afterEach(async () => resetControllerE2EEvent(originalEvent));
  test.afterAll(async () => deleteE2EResource('canciones', song.id));

  test('PROJ/SINGER/MUSICIAN-FIT-001 a 005 keep short and long content visible through resize', async ({ browser }) => {
    const projector = await openOutput(browser, paths.projector);
    const singers = await openOutput(browser, paths.singers);
    const musicians = await openOutput(browser, paths.musicians);
    try {
      await updateControllerE2EEvent({
        projectorState: { type: 'lyrics', contentType: 'lyrics', title: song.titulo, updatedAt: Date.now() },
        projectionTargets: { projector: true, singers: true, musicians: true },
        proyectorSlide: { titulo: 'Verso', texto: shortText },
        proyectorSongId: song.id,
        proyectorSlideIndex: 0,
        proyectorOffset: 0,
        proyectorApagado: false,
        canvaOutputs: {}, mediaOutputs: {},
        liveState: { activeSongId: song.id, activeSongTitle: song.titulo, activeSectionIndex: 0, activeSectionTitle: 'Verso', activeContentType: 'lyrics', updatedAt: Date.now() },
      });
      await Promise.all([expectContained(projector.page, shortText), expectContained(singers.page, shortText), expectContained(musicians.page, shortText)]);

      for (const viewport of outputViewports) {
        await Promise.all([
          projector.page.setViewportSize(viewport),
          singers.page.setViewportSize(viewport),
          musicians.page.setViewportSize(viewport),
        ]);
        await Promise.all([expectContained(projector.page, shortText), expectContained(singers.page, shortText), expectContained(musicians.page, shortText)]);
      }

      await updateControllerE2EEvent({
        proyectorSlide: { titulo: 'Largo', texto: longText },
        proyectorSlideIndex: 1,
        liveState: { activeSongId: song.id, activeSongTitle: song.titulo, activeSectionIndex: 1, activeSectionTitle: 'Largo', activeContentType: 'lyrics', updatedAt: Date.now() },
      });
      await Promise.all([
        expectContained(projector.page, 'Línea 8 con contenido largo para verificar el ajuste real de la salida.'),
        expectContained(singers.page, 'Línea 8 con contenido largo para verificar el ajuste real de la salida.'),
        expectContained(musicians.page, 'Línea 8 con contenido largo para verificar el ajuste real de la salida.'),
      ]);
      for (const viewport of outputViewports) {
        await Promise.all([
          projector.page.setViewportSize(viewport),
          singers.page.setViewportSize(viewport),
          musicians.page.setViewportSize(viewport),
        ]);
        await Promise.all([
          expectContained(projector.page, longText),
          expectContained(singers.page, longText),
          expectContained(musicians.page, longText),
        ]);
      }
    } finally {
      await Promise.all([projector.context.close(), singers.context.close(), musicians.context.close()]);
    }
  });
});
