const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const admin = require('../functions/node_modules/firebase-admin');
const { createV21CallableHandlers } = require('../functions/v21CallableIntegration');

const PROJECT = 'synthetic-authorized-project';
const UID = 'synthetic-canary-uid';
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080'
  || process.env.GCLOUD_PROJECT !== 'demo-kadosh-e2e') {
  throw new Error('dynamic_kill_switch_test_requires_demo_emulator');
}

class HttpsError extends Error {
  constructor(code, message, details) { super(message); this.code = code; this.details = details; }
}
const app = admin.initializeApp({ projectId: 'demo-kadosh-e2e' }, 'v21-dynamic-kill-switch-test');
const firestore = app.firestore();
const controlRef = firestore.collection('sistema').doc('v21RuntimeControl');
const env = {
  KADOSH_V21_RUNTIME_ENV: 'production',
  KADOSH_V21_PRODUCTION_GATE_CONFIG: JSON.stringify({
    schemaVersion: 1,
    activationEnabled: true,
    killSwitchEnabled: true,
    requireCanary: true,
    authorizedProjectId: PROJECT,
    canaryUids: [UID],
  }),
  GCLOUD_PROJECT: PROJECT,
  GOOGLE_CLOUD_PROJECT: PROJECT,
  FIREBASE_CONFIG: JSON.stringify({ projectId: PROJECT }),
};
let serviceCalls = 0;
const handlers = createV21CallableHandlers({
  functions: { https: { HttpsError } },
  env,
  dynamicGateReader: async () => {
    const snapshot = await controlRef.get();
    return snapshot.exists ? snapshot.data() : null;
  },
  lyricServiceFactory: () => ({ save: async () => { serviceCalls += 1; return { ok: true }; } }),
  duplicationServiceFactory: () => ({ duplicate: async () => { serviceCalls += 1; return { ok: true }; } }),
});

(async () => {
  try {
    await controlRef.set({ schemaVersion: 1, enabled: true, projectId: PROJECT });
    assert.deepEqual(await handlers.saveLyricFormatting({}, { auth: { uid: UID } }), { ok: true });
    await controlRef.set({ schemaVersion: 1, enabled: false, projectId: PROJECT });
    const startedAt = performance.now();
    await assert.rejects(
      handlers.saveLyricFormatting({}, { auth: { uid: UID } }),
      error => error.code === 'failed-precondition',
    );
    const rejectionMs = performance.now() - startedAt;
    assert.equal(serviceCalls, 1, 'disabled request must not reach the service');
    console.log(`Projection V2.1 dynamic kill switch emulator: PASS rejectionMs=${rejectionMs.toFixed(1)}`);
  } finally {
    await controlRef.delete();
    await app.delete();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
