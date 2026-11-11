import { expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { E2E_PASSWORD, test } from '../fixtures/app.js';
import { calcularOffsetSemitonos, isValidChordToken, normalizarTonoVisual, transponerNota } from '../../src/utils/musicCore.js';

const enabled = process.env.KADOSH_REALDATA_CLONE === 'true';
const normalSongId = 'Gp4OxpOftngKntjngZfG';
const medleyId = 'lPTdAiEIpmAbxbzHdpYI';
const sourceIds = ['Gp4OxpOftngKntjngZfG', 'Wok54bpWemJHUExrBEQn'];
const cloneUser = {
  uid: 'clone-realdata-owner',
  email: 'clone-realdata-owner@e2e.local',
};

const require = createRequire(import.meta.url);
const admin = require('../../functions/node_modules/firebase-admin');
let firestore;
let auth;
const originals = new Map();

async function loginCloneOwner(page) {
  await page.goto('/');
  await page.getByLabel(/correo electr.nico/i).fill(cloneUser.email);
  await page.getByLabel(/contrase.a/i).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: /entrar a kadosh pro/i }).click();
  await expect(page.getByRole('button', { name: /cerrar sesi.n/i })).toBeVisible();
}

async function readSong(songId) {
  const snapshot = await firestore.collection('canciones').doc(songId).get();
  if (!snapshot.exists) throw new Error(`Cancion clonada no encontrada: ${songId}`);
  return snapshot.data();
}

test.describe('real production clone song editing', () => {
  test.skip(!enabled, 'Solo ejecuta contra el snapshot local clonado y KADOSH_REALDATA_CLONE=true.');
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') {
      throw new Error('El test de snapshot requiere Firestore Emulator local.');
    }
    const app = admin.apps.find((candidate) => candidate?.name === 'clone-realdata-admin')
      || admin.initializeApp({ projectId: 'kadosh-49600' }, 'clone-realdata-admin');
    firestore = app.firestore();
    auth = app.auth();
    for (const id of [normalSongId, medleyId, ...sourceIds]) {
      originals.set(id, await readSong(id));
    }
    try {
      await auth.createUser({ uid: cloneUser.uid, email: cloneUser.email, password: E2E_PASSWORD });
    } catch (error) {
      if (error.code !== 'auth/uid-already-exists' && error.code !== 'auth/email-already-exists') throw error;
    }
    await firestore.collection('usuarios').doc(cloneUser.uid).set({
      nombre: 'Clone Owner E2E',
      email: cloneUser.email,
      rol: 'dueño',
      accountStatus: 'active',
    }, { merge: true });
  });

  test.afterAll(async () => {
    for (const [id, data] of originals) await firestore.collection('canciones').doc(id).set(data);
    await firestore.collection('usuarios').doc(cloneUser.uid).delete();
    try { await auth.deleteUser(cloneUser.uid); } catch { /* Already removed by an interrupted local run. */ }
  });

  test('REALDATA-EDIT-001 edits and reloads the historical normal song through local Functions', async ({ page }) => {
    const original = originals.get(normalSongId);
    const changed = `${original.letraRaw}\n{cue: Validacion clon local}`;
    const callableRequests = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && /updateSong(?:Content|Metadata)$/.test(new URL(request.url()).pathname)) {
        callableRequests.push(request.url());
      }
    });
    await loginCloneOwner(page);
    await page.goto(`/editar/${normalSongId}`);
    await page.locator('#edit-song-content').fill(changed);
    await page.getByRole('button', { name: /guardar cambios/i }).click();
    await expect.poll(async () => (await readSong(normalSongId)).letraRaw).toBe(changed);
    expect(callableRequests.some((url) => url.endsWith('/updateSongContent'))).toBe(true);
    expect(callableRequests.some((url) => url.endsWith('/updateSongMetadata'))).toBe(false);
    await page.goto(`/editar/${normalSongId}`);
    await expect(page.locator('#edit-song-content')).toHaveValue(changed);
  });

  test('REALDATA-MEDLEY-001 materializes the cloned F# source in E without mutating its source', async () => {
    const sourceBefore = await readSong(normalSongId);
    const sourceKey = normalizarTonoVisual(sourceBefore.tonoOriginal);
    const targetKey = 'E';
    const offset = calcularOffsetSemitonos(sourceKey, targetKey);
    const materialized = sourceBefore.letraRaw.replace(/\[([^\]]+)\]/g, (match, token) => (
      isValidChordToken(token) ? `[${transponerNota(token, offset)}]` : match
    ));

    expect(sourceKey).toBe('F#');
    expect(targetKey).toBe('E');
    expect(offset).toBe(-2);
    expect(materialized).toContain('[E]');
    expect(materialized).toContain('[A]');
    expect(materialized).toContain('[C#m]');
    expect((await readSong(normalSongId)).letraRaw).toBe(sourceBefore.letraRaw);
  });

  test('REALDATA-EDIT-002 edits and reloads the real Medley without changing sources or medley metadata', async ({ page }) => {
    const original = originals.get(medleyId);
    const originalConfig = JSON.stringify(original.medleyConfig);
    const sourceBefore = await Promise.all(sourceIds.map(readSong));
    const changed = `${original.letraRaw}\n{cue: Medley editable en clon}`;
    await loginCloneOwner(page);
    await page.goto(`/editar/${medleyId}`);
    await page.locator('#edit-song-content').fill(changed);
    const contentResponse = page.waitForResponse((response) => (
      response.request().method() === 'POST' && response.url().endsWith('/updateSongContent')
    ));
    await page.getByRole('button', { name: /guardar cambios/i }).click();
    const response = await contentResponse;
    expect(response.status()).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      result: { ok: true, operation: 'songs.editContent', permissions: ['songs.editLyrics', 'songs.editChords'] }
    });
    await expect.poll(async () => (await readSong(medleyId)).letraRaw).toBe(changed);
    await page.goto(`/editar/${medleyId}`);
    await expect(page.locator('#edit-song-content')).toHaveValue(changed);
    expect(JSON.stringify((await readSong(medleyId)).medleyConfig)).toBe(originalConfig);
    await Promise.all(sourceIds.map(async (id, index) => expect(await readSong(id)).toEqual(sourceBefore[index])));
  });
});
