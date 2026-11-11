import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';

const virtualId = 'virtual:rich-lyric-visual-test.jsx';
const resolvedVirtualId = `\0${virtualId}`;
const testModule = `
  import React, { useState } from 'react';
  import { createRoot } from 'react-dom/client';
  import { jsx } from 'react/jsx-runtime';
  import '/src/index.css';
  import RichLyricText from '/src/components/live/RichLyricText.jsx';

  const scenarios = {
    mixed: [
      { text: 'TU GRACIA', style: { bold: true, transform: 'uppercase', scale: 'xl', color: 'primary' } },
      { text: '\\nes suficiente', style: { scale: 'sm', color: 'secondary' } },
      { text: '\\nTU PRESENCIA', style: { bold: true, scale: 'lg', color: 'accent' } },
      { text: '\\nes mi hogar', style: { scale: 'xs', color: 'muted', spacing: 'relaxed' } },
    ],
    long: [{ text: Array.from({ length: 9 }, (_, index) => 'Línea extensa número ' + (index + 1) + ' con palabras legibles').join('\\n'), style: { scale: 'md' } }],
    horizontal: [{ text: 'PALABRAEXCEPCIONALMENTELARGASINESEPARADORES'.repeat(8), style: { scale: 'xl', bold: true } }],
    overflow: [{ text: Array.from({ length: 30 }, (_, index) => 'Línea ' + index + ' que no debe truncarse silenciosamente').join('\\n'), style: { scale: 'xl' } }],
    malicious: [{ text: '<img src=x onerror=alert(1)> & texto seguro', style: { scale: 'md' } }],
    chordsExcluded: [{ text: 'Que ruja el león\\nAnte la majestad', style: { scale: 'md' } }],
  };

  const params = new URLSearchParams(location.search);
  const scenario = params.get('scenario') || 'mixed';
  const initialWidth = Number(params.get('width')) || 960;
  const initialHeight = Number(params.get('height')) || 540;
  const min = Number(params.get('min')) || 18;
  function App() {
    const [size, setSize] = useState({ width: initialWidth, height: initialHeight });
    window.resizeFixture = (width, height) => setSize({ width, height });
    return jsx('main', {
      style: { width: size.width, height: size.height, background: '#09090b', color: 'white' },
      children: jsx(RichLyricText, {
        runs: scenarios[scenario],
        minBaseFontSize: min,
        maxBaseFontSize: 220,
        safeMaxWidth: '100%',
        safeMaxHeight: '100%',
        className: 'font-black',
      }),
    });
  }
  createRoot(document.getElementById('root')).render(jsx(App, {}));
`;

const server = await createServer({
  configFile: false,
  root: process.cwd(),
  logLevel: 'error',
  plugins: [{
    name: 'rich-lyric-visual-fixture',
    resolveId(id) {
      return id === virtualId ? resolvedVirtualId : null;
    },
    load(id) {
      return id === resolvedVirtualId ? testModule : null;
    },
    configureServer(viteServer) {
      viteServer.middlewares.use('/__rich-lyric-test__', async (_request, response) => {
        const html = await viteServer.transformIndexHtml('/__rich-lyric-test__', `<!doctype html><html><head><meta charset="UTF-8"></head><body style="margin:0"><div id="root"></div><script type="module" src="/@id/${virtualId}"></script></body></html>`);
        response.statusCode = 200;
        response.setHeader('Content-Type', 'text/html');
        response.end(html);
      });
    },
  }, react()],
  server: { host: '127.0.0.1', port: 0, strictPort: false },
});

let browser;
try {
  await server.listen();
  const address = server.httpServer.address();
  const baseUrl = `http://127.0.0.1:${address.port}/__rich-lyric-test__/`;
  browser = await chromium.launch({ headless: true });

  const inspect = async ({ viewport, fixture, scenario = 'mixed', min = 18, reducedMotion = false }) => {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    if (reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${baseUrl}?scenario=${scenario}&width=${fixture.width}&height=${fixture.height}&min=${min}`);
    const container = page.locator('[data-rich-lyric-container]');
    await container.waitFor();
    await page.waitForFunction(() => Number(document.querySelector('[data-rich-lyric-base-size]')?.dataset.richLyricBaseSize) > 0);
    const metrics = await container.evaluate((element) => {
      const text = element.firstElementChild;
      return {
        clientWidth: element.clientWidth,
        clientHeight: element.clientHeight,
        scrollWidth: text.scrollWidth,
        scrollHeight: text.scrollHeight,
        overflow: element.dataset.richLyricOverflow,
        baseSize: Number(element.dataset.richLyricBaseSize),
        reducedMotion: element.dataset.reducedMotion,
        text: text.textContent,
        runSizes: [...text.querySelectorAll('[data-rich-lyric-run]')].map((run) => Number.parseFloat(getComputedStyle(run).fontSize)),
        runWeights: [...text.querySelectorAll('[data-rich-lyric-run]')].map((run) => getComputedStyle(run).fontWeight),
        runTransforms: [...text.querySelectorAll('[data-rich-lyric-run]')].map((run) => getComputedStyle(run).textTransform),
        runColors: [...text.querySelectorAll('[data-rich-lyric-run]')].map((run) => getComputedStyle(run).color),
        runSpacing: [...text.querySelectorAll('[data-rich-lyric-run]')].map((run) => getComputedStyle(run).letterSpacing),
        imageCount: text.querySelectorAll('img').length,
      };
    });
    await context.close();
    return metrics;
  };

  for (const fixture of [
    { name: 'full-hd', viewport: { width: 1920, height: 1080 }, box: { width: 1728, height: 842 } },
    { name: '4k', viewport: { width: 3840, height: 2160 }, box: { width: 3456, height: 1684 } },
    { name: '4-3', viewport: { width: 1200, height: 900 }, box: { width: 1080, height: 702 } },
    { name: 'preview', viewport: { width: 640, height: 480 }, box: { width: 360, height: 220 } },
  ]) {
    const metrics = await inspect({ viewport: fixture.viewport, fixture: fixture.box });
    assert.equal(metrics.overflow, 'false', `${fixture.name} should fit.`);
    assert.ok(metrics.scrollWidth <= metrics.clientWidth + 1, `${fixture.name} clips horizontally.`);
    assert.ok(metrics.scrollHeight <= metrics.clientHeight + 1, `${fixture.name} clips vertically.`);
    assert.ok(metrics.runSizes[0] > metrics.runSizes[1], `${fixture.name} lost relative scale.`);
    assert.equal(metrics.runWeights[0], '900', `${fixture.name} lost bold semantics.`);
    assert.equal(metrics.runTransforms[0], 'uppercase', `${fixture.name} lost transform semantics.`);
    assert.notEqual(metrics.runColors[0], metrics.runColors[1], `${fixture.name} lost semantic colors.`);
    assert.notEqual(metrics.runSpacing[3], 'normal', `${fixture.name} lost allowed spacing.`);
  }

  const horizontal = await inspect({ viewport: { width: 500, height: 500 }, fixture: { width: 140, height: 360 }, scenario: 'horizontal', min: 18 });
  assert.ok(horizontal.overflow === 'true' || horizontal.scrollWidth <= horizontal.clientWidth + 1, 'Horizontal pressure must fit or report overflow.');

  const overflow = await inspect({ viewport: { width: 400, height: 240 }, fixture: { width: 180, height: 80 }, scenario: 'overflow', min: 24 });
  assert.equal(overflow.overflow, 'true', 'Irreducible content must expose overflow.');
  assert.match(overflow.text, /Línea 29/, 'Overflow must not truncate source text.');

  const malicious = await inspect({ viewport: { width: 800, height: 600 }, fixture: { width: 600, height: 300 }, scenario: 'malicious' });
  assert.equal(malicious.imageCount, 0, 'Text resembling HTML must not create elements.');
  assert.match(malicious.text, /<img src=x onerror=alert\(1\)>/);

  const chords = await inspect({ viewport: { width: 800, height: 600 }, fixture: { width: 600, height: 300 }, scenario: 'chordsExcluded' });
  assert.equal(chords.text.includes('[C]') || chords.text.includes('[F#m]'), false, 'Projected runs remain compatible with chord-free parser output.');

  const reduced = await inspect({ viewport: { width: 800, height: 600 }, fixture: { width: 600, height: 300 }, reducedMotion: true });
  assert.equal(reduced.reducedMotion, 'true');
  assert.match(reduced.text, /TU GRACIA/);

  const context = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const page = await context.newPage();
  await page.goto(`${baseUrl}?scenario=long&width=800&height=500`);
  const container = page.locator('[data-rich-lyric-container]');
  await container.waitFor();
  const before = Number(await container.getAttribute('data-rich-lyric-base-size'));
  await page.evaluate(() => window.resizeFixture(420, 220));
  await page.waitForFunction((oldSize) => Number(document.querySelector('[data-rich-lyric-base-size]').dataset.richLyricBaseSize) < oldSize, before);
  const after = Number(await container.getAttribute('data-rich-lyric-base-size'));
  assert.ok(after < before, 'ResizeObserver must recompute the common base size.');
  await context.close();

  console.log('Projection V2.1 rich lyric renderer visual tests: PASS');
} finally {
  await browser?.close();
  await server.close();
}
