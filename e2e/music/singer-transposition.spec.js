import { expect } from '@playwright/test';
import { CONTROLLER_EVENT_ID, login, test, USERS } from '../fixtures/app.js';
import {
  createE2ESong,
  deleteE2EResource,
  readFirestoreDocument,
  resetControllerE2EEvent,
  updateControllerE2EEvent,
} from '../helpers/firestoreAdmin.js';

const singersPath = `/retorno/${CONTROLLER_EVENT_ID}`;
const musiciansPath = `/retorno-musicos/${CONTROLLER_EVENT_ID}`;

async function openOutput(browser, path, showSingerChords = false) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, USERS.multimedia);
  if (showSingerChords) {
    await page.evaluate(() => localStorage.setItem('singerDisplay.showChords', 'true'));
  }
  await page.goto(path);
  return { context, page };
}

function lyricProjection(song, offset) {
  return {
    projectorState: { type: 'lyrics', contentType: 'lyrics', title: song.titulo, updatedAt: Date.now() },
    projectionTargets: { projector: true, singers: true, musicians: true },
    proyectorSlide: { titulo: 'Verso', texto: 'Letra canónica' },
    proyectorSongId: song.id,
    proyectorSlideIndex: 0,
    proyectorOffset: offset,
    proyectorApagado: false,
    mediaOutputs: {},
    canvaOutputs: {},
    liveState: {
      activeSongId: song.id,
      activeSongTitle: song.titulo,
      activeSongIndex: 0,
      activeSectionIndex: 0,
      activeSectionTitle: 'Verso',
      activeContentType: 'lyrics',
      activeContentTitle: song.titulo,
      updatedAt: Date.now(),
      updatedBy: 'E2E music'
    }
  };
}

test.describe.serial('Tono del cantante y medleys', () => {
  let originalEvent;
  let singerSong;
  let medley;

  test.beforeAll(async () => {
    originalEvent = await readFirestoreDocument('eventos', CONTROLLER_EVENT_ID);
    singerSong = await createE2ESong({
      titulo: `E2E-QA-SINGER-FSHARP-${Date.now()}`,
      tonoOriginal: 'F#m',
      tonosPorCantante: { Ana: 'G#m', Beto: 'F#m', Invalido: 'H' },
      letraRaw: '# Verso\n[F#m]Uno [E]dos [D]tres [Bm]cuatro'
    });
    medley = await createE2ESong({
      titulo: `E2E-QA-MEDLEY-${Date.now()}`,
      tonoOriginal: 'C',
      tonosPorCantante: { Ana: 'D' },
      letraRaw: '# --- A ---\n[D]Parte A\n\n# --- B ---\n[G#m]Parte B',
      medleyConfig: {
        transposeMode: 'PER_SONG',
        songs: [
          { songId: 'source-a', title: 'A', originalKey: 'C', medleyKey: 'D' },
          { songId: 'source-b', title: 'B', originalKey: 'F#m', medleyKey: 'G#m' }
        ]
      }
    });
  });

  test.afterEach(async () => {
    await resetControllerE2EEvent(originalEvent);
  });

  test.afterAll(async () => {
    await deleteE2EResource('canciones', singerSong.id);
    await deleteE2EResource('canciones', medley.id);
  });

  test('SINGER-LIVE-001 a 008 transposes canonical chords for the assigned singer across both returns and reload', async ({ browser }) => {
    const singers = await openOutput(browser, singersPath, true);
    const musicians = await openOutput(browser, musiciansPath);
    try {
      await updateControllerE2EEvent({
        ...lyricProjection(singerSong, 2),
        setlist: [{ type: 'song', value: singerSong.id, idLocal: `song-${singerSong.id}` }],
        canciones: [singerSong.id],
        cantantesPorCancion: { [singerSong.id]: 'Ana' }
      });
      await Promise.all([
        expect(singers.page.getByText('G#m', { exact: true })).toBeVisible(),
        expect(musicians.page.locator('#section-0').getByText('G#m', { exact: true })).toBeVisible(),
        expect(musicians.page.locator('#section-0').getByText('C#m', { exact: true })).toBeVisible(),
      ]);
      await expect(singers.page.getByText('Uno', { exact: true })).toBeVisible();
      await expect(singers.page.getByText('cuatro', { exact: true })).toBeVisible();
      await musicians.page.reload();
      await expect(musicians.page.locator('#section-0').getByText('G#m', { exact: true })).toBeVisible();

      await updateControllerE2EEvent({ ...lyricProjection(singerSong, 0), cantantesPorCancion: { [singerSong.id]: 'Beto' } });
      await Promise.all([
        expect(singers.page.getByText('F#m', { exact: true })).toBeVisible(),
        expect(musicians.page.locator('#section-0').getByText('Bm', { exact: true })).toBeVisible(),
      ]);
    } finally {
      await Promise.all([singers.context.close(), musicians.context.close()]);
    }
  });

  test('SINGER-KEY-004/005 preserve canonical output when the singer has no usable key', async ({ browser }) => {
    const musicians = await openOutput(browser, musiciansPath);
    try {
      await updateControllerE2EEvent({ ...lyricProjection(singerSong, 0), cantantesPorCancion: { [singerSong.id]: 'Invalido' } });
      await expect(musicians.page.locator('#section-0').getByText('F#m', { exact: true })).toBeVisible();
      await expect(musicians.page.locator('#section-0').getByText('Bm', { exact: true })).toBeVisible();
    } finally {
      await musicians.context.close();
    }
  });

  test('MEDLEY-003/006 preserve independently materialized sections without a global singer transpose', async ({ browser }) => {
    const musicians = await openOutput(browser, musiciansPath);
    try {
      await updateControllerE2EEvent({
        ...lyricProjection(medley, 0),
        setlist: [{ type: 'song', value: medley.id, idLocal: `song-${medley.id}` }],
        canciones: [medley.id],
        cantantesPorCancion: { [medley.id]: 'Ana' }
      });
      await expect(musicians.page.locator('#section-0').getByText('D', { exact: true })).toBeVisible();
      await updateControllerE2EEvent({
        proyectorSlide: { titulo: '--- B ---', texto: 'Parte B' },
        proyectorSlideIndex: 1,
        liveState: {
          activeSongId: medley.id,
          activeSongTitle: medley.titulo,
          activeSongIndex: 0,
          activeSectionIndex: 1,
          activeSectionTitle: '--- B ---',
          activeContentType: 'lyrics',
          activeContentTitle: medley.titulo,
          updatedAt: Date.now(),
          updatedBy: 'E2E music'
        }
      });
      await expect(musicians.page.locator('#section-1').getByText('G#m', { exact: true })).toBeVisible();
      await musicians.page.reload();
      await expect(musicians.page.locator('#section-1').getByText('G#m', { exact: true })).toBeVisible();
    } finally {
      await musicians.context.close();
    }
  });
});
