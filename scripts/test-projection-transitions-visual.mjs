import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';

const virtualId = 'virtual:projection-transition-test.jsx';
const resolvedVirtualId = `\0${virtualId}`;
const testModule = `
  import React, { useState } from 'react';
  import { createRoot } from 'react-dom/client';
  import { jsx, jsxs } from 'react/jsx-runtime';
  import '/src/index.css';
  import RichLyricText from '/src/components/live/RichLyricText.jsx';

  function App() {
    const params = new URLSearchParams(location.search);
    const transition = params.get('transition') || 'fade';
    const motion = params.get('motion') || 'soft';
    const rich = params.get('rich') !== 'false';
    const [presentation, setPresentation] = useState(1);
    window.nextPresentation = () => setPresentation(value => value + 1);
    return jsxs('main', { style: { width: '960px', height: '540px', position: 'relative', overflow: 'hidden', background: '#09090b', color: 'white' }, children: [
      jsx('video', { 'data-background-video': true, src: '/e2e-projection-style-video.webm', autoPlay: true, loop: true, muted: true, style: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' } }),
      React.createElement('section', { key: presentation, 'data-presentation': presentation, 'data-transition': transition, className: 'projection-preset-worship projection-transition-' + transition, style: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }, children:
        jsx('div', { 'data-motion': motion, className: 'projection-motion-' + motion, style: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }, children: rich
          ? jsx(RichLyricText, { runs: [{ text: 'TU GRACIA', style: { bold: true, scale: 'xl' } }, { text: '\\nes suficiente', style: { scale: 'sm' } }], className: 'projection-lyric-text', safeMaxWidth: '90%', safeMaxHeight: '78%' })
          : jsx('div', { className: 'projection-lyric-text', children: 'Letra legacy' })
        })
      })
    ] });
  }
  createRoot(document.getElementById('root')).render(jsx(App, {}));
`;

const server = await createServer({
  configFile: false,
  root: process.cwd(),
  logLevel: 'error',
  plugins: [{
    name: 'projection-transition-fixture',
    resolveId: id => id === virtualId ? resolvedVirtualId : null,
    load: id => id === resolvedVirtualId ? testModule : null,
    configureServer(viteServer) {
      viteServer.middlewares.use('/__projection-transition-test__', async (_request, response) => {
        const html = await viteServer.transformIndexHtml('/__projection-transition-test__', `<!doctype html><html><body style="margin:0"><div id="root"></div><script type="module" src="/@id/${virtualId}"></script></body></html>`);
        response.statusCode = 200;
        response.setHeader('Content-Type', 'text/html');
        response.end(html);
      });
    },
  }, react()],
  server: { host: '127.0.0.1', port: 0 },
});

let browser;
try {
  await server.listen();
  const port = server.httpServer.address().port;
  browser = await chromium.launch({ headless: true });
  const expectedAnimations = {
    fade: 'projection-transition-fade-in',
    slide: 'projection-transition-slide-in',
    zoom: 'projection-transition-zoom-in',
    none: 'none',
  };

  for (const transition of Object.keys(expectedAnimations)) {
    for (const rich of [true, false]) {
      const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
      await page.goto(`http://127.0.0.1:${port}/__projection-transition-test__?transition=${transition}&motion=dynamic&rich=${rich}`);
      const presentation = page.locator('[data-presentation]');
      await presentation.waitFor();
      assert.equal(await presentation.evaluate(element => getComputedStyle(element).animationName), expectedAnimations[transition]);
      assert.equal(await page.locator('[data-motion]').evaluate(element => getComputedStyle(element).animationName), 'projection-style-dynamic-in');
      assert.equal(await presentation.isVisible(), true);
      const video = page.locator('[data-background-video]');
      const videoNodeStable = await page.evaluate(() => {
        const before = document.querySelector('[data-background-video]');
        window.nextPresentation();
        return new Promise(resolve => requestAnimationFrame(() => resolve(before === document.querySelector('[data-background-video]'))));
      });
      assert.equal(videoNodeStable, true, 'Changing text presentation must not remount the background video.');
      assert.equal(await video.count(), 1);
      await page.close();
    }
  }

  const reducedPage = await browser.newPage({ viewport: { width: 1000, height: 600 }, reducedMotion: 'reduce' });
  await reducedPage.goto(`http://127.0.0.1:${port}/__projection-transition-test__?transition=slide&motion=soft`);
  assert.equal(await reducedPage.locator('[data-presentation]').evaluate(element => getComputedStyle(element).animationName), 'none');
  assert.equal(await reducedPage.locator('[data-motion]').evaluate(element => getComputedStyle(element).animationName), 'none');
  assert.equal(await reducedPage.getByText('TU GRACIA').isVisible(), true);
  await reducedPage.close();

  console.log('projection transition visual contract: PASS');
} finally {
  await browser?.close();
  await server.close();
}
