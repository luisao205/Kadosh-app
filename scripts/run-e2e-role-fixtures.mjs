import { spawn } from 'node:child_process';

const child = spawn(process.execPath, ['scripts/test-e2e-role-fixtures.mjs'], {
  env: {
    ...process.env,
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
    FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
    KADOSH_E2E_SAFE: 'true',
    KADOSH_E2E_TARGET: 'firebase-emulators',
    KADOSH_E2E_PROJECT_ID: 'demo-kadosh-e2e',
  },
  stdio: 'inherit',
});

child.on('exit', (code) => process.exit(code ?? 1));
