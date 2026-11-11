const assert = require('node:assert/strict');
const admin = require('../functions/node_modules/firebase-admin');
const { initializeApp, deleteApp } = require('firebase/app');
const { connectAuthEmulator, getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { connectFirestoreEmulator, getFirestore, doc, getDoc } = require('firebase/firestore');
const { connectFunctionsEmulator, getFunctions, httpsCallable } = require('firebase/functions');

const projectId = process.env.KADOSH_E2E_PROJECT_ID || 'demo-kadosh-e2e';
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error('Auth y Firestore Emulator son obligatorios.');
}

admin.initializeApp({ projectId });
const adminDb = admin.firestore();
const adminAuth = admin.auth();

const ownerUid = 'preview-owner-uid';
const ownerEmail = 'owner-preview@kadosh.local';
const ownerPassword = 'LocalPreviewPass-2026!';

(async () => {
  try {
    try {
      await adminAuth.updateUser(ownerUid, { email: ownerEmail, password: ownerPassword });
    } catch (err) {
      if (err.code !== 'auth/user-not-found') throw err;
      await adminAuth.createUser({ uid: ownerUid, email: ownerEmail, password: ownerPassword });
    }

    await adminDb.collection('usuarios').doc(ownerUid).set({
      email: ownerEmail,
      nombre: 'Dueño Preview',
      rol: 'dueno',
      accountStatus: 'active'
    });

    const clientApp = initializeApp(
      { apiKey: 'demo-api-key', authDomain: `${projectId}.localhost`, projectId },
      'isolated-preview-check'
    );

    const auth = getAuth(clientApp);
    connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });

    const firestore = getFirestore(clientApp);
    const [fsHost, fsPort] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
    connectFirestoreEmulator(firestore, fsHost, Number(fsPort));

    const functions = getFunctions(clientApp);
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);

    await signInWithEmailAndPassword(auth, ownerEmail, ownerPassword);
    const userDocSnap = await getDoc(doc(firestore, 'usuarios', ownerUid));
    assert.equal(userDocSnap.exists(), true, 'Firestore emulator debe responder lectura autenticada.');

    const processMusicAICallable = httpsCallable(functions, 'processMusicAI');
    const result = await processMusicAICallable({
      prompt: 'Prepara esta estrofa',
      rawSong: '# Verso 1\nTu fidelidad es grande'
    });

    assert.equal(result.data.ok, true, 'Callable HTTP processMusicAI en Emulator debe responder ok: true');
    console.log('[PASS] Auth + Firestore + Functions Emulators HTTP callable verificados en proyecto aislado:', projectId);
    console.log('[INFO] Fuente actual sin clave configurada:', result.data.source, '| Modelo:', result.data.model);

    await deleteApp(clientApp);
    process.exit(0);
  } catch (err) {
    console.error('Error en verificación aislada:', err);
    process.exit(1);
  }
})();
