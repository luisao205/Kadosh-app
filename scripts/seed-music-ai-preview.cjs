const admin = require('../functions/node_modules/firebase-admin');

if (!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '') || !/^127\.0\.0\.1:\d+$/.test(process.env.FIREBASE_AUTH_EMULATOR_HOST || '')) {
  throw new Error('Seed de preview bloqueado: se requieren los Firebase Emulators locales.');
}

const PROJECT_ID = process.env.KADOSH_E2E_PROJECT_ID || 'demo-kadosh-e2e';
if (PROJECT_ID !== 'demo-kadosh-e2e') {
  throw new Error('Seed bloqueado: solo se permite demo-kadosh-e2e.');
}

if (!admin.apps.length) {
  admin.initializeApp({ projectId: PROJECT_ID });
}

const db = admin.firestore();
const auth = admin.auth();
const PREVIEW_PASSWORD = 'LocalE2E-Canva-2026!';

const users = [
  { uid: 'e2e-owner', email: 'owner@e2e.local', nombre: 'Dueño Preview', rol: 'dueño' },
  { uid: 'e2e-admin', email: 'admin@e2e.local', nombre: 'Admin Preview', rol: 'admin' },
  { uid: 'e2e-musico', email: 'musico@e2e.local', nombre: 'Músico Preview', rol: 'musico' },
];

const upsertUser = async ({ uid, email, nombre }) => {
  try {
    await auth.updateUser(uid, { email, password: PREVIEW_PASSWORD, displayName: nombre });
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error;
    await auth.createUser({ uid, email, password: PREVIEW_PASSWORD, displayName: nombre });
  }
};

(async () => {
  const { ROLE_PERMISSION_DEFAULTS } = await import('../src/utils/permissions.js');

  await Promise.all(users.map(upsertUser));
  const batch = db.batch();

  batch.set(db.collection('sistema').doc('permissionRoles'), {
    roleDefaults: ROLE_PERMISSION_DEFAULTS,
  });

  users.forEach(({ uid, email, nombre, rol }) => {
    batch.set(db.collection('usuarios').doc(uid), {
      nombre,
      email,
      rol,
      accountStatus: 'active',
      fechaCreacion: Date.now(),
      fechaActualizacion: Date.now(),
    });
  });

  // Canción de muestra aislada para probar "Editar canción" y paneles plegables 1-6
  batch.set(db.collection('canciones').doc('preview-demo-song'), {
    titulo: 'Canción Demo Preview',
    artista: 'KADOSH Test',
    tono: 'G',
    bpm: '72',
    compas: '4/4',
    categoria: 'Adoración',
    letraRaw: '# Intro\n[G] [D] [Em] [C]\n\n# Verso 1\nTu [G]gracia es sufi[D]ciente\nTu [Em]amor no tiene [C]fin',
    youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    archived: false,
    fechaCreacion: Date.now(),
    fechaActualizacion: Date.now(),
  });

  await batch.commit();
  console.log('[SEED PREVIEW PASS] Usuarios aislados y canción demo creados en demo-kadosh-e2e.');
  process.exit(0);
})().catch((err) => {
  console.error('[SEED PREVIEW ERROR]', err);
  process.exit(1);
});
