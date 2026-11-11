import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const PROJECT_ID = 'demo-kadosh-e2e';
const firebaseCli = join(process.env.APPDATA || '', 'npm', 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js');
if (!existsSync(firebaseCli)) throw new Error(`Firebase CLI local no encontrado en ${firebaseCli}.`);

const isolatedAppData = mkdtempSync(join(tmpdir(), 'kadosh-chats-rules-'));
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
  const command = `"${process.execPath}" "scripts/test-official-chats-rules.mjs"`;
  const result = spawnSync(process.execPath, [
    firebaseCli,
    'emulators:exec',
    '--project', PROJECT_ID,
    '--only', 'firestore',
    command,
  ], { env: environment, stdio: 'inherit', windowsHide: true });
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(isolatedAppData, { recursive: true, force: true });
}
