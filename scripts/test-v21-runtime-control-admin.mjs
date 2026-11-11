import assert from 'node:assert/strict';
import { prepareV21RuntimeControl, applyV21RuntimeControl } from './v21-runtime-control-admin-lib.mjs';

const stamp = value => ({ toDate: () => new Date(value) });
const makeSnapshot = (exists, data = null, time = '2026-11-07T12:00:00.000Z') => ({ exists, data: () => data, updateTime: stamp(time) });
const control = makeSnapshot(true, { schemaVersion: 1, enabled: false, projectId: 'demo-kadosh-e2e', version: 2 });
const writes = [];
const controlRef = { collection: () => ({ doc: id => ({ kind: 'audit', id }) }) };
const db = {
  doc: path => ({ ...controlRef, path, get: async () => control }),
  runTransaction: async callback => callback({
    get: async ref => ref.kind === 'audit' ? makeSnapshot(false) : control,
    set: (...args) => writes.push(['set', ...args]),
    create: (...args) => writes.push(['create', ...args]),
  }),
};
const plan = await prepareV21RuntimeControl({ db, projectId: 'demo-kadosh-e2e', expectedProjectId: 'demo-kadosh-e2e', operationId: 'qa:disable:0001', enabled: true });
assert.equal(plan.expectedUpdateTime, '2026-11-07T12:00:00.000Z');
assert.equal(writes.length, 0, 'dry run must not write');
await assert.rejects(() => prepareV21RuntimeControl({ db, projectId: 'wrong', expectedProjectId: 'demo-kadosh-e2e', operationId: 'qa:disable:0001', enabled: true }), /project_id_mismatch/);
await assert.rejects(() => applyV21RuntimeControl({ db, fieldValue: { serverTimestamp: () => 'server' }, plan, expectedUpdateTime: 'stale', actor: 'qa' }), /expected_update_time_required/);
const result = await applyV21RuntimeControl({ db, fieldValue: { serverTimestamp: () => 'server' }, plan, expectedUpdateTime: plan.expectedUpdateTime, actor: 'qa-operator' });
assert.deepEqual(result, { applied: true, idempotent: false, version: 3 });
assert.equal(writes.filter(([kind]) => kind === 'set').length, 1);
assert.equal(writes.filter(([kind]) => kind === 'create').length, 1);
assert.equal(writes.find(([kind]) => kind === 'create')[2].operationId, 'qa:disable:0001');
console.log('V2.1 runtime control CAS: 7 scenarios PASS');
