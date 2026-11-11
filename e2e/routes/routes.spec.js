import { expect } from '@playwright/test';
import { login, test } from '../fixtures/app.js';

const routes = [
  ['ROUTE-001', 'Inicio', '/', /bienvenido al panel de control/i],
  ['ROUTE-002', 'Canciones', '/canciones', /repertorio/i],
  ['ROUTE-003', 'Eventos', '/eventos', /eventos y setlists/i],
  ['ROUTE-004', 'Biblioteca', '/biblioteca-multimedia', /centro de recursos preparado/i],
  ['ROUTE-005', 'Central Multimedia', '/multimedia-hub', /central multimedia/i],
  ['ROUTE-006', 'Perfil', '/perfil', /mi perfil/i],
];

for (const [id, linkName, expectedPath, expectedText] of routes) {
  test(`${id} navigates to ${linkName}`, async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: new RegExp(linkName, 'i') }).click();
    await expect(page).toHaveURL(new RegExp(`${expectedPath.replace('/', '\\/')}$`));
    await expect(page.getByText(expectedText).first()).toBeVisible();
  });
}

test('ROUTE-404 shows a Not Found view and returns to Dashboard', async ({ page }) => {
  await login(page);
  await page.goto('/qa-ruta-que-no-existe');
  await expect(page).toHaveURL(/\/qa-ruta-que-no-existe$/);
  await expect(page.getByRole('heading', { name: /p.gina no encontrada/i })).toBeVisible();
  await page.getByRole('link', { name: /volver al dashboard/i }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText(/bienvenido al panel de control/i)).toBeVisible();
});
