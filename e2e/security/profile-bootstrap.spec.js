import { expect } from '@playwright/test';
import { test, login, logout, USERS } from '../fixtures/app.js';
import {
  deleteE2EUserNote,
  readE2EUserNote,
  readE2EUserProfile,
  restoreE2EUserProfile,
  setE2EUserNote,
  updateE2EUserProfile,
} from '../helpers/firestoreAdmin.js';

const OWNER_UID = 'e2e-owner';
const NOTE_ID = 'e2e-profile-bootstrap-note';

test.describe.serial('Existing user profile bootstrap', () => {
  let originalProfile;

  test.beforeAll(async () => {
    originalProfile = await readE2EUserProfile(OWNER_UID);
  });

  test.afterAll(async () => {
    await restoreE2EUserProfile(OWNER_UID, originalProfile);
    await deleteE2EUserNote(OWNER_UID, NOTE_ID);
  });

  test('PROFILE-BOOTSTRAP-001 preserves an existing profile through login, refresh, and relogin', async ({ page }) => {
    const profile = {
      nombre: 'Luis Torres E2E',
      fechaCreacion: '2026-09-28T06:47:34.753Z',
      fechaNacimiento: '2005-08-27',
      instrumentos: ['Bateria'],
      fotoPerfil: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
      historialFotos: ['2026-10-01T00:00:00.000Z'],
      preferencias: { darkMode: true, fontSize: 16, themeColor: 'violet' },
      biografia: 'Perfil existente E2E',
      accountStatusAudit: [{ newStatus: 'active', createdAt: '2026-09-28T06:47:34.753Z' }],
      suspensión: null,
      ultimaConexion: '2026-10-17T02:01:26.407Z',
      campoExtraDePrueba: { preserve: true },
    };
    await updateE2EUserProfile(OWNER_UID, profile);
    await setE2EUserNote(OWNER_UID, NOTE_ID, { texto: 'Nota existente E2E', fechaActualizacion: profile.fechaCreacion });

    await login(page, USERS.owner);
    await page.reload();
    await expect(page.getByRole('button', { name: /cerrar sesi.n/i })).toBeVisible();
    await logout(page);
    await login(page, USERS.owner);

    await expect.poll(async () => readE2EUserProfile(OWNER_UID)).toMatchObject(profile);
    await expect(readE2EUserNote(OWNER_UID, NOTE_ID)).resolves.toEqual({
      texto: 'Nota existente E2E',
      fechaActualizacion: profile.fechaCreacion,
    });
  });
});
