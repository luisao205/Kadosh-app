import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import net from 'node:net';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import process from 'node:process';

const projectId = 'demo-kadosh-e2e';
const ports = [9499, 8587, 5601, 4701, 4801];
const firebaseCli = join(process.env.APPDATA || '', 'npm', 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js');
if (!existsSync(firebaseCli)) throw new Error('firebase_cli_not_found');
const portIsFree = port => new Promise(resolve => {
  const server = net.createServer();
  server.once('error', () => resolve(false));
  server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
});
for (const port of ports) if (!(await portIsFree(port))) throw new Error(`isolated_emulator_port_${port}_unavailable`);

const run = ({ enabled, command }) => {
  const isolatedAppData = mkdtempSync(join(tmpdir(), 'kadosh-v21-callables-'));
  const isolatedCloudSdk = join(isolatedAppData, 'gcloud');
  const isolatedProfile = join(isolatedAppData, 'profile');
  mkdirSync(isolatedCloudSdk, { recursive: true });
  mkdirSync(isolatedProfile, { recursive: true });
  const env = {
    ...process.env,
    APPDATA: isolatedAppData,
    LOCALAPPDATA: isolatedAppData,
    HOME: isolatedProfile,
    USERPROFILE: isolatedProfile,
    XDG_CONFIG_HOME: join(isolatedProfile, '.config'),
    CLOUDSDK_CONFIG: isolatedCloudSdk,
    FIREBASE_EMULATORS_PATH: join(process.env.USERPROFILE || '', '.cache', 'firebase', 'emulators'),
    KADOSH_E2E_SAFE: 'true',
    KADOSH_E2E_TARGET: 'firebase-emulators',
    KADOSH_E2E_PROJECT_ID: projectId,
    KADOSH_V21_CALLABLES_ENABLED: enabled ? 'true' : 'false',
    KADOSH_V21_TEST_MODE: enabled ? 'enabled' : 'disabled',
    GCLOUD_PROJECT: projectId,
    GOOGLE_CLOUD_PROJECT: projectId,
    FIREBASE_CONFIG: JSON.stringify({ projectId }),
    JAVA_TOOL_OPTIONS: '-Xms512m -Xmx2048m',
    HTTP_PROXY: 'http://127.0.0.1:9',
    HTTPS_PROXY: 'http://127.0.0.1:9',
    NO_PROXY: '127.0.0.1,localhost',
    no_proxy: '127.0.0.1,localhost',
  };
  for (const key of ['GOOGLE_APPLICATION_CREDENTIALS', 'GOOGLE_CLOUD_QUOTA_PROJECT', 'FIREBASE_TOKEN', 'CLOUDSDK_AUTH_ACCESS_TOKEN', 'FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']) delete env[key];
  try {
    const testCommand = `"${process.execPath}" "${command}"`;
    return spawnSync(process.execPath, [
      firebaseCli, 'emulators:exec', '--project', projectId,
      '--config', 'firebase.v21-callable-emulator.json', '--only', 'auth,firestore,functions', testCommand,
    ], { env, stdio: 'inherit', windowsHide: true }).status ?? 1;
  } finally {
    rmSync(isolatedAppData, { recursive: true, force: true });
  }
};

let status = run({ enabled: false, command: 'scripts/test-v21-callables-emulator.cjs' });
if (status === 0) status = run({ enabled: true, command: 'scripts/run-v21-callable-client-sequence.mjs' });
process.exitCode = status;
