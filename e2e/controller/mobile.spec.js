import { expect } from '@playwright/test';
import { test, CONTROLLER_EVENT_ID, login, USERS } from '../fixtures/app.js';
import {
  readFirestoreDocument,
  resetControllerE2EEvent,
  updateControllerE2EEvent,
} from '../helpers/firestoreAdmin.js';

const controllerPath = `/control-proyector/${CONTROLLER_EVENT_ID}`;
const viewports = [
  ['360x800', { width: 360, height: 800 }],
  ['390x844', { width: 390, height: 844 }],
  ['412x915', { width: 412, height: 915 }],
  ['768x1024', { width: 768, height: 1024 }],
  ['844x390', { width: 844, height: 390 }],
];

const imageUrl = (color) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="100%" height="100%" fill="${color}"/></svg>`)}`;
const mediaRoute = (id, sessionId = `mobile-${id}`) => ({
  active: true,
  mediaKey: id,
  mediaId: id,
  name: `Mobile ${id}`,
  url: imageUrl(id === 'a' ? '#1e1b4b' : id === 'b' ? '#164e63' : '#365314'),
  type: 'image',
  sessionId,
  positionSec: 4,
  anchorAt: Date.now(),
  syncVersion: 1,
  playing: true,
  volume: 0,
  loop: false,
  updatedAt: Date.now(),
  updatedBy: 'mobile e2e',
});

async function expectNoHorizontalOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scroll, `horizontal overflow: ${dimensions.scroll}px > ${dimensions.client}px`).toBeLessThanOrEqual(dimensions.client + 1);
}

async function expectWithinViewport(locator, page) {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
}

test.describe.serial('Controller mobile responsive', () => {
  let originalEvent;

  test.beforeAll(async () => {
    originalEvent = await readFirestoreDocument('eventos', CONTROLLER_EVENT_ID);
  });

  test.afterEach(async () => {
    await resetControllerE2EEvent(originalEvent);
  });

  test('MOBILE-CTRL-001 through MOBILE-PANIC-001 keep core mobile surfaces contained', async ({ page }, testInfo) => {
    await login(page, USERS.multimedia);
    await updateControllerE2EEvent({
      proyectorApagado: false,
      mediaOutputs: {
        projector: mediaRoute('a'),
        singers: mediaRoute('b'),
        musicians: mediaRoute('c'),
      },
      canvaOutputs: {},
    });

    for (const [name, viewport] of viewports) {
      await page.setViewportSize(viewport);
      await page.goto(controllerPath);
      await expect(page.getByText('En pantalla ahora', { exact: true })).toBeVisible();
      await expectNoHorizontalOverflow(page);
      const usesMobileWorkspace = viewport.width < 768 || viewport.height <= 500;
      if (!usesMobileWorkspace) {
        await testInfo.attach(`${name}-general`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
        continue;
      }

      await expectWithinViewport(page.getByTitle('Controles'), page);

      await page.getByTitle('Controles').click();
      const mobileControls = page.getByTestId('mobile-controls-modal');
      await mobileControls.getByTestId('mobile-controls-live').click();
      const liveMonitor = page.getByRole('region', { name: 'En vivo' });
      await expect(liveMonitor.getByTestId('live-output-multiview')).toBeVisible();
      await expect(liveMonitor.getByTestId('live-output-projector')).toBeVisible();
      await expect(liveMonitor.getByTestId('live-output-singers')).toBeVisible();
      await expect(liveMonitor.getByTestId('live-output-musicians')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Panic', exact: true })).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await testInfo.attach(`${name}-en-vivo`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });

      await mobileControls.getByTestId('mobile-controls-media').click();
      await expect(page.getByPlaceholder(/buscar en la bóveda/i)).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await testInfo.attach(`${name}-multimedia`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });

      await mobileControls.getByTestId('mobile-controls-songs').click();
      await expectNoHorizontalOverflow(page);
      await mobileControls.getByTestId('mobile-controls-close').click();

      if (viewport.width < 768) {
        await page.getByRole('button', { name: 'Biblia', exact: true }).click();
        await expectNoHorizontalOverflow(page);
        await page.getByRole('button', { name: 'Canva', exact: true }).click();
        await expectNoHorizontalOverflow(page);
        await testInfo.attach(`${name}-canva`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
      }
    }
  });
});
