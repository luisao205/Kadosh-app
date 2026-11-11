import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  
  await page.setContent(`
    <style>
      body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; }
      .text-outline {
        -webkit-text-stroke: 2px black;
        paint-order: stroke fill;
      }
      .font-black { font-weight: 900; }
      .tracking-tight { letter-spacing: -0.025em; }
    </style>
    <div id="container" style="width: 1728px; height: 842px; display: flex; align-items: center; justify-content: center; overflow: hidden;">
      <div id="textEl" class="font-black tracking-tight text-outline" style="white-space: pre-wrap; word-break: break-word; overflow: hidden;">Gracia sublime es\nPerfecto es tu amor\nTomaste mi lugar\nCargaste tú mi cruz</div>
    </div>
  `);

  const results = await page.evaluate(() => {
    const textEl = document.getElementById('textEl');
    const container = document.getElementById('container');
    const availableWidth = container.clientWidth;
    const availableHeight = container.clientHeight;

    textEl.style.width = availableWidth + 'px';
    textEl.style.lineHeight = '1.08';

    const log = [];
    let low = 36;
    let high = 240;
    let best = 36;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      textEl.style.fontSize = mid + 'px';

      const fits =
        textEl.scrollWidth <= availableWidth + 1 &&
        textEl.scrollHeight <= availableHeight + 1;

      log.push({
        mid,
        scrollWidth: textEl.scrollWidth,
        scrollHeight: textEl.scrollHeight,
        rectWidth: textEl.getBoundingClientRect().width,
        rectHeight: textEl.getBoundingClientRect().height,
        availableWidth,
        availableHeight,
        fits
      });

      if (fits) {
        best = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return { best, log };
  });

  console.log('BEST:', results.best);
  console.table(results.log);
  await browser.close();
}

main().catch(console.error);
