import { chromium } from 'playwright';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';

const virtualId = 'virtual:bounds-verify2.jsx';
const resolvedVirtualId = `\0${virtualId}`;

const testModule = `
  import React, { useState, useLayoutEffect, useRef } from 'react';
  import { createRoot } from 'react-dom/client';
  import { jsx } from 'react/jsx-runtime';
  import '/src/index.css';

  const testTexts = {
    short: 'Santo, Santo, Santo\\nDios Todopoderoso',
    medium: 'Al que está sentado en el trono\\ny al Cordero\\nsea la gloria y el honor\\npor los siglos de los siglos',
    longLine: 'Tu fidelidad es grande, tu fidelidad incomparable es, nadie como tú bendito Dios',
    singleWord: 'ALELUYA',
    fourLines: 'Gracia sublime es\\nPerfecto es tu amor\\nTomaste mi lugar\\nCargaste tú mi cruz',
  };

  const lineHeights = {
    clean: 1.08,
    cinematic: 1.17,
    worship: 1.24,
    impact: 1.02,
    minimal: 1.3,
  };

  const params = new URLSearchParams(location.search);
  const scenario = params.get('scenario') || 'medium';
  const preset = params.get('preset') || 'clean';

  function AutoFitImproved({ text, preset }) {
    const containerRef = useRef(null);
    const textRef = useRef(null);

    useLayoutEffect(() => {
      const container = containerRef.current;
      const textEl = textRef.current;
      if (!container || !textEl) return;

      let frameId;

      const fit = () => {
        const availableWidth = container.clientWidth;
        const availableHeight = container.clientHeight;
        if (!availableWidth || !availableHeight) return;

        const prevTransition = textEl.style.transition;
        textEl.style.transition = 'none';
        textEl.style.lineHeight = String(lineHeights[preset] || 1.08);
        textEl.style.maxWidth = availableWidth + 'px';
        textEl.style.width = 'fit-content';

        let low = 36;
        let high = 240;
        let best = 36;

        while (low <= high) {
          const mid = Math.floor((low + high) / 2);
          textEl.style.fontSize = mid + 'px';

          const textRect = textEl.getBoundingClientRect();
          const fitsWidth = textRect.width <= availableWidth + 2 && textEl.scrollWidth <= availableWidth + 2;
          const fitsHeight = textRect.height <= availableHeight + 2 && textEl.scrollHeight <= availableHeight + 2;
          const fitsWindow = (
            textRect.bottom <= (window.innerHeight || Infinity) + 1 &&
            textRect.right <= (window.innerWidth || Infinity) + 1 &&
            textRect.top >= -1 &&
            textRect.left >= -1
          );

          if (fitsWidth && fitsHeight && fitsWindow) {
            best = mid;
            low = mid + 1;
          } else {
            high = mid - 1;
          }
        }

        textEl.style.fontSize = best + 'px';
        textEl.style.transition = prevTransition;
      };

      fit();
      frameId = requestAnimationFrame(fit);
      document.fonts?.ready?.then(fit);
      const onLoadingDone = () => fit();
      document.fonts?.addEventListener?.('loadingdone', onLoadingDone);

      const resizeObserver = new ResizeObserver(fit);
      resizeObserver.observe(container);
      window.addEventListener('resize', fit);
      window.addEventListener('orientationchange', fit);
      document.addEventListener('fullscreenchange', fit);

      return () => {
        cancelAnimationFrame(frameId);
        document.fonts?.removeEventListener?.('loadingdone', handleFontsDone);
        resizeObserver.disconnect();
        window.removeEventListener('resize', fit);
        window.removeEventListener('orientationchange', fit);
        document.removeEventListener('fullscreenchange', fit);
      };
    }, [text, preset]);

    return jsx('div', {
      ref: containerRef,
      className: 'flex items-center justify-center text-center',
      style: { width: '100%', height: '100%', maxWidth: '90vw', maxHeight: '78vh' },
      children: jsx('div', {
        ref: textRef,
        className: 'whitespace-pre-wrap break-words projection-lyric-text font-black tracking-tight text-outline',
        children: text,
      }),
    });
  }

  function App() {
    return jsx('div', {
      className: 'fixed inset-0 bg-black flex items-center justify-center p-8 md:p-16 projection-preset-' + preset,
      children: jsx('div', {
        className: 'w-full h-full flex items-center justify-center overflow-hidden drop-shadow-[0_0_60px_rgba(0,0,0,1)]',
        children: jsx(AutoFitImproved, { text: testTexts[scenario] || scenario, preset }),
      }),
    });
  }

  createRoot(document.getElementById('root')).render(jsx(App, {}));
`;

async function main() {
  const server = await createServer({
    configFile: false,
    root: process.cwd(),
    logLevel: 'error',
    plugins: [
      {
        name: 'bounds-verify2-fixture',
        resolveId(id) {
          return id === virtualId ? resolvedVirtualId : null;
        },
        load(id) {
          return id === resolvedVirtualId ? testModule : null;
        },
        configureServer(viteServer) {
          viteServer.middlewares.use('/__bounds_verify2__', async (_req, res) => {
            const html = await viteServer.transformIndexHtml(
              '/__bounds_verify2__',
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
  const baseUrl = `http://127.0.0.1:${address.port}/__bounds_verify2__`;

  const browser = await chromium.launch({ headless: true });
  let allPass = true;

  try {
    for (const preset of ['clean', 'worship', 'minimal', 'impact', 'cinematic']) {
      for (const scenario of ['short', 'medium', 'longLine', 'fourLines', 'singleWord']) {
        const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
        await page.goto(`${baseUrl}?scenario=${scenario}&preset=${preset}`, { waitUntil: 'load' });
        await page.waitForTimeout(50);

        const data = await page.evaluate(() => {
          const textEl = document.querySelector('.projection-lyric-text');
          const containerEl = textEl?.parentElement;
          if (!textEl || !containerEl) return null;

          const textRect = textEl.getBoundingClientRect();
          const winH = window.innerHeight;
          const winW = window.innerWidth;

          return {
            fontSize: textEl.style.fontSize,
            clientWidth: containerEl.clientWidth,
            clientHeight: containerEl.clientHeight,
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

        const hasClipping = data?.clippedBottom || data?.clippedTop || data?.clippedRight || data?.clippedLeft;
        if (hasClipping) {
          allPass = false;
          console.log(`[CLIPPED!] Preset: ${preset}, Scenario: ${scenario}, fontSize: ${data?.fontSize}`);
        } else {
          console.log(`[PASS] Preset: ${preset.padEnd(9)}, Scenario: ${scenario.padEnd(10)}, fontSize: ${data?.fontSize}, rect: ${data?.textRect.width}x${data?.textRect.height}, top: ${data?.textRect.top}, bot: ${data?.textRect.bottom}`);
        }
        await page.close();
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }

  console.log(`\nOVERALL RESULT: ${allPass ? 'ALL 25 TESTS PASSED WITH ZERO CLIPPING!' : 'SOME TESTS CLIPPED'}`);
}

main().catch(console.error);
