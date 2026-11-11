import { expect } from '@playwright/test';
import { test, CONTROLLER_EVENT_ID, login, USERS } from '../fixtures/app.js';
import {
  createE2ESong,
  deleteE2EResource,
  e2eId,
  readFirestoreDocument,
  resetControllerE2EEvent,
  setE2EMultimediaVault,
  updateControllerE2EEvent,
} from '../helpers/firestoreAdmin.js';

const controllerPath = `/control-proyector/${CONTROLLER_EVENT_ID}`;
const projectorPath = `/proyector/${CONTROLLER_EVENT_ID}`;
const singersPath = `/retorno/${CONTROLLER_EVENT_ID}`;
const musiciansPath = `/retorno-musicos/${CONTROLLER_EVENT_ID}`;

const activeMedia = (id, target) => ({
  active: true,
  mediaKey: id,
  mediaId: id,
  name: `E2E ${id}`,
  url: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"%3E%3Crect width="100%25" height="100%25" fill="%231e1b4b"/%3E%3C/svg%3E',
  type: 'image',
  mode: 'foreground',
  sessionId: `session-${id}`,
  positionSec: 0,
  anchorAt: Date.now(),
  syncVersion: 1,
  playing: true,
  volume: target === 'projector' ? 0.8 : 0,
  loop: false,
  updatedAt: Date.now(),
  updatedBy: 'E2E controller'
});

// Deliberately codec-free: controller controls operate on the authoritative
// session clock, while receiver coverage here only needs to prove that each
// routed output mounts its own video element. Playback bytes are a separate
// browser/codec concern and must not make this emulator test depend on WAN.
const activeVideo = (id, target, sessionId = `session-${id}`) => ({
  ...activeMedia(id, target),
  url: `data:video/mp4;base64,AAAA`,
  type: 'video',
  sessionId,
  positionSec: 12,
  anchorAt: Date.now(),
  syncVersion: 4,
  loop: false,
});

const bibleState = (reference, text, index = 0) => ({
  type: 'preaching',
  contentType: 'bible',
  preachingType: 'bible',
  title: reference,
  reference,
  translation: 'RVR60',
  content: text,
  bibleSlideIndex: index,
  bible: { slideIndex: index, slides: [{ reference, text, translation: 'RVR60' }] },
  media: null,
  background: null,
  backgroundMedia: null,
  updatedAt: Date.now(),
  projectionActionId: `e2e-bible-${Date.now()}`,
});

const canvaRoute = (title, page = 1) => ({
  active: true,
  title,
  sourceUrl: `data:text/html,${encodeURIComponent(`<h1>${title}</h1>`)}`,
  embedUrl: `data:text/html,${encodeURIComponent(`<h1>${title} pagina ${page}</h1>`)}`,
  page,
  pageCount: 3,
  updatedAt: Date.now(),
  updatedBy: 'E2E controller',
  projectionOperationId: `e2e-canva-${title}-${page}`,
});

async function openAuthenticatedOutput(browser, path) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console.error: ${message.text()}`);
  });
  await login(page, USERS.multimedia);
  await page.goto(path);
  return { context, page, errors };
}

test.describe.serial('Controlador General realtime', () => {
  let originalEvent;
  let originalMultimediaVault;

  test.beforeAll(async () => {
    originalEvent = await readFirestoreDocument('eventos', CONTROLLER_EVENT_ID);
    if (!originalEvent) throw new Error('Falta el seed e2e-controller-event.');
    originalMultimediaVault = await readFirestoreDocument('sistema', 'multimedia');
  });

  test.afterEach(async () => {
    await Promise.all([
      resetControllerE2EEvent(originalEvent),
      setE2EMultimediaVault(originalMultimediaVault),
    ]);
  });

  test('CG-STABILITY-001 and CG-STABILITY-003 controller mounts and reloads without errors', async ({ page }) => {
    await login(page, USERS.multimedia);
    await page.goto(controllerPath);
    await expect(page.getByText(/en vivo/i).first()).toBeVisible();
    await expect(page.getByText(/reproducciones activas/i)).toHaveCount(0);
    await page.reload();
    await expect(page.getByText(/en vivo/i).first()).toBeVisible();
  });

  test('CG-QMSG-REGRESSION-001 mounts an empty history, changes section, projects, and clears without a render loop', async ({ page }) => {
    await updateControllerE2EEvent({ quickMessageHistory: [], proyectorApagado: false });
    await login(page, USERS.multimedia);
    await page.goto(controllerPath);
    await page.getByRole('button', { name: 'Multimedia', exact: true }).first().click();
    await page.getByRole('button', { name: 'Biblia', exact: true }).first().click();
    const panel = page.locator('section:visible').filter({ hasText: 'Puntos del mensaje' });
    await panel.getByPlaceholder('Escribe un fragmento').fill('Quick Message sin historial');
    const projectResponse = page.waitForResponse((response) => (
      response.request().method() === 'POST' && response.url().includes('projectQuickMessage')
    ));
    await panel.getByRole('button', { name: 'Proyectar', exact: true }).click();
    expect((await projectResponse).ok()).toBe(true);
    await expect.poll(async () => (await readFirestoreDocument('eventos', CONTROLLER_EVENT_ID))?.projectorState?.contentType).toBe('quickMessage');
    await panel.getByRole('button', { name: 'Limpiar proyector', exact: true }).click();
    await expect.poll(async () => (await readFirestoreDocument('eventos', CONTROLLER_EVENT_ID))?.projectorState?.contentType).not.toBe('quickMessage');
  });

  test('CG-MEDIA-PREVIEW-001 clears a removed vault resource instead of leaving a stale projection selection', async ({ page }) => {
    const mediaA = {
      name: 'E2E-QA-Vault A',
      url: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"%3E%3Crect width="100%25" height="100%25" fill="%231e1b4b"/%3E%3C/svg%3E',
      type: 'image',
      folder: 'E2E-QA',
    };
    const mediaB = {
      name: 'E2E-QA-Vault B',
      url: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"%3E%3Crect width="100%25" height="100%25" fill="%23065f46"/%3E%3C/svg%3E',
      type: 'image',
      folder: 'E2E-QA',
    };
    await setE2EMultimediaVault({ multimediaLib: [mediaA, mediaB], multimediaFolders: ['E2E-QA'] });
    await login(page, USERS.owner);
    await page.goto(controllerPath);
    await page.getByRole('button', { name: 'Multimedia', exact: true }).first().click();
    await page.getByRole('button', { name: 'E2E-QA', exact: true }).click();
    const projectSelected = page.getByRole('button', { name: 'Proyectar en seleccionadas', exact: true });

    await page.getByRole('button', { name: 'Seleccionar E2E-QA-Vault A' }).click();
    await page.getByRole('button', { name: 'CERRAR', exact: true }).click();
    await expect(projectSelected).toBeEnabled();
    await page.getByRole('button', { name: 'Seleccionar E2E-QA-Vault B' }).click();
    await page.getByRole('button', { name: 'CERRAR', exact: true }).click();
    await expect(projectSelected).toBeEnabled();

    await page.getByRole('button', { name: 'Eliminar E2E-QA-Vault B' }).click();
    await expect(page.getByRole('heading', { name: 'Eliminar Archivo' })).toBeVisible();
    await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Seleccionar E2E-QA-Vault B' })).toHaveCount(0);
    await expect(projectSelected).toBeDisabled();

    await page.reload();
    await page.getByRole('button', { name: 'Multimedia', exact: true }).first().click();
    await page.getByRole('button', { name: 'E2E-QA', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Seleccionar E2E-QA-Vault A' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Seleccionar E2E-QA-Vault B' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Proyectar en seleccionadas', exact: true })).toBeDisabled();
  });

  test('CG-SECTION-MEDIA-001 routes section backgrounds A to B to C to B to A without changing media sessions', async ({ page, browser }) => {
    test.setTimeout(60_000);
    const mediaBySection = [
      ['Intro', 'E2E-QA Fondo A', '1e1b4b'],
      ['Coro', 'E2E-QA Fondo B', '065f46'],
      ['Puente', 'E2E-QA Fondo C', '7c2d12'],
    ].map(([section, title, color]) => ({
      section,
      title,
      url: `data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"%3E%3Crect width="100%25" height="100%25" fill="%23${color}"/%3E%3C/svg%3E`,
    }));
    const song = await createE2ESong({
      titulo: e2eId('SECTION-CONTROLLER'),
      letraRaw: '# Intro\n[C]Entrada\n\n# Coro\n[G]Coro\n\n# Puente\n[Am]Puente',
      sectionMedia: Object.fromEntries(mediaBySection.map(({ section, title, url }, index) => [
        `${index}_${section.toLowerCase()}`,
        [{ title, name: title, type: 'image', url, source: 'direct' }],
      ])),
    });
    const routedSession = activeMedia('unrelated-routed-session', 'singers');
    const projector = await openAuthenticatedOutput(browser, projectorPath);

    try {
      await updateControllerE2EEvent({
        setlist: [{ idLocal: 'e2e-section-controller-song', type: 'song', value: song.id }],
        canciones: [song.id],
        mediaOutputs: { singers: routedSession },
        canvaOutputs: {},
        proyectorApagado: false,
      });
      await login(page, USERS.multimedia);
      await page.goto(controllerPath);
      await page.getByRole('button', { name: new RegExp(song.titulo) }).click();

      for (const [expectedIndex, sectionData] of [
        mediaBySection[0], mediaBySection[1], mediaBySection[2], mediaBySection[1], mediaBySection[0],
      ].entries()) {
        const expectedSectionIndex = [0, 1, 2, 1, 0][expectedIndex];
        await page.locator('div.hidden.md\\:flex span', { hasText: new RegExp(`^${sectionData.section}$`) }).click();
        await expect(page.getByRole('button', { name: 'Proyectar Diapositiva', exact: true })).toBeEnabled();
        await page.getByRole('button', { name: 'Proyectar Diapositiva', exact: true }).click();
        await expect.poll(async () => {
          const event = await readFirestoreDocument('eventos', CONTROLLER_EVENT_ID);
          return {
            section: event?.liveState?.activeSectionIndex,
            background: event?.projectorState?.backgroundMedia?.title,
            legacyBackground: event?.proyectorFondoMedia?.title,
            session: event?.mediaOutputs?.singers?.sessionId,
          };
        }).toEqual({
          section: expectedSectionIndex,
          background: sectionData.title,
          legacyBackground: sectionData.title,
          session: routedSession.sessionId,
        });
        await expect.poll(async () => projector.page.locator('img').evaluateAll((images) => images.some((image) => image.src.includes('data:image/svg+xml')))).toBe(true);
      }

      await projector.page.reload();
      await expect.poll(async () => projector.page.locator('img').evaluateAll((images) => images.some((image) => image.src.includes('data:image/svg+xml')))).toBe(true);
      const lateJoin = await openAuthenticatedOutput(browser, projectorPath);
      try {
        await expect.poll(async () => lateJoin.page.locator('img').evaluateAll((images) => images.some((image) => image.src.includes('data:image/svg+xml')))).toBe(true);
        expect(lateJoin.errors, lateJoin.errors.join('\n')).toEqual([]);
      } finally {
        await lateJoin.context.close();
      }
      expect(projector.errors, projector.errors.join('\n')).toEqual([]);
    } finally {
      await projector.context.close();
      await deleteE2EResource('canciones', song.id);
    }
  });

  test('CG-RT-001 and CG-RT-007 outputs receive lyrics through Firestore realtime and after reload', async ({ browser }) => {
    const output = await openAuthenticatedOutput(browser, singersPath);
    try {
      await updateControllerE2EEvent({
        projectorState: { type: 'lyrics', contentType: 'lyrics', title: 'E2E-QA-CONTROLLER-SONG-B' },
        proyectorSlide: { titulo: 'E2E-QA-CONTROLLER-SONG-B', texto: 'Letra realtime CG' },
        projectionTargets: { projector: true, singers: true, musicians: false },
        proyectorApagado: false,
        canvaOutputs: {},
        mediaOutputs: {},
        liveState: { activeContentType: 'lyrics', activeContentTitle: 'E2E-QA-CONTROLLER-SONG-B', updatedAt: Date.now(), updatedBy: 'E2E controller' }
      });
      await expect(output.page.getByText('Letra realtime CG')).toBeVisible();
      await output.page.reload();
      await expect(output.page.getByText('Letra realtime CG')).toBeVisible();
      expect(output.errors, output.errors.join('\n')).toEqual([]);
    } finally {
      await output.context.close();
    }
  });

  test('CG-BIBLE-001 through CG-BIBLE-007 update, change, transition, and recover Bible without reload errors', async ({ browser }) => {
    const output = await openAuthenticatedOutput(browser, projectorPath);
    try {
      const john = bibleState('Juan 11:35', 'Jesus lloró.');
      await updateControllerE2EEvent({
        projectorState: john,
        proyectorSlide: null,
        proyectorApagado: false,
        mediaOutputs: {},
        canvaOutputs: {},
        liveState: { activeContentType: 'bible', activeContentTitle: 'Juan 11:35', updatedAt: Date.now() },
      });
      await expect(output.page.getByText('Jesus lloró.')).toBeVisible();
      await updateControllerE2EEvent({ projectorState: bibleState('Juan 11:36', 'Entonces dijeron los judíos: Mirad cómo le amaba.') });
      await expect(output.page.getByText('Entonces dijeron los judíos: Mirad cómo le amaba.')).toBeVisible();
      await output.page.reload();
      await expect(output.page.getByText('Entonces dijeron los judíos: Mirad cómo le amaba.')).toBeVisible();
      await updateControllerE2EEvent({ mediaOutputs: { projector: activeMedia('bible-to-media', 'projector') } });
      await expect(output.page.locator('img')).toHaveCount(1);
      await updateControllerE2EEvent({ projectorState: john, mediaOutputs: {} });
      await expect(output.page.getByText('Jesus lloró.')).toBeVisible();
      await updateControllerE2EEvent({ canvaOutputs: { projector: canvaRoute('Biblia a Canva') } });
      await expect(output.page.locator('iframe[title="Biblia a Canva"]')).toBeVisible();
      expect(output.errors, output.errors.join('\n')).toEqual([]);
    } finally {
      await output.context.close();
    }
  });

  test('CG-BIBLE-NAV-001 advances and reverses an active Bible deck without projecting the passage again', async ({ page, browser }) => {
    const output = await openAuthenticatedOutput(browser, projectorPath);
    const slides = [
      { reference: 'Juan 3:16', translation: 'RVR60', text: 'Versiculo uno' },
      { reference: 'Juan 3:17', translation: 'RVR60', text: 'Versiculo dos' },
      { reference: 'Juan 3:18', translation: 'RVR60', text: 'Versiculo tres' },
      { reference: 'Juan 3:19', translation: 'RVR60', text: 'Versiculo cuatro' },
    ];
    try {
      await updateControllerE2EEvent({
        projectorState: {
          ...bibleState(slides[0].reference, slides[0].text),
          previousProjectionFields: {},
          bibleSlideIndex: 0,
          bible: { slideIndex: 0, slideCount: slides.length, slides },
        },
        proyectorApagado: false,
        proyectorSlide: null,
        proyectorMedia: null,
        proyectorLogo: false,
        proyectorFondo: null,
        proyectorFondoMedia: null,
        proyectorSongId: null,
        proyectorSlideIndex: -1,
        proyectorNextSlide: null,
        proyectorNextSong: null,
        proyectorOffset: 0,
        currentSongId: null,
        liveState: { activeContentType: 'bible', activeContentTitle: slides[0].reference, updatedAt: Date.now() },
        mediaOutputs: {},
        canvaOutputs: {},
      });

      await login(page, USERS.multimedia);
      await page.goto(controllerPath);
      await page.getByRole('button', { name: 'Biblia', exact: true }).first().click();
      await expect(page.getByText('1 / 4', { exact: true })).toBeVisible();

      for (let index = 1; index < slides.length; index += 1) {
        await page.getByRole('button', { name: 'Siguiente', exact: true }).last().click();
        await expect.poll(async () => {
          const state = (await readFirestoreDocument('eventos', CONTROLLER_EVENT_ID))?.projectorState;
          return [state?.bible?.slideIndex, state?.content];
        }).toEqual([index, slides[index].text]);
        await expect(output.page.getByText(slides[index].text)).toBeVisible();
      }

      await expect(page.getByRole('button', { name: 'Siguiente', exact: true }).last()).toBeDisabled();
      for (let index = slides.length - 2; index >= 0; index -= 1) {
        await page.getByRole('button', { name: 'Anterior', exact: true }).last().click();
        await expect.poll(async () => {
          const state = (await readFirestoreDocument('eventos', CONTROLLER_EVENT_ID))?.projectorState;
          return [state?.bible?.slideIndex, state?.content];
        }).toEqual([index, slides[index].text]);
      }
      await expect(page.getByRole('button', { name: 'Anterior', exact: true }).last()).toBeDisabled();
      expect(output.errors, output.errors.join('\n')).toEqual([]);
    } finally {
      await output.context.close();
    }
  });

  test('CG-OUTPUT-003 sends one projection to all three output receivers without refresh', async ({ browser }) => {
    const projector = await openAuthenticatedOutput(browser, projectorPath);
    const singers = await openAuthenticatedOutput(browser, singersPath);
    const musicians = await openAuthenticatedOutput(browser, musiciansPath);
    try {
      await updateControllerE2EEvent({
        projectorState: { type: 'lyrics', contentType: 'lyrics', title: 'E2E-QA-CONTROLLER-SONG-C' },
        proyectorSlide: { titulo: 'E2E-QA-CONTROLLER-SONG-C', texto: 'Tres salidas realtime CG' },
        projectionTargets: { projector: true, singers: true, musicians: true },
        proyectorApagado: false,
        canvaOutputs: {},
        mediaOutputs: {},
        liveState: {
          activeSongId: null,
          activeSongTitle: 'E2E-QA-CONTROLLER-SONG-C',
          activeContentType: 'lyrics',
          activeContentTitle: 'E2E-QA-CONTROLLER-SONG-C',
          updatedAt: Date.now(),
          updatedBy: 'E2E controller'
        }
      });
      await Promise.all([
        expect(projector.page.getByText('Tres salidas realtime CG')).toBeVisible(),
        expect(singers.page.getByText('Tres salidas realtime CG')).toBeVisible(),
        // El retorno de músicos no replica la diapositiva: presenta el estado
        // de canción en vivo para la banda.
        expect(musicians.page.getByRole('heading', { name: 'E2E-QA-CONTROLLER-SONG-C' })).toBeVisible(),
      ]);
      expect(projector.errors, projector.errors.join('\n')).toEqual([]);
      expect(singers.errors, singers.errors.join('\n')).toEqual([]);
      expect(musicians.errors, musicians.errors.join('\n')).toEqual([]);
    } finally {
      await Promise.all([projector.context.close(), singers.context.close(), musicians.context.close()]);
    }
  });

  test('CG-RT-002 and CG-MEDIA-005 keep two routed media sessions independent by target', async ({ browser }) => {
    const projector = await openAuthenticatedOutput(browser, projectorPath);
    const singers = await openAuthenticatedOutput(browser, singersPath);
    try {
      await updateControllerE2EEvent({
        projectorState: { type: 'lyrics', contentType: 'lyrics', title: 'E2E media routes' },
        proyectorSlide: null,
        proyectorApagado: false,
        canvaOutputs: {},
        mediaOutputs: {
          projector: activeMedia('video-a', 'projector'),
          singers: activeMedia('video-b', 'singers')
        },
        liveState: { activeContentType: 'media', activeContentTitle: 'E2E media routes', updatedAt: Date.now(), updatedBy: 'E2E controller' }
      });
      await expect(projector.page.locator('img')).toHaveCount(1);
      await expect(singers.page.locator('img')).toHaveCount(1);
      expect(projector.errors, projector.errors.join('\n')).toEqual([]);
      expect(singers.errors, singers.errors.join('\n')).toEqual([]);
    } finally {
      await Promise.all([projector.context.close(), singers.context.close()]);
    }
  });

  test('CG-MEDIA-SHARED-001 through CG-MEDIA-SHARED-005 keep a shared session across late-joining outputs', async ({ browser }) => {
    const projector = await openAuthenticatedOutput(browser, projectorPath);
    const singers = await openAuthenticatedOutput(browser, singersPath);
    const musicians = await openAuthenticatedOutput(browser, musiciansPath);
    try {
      const shared = activeMedia('shared-video-a', 'projector');
      await updateControllerE2EEvent({
        projectorState: { type: 'media', contentType: 'media', title: 'Video A', media: shared },
        proyectorSlide: null,
        proyectorApagado: false,
        canvaOutputs: {},
        mediaOutputs: { projector: shared, singers: { ...shared, volume: 0 } },
        liveState: { activeContentType: 'media', activeContentTitle: 'Video A', updatedAt: Date.now() },
      });
      await Promise.all([expect(projector.page.locator('img')).toHaveCount(1), expect(singers.page.locator('img')).toHaveCount(1)]);
      const lateJoin = { ...shared, volume: 0, positionSec: 3, anchorAt: Date.now(), syncVersion: 2 };
      await updateControllerE2EEvent({ mediaOutputs: { projector: shared, singers: { ...shared, volume: 0 }, musicians: lateJoin } });
      await expect(musicians.page.locator('img')).toHaveCount(1);
      const event = await readFirestoreDocument('eventos', CONTROLLER_EVENT_ID);
      expect(event.mediaOutputs.projector.sessionId).toBe(event.mediaOutputs.singers.sessionId);
      expect(event.mediaOutputs.projector.sessionId).toBe(event.mediaOutputs.musicians.sessionId);
      await updateControllerE2EEvent({ mediaOutputs: { projector: shared, musicians: lateJoin } });
      await expect(singers.page.locator('img')).toHaveCount(0);
      await musicians.page.reload();
      await expect(musicians.page.locator('img')).toHaveCount(1);
      expect(projector.errors, projector.errors.join('\n')).toEqual([]);
      expect(singers.errors, singers.errors.join('\n')).toEqual([]);
      expect(musicians.errors, musicians.errors.join('\n')).toEqual([]);
    } finally {
      await Promise.all([projector.context.close(), singers.context.close(), musicians.context.close()]);
    }
  });

  test('CG-MEDIA-PLAY-001, CG-MEDIA-SEEK-001/002, and CG-MEDIA-LOOP-001/002/003 control only the matching session', async ({ page, browser }) => {
    const projector = await openAuthenticatedOutput(browser, projectorPath);
    const singers = await openAuthenticatedOutput(browser, singersPath);
    const musicians = await openAuthenticatedOutput(browser, musiciansPath);
    try {
      const shared = activeVideo('controller-video-a', 'projector', 'session-controller-a');
      const independent = activeVideo('controller-video-b', 'musicians', 'session-controller-b');
      await updateControllerE2EEvent({
        projectorState: { type: 'media', contentType: 'media', title: 'E2E Video A', media: shared },
        proyectorSlide: null,
        proyectorMedia: shared,
        proyectorApagado: false,
        canvaOutputs: {},
        mediaOutputs: {
          projector: shared,
          singers: { ...shared, volume: 0 },
          musicians: independent,
        },
        liveState: { activeContentType: 'media', activeContentTitle: 'E2E Video A', updatedAt: Date.now(), updatedBy: 'E2E controller' },
      });

      await login(page, USERS.multimedia);
      await page.goto(controllerPath);
      await page.getByRole('button', { name: 'Multimedia', exact: true }).first().click();
      await expect(page.getByText(/reproducciones activas/i).first()).toBeVisible();
      await expect.poll(async () => (await readFirestoreDocument('eventos', CONTROLLER_EVENT_ID))?.mediaOutputs?.projector?.sessionId).toBe('session-controller-a');
      await Promise.all([
        expect(projector.page.locator('video')).toHaveCount(1),
        expect(singers.page.locator('video')).toHaveCount(1),
        expect(musicians.page.locator('video')).toHaveCount(1),
      ]);

      await page.getByTitle('Pausar').first().click();
      await expect.poll(async () => {
        const outputs = (await readFirestoreDocument('eventos', CONTROLLER_EVENT_ID))?.mediaOutputs;
        return [outputs?.projector?.playing, outputs?.singers?.playing, outputs?.musicians?.playing];
      }).toEqual([false, false, true]);
      const paused = await readFirestoreDocument('eventos', CONTROLLER_EVENT_ID);
      expect(paused.mediaOutputs.projector.sessionId).toBe('session-controller-a');
      expect(paused.mediaOutputs.singers.sessionId).toBe('session-controller-a');
      expect(paused.mediaOutputs.musicians.sessionId).toBe('session-controller-b');

      await page.getByTitle('Reproducir').first().click();
      await expect.poll(async () => {
        const outputs = (await readFirestoreDocument('eventos', CONTROLLER_EVENT_ID))?.mediaOutputs;
        return [outputs?.projector?.playing, outputs?.singers?.playing, outputs?.musicians?.playing];
      }).toEqual([true, true, true]);

      const beforeSeek = await readFirestoreDocument('eventos', CONTROLLER_EVENT_ID);
      await page.getByTitle('+10 segundos').first().click();
      await expect.poll(async () => {
        const outputs = (await readFirestoreDocument('eventos', CONTROLLER_EVENT_ID))?.mediaOutputs;
        return outputs?.projector?.syncVersion;
      }).toBeGreaterThan(beforeSeek.mediaOutputs.projector.syncVersion);
      const afterSeek = await readFirestoreDocument('eventos', CONTROLLER_EVENT_ID);
      expect(afterSeek.mediaOutputs.projector.sessionId).toBe('session-controller-a');
      expect(afterSeek.mediaOutputs.singers.sessionId).toBe('session-controller-a');
      expect(afterSeek.mediaOutputs.musicians).toEqual(beforeSeek.mediaOutputs.musicians);
      expect(afterSeek.mediaOutputs.projector.positionSec).toBeGreaterThanOrEqual(beforeSeek.mediaOutputs.projector.positionSec + 9);
      expect(afterSeek.mediaOutputs.singers.positionSec).toBeGreaterThanOrEqual(beforeSeek.mediaOutputs.singers.positionSec + 9);

      await page.getByRole('button', { name: 'Bucle off', exact: true }).first().click();
      await expect.poll(async () => {
        const outputs = (await readFirestoreDocument('eventos', CONTROLLER_EVENT_ID))?.mediaOutputs;
        return [outputs?.projector?.loop, outputs?.singers?.loop, outputs?.musicians?.loop];
      }).toEqual([true, true, false]);
      const loopOn = await readFirestoreDocument('eventos', CONTROLLER_EVENT_ID);
      await page.getByRole('button', { name: 'Bucle activo', exact: true }).first().click();
      await expect.poll(async () => (await readFirestoreDocument('eventos', CONTROLLER_EVENT_ID))?.mediaOutputs?.projector?.loop).toBe(false);
      const loopOff = await readFirestoreDocument('eventos', CONTROLLER_EVENT_ID);
      await expect.poll(async () => (await readFirestoreDocument('eventos', CONTROLLER_EVENT_ID))?.mediaOutputs?.projector?.updatedAt).toBe(loopOff.mediaOutputs.projector.updatedAt);
      expect(loopOn.mediaOutputs.musicians).toEqual(loopOff.mediaOutputs.musicians);
      expect(projector.errors, projector.errors.join('\n')).toEqual([]);
      expect(singers.errors, singers.errors.join('\n')).toEqual([]);
      expect(musicians.errors, musicians.errors.join('\n')).toEqual([]);
    } finally {
      await Promise.all([projector.context.close(), singers.context.close(), musicians.context.close()]);
    }
  });

  test('CG-PANIC-MEDIA-001/002 preserve routed media sessions through controller PANIC and restore', async ({ page, browser }) => {
    const projector = await openAuthenticatedOutput(browser, projectorPath);
    const singers = await openAuthenticatedOutput(browser, singersPath);
    const musicians = await openAuthenticatedOutput(browser, musiciansPath);
    try {
      const shared = activeVideo('panic-video-a', 'projector', 'session-panic-a');
      const distinct = activeVideo('panic-video-b', 'musicians', 'session-panic-b');
      await updateControllerE2EEvent({
        projectorState: { type: 'media', contentType: 'media', title: 'PANIC Video A', media: shared },
        proyectorSlide: null,
        proyectorMedia: shared,
        proyectorApagado: false,
        canvaOutputs: {},
        mediaOutputs: { projector: shared, singers: { ...shared, volume: 0 }, musicians: distinct },
        liveState: { activeContentType: 'media', activeContentTitle: 'PANIC Video A', updatedAt: Date.now(), updatedBy: 'E2E controller' },
      });
      const before = await readFirestoreDocument('eventos', CONTROLLER_EVENT_ID);

      await login(page, USERS.multimedia);
      await page.goto(controllerPath);
      await page.getByRole('button', { name: 'PANIC', exact: true }).click();
      await expect.poll(async () => (await readFirestoreDocument('eventos', CONTROLLER_EVENT_ID))?.proyectorApagado).toBe(true);
      await Promise.all([
        expect(projector.page.locator('video')).toHaveCount(0),
        expect(singers.page.getByLabel('Pantalla apagada')).toBeVisible(),
        expect(musicians.page.getByLabel('Pantalla apagada')).toBeVisible(),
      ]);

      const blackedOut = await readFirestoreDocument('eventos', CONTROLLER_EVENT_ID);
      expect(blackedOut.mediaOutputs).toEqual(before.mediaOutputs);
      await page.getByRole('button', { name: 'Apagado', exact: true }).click();
      await expect.poll(async () => (await readFirestoreDocument('eventos', CONTROLLER_EVENT_ID))?.proyectorApagado).toBe(false);
      const restored = await readFirestoreDocument('eventos', CONTROLLER_EVENT_ID);
      expect(restored.mediaOutputs).toEqual(before.mediaOutputs);
      expect(restored.projectorState).toEqual(before.projectorState);
      await Promise.all([
        expect(projector.page.locator('video')).toHaveCount(1),
        expect(singers.page.locator('video')).toHaveCount(1),
        expect(musicians.page.locator('video')).toHaveCount(1),
      ]);
      expect(projector.errors, projector.errors.join('\n')).toEqual([]);
      expect(singers.errors, singers.errors.join('\n')).toEqual([]);
      expect(musicians.errors, musicians.errors.join('\n')).toEqual([]);
    } finally {
      await Promise.all([projector.context.close(), singers.context.close(), musicians.context.close()]);
    }
  });

  test('CG-QMSG-002 and CG-PANIC-001 propagate message then blackout without a render error', async ({ browser }) => {
    const output = await openAuthenticatedOutput(browser, projectorPath);
    try {
      await updateControllerE2EEvent({
        projectorState: {
          type: 'preaching', contentType: 'quickMessage', preachingType: 'quickMessage',
          title: 'Mensaje realtime CG', content: 'Mensaje realtime CG',
          segments: [{ text: 'Mensaje realtime CG', color: 'white', bold: true }],
          alignment: 'center', projectionActionId: 'e2e-quick-message'
        },
        proyectorSlide: null,
        proyectorApagado: false,
        canvaOutputs: {},
        mediaOutputs: {},
        liveState: { activeContentType: 'quickMessage', activeContentTitle: 'Mensaje realtime CG', updatedAt: Date.now(), updatedBy: 'E2E controller' }
      });
      await expect(output.page.getByText('Mensaje realtime CG')).toBeVisible();
      await updateControllerE2EEvent({ proyectorApagado: true });
      await expect.poll(async () => (await readFirestoreDocument('eventos', CONTROLLER_EVENT_ID))?.proyectorApagado).toBe(true);
      await expect(output.page.getByText('Mensaje realtime CG')).toHaveCount(0);
      await updateControllerE2EEvent({ proyectorApagado: false });
      await expect(output.page.getByText('Mensaje realtime CG')).toBeVisible();
      expect(output.errors, output.errors.join('\n')).toEqual([]);
    } finally {
      await output.context.close();
    }
  });
});
