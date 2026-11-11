import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const options = new Set(process.argv.slice(2));
const demoProjectId = 'demo-kadosh-e2e';
const e2ePort = process.env.KADOSH_E2E_PORT || '5175';
const args = ['playwright', 'test'];
const specOption = [...options].find((option) => option.startsWith('--spec='));
const specPath = specOption?.slice('--spec='.length);
const grepOption = [...options].find((option) => option.startsWith('--grep='));

if (specPath && (!specPath.startsWith('e2e/') || specPath.includes('..'))) {
  throw new Error('El spec E2E debe estar dentro de e2e/.');
}

if (specPath) {
  args.push(specPath, options.has('--visible') ? '--project=chromium-visible' : '--project=chromium');
  if (options.has('--visible')) args.push('--workers=1');
} else if (options.has('--songs') && options.has('--mobile') && options.has('--visible')) {
  args.push('e2e/songs/song-editor-mobile.spec.js', '--project=chromium-visible', '--workers=1');
} else if (options.has('--songs') && options.has('--mobile')) {
  args.push('e2e/songs/song-editor-mobile.spec.js', '--project=chromium');
} else if (options.has('--songs') && options.has('--visible')) {
  args.push('e2e/songs', '--project=chromium-visible', '--workers=1');
} else if (options.has('--songs')) {
  args.push('e2e/songs', '--project=chromium');
} else if (options.has('--music') && options.has('--visible')) {
  args.push('e2e/music', '--project=chromium-visible', '--workers=1');
} else if (options.has('--music')) {
  args.push('e2e/music', '--project=chromium');
} else if (options.has('--returns') && options.has('--visible')) {
  args.push('e2e/returns', '--project=chromium-visible', '--workers=1');
} else if (options.has('--returns')) {
  args.push('e2e/returns', '--project=chromium');
} else if (options.has('--controller') && options.has('--mobile') && options.has('--visible')) {
  args.push('e2e/controller/mobile.spec.js', '--project=chromium-visible', '--workers=1');
} else if (options.has('--controller') && options.has('--mobile')) {
  args.push('e2e/controller/mobile.spec.js', '--project=chromium');
} else if (options.has('--controller') && options.has('--visible')) {
  args.push('e2e/controller', '--project=chromium-visible', '--workers=1');
} else if (options.has('--controller')) {
  args.push('e2e/controller', '--project=chromium');
} else if (options.has('--visible')) {
  args.push('--project=chromium-visible', '--workers=1');
} else if (options.has('--smoke')) {
  args.push('e2e/smoke', '--project=chromium');
} else {
  args.push('--project=chromium');
}

if (grepOption) args.push('--grep', grepOption.slice('--grep='.length));

const playwrightCli = fileURLToPath(new URL('../node_modules/@playwright/test/cli.js', import.meta.url));
const child = spawn(process.execPath, [playwrightCli, ...args.slice(1)], {
  env: {
    ...process.env,
    KADOSH_E2E_SAFE: 'true',
    KADOSH_E2E_TARGET: 'firebase-emulators',
    KADOSH_E2E_PROJECT_ID: demoProjectId,
    KADOSH_E2E_PORT: e2ePort,
    VITE_E2E_SAFE: 'true',
    VITE_USE_FIREBASE_EMULATORS: 'true',
    VITE_PROJECT_ID: demoProjectId,
    VITE_API_KEY: 'demo-api-key',
    VITE_AUTH_DOMAIN: 'demo-kadosh-e2e.localhost',
    VITE_STORAGE_BUCKET: 'demo-kadosh-e2e.appspot.com',
    VITE_MESSAGING_SENDER_ID: '000000000000',
    VITE_APP_ID: '1:000000000000:web:demo',
    VITE_FIREBASE_EMULATOR_HOST: '127.0.0.1',
    VITE_AUTH_EMULATOR_PORT: '9099',
    VITE_FIRESTORE_EMULATOR_PORT: '8080',
    VITE_FUNCTIONS_EMULATOR_PORT: '5001',
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
    FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
    FUNCTIONS_EMULATOR_HOST: '127.0.0.1:5001',
  },
  stdio: 'inherit',
});

child.on('exit', (code) => process.exit(code ?? 1));
