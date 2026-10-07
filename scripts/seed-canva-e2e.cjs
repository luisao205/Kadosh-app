const admin = require('../functions/node_modules/firebase-admin');

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error('Este seed solo puede ejecutarse con Auth y Firestore Emulator.');
}

admin.initializeApp({ projectId: 'kadosh-49600' });

const db = admin.firestore();
const auth = admin.auth();
const EVENT_ID = 'e2e-canva-event';
const OPERATOR_A_UID = 'e2e-canva-operator-a';
const OPERATOR_B_UID = 'e2e-canva-operator-b';

const upsertUser = async ({ uid, email, displayName }) => {
  try {
    await auth.updateUser(uid, { email, password: 'LocalE2E-Canva-2026!', displayName });
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error;
    await auth.createUser({ uid, email, password: 'LocalE2E-Canva-2026!', displayName });
  }
};

const mediaOutput = (id, title) => ({
  active: true,
  mediaKey: id,
  mediaId: id,
  name: title,
  url: `https://example.test/${id}.mp4`,
  type: 'video',
  mode: 'foreground',
  playing: true,
  volume: 0.8,
  loop: true,
  updatedAt: 1735689600000,
  updatedBy: 'E2E seed'
});

const canva = (id, title, defaultTargets) => ({
  title,
  inputUrl: `https://www.canva.com/design/${id}/view`,
  sourceUrl: `https://www.canva.com/design/${id}/view`,
  embedUrl: `https://www.canva.com/design/${id}/view?embed`,
  pageCount: 8,
  defaultTargets,
  setlistId: EVENT_ID,
  createdAt: 1735689600000,
  createdBy: OPERATOR_A_UID,
  updatedAt: 1735689600000,
  updatedBy: 'E2E seed'
});

(async () => {
  await Promise.all([
    upsertUser({ uid: OPERATOR_A_UID, email: 'operator-a@e2e.local', displayName: 'Operador A E2E' }),
    upsertUser({ uid: OPERATOR_B_UID, email: 'operator-b@e2e.local', displayName: 'Operador B E2E' })
  ]);

  const permissions = {
    'dashboard.view': true,
    'events.view': true,
    'setlists.view': true,
    'setlists.control': true,
    'multimedia.libraryView': true,
    'multimedia.centralAccess': true,
    'multimedia.project': true,
    'multimedia.controlOutputs': true,
    'canva.view': true,
    'canva.create': true,
    'canva.project': true
  };
  const batch = db.batch();
  batch.set(db.collection('sistema').doc('permissionRoles'), { roleDefaults: { multimedia: permissions } });
  [
    [OPERATOR_A_UID, 'operator-a@e2e.local', 'Operador A E2E'],
    [OPERATOR_B_UID, 'operator-b@e2e.local', 'Operador B E2E']
  ].forEach(([uid, email, nombre]) => {
    batch.set(db.collection('usuarios').doc(uid), {
      nombre,
      email,
      rol: 'multimedia',
      accountStatus: 'active',
      fechaCreacion: 1735689600000,
      fechaActualizacion: 1735689600000
    });
  });
  batch.set(db.collection('eventos').doc(EVENT_ID), {
    titulo: 'E2E Canva aislado',
    fecha: '2026-10-05',
    tipoEvento: 'Culto de prueba',
    lugar: 'Emulador local',
    setlist: [],
    canciones: [],
    projectorState: { type: 'lyrics', contentType: 'lyrics', title: 'Estado previo' },
    canvaOutputs: {},
    mediaOutputs: {
      projector: mediaOutput('video-a', 'Video A'),
      singers: mediaOutput('video-singers', 'Video Cantantes'),
      musicians: mediaOutput('video-musicians', 'Video Músicos')
    },
    canvaPageMemory: {},
    fechaCreacion: 1735689600000,
    fechaActualizacion: 1735689600000
  });
  batch.set(db.collection('canvaPresentations').doc('canva-a'), canva('canva-a', 'Canva A', {
    projector: true, singers: false, musicians: false
  }));
  batch.set(db.collection('canvaPresentations').doc('canva-b'), canva('canva-b', 'Canva B', {
    projector: false, singers: true, musicians: false
  }));
  batch.set(db.collection('mediaLibrary').doc('video-a'), {
    ...mediaOutput('video-a', 'Video A'), status: 'active', source: 'library'
  });
  await batch.commit();
  console.log(JSON.stringify({ eventId: EVENT_ID, users: [OPERATOR_A_UID, OPERATOR_B_UID] }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
