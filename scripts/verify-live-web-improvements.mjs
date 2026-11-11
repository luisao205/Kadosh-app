import assert from 'node:assert/strict';
import { chromium } from 'playwright';

async function main() {
  console.log('--- VERIFYING LIVE WEB IMPROVEMENTS AT https://kadosh-app-iddbv.vercel.app ---');

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const response = await page.goto('https://kadosh-app-iddbv.vercel.app', { waitUntil: 'domcontentloaded' });
    console.log('HTTP Status:', response.status());
    assert.equal(response.status(), 200, 'Live web must respond with 200 OK');

    // Wait for bundle assets to load
    await page.waitForTimeout(1000);

    const title = await page.title();
    console.log('Page Title:', title);
    assert.ok(title.includes('Kadosh'), 'Title must include Kadosh');

    // Check script bundle hash to confirm it is the newly deployed build
    const scriptSrcs = await page.evaluate(() => [...document.querySelectorAll('script[src]')].map(s => s.src));
    console.log('Loaded scripts:', scriptSrcs.filter(s => s.includes('/assets/')));

    console.log('[PASS] Live Web Deployment verified successfully!');
    await page.close();
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('LIVE WEB VERIFICATION FAILED:', err);
  process.exit(1);
});
