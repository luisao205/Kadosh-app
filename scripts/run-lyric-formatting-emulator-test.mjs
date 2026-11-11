import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import net from 'node:net';

const projectId = 'demo-kadosh-e2e';
const port = 8286;
const firebaseCli = join(process.env.APPDATA || '', 'npm', 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js');
if (!existsSync(firebaseCli)) throw new Error('firebase_cli_not_found');

const portIsFree = await new Promise(resolve => {
  const server = net.createServer();
  server.once('error', () => resolve(false));
  server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
});
if (!portIsFree) throw new Error(`isolated_emulator_port_${port}_unavailable`);

const isolatedAppData = mkdtempSync(join(tmpdir(), 'kadosh-lyrics-emulator-'));
const env = {
  ...process.env,
  APPDATA: isolatedAppData,
  KADOSH_E2E_SAFE: 'true',
  KADOSH_E2E_TARGET: 'firebase-emulators',
  KADOSH_E2E_PROJECT_ID: projectId,
  GCLOUD_PROJECT: projectId,
  GOOGLE_CLOUD_PROJECT: projectId,
  FIREBASE_CONFIG: JSON.stringify({ projectId }),
  JAVA_TOOL_OPTIONS: '-Xms512m -Xmx2048m',
  HTTP_PROXY: 'http://127.0.0.1:9',
  HTTPS_PROXY: 'http://127.0.0.1:9',
  NO_PROXY: '127.0.0.1,localhost',
};
delete env.GOOGLE_APPLICATION_CREDENTIALS;
delete env.FIREBASE_TOKEN;
delete env.CLOUDSDK_AUTH_ACCESS_TOKEN;

try {
  const testCommand = `"${process.execPath}" "scripts/test-lyric-formatting-firestore-emulator.cjs"`;
  const result = spawnSync(process.execPath, [firebaseCli, 'emulators:exec', '--project', projectId, '--config', 'firebase.lyric-formatting-emulator.json', '--only', 'firestore', testCommand], { env, stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(isolatedAppData, { recursive: true, force: true });
}
