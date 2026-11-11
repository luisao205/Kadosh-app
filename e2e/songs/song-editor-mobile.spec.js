import { expect } from '@playwright/test';
import { login, test, USERS } from '../fixtures/app.js';
import { createE2ESong, deleteE2EResource, e2eId, readFirestoreDocument } from '../helpers/firestoreAdmin.js';

const viewports = [
  ['360x800', { width: 360, height: 800 }],
  ['390x844', { width: 390, height: 844 }],
  ['412x915', { width: 412, height: 915 }],
  ['768x1024', { width: 768, height: 1024 }],
  ['844x390', { width: 844, height: 390 }],
];

test('MOBILE-SONG-EDIT-001 a 008 mantiene el editor amplio, usable y sin overflow', async ({ page }) => {
  const content = '# Intro\n[C]Una línea larga para la edición móvil\n\n# Coro\n[G]Contenido persistente';
  const song = await createE2ESong({ titulo: e2eId('SONG-MOBILE'), letraRaw: content });
  try {
    await login(page, USERS.owner);
    for (const [name, viewport] of viewports) {
      await page.setViewportSize(viewport);
      await page.goto(`/editar/${song.id}`);
      const editor = page.getByLabel(/estructura de la canci.n/i);
      await expect(editor).toBeVisible();
      const box = await editor.boundingBox();
      expect(box, `${name}: editor must have a box`).not.toBeNull();
      expect(box.width, `${name}: editor must fit viewport`).toBeLessThanOrEqual(viewport.width);
      expect(box.height, `${name}: editor must remain useful`).toBeGreaterThanOrEqual(viewport.height <= 500 ? 150 : 220);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/editar/${song.id}`);
    const updated = `${content}\n\n# Final\n[D]Guardado móvil`;
    await page.getByLabel(/estructura de la canci.n/i).fill(updated);
    await page.getByRole('button', { name: /^guardar cambios$/i }).last().click();
    await expect(page.getByText(/canci.n actualizada exitosamente/i)).toBeVisible({ timeout: 30_000 });
    await expect.poll(async () => (await readFirestoreDocument('canciones', song.id))?.letraRaw).toBe(updated);
  } finally {
    await deleteE2EResource('canciones', song.id);
  }
});
