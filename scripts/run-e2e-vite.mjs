import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const safeEnvironment = {
  ...process.env,
  KADOSH_E2E_SAFE: 'true',
  KADOSH_E2E_TARGET: 'firebase-emulators',
  KADOSH_E2E_PROJECT_ID: 'demo-kadosh-e2e',
  VITE_E2E_SAFE: 'true',
  VITE_USE_FIREBASE_EMULATORS: 'true',
  VITE_PROJECT_ID: 'demo-kadosh-e2e',
  VITE_API_KEY: 'demo-api-key',
  VITE_AUTH_DOMAIN: 'demo-kadosh-e2e.localhost',
  VITE_STORAGE_BUCKET: 'demo-kadosh-e2e.appspot.com',
  VITE_MESSAGING_SENDER_ID: '000000000000',
  VITE_APP_ID: '1:000000000000:web:demo',
  VITE_FIREBASE_EMULATOR_HOST: '127.0.0.1',
  VITE_AUTH_EMULATOR_PORT: '9099',
  VITE_FIRESTORE_EMULATOR_PORT: '8080',
  VITE_FUNCTIONS_EMULATOR_PORT: '5001',
};

const port = process.env.KADOSH_E2E_PORT || '5175';

const viteCli = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
const vite = spawn(process.execPath, [
  viteCli, '--host', '127.0.0.1', '--port', port, '--strictPort',
], { env: safeEnvironment, stdio: 'inherit' });

vite.on('exit', (code) => process.exit(code ?? 1));
