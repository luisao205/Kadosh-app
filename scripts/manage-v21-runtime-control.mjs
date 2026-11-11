import process from 'node:process';
import { createRequire } from 'node:module';
import { applyV21RuntimeControl, prepareV21RuntimeControl } from './v21-runtime-control-admin-lib.mjs';

const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');
const args = Object.fromEntries(process.argv.slice(2).map((value, index, all) => value.startsWith('--')
  ? [value.slice(2), all[index + 1]?.startsWith('--') ? true : all[index + 1]]
  : [null, null]).filter(([key]) => key));
const projectId = String(args['project-id'] || '');
const operationId = String(args['operation-id'] || '');
const enabled = args.enabled === 'true' ? true : args.enabled === 'false' ? false : null;
const execute = args.execute === true;
const confirmation = String(args.confirm || '');
const expectedUpdateTime = String(args['expected-update-time'] || '');
const expectedProjectId = 'kadosh-49600';

if (process.env.FIRESTORE_EMULATOR_HOST) throw new Error('production_tool_rejects_emulator');
if (projectId !== expectedProjectId) throw new Error('project_id_mismatch');
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) throw new Error('explicit_adc_required');

const app = admin.initializeApp({ projectId }, `v21-runtime-control-${Date.now()}`);
try {
  const db = admin.firestore(app);
  const plan = await prepareV21RuntimeControl({ db, projectId, expectedProjectId, operationId, enabled });
  console.log(JSON.stringify({ mode: execute ? 'EXECUTE_REQUESTED' : 'DRY_RUN', ...plan }, null, 2));
  if (!execute) process.exitCode = 0;
  else {
    if (confirmation !== `APPLY:${projectId}:${operationId}`) throw new Error('explicit_confirmation_required');
    if (!expectedUpdateTime) throw new Error('expected_update_time_required');
    const result = await applyV21RuntimeControl({
      db,
      fieldValue: admin.firestore.FieldValue,
      plan,
      expectedUpdateTime,
      actor: String(args.actor || ''),
    });
    console.log(JSON.stringify({ mode: 'EXECUTED', result }, null, 2));
  }
} finally {
  await app.delete();
}
