/**
 * Capture a scrolling gif of the landing page for README banner.
 *
 * Usage:
 *   cd web && npx tsx demo/banner-capture.ts
 */

import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { join } from "path";

const URL = process.env.DEMO_URL || "https://eywa-ai.dev";
const FRAME_DIR = join("demo", "recordings", "banner-frames");
const FPS = 12;

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  console.log("  Capturing landing page for banner gif...\n");
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
  await sleep(4000);

  let frame = 0;
  const snap = async () => {
    const path = join(FRAME_DIR, `frame-${String(frame).padStart(4, "0")}.png`);
    await page.screenshot({ path, fullPage: false });
    frame++;
  };

  // Hold on hero for 2s
  console.log("  Hero section...");
  for (let i = 0; i < FPS * 2; i++) {
    await snap();
    await sleep(1000 / FPS);
  }

  // Smooth scroll down the page over 6s
  console.log("  Scrolling...");
  const scrollHeight = await page.evaluate(() => document.body.scrollHeight - window.innerHeight);
  const scrollDuration = 6000;
  const scrollSteps = FPS * (scrollDuration / 1000);
  const stepSize = scrollHeight / scrollSteps;

  for (let i = 0; i < scrollSteps; i++) {
    await page.evaluate((y) => window.scrollTo({ top: y }), stepSize * (i + 1));
    await snap();
    await sleep(1000 / FPS);
  }

  // Hold at bottom for 1.5s
  console.log("  Bottom hold...");
  for (let i = 0; i < FPS * 1.5; i++) {
    await snap();
    await sleep(1000 / FPS);
  }

  await browser.close();

  console.log(`\n  ${frame} frames captured in ${FRAME_DIR}/`);
  console.log(`  Converting to gif...`);
}

run().catch((e) => {
  console.error("Capture error:", e);
  process.exit(1);
});
