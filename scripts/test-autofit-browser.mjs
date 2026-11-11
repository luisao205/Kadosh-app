import { chromium } from 'playwright';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';

const virtualId = 'virtual:autofit-debug.jsx';
const resolvedVirtualId = `\0${virtualId}`;

const testModule = `
  import React, { useState } from 'react';
  import { createRoot } from 'react-dom/client';
  import { jsx } from 'react/jsx-runtime';
  import '/src/index.css';
  import AutoFitText from '/src/components/live/AutoFitText.jsx';
  import RichLyricText from '/src/components/live/RichLyricText.jsx';

  const testTexts = {
    short: 'Santo, Santo, Santo\\nDios Todopoderoso',
    medium: 'Al que está sentado en el trono\\ny al Cordero\\nsea la gloria y el honor\\npor los siglos de los siglos',
    longLine: 'Tu fidelidad es grande, tu fidelidad incomparable es, nadie como tú bendito Dios',
    singleWord: 'ALELUYA',
    fourLines: 'Gracia sublime es\\nPerfecto es tu amor\\nTomaste mi lugar\\nCargaste tú mi cruz',
  };

  const params = new URLSearchParams(location.search);
  const scenario = params.get('scenario') || 'medium';
  const preset = params.get('preset') || 'clean';

  function App() {
    return jsx('div', {
      className: 'fixed inset-0 bg-black flex items-center justify-center p-8 md:p-16 projection-preset-' + preset,
      children: jsx('div', {
        className: 'w-full h-full flex items-center justify-center overflow-hidden drop-shadow-[0_0_60px_rgba(0,0,0,1)]',
        children: jsx(AutoFitText, {
          text: testTexts[scenario] || scenario,
          minFontSize: 36,
          maxFontSize: 240,
          safeMaxWidth: '90vw',
          safeMaxHeight: '78vh',
          variant: 'projector',
          lineHeight: preset === 'worship' ? 1.24 : preset === 'cinematic' ? 1.17 : preset === 'minimal' ? 1.3 : preset === 'impact' ? 1.02 : 1.08,
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
        name: 'autofit-debug-fixture',
        resolveId(id) {
          return id === virtualId ? resolvedVirtualId : null;
        },
        load(id) {
          return id === resolvedVirtualId ? testModule : null;
        },
        configureServer(viteServer) {
          viteServer.middlewares.use('/__autofit_debug__', async (_req, res) => {
            const html = await viteServer.transformIndexHtml(
              '/__autofit_debug__',
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
  const baseUrl = `http://127.0.0.1:${address.port}/__autofit_debug__`;

  const browser = await chromium.launch({ headless: true });
  try {
    for (const preset of ['clean', 'worship', 'minimal', 'impact', 'cinematic']) {
      for (const scenario of ['short', 'medium', 'longLine', 'fourLines']) {
        const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
        await page.goto(`${baseUrl}?scenario=${scenario}&preset=${preset}`, { waitUntil: 'domcontentloaded' });
        
        // Wait a small moment for initial paint / layout effect
        await page.waitForTimeout(100);

        const data = await page.evaluate(() => {
          const textEl = document.querySelector('.projection-lyric-text');
          const containerEl = textEl?.parentElement;
          const outerContainer = containerEl?.parentElement;
          if (!textEl || !containerEl) return null;

          const textRect = textEl.getBoundingClientRect();
          const contRect = containerEl.getBoundingClientRect();
          const winH = window.innerHeight;
          const winW = window.innerWidth;

          return {
            fontSize: textEl.style.fontSize,
            scrollWidth: textEl.scrollWidth,
            scrollHeight: textEl.scrollHeight,
            clientWidth: containerEl.clientWidth,
            clientHeight: containerEl.clientHeight,
            textRect: {
              top: textRect.top,
              bottom: textRect.bottom,
              left: textRect.left,
              right: textRect.right,
              width: textRect.width,
              height: textRect.height,
            },
            contRect: {
              top: contRect.top,
              bottom: contRect.bottom,
              height: contRect.height,
            },
            clippedBottom: textRect.bottom > winH,
            clippedTop: textRect.top < 0,
            clippedRight: textRect.right > winW,
            clippedLeft: textRect.left < 0,
            clippedContainerBottom: textRect.bottom > contRect.bottom + 2,
            clippedContainerTop: textRect.top < contRect.top - 2,
          };
        });

        const hasClipping = data?.clippedBottom || data?.clippedTop || data?.clippedRight || data?.clippedLeft || data?.clippedContainerBottom || data?.clippedContainerTop;
        if (hasClipping) {
          console.log(`[CLIPPED!] Preset: ${preset}, Scenario: ${scenario}, fontSize: ${data?.fontSize}`);
          console.log(`  Window: 1920x1080, Container: ${data?.clientWidth}x${data?.clientHeight}`);
          console.log(`  textRect:`, data?.textRect);
          console.log(`  contRect:`, data?.contRect);
          console.log(`  clipped: bottom=${data?.clippedBottom}, contBottom=${data?.clippedContainerBottom}, top=${data?.clippedTop}`);
        } else {
          console.log(`[OK] Preset: ${preset}, Scenario: ${scenario}, fontSize: ${data?.fontSize}`);
        }
        await page.close();
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch(console.error);
