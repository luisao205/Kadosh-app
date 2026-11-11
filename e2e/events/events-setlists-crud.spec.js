import { expect } from '@playwright/test';
import { login, test, USERS } from '../fixtures/app.js';
import {
  createE2EEvent,
  createE2ESong,
  deleteE2EResource,
  e2eId,
  findFirestoreDocumentsByTitle,
  readFirestoreDocument,
  updateE2EEvent,
} from '../helpers/firestoreAdmin.js';

async function openEventEditor(page, eventId) {
  const card = page.getByTestId(`event-card-${eventId}`);
  await expect(card).toBeVisible();
  await card.getByTitle(/editar evento/i).click();
  await expect(page.getByLabel(/nombre del evento/i)).toBeVisible();
}

async function addSongToSetlistFromSearch(page, song) {
  const search = page.getByPlaceholder(/buscar por titulo, artista o letra/i);
  const option = page.getByTestId(`setlist-song-option-${song.id}`);
  await search.fill(song.titulo);
  await expect(option).toBeVisible();
  await option.click();
  await expect(search).toHaveValue('');
}

async function moveSetlistItemBefore(page, sourceTitle, targetTitle) {
  const source = page.locator('[draggable="true"]').filter({ hasText: sourceTitle });
  const target = page.locator('[draggable="true"]').filter({ hasText: targetTitle });
  await expect(source).toBeVisible();
  await expect(target).toBeVisible();

  await source.evaluate((sourceElement, { targetTitle: nextTargetTitle }) => {
    const targetElement = [...document.querySelectorAll('[draggable="true"]')]
      .find((element) => element.textContent?.includes(nextTargetTitle));
    if (!targetElement) throw new Error(`No se encontró el destino del setlist: ${nextTargetTitle}`);

    const dataTransfer = new DataTransfer();
    sourceElement.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer }));
    targetElement.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
    targetElement.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
    sourceElement.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer }));
  }, { targetTitle });
}

test('EVENT-001 crea evento desde UI y EVENT-002 no crea evento inválido', async ({ page }) => {
  const titulo = e2eId('EVENT-CREATE');
  await login(page, USERS.owner);
  await page.goto('/eventos');
  await page.getByRole('button', { name: /programar evento/i }).click();
  await page.getByRole('button', { name: /agendar evento/i }).click();
  expect(await page.getByLabel(/nombre del evento/i).evaluate((input) => input.validity.valueMissing)).toBe(true);
  expect(await findFirestoreDocumentsByTitle('eventos', titulo)).toEqual([]);

  await page.getByLabel(/nombre del evento/i).fill(titulo);
  await page.getByLabel(/fecha del evento/i).fill('2026-12-20T10:00');
  await page.getByLabel(/^lugar$/i).fill('Auditorio E2E-QA');
  await page.getByRole('button', { name: /agendar evento/i }).click();
  await expect(page.getByText(/evento programado exitosamente/i)).toBeVisible();
  await expect.poll(async () => (await findFirestoreDocumentsByTitle('eventos', titulo)).length).toBe(1);
  const [event] = await findFirestoreDocumentsByTitle('eventos', titulo);
  try {
    await expect(page.getByText(titulo)).toBeVisible();
    expect(event).toMatchObject({ titulo, lugar: 'Auditorio E2E-QA', estado: 'programado', completado: false });
  } finally {
    await deleteE2EResource('eventos', event.id);
  }
});

test('EVENT-003 edita y EVENT-004 marca completado usando UI', async ({ page }) => {
  const event = await createE2EEvent();
  try {
    await login(page, USERS.owner);
    await page.goto('/eventos');
    await openEventEditor(page, event.id);
    await page.getByLabel(/^lugar$/i).fill('Lugar E2E-QA editado');
    await page.getByRole('button', { name: /actualizar cambios/i }).click();
    await expect(page.getByText(/evento actualizado exitosamente/i)).toBeVisible();
    await expect.poll(async () => (await readFirestoreDocument('eventos', event.id))?.lugar).toBe('Lugar E2E-QA editado');

    const card = page.getByTestId(`event-card-${event.id}`);
    await card.getByTitle(/marcar como completado/i).click();
    await expect.poll(async () => (await readFirestoreDocument('eventos', event.id))?.completado).toBe(true);
  } finally {
    await deleteE2EResource('eventos', event.id);
  }
});

test('SETLIST-001 a SETLIST-005 agrega, ordena, quita y conserva canciones E2E', async ({ page }) => {
  const event = await createE2EEvent();
  const firstSong = await createE2ESong({ titulo: e2eId('SETLIST-FIRST') });
  const secondSong = await createE2ESong({ titulo: e2eId('SETLIST-SECOND') });
  try {
    await login(page, USERS.owner);
    await page.goto('/eventos');
    await openEventEditor(page, event.id);
    await addSongToSetlistFromSearch(page, firstSong);
    await page.getByRole('button', { name: /actualizar cambios/i }).click();
    await expect.poll(async () => (await readFirestoreDocument('eventos', event.id))?.canciones).toEqual([firstSong.id]);

    await page.reload();
    await openEventEditor(page, event.id);
    await addSongToSetlistFromSearch(page, secondSong);

    await moveSetlistItemBefore(page, secondSong.titulo, firstSong.titulo);
    await page.getByRole('button', { name: /actualizar cambios/i }).click();
    await expect(page.getByText(/evento actualizado exitosamente/i)).toBeVisible();
    await expect.poll(async () => (await readFirestoreDocument('eventos', event.id))?.canciones).toEqual([secondSong.id, firstSong.id]);

    await page.reload();
    await openEventEditor(page, event.id);
    const secondPersisted = page.locator('[draggable="true"]').filter({ hasText: secondSong.titulo });
    await expect(secondPersisted).toBeVisible();
    await secondPersisted.getByRole('button', { name: /quitar elemento del setlist/i }).click();
    await page.getByRole('button', { name: /actualizar cambios/i }).click();
    await expect.poll(async () => (await readFirestoreDocument('eventos', event.id))?.canciones).toEqual([firstSong.id]);
  } finally {
    await deleteE2EResource('eventos', event.id);
    await deleteE2EResource('canciones', firstSong.id);
    await deleteE2EResource('canciones', secondSong.id);
  }
});

test('SETLIST-RT-001 conserva el borrador local durante un snapshot y guarda el reorder', async ({ page }) => {
  const event = await createE2EEvent();
  const firstSong = await createE2ESong({ titulo: e2eId('SETLIST-RT-FIRST') });
  const secondSong = await createE2ESong({ titulo: e2eId('SETLIST-RT-SECOND') });
  try {
    await login(page, USERS.owner);
    await page.goto('/eventos');
    await openEventEditor(page, event.id);
    await addSongToSetlistFromSearch(page, firstSong);
    await addSongToSetlistFromSearch(page, secondSong);

    await updateE2EEvent(event.id, { notas: 'Actualización remota E2E sin setlist' });
    await expect.poll(async () => (await readFirestoreDocument('eventos', event.id))?.notas)
      .toBe('Actualización remota E2E sin setlist');

    await expect(page.locator('[draggable="true"]').filter({ hasText: firstSong.titulo })).toBeVisible();
    await expect(page.locator('[draggable="true"]').filter({ hasText: secondSong.titulo })).toBeVisible();
    await moveSetlistItemBefore(page, secondSong.titulo, firstSong.titulo);
    await page.getByRole('button', { name: /actualizar cambios/i }).click();
    await expect.poll(async () => (await readFirestoreDocument('eventos', event.id))?.canciones)
      .toEqual([secondSong.id, firstSong.id]);

    await page.reload();
    await openEventEditor(page, event.id);
    const persistedItems = page.locator('[draggable="true"]');
    await expect(persistedItems.nth(0)).toContainText(secondSong.titulo);
    await expect(persistedItems.nth(1)).toContainText(firstSong.titulo);
  } finally {
    await deleteE2EResource('eventos', event.id);
    await deleteE2EResource('canciones', firstSong.id);
    await deleteE2EResource('canciones', secondSong.id);
  }
});

test('SETLIST-RT-002 un cambio remoto no relacionado no descarta altas ni bajas locales', async ({ page }) => {
  const firstSong = await createE2ESong({ titulo: e2eId('SETLIST-RT-KEEP') });
  const secondSong = await createE2ESong({ titulo: e2eId('SETLIST-RT-REMOVE') });
  const event = await createE2EEvent({
    setlist: [
      { idLocal: 'e2e-keep', type: 'song', value: firstSong.id },
      { idLocal: 'e2e-remove', type: 'song', value: secondSong.id },
    ],
    canciones: [firstSong.id, secondSong.id],
  });
  try {
    await login(page, USERS.owner);
    await page.goto('/eventos');
    await openEventEditor(page, event.id);
    await page.locator('[draggable="true"]').filter({ hasText: secondSong.titulo })
      .getByRole('button', { name: /quitar elemento del setlist/i }).click();

    await updateE2EEvent(event.id, { lugar: 'Cambio remoto E2E sin setlist' });
    await expect.poll(async () => (await readFirestoreDocument('eventos', event.id))?.lugar)
      .toBe('Cambio remoto E2E sin setlist');

    await expect(page.locator('[draggable="true"]').filter({ hasText: firstSong.titulo })).toBeVisible();
    await expect(page.locator('[draggable="true"]').filter({ hasText: secondSong.titulo })).toHaveCount(0);
  } finally {
    await deleteE2EResource('eventos', event.id);
    await deleteE2EResource('canciones', firstSong.id);
    await deleteE2EResource('canciones', secondSong.id);
  }
});
