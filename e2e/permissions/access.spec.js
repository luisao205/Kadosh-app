import { expect } from '@playwright/test';
import { login, test, USERS } from '../fixtures/app.js';

test('PERM-001 multimedia can open Central Multimedia', async ({ page }) => {
  await login(page, USERS.multimedia);
  await page.goto('/multimedia-hub');
  await expect(page.getByRole('heading', { name: /central multimedia/i })).toBeVisible();
});

test('PERM-002 musico cannot use Central Multimedia', async ({ page }) => {
  await login(page, USERS.musico);
  await page.goto('/multimedia-hub');
  await expect(page.getByText(/acceso restringido/i)).toBeVisible();
  await expect(page.getByRole('heading', { name: /central multimedia/i })).toHaveCount(0);
});

test('PERM-003 cantante cannot use Central Multimedia', async ({ page }) => {
  await login(page, USERS.cantante);
  await page.goto('/multimedia-hub');
  await expect(page.getByText(/acceso restringido/i)).toBeVisible();
  await expect(page.getByRole('heading', { name: /central multimedia/i })).toHaveCount(0);
});

test('PERM-004 pastor can open and create Predicas with its configured defaults', async ({ page }) => {
  await login(page, USERS.pastor);
  await page.goto('/predicas');
  await expect(page.getByRole('heading', { name: /predicas/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /nueva predica/i })).toBeVisible();
});

test('PERM-005 predicador can view Predicas without edit affordance', async ({ page }) => {
  await login(page, USERS.predicador);
  await page.goto('/predicas');
  await expect(page.getByRole('heading', { name: /predicas/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /nueva predica/i })).toHaveCount(0);
});

test('PERM-006 direct protected URL does not expose Central Multimedia to musico', async ({ page }) => {
  await login(page, USERS.musico);
  await page.goto('/multimedia-hub');
  await expect(page.getByText(/central multimedia esta disponible para dueno, administradores y multimedia/i)).toBeVisible();
  await expect(page.getByText(/gesti.n de proyecci.n, setlists y videos en vivo/i)).toHaveCount(0);
});
