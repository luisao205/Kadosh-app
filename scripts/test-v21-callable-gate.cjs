const assert = require('node:assert/strict');
const { evaluateV21EmulatorGate, safeError } = require('../functions/v21CallableIntegration');

const valid = {
  KADOSH_V21_CALLABLES_ENABLED: 'true',
  FUNCTIONS_EMULATOR: 'true',
  GCLOUD_PROJECT: 'demo-kadosh-e2e',
  GOOGLE_CLOUD_PROJECT: 'demo-kadosh-e2e',
  FIREBASE_CONFIG: JSON.stringify({ projectId: 'demo-kadosh-e2e' }),
  FIREBASE_EMULATOR_HUB: '127.0.0.1:4701',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8587',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9499',
};
assert.equal(evaluateV21EmulatorGate(valid).enabled, true);
for (const [field, value] of [
  ['KADOSH_V21_CALLABLES_ENABLED', undefined],
  ['FUNCTIONS_EMULATOR', undefined],
  ['GCLOUD_PROJECT', 'kadosh-49600'],
  ['GOOGLE_CLOUD_PROJECT', 'other'],
  ['FIREBASE_CONFIG', JSON.stringify({ projectId: 'kadosh-49600' })],
  ['FIREBASE_EMULATOR_HUB', 'example.com:4701'],
  ['FIRESTORE_EMULATOR_HOST', 'firestore.googleapis.com:443'],
  ['FIREBASE_AUTH_EMULATOR_HOST', 'identitytoolkit.googleapis.com:443'],
  ['GOOGLE_APPLICATION_CREDENTIALS', 'real.json'],
]) {
  const env = { ...valid };
  if (value === undefined) delete env[field]; else env[field] = value;
  assert.equal(evaluateV21EmulatorGate(env).enabled, false, field);
}
assert.equal(evaluateV21EmulatorGate({ ...valid, FIREBASE_CONFIG: '{' }).enabled, false);

class HttpsError extends Error { constructor(code, message, details) { super(message); this.code = code; this.details = details; } }
const functions = { https: { HttpsError } };
assert.equal(safeError(functions, { code: 'stale-lyrics' }).code, 'failed-precondition');
assert.equal(safeError(functions, { code: 'formatting-conflict' }).code, 'aborted');
assert.equal(safeError(functions, { code: 'idempotency-conflict' }).details.code, 'idempotency-conflict');
assert.equal(safeError(functions, new Error('secret')).code, 'internal');
assert.equal(safeError(functions, new Error('secret')).message, 'No se pudo completar la operacion.');

console.log('Projection V2.1-C3C.1 callable gate: 16 scenarios PASS');
