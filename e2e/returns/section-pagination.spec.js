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

const bridge = `# Puente 1

//
Ningun princi[F#m]pado
Ni las potes[E]tades
Ni armas for[D]jadas
Quien podra? Quien po[Bm]dra?

No han prevale[F#m]cido
Ha caido el ene[E]migo
El infierno has ven[D]cido
Quien podra? Quien po[Bm]dra?
//`;

async function openOutput(browser, path) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, USERS.multimedia);
  await page.goto(path);
  return { context, page };
}

async function expectText(page, text) {
  await expect.poll(() => page.locator('body').innerText()).toContain(text);
}

test.describe.serial('Paginacion de secciones musicales', () => {
  let originalEvent;
  let song;

  test.beforeAll(async () => {
    originalEvent = await readFirestoreDocument('eventos', CONTROLLER_EVENT_ID);
    song = await createE2ESong({
      titulo: `E2E-QA-PAGINACION-${Date.now()}`,
      tonoOriginal: 'F#m',
      letraRaw: bridge,
    });
  });

  test.afterEach(async () => resetControllerE2EEvent(originalEvent));
  test.afterAll(async () => deleteE2EResource('canciones', song.id));

  test('MUSIC-PAGES-001 projects paragraph pages without raw repeat markers and keeps repeat guidance on returns', async ({ browser }) => {
    const projector = await openOutput(browser, paths.projector);
    const singers = await openOutput(browser, paths.singers);
    const musicians = await openOutput(browser, paths.musicians);
    const projectPage = async (pageIndex, firstLine) => {
      await updateControllerE2EEvent({
        projectorState: { type: 'lyrics', contentType: 'lyrics', title: song.titulo, updatedAt: Date.now() },
        projectionTargets: { projector: true, singers: true, musicians: true },
        proyectorSlide: {
          titulo: 'Puente 1',
          texto: firstLine,
          sectionIndex: 0,
          pageIndex,
          pageCount: 2,
          repetition: true,
        },
        proyectorSongId: song.id,
        proyectorSlideIndex: pageIndex,
        proyectorOffset: 0,
        proyectorApagado: false,
        canvaOutputs: {},
        mediaOutputs: {},
        liveState: {
          activeSongId: song.id,
          activeSongTitle: song.titulo,
          activeSectionIndex: 0,
          activeSectionTitle: 'Puente 1',
          activeContentType: 'lyrics',
          updatedAt: Date.now(),
        },
      });
    };

    try {
      await projectPage(0, 'Ningun principado');
      await Promise.all([
        expectText(projector.page, 'Ningun principado'),
      ]);
      await Promise.all([
        expectText(singers.page, 'Ningun'),
        expectText(singers.page, 'pado'),
        expectText(musicians.page, 'Ningun'),
        expectText(musicians.page, 'pado'),
      ]);
      await expect(projector.page.getByText('//', { exact: true })).toHaveCount(0);
      await expect(projector.page.getByText(/repetir/i)).toHaveCount(0);
      await expect(singers.page.getByText(/repetir/i)).toBeVisible();
      await expect(musicians.page.getByText(/repetir/i)).toBeVisible();
      await expect(singers.page.getByText(/puente 1.*1\/2/i)).toBeVisible();
      await expect(musicians.page.getByText(/puente 1.*1\/2/i)).toBeVisible();

      await projectPage(1, 'No han prevalecido');
      await Promise.all([
        expectText(projector.page, 'No han prevalecido'),
      ]);
      await Promise.all([
        expectText(singers.page, 'No'),
        expectText(singers.page, 'prevale'),
        expectText(musicians.page, 'No'),
        expectText(musicians.page, 'han'),
        expectText(musicians.page, 'prevale'),
      ]);
      await expect(singers.page.getByText(/puente 1.*2\/2/i)).toBeVisible();
      await expect(musicians.page.getByText(/puente 1.*2\/2/i)).toBeVisible();
      await expect(musicians.page.locator('#section-0').getByText('F#m', { exact: true })).toBeVisible();
    } finally {
      await Promise.all([projector.context.close(), singers.context.close(), musicians.context.close()]);
    }
  });
});
