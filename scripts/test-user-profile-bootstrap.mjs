import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { bootstrapUserProfile, buildInitialUserProfile, updateEphemeralUserProfile } from '../src/utils/userProfileBootstrap.js';
import { isLocalProductionReadOnly } from '../src/utils/localProdSafeMode.js';

const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
const PROJECT_ID = process.env.KADOSH_E2E_PROJECT_ID;
if (PROJECT_ID !== 'demo-kadosh-e2e') {
  throw new Error('Profile bootstrap test bloqueado: KADOSH_E2E_PROJECT_ID debe ser demo-kadosh-e2e.');
}
const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules },
});

const existingUid = 'profile-existing-owner';
const newUid = 'profile-new-musician';
const existingProfile = {
  email: 'owner@example.test',
  nombre: 'Luis Torres',
  rol: 'dueño',
  accountStatus: 'active',
  fechaCreacion: '2026-09-28T06:47:34.753Z',
  fechaNacimiento: '2005-08-27',
  instrumentos: ['Bateria'],
  fotoPerfil: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
  historialFotos: ['2026-10-01T00:00:00.000Z'],
  preferencias: { darkMode: true, fontSize: 16, themeColor: 'violet' },
  biografia: '',
  accountStatusAudit: [{ newStatus: 'active', createdAt: '2026-09-28T06:47:34.753Z' }],
  suspensión: null,
  ultimaConexion: '2026-10-17T02:01:26.407Z',
  campoExtraDePrueba: { conserva: true },
};

const actorDb = (uid, email) => testEnv.authenticatedContext(uid, { email }).firestore();
const profileRef = (firestore, uid) => doc(firestore, 'usuarios', uid);

try {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    await setDoc(profileRef(firestore, existingUid), existingProfile);
    await deleteDoc(profileRef(firestore, newUid));
    await setDoc(doc(firestore, 'usuarios', existingUid, 'notas', 'e2e-profile-note'), {
      texto: 'No borrar durante bootstrap',
      fechaActualizacion: '2026-10-17T02:01:26.407Z',
    });
  });

  const existingDb = actorDb(existingUid, existingProfile.email);
  const existingRef = profileRef(existingDb, existingUid);

  // Reproducción del incidente antes del fix: el mismo setDoc sin merge borra
  // todo campo no incluido en los defaults cuando una lectura previa dijo "missing".
  await setDoc(existingRef, buildInitialUserProfile({
    firebaseUser: { uid: existingUid, email: existingProfile.email },
    ownerEmail: existingProfile.email,
    now: '2026-10-22T08:59:22.470Z',
  }));
  const legacyOverwrite = (await getDoc(existingRef)).data();
  assert.equal(legacyOverwrite.nombre, 'Dueño Principal');
  assert.equal(legacyOverwrite.fechaCreacion, '2026-10-22T08:59:22.470Z');
  assert.equal(legacyOverwrite.fotoPerfil, undefined);
  assert.equal(legacyOverwrite.accountStatusAudit, undefined);

  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(profileRef(context.firestore(), existingUid), existingProfile);
  });

  const bootstrap = await bootstrapUserProfile({
    firestore: existingDb,
    firebaseUser: { uid: existingUid, email: existingProfile.email },
    ownerEmail: existingProfile.email,
  });
  assert.equal(bootstrap.created, false);
  assert.deepEqual((await getDoc(existingRef)).data(), existingProfile);

  await Promise.all([
    bootstrapUserProfile({
      firestore: existingDb,
      firebaseUser: { uid: existingUid, email: existingProfile.email },
      ownerEmail: existingProfile.email,
    }),
    updateEphemeralUserProfile({
      firestore: existingDb,
      uid: existingUid,
      changes: { fcmToken: 'e2e-token-redacted', ultimaConexion: '2026-10-22T09:00:00.000Z' },
    }),
  ]);

  const afterConcurrency = (await getDoc(existingRef)).data();
  for (const key of Object.keys(existingProfile).filter((key) => key !== 'ultimaConexion')) {
    assert.deepEqual(afterConcurrency[key], existingProfile[key], `Existing field changed: ${key}`);
  }
  assert.equal(afterConcurrency.fcmToken, 'e2e-token-redacted');
  assert.equal(afterConcurrency.ultimaConexion, '2026-10-22T09:00:00.000Z');
  await assert.rejects(
    () => updateEphemeralUserProfile({
      firestore: existingDb,
      uid: existingUid,
      changes: { nombre: 'No permitido' },
    }),
    /Actualizaci.n ef.mera de perfil inv.lida/,
  );
  const note = await getDoc(doc(existingDb, 'usuarios', existingUid, 'notas', 'e2e-profile-note'));
  assert.deepEqual(note.data(), { texto: 'No borrar durante bootstrap', fechaActualizacion: '2026-10-17T02:01:26.407Z' });

  const newDb = actorDb(newUid, 'new@example.test');
  const newUser = { uid: newUid, email: 'new@example.test' };
  const attempts = await Promise.all(Array.from({ length: 3 }, () => bootstrapUserProfile({
    firestore: newDb,
    firebaseUser: newUser,
    ownerEmail: 'owner@example.test',
    now: () => '2026-10-22T09:01:00.000Z',
  })));
  assert.equal(attempts.filter((attempt) => attempt.created).length, 1);
  assert.deepEqual((await getDoc(profileRef(newDb, newUid))).data(), {
    email: 'new@example.test',
    nombre: 'Usuario Nuevo',
    rol: 'musico',
    accountStatus: 'active',
    fechaCreacion: '2026-10-22T09:01:00.000Z',
  });

  assert.equal(isLocalProductionReadOnly({ hostname: 'localhost', projectId: 'kadosh-49600' }), true);
  assert.equal(isLocalProductionReadOnly({ hostname: '127.0.0.1', projectId: 'kadosh-49600', useEmulators: true }), false);
  assert.equal(isLocalProductionReadOnly({ hostname: 'app.kadosh.example', projectId: 'kadosh-49600' }), false);
  assert.equal(isLocalProductionReadOnly({ hostname: 'localhost', projectId: 'kadosh-49600', allowLocalProdWrites: true }), false);

  console.log('user-profile bootstrap safety: PASS');
} finally {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    await deleteDoc(doc(firestore, 'usuarios', existingUid, 'notas', 'e2e-profile-note'));
    await deleteDoc(profileRef(firestore, existingUid));
    await deleteDoc(profileRef(firestore, newUid));
  });
  await testEnv.cleanup();
}
