import net from 'node:net';

const EXPECTED_ENVIRONMENT = {
  KADOSH_E2E_SAFE: 'true',
  KADOSH_E2E_TARGET: 'firebase-emulators',
  KADOSH_E2E_PROJECT_ID: 'demo-kadosh-e2e',
  VITE_E2E_SAFE: 'true',
  VITE_USE_FIREBASE_EMULATORS: 'true',
  VITE_FIREBASE_EMULATOR_HOST: '127.0.0.1',
  VITE_AUTH_EMULATOR_PORT: '9099',
  VITE_FIRESTORE_EMULATOR_PORT: '8080',
  VITE_FUNCTIONS_EMULATOR_PORT: '5001',
};

export function assertSafeE2EEnvironment() {
  for (const [name, value] of Object.entries(EXPECTED_ENVIRONMENT)) {
    if (process.env[name] !== value) {
      throw new Error(`E2E bloqueado: ${name} debe ser ${value}. Nunca ejecute tests destructivos contra Firebase real.`);
    }
  }
}

function assertPortOpen(port) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    const finish = (error) => {
      socket.destroy();
      error ? reject(error) : resolve();
    };
    socket.setTimeout(1_500);
    socket.once('connect', () => finish());
    socket.once('timeout', () => finish(new Error(`Timeout conectando al Emulator en 127.0.0.1:${port}.`)));
    socket.once('error', (error) => finish(new Error(`Emulator no disponible en 127.0.0.1:${port}: ${error.message}`)));
  });
}

export async function assertLocalEmulatorsReachable() {
  assertSafeE2EEnvironment();
  await Promise.all([assertPortOpen(9099), assertPortOpen(8080), assertPortOpen(5001)]);
}
