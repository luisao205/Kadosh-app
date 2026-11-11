import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import net from 'node:net';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import process from 'node:process';
import assert from 'node:assert/strict';
import { loadPrivateSecretVars } from './music-ai-secret-loader.mjs';

const projectId = 'demo-kadosh-e2e';
const ports = [9099, 8080, 5001];
const firebaseCli = join(process.env.APPDATA || '', 'npm', 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js');
if (!existsSync(firebaseCli)) throw new Error('firebase_cli_not_found');

const portIsFree = (port) => new Promise((resolve) => {
  const server = net.createServer();
  server.once('error', () => resolve(false));
  server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
});

for (const port of ports) {
  if (!(await portIsFree(port))) throw new Error(`emulator_port_${port}_in_use`);
}

// 1. Verificar exclusiones de Git y Firebase y que NO exista secreto en OneDrive
const rootGitignore = readFileSync('.gitignore', 'utf8');
const fnGitignore = readFileSync('functions/.gitignore', 'utf8');
const firebaseConfigJson = JSON.parse(readFileSync('firebase.json', 'utf8'));

assert.ok(rootGitignore.includes('.env.local'), '.gitignore raíz debe excluir .env.local');
assert.ok(fnGitignore.includes('.env.local'), 'functions/.gitignore debe excluir .env.local');
assert.ok(firebaseConfigJson.functions[0].ignore.includes('.env.local'), 'firebase.json debe excluir .env.local');
assert.equal(existsSync('functions/.env.local'), false, 'No debe existir functions/.env.local dentro de OneDrive.');
assert.equal(existsSync('functions/.secret.local'), false, 'No debe existir functions/.secret.local dentro de OneDrive.');
console.log('[PASS] Exclusiones verificadas y cero archivos secretos dentro de OneDrive.');

// 2. Verificar ubicacion privada fuera de OneDrive
const secretInfo = loadPrivateSecretVars();
assert.equal(secretInfo.exists, true, 'El archivo privado fuera de OneDrive debe existir.');
assert.equal(secretInfo.secretPath.toLowerCase().includes('onedrive'), false, 'El secreto debe estar fuera de OneDrive.');
console.log('[PASS] Ubicación privada fuera de OneDrive verificada:', secretInfo.secretPath);

// 3. Verificar aislamiento de frontend en src/config/firebase.js
const firebaseClientSrc = readFileSync('src/config/firebase.js', 'utf8');
assert.match(firebaseClientSrc, /VITE_PROJECT_ID !== 'demo-kadosh-e2e'/, 'El modo seguro de frontend debe exigir proyecto demo-kadosh-e2e.');
assert.match(firebaseClientSrc, /connectAuthEmulator/, 'El frontend debe conectar Auth Emulator.');
assert.match(firebaseClientSrc, /connectFirestoreEmulator/, 'El frontend debe conectar Firestore Emulator.');
assert.match(firebaseClientSrc, /connectFunctionsEmulator/, 'El frontend debe conectar Functions Emulator.');
console.log('[PASS] Guardas de aislamiento de frontend verificadas para Auth, Firestore y Functions Emulator (demo-kadosh-e2e).');

// 4. Probar Firebase Emulators reales (auth, firestore, functions) en proyecto aislado demo-kadosh-e2e
// IMPORTANTE: No ejecutar llamadas reales a Gemini hasta que el usuario introduzca su clave; si la clave esta vacia, ejecuta modo local sin llamadas externas.
const isolatedAppData = mkdtempSync(join(tmpdir(), 'kadosh-music-ai-isolated-'));
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
  GCLOUD_PROJECT: projectId,
  GOOGLE_CLOUD_PROJECT: projectId,
  FIREBASE_CONFIG: JSON.stringify({ projectId }),
  JAVA_TOOL_OPTIONS: '-Xms512m -Xmx2048m',
  KADOSH_MUSIC_AI_ENV_PATH: secretInfo.secretPath,
  GEMINI_MODEL: secretInfo.model,
};

if (secretInfo.vars.GEMINI_API_KEY) {
  env.GEMINI_API_KEY = secretInfo.vars.GEMINI_API_KEY;
}

for (const key of [
  'GOOGLE_APPLICATION_CREDENTIALS',
  'GOOGLE_CLOUD_QUOTA_PROJECT',
  'FIREBASE_TOKEN',
  'CLOUDSDK_AUTH_ACCESS_TOKEN',
  'FIRESTORE_EMULATOR_HOST',
  'FIREBASE_AUTH_EMULATOR_HOST',
  'FUNCTIONS_EMULATOR_HOST'
]) {
  delete env[key];
}

try {
  const targetScript = process.argv.includes('--single-real')
    ? 'scripts/test-music-ai-single-real-call.cjs'
    : 'scripts/test-music-ai-emulators-http.cjs';
  const testCommand = `"${process.execPath}" "${targetScript}"`;
  const result = spawnSync(process.execPath, [
    firebaseCli,
    'emulators:exec',
    '--project', projectId,
    '--only', 'auth,firestore,functions',
    testCommand,
  ], { env, stdio: 'inherit', windowsHide: true });

  process.exit(result.status ?? 0);
} finally {
  rmSync(isolatedAppData, { recursive: true, force: true });
}
