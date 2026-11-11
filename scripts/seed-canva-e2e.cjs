const admin = require('../functions/node_modules/firebase-admin');

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error('Este seed solo puede ejecutarse con Auth y Firestore Emulator.');
}

const PROJECT_ID = process.env.KADOSH_E2E_PROJECT_ID;
if (PROJECT_ID !== 'demo-kadosh-e2e') {
  throw new Error('Seed E2E bloqueado: KADOSH_E2E_PROJECT_ID debe ser demo-kadosh-e2e.');
}
admin.initializeApp({ projectId: PROJECT_ID });

const db = admin.firestore();
const auth = admin.auth();
const EVENT_ID = 'e2e-canva-event';
const CONTROLLER_EVENT_ID = 'e2e-controller-event';
const OPERATOR_A_UID = 'e2e-canva-operator-a';
const OPERATOR_B_UID = 'e2e-canva-operator-b';
const E2E_PASSWORD = 'LocalE2E-Canva-2026!';

const users = [
  { uid: OPERATOR_A_UID, email: 'operator-a@e2e.local', nombre: 'Operador A E2E', rol: 'multimedia' },
  { uid: OPERATOR_B_UID, email: 'operator-b@e2e.local', nombre: 'Operador B E2E', rol: 'multimedia' },
  { uid: 'e2e-owner', email: 'owner@e2e.local', nombre: 'Owner E2E', rol: 'dueño' },
  { uid: 'e2e-admin', email: 'admin@e2e.local', nombre: 'Admin E2E', rol: 'admin' },
  { uid: 'e2e-multimedia', email: 'multimedia@e2e.local', nombre: 'Multimedia E2E', rol: 'multimedia' },
  { uid: 'e2e-musico', email: 'musico@e2e.local', nombre: 'Musico E2E', rol: 'musico' },
  { uid: 'e2e-cantante', email: 'cantante@e2e.local', nombre: 'Cantante E2E', rol: 'cantante' },
  { uid: 'e2e-pastor', email: 'pastor@e2e.local', nombre: 'Pastor E2E', rol: 'pastor' },
  { uid: 'e2e-predicador', email: 'predicador@e2e.local', nombre: 'Predicador E2E', rol: 'predicador' },
];

const upsertUser = async ({ uid, email, displayName }) => {
  try {
    await auth.updateUser(uid, { email, password: E2E_PASSWORD, displayName });
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error;
    await auth.createUser({ uid, email, password: E2E_PASSWORD, displayName });
  }
};

const mediaOutput = (id, title) => ({
  active: true,
  mediaKey: id,
  mediaId: id,
  name: title,
  url: '/e2e-projection-style-video.webm',
  type: 'video',
  mode: 'foreground',
  playing: true,
  volume: 0.8,
  loop: true,
  updatedAt: 1735689600000,
  updatedBy: 'E2E seed'
});

const controllerEvent = () => ({
  titulo: 'E2E-QA-CONTROLLER EVENT',
  fecha: '2026-10-05',
  tipoEvento: 'Culto de prueba',
  lugar: 'Emulador local',
  setlist: [],
  canciones: [],
  projectorState: { type: 'lyrics', contentType: 'lyrics', title: 'E2E-QA-CONTROLLER-SONG-A' },
  projectionTargets: { projector: true, singers: true, musicians: true },
  proyectorSlide: { titulo: 'E2E-QA-CONTROLLER-SONG-A', texto: 'Letra inicial E2E' },
  proyectorApagado: false,
  canvaOutputs: {},
  mediaOutputs: {},
  canvaPageMemory: {},
  liveState: {
    activeSongId: null,
    activeSongTitle: '',
    activeSongIndex: -1,
    activeSectionIndex: -1,
    activeSectionTitle: '',
    activeContentType: 'lyrics',
    activeContentTitle: 'E2E-QA-CONTROLLER-SONG-A',
    updatedAt: 1735689600000,
    updatedBy: 'E2E seed'
  },
  fechaCreacion: 1735689600000,
  fechaActualizacion: 1735689600000
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
  const { ROLE_PERMISSION_DEFAULTS } = await import('../src/utils/permissions.js');
  await Promise.all(users.map(({ uid, email, nombre }) => upsertUser({ uid, email, displayName: nombre })));
  const batch = db.batch();
  batch.delete(db.collection('sistema').doc('multimedia'));
  batch.set(db.collection('sistema').doc('permissionRoles'), {
    roleDefaults: ROLE_PERMISSION_DEFAULTS,
  });
  users.forEach(({ uid, email, nombre, rol }) => {
    batch.set(db.collection('usuarios').doc(uid), {
      nombre,
      email,
      rol,
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
  batch.set(db.collection('eventos').doc(CONTROLLER_EVENT_ID), controllerEvent());
  batch.set(db.collection('eventos').doc('global'), {
    outputs: {
      'e2e-output-1': { label: 'E2E PANTALLA-1', type: 'proyector' },
      'e2e-output-2': { label: 'E2E PANTALLA-2', type: 'retorno' },
      'e2e-output-3': { label: 'E2E PANTALLA-3', type: 'musicos' }
    }
  }, { merge: true });
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
  console.log(JSON.stringify({ eventId: EVENT_ID, controllerEventId: CONTROLLER_EVENT_ID, users: users.map(({ uid }) => uid) }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
