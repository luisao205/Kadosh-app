const assert = require('node:assert/strict');
const {
  createV21CallableHandlers,
  evaluateV21CallableGate,
  evaluateV21DynamicControl,
  evaluateV21ProductionGate,
} = require('../functions/v21CallableIntegration');

const UID = 'synthetic-canary-uid';
const PROJECT = 'synthetic-authorized-project';
const config = overrides => JSON.stringify({
  schemaVersion: 1,
  activationEnabled: true,
  killSwitchEnabled: true,
  accessMode: 'canary',
  requireCanary: true,
  authorizedProjectId: PROJECT,
  canaryUids: [UID],
  ...overrides,
});
const production = {
  KADOSH_V21_RUNTIME_ENV: 'production',
  KADOSH_V21_PRODUCTION_GATE_CONFIG: config(),
  GCLOUD_PROJECT: PROJECT,
  GOOGLE_CLOUD_PROJECT: PROJECT,
  FIREBASE_CONFIG: JSON.stringify({ projectId: PROJECT }),
};

assert.equal(evaluateV21ProductionGate({}, { uid: UID }).enabled, false, 'default deny');
assert.equal(evaluateV21ProductionGate({ ...production, KADOSH_V21_PRODUCTION_GATE_CONFIG: undefined }, { uid: UID }).enabled, false, 'missing config');
assert.equal(evaluateV21ProductionGate({ ...production, KADOSH_V21_PRODUCTION_GATE_CONFIG: '{' }, { uid: UID }).enabled, false, 'invalid config');
assert.equal(evaluateV21ProductionGate({ ...production, GCLOUD_PROJECT: 'wrong-project' }, { uid: UID }).enabled, false, 'wrong project');
assert.equal(evaluateV21ProductionGate({ ...production, GOOGLE_CLOUD_PROJECT: undefined }, { uid: UID }).enabled, true, 'optional Gen 1 project variable');
assert.equal(evaluateV21ProductionGate({ ...production, GCLOUD_PROJECT: undefined }, { uid: UID }).enabled, false, 'required project variable');
assert.equal(evaluateV21ProductionGate(production, null).reasons.includes('unauthenticated'), true, 'unauthenticated');
assert.equal(evaluateV21ProductionGate(production, { uid: 'outside-canary' }).enabled, false, 'outside cohort');
assert.equal(evaluateV21ProductionGate(production, { uid: UID }).enabled, true, 'authorized cohort');
assert.equal(evaluateV21ProductionGate({ ...production, KADOSH_V21_PRODUCTION_GATE_CONFIG: config({ killSwitchEnabled: false }) }, { uid: UID }).enabled, false, 'kill switch');
assert.equal(evaluateV21ProductionGate({ ...production, KADOSH_V21_PRODUCTION_GATE_CONFIG: config({ canaryUids: [] }) }, { uid: UID }).enabled, false, 'empty cohort');
assert.equal(evaluateV21ProductionGate({ ...production, KADOSH_V21_PRODUCTION_GATE_CONFIG: config({ requireCanary: false }) }, { uid: UID }).enabled, false, 'canary mandatory');
const permissionsConfig = config({ accessMode: 'permissions', requireCanary: false, canaryUids: [] });
const permissionsProduction = { ...production, KADOSH_V21_PRODUCTION_GATE_CONFIG: permissionsConfig, GOOGLE_CLOUD_PROJECT: undefined };
assert.equal(evaluateV21ProductionGate(permissionsProduction, { uid: UID }).enabled, true, 'permission mode owner');
assert.equal(evaluateV21ProductionGate(permissionsProduction, { uid: 'another-authenticated-user' }).enabled, true, 'permission mode authenticated user');
assert.equal(evaluateV21ProductionGate(permissionsProduction, null).enabled, false, 'permission mode unauthenticated');
assert.equal(evaluateV21ProductionGate({ ...permissionsProduction, KADOSH_V21_PRODUCTION_GATE_CONFIG: config({ accessMode: 'permissions', requireCanary: false }) }, { uid: UID }).enabled, false, 'permission mode rejects cohort');
assert.equal(evaluateV21ProductionGate({ ...production, FUNCTIONS_EMULATOR: 'true' }, { uid: UID }).enabled, false, 'mixed emulator environment');
assert.equal(evaluateV21ProductionGate({ ...production, FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' }, { uid: UID }).enabled, false, 'emulator host rejected');
assert.equal(evaluateV21CallableGate(production, { uid: UID }).mode, 'production');
const enabledControl = { schemaVersion: 1, enabled: true, projectId: PROJECT };
assert.equal(evaluateV21DynamicControl(null, PROJECT).enabled, false, 'missing dynamic control');
assert.equal(evaluateV21DynamicControl({}, PROJECT).enabled, false, 'invalid dynamic control');
assert.equal(evaluateV21DynamicControl({ ...enabledControl, enabled: false }, PROJECT).enabled, false, 'disabled dynamic control');
assert.equal(evaluateV21DynamicControl({ ...enabledControl, projectId: 'wrong-project' }, PROJECT).enabled, false, 'dynamic project mismatch');
assert.equal(evaluateV21DynamicControl(enabledControl, PROJECT).enabled, true, 'enabled dynamic control');

class HttpsError extends Error {
  constructor(code, message, details) { super(message); this.code = code; this.details = details; }
}
const functions = { https: { HttpsError } };
const calls = [];
const service = permission => ({
  save: async ({ auth, data }) => {
    calls.push({ auth, data });
    if (!permission) throw { code: 'permission-denied' };
    return { ok: true };
  },
  duplicate: async ({ auth, data }) => {
    calls.push({ auth, data });
    if (!permission) throw { code: 'permission-denied' };
    return { ok: true };
  },
});
const handlers = (env, permission = true, dynamicGateReader = async () => enabledControl, capabilityReader = async () => ({
  active: true, canEditFormatting: permission, canEditProjectionStyle: permission, canDuplicate: permission,
})) => createV21CallableHandlers({
  functions,
  env,
  dynamicGateReader,
  capabilityReader,
  lyricServiceFactory: () => service(permission),
  duplicationServiceFactory: () => service(permission),
});

const expectCode = async (promise, code) => assert.rejects(promise, error => error.code === code);
(async () => {
  await expectCode(handlers({}).saveLyricFormatting({}, { auth: { uid: UID } }), 'failed-precondition');
  assert.equal(calls.length, 0, 'disabled gate must not call a service');
  await expectCode(handlers(production).saveLyricFormatting({}, { auth: null }), 'unauthenticated');
  await expectCode(handlers(production).saveLyricFormatting({}, { auth: { uid: 'outside-canary' } }), 'permission-denied');
  await expectCode(handlers(production, false).saveLyricFormatting({}, { auth: { uid: UID } }), 'permission-denied');
  assert.deepEqual(await handlers(production).saveLyricFormatting({}, { auth: { uid: UID } }), { ok: true });
  await expectCode(handlers(production, true, async () => null).saveLyricFormatting({}, { auth: { uid: UID } }), 'failed-precondition');
  await expectCode(handlers(production, true, async () => { throw new Error('read-failed'); }).saveLyricFormatting({}, { auth: { uid: UID } }), 'failed-precondition');
  await expectCode(handlers(production, true, async () => ({ ...enabledControl, enabled: false })).saveLyricFormatting({}, { auth: { uid: UID } }), 'failed-precondition');
  const disabled = { ...production, KADOSH_V21_PRODUCTION_GATE_CONFIG: config({ killSwitchEnabled: false }) };
  await expectCode(handlers(disabled).saveLyricFormatting({}, { auth: { uid: UID } }), 'failed-precondition');
  await expectCode(handlers(disabled).duplicateSong({}, { auth: { uid: UID } }), 'failed-precondition');
  assert.equal(calls.length, 2, 'rejected requests must not reach services');

  assert.deepEqual(await handlers(production).getCapability({}, { auth: { uid: UID } }), {
    enabled: true, canEditFormatting: true, canEditProjectionStyle: true, canDuplicate: true,
  });
  assert.deepEqual(await handlers(permissionsProduction).getCapability({}, { auth: { uid: 'another-authenticated-user' } }), {
    enabled: true, canEditFormatting: true, canEditProjectionStyle: true, canDuplicate: true,
  });
  assert.deepEqual(await handlers(permissionsProduction, false).getCapability({}, { auth: { uid: 'authenticated-without-permissions' } }), {
    enabled: false, canEditFormatting: false, canEditProjectionStyle: false, canDuplicate: false,
  });
  assert.deepEqual(await handlers(production).getCapability({}, { auth: { uid: 'outside-canary' } }), {
    enabled: false, canEditFormatting: false, canEditProjectionStyle: false, canDuplicate: false,
  });
  assert.deepEqual(await handlers(production, true, async () => enabledControl, async () => ({
    active: false, canEditFormatting: true, canEditProjectionStyle: true, canDuplicate: true,
  })).getCapability({}, { auth: { uid: UID } }), {
    enabled: false, canEditFormatting: false, canEditProjectionStyle: false, canDuplicate: false,
  });
  assert.deepEqual(await handlers(production, true, async () => { throw new Error('read-failed'); }).getCapability({}, { auth: { uid: UID } }), {
    enabled: false, canEditFormatting: false, canEditProjectionStyle: false, canDuplicate: false,
  });

  let enabled = true;
  const liveReader = async () => ({ ...enabledControl, enabled });
  assert.deepEqual(await handlers(production, true, liveReader).saveLyricFormatting({}, { auth: { uid: UID } }), { ok: true });
  enabled = false;
  await expectCode(handlers(production, true, liveReader).saveLyricFormatting({}, { auth: { uid: UID } }), 'failed-precondition');
  await expectCode(handlers(production, true, liveReader).saveLyricFormatting({}, { auth: { uid: UID } }), 'failed-precondition');
  assert.equal(calls.length, 3, 'disable and retry must not reach services');
  console.log('Projection V2.1 production and dynamic gate: 36 scenarios PASS');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
