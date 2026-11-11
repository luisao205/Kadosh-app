import { expect, test } from '@playwright/test';
import { assertLocalEmulatorsReachable } from '../helpers/e2eSafety.js';

const seriousConsoleErrors = [];

test.beforeEach(async ({ page }) => {
  await assertLocalEmulatorsReachable();
  seriousConsoleErrors.length = 0;
  page.on('pageerror', (error) => seriousConsoleErrors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') seriousConsoleErrors.push(`console.error: ${message.text()}`);
  });
});

test.afterEach(async () => {
  expect(seriousConsoleErrors, seriousConsoleErrors.join('\n')).toEqual([]);
});

test('operator fixture can log in, open a protected route, and log out', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /iniciar sesi.n/i })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__KADOSH_E2E_EMULATORS__ === true)).toBe(true);

  await page.getByLabel(/correo electr.nico/i).fill('operator-a@e2e.local');
  await page.getByLabel(/contrase.a/i).fill('LocalE2E-Canva-2026!');
  await page.getByRole('button', { name: /entrar a kadosh pro/i }).click();

  const multimediaLink = page.getByRole('link', { name: /central multimedia/i });
  await expect(multimediaLink).toBeVisible();
  await multimediaLink.click();
  await expect(page).toHaveURL(/\/multimedia-hub$/);

  await page.getByRole('button', { name: /cerrar sesi.n/i }).click();
  await expect(page.getByRole('heading', { name: /iniciar sesi.n/i })).toBeVisible();
});
