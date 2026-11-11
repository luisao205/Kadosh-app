import { chromium } from 'playwright';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';

const virtualId = 'virtual:bounds-verify.jsx';
const resolvedVirtualId = `\0${virtualId}`;

const testModule = `
  import React, { useState } from 'react';
  import { createRoot } from 'react-dom/client';
  import { jsx } from 'react/jsx-runtime';
  import '/src/index.css';
  import AutoFitText from '/src/components/live/AutoFitText.jsx';

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

  function App() {
    const [currentScenario, setCurrentScenario] = useState(scenario);
    window.__switchSlide = (sc) => setCurrentScenario(sc);

    return jsx('div', {
      className: 'fixed inset-0 bg-black flex items-center justify-center p-8 md:p-16 projection-preset-' + preset,
      children: jsx('div', {
        className: 'w-full h-full flex items-center justify-center overflow-hidden drop-shadow-[0_0_60px_rgba(0,0,0,1)]',
        children: jsx(AutoFitText, {
          text: testTexts[currentScenario] || currentScenario,
          minFontSize: 36,
          maxFontSize: 240,
          safeMaxWidth: '90vw',
          safeMaxHeight: '78vh',
          variant: 'projector',
          lineHeight: lineHeights[preset] || 1.08,
          className: 'projection-lyric-text font-black tracking-tight text-outline',
        }),
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
        name: 'bounds-verify-fixture',
        resolveId(id) {
          return id === virtualId ? resolvedVirtualId : null;
        },
        load(id) {
          return id === resolvedVirtualId ? testModule : null;
        },
        configureServer(viteServer) {
          viteServer.middlewares.use('/__bounds_verify__', async (_req, res) => {
            const html = await viteServer.transformIndexHtml(
              '/__bounds_verify__',
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
  const baseUrl = `http://127.0.0.1:${address.port}/__bounds_verify__`;

  const browser = await chromium.launch({ headless: true });
  let allPass = true;

  try {
    for (const preset of ['clean', 'worship', 'minimal', 'impact', 'cinematic']) {
      for (const scenario of ['short', 'medium', 'longLine', 'fourLines', 'singleWord']) {
        const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
        await page.goto(`${baseUrl}?scenario=${scenario}&preset=${preset}`, { waitUntil: 'load' });
        
        // Measure ON FIRST RENDER (before any user interaction or fullscreen)
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
          console.log(`  textRect:`, data?.textRect);
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
