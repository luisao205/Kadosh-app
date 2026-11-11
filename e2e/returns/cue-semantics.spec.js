import { expect } from '@playwright/test';
import { CONTROLLER_EVENT_ID, login, test, USERS } from '../fixtures/app.js';
import {
  createE2ESong,
  deleteE2EResource,
  readFirestoreDocument,
  resetControllerE2EEvent,
  updateControllerE2EEvent,
} from '../helpers/firestoreAdmin.js';

const paths = {
  projector: `/proyector/${CONTROLLER_EVENT_ID}`,
  singers: `/retorno/${CONTROLLER_EVENT_ID}`,
  musicians: `/retorno-musicos/${CONTROLLER_EVENT_ID}`,
};

const cueSong = [
  '# Pre-Coro',
  '{cue: Comienza a crecer la intensidad}',
  '',
  '///',
  '[A]Yo no soy de aqui, a casa volvere',
  '[B9]Me viene a buscar',
  '///',
  '',
  '[C]Segundo parrafo',
].join('\n');

async function openOutput(browser, path) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, USERS.multimedia);
  await page.goto(path);
  return { context, page };
}

async function expectBodyText(page, text) {
  const normalized = text.replace(/\s+/g, '');
  await expect.poll(async () => (await page.locator('body').innerText()).replace(/\s+/g, '')).toContain(normalized);
}

test.describe.serial('Semantica de cues en salidas', () => {
  let originalEvent;
  let song;

  test.beforeAll(async () => {
    originalEvent = await readFirestoreDocument('eventos', CONTROLLER_EVENT_ID);
    song = await createE2ESong({
      titulo: `E2E-QA-CUE-${Date.now()}`,
      tonoOriginal: 'A',
      letraRaw: cueSong,
    });
  });

  test.afterEach(async () => resetControllerE2EEvent(originalEvent));
  test.afterAll(async () => deleteE2EResource('canciones', song.id));

  test('CUE-OUTPUTS-001 keeps cue, repeat and lyrics on the same first page without exposing the cue publicly', async ({ browser }) => {
    const projector = await openOutput(browser, paths.projector);
    const singers = await openOutput(browser, paths.singers);
    const musicians = await openOutput(browser, paths.musicians);

    try {
      await updateControllerE2EEvent({
        projectorState: { type: 'lyrics', contentType: 'lyrics', title: song.titulo, updatedAt: Date.now() },
        projectionTargets: { projector: true, singers: true, musicians: true },
        proyectorSlide: {
          titulo: 'Pre-Coro',
          texto: 'Yo no soy de aqui, a casa volvere\nMe viene a buscar',
          cues: ['Comienza a crecer la intensidad'],
          sectionIndex: 0,
          pageIndex: 0,
          pageCount: 2,
          repetition: true,
          repeatCount: 3,
        },
        proyectorSongId: song.id,
        proyectorSlideIndex: 0,
        proyectorOffset: 0,
        proyectorApagado: false,
        canvaOutputs: {},
        mediaOutputs: {},
        liveState: {
          activeSongId: song.id,
          activeSongTitle: song.titulo,
          activeSectionIndex: 0,
          activeSectionTitle: 'Pre-Coro',
          activeContentType: 'lyrics',
          updatedAt: Date.now(),
        },
      });

      await Promise.all([
        expectBodyText(projector.page, 'Yo no soy de aqui'),
        expectBodyText(singers.page, 'Yo no soy de aqui'),
        expectBodyText(musicians.page, 'Yo no soy de aqui'),
      ]);
      await expect(projector.page.getByText(/comienza a crecer la intensidad/i)).toHaveCount(0);
      await expect(singers.page.getByText(/indicaci.n: comienza a crecer la intensidad/i).first()).toBeVisible();
      await expect(musicians.page.getByText(/\* comienza a crecer la intensidad/i)).toBeVisible();
      await expect(singers.page.getByText(/repetir.*3/i)).toBeVisible();
      await expect(musicians.page.getByText(/repetir.*3/i)).toBeVisible();
      await expect(musicians.page.locator('#section-0').getByText('A', { exact: true })).toBeVisible();
      await expect(singers.page.getByText(/pre-coro.*1\/2/i)).toBeVisible();
      await expect(musicians.page.getByText(/pre-coro.*1\/2/i)).toBeVisible();
    } finally {
      await Promise.all([projector.context.close(), singers.context.close(), musicians.context.close()]);
    }
  });
});
