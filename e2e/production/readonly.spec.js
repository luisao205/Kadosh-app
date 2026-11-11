import { expect, test } from '@playwright/test';

const MUTATING_METHODS = new Set(['PUT', 'PATCH', 'DELETE']);
const MUTATING_FIREBASE_PATHS = /(?:\/commit$|\/write\/|\/call$|cloudfunctions\.net\/[^/]+$)/i;

test.beforeEach(async ({ page }) => {
  await page.route('**/*', async (route) => {
    const request = route.request();
    const isMutatingMethod = MUTATING_METHODS.has(request.method());
    const isMutatingPost = request.method() === 'POST' && MUTATING_FIREBASE_PATHS.test(request.url());
    if (isMutatingMethod || isMutatingPost) return route.abort('blockedbyclient');
    return route.continue();
  });
});

test('PROD-A opens production without credentials or mutations', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  await page.goto('/');
  await expect(page.locator('body')).toBeVisible();
  expect(errors, errors.join('\n')).toEqual([]);
});
