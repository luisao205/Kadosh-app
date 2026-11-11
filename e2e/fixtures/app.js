import { expect, test as base } from '@playwright/test';
import { assertLocalEmulatorsReachable } from '../helpers/e2eSafety.js';

export const E2E_PASSWORD = 'LocalE2E-Canva-2026!';
export const CONTROLLER_EVENT_ID = 'e2e-controller-event';

export const USERS = Object.freeze({
  owner: { email: 'owner@e2e.local', name: 'Owner E2E' },
  admin: { email: 'admin@e2e.local', name: 'Admin E2E' },
  multimedia: { email: 'multimedia@e2e.local', name: 'Multimedia E2E' },
  musico: { email: 'musico@e2e.local', name: 'Musico E2E' },
  cantante: { email: 'cantante@e2e.local', name: 'Cantante E2E' },
  pastor: { email: 'pastor@e2e.local', name: 'Pastor E2E' },
  predicador: { email: 'predicador@e2e.local', name: 'Predicador E2E' },
  operatorA: { email: 'operator-a@e2e.local', name: 'Operador A E2E' },
  operatorB: { email: 'operator-b@e2e.local', name: 'Operador B E2E' },
});

let expectedConsoleErrors = [];

function isProductionFirebaseRequest(rawUrl) {
  const url = new URL(rawUrl);
  const host = url.hostname.toLowerCase();
  return host === 'firebase.googleapis.com'
    || host === 'firestore.googleapis.com'
    || host === 'identitytoolkit.googleapis.com'
    || host === 'securetoken.googleapis.com'
    || host === 'fcmregistrations.googleapis.com'
    || host.endsWith('.firebaseio.com')
    || host.endsWith('.firebasestorage.app')
    || host.endsWith('.appspot.com');
}

function isExpectedConsoleError(matcher, message) {
  if (matcher instanceof RegExp) return matcher.test(message.text());
  if (typeof matcher === 'function') return matcher(message);
  return false;
}

export const test = base.extend({
  productionNetworkGuard: [async ({ page }, use) => {
    const blocked = [];
    await page.route('**/*', async (route) => {
      if (isProductionFirebaseRequest(route.request().url())) {
        blocked.push(route.request().url());
        await route.abort('blockedbyclient');
        return;
      }
      await route.continue();
    });
    await use();
    expect(blocked, `Solicitudes Firebase de produccion bloqueadas:\n${blocked.join('\n')}`).toEqual([]);
  }, { auto: true }],
  e2eDiagnostics: [async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error' && !expectedConsoleErrors.some((matcher) => isExpectedConsoleError(matcher, message))) {
        errors.push(`console.error: ${message.text()}`);
      }
    });
    await use();
    expect(errors, errors.join('\n')).toEqual([]);
  }, { auto: true }],
});

test.beforeEach(async () => {
  expectedConsoleErrors = [];
  await assertLocalEmulatorsReachable();
});

export function allowExpectedConsoleError(matcher) {
  if (!(matcher instanceof RegExp) && typeof matcher !== 'function') {
    throw new Error('Los errores esperados E2E deben usar RegExp o un predicado de ConsoleMessage.');
  }
  expectedConsoleErrors.push(matcher);
}

export async function expectLogin(page) {
  await expect(page.getByRole('heading', { name: /iniciar sesi.n/i })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__KADOSH_E2E_EMULATORS__ === true)).toBe(true);
}

export async function login(page, user = USERS.multimedia) {
  await page.goto('/');
  await expectLogin(page);
  await page.getByLabel(/correo electr.nico/i).fill(user.email);
  await page.getByLabel(/contrase.a/i).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: /entrar a kadosh pro/i }).click();
  await expect(page.getByRole('button', { name: /cerrar sesi.n/i })).toBeVisible();
}

export async function logout(page) {
  await page.getByRole('button', { name: /cerrar sesi.n/i }).click();
  await expectLogin(page);
}
