const PROJECT_ID = 'demo-kadosh-e2e';
const AUTH_ORIGIN = 'http://127.0.0.1:9099';
const FUNCTIONS_ORIGIN = 'http://127.0.0.1:5001';
const DEADLINE_MS = 20_000;
const POLL_MS = 250;

const requiredEnvironment = {
  KADOSH_E2E_SAFE: 'true',
  KADOSH_E2E_TARGET: 'firebase-emulators',
  KADOSH_E2E_PROJECT_ID: PROJECT_ID,
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  FUNCTIONS_EMULATOR_HOST: '127.0.0.1:5001',
};

for (const [name, expected] of Object.entries(requiredEnvironment)) {
  if (process.env[name] !== expected) throw new Error(`${name} must be ${expected}.`);
}
if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIREBASE_TOKEN || process.env.CLOUDSDK_AUTH_ACCESS_TOKEN) {
  throw new Error('Real credentials are forbidden for the V2.1 readiness probe.');
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const startedAt = performance.now();
const authResponse = await fetch(`${AUTH_ORIGIN}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'owner@e2e.local', password: 'LocalE2E-Canva-2026!', returnSecureToken: true }),
});
if (!authResponse.ok) throw new Error(`Auth Emulator readiness failed with HTTP ${authResponse.status}.`);
const { idToken } = await authResponse.json();
if (!idToken) throw new Error('Auth Emulator did not return an ID token.');

let attempts = 0;
let firstAttemptLatencyMs = null;
let lastError = null;
while (performance.now() - startedAt < DEADLINE_MS) {
  attempts += 1;
  const attemptStartedAt = performance.now();
  try {
    const response = await fetch(`${FUNCTIONS_ORIGIN}/${PROJECT_ID}/us-central1/getV21Capability`, {
      method: 'POST',
      headers: { authorization: `Bearer ${idToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ data: {} }),
    });
    const attemptLatencyMs = performance.now() - attemptStartedAt;
    if (firstAttemptLatencyMs === null) firstAttemptLatencyMs = attemptLatencyMs;
    const body = await response.json();
    if (response.ok && body?.result?.enabled === true) {
      console.log(JSON.stringify({
        projectId: PROJECT_ID,
        ready: true,
        attempts,
        firstAttemptLatencyMs: Math.round(firstAttemptLatencyMs),
        successfulAttemptLatencyMs: Math.round(attemptLatencyMs),
        totalLatencyMs: Math.round(performance.now() - startedAt),
      }));
      process.exit(0);
    }
    lastError = `HTTP ${response.status}`;
  } catch (error) {
    if (firstAttemptLatencyMs === null) firstAttemptLatencyMs = performance.now() - attemptStartedAt;
    lastError = error?.message || String(error);
  }
  await sleep(POLL_MS);
}

throw new Error(`getV21Capability was not ready within ${DEADLINE_MS}ms after ${attempts} attempts: ${lastError}`);
