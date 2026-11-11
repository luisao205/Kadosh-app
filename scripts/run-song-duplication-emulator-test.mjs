import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import net from 'node:net';
import process from 'node:process';

const host = '127.0.0.1';
const port = 8387;
const firebaseCli = join(process.env.APPDATA || '', 'npm', 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js');
if (!existsSync(firebaseCli)) throw new Error('firebase_cli_not_found');
const isFree = await new Promise((resolve) => {
  const server = net.createServer();
  server.once('error', () => resolve(false));
  server.once('listening', () => server.close(() => resolve(true)));
  server.listen(port, host);
});
if (!isFree) throw new Error(`isolated_firestore_port_in_use:${port}`);

const env = { ...process.env };
for (const key of ['GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_TOKEN', 'CLOUDSDK_AUTH_ACCESS_TOKEN', 'FIRESTORE_EMULATOR_HOST']) delete env[key];
Object.assign(env, {
  APPDATA: mkdtempSync(join(tmpdir(), 'kadosh-song-duplication-')),
  KADOSH_E2E_SAFE: 'true',
  KADOSH_E2E_TARGET: 'firebase-emulators',
  KADOSH_E2E_PROJECT_ID: 'demo-kadosh-e2e',
  GCLOUD_PROJECT: 'demo-kadosh-e2e',
  GOOGLE_CLOUD_PROJECT: 'demo-kadosh-e2e',
  FIREBASE_CONFIG: JSON.stringify({ projectId: 'demo-kadosh-e2e' }),
  JAVA_TOOL_OPTIONS: '-Xms512m -Xmx2048m',
  HTTP_PROXY: 'http://127.0.0.1:9',
  HTTPS_PROXY: 'http://127.0.0.1:9',
  NO_PROXY: '127.0.0.1,localhost',
  no_proxy: '127.0.0.1,localhost',
});

try {
  const command = `"${process.execPath}" "scripts/test-song-duplication-firestore-emulator.cjs"`;
  const result = spawnSync(process.execPath, [
    firebaseCli, 'emulators:exec', '--only', 'firestore', '--project', 'demo-kadosh-e2e',
    '--config', 'firebase.song-duplication-emulator.json', command,
  ], { cwd: process.cwd(), env, stdio: 'inherit', windowsHide: true });
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(env.APPDATA, { recursive: true, force: true });
}
