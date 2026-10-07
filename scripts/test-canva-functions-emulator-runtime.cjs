const assert = require('node:assert/strict');
const admin = require('../functions/node_modules/firebase-admin');
const { initializeApp, deleteApp } = require('firebase/app');
const { connectAuthEmulator, getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { connectFunctionsEmulator, getFunctions, httpsCallable } = require('firebase/functions');

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error('Auth y Firestore Emulator son obligatorios.');
}

const projectId = 'kadosh-49600';
const uid = 'runtime-canva-operator';
const email = 'runtime-canva@e2e.local';
const password = 'LocalE2E-Canva-2026!';
const eventId = 'runtime-canva-event';
const canvaId = 'runtime-canva';

admin.initializeApp({ projectId });
const db = admin.firestore();

const upsertAuthUser = async () => {
  try {
    await admin.auth().updateUser(uid, { email, password });
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error;
    await admin.auth().createUser({ uid, email, password });
  }
};

(async () => {
  await upsertAuthUser();
  await Promise.all([
    db.collection('usuarios').doc(uid).set({ rol: 'multimedia', nombre: 'Runtime Canva', accountStatus: 'active' }),
    db.collection('sistema').doc('permissionRoles').set({ roleDefaults: { multimedia: { 'canva.project': true, 'multimedia.project': true } } }),
    db.collection('eventos').doc(eventId).set({
      projectorState: { type: 'lyrics', contentType: 'lyrics' },
      canvaOutputs: {},
      mediaOutputs: { projector: { active: true, mediaId: 'video-before' } },
      canvaPageMemory: {}
    }),
    db.collection('canvaPresentations').doc(canvaId).set({
      title: 'Runtime Canva',
      inputUrl: 'https://www.canva.com/design/runtime/view',
      sourceUrl: 'https://www.canva.com/design/runtime/view',
      embedUrl: 'https://www.canva.com/design/runtime/view?embed',
      pageCount: 3,
      defaultTargets: { projector: true, singers: false, musicians: false },
      setlistId: eventId,
      createdAt: 1,
      createdBy: uid,
      updatedAt: 1,
      updatedBy: uid
    })
  ]);

  const app = initializeApp({ apiKey: 'e2e-local', authDomain: `${projectId}.local`, projectId }, 'runtime-canva-e2e');
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
  await signInWithEmailAndPassword(auth, email, password);
  const functions = getFunctions(app);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  const projectTemporaryCanva = httpsCallable(functions, 'projectTemporaryCanva');
  const restoreProjectionUndo = httpsCallable(functions, 'restoreProjectionUndo');
  const result = await httpsCallable(functions, 'projectSavedCanva')({
    eventId,
    canvaId,
    page: 2,
    destinations: ['projector'],
    requestId: 'runtime_canva_fieldvalue_123456'
  });
  const event = (await db.collection('eventos').doc(eventId).get()).data();
  const operation = await db.collection('eventos').doc(eventId).collection('undoOperations').doc(result.data.operationId).get();
  assert.equal(result.data.ok, true);
  assert.equal(event.canvaOutputs.projector.presentationId, canvaId);
  assert.equal(event.mediaOutputs.projector, undefined);
  assert.equal(event.canvaPageMemory.projector[`id:${canvaId}`], 2);
  assert.equal(operation.exists, true);

  const beforeMedia = { active: true, mediaId: 'video-temporary-before', type: 'video', url: 'https://example.test/video-temporary-before.mp4' };
  await db.collection('eventos').doc(eventId).set({
    projectorState: { type: 'lyrics', contentType: 'lyrics' },
    canvaOutputs: {},
    mediaOutputs: { projector: beforeMedia },
    canvaPageMemory: {}
  });
  const temporary = await projectTemporaryCanva({
    eventId,
    rawUrl: 'https://www.canva.com/design/runtime-temporary/view',
    title: 'Runtime temporal',
    page: 1,
    pageCount: 3,
    destinations: ['projector'],
    requestId: 'runtime_temporary_canva_123456'
  });
  const temporaryEvent = (await db.collection('eventos').doc(eventId).get()).data();
  assert.equal(temporary.data.ok, true);
  assert.equal(temporaryEvent.canvaOutputs.projector.presentationId, '');
  assert.equal(temporaryEvent.canvaOutputs.projector.projectionOperationId, temporary.data.operationId);
  assert.equal(temporaryEvent.mediaOutputs.projector, undefined);
  const restored = await restoreProjectionUndo({ eventId, operationId: temporary.data.operationId });
  assert.equal(restored.data.status, 'restored');
  assert.deepEqual((await db.collection('eventos').doc(eventId).get()).data().mediaOutputs.projector, beforeMedia);
  console.log('canva functions emulator runtime: OK');
  await deleteApp(app);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
