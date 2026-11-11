import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const PROJECT_ID = 'demo-kadosh-e2e';
const allowedScripts = new Set([
  'test-firestore-rules.mjs',
  'test-user-profile-bootstrap.mjs',
]);
const requestedScript = resolve(process.argv[2] || '');

if (!allowedScripts.has(basename(requestedScript)) || !requestedScript.startsWith(resolve('scripts'))) {
  throw new Error('Launcher Firestore DEMO bloqueado: script no autorizado.');
}

const firebaseCli = join(process.env.APPDATA || '', 'npm', 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js');
if (!existsSync(firebaseCli)) throw new Error(`Firebase CLI local no encontrado en ${firebaseCli}.`);

const isolatedAppData = mkdtempSync(join(tmpdir(), 'kadosh-demo-rules-'));
const environment = {
  ...process.env,
  APPDATA: isolatedAppData,
  KADOSH_E2E_SAFE: 'true',
  KADOSH_E2E_TARGET: 'firebase-emulators',
  KADOSH_E2E_PROJECT_ID: PROJECT_ID,
  GCLOUD_PROJECT: PROJECT_ID,
  GOOGLE_CLOUD_PROJECT: PROJECT_ID,
  FIREBASE_CONFIG: JSON.stringify({ projectId: PROJECT_ID }),
  JAVA_TOOL_OPTIONS: '-Xms512m -Xmx2048m',
  HTTP_PROXY: 'http://127.0.0.1:9',
  HTTPS_PROXY: 'http://127.0.0.1:9',
  NO_PROXY: '127.0.0.1,localhost',
};
delete environment.GOOGLE_APPLICATION_CREDENTIALS;
delete environment.FIREBASE_TOKEN;
delete environment.CLOUDSDK_AUTH_ACCESS_TOKEN;

try {
  const command = `"${process.execPath}" "${requestedScript}"`;
  const result = spawnSync(process.execPath, [
    firebaseCli,
    'emulators:exec',
    '--project', PROJECT_ID,
    '--only', 'firestore',
    command,
  ], { env: environment, stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(isolatedAppData, { recursive: true, force: true });
}
