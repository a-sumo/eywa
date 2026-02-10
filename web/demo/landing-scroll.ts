import { chromium } from "playwright";

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  const browser = await chromium.launch({
    headless: false,
    args: ["--window-size=1440,900", "--disable-infobars", "--no-first-run"],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    recordVideo: {
      dir: "/Users/armand/Documents/eywa/web/demo/recordings",
      size: { width: 2880, height: 1800 },
    },
  });

  const page = await context.newPage();

  console.log("  Loading landing page...");
  await page.goto("http://localhost:5173", { waitUntil: "networkidle" });
  await sleep(3000);

  // Get total page height
  const totalHeight = await page.evaluate(() => document.body.scrollHeight);
  console.log("  Page height:", totalHeight, "px");
  console.log("  Scrolling...");

  // Smooth scroll in small increments for cinematic effect
  const step = 3;
  const delay = 16; // ~60fps
  let current = 0;

  while (current < totalHeight - 900) {
    current += step;
    await page.evaluate((y) => window.scrollTo(0, y), current);
    await sleep(delay);
  }

  // Hold at bottom
  await sleep(3000);

  // Scroll back to top
  console.log("  Scrolling back to top...");
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await sleep(4000);

  const videoPath = await page.video()?.path();
  await page.close();
  await context.close();
  await browser.close();

  console.log("  Done. Video:", videoPath);
}

run().catch(console.error);
