import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const PROJECT_ID = 'demo-kadosh-e2e';
const firebaseCli = join(process.env.APPDATA || '', 'npm', 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js');

if (!existsSync(firebaseCli)) {
  throw new Error(`Firebase CLI local no encontrado en ${firebaseCli}.`);
}

const isolatedAppData = mkdtempSync(join(tmpdir(), 'kadosh-demo-e2e-'));
const emulatorCache = join(process.env.USERPROFILE || '', '.cache', 'firebase', 'emulators');
const firebaseConfig = JSON.stringify({ projectId: PROJECT_ID });
const childEnvironment = {
  ...process.env,
  APPDATA: isolatedAppData,
  LOCALAPPDATA: isolatedAppData,
  HOME: join(isolatedAppData, 'profile'),
  USERPROFILE: join(isolatedAppData, 'profile'),
  CLOUDSDK_CONFIG: join(isolatedAppData, 'gcloud'),
  FIREBASE_EMULATORS_PATH: emulatorCache,
  KADOSH_E2E_SAFE: 'true',
  KADOSH_E2E_TARGET: 'firebase-emulators',
  KADOSH_E2E_PROJECT_ID: PROJECT_ID,
  GCLOUD_PROJECT: PROJECT_ID,
  GOOGLE_CLOUD_PROJECT: PROJECT_ID,
  FIREBASE_CONFIG: firebaseConfig,
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  FUNCTIONS_EMULATOR_HOST: '127.0.0.1:5001',
  JAVA_TOOL_OPTIONS: '-Xms512m -Xmx2048m',
  HTTP_PROXY: 'http://127.0.0.1:9',
  HTTPS_PROXY: 'http://127.0.0.1:9',
  NO_PROXY: '127.0.0.1,localhost',
};

delete childEnvironment.GOOGLE_APPLICATION_CREDENTIALS;
delete childEnvironment.FIREBASE_TOKEN;
delete childEnvironment.CLOUDSDK_AUTH_ACCESS_TOKEN;

if (process.argv.includes('--verify-only')) {
  console.log(JSON.stringify({
    projectId: PROJECT_ID,
    services: ['auth', 'firestore', 'functions'],
    importDirectory: null,
    credentialsExposed: false,
    externalProxyBlocked: true,
    javaToolOptions: childEnvironment.JAVA_TOOL_OPTIONS,
  }));
  rmSync(isolatedAppData, { recursive: true, force: true });
  process.exit(0);
}

const child = spawn(process.execPath, [
  firebaseCli,
  'emulators:start',
  '--project', PROJECT_ID,
  '--config', 'firebase.candidate-e2e.json',
  '--only', 'auth,firestore,functions',
  '--debug',
], { env: childEnvironment, stdio: 'inherit' });

const stop = (signal) => {
  if (child.killed) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
    return;
  }
  child.kill(signal);
};

process.once('SIGINT', () => stop('SIGINT'));
process.once('SIGTERM', () => stop('SIGTERM'));
child.once('exit', (code) => {
  rmSync(isolatedAppData, { recursive: true, force: true });
  process.exit(code ?? 1);
});
