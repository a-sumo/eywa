/**
 * Capture the landing page hero (no scroll) for README banner gif.
 *
 * Usage:
 *   cd web && npx tsx demo/banner-capture.ts
 */

import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { join } from "path";

const URL = process.env.DEMO_URL || "https://eywa-ai.dev";
const FRAME_DIR = join("demo", "recordings", "banner-frames");
const FPS = 10;
const DURATION_S = 5;
const TOTAL_FRAMES = FPS * DURATION_S;

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  console.log("  Capturing landing page hero for banner gif...\n");
  mkdirSync(FRAME_DIR, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: ["--window-size=1440,900", "--disable-infobars", "--no-first-run"],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: "dark",
  });

  const page = await context.newPage();

  console.log("  Loading landing page...");
  await page.goto(URL, { waitUntil: "networkidle" });
  await sleep(4000); // Let animations start

  console.log(`  Taking ${TOTAL_FRAMES} frames at ${FPS}fps (${DURATION_S}s)...`);
  for (let i = 0; i < TOTAL_FRAMES; i++) {
    const path = join(FRAME_DIR, `frame-${String(i).padStart(4, "0")}.png`);
    await page.screenshot({ path, fullPage: false });
    if (i % 10 === 0) process.stdout.write(`  ${i}/${TOTAL_FRAMES}\r`);
    await sleep(1000 / FPS);
  }

  await browser.close();
  console.log(`\n  ${TOTAL_FRAMES} frames captured.`);
}

run().catch((e) => {
  console.error("Capture error:", e);
  process.exit(1);
});
