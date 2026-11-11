import { expect } from '@playwright/test';
import { login, test, USERS } from '../fixtures/app.js';
import {
  createE2ESong,
  deleteE2EResource,
  e2eId,
  findFirestoreDocumentsByTitle,
  getSongAudit,
  readFirestoreDocument,
} from '../helpers/firestoreAdmin.js';

async function expectSongByTitle(titulo) {
  await expect.poll(async () => (await findFirestoreDocumentsByTitle('canciones', titulo)).length).toBe(1);
  return (await findFirestoreDocumentsByTitle('canciones', titulo))[0];
}

async function clickArchiveAction(page, action) {
  const response = page.waitForResponse((item) => (
    item.request().method() === 'POST'
    && item.url().includes('setSongArchiveState')
  ));
  await action.click();
  expect((await response).status()).toBe(200);
}

test('SONG-001 crea una cancion desde UI y persiste en Firestore Emulator', async ({ page }) => {
  const titulo = e2eId('SONG-CREATE');
  await login(page, USERS.owner);
  await page.goto('/añadir');
  await page.getByLabel(/t.tulo de la canci.n/i).fill(titulo);
  await page.getByLabel(/artista/i).fill('Artista E2E-QA');
  await page.getByLabel(/bpm/i).fill('128');
  await page.getByLabel(/editor de letra y acordes/i).fill('[C]Contenido creado desde UI');
  await page.getByRole('button', { name: /guardar canci.n/i }).click();
  await expect(page.getByText(/guardada exitosamente/i)).toBeVisible();

  const song = await expectSongByTitle(titulo);
  try {
    await page.goto('/canciones');
    await expect(page.getByText(titulo)).toBeVisible();
    expect(song).toMatchObject({ titulo, artista: 'Artista E2E-QA', bpm: 128, letraRaw: '[C]Contenido creado desde UI' });
  } finally {
    await deleteE2EResource('canciones', song.id);
  }
});

test('SONG-002 rechaza crear sin campos requeridos y no crea documento', async ({ page }) => {
  const absentTitle = e2eId('NO-CREATE');
  const before = await findFirestoreDocumentsByTitle('canciones', absentTitle);
  expect(before).toEqual([]);
  await login(page, USERS.owner);
  await page.goto('/añadir');
  await expect(page.getByRole('button', { name: /guardar canci.n/i })).toBeDisabled();
  expect(await findFirestoreDocumentsByTitle('canciones', absentTitle)).toEqual([]);
});

test('SONG-003 edita metadata y SONG-004/005 persisten letra y acordes por separado', async ({ page }) => {
  const song = await createE2ESong({ letraRaw: '[C]Letra inicial' });
  try {
    await login(page, USERS.owner);
    await page.goto(`/editar/${song.id}`);
    await page.getByLabel(/titulo de la canci.n/i).fill(`${song.titulo} Metadata`);
    await page.getByLabel(/artista/i).fill('Artista E2E-QA Editado');
    await page.getByLabel(/bpm/i).fill('144');
    await page.getByRole('button', { name: /^guardar cambios$/i }).click();
    await expect(page.getByText(/actualizada exitosamente/i).first()).toBeVisible({ timeout: 30_000 });
    await expect.poll(async () => (await readFirestoreDocument('canciones', song.id))?.bpm).toBe(144);

    await page.goto(`/editar/${song.id}`);
    await page.getByLabel(/estructura de la canci.n/i).fill('[C]Letra editada');
    await page.getByRole('button', { name: /^guardar cambios$/i }).click();
    await expect(page.getByText(/actualizada exitosamente/i).first()).toBeVisible({ timeout: 30_000 });
    await expect.poll(async () => (await readFirestoreDocument('canciones', song.id))?.letraRaw).toBe('[C]Letra editada');

    await page.goto(`/editar/${song.id}`);
    await page.getByLabel(/estructura de la canci.n/i).fill('[G]Letra editada');
    await page.getByRole('button', { name: /^guardar cambios$/i }).click();
    await expect.poll(async () => (await readFirestoreDocument('canciones', song.id))?.letraRaw, { timeout: 30_000 }).toBe('[G]Letra editada');
    const persisted = await readFirestoreDocument('canciones', song.id);
    expect(persisted).toMatchObject({
      titulo: `${song.titulo} Metadata`, artista: 'Artista E2E-QA Editado', bpm: 144, letraRaw: '[G]Letra editada'
    });
    const audit = await getSongAudit(song.id);
    expect(audit.some((entry) => entry.action === 'songs.editLyrics')).toBe(true);
    expect(audit.some((entry) => entry.action === 'songs.editChords')).toBe(true);
  } finally {
    await deleteE2EResource('canciones', song.id);
  }
});

test('SONG-007 archiva y SONG-008 restaura una cancion desde UI', async ({ page }) => {
  const song = await createE2ESong();
  try {
    await login(page, USERS.owner);
    await page.goto('/canciones');
    const card = page.getByTestId(`song-card-${song.id}`);
    await expect(card).toBeVisible();
    await card.getByTitle(/archivar canci.n/i).click();
    await clickArchiveAction(page, page.getByRole('button', { name: /^archivar$/i }));
    await expect.poll(async () => (await readFirestoreDocument('canciones', song.id))?.archived).toBe(true);

    await page.getByRole('button', { name: /archivadas/i }).click();
    const archivedCard = page.getByTestId(`song-card-${song.id}`);
    await expect(archivedCard).toBeVisible();
    await clickArchiveAction(page, archivedCard.getByTitle(/restaurar al repertorio/i));
    await expect.poll(async () => (await readFirestoreDocument('canciones', song.id))?.archived).toBe(false);
  } finally {
    await deleteE2EResource('canciones', song.id);
  }
});

test('SONG-009 elimina definitivamente una cancion archivada sin referencias', async ({ page }) => {
  const song = await createE2ESong();
  try {
    await login(page, USERS.owner);
    await page.goto('/canciones');
    const card = page.getByTestId(`song-card-${song.id}`);
    await expect(card).toBeVisible();
    await card.getByTitle(/archivar canci.n/i).click();
    await clickArchiveAction(page, page.getByRole('button', { name: /^archivar$/i }));
    await expect.poll(async () => (await readFirestoreDocument('canciones', song.id))?.archived).toBe(true);

    await page.getByRole('button', { name: /archivadas/i }).click();
    const archivedCard = page.getByTestId(`song-card-${song.id}`);
    await expect(archivedCard).toBeVisible();
    await archivedCard.getByTitle(/eliminar definitivamente/i).click();
    await page.getByRole('button', { name: /^verificar eliminacion$/i }).click();
    const deleteModal = page.getByText(/eliminar cancion/i).locator('..');
    await expect(deleteModal.getByRole('button', { name: /^eliminar definitivamente$/i })).toBeEnabled();
    await deleteModal.getByRole('button', { name: /^eliminar definitivamente$/i }).click();
    const confirmation = page.getByRole('dialog');
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole('button', { name: /^eliminar definitivamente$/i }).click();
    await expect.poll(async () => readFirestoreDocument('canciones', song.id)).toBeNull();
  } finally {
    await deleteE2EResource('canciones', song.id);
  }
});
