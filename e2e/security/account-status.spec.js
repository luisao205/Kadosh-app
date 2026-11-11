import { expect } from '@playwright/test';
import { test, E2E_PASSWORD, USERS } from '../fixtures/app.js';
import {
  readE2EUserProfile,
  restoreE2EUserProfile,
  updateE2EUserProfile,
} from '../helpers/firestoreAdmin.js';

const MUSICO_UID = 'e2e-musico';

async function signIn(page) {
  await page.goto('/');
  await page.getByLabel(/correo electr.nico/i).fill(USERS.musico.email);
  await page.getByLabel(/contrase.a/i).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: /entrar a kadosh pro/i }).click();
}

test.describe.serial('SEC-ACCOUNT UI account status', () => {
  let originalProfile;

  test.beforeAll(async () => {
    originalProfile = await readE2EUserProfile(MUSICO_UID);
  });

  test.afterAll(async () => {
    await restoreE2EUserProfile(MUSICO_UID, originalProfile);
  });

  test('SEC-ACCOUNT-001 active permits normal access', async ({ page }) => {
    await updateE2EUserProfile(MUSICO_UID, { accountStatus: 'active' });
    await signIn(page);
    await expect(page.getByRole('button', { name: /cerrar sesi.n/i })).toBeVisible();
  });

  test('SEC-ACCOUNT-002 and SEC-ACCOUNT-003 block suspended and disabled accounts', async ({ page }) => {
    for (const [status, heading] of [
      ['suspended', /cuenta suspendida/i],
      ['disabled', /cuenta desactivada/i],
    ]) {
      await updateE2EUserProfile(MUSICO_UID, { accountStatus: status });
      await signIn(page);
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
      await page.getByRole('button', { name: /cerrar sesi.n/i }).click();
    }
  });

  test('SEC-ACCOUNT-004 blocks an active session after a realtime suspension', async ({ page }) => {
    await updateE2EUserProfile(MUSICO_UID, { accountStatus: 'active' });
    await signIn(page);
    await expect(page.getByRole('button', { name: /cerrar sesi.n/i })).toBeVisible();
    await updateE2EUserProfile(MUSICO_UID, { accountStatus: 'suspended' });
    await expect(page.getByRole('heading', { name: /cuenta suspendida/i })).toBeVisible();
  });
});
