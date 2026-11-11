import { chromium } from 'playwright';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';

const virtualId = 'virtual:autofit-single.jsx';
const resolvedVirtualId = `\0${virtualId}`;

const testModule = `
  import React from 'react';
  import { createRoot } from 'react-dom/client';
  import { jsx } from 'react/jsx-runtime';
  import '/src/index.css';
  import AutoFitText from '/src/components/live/AutoFitText.jsx';

  function App() {
    return jsx('div', {
      className: 'fixed inset-0 bg-black flex items-center justify-center p-8 md:p-16 projection-preset-clean',
      children: jsx('div', {
        className: 'w-full h-full flex items-center justify-center overflow-hidden drop-shadow-[0_0_60px_rgba(0,0,0,1)]',
        children: jsx(AutoFitText, {
          text: 'Gracia sublime es\\nPerfecto es tu amor\\nTomaste mi lugar\\nCargaste tú mi cruz',
          minFontSize: 36,
          maxFontSize: 240,
          safeMaxWidth: '90vw',
          safeMaxHeight: '78vh',
          variant: 'projector',
          lineHeight: 1.08,
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
        name: 'autofit-single-fixture',
        resolveId(id) {
          return id === virtualId ? resolvedVirtualId : null;
        },
        load(id) {
          return id === resolvedVirtualId ? testModule : null;
        },
        configureServer(viteServer) {
          viteServer.middlewares.use('/__test__', async (_req, res) => {
            const html = await viteServer.transformIndexHtml(
              '/__test__',
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
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  await page.goto(`http://127.0.0.1:${address.port}/__test__`);
  await page.waitForTimeout(300);

  const res = await page.evaluate(() => {
    const textEl = document.querySelector('.projection-lyric-text');
    const container = textEl?.parentElement;
    return {
      fontSize: textEl.style.fontSize,
      scrollWidth: textEl.scrollWidth,
      scrollHeight: textEl.scrollHeight,
      rectHeight: textEl.getBoundingClientRect().height,
      rectWidth: textEl.getBoundingClientRect().width,
      contWidth: container.clientWidth,
      contHeight: container.clientHeight,
      computedStyles: {
        fontFamily: getComputedStyle(textEl).fontFamily,
        fontWeight: getComputedStyle(textEl).fontWeight,
        letterSpacing: getComputedStyle(textEl).letterSpacing,
        lineHeight: getComputedStyle(textEl).lineHeight,
      }
    };
  });

  console.log('EVALUATION:', res);

  await browser.close();
  await server.close();
}

main().catch(console.error);
