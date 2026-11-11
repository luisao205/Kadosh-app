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

const ownerUid = 'preview-owner-single-test';
const ownerEmail = 'owner-single-test@kadosh.local';
const ownerPassword = 'LocalPreviewPass-2026!';

const containsSecretPattern = (text = '') => /AIza[0-9A-Za-z_-]{20,}/.test(String(text));

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
      nombre: 'Dueño Preview Test',
      rol: 'dueno',
      accountStatus: 'active'
    });

    const clientApp = initializeApp(
      { apiKey: 'demo-api-key', authDomain: `${projectId}.localhost`, projectId },
      'isolated-single-real-call'
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
    assert.equal(userDocSnap.exists(), true, 'Firestore emulator debe responder.');

    console.log('--- Ejecutando UNA SOLA peticion real a processMusicAI en Emulator ---');
    const processMusicAICallable = httpsCallable(functions, 'processMusicAI');

    const result = await processMusicAICallable({
      prompt: 'Coloca el acorde [G] exactamente en la palabra "luz" y confirma brevemente en 1 linea.',
      rawSong: '# Verso 1\nCamino en tu luz'
    });

    const data = result.data;
    const serialized = JSON.stringify(data);

    assert.equal(containsSecretPattern(serialized), false, 'ALERTA: Patrón de API key encontrado en la respuesta!');

    console.log('Resultado ok:', data.ok);
    console.log('Source:', data.source);
    console.log('Model:', data.model);
    if (!data.ok) {
      console.log('HTTP Status:', data.status);
      console.log('ErrorCode:', data.errorCode);
      console.log('Error:', data.error);
      await deleteApp(clientApp);
      process.exit(2);
    }

    assert.equal(data.source, 'gemini', `La fuente debe ser 'gemini', recibido: ${data.source}`);
    assert.equal(data.model, 'gemini-3.8-flash', `El modelo debe ser 'gemini-3.8-flash', recibido: ${data.model}`);
    assert.ok(data.kadoshContent && data.kadoshContent.includes('[G]'), 'La respuesta debe contener el acorde [G] estructurado.');

    console.log('Kadosh Content recibido:\n' + data.kadoshContent);
    console.log('Mensaje resumido (primeros 180 chars):', String(data.message || '').slice(0, 180).replace(/\r?\n/g, ' '));

    const updatedSnap = await getDoc(doc(firestore, 'usuarios', ownerUid));
    console.log('Firestore Emulator requestCount incrementado a:', updatedSnap.data()?.musicAIAccess?.requestCount);

    await deleteApp(clientApp);
    console.log('[PASS] Llamada real unica a Gemini completada con exito y aislamiento total.');
    process.exit(0);
  } catch (err) {
    console.error('Error en llamada real:', err.message);
    process.exit(1);
  }
})();
