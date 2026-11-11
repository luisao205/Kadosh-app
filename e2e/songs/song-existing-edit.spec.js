import { expect } from '@playwright/test';
import { login, test, USERS } from '../fixtures/app.js';
import { createE2ESong, deleteE2EResource, e2eId, readFirestoreDocument } from '../helpers/firestoreAdmin.js';

async function openExistingSongFromLibrary(page, song) {
  await page.goto('/canciones');
  const card = page.getByTestId(`song-card-${song.id}`);
  await expect(card).toBeVisible();
  await card.getByTitle(/^editar$/i).click();
  await expect(page.getByRole('heading', { name: /editar canci.n/i })).toBeVisible();
}

async function saveEditor(page) {
  await page.getByRole('button', { name: /^guardar cambios$/i }).last().click();
  await expect(page.getByText(/canci.n actualizada exitosamente/i)).toBeVisible({ timeout: 30_000 });
}

test('SONG-EDIT-EXISTING-001 a 004 edita metadata, letra, acordes y ambos en una canción existente', async ({ page }) => {
  const original = '[C]Letra inicial';
  const song = await createE2ESong({ titulo: e2eId('SONG-EXISTING'), letraRaw: original });
  try {
    await login(page, USERS.owner);
    await openExistingSongFromLibrary(page, song);

    await page.getByLabel(/titulo de la canci.n/i).fill(`${song.titulo} Metadata`);
    await page.getByLabel(/bpm/i).fill('124');
    await saveEditor(page);
    await expect.poll(async () => (await readFirestoreDocument('canciones', song.id))?.bpm).toBe(124);

    await page.goto(`/editar/${song.id}`);
    await page.getByLabel(/estructura de la canci.n/i).fill('[C]Letra editada');
    await saveEditor(page);
    await expect.poll(async () => (await readFirestoreDocument('canciones', song.id))?.letraRaw).toBe('[C]Letra editada');

    await page.goto(`/editar/${song.id}`);
    await page.getByLabel(/estructura de la canci.n/i).fill('[G]Letra editada');
    await saveEditor(page);
    await expect.poll(async () => (await readFirestoreDocument('canciones', song.id))?.letraRaw).toBe('[G]Letra editada');

    await page.goto(`/editar/${song.id}`);
    await page.getByLabel(/estructura de la canci.n/i).fill('[D]Letra y acorde editados');
    await saveEditor(page);
    await expect.poll(async () => (await readFirestoreDocument('canciones', song.id))?.letraRaw).toBe('[D]Letra y acorde editados');
  } finally {
    await deleteE2EResource('canciones', song.id);
  }
});

test('SONG-EDIT-EXISTING-005 a 007 abre legacy, materializa canónico y conserva dos ediciones', async ({ page }) => {
  const legacyContent = '# Intro\n[C]Contenido legacy\n\n# Coro\n[G]Persistente';
  const song = await createE2ESong({
    titulo: e2eId('SONG-LEGACY'),
    letraRaw: null,
    letra: legacyContent,
  });
  try {
    await login(page, USERS.owner);
    await openExistingSongFromLibrary(page, song);
    await expect(page.getByLabel(/estructura de la canci.n/i)).toHaveValue(legacyContent);

    const firstEdit = `${legacyContent}\n\n# Final\n[D]Primera edición`;
    await page.getByLabel(/estructura de la canci.n/i).fill(firstEdit);
    await saveEditor(page);
    await expect.poll(async () => (await readFirestoreDocument('canciones', song.id))?.letraRaw).toBe(firstEdit);

    await page.goto(`/editar/${song.id}`);
    await expect(page.getByLabel(/estructura de la canci.n/i)).toHaveValue(firstEdit);
    const secondEdit = firstEdit.replace('Primera edición', 'Segunda edición');
    await page.getByLabel(/estructura de la canci.n/i).fill(secondEdit);
    await saveEditor(page);
    await page.goto(`/editar/${song.id}`);
    await expect(page.getByLabel(/estructura de la canci.n/i)).toHaveValue(secondEdit);
  } finally {
    await deleteE2EResource('canciones', song.id);
  }
});
