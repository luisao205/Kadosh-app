import { expect } from '@playwright/test';
import { login, test, USERS } from '../fixtures/app.js';
import { createE2ESong, deleteE2EResource, e2eId } from '../helpers/firestoreAdmin.js';

async function expectNoVisibleScrollbars(page) {
  const state = await page.evaluate(() => {
    const scrollables = [...document.querySelectorAll('#root, #root *')]
      .filter((element) => {
        const style = window.getComputedStyle(element);
        return ['auto', 'scroll'].some((value) => style.overflowY === value || style.overflowX === value);
      });
    return {
      root: window.getComputedStyle(document.querySelector('#root')).scrollbarWidth,
      scrollables: scrollables.map((element) => window.getComputedStyle(element).scrollbarWidth),
    };
  });
  expect(state.root).toBe('none');
  expect(state.scrollables.every((value) => value === 'none')).toBe(true);
}

test.describe.serial('QA de scroll y acciones moviles de canciones', () => {
  const songs = [];

  test.beforeAll(async () => {
    for (let index = 0; index < 7; index += 1) {
      songs.push(await createE2ESong({ titulo: e2eId(`SCROLL-${index}`), letraRaw: `[C]Contenido ${index}` }));
    }
  });

  test.afterAll(async () => Promise.all(songs.map((song) => deleteE2EResource('canciones', song.id))));

  test('SCROLLBAR-001 hides native scrollbars without clipping app, editor and library scrolling', async ({ page }) => {
    await login(page, USERS.owner);
    await page.setViewportSize({ width: 390, height: 844 });

    for (const route of ['/canciones', `/editar/${songs[0].id}`, '/biblioteca']) {
      await page.goto(route);
      await expectNoVisibleScrollbars(page);
    }

    await page.goto('/canciones');
    const lastCard = page.getByTestId(`song-card-${songs.at(-1).id}`);
    const initialScroll = await page.evaluate(() => window.scrollY);
    await lastCard.scrollIntoViewIfNeeded();
    await expect(lastCard).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThanOrEqual(initialScroll);

    await page.goto(`/editar/${songs[0].id}`);
    const editor = page.getByLabel(/estructura de la canci.n/i);
    await editor.fill(Array.from({ length: 80 }, (_, index) => `[C]Linea ${index + 1}`).join('\n'));
    await expect.poll(() => editor.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
    await editor.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect.poll(() => editor.evaluate((element) => element.scrollTop > 0)).toBe(true);
  });

  test('MOBILE-ACTIONS-001 reveals card actions near the viewport edge and keeps desktop behavior intact', async ({ page }) => {
    await login(page, USERS.owner);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/canciones');

    const card = page.getByTestId(`song-card-${songs.at(-1).id}`);
    await card.evaluate((element) => element.scrollIntoView({ block: 'end' }));
    const trigger = card.getByRole('button', { name: /abrir acciones de cancion/i });
    await expect(trigger).toBeVisible();
    const before = await page.evaluate(() => window.scrollY);
    await trigger.click();

    const actions = page.getByTestId(`song-actions-${songs.at(-1).id}`);
    await expect(actions).toBeVisible();
    await expect.poll(async () => actions.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return bounds.top >= 0 && bounds.bottom <= window.innerHeight;
    })).toBe(true);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThanOrEqual(before);
    await expect(actions.getByRole('button', { name: /abrir/i })).toBeVisible();
    await trigger.click();
    await expect(actions).toBeHidden();

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/canciones');
    await expect(page.getByTestId(`song-card-${songs.at(-1).id}`).getByRole('button', { name: /abrir acciones de cancion/i })).toHaveCount(0);
  });
});
