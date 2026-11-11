import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { ROLE_KEYS, ROLE_PERMISSION_DEFAULTS } from '../src/utils/permissions.js';

const expectedEnvironment = {
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  KADOSH_E2E_SAFE: 'true',
  KADOSH_E2E_TARGET: 'firebase-emulators',
};

for (const [name, value] of Object.entries(expectedEnvironment)) {
  assert.equal(process.env[name], value, `${name} must be ${value} for the E2E fixture contract.`);
}

const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');
const PROJECT_ID = process.env.KADOSH_E2E_PROJECT_ID;
if (PROJECT_ID !== 'demo-kadosh-e2e') {
  throw new Error('Role fixtures E2E bloqueados: KADOSH_E2E_PROJECT_ID debe ser demo-kadosh-e2e.');
}
const app = admin.apps.length ? admin.app() : admin.initializeApp({ projectId: PROJECT_ID });
const db = app.firestore();

const expectedUsers = {
  'owner@e2e.local': 'dueño',
  'admin@e2e.local': 'admin',
  'multimedia@e2e.local': 'multimedia',
  'musico@e2e.local': 'musico',
  'cantante@e2e.local': 'cantante',
  'pastor@e2e.local': 'pastor',
  'predicador@e2e.local': 'predicador',
  'operator-a@e2e.local': 'multimedia',
  'operator-b@e2e.local': 'multimedia',
};

const roleDefaults = (await db.collection('sistema').doc('permissionRoles').get()).data()?.roleDefaults;
assert.deepEqual(roleDefaults, ROLE_PERMISSION_DEFAULTS, 'E2E roleDefaults must match ROLE_PERMISSION_DEFAULTS exactly.');
assert.deepEqual(Object.keys(roleDefaults).sort(), [...ROLE_KEYS].sort());

const userSnapshots = await db.collection('usuarios').get();
const usersByEmail = new Map(userSnapshots.docs.map((snapshot) => [snapshot.data().email, snapshot.data()]));
for (const [email, role] of Object.entries(expectedUsers)) {
  const user = usersByEmail.get(email);
  assert.ok(user, `Missing E2E fixture ${email}.`);
  assert.equal(user.rol, role, `Unexpected role for ${email}.`);
  assert.equal(Object.hasOwn(user, 'permissionOverrides'), false, `${email} must inherit role defaults without overrides.`);
}

console.log('E2E role fixtures: OK');
