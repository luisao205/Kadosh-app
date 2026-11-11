import { expect } from '@playwright/test';
import { login, test, USERS } from '../fixtures/app.js';
import { createE2EMedia, createE2ESong, deleteE2EResource, e2eId, readFirestoreDocument } from '../helpers/firestoreAdmin.js';

const SECTION_SONG_CONTENT = '# Intro\n[C]Entrada\n\n# Coro\n[G]Coro\n\n# Puente\n[Am]Puente';

async function openSectionMedia(page, song) {
  await page.goto(`/editar/${song.id}`);
  await expect(page.getByRole('heading', { name: /editar canci.n/i })).toBeVisible();
  await page.getByRole('button', { name: /administrar multimedia/i }).click();
  await expect(page.getByRole('dialog', { name: /multimedia por seccion/i })).toBeVisible();
}

async function addDirectResource(page, sectionName, title, url) {
  const dialog = page.getByRole('dialog', { name: /multimedia por seccion/i });
  await dialog.getByRole('button', { name: new RegExp(`^${sectionName}\\b`, 'i') }).click();
  await dialog.getByPlaceholder(/titulo del recurso/i).fill(title);
  await dialog.getByPlaceholder(/pegar url/i).fill(url);
  await dialog.getByRole('button', { name: /^agregar$/i }).click();
  await expect(dialog.getByRole('button', { name: new RegExp(`^${sectionName}\\b.*1 recurso`, 'i') })).toBeVisible();
}

test('SECTION-MEDIA-001 administra, persiste y elimina multimedia por seccion', async ({ page }) => {
  const song = await createE2ESong({ titulo: e2eId('SECTION-MEDIA'), letraRaw: SECTION_SONG_CONTENT });
  const introTitle = 'Video Intro E2E';
  const introUrl = '/e2e-projection-style-video.webm';
  const coroTitle = 'Imagen Coro E2E';
  const coroUrl = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

  try {
    await login(page, USERS.owner);
    await openSectionMedia(page, song);
    await addDirectResource(page, 'Intro', introTitle, introUrl);
    await addDirectResource(page, 'Coro', coroTitle, coroUrl);

    const dialog = page.getByRole('dialog', { name: /multimedia por seccion/i });
    await dialog.getByRole('button', { name: /^intro\b/i }).click();
    await dialog.getByRole('button', { name: /^quitar$/i }).click();
    await expect(dialog.getByRole('button', { name: /^intro\b.*sin multimedia/i })).toBeVisible();
    await dialog.getByPlaceholder(/titulo del recurso/i).fill(introTitle);
    await dialog.getByPlaceholder(/pegar url/i).fill(introUrl);
    await dialog.getByRole('button', { name: /^agregar$/i }).click();
    await expect(dialog.getByRole('button', { name: /^intro\b.*1 recurso/i })).toBeVisible();

    await dialog.getByRole('button', { name: /cerrar multimedia por seccion/i }).click();
    await page.getByRole('button', { name: /^guardar cambios$/i }).last().click();
    await expect(page.getByText(/canci.n actualizada exitosamente/i)).toBeVisible({ timeout: 30_000 });
    await expect.poll(async () => {
      const persisted = await readFirestoreDocument('canciones', song.id);
      return Object.values(persisted?.sectionMedia || {}).flat().map((resource) => resource.title).sort();
    }).toEqual([coroTitle, introTitle].sort());

    await openSectionMedia(page, song);
    await expect(page.getByRole('dialog', { name: /multimedia por seccion/i }).getByRole('button', { name: /^intro\b.*1 recurso/i })).toBeVisible();
  } finally {
    await deleteE2EResource('canciones', song.id);
  }
});

test('SECTION-MEDIA-002 mantiene controles utilizables en viewports moviles y landscape', async ({ page }) => {
  const song = await createE2ESong({ titulo: e2eId('SECTION-MEDIA-MOBILE'), letraRaw: SECTION_SONG_CONTENT });
  const viewports = [
    { width: 320, height: 568 },
    { width: 375, height: 812 },
    { width: 390, height: 844 },
    { width: 412, height: 915 },
    { width: 844, height: 390 },
  ];

  try {
    await login(page, USERS.owner);
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await openSectionMedia(page, song);
      const dialog = page.getByRole('dialog', { name: /multimedia por seccion/i });
      await expect(dialog.getByRole('button', { name: /^coro\b/i })).toBeVisible();
      await expect(dialog.getByPlaceholder(/titulo del recurso/i)).toBeVisible();
      const dimensions = await dialog.evaluate((element) => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
      await dialog.getByRole('button', { name: /cerrar multimedia por seccion/i }).click();
    }
  } finally {
    await deleteE2EResource('canciones', song.id);
  }
});

async function verifyLibraryPickerFlow(page, viewport, suffix) {
  const song = await createE2ESong({ titulo: e2eId(`SECTION-MEDIA-PICKER-${suffix}`), letraRaw: SECTION_SONG_CONTENT });
  const media = await createE2EMedia({ title: e2eId(`SECTION-PICKER-MEDIA-${suffix}`) });
  try {
    await login(page, USERS.owner);
    await page.setViewportSize(viewport);
    await openSectionMedia(page, song);
    const workspace = page.getByRole('dialog', { name: /multimedia por seccion/i });
    await workspace.getByRole('button', { name: /biblioteca multimedia/i }).click();
    const picker = page.getByRole('banner').filter({ hasText: /seleccionar desde biblioteca/i });
    await expect(picker).toBeVisible();
    const layering = await Promise.all([workspace.boundingBox(), picker.boundingBox()]);
    expect(layering[1].width).toBeGreaterThan(0);
    await page.getByPlaceholder(/buscar por nombre, categoria o etiqueta/i).fill(media.title);
    const card = page.getByRole('button', { name: new RegExp(`^${media.title}`, 'i') });
    await expect(card).toHaveCount(1);
    await expect(card).toBeVisible();
    await expect(card).toBeEnabled();
    const hitTarget = await card.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return hit === element || element.contains(hit);
    });
    expect(hitTarget).toBe(true);
    await card.click();
    const select = picker.getByRole('button', { name: /^seleccionar$/i });
    await expect(select).toBeEnabled();
    await expect(card).toHaveClass(/border-violet-400/);
    await select.click();
    await expect(picker).toBeHidden();
    await expect(workspace.getByText(media.title, { exact: true })).toBeVisible();
    await workspace.getByRole('button', { name: /cerrar multimedia por seccion/i }).click();
  } finally {
    await Promise.all([deleteE2EResource('canciones', song.id), deleteE2EResource('mediaLibrary', media.id)]);
  }
}

test('SECTION-MEDIA-003-DESKTOP keeps the library picker above the section workspace', async ({ page }) => {
  await verifyLibraryPickerFlow(page, { width: 1366, height: 768 }, 'DESKTOP');
});

test('SECTION-MEDIA-003-MOBILE keeps the library picker above the section workspace', async ({ page }) => {
  await verifyLibraryPickerFlow(page, { width: 390, height: 844 }, 'MOBILE');
});
