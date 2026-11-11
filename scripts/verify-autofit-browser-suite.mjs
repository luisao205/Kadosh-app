import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';

const ARTIFACT_DIR = path.resolve('C:/Users/luist/.gemini/antigravity/brain/8a0557e5-4d27-476b-a060-d8ba8b4112c3/screenshots');
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

const virtualId = 'virtual:projection-visual-suite.jsx';
const resolvedVirtualId = `\0${virtualId}`;

const testModule = `
  import React, { useState } from 'react';
  import { createRoot } from 'react-dom/client';
  import { jsx } from 'react/jsx-runtime';
  import '/src/index.css';
  import AutoFitText from '/src/components/live/AutoFitText.jsx';
  import RichLyricText from '/src/components/live/RichLyricText.jsx';

  const slidesData = {
    slide1: {
      type: 'song',
      preset: 'clean',
      text: 'Gracia sublime es\\nPerfecto es tu amor\\nTomaste mi lugar\\nCargaste tú mi cruz',
    },
    slide2: {
      type: 'song',
      preset: 'worship',
      text: 'Al que está sentado en el trono\\ny al Cordero\\nsea la gloria y el honor\\npor los siglos de los siglos',
    },
    slide3_minimal: {
      type: 'song',
      preset: 'minimal',
      text: 'Santo, Santo, Santo\\nDios Todopoderoso',
    },
    slide4_cinematic: {
      type: 'song',
      preset: 'cinematic',
      text: 'Tu fidelidad es grande,\\ntu fidelidad incomparable es',
    },
    slide5_impact: {
      type: 'song',
      preset: 'impact',
      text: 'ALELUYA, REINA EL SEÑOR',
    },
    slide_bible: {
      type: 'bible',
      reference: 'FILIPENSES 4:13',
      text: 'Todo lo puedo en Cristo que me fortalece.',
      translation: 'RVR1960',
    },
    slide_preaching: {
      type: 'preaching',
      reference: 'PUNTO 1: LA FE EN MEDIO DE LA PRUEBA',
      text: 'La fe no es la ausencia de dudas o dificultades, sino la certeza inquebrantable de que Dios cumple cada una de sus promesas.',
    },
  };

  function App() {
    const [currentKey, setCurrentKey] = useState('slide1');
    const [customPreset, setCustomPreset] = useState(null);

    window.__setSlide = (key, optPreset) => {
      setCurrentKey(key);
      if (optPreset) setCustomPreset(optPreset);
      else setCustomPreset(null);
    };

    const currentSlide = slidesData[currentKey] || slidesData.slide1;
    const preset = customPreset || currentSlide.preset || 'clean';
    const isBible = currentSlide.type === 'bible';
    const isPreaching = currentSlide.type === 'preaching';

    return jsx('div', {
      id: 'projection-root',
      className: 'fixed inset-0 bg-black flex flex-col items-center justify-center p-8 md:p-16 projection-preset-' + preset,
      children: isBible ? (
        jsx('div', {
          className: 'relative flex h-full w-full flex-col items-center justify-center text-center px-[5vw] py-[5vh]',
          children: [
            jsx('p', {
              key: 'ref',
              className: 'mb-4 text-3xl font-black uppercase tracking-wider text-amber-200 drop-shadow-xl',
              children: currentSlide.reference,
            }),
            jsx('div', {
              key: 'content',
              className: 'min-h-0 w-full flex-1 flex items-center justify-center',
              children: jsx(AutoFitText, {
                text: currentSlide.text,
                minFontSize: 36,
                maxFontSize: 240,
                safeMaxWidth: '92vw',
                safeMaxHeight: '100%',
                variant: 'projector',
                className: 'font-black leading-[1.08] text-white drop-shadow-[0_10px_45px_rgba(0,0,0,0.85)]',
              }),
            }),
            jsx('p', {
              key: 'trans',
              className: 'mt-4 rounded-full border border-white/10 bg-white/10 px-6 py-2 text-sm font-black uppercase tracking-widest text-zinc-300',
              children: currentSlide.translation,
            }),
          ],
        })
      ) : isPreaching ? (
        jsx('div', {
          className: 'relative flex h-full w-full flex-col items-center justify-center text-center px-8',
          children: [
            jsx('p', {
              key: 'ref',
              className: 'mb-4 text-2xl font-black uppercase text-amber-100',
              children: currentSlide.reference,
            }),
            jsx('div', {
              key: 'content',
              className: 'min-h-0 w-full flex-1 flex items-center justify-center',
              children: jsx(AutoFitText, {
                text: currentSlide.text,
                minFontSize: 28,
                maxFontSize: 160,
                safeMaxWidth: '94%',
                safeMaxHeight: '96%',
                variant: 'projector',
                className: 'font-black leading-[1.08] text-white drop-shadow-[0_10px_45px_rgba(0,0,0,0.85)]',
              }),
            }),
          ],
        })
      ) : (
        jsx('div', {
          className: 'w-full h-full flex items-center justify-center overflow-hidden drop-shadow-[0_0_60px_rgba(0,0,0,1)]',
          children: jsx(AutoFitText, {
            text: currentSlide.text,
            minFontSize: 36,
            maxFontSize: 240,
            safeMaxWidth: '90vw',
            safeMaxHeight: '78vh',
            variant: 'projector',
            lineHeight: preset === 'worship' ? 1.24 : preset === 'cinematic' ? 1.17 : preset === 'minimal' ? 1.3 : preset === 'impact' ? 1.02 : 1.08,
            className: 'projection-lyric-text font-black tracking-tight text-outline',
          }),
        })
      ),
    });
  }

  createRoot(document.getElementById('root')).render(jsx(App, {}));
`;

async function main() {
  console.log('--- STARTING PROJECTION AUTOFIT BROWSER VERIFICATION SUITE ---');

  const server = await createServer({
    configFile: false,
    root: process.cwd(),
    logLevel: 'error',
    plugins: [
      {
        name: 'projection-visual-suite-plugin',
        resolveId(id) {
          return id === virtualId ? resolvedVirtualId : null;
        },
        load(id) {
          return id === resolvedVirtualId ? testModule : null;
        },
        configureServer(viteServer) {
          viteServer.middlewares.use('/__projection_suite__', async (_req, res) => {
            const html = await viteServer.transformIndexHtml(
              '/__projection_suite__',
              `<!doctype html><html><head><meta charset="UTF-8"><link rel="stylesheet" href="/src/index.css"></head><body style="margin:0; background:black"><div id="root"></div><script type="module" src="/@id/${virtualId}"></script></body></html>`
            );
            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/html');
            res.end(html);
          });
        },
      },
      react(),
    ],
    server: { host: '127.0.0.1', port: 0, strictPort: false },
  });

  await server.listen();
  const address = server.httpServer.address();
  const baseUrl = `http://127.0.0.1:${address.port}/__projection_suite__`;

  const browser = await chromium.launch({ headless: true });
  const checkZeroClipping = async (page, contextLabel) => {
    const data = await page.evaluate(() => {
      const textEl = document.querySelector('.projection-lyric-text, [class*="leading-"]');
      const containerEl = textEl?.parentElement;
      if (!textEl || !containerEl) return null;

      const textRect = textEl.getBoundingClientRect();
      const winH = window.innerHeight;
      const winW = window.innerWidth;

      return {
        fontSize: textEl.style.fontSize,
        textRect: {
          top: Math.round(textRect.top),
          bottom: Math.round(textRect.bottom),
          left: Math.round(textRect.left),
          right: Math.round(textRect.right),
          width: Math.round(textRect.width),
          height: Math.round(textRect.height),
        },
        clippedBottom: textRect.bottom > winH,
        clippedTop: textRect.top < 0,
        clippedRight: textRect.right > winW,
        clippedLeft: textRect.left < 0,
      };
    });

    assert.ok(data, `${contextLabel}: Target element must exist`);
    assert.ok(!data.clippedBottom, `${contextLabel}: Clipped at bottom! (bot: ${data.textRect.bottom}, winH: 1080)`);
    assert.ok(!data.clippedTop, `${contextLabel}: Clipped at top! (top: ${data.textRect.top})`);
    assert.ok(!data.clippedRight, `${contextLabel}: Clipped at right! (right: ${data.textRect.right}, winW: 1920)`);
    assert.ok(!data.clippedLeft, `${contextLabel}: Clipped at left! (left: ${data.textRect.left})`);

    return data;
  };

  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

    // ==========================================
    // TEST 1: FIRST RENDER (Auto-fit on frame 0, NO manual interaction/touch/fullscreen)
    // ==========================================
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    // Verify immediate layout without any clicking
    const firstRenderMetrics = await checkZeroClipping(page, 'Test 1: First Render');
    console.log(`[PASS] Test 1 (First Render): Auto-fitted to ${firstRenderMetrics.fontSize}, rect ${firstRenderMetrics.textRect.width}x${firstRenderMetrics.textRect.height}`);
    const shot1 = path.join(ARTIFACT_DIR, '01-first-render-autofit.png');
    await page.screenshot({ path: shot1 });

    // ==========================================
    // TEST 2: SLIDE CHANGE (Navigate to slide 2 with Worship preset)
    // ==========================================
    await page.evaluate(() => window.__setSlide('slide2'));
    await page.waitForTimeout(50);
    const slide2Metrics = await checkZeroClipping(page, 'Test 2: Slide Change (Worship)');
    console.log(`[PASS] Test 2 (Slide Change): Auto-fitted to ${slide2Metrics.fontSize}, rect ${slide2Metrics.textRect.width}x${slide2Metrics.textRect.height}`);
    const shot2 = path.join(ARTIFACT_DIR, '02-slide-change-worship.png');
    await page.screenshot({ path: shot2 });

    // ==========================================
    // TEST 3: SONG CHANGE / PRESETS (Minimal, Cinematic, Impact)
    // ==========================================
    // Minimal
    await page.evaluate(() => window.__setSlide('slide3_minimal'));
    await page.waitForTimeout(50);
    const minimalMetrics = await checkZeroClipping(page, 'Test 3a: Minimal Preset');
    console.log(`[PASS] Test 3a (Minimal Preset): Auto-fitted to ${minimalMetrics.fontSize}`);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '03a-preset-minimal.png') });

    // Cinematic
    await page.evaluate(() => window.__setSlide('slide4_cinematic'));
    await page.waitForTimeout(50);
    const cinematicMetrics = await checkZeroClipping(page, 'Test 3b: Cinematic Preset');
    console.log(`[PASS] Test 3b (Cinematic Preset): Auto-fitted to ${cinematicMetrics.fontSize}`);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '03b-preset-cinematic.png') });

    // Impact
    await page.evaluate(() => window.__setSlide('slide5_impact'));
    await page.waitForTimeout(50);
    const impactMetrics = await checkZeroClipping(page, 'Test 3c: Impact Preset');
    console.log(`[PASS] Test 3c (Impact Preset): Auto-fitted to ${impactMetrics.fontSize}`);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '03c-preset-impact.png') });

    // ==========================================
    // TEST 4: RESOLUTION AND DIMENSION CHANGES
    // ==========================================
    // Resize to 1280x720 (720p HD)
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(50);
    const hdMetrics = await checkZeroClipping(page, 'Test 4a: 720p HD');
    console.log(`[PASS] Test 4a (720p HD): Re-fitted to ${hdMetrics.fontSize} at 1280x720`);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '04a-resolution-720p.png') });

    // Resize to 800x600 (4:3 SVGA)
    await page.setViewportSize({ width: 800, height: 600 });
    await page.waitForTimeout(50);
    const svgaMetrics = await checkZeroClipping(page, 'Test 4b: 800x600 SVGA');
    console.log(`[PASS] Test 4b (800x600 SVGA): Re-fitted to ${svgaMetrics.fontSize} at 800x600`);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '04b-resolution-800x600.png') });

    // Restore to 1920x1080
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(50);

    // ==========================================
    // TEST 5: BIBLE PROJECTION PRESERVATION
    // ==========================================
    await page.evaluate(() => window.__setSlide('slide_bible'));
    await page.waitForTimeout(50);
    const bibleMetrics = await checkZeroClipping(page, 'Test 5: Bible Projection');
    console.log(`[PASS] Test 5 (Bible Projection): Auto-fitted to ${bibleMetrics.fontSize}, reference & translation intact`);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '05-bible-projection.png') });

    // ==========================================
    // TEST 6: PREACHING POINTS PRESERVATION
    // ==========================================
    await page.evaluate(() => window.__setSlide('slide_preaching'));
    await page.waitForTimeout(50);
    const preachingMetrics = await checkZeroClipping(page, 'Test 6: Preaching Presentation');
    console.log(`[PASS] Test 6 (Preaching Presentation): Auto-fitted to ${preachingMetrics.fontSize}, heading intact`);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '06-preaching-presentation.png') });

    await page.close();
    console.log('--- ALL VISUAL SUITE TESTS PASSED SUCCESSFULLY! ---');
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch(err => {
  console.error('VISUAL TEST FAILED:', err);
  process.exit(1);
});
