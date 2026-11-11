import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.KADOSH_PROD_URL;

if (process.env.KADOSH_PROD_READONLY !== 'true') {
  throw new Error('Produccion read-only bloqueada: KADOSH_PROD_READONLY=true es obligatorio.');
}

if (!baseURL || !/^https:\/\//.test(baseURL)) {
  throw new Error('Produccion read-only bloqueada: KADOSH_PROD_URL debe ser una URL HTTPS explicita.');
}

export default defineConfig({
  testDir: './e2e/production',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  use: {
    baseURL,
    locale: 'es-EC',
    timezoneId: 'America/Guayaquil',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
