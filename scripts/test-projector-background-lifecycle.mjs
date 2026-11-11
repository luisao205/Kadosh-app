import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const workspace = path.resolve(import.meta.dirname, '..');
const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'kadosh-background-lifecycle-'));
const componentUrl = pathToFileURL(path.join(workspace, 'src/components/live/ProjectorMediaBackground.jsx')).href;
const localVideo = '/e2e-projection-style-video.webm';

await writeFile(path.join(fixtureRoot, 'index.html'), '<div id="root"></div><script type="module" src="/src/main.jsx"></script>');
await mkdir(path.join(fixtureRoot, 'src'));
await writeFile(path.join(fixtureRoot, 'src', 'main.jsx'), `
  import React, { useState } from 'react';
  import { createRoot } from 'react-dom/client';
  import ProjectorMediaBackground from ${JSON.stringify(componentUrl)};

  const videoUrl = ${JSON.stringify(localVideo)};
  const App = () => {
    const [state, setState] = useState({ url: videoUrl, media: { mediaId: 'A', type: 'video' }, suspended: false, disabled: false });
    window.__backgroundTest = {
      set: (patch) => setState(current => ({ ...current, ...patch })),
      video: () => document.querySelector('[data-testid="background-host"] video'),
    };
    return <div data-testid="background-host"><ProjectorMediaBackground {...state} /></div>;
  };

  createRoot(document.getElementById('root')).render(<App />);
`);

const server = await createServer({
  root: fixtureRoot,
  publicDir: path.join(workspace, 'public'),
  plugins: [react()],
  resolve: {
    alias: {
      react: path.join(workspace, 'node_modules/react'),
      'react-dom': path.join(workspace, 'node_modules/react-dom'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 0,
    strictPort: false,
    fs: { allow: [workspace, fixtureRoot] },
  },
  logLevel: 'error',
});

let browser;
try {
  await server.listen();
  const address = server.httpServer.address();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`console.error: ${message.text()}`);
  });

  await page.goto(`http://127.0.0.1:${address.port}`);
  const video = page.locator('[data-testid="background-host"] video');
  await video.waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const element = window.__backgroundTest.video();
    return element && element.readyState >= 2 && !element.paused && element.currentTime > 0;
  });

  const identity = await video.evaluate(element => {
    element.dataset.lifecycleIdentity = 'original';
    return element.dataset.lifecycleIdentity;
  });
  assert.equal(identity, 'original');
  const beforeSuspend = await video.evaluate(element => element.currentTime);

  await page.evaluate(() => window.__backgroundTest.set({ suspended: true }));
  await page.waitForFunction(() => window.__backgroundTest.video()?.paused === true);
  const pausedAt = await video.evaluate(element => element.currentTime);
  await page.waitForTimeout(350);
  const pausedLater = await video.evaluate(element => element.currentTime);
  assert.ok(Math.abs(pausedLater - pausedAt) < 0.08, `suspended currentTime advanced: ${pausedAt} -> ${pausedLater}`);
  assert.equal(await video.getAttribute('data-lifecycle-identity'), 'original');

  await page.evaluate(() => window.__backgroundTest.set({ suspended: false }));
  await page.waitForFunction(() => {
    const element = window.__backgroundTest.video();
    return element && !element.paused && element.currentTime > 0;
  });
  const resumedAt = await video.evaluate(element => element.currentTime);
  assert.ok(resumedAt >= pausedAt - 0.08, `video restarted after resume: ${pausedAt} -> ${resumedAt}`);
  assert.ok(beforeSuspend > 0);
  assert.equal(await video.getAttribute('data-lifecycle-identity'), 'original');

  for (let cycle = 0; cycle < 3; cycle += 1) {
    await page.evaluate(() => window.__backgroundTest.set({ suspended: true }));
    await page.waitForFunction(() => window.__backgroundTest.video()?.paused === true);
    await page.evaluate(() => window.__backgroundTest.set({ suspended: false }));
    await page.waitForFunction(() => window.__backgroundTest.video()?.paused === false);
    assert.equal(await page.locator('[data-testid="background-host"] video').count(), 1);
  }

  await page.evaluate((url) => {
    window.__backgroundTest.set({ url: `${url}?B`, media: { mediaId: 'B', type: 'video' } });
    window.__backgroundTest.set({ url: `${url}?C`, media: { mediaId: 'C', type: 'video' } });
  }, localVideo);
  await page.waitForFunction(() => window.__backgroundTest.video()?.currentSrc.includes('?C'));
  await page.waitForTimeout(650);
  assert.equal(await page.locator('[data-testid="background-host"] video').count(), 1);
  assert.match(await video.getAttribute('src'), /\?C$/);

  await page.evaluate(() => window.__backgroundTest.set({ url: '/missing-background.webm', media: { mediaId: 'missing', type: 'video' } }));
  await page.waitForTimeout(300);
  assert.match(await video.getAttribute('src'), /\?C$/);

  await page.evaluate(() => window.__backgroundTest.set({ disabled: true }));
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="background-host"] video').length === 0);
  assert.deepEqual(errors, []);

  await context.close();
  console.log('projector background lifecycle visual contract: PASS');
} finally {
  if (browser) await browser.close();
  await server.close();
  await rm(fixtureRoot, { recursive: true, force: true });
}
