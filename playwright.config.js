import { defineConfig, devices } from '@playwright/test';

const emulatorEnvironment = {
  KADOSH_E2E_SAFE: 'true',
  KADOSH_E2E_TARGET: 'firebase-emulators',
  KADOSH_E2E_PROJECT_ID: 'demo-kadosh-e2e',
  VITE_E2E_SAFE: 'true',
  VITE_USE_FIREBASE_EMULATORS: 'true',
  VITE_PROJECT_ID: 'demo-kadosh-e2e',
  VITE_API_KEY: 'demo-api-key',
  VITE_AUTH_DOMAIN: 'demo-kadosh-e2e.localhost',
  VITE_STORAGE_BUCKET: 'demo-kadosh-e2e.appspot.com',
  VITE_MESSAGING_SENDER_ID: '000000000000',
  VITE_APP_ID: '1:000000000000:web:demo',
  VITE_FIREBASE_EMULATOR_HOST: '127.0.0.1',
  VITE_AUTH_EMULATOR_PORT: '9099',
  VITE_FIRESTORE_EMULATOR_PORT: '8080',
  VITE_FUNCTIONS_EMULATOR_PORT: '5001',
};

const e2ePort = process.env.KADOSH_E2E_PORT || '5175';
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: './e2e',
  testIgnore: ['e2e/production/**'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: e2eBaseUrl,
    locale: 'es-EC',
    timezoneId: 'America/Guayaquil',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'chromium-visible',
      use: {
        ...devices['Desktop Chrome'],
        headless: false,
        viewport: { width: 1600, height: 1000 },
        launchOptions: { slowMo: 300 },
      },
    },
  ],
  webServer: {
    command: `"${process.execPath}" scripts/run-e2e-vite.mjs`,
    url: e2eBaseUrl,
    reuseExistingServer: false,
    timeout: 30_000,
    env: emulatorEnvironment,
  },
});
