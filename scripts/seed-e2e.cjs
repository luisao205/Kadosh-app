const { spawnSync } = require('node:child_process');

const expected = {
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  KADOSH_E2E_SAFE: 'true',
  KADOSH_E2E_TARGET: 'firebase-emulators',
  KADOSH_E2E_PROJECT_ID: 'demo-kadosh-e2e',
};

for (const [name, value] of Object.entries(expected)) {
  if (process.env[name] && process.env[name] !== value) {
    throw new Error(`Seed E2E bloqueado: ${name} debe ser ${value}.`);
  }
}

const result = spawnSync(process.execPath, ['scripts/seed-canva-e2e.cjs'], {
  env: { ...process.env, ...expected },
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
