import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { loadPrivateSecretVars } from './music-ai-secret-loader.mjs';

const PROJECT_ID = 'demo-kadosh-e2e';
const VITE_PORT = Number(process.env.KADOSH_E2E_PORT || 5175);
const verifyOnly = process.argv.includes('--verify-only');
const noGeminiApi = process.argv.includes('--no-gemini-api') || process.env.KADOSH_DISABLE_LIVE_GEMINI === 'true';

const firebaseCli = join(
  process.env.APPDATA || '',
  'npm',
  'node_modules',
  'firebase-tools',
  'lib',
  'bin',
  'firebase.js'
);
const viteCli = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));

if (!existsSync(firebaseCli)) {
  throw new Error(`Firebase CLI no encontrado en ${firebaseCli}`);
}

const isPortFree = (port, host = '127.0.0.1') => new Promise((resolve) => {
  const server = net.createServer();
  server.once('error', () => resolve(false));
  server.listen(port, host, () => server.close(() => resolve(true)));
});

const waitForPort = (port, host = '127.0.0.1', timeoutMs = 60000) => new Promise((resolve, reject) => {
  const start = Date.now();
  const attempt = () => {
    const socket = net.createConnection({ port, host });
    socket.once('connect', () => {
      socket.destroy();
      resolve();
    });
    socket.once('error', () => {
      socket.destroy();
      if (Date.now() - start >= timeoutMs) {
        reject(new Error(`Timeout esperando puerto ${host}:${port}`));
      } else {
        setTimeout(attempt, 400);
      }
    });
  };
  attempt();
});

// 1. Leer credenciales privadas en memoria desde %LOCALAPPDATA%\Kadosh\secrets\music-ai.env
const secretInfo = loadPrivateSecretVars();
const outsideOneDrive = !secretInfo.secretPath.toLowerCase().includes('onedrive');

if (!outsideOneDrive) {
  throw new Error('La ruta del secreto privado no puede estar dentro de OneDrive.');
}

// 2. Preparar entorno aislado para Firebase Emulators (Auth + Firestore + Functions)
const isolatedCliDir = mkdtempSync(join(tmpdir(), 'kadosh-preview-cli-'));
const isolatedCloudSdk = join(isolatedCliDir, 'gcloud');
const isolatedProfile = join(isolatedCliDir, 'profile');
mkdirSync(isolatedCloudSdk, { recursive: true });
mkdirSync(isolatedProfile, { recursive: true });

const emulatorEnv = {
  ...process.env,
  APPDATA: isolatedCliDir,
  LOCALAPPDATA: isolatedCliDir,
  HOME: isolatedProfile,
  USERPROFILE: isolatedProfile,
  XDG_CONFIG_HOME: join(isolatedProfile, '.config'),
  CLOUDSDK_CONFIG: isolatedCloudSdk,
  FIREBASE_EMULATORS_PATH: join(process.env.USERPROFILE || '', '.cache', 'firebase', 'emulators'),
  KADOSH_E2E_SAFE: 'true',
  KADOSH_E2E_TARGET: 'firebase-emulators',
  KADOSH_E2E_PROJECT_ID: PROJECT_ID,
  GCLOUD_PROJECT: PROJECT_ID,
  GOOGLE_CLOUD_PROJECT: PROJECT_ID,
  FIREBASE_CONFIG: JSON.stringify({ projectId: PROJECT_ID }),
  JAVA_TOOL_OPTIONS: '-Xms512m -Xmx2048m',
  GEMINI_MODEL: secretInfo.model,
};

if (noGeminiApi) {
  emulatorEnv.KADOSH_DISABLE_LIVE_GEMINI = 'true';
  delete emulatorEnv.GEMINI_API_KEY;
  delete emulatorEnv.GOOGLE_API_KEY;
} else {
  emulatorEnv.KADOSH_MUSIC_AI_ENV_PATH = secretInfo.secretPath;
  if (secretInfo.vars.GEMINI_API_KEY) {
    emulatorEnv.GEMINI_API_KEY = secretInfo.vars.GEMINI_API_KEY;
  }
  if (secretInfo.vars.GOOGLE_API_KEY) {
    emulatorEnv.GOOGLE_API_KEY = secretInfo.vars.GOOGLE_API_KEY;
  }
}

for (const prodKey of [
  'GOOGLE_APPLICATION_CREDENTIALS',
  'GOOGLE_CLOUD_QUOTA_PROJECT',
  'FIREBASE_TOKEN',
  'CLOUDSDK_AUTH_ACCESS_TOKEN',
  'FIRESTORE_EMULATOR_HOST',
  'FIREBASE_AUTH_EMULATOR_HOST',
  'FUNCTIONS_EMULATOR_HOST',
]) {
  delete emulatorEnv[prodKey];
}

// 3. Preparar entorno limpio para Vite Frontend (sin acceso a claves Gemini ni correos reales)
const viteEnv = {
  ...process.env,
  KADOSH_E2E_SAFE: 'true',
  KADOSH_E2E_TARGET: 'firebase-emulators',
  KADOSH_E2E_PROJECT_ID: PROJECT_ID,
  KADOSH_E2E_PORT: String(VITE_PORT),
  VITE_E2E_SAFE: 'true',
  VITE_USE_FIREBASE_EMULATORS: 'true',
  VITE_PROJECT_ID: PROJECT_ID,
  VITE_API_KEY: 'demo-api-key',
  VITE_AUTH_DOMAIN: 'demo-kadosh-e2e.localhost',
  VITE_STORAGE_BUCKET: 'demo-kadosh-e2e.appspot.com',
  VITE_MESSAGING_SENDER_ID: '000000000000',
  VITE_APP_ID: '1:000000000000:web:demo',
  VITE_FIREBASE_EMULATOR_HOST: '127.0.0.1',
  VITE_AUTH_EMULATOR_PORT: '9099',
  VITE_FIRESTORE_EMULATOR_PORT: '8080',
  VITE_FUNCTIONS_EMULATOR_PORT: '5001',
  VITE_OWNER_EMAIL: 'owner@e2e.local',
  VITE_GEMINI_API_KEY: '',
};
delete viteEnv.GEMINI_API_KEY;
delete viteEnv.GOOGLE_API_KEY;
delete viteEnv.KADOSH_MUSIC_AI_ENV_PATH;

if (verifyOnly) {
  console.log(JSON.stringify({
    projectId: PROJECT_ID,
    secretFilePath: secretInfo.secretPath,
    secretFileExists: secretInfo.exists,
    hasApiKeyConfigured: !noGeminiApi && secretInfo.hasApiKey,
    liveGeminiDisabledForPreview: noGeminiApi,
    outsideOneDrive,
    geminiModel: secretInfo.model,
    emulatorServices: ['auth:9099', 'firestore:8080', 'functions:5001'],
    frontendUrl: `http://127.0.0.1:${VITE_PORT}`,
    frontendIsolatedToDemoProject: viteEnv.VITE_PROJECT_ID === PROJECT_ID && viteEnv.VITE_E2E_SAFE === 'true',
    frontendHasGeminiKey: Boolean(viteEnv.GEMINI_API_KEY || viteEnv.VITE_GEMINI_API_KEY),
  }, null, 2));
  rmSync(isolatedCliDir, { recursive: true, force: true });
  process.exit(0);
}

for (const port of [9099, 8080, 5001, VITE_PORT]) {
  if (!(await isPortFree(port))) {
    rmSync(isolatedCliDir, { recursive: true, force: true });
    throw new Error(`El puerto ${port} ya está ocupado. Detén procesos anteriores antes de iniciar el preview.`);
  }
}

console.log('==========================================================');
console.log('  KADOSH MUSIC AI — PREVIEW AISLADO (SIN PRODUCCIÓN)');
console.log(`  Proyecto Firebase: ${PROJECT_ID}`);
console.log(`  Modo API Gemini en preview: ${noGeminiApi ? 'DESACTIVADO (0 cuotas)' : 'ACTIVO'}`);
console.log(`  1) Iniciando Emulators Auth:9099 / Firestore:8080 / Functions:5001...`);
console.log('==========================================================');

let vite = null;
let isShuttingDown = false;

const shutdown = (code = 0) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  try { vite?.kill(); } catch (_) {}
  try { emulators?.kill(); } catch (_) {}
  try { rmSync(isolatedCliDir, { recursive: true, force: true }); } catch (_) {}
  process.exit(code);
};

const emulators = spawn(
  process.execPath,
  [firebaseCli, 'emulators:start', '--project', PROJECT_ID, '--only', 'auth,firestore,functions'],
  { env: emulatorEnv, stdio: 'inherit', windowsHide: true }
);

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
emulators.on('exit', (code) => {
  if (!isShuttingDown) {
    console.error(`[PREVIEW] Firebase Emulators finalizó inesperadamente (código ${code ?? 1}). Deteniendo frontend para evitar ERR_CONNECTION_REFUSED.`);
    shutdown(code ?? 1);
  }
});

// Esperar a que Auth (9099), Firestore (8080) y Functions (5001) estén activos ANTES de iniciar Vite
try {
  await Promise.all([waitForPort(9099), waitForPort(8080), waitForPort(5001)]);
  const seedResult = spawnSync(process.execPath, ['scripts/seed-music-ai-preview.cjs'], {
    env: {
      ...process.env,
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
      FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
      KADOSH_E2E_PROJECT_ID: PROJECT_ID,
    },
    stdio: 'inherit',
    windowsHide: true,
  });
  if (seedResult.status !== 0) {
    throw new Error(`Fallo sembrando entorno preview (status=${seedResult.status})`);
  }

  console.log(`  2) Emulators listos. Iniciando Vite en http://127.0.0.1:${VITE_PORT}...`);
  vite = spawn(
    process.execPath,
    [viteCli, '--host', '127.0.0.1', '--port', String(VITE_PORT), '--strictPort', '--mode', 'local.emulator'],
    { env: viteEnv, stdio: 'inherit', windowsHide: true }
  );

  vite.on('exit', (code) => {
    if (!isShuttingDown) {
      console.error(`[PREVIEW] Vite finalizó inesperadamente (código ${code ?? 1}).`);
      shutdown(code ?? 1);
    }
  });

  await waitForPort(VITE_PORT);
  console.log(`\n[PREVIEW READY] Entorno completamente estable en: http://127.0.0.1:${VITE_PORT}/music-ai\n`);
} catch (err) {
  console.error('[PREVIEW BOOT ERROR]', err.message);
  shutdown(1);
}
