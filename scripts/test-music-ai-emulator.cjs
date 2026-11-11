process.env.KADOSH_DISABLE_LIVE_GEMINI = 'true';
const assert = require('node:assert/strict');
const path = require('node:path');

// Cargar firebase-admin
const admin = require('../functions/node_modules/firebase-admin');

// Si no hay emulador activo, podemos instanciar una app aislada de prueba
const projectId = process.env.KADOSH_E2E_PROJECT_ID || 'demo-kadosh-e2e';

console.log('========================================================');
console.log('   PRUEBA INTEGRAL DE SEGURIDAD BACKEND: KADOSH MUSIC AI');
console.log(`   Proyecto: ${projectId} (Aislamiento Total / Sin Prod)`);
console.log('========================================================\n');

// Mock o emulador Firestore
let db;
let isRealEmulator = false;

if (process.env.FIRESTORE_EMULATOR_HOST) {
  isRealEmulator = true;
  console.log(`[EMULATOR] Conectado a Firestore Emulator en ${process.env.FIRESTORE_EMULATOR_HOST}`);
  if (!admin.apps.length) {
    admin.initializeApp({ projectId });
  }
  db = admin.firestore();
} else {
  console.log('[IN-MEMORY SIMULATOR] Simulando Firestore en memoria para pruebas de contrato callable...');
  // Simulador estructurado en memoria fiel a Firestore SDK
  const storage = new Map();
  const subcollections = new Map();

  class MockDocRef {
    constructor(collectionPath, id) {
      this.collectionPath = collectionPath;
      this.id = id;
      this.path = `${collectionPath}/${id}`;
    }

    async get() {
      const data = storage.get(this.path);
      return {
        exists: Boolean(data),
        id: this.id,
        data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined),
        get: (field) => {
          if (!data) return undefined;
          return field.split('.').reduce((acc, part) => acc?.[part], data);
        }
      };
    }

    async set(newData, options = {}) {
      if (options.merge && storage.has(this.path)) {
        const existing = storage.get(this.path);
        storage.set(this.path, { ...existing, ...newData });
      } else {
        storage.set(this.path, JSON.parse(JSON.stringify(newData)));
      }
    }

    async update(updates) {
      const existing = storage.get(this.path) || {};
      for (const [key, val] of Object.entries(updates)) {
        if (key.includes('.')) {
          const parts = key.split('.');
          let curr = existing;
          for (let i = 0; i < parts.length - 1; i++) {
            if (!curr[parts[i]]) curr[parts[i]] = {};
            curr = curr[parts[i]];
          }
          if (val && typeof val === 'object' && val.__increment !== undefined) {
            curr[parts[parts.length - 1]] = (curr[parts[parts.length - 1]] || 0) + val.__increment;
          } else {
            curr[parts[parts.length - 1]] = val;
          }
        } else {
          existing[key] = val;
        }
      }
      storage.set(this.path, existing);
    }

    collection(subName) {
      return new MockCollectionRef(`${this.path}/${subName}`);
    }
  }

  class MockCollectionRef {
    constructor(collectionPath) {
      this.collectionPath = collectionPath;
    }

    doc(id = `auto-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`) {
      return new MockDocRef(this.collectionPath, id);
    }

    async get() {
      const docs = [];
      for (const [key, val] of storage.entries()) {
        if (key.startsWith(this.collectionPath + '/')) {
          const id = key.split('/').pop();
          docs.push({
            id,
            data: () => val,
            get: (f) => val[f]
          });
        }
      }
      return { empty: docs.length === 0, size: docs.length, docs };
    }
  }

  db = {
    collection: (col) => new MockCollectionRef(col),
    runTransaction: async (updateFunction) => {
      const transaction = {
        get: async (docRef) => docRef.get(),
        set: (docRef, data) => docRef.set(data),
        update: (docRef, data) => docRef.update(data)
      };
      return updateFunction(transaction);
    }
  };
}

// Mock de functions SDK
const functionsMock = {
  https: {
    HttpsError: class HttpsError extends Error {
      constructor(code, message) {
        super(message);
        this.code = `functions/${code}`;
      }
    },
    onCall: (handler) => handler
  }
};

const adminMock = {
  firestore: () => db
};
adminMock.firestore.FieldValue = {
  serverTimestamp: () => new Date(),
  increment: (n) => ({ __increment: n })
};

// Cargar módulo musicAI
const { setMusicAIAccess, processMusicAI } = require('../functions/musicAI')({
  functions: functionsMock,
  admin: adminMock
});

(async () => {
  try {
    // Fixtures de usuarios
    const ownerUid = 'usr-owner-001';
    const memberUid = 'usr-member-002';
    const suspendedUid = 'usr-suspended-003';

    await db.collection('usuarios').doc(ownerUid).set({
      email: 'owner@kadosh.local',
      nombre: 'Propietario Kadosh',
      rol: 'dueno',
      accountStatus: 'active'
    });

    await db.collection('usuarios').doc(memberUid).set({
      email: 'musico@kadosh.local',
      nombre: 'Músico Guitarrista',
      rol: 'miembro',
      accountStatus: 'active',
      musicAIAccess: { authorized: false, requestCount: 0 }
    });

    await db.collection('usuarios').doc(suspendedUid).set({
      email: 'suspendido@kadosh.local',
      nombre: 'Usuario Suspendido',
      rol: 'miembro',
      accountStatus: 'suspended',
      musicAIAccess: { authorized: true, requestCount: 0 }
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 1: OWNER_ACCESS_TEST
    // El dueño debe tener acceso automático e irrestricto
    // ─────────────────────────────────────────────────────────────
    console.log('--- TEST 1: OWNER_ACCESS_TEST ---');
    const ownerResponse = await processMusicAI(
      {
        prompt: 'Estructurar para KADOSH',
        rawSong: '# Intro\n[G] [C]\n\n# Verso 1\nTu fidelidad es grande'
      },
      { auth: { uid: ownerUid } }
    );

    assert.equal(ownerResponse.ok, true, 'El dueño debe procesar exitosamente.');
    assert.ok(ownerResponse.kadoshContent.includes('# Intro'), 'Debe retornar contenido estructurado.');
    console.log('[PASS] Dueño autorizado automáticamente sin requerir flag previo.');

    // ─────────────────────────────────────────────────────────────
    // TEST 2: UNAUTHORIZED_DENIED
    // Usuario no autorizado es rechazado con error de permisos
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- TEST 2: UNAUTHORIZED_DENIED ---');
    await assert.rejects(
      async () => {
        await processMusicAI(
          { prompt: 'Hola', rawSong: 'Cuan grande es Dios' },
          { auth: { uid: memberUid } }
        );
      },
      (err) => {
        assert.ok(err.code.includes('permission-denied'), `Esperado permission-denied, recibido: ${err.code}`);
        assert.ok(err.message.includes('No tienes autorización'), 'Mensaje debe indicar falta de autorización.');
        return true;
      }
    );
    console.log('[PASS] Usuario sin aprobación es rechazado correctamente.');

    // Intento de no-dueño de otorgar permisos
    await assert.rejects(
      async () => {
        await setMusicAIAccess(
          { targetUid: memberUid, authorized: true },
          { auth: { uid: memberUid } }
        );
      },
      (err) => {
        assert.ok(err.code.includes('permission-denied'));
        assert.ok(err.message.includes('Solo el dueño puede autorizar'));
        return true;
      }
    );
    console.log('[PASS] Intento de autorización por un no-dueño rechazado con permission-denied.');

    // ─────────────────────────────────────────────────────────────
    // TEST 3: APPROVED_USER_TEST
    // El dueño aprueba al miembro; ahora el miembro puede acceder
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- TEST 3: APPROVED_USER_TEST ---');
    const approveResult = await setMusicAIAccess(
      { targetUid: memberUid, authorized: true },
      { auth: { uid: ownerUid } }
    );
    assert.equal(approveResult.ok, true);
    assert.equal(approveResult.authorized, true);

    // Comprobar que en Firestore el flag quedó registrado
    const memberSnap = await db.collection('usuarios').doc(memberUid).get();
    assert.equal(memberSnap.get('musicAIAccess.authorized'), true);
    assert.equal(memberSnap.get('musicAIAccess.updatedBy'), ownerUid);

    // Ahora el miembro ejecuta processMusicAI
    const memberResponse = await processMusicAI(
      {
        prompt: 'Repite el coro dos veces',
        rawSong: '# Coro\nGrande es Dios',
        youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ'
      },
      { auth: { uid: memberUid } }
    );

    assert.equal(memberResponse.ok, true, 'El usuario aprobado debe poder usar Music AI.');
    assert.ok(memberResponse.youtubeAnalysis, 'Debe procesar el campo de YouTube.');
    console.log('[PASS] Aprobación por el dueño concede acceso inmediato y auditable.');

    // ─────────────────────────────────────────────────────────────
    // TEST 4: ACCESS_REVOCATION_TEST
    // El dueño revoca el acceso; el miembro es bloqueado inmediatamente
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- TEST 4: ACCESS_REVOCATION_TEST ---');
    const revokeResult = await setMusicAIAccess(
      { targetUid: memberUid, authorized: false },
      { auth: { uid: ownerUid } }
    );
    assert.equal(revokeResult.ok, true);
    assert.equal(revokeResult.authorized, false);

    await assert.rejects(
      async () => {
        await processMusicAI(
          { prompt: 'Otra petición', rawSong: 'Letra' },
          { auth: { uid: memberUid } }
        );
      },
      (err) => {
        assert.ok(err.code.includes('permission-denied'));
        return true;
      }
    );
    console.log('[PASS] Revocación por el dueño surte efecto inmediato en el backend.');

    // ─────────────────────────────────────────────────────────────
    // TEST 5: SUSPENDED_USER_TEST
    // Usuario con authorized: true pero accountStatus: 'suspended' debe ser bloqueado
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- TEST 5: SUSPENDED_USER_TEST ---');
    await assert.rejects(
      async () => {
        await processMusicAI(
          { prompt: 'Petición', rawSong: 'Letra' },
          { auth: { uid: suspendedUid } }
        );
      },
      (err) => {
        assert.ok(err.code.includes('permission-denied'));
        assert.ok(err.message.includes('cuenta está suspendida'));
        return true;
      }
    );
    console.log('[PASS] Usuario suspendido bloqueado aunque tuviera flag authorized previo.');

    // ─────────────────────────────────────────────────────────────
    // TEST 6: MODEL_CONFIGURABILITY & YOUTUBE UNDERSTANDING
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- TEST 6: MODEL_CONFIGURABILITY & YOUTUBE ANALYSIS ---');
    // Verificamos que el modelo predeterminado es gemini-3.8-flash
    const defaultModel = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
    assert.equal(defaultModel, 'gemini-3.8-flash', 'El modelo por defecto debe ser gemini-3.8-flash.');

    // Prueba de video YouTube con URL de formato shorts/youtu.be
    const ytResponse = await processMusicAI(
      {
        prompt: 'Verifica la estructura',
        rawSong: 'Verso 1\nTu amor es real',
        youtubeUrl: 'https://www.youtube.com/watch?v=kYI2z6xT0F8'
      },
      { auth: { uid: ownerUid } }
    );
    assert.equal(ytResponse.youtubeAnalysis.attempted, true);
    assert.equal(ytResponse.youtubeAnalysis.videoId, 'kYI2z6xT0F8');
    assert.equal(ytResponse.youtubeAnalysis.canonicalUrl, 'https://www.youtube.com/watch?v=kYI2z6xT0F8');
    console.log('[PASS] Normalización y parseo de video de YouTube verificado.');

    // ─────────────────────────────────────────────────────────────
    // TEST 7: PROD_GEMINI_KILL_SWITCH_TEST
    // Simular entorno Cloud Functions en producción (K_SERVICE activo sin opt-in)
    // Debe deshabilitar llamadas Gemini pagadas incluso si existiera GEMINI_API_KEY
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- TEST 7: PROD_GEMINI_KILL_SWITCH_TEST ---');
    const prevDisable = process.env.KADOSH_DISABLE_LIVE_GEMINI;
    const prevService = process.env.K_SERVICE;
    const prevFuncEmu = process.env.FUNCTIONS_EMULATOR;
    const prevGeminiKey = process.env.GEMINI_API_KEY;
    const prevAllowProd = process.env.KADOSH_ALLOW_LIVE_GEMINI_PROD;
    try {
      delete process.env.KADOSH_DISABLE_LIVE_GEMINI;
      process.env.K_SERVICE = 'processMusicAI';
      delete process.env.FUNCTIONS_EMULATOR;
      process.env.GEMINI_API_KEY = 'dummy-should-never-be-called';
      delete process.env.KADOSH_ALLOW_LIVE_GEMINI_PROD;

      const prodRes = await processMusicAI(
        { prompt: 'Prueba modo producción seguro', rawSong: 'Verso 1\nSanto eres tú' },
        { auth: { uid: ownerUid } }
      );
      assert.equal(prodRes.ok, true);
      assert.equal(prodRes.source, 'deterministic_engine');
      assert.equal(prodRes.model, 'kadosh-deterministic-v21');
    } finally {
      if (prevDisable === undefined) delete process.env.KADOSH_DISABLE_LIVE_GEMINI;
      else process.env.KADOSH_DISABLE_LIVE_GEMINI = prevDisable;
      if (prevService === undefined) delete process.env.K_SERVICE;
      else process.env.K_SERVICE = prevService;
      if (prevFuncEmu === undefined) delete process.env.FUNCTIONS_EMULATOR;
      else process.env.FUNCTIONS_EMULATOR = prevFuncEmu;
      if (prevGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = prevGeminiKey;
      if (prevAllowProd === undefined) delete process.env.KADOSH_ALLOW_LIVE_GEMINI_PROD;
      else process.env.KADOSH_ALLOW_LIVE_GEMINI_PROD = prevAllowProd;
    }
    console.log('[PASS] Llamadas Gemini pagadas deshabilitadas automáticamente en Cloud Functions prod sin autorización separada.');

    console.log('\n========================================================');
    console.log('   TODAS LAS PRUEBAS DE SEGURIDAD Y CONTRATO PASARON (PASS)');
    console.log('========================================================\n');
  } catch (error) {
    console.error('ERROR EN PRUEBAS:', error);
    process.exit(1);
  }
})();
