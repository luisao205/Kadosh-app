import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  
  await page.setContent(`
    <style>
      .text-outline {
        -webkit-text-stroke: 2px black;
        paint-order: stroke fill;
      }
    </style>
    <div id="container" style="width: 1728px; height: 842px; display: flex; align-items: center; justify-content: center; overflow: hidden;">
      <div id="textEl" class="text-outline" style="white-space: pre-wrap; word-break: break-word; overflow: hidden; font-weight: 800; font-family: sans-serif;">Al que está sentado en el trono\ny al Cordero\nsea la gloria y el honor\npor los siglos de los siglos</div>
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
    for (let size = 120; size <= 140; size += 2) {
      textEl.style.fontSize = size + 'px';
      log.push({
        size,
        scrollWidth: textEl.scrollWidth,
        scrollHeight: textEl.scrollHeight,
        offsetHeight: textEl.offsetHeight,
        rectHeight: textEl.getBoundingClientRect().height,
        availableHeight,
        fitsScroll: textEl.scrollHeight <= availableHeight + 1,
        fitsRect: textEl.getBoundingClientRect().height <= availableHeight
      });
    }
    return log;
  });

  console.table(results);
  await browser.close();
}

main().catch(console.error);
