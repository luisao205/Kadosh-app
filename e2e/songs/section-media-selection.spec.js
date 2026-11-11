import { expect } from '@playwright/test';
import { login, test, USERS } from '../fixtures/app.js';
import { createE2EMedia, createE2ESong, deleteE2EResource, e2eId } from '../helpers/firestoreAdmin.js';

const content = '# Intro\n[C]Entrada';

async function openPicker(page, song, media) {
  await page.goto(`/editar/${song.id}`);
  await page.getByRole('button', { name: /administrar multimedia/i }).click();
  const workspace = page.getByRole('dialog', { name: /multimedia por seccion/i });
  await workspace.getByRole('button', { name: /biblioteca multimedia/i }).click();
  const header = page.getByRole('banner').filter({ hasText: /seleccionar desde biblioteca/i });
  // The picker search input is a sibling of its header, not a header descendant.
  await page.getByPlaceholder(/buscar por nombre, categoria o etiqueta/i).fill(media.title);
  const card = page.getByRole('button', { name: new RegExp(`^${media.title}`, 'i') });
  await expect(card).toHaveCount(1);
  return { workspace, header, card };
}

async function selectionState(card, confirm) {
  return {
    tag: await card.evaluate((node) => node.tagName),
    role: await card.getAttribute('role'),
    className: await card.getAttribute('class'),
    ariaSelected: await card.getAttribute('aria-selected'),
    ariaPressed: await card.getAttribute('aria-pressed'),
    dataState: await card.getAttribute('data-state'),
    confirmDisabled: await confirm.isDisabled(),
  };
}

for (const [name, viewport] of Object.entries({ DESKTOP: { width: 1366, height: 768 }, MOBILE: { width: 390, height: 844 } })) {
  test(`SECTION-MEDIA-SELECTION-STATE-${name}`, async ({ page }) => {
    const song = await createE2ESong({ titulo: e2eId(`SECTION-SELECTION-${name}`), letraRaw: content });
    const media = await createE2EMedia({ title: e2eId(`SECTION-SELECTION-MEDIA-${name}`) });
    try {
      await page.setViewportSize(viewport);
      await login(page, USERS.owner);
      const { header, card } = await openPicker(page, song, media);
      const confirm = header.getByRole('button', { name: /^seleccionar$/i });
      const before = await selectionState(card, confirm);
      expect(before.confirmDisabled).toBe(true);
      await card.click();
      await expect(confirm).toBeEnabled();
      await expect(card).toHaveClass(/border-violet-400/);
      const after = await selectionState(card, confirm);
      expect(after.confirmDisabled).toBe(false);
    } finally {
      await Promise.all([deleteE2EResource('canciones', song.id), deleteE2EResource('mediaLibrary', media.id)]);
    }
  });
}
