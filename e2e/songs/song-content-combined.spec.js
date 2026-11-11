import { expect } from '@playwright/test';
import { login, test, USERS } from '../fixtures/app.js';
import { createE2ESong, deleteE2EResource, getSongAudit, readFirestoreDocument } from '../helpers/firestoreAdmin.js';

test.describe('SONG-006 contenido combinado', () => {
  let song;

  test.beforeEach(async ({ page }) => {
    song = await createE2ESong({ letraRaw: '[C]Letra inicial' });
    await login(page, USERS.owner);
  });

  test.afterEach(async () => {
    await deleteE2EResource('canciones', song.id);
  });

  test('SONG-006 owner puede guardar letra y acordes en una sola actualizacion', async ({ page }) => {
    const updatedContent = '[G]Letra actualizada';
    await page.goto(`/editar/${song.id}`);
    await expect(page.getByRole('heading', { name: /editar canci.n/i })).toBeVisible();
    await page.locator('textarea').first().fill(updatedContent);
    await page.getByRole('button', { name: /^guardar cambios$/i }).click();
    await expect(page.getByText(/canci.n actualizada exitosamente/i)).toBeVisible({ timeout: 30_000 });

    await expect.poll(async () => (await readFirestoreDocument('canciones', song.id))?.letraRaw).toBe(updatedContent);
    const audit = await getSongAudit(song.id);
    expect(audit.some((entry) => entry.action === 'songs.editContent')).toBe(true);
  });
});
