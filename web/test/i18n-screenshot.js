import puppeteer from 'puppeteer';

const langs = ['en', 'ja', 'zh', 'hi', 'es', 'fr', 'ar'];
const BASE = 'http://localhost:5199';

async function run() {
  const browser = await puppeteer.launch({ headless: true });

  for (const lang of langs) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

    // Set localStorage language before navigating
    await page.evaluateOnNewDocument((l) => {
      localStorage.setItem('eywa-language', l);
    }, lang);

    // Screenshot landing page
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.landing-hero', { timeout: 5000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: `test/screenshot-${lang}-landing.png` });
    console.log(`${lang} landing captured`);

    // Screenshot docs page
    await page.goto(`${BASE}/docs`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: `test/screenshot-${lang}-docs.png` });
    console.log(`${lang} docs captured`);

    await page.close();
  }

  await browser.close();
  console.log('Done!');
}

run().catch(console.error);
