import { allowExpectedConsoleError, E2E_PASSWORD, expectLogin, login, logout, test, USERS } from '../fixtures/app.js';
import { expect } from '@playwright/test';

test('AUTH-001 logs in with a valid fixture', async ({ page }) => {
  await login(page, USERS.operatorA);
  await expect(page.getByText(/bienvenido al panel de control/i)).toBeVisible();
});

test('AUTH-002 rejects an incorrect password and remains on Login', async ({ page }) => {
  await page.goto('/');
  await expectLogin(page);
  allowExpectedConsoleError(/auth\/(invalid-credential|wrong-password)/i);
  allowExpectedConsoleError(/failed to load resource: the server responded with a status of 400/i);
  await page.getByLabel(/correo electr.nico/i).fill(USERS.operatorA.email);
  await page.getByLabel(/contrase.a/i).fill('Incorrecta-E2E-2026!');
  await page.getByRole('button', { name: /entrar a kadosh pro/i }).click();
  await expect(page.getByText(/correo o contrase.a incorrectos/i)).toBeVisible();
  await expect(page.getByRole('heading', { name: /iniciar sesi.n/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /cerrar sesi.n/i })).toHaveCount(0);
});

test('AUTH-003 logs out and cannot re-enter a protected URL', async ({ page }) => {
  await login(page);
  await logout(page);
  await page.goto('/multimedia-hub');
  await expectLogin(page);
  await expect(page.getByText(/central multimedia/i)).toHaveCount(0);
});

test('AUTH-004 direct protected URL without a session stays in Login', async ({ page }) => {
  await page.goto('/multimedia-hub');
  await expectLogin(page);
  await expect(page.getByRole('button', { name: /cerrar sesi.n/i })).toHaveCount(0);
});

test('AUTH-005 preserves authentication during internal navigation', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: /canciones \/ repertorio/i }).click();
  await expect(page).toHaveURL(/\/canciones$/);
  await expect(page.getByRole('heading', { name: /repertorio/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /cerrar sesi.n/i })).toBeVisible();
});
