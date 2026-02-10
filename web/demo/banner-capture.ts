/**
 * Capture screenshots of HubView for README banner gif.
 * Takes rapid screenshots and stitches them into a gif via ffmpeg.
 *
 * Usage:
 *   cd web && npx tsx demo/banner-capture.ts
 */

import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { join } from "path";

const URL = process.env.DEMO_URL || "https://eywa-ai.dev/r/demo";
const FRAME_DIR = join("demo", "recordings", "banner-frames");
const FPS = 10;
const DURATION_S = 8;
const TOTAL_FRAMES = FPS * DURATION_S;
const FRAME_INTERVAL = 1000 / FPS;

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  console.log("  Capturing HubView for banner gif...\n");
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

  console.log("  Loading page...");
  await page.goto(URL, { waitUntil: "networkidle" });
  await sleep(6000); // Let data load and animations start

  console.log(`  Taking ${TOTAL_FRAMES} screenshots at ${FPS}fps...`);
  for (let i = 0; i < TOTAL_FRAMES; i++) {
    const path = join(FRAME_DIR, `frame-${String(i).padStart(4, "0")}.png`);
    await page.screenshot({ path, fullPage: false });
    if (i % 10 === 0) process.stdout.write(`  ${i}/${TOTAL_FRAMES}\r`);
    await sleep(FRAME_INTERVAL);
  }

  await browser.close();

  console.log(`\n  ${TOTAL_FRAMES} frames captured in ${FRAME_DIR}/`);
  console.log(`\n  Convert to gif:`);
  console.log(`  ffmpeg -framerate ${FPS} -i ${FRAME_DIR}/frame-%04d.png -vf "scale=1200:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer" -loop 0 ../docs/banner.gif`);
}

run().catch((e) => {
  console.error("Capture error:", e);
  process.exit(1);
});
