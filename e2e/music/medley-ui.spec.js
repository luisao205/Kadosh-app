import { expect } from '@playwright/test';
import { CONTROLLER_EVENT_ID, login, test, USERS } from '../fixtures/app.js';
import {
  createE2EEvent,
  createE2ESong,
  deleteE2EMedley,
  deleteE2EResource,
  readFirestoreDocument,
  resetControllerE2EEvent,
  updateControllerE2EEvent,
  updateE2EEvent,
} from '../helpers/firestoreAdmin.js';
import { normalizarTonoVisual } from '../../src/utils/musicCore.js';

const controllerPaths = {
  projector: `/proyector/${CONTROLLER_EVENT_ID}`,
  singers: `/retorno/${CONTROLLER_EVENT_ID}`,
  musicians: `/retorno-musicos/${CONTROLLER_EVENT_ID}`,
};

const sourceDefinitions = [
  {
    suffix: 'A', originalKey: 'f#', medleyKey: 'e', singer: 'Ana E2E', singerKey: 'F#',
    raw: '# A\n[F#maj7]A   conserva  espacios\n[D#m11]Linea A\n\n[F#]Final A',
    expected: ['F#maj7', 'D#m11'],
  },
  {
    suffix: 'B', originalKey: 'F#m', medleyKey: 'F#m', singer: 'Beto E2E', singerKey: 'A#m',
    raw: '# B\n[F#m]B entre [E]nosotros\n\n[C#7]Final B',
    expected: ['A#m', 'B'],
  },
  {
    suffix: 'C', originalKey: 'Bb', medleyKey: 'F#m', singer: 'Carla E2E', singerKey: 'G#m',
    raw: '# C\n[Bbadd9/D]C  texto largo\n[F]Linea C\n\n[Bb]Final C',
    expected: ['Dadd9/E', 'G'],
  },
];

async function openOutput(browser, path) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, USERS.multimedia);
  await page.goto(path);
  return { context, page };
}

async function createMedleyFromUi(page, sources, keys) {
  await login(page, USERS.owner);
  await page.goto('/canciones');
  await page.getByRole('button', { name: /crear medley/i }).click();
  const modal = page.getByText(/generador de medleys/i).locator('..').locator('..');
  const search = modal.getByPlaceholder(/buscar por titulo, artista, etiqueta o letra/i);

  for (const source of sources) {
    await search.fill(source.titulo);
    await modal.getByText(source.titulo, { exact: true }).locator('..').locator('..').click();
    await expect(search).toHaveValue('');
  }

  await modal.getByRole('button', { name: /por cancion/i }).click();
  const editableInputs = modal.locator('input:not([readonly])');
  for (let index = 0; index < keys.length; index += 1) {
    await editableInputs.nth(index + 1).fill(keys[index]);
  }
  const progression = keys
    .map(normalizarTonoVisual)
    .filter((key, index, values) => index === 0 || key !== values[index - 1])
    .join(' -> ');
  await expect(modal.getByText(progression, { exact: true })).toBeVisible();
  await modal.getByRole('button', { name: /generar fusi.n/i }).click();
  await expect(page).toHaveURL(/\/editar\//);
  return page.url().split('/editar/')[1].split(/[?#]/)[0];
}

async function createUnifiedMedleyFromUi(page, sources, targetKey) {
  await login(page, USERS.owner);
  await page.goto('/canciones');
  await page.getByRole('button', { name: /crear medley/i }).click();
  const modal = page.getByText(/generador de medleys/i).locator('..').locator('..');
  const search = modal.getByPlaceholder(/buscar por titulo, artista, etiqueta o letra/i);
  for (const source of sources) {
    await search.fill(source.titulo);
    await modal.getByText(source.titulo, { exact: true }).locator('..').locator('..').click();
  }
  await modal.getByRole('button', { name: /unificar tono/i }).click();
  await modal.getByPlaceholder(/ej\. g/i).fill(targetKey);
  await modal.getByRole('button', { name: /generar fusi.n/i }).click();
  await expect(page).toHaveURL(/\/editar\//);
  return page.url().split('/editar/')[1].split(/[?#]/)[0];
}

function lyricProjection(song, sectionIndex, section, offset) {
  return {
    projectorState: { type: 'lyrics', contentType: 'lyrics', title: song.titulo, updatedAt: Date.now() },
    projectionTargets: { projector: true, singers: true, musicians: true },
    proyectorSlide: { titulo: section.title, texto: section.text },
    proyectorSongId: song.id,
    proyectorSlideIndex: sectionIndex,
    proyectorOffset: offset,
    proyectorApagado: false,
    canvaOutputs: {},
    mediaOutputs: {},
    liveState: {
      activeSongId: song.id,
      activeSongTitle: song.titulo,
      activeSectionIndex: sectionIndex,
      activeSectionTitle: section.title,
      activeContentType: 'lyrics',
      activeContentTitle: song.titulo,
      updatedAt: Date.now(),
      updatedBy: 'E2E Medley UI',
    },
  };
}

async function addSongToSetlist(page, song) {
  const search = page.getByPlaceholder(/buscar por titulo, artista o letra/i);
  const option = page.getByTestId(`setlist-song-option-${song.id}`);
  await search.fill(song.titulo);
  await expect(option).toBeVisible();
  await option.click();
  await expect(option).toBeHidden();
  await expect(search).toHaveValue('');
}

async function openEventEditor(page, eventId) {
  await expect(page.getByRole('heading', { name: /pr.ximos eventos/i })).toBeVisible();
  const card = page.getByTestId(`event-card-${eventId}`);
  await expect(card).toBeVisible({ timeout: 15_000 });
  await card.getByTitle(/editar evento/i).click();
  await expect(page.getByLabel(/nombre del evento/i)).toBeVisible();
}

async function moveSetlistItemBefore(page, sourceTitle, targetTitle) {
  await page.locator('[draggable="true"]').filter({ hasText: sourceTitle }).evaluate((sourceElement, nextTargetTitle) => {
    const targetElement = [...document.querySelectorAll('[draggable="true"]')]
      .find((element) => element.textContent?.includes(nextTargetTitle));
    if (!targetElement) throw new Error(`No se encontro el destino ${nextTargetTitle}.`);
    const dataTransfer = new DataTransfer();
    sourceElement.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer }));
    targetElement.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
    targetElement.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
    sourceElement.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer }));
  }, targetTitle);
}

test.describe.serial('Medley materializado creado desde UI', () => {
  let originalControllerEvent;
  let sources = [];
  let twoPartMedley;
  let threePartMedley;
  let unifiedMedley;
  let event;
  let normalOne;
  let normalTwo;

  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(60_000);
    originalControllerEvent = await readFirestoreDocument('eventos', CONTROLLER_EVENT_ID);
    const createdSources = [];
    for (const definition of sourceDefinitions) {
      createdSources.push(await createE2ESong({
        titulo: `E2E-QA-MEDLEY-${definition.suffix}-${Date.now()}`,
        tonoOriginal: definition.originalKey,
        tonosPorCantante: { [definition.singer]: definition.singerKey, 'Invalido E2E': 'H' },
        letraRaw: definition.raw,
      }));
    }
    sources = createdSources;
    normalOne = await createE2ESong({ titulo: `E2E-QA-MEDLEY-NORMAL-ONE-${Date.now()}` });
    normalTwo = await createE2ESong({ titulo: `E2E-QA-MEDLEY-NORMAL-TWO-${Date.now()}` });
    event = await createE2EEvent();
  });

  test.afterEach(async () => resetControllerE2EEvent(originalControllerEvent));
  test.afterAll(async ({}, testInfo) => {
    testInfo.setTimeout(60_000);
    if (twoPartMedley?.id) await deleteE2EMedley(twoPartMedley.id, sources.slice(0, 2).map((song) => song.id));
    if (threePartMedley?.id) await deleteE2EMedley(threePartMedley.id, sources.map((song) => song.id));
    if (unifiedMedley?.id) await deleteE2EMedley(unifiedMedley.id, sources.map((song) => song.id));
    await Promise.all([
      event?.id && deleteE2EResource('eventos', event.id),
      ...sources.map((song) => deleteE2EResource('canciones', song.id)),
      normalOne?.id && deleteE2EResource('canciones', normalOne.id),
      normalTwo?.id && deleteE2EResource('canciones', normalTwo.id),
    ].filter(Boolean));
  });

  test('MEDLEY-UI-2 creates two ordered, independently materialized source parts', async ({ page }) => {
    test.setTimeout(60_000);
    const id = await createMedleyFromUi(page, sources.slice(0, 2), sourceDefinitions.slice(0, 2).map(({ medleyKey }) => medleyKey));
    const medley = await readFirestoreDocument('canciones', id);
    twoPartMedley = medley;

    expect(medley.cancionesOrigen).toEqual(sources.slice(0, 2).map((song) => song.id));
    expect(medley.medleyConfig.songs.map((part) => part.songId)).toEqual(sources.slice(0, 2).map((song) => song.id));
    expect(medley.medleyConfig.songs[0].originalKey).toBe('F#');
    expect(medley.medleyConfig.songs.map((part) => part.materializedKey)).toEqual(['E', 'F#m']);
    expect(medley.medleyConfig.tonalProgression).toEqual(['E', 'F#m']);
    expect(medley.medleyConfig.sectionPartIndexes).toEqual([0, 0, 1, 1]);
    expect(medley.letraRaw).toContain('[Emaj7]A   conserva  espacios');
    expect(medley.letraRaw).toContain('[C#m11]Linea A');
    expect(medley.letraRaw).not.toContain('[F#maj7]A   conserva  espacios');
    expect(medley.letraRaw).toContain('[F#m]B entre [E]nosotros');
  });

  test('MEDLEY-UI-3 creates three parts, preserves whitespace, and survives per-part edit', async ({ page }) => {
    test.setTimeout(60_000);
    const id = await createMedleyFromUi(page, sources, sourceDefinitions.map(({ medleyKey }) => medleyKey));
    const before = await readFirestoreDocument('canciones', id);
    threePartMedley = before;
    expect(before.medleyConfig.songs.map((part) => part.songId)).toEqual(sources.map((song) => song.id));
    expect(before.medleyConfig.songs.map((part) => part.materializedKey)).toEqual(['E', 'F#m', 'F#m']);
    expect(before.medleyConfig.tonalProgression).toEqual(['E', 'F#m']);
    expect(before.medleyConfig.sectionPartIndexes).toEqual([0, 0, 1, 1, 2, 2]);
    expect(before.letraRaw).toContain('[Emaj7]A   conserva  espacios');
    expect(before.letraRaw).toContain('[C#m11]Linea A');
    expect(before.letraRaw).toContain('[F#add9/A#]C  texto largo');

    const editor = page.getByLabel(/estructura de la canci.n/i);
    await expect(editor).toBeVisible();
    await expect(editor).toHaveValue(before.letraRaw);
    await editor.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.insertText(before.letraRaw.replace('B entre', 'B editada E2E entre'));
    await expect(editor).toHaveValue(/B editada E2E entre/);
    const saveButton = page.getByRole('button', { name: /^guardar cambios$/i }).last();
    await saveButton.click();
    await expect(saveButton).toBeEnabled({ timeout: 15_000 });
    await expect(page.getByText(/canci.n actualizada exitosamente/i)).toBeVisible();
    await expect.poll(async () => (await readFirestoreDocument('canciones', id))?.letraRaw)
      .toContain('B editada E2E entre');
    const after = await readFirestoreDocument('canciones', id);
    threePartMedley = after;
    expect(after.letraRaw).toContain('B editada E2E entre');
    expect(after.letraRaw).toContain('[Emaj7]A   conserva  espacios');
    expect(after.letraRaw).toContain('[F#add9/A#]C  texto largo');
    expect(after.medleyConfig).toEqual(before.medleyConfig);
  });

  test('MEDLEY-UNIFIED-001 materializes every source independently into the selected final key', async ({ page }) => {
    test.setTimeout(60_000);
    const id = await createUnifiedMedleyFromUi(page, sources, 'E');
    unifiedMedley = await readFirestoreDocument('canciones', id);
    expect(unifiedMedley.medleyConfig.materializationVersion).toBe(2);
    expect(unifiedMedley.medleyConfig.transposeMode).toBe('UNIFIED');
    expect(unifiedMedley.medleyConfig.unifiedKey).toBe('E');
    expect(unifiedMedley.medleyConfig.songs.map((part) => part.materializedKey)).toEqual(['E', 'E', 'E']);
    expect(unifiedMedley.letraRaw).toContain('[Emaj7]A');
    expect(unifiedMedley.letraRaw).toContain('[Em]B entre');
    expect(unifiedMedley.letraRaw).toContain('[Eadd9/G#]C');
    expect((await readFirestoreDocument('canciones', sources[0].id)).letraRaw).toContain('[F#maj7]A');
  });

  test('MEDLEY-RUNTIME-001 resolves A/B/C independently in projector, singers, musicians, reloads and edge tones', async ({ browser }) => {
    test.setTimeout(60_000);
    const projector = await openOutput(browser, controllerPaths.projector);
    const singers = await openOutput(browser, controllerPaths.singers);
    const musicians = await openOutput(browser, controllerPaths.musicians);
    const medley = await readFirestoreDocument('canciones', threePartMedley.id);
    const sections = [
      { index: 1, title: 'A', text: 'A   conserva  espacios', chord: 'F#maj7' },
      { index: 3, title: 'B', text: 'B editada E2E entre nosotros', chord: 'G#m' },
      { index: 5, title: 'C', text: 'C  texto largo', chord: 'G#add9/C' },
    ];
    const assignments = Object.fromEntries(sources.map((source, index) => [source.id, sourceDefinitions[index].singer]));
    try {
      for (const item of [...sections, sections[1], sections[0], sections[2], sections[0], sections[1]]) {
        const visibleText = item.text.replace(/\s+/g, '');
        await updateControllerE2EEvent({
          ...lyricProjection(medley, item.index, item, 2),
          cantantesPorCancion: assignments,
        });
        await Promise.all([
          expect.poll(async () => (await projector.page.locator('body').textContent() || '').replace(/\s+/g, ''))
            .toContain(visibleText),
          expect.poll(async () => (await singers.page.locator('body').textContent() || '').replace(/\s+/g, ''))
            .toContain(visibleText),
          expect(musicians.page.getByRole('heading', { name: medley.titulo })).toBeVisible(),
          expect(musicians.page.getByText(item.chord, { exact: true })).toBeVisible(),
        ]);
      }

      await musicians.page.reload();
      await expect(musicians.page.getByText('G#m', { exact: true })).toBeVisible();
      await updateControllerE2EEvent({
        ...lyricProjection(medley, 5, sections[2], 0),
        cantantesPorCancion: { [sources[2].id]: 'Invalido E2E' },
      });
      await expect(musicians.page.getByText('F#add9/A#', { exact: true })).toBeVisible();
      await updateControllerE2EEvent({
        ...lyricProjection(medley, 1, sections[0], 0),
        cantantesPorCancion: {},
      });
      await expect(musicians.page.getByText('Emaj7', { exact: true })).toBeVisible();
    } finally {
      await Promise.all([projector.context.close(), singers.context.close(), musicians.context.close()]);
    }
  });

  test('MEDLEY-SETLIST-001 through 004 preserve Medley identity, dirty draft and reorder after reload', async ({ page }) => {
    test.setTimeout(60_000);
    await login(page, USERS.owner);
    await page.goto('/eventos');
    await openEventEditor(page, event.id);
    await addSongToSetlist(page, normalOne);
    await addSongToSetlist(page, threePartMedley);
    await page.getByRole('button', { name: /actualizar cambios/i }).click();
    await expect.poll(async () => (await readFirestoreDocument('eventos', event.id))?.canciones)
      .toEqual([normalOne.id, threePartMedley.id]);

    await openEventEditor(page, event.id);
    await addSongToSetlist(page, normalTwo);
    await updateE2EEvent(event.id, { notas: 'snapshot remoto Medley E2E' });
    await expect(page.locator('[draggable="true"]').filter({ hasText: normalTwo.titulo })).toBeVisible();
    await moveSetlistItemBefore(page, threePartMedley.titulo, normalOne.titulo);
    await page.getByRole('button', { name: /actualizar cambios/i }).click();
    await expect.poll(async () => (await readFirestoreDocument('eventos', event.id))?.canciones)
      .toEqual([threePartMedley.id, normalOne.id, normalTwo.id]);

    await page.reload();
    await openEventEditor(page, event.id);
    const items = page.locator('[draggable="true"]');
    await expect(items.nth(0)).toContainText(threePartMedley.titulo);
    await expect(items.nth(1)).toContainText(normalOne.titulo);
    await expect(items.nth(2)).toContainText(normalTwo.titulo);
    const persistedMedley = await readFirestoreDocument('canciones', threePartMedley.id);
    expect(persistedMedley.medleyConfig.songs).toHaveLength(3);
  });
});
