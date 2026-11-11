const admin = require('../functions/node_modules/firebase-admin');

const PROJECT_ID = 'demo-kadosh-e2e';
const OWNER_UID = 'projection-v2-demo-owner';
const OWNER_EMAIL = 'projection-v2-owner@e2e.local';
const localHostPattern = /^127\.0\.0\.1:\d+$/;

if (process.env.KADOSH_E2E_PROJECT_ID !== PROJECT_ID) {
  throw new Error(`KADOSH_E2E_PROJECT_ID must be ${PROJECT_ID}.`);
}
if (!localHostPattern.test(process.env.FIRESTORE_EMULATOR_HOST || '')) {
  throw new Error('FIRESTORE_EMULATOR_HOST must point to 127.0.0.1.');
}
if (!localHostPattern.test(process.env.FIREBASE_AUTH_EMULATOR_HOST || '')) {
  throw new Error('FIREBASE_AUTH_EMULATOR_HOST must point to 127.0.0.1.');
}
if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIREBASE_TOKEN || process.env.CLOUDSDK_AUTH_ACCESS_TOKEN) {
  throw new Error('Real credential environment variables are forbidden during DEMO owner setup.');
}

const password = process.env.KADOSH_DEMO_OWNER_PASSWORD;
if (typeof password !== 'string' || password.length < 12) {
  throw new Error('KADOSH_DEMO_OWNER_PASSWORD must contain at least 12 characters.');
}

const app = admin.initializeApp({ projectId: PROJECT_ID }, `projection-v2-demo-owner-${Date.now()}`);

(async () => {
  const auth = app.auth();
  const profile = app.firestore().collection('usuarios').doc(OWNER_UID);
  const existingProfile = await profile.get();
  if (existingProfile.exists) throw new Error(`Refusing to overwrite usuarios/${OWNER_UID}.`);

  try {
    await auth.getUser(OWNER_UID);
    throw new Error(`Refusing to overwrite Auth user ${OWNER_UID}.`);
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error;
  }

  let authCreated = false;
  try {
    await auth.createUser({ uid: OWNER_UID, email: OWNER_EMAIL, password, displayName: 'Projection V2 Demo Owner' });
    authCreated = true;
    await profile.create({
      nombre: 'Projection V2 Demo Owner',
      email: OWNER_EMAIL,
      rol: 'dueno',
      accountStatus: 'active',
      fechaCreacion: Date.now(),
      fechaActualizacion: Date.now(),
    });
    console.log(JSON.stringify({ projectId: PROJECT_ID, uid: OWNER_UID, email: OWNER_EMAIL, created: true }));
  } catch (error) {
    if (authCreated) await auth.deleteUser(OWNER_UID).catch(() => {});
    throw error;
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(async () => {
  await app.delete();
});
