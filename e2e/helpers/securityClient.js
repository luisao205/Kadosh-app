import { initializeApp, deleteApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

const EMULATORS = Object.freeze({
  auth: '127.0.0.1:9099',
  firestore: '127.0.0.1:8080',
  functions: '127.0.0.1:5001',
});
const PROJECT_ID = 'demo-kadosh-e2e';
const PASSWORD = 'LocalE2E-Canva-2026!';
let sequence = 0;

export function assertSecurityEmulators() {
  const expected = {
    FIREBASE_AUTH_EMULATOR_HOST: EMULATORS.auth,
    FIRESTORE_EMULATOR_HOST: EMULATORS.firestore,
    FUNCTIONS_EMULATOR_HOST: EMULATORS.functions,
  };
  for (const [name, value] of Object.entries(expected)) {
    if (process.env[name] !== value) {
      throw new Error(`Security E2E blocked: ${name} must be ${value}.`);
    }
  }
  if (process.env.KADOSH_E2E_PROJECT_ID !== PROJECT_ID) {
    throw new Error(`Security E2E blocked: KADOSH_E2E_PROJECT_ID must be ${PROJECT_ID}.`);
  }
}

export async function createSecurityActor(email) {
  assertSecurityEmulators();
  const app = initializeApp({
    apiKey: 'e2e-emulator-only',
    authDomain: '127.0.0.1',
    projectId: PROJECT_ID,
  }, `security-${sequence += 1}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${EMULATORS.auth}`, { disableWarnings: true });
  await signInWithEmailAndPassword(auth, email, PASSWORD);

  const firestore = getFirestore(app);
  connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
  const functions = getFunctions(app, 'us-central1');
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);

  return {
    firestore,
    callable: (name, data) => httpsCallable(functions, name)(data).then((result) => result.data),
    close: () => deleteApp(app),
  };
}

export async function expectPermissionDenied(operation, label) {
  try {
    await operation();
  } catch (error) {
    const code = String(error?.code || '');
    const message = String(error?.message || '');
    if (message.includes('maximum of 1000 expressions')) {
      throw new Error(`${label} exhausted the Firestore Rules expression budget.`);
    }
    if (code === 'permission-denied' || code === 'functions/permission-denied') return;
    throw new Error(`${label} must fail with permission-denied, received ${code || error?.message || 'unknown error'}.`);
  }
  throw new Error(`${label} was allowed unexpectedly.`);
}

