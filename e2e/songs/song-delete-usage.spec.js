import { expect } from '@playwright/test';
import { CONTROLLER_EVENT_ID, login, test, USERS } from '../fixtures/app.js';
import {
  createE2EEvent,
  createE2EMedia,
  createE2ESong,
  deleteE2EResource,
  e2eId,
  readE2EUserProfile,
  readFirestoreDocument,
  resetControllerE2EEvent,
  restoreE2EUserProfile,
  updateControllerE2EEvent,
  updateE2EUserProfile,
} from '../helpers/firestoreAdmin.js';

const OWNER_UID = 'e2e-owner';
const controllerPaths = {
  projector: `/proyector/${CONTROLLER_EVENT_ID}`,
  singers: `/retorno/${CONTROLLER_EVENT_ID}`,
  musicians: `/retorno-musicos/${CONTROLLER_EVENT_ID}`,
};

async function archive(page, song) {
  const card = page.getByTestId(`song-card-${song.id}`);
  await card.getByTitle(/archivar canci.n/i).click();
  const response = page.waitForResponse((item) => item.request().method() === 'POST' && item.url().includes('setSongArchiveState'));
  await page.getByRole('dialog').getByRole('button', { name: /^archivar$/i }).click();
  expect((await response).status()).toBe(200);
  await expect.poll(async () => (await readFirestoreDocument('canciones', song.id))?.archived).toBe(true);
}

async function openArchivedDelete(page, song) {
  await page.goto('/canciones');
  await archive(page, song);
  await page.getByRole('button', { name: /archivadas/i }).click();
  await page.getByTestId(`song-card-${song.id}`).getByTitle(/eliminar definitivamente/i).click();
}

async function previewDelete(page) {
  await page.getByRole('button', { name: /verificar eliminacion/i }).click();
}

const deleteModal = (page) => page.getByText(/eliminar cancion/i).locator('..');

async function confirmDelete(page) {
  await deleteModal(page).getByRole('button', { name: /^eliminar definitivamente$/i }).click();
  const response = page.waitForResponse((item) => (
    item.request().method() === 'POST' && item.url().includes('deleteArchivedSong')
  ));
  await page.getByRole('dialog').getByRole('button', { name: /^eliminar definitivamente$/i }).click();
  expect((await response).status()).toBe(200);
}

function startUserActivity(uid) {
  let stopped = false;
  let writes = 0;
  let firstWrite;
  const firstWriteDone = new Promise((resolve) => {
    firstWrite = resolve;
  });
  const completion = (async () => {
    while (!stopped && writes < 20) {
      writes += 1;
      await updateE2EUserProfile(uid, {
        fcmToken: `e2e-delete-activity-${writes}`,
        ultimaConexion: new Date().toISOString(),
      });
      firstWrite();
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
  })();

  return {
    firstWriteDone,
    stop: async () => {
      stopped = true;
      await completion;
    },
    get writes() {
      return writes;
    },
  };
}

const materializedMedley = (sourceId, title, { legacy = false } = {}) => ({
  titulo: title,
  artista: 'Kadosh Medleys',
  tonoOriginal: 'E',
  letraRaw: '# Parte fuente\n[E]Contenido materializado [B]con acordes\n{cue: Entrada}\n{x2}',
  cancionesOrigen: [sourceId],
  medleyConfig: {
    ...(legacy ? {} : { materializationVersion: 2 }),
    transposeMode: 'UNIFIED',
    unifiedKey: 'E',
    songs: [{ songId: sourceId, title: 'Fuente E2E', originalKey: 'C', medleyKey: 'E', materializedKey: 'E', tonosPorCantante: { Ana: 'E' } }],
    ...(legacy ? {} : { sectionPartIndexes: [0, 0] }),
  },
});

async function openOutput(browser, path) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, USERS.multimedia);
  await page.goto(path);
  return { context, page };
}

test('SONG-DELETE-001 preserves historical event assignments and materialized Medleys while autocleaning', async ({ page }) => {
  const song = await createE2ESong({ titulo: e2eId('DELETE-HISTORY'), artista: 'Artista historial', tonoOriginal: 'D', letraRaw: '# Estrofa\n[D]Historia' });
  const event = await createE2EEvent({
    titulo: e2eId('DELETE-HISTORY-EVENT'),
    fecha: '2024-01-01T10:00',
    estado: 'programado',
    completado: false,
    setlist: [{ idLocal: 'history-song', type: 'song', value: song.id }],
    canciones: [song.id],
    cantantesPorCancion: { [song.id]: 'Ana E2E' },
    corosPorCancion: { [song.id]: ['Beto E2E'] },
  });
  const media = await createE2EMedia({
    title: e2eId('DELETE-HISTORY-MEDIA'),
    usedBy: [{ entityType: 'song', entityId: song.id, songId: song.id, location: 'song-background' }],
    usageCount: 1,
  });
  const currentMedley = await createE2ESong(materializedMedley(song.id, e2eId('DELETE-MEDLEY-CURRENT')));
  const legacyMedley = await createE2ESong(materializedMedley(song.id, e2eId('DELETE-MEDLEY-LEGACY'), { legacy: true }));
  const ownerBefore = await readE2EUserProfile(OWNER_UID);
  const expectedCurrentContent = await readFirestoreDocument('canciones', currentMedley.id);
  const expectedLegacyContent = await readFirestoreDocument('canciones', legacyMedley.id);

  try {
    await updateE2EUserProfile(OWNER_UID, { favoritos: [...(ownerBefore.favoritos || []), song.id] });
    await login(page, USERS.owner);
    await openArchivedDelete(page, song);
    await previewDelete(page);

    const historySection = page.getByText(/se conservaran como historial/i).locator('..');
    const cleanSection = page.getByText(/se limpiaran automaticamente/i).locator('..');
    const medleySection = page.getByText(/medleys preservados/i).locator('..');
    await expect(historySection).toContainText(event.titulo);
    await expect(cleanSection).toContainText(/favoritos: 1/i);
    await expect(cleanSection).toContainText(/referencias multimedia: 1/i);
    await expect(medleySection).toContainText(currentMedley.titulo);
    await expect(medleySection).toContainText(legacyMedley.titulo);
    await expect(deleteModal(page).getByRole('button', { name: /^eliminar definitivamente$/i })).toBeEnabled();
    await confirmDelete(page);

    await expect.poll(async () => readFirestoreDocument('canciones', song.id)).toBeNull();
    await expect.poll(async () => (await readE2EUserProfile(OWNER_UID)).favoritos || []).not.toContain(song.id);
    await expect.poll(async () => (await readFirestoreDocument('mediaLibrary', media.id))?.usedBy || []).toEqual([]);
    expect(await readFirestoreDocument('mediaLibrary', media.id)).not.toBeNull();

    const historicalEvent = await readFirestoreDocument('eventos', event.id);
    expect(historicalEvent.setlist).toEqual([{ idLocal: 'history-song', type: 'song', value: song.id }]);
    expect(historicalEvent.canciones).toEqual([song.id]);
    expect(historicalEvent.cantantesPorCancion).toEqual({ [song.id]: 'Ana E2E' });
    expect(historicalEvent.corosPorCancion).toEqual({ [song.id]: ['Beto E2E'] });
    expect(historicalEvent.historicalSongSnapshots[song.id]).toMatchObject({ songId: song.id, titulo: song.titulo, artista: 'Artista historial', tonoOriginal: 'D' });

    for (const [medley, before] of [[currentMedley, expectedCurrentContent], [legacyMedley, expectedLegacyContent]]) {
      const after = await readFirestoreDocument('canciones', medley.id);
      expect(after.letraRaw).toBe(before.letraRaw);
      expect(after.cancionesOrigen).toEqual(before.cancionesOrigen);
      expect(after.medleyConfig).toEqual({
        ...before.medleyConfig,
        songs: before.medleyConfig.songs.map((part) => ({
          ...part,
          sourceDeleted: true,
          sourceDeletedAt: expect.any(String),
          sourceTitle: song.titulo,
          sourceArtist: 'Artista historial',
        })),
      });
    }

    await page.goto(`/setlist/${event.id}`);
    await expect(page.getByText(song.titulo, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/^historico$/i)).toBeVisible();
  } finally {
    await restoreE2EUserProfile(OWNER_UID, ownerBefore);
    await Promise.all([
      deleteE2EResource('eventos', event.id),
      deleteE2EResource('canciones', song.id),
      deleteE2EResource('canciones', currentMedley.id),
      deleteE2EResource('canciones', legacyMedley.id),
      deleteE2EResource('mediaLibrary', media.id),
    ]);
  }
});

test('SONG-DELETE-002 blocks future and active event dependencies without deleting', async ({ page }) => {
  const futureSong = await createE2ESong({ titulo: e2eId('DELETE-FUTURE') });
  const activeSong = await createE2ESong({ titulo: e2eId('DELETE-ACTIVE') });
  const futureEvent = await createE2EEvent({
    titulo: e2eId('DELETE-FUTURE-EVENT'),
    fecha: '2030-12-20T10:00',
    setlist: [{ idLocal: 'future-song', type: 'song', value: futureSong.id }],
    canciones: [futureSong.id],
  });
  const activeEvent = await createE2EEvent({
    titulo: e2eId('DELETE-ACTIVE-EVENT'),
    fecha: new Date().toISOString(),
    estado: 'en vivo',
    setlist: [{ idLocal: 'active-song', type: 'song', value: activeSong.id }],
    canciones: [activeSong.id],
    currentSongId: activeSong.id,
    liveState: { activeSongId: activeSong.id },
  });

  try {
    await login(page, USERS.owner);
    await openArchivedDelete(page, futureSong);
    await previewDelete(page);
    await expect(page.getByText(/bloquean eliminacion/i).locator('..')).toContainText(futureEvent.titulo);
    await expect(deleteModal(page).getByRole('button', { name: /^eliminar definitivamente$/i })).toBeDisabled();
    await expect(readFirestoreDocument('canciones', futureSong.id)).resolves.not.toBeNull();

    await page.getByRole('button', { name: /cancelar/i }).click();
    await openArchivedDelete(page, activeSong);
    await previewDelete(page);
    await expect(page.getByText(/bloquean eliminacion/i).locator('..')).toContainText(activeEvent.titulo);
    await expect(deleteModal(page).getByRole('button', { name: /^eliminar definitivamente$/i })).toBeDisabled();
    await expect(readFirestoreDocument('canciones', activeSong.id)).resolves.not.toBeNull();
  } finally {
    await Promise.all([
      deleteE2EResource('eventos', futureEvent.id),
      deleteE2EResource('eventos', activeEvent.id),
      deleteE2EResource('canciones', futureSong.id),
      deleteE2EResource('canciones', activeSong.id),
    ]);
  }
});

test('SONG-DELETE-003 blocks a legacy dependency that is not materialized', async ({ page }) => {
  const song = await createE2ESong({ titulo: e2eId('DELETE-UNRESOLVED') });
  const incompleteMedley = await createE2ESong({
    titulo: e2eId('DELETE-UNRESOLVED-MEDLEY'),
    cancionesOrigen: [song.id],
    letraRaw: '',
    medleyConfig: { songs: [{ songId: song.id, originalKey: 'C', medleyKey: 'E' }] },
  });
  try {
    await login(page, USERS.owner);
    await openArchivedDelete(page, song);
    await previewDelete(page);
    await expect(page.getByText(/bloquean eliminacion/i).locator('..')).toContainText(incompleteMedley.titulo);
    await expect(deleteModal(page).getByRole('button', { name: /^eliminar definitivamente$/i })).toBeDisabled();
    await expect(readFirestoreDocument('canciones', song.id)).resolves.not.toBeNull();
  } finally {
    await Promise.all([
      deleteE2EResource('canciones', song.id),
      deleteE2EResource('canciones', incompleteMedley.id),
    ]);
  }
});

test('SONG-DELETE-004 keeps a deleted-source Medley live on projector, singers, musicians, and prepare', async ({ page, browser }) => {
  const source = await createE2ESong({ titulo: e2eId('DELETE-LIVE-SOURCE'), letraRaw: '# Fuente\n[C]Fuente para medley' });
  const medley = await createE2ESong({
    ...materializedMedley(source.id, e2eId('DELETE-LIVE-MEDLEY')),
    letraRaw: '# Medley preservado\n[E]Texto preservado [B]con acordes\n{cue: Entrada}\n{x2}',
  });
  const originalController = await readFirestoreDocument('eventos', CONTROLLER_EVENT_ID);
  let outputs = [];
  try {
    await login(page, USERS.owner);
    await openArchivedDelete(page, source);
    await previewDelete(page);
    await confirmDelete(page);
    await expect.poll(async () => readFirestoreDocument('canciones', source.id)).toBeNull();

    outputs = await Promise.all([
      openOutput(browser, controllerPaths.projector),
      openOutput(browser, controllerPaths.singers),
      openOutput(browser, controllerPaths.musicians),
    ]);
    await updateControllerE2EEvent({
      projectorState: { type: 'lyrics', contentType: 'lyrics', title: medley.titulo, updatedAt: Date.now() },
      projectionTargets: { projector: true, singers: true, musicians: true },
      proyectorSlide: { titulo: 'Medley preservado', texto: 'Texto preservado con acordes' },
      proyectorNextSlide: { titulo: 'Preparar', texto: 'Preparar fuente eliminada' },
      proyectorNextSong: medley.titulo,
      proyectorSongId: medley.id,
      proyectorSlideIndex: 1,
      proyectorApagado: false,
      canvaOutputs: {},
      mediaOutputs: {},
      liveState: {
        activeSongId: medley.id,
        activeSongTitle: medley.titulo,
        activeSectionIndex: 1,
        activeSectionTitle: 'Medley preservado',
        activeContentType: 'lyrics',
        activeContentTitle: medley.titulo,
        updatedAt: Date.now(),
      },
    });

    const [projector, singers, musicians] = outputs;
    await Promise.all([
      expect.poll(async () => (await projector.page.locator('body').textContent() || '').replace(/\s+/g, '')).toContain('Textopreservadoconacordes'),
      expect.poll(async () => (await singers.page.locator('body').textContent() || '').replace(/\s+/g, '')).toContain('Textopreservadoconacordes'),
      expect(musicians.page.getByRole('heading', { name: medley.titulo })).toBeVisible(),
      expect(musicians.page.getByRole('banner').getByText('E', { exact: true })).toBeVisible(),
      expect(singers.page.getByText('Preparar fuente eliminada', { exact: true })).toBeVisible(),
      expect(musicians.page.getByText('Preparar fuente eliminada', { exact: true })).toBeVisible(),
    ]);
  } finally {
    await Promise.all(outputs.map(({ context }) => context.close()));
    await resetControllerE2EEvent(originalController);
    await Promise.all([
      deleteE2EResource('canciones', source.id),
      deleteE2EResource('canciones', medley.id),
    ]);
  }
});

test('SONG-DELETE-005 deletes under user presence activity without overwriting unrelated profile fields', async ({ page }) => {
  const song = await createE2ESong({ titulo: e2eId('DELETE-ACTIVITY') });
  const ownerBefore = await readE2EUserProfile(OWNER_UID);
  const marker = e2eId('PROFILE-MARKER');
  let activity;

  try {
    await updateE2EUserProfile(OWNER_UID, {
      favoritos: [...(ownerBefore.favoritos || []), song.id],
      preferencias: { ...(ownerBefore.preferencias || {}), e2eDeleteMarker: marker },
    });
    await login(page, USERS.owner);
    await openArchivedDelete(page, song);
    await previewDelete(page);

    activity = startUserActivity(OWNER_UID);
    await activity.firstWriteDone;
    const deleteResponse = page.waitForResponse((response) => (
      response.request().method() === 'POST' && response.url().includes('deleteArchivedSong')
    ));
    await confirmDelete(page);
    expect((await deleteResponse).status()).toBe(200);

    await expect.poll(async () => readFirestoreDocument('canciones', song.id)).toBeNull();
    const profile = await readE2EUserProfile(OWNER_UID);
    expect(profile.favoritos || []).not.toContain(song.id);
    expect(profile.preferencias?.e2eDeleteMarker).toBe(marker);
    expect(profile.fcmToken).toMatch(/^e2e-delete-activity-/);
    expect(profile.ultimaConexion).toEqual(expect.any(String));
    expect(activity.writes).toBeGreaterThan(0);
  } finally {
    await activity?.stop();
    await restoreE2EUserProfile(OWNER_UID, ownerBefore);
    await deleteE2EResource('canciones', song.id);
  }
});
