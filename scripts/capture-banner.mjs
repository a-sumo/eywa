#!/usr/bin/env node

/**
 * Capture the Eywa hero animation as a GIF for the GitHub README banner.
 *
 * Usage:
 *   1. Start the dev server: cd web && npm run dev
 *   2. Run this script: node scripts/capture-banner.mjs
 *
 * Requires: puppeteer, gifencoder, png-js (installed automatically via npx)
 *
 * Output: docs/banner.gif (1200x400, ~4 seconds of animation)
 */

import { execSync } from "node:child_process";
import { mkdirSync, existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "docs");
const FRAMES_DIR = join(OUT_DIR, "frames");

const WIDTH = 1200;
const HEIGHT = 340;
const FPS = 15;
const DURATION_S = 4;
const TOTAL_FRAMES = FPS * DURATION_S;
const DEV_URL = "http://localhost:5173";

async function main() {
  // Ensure output dirs exist
  mkdirSync(FRAMES_DIR, { recursive: true });

  console.log("Launching browser...");

  const puppeteer = await import("puppeteer");
  const browser = await puppeteer.default.launch({
    headless: true,
    args: [`--window-size=${WIDTH},${HEIGHT}`],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT });

  // Navigate to landing page
  console.log(`Navigating to ${DEV_URL}...`);
  try {
    await page.goto(DEV_URL, { waitUntil: "networkidle0", timeout: 10000 });
  } catch {
    console.error("Could not reach dev server. Start it first: cd web && npm run dev");
    await browser.close();
    process.exit(1);
  }

  // Hide nav, buttons, and secondary text. Keep particles + hero title.
  await page.evaluate(() => {
    const style = document.createElement("style");
    style.textContent = `
      /* Hide everything except particles + main title */
      .landing-nav,
      nav,
      header,
      .landing-hero-actions,
      .landing-hero-subtitle,
      .landing-hero-solution,
      .landing-features,
      .landing-footer,
      footer { display: none !important; }

      body { margin: 0; overflow: hidden; }
      .landing-page { overflow: hidden; padding-top: 0; }

      /* Center the title vertically in the banner */
      .landing-hero {
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
        min-height: 340px !important;
        padding: 0 !important;
        margin: 0 !important;
      }
      .landing-hero-title {
        font-size: 3.4rem !important;
        margin: 0 !important;
        text-align: center !important;
      }
    `;
    document.head.appendChild(style);
  });

  // Wait for animation to warm up
  console.log("Warming up animation (2s)...");
  await new Promise((r) => setTimeout(r, 2000));

  // Capture frames
  console.log(`Capturing ${TOTAL_FRAMES} frames at ${FPS}fps...`);
  const framePaths = [];

  for (let i = 0; i < TOTAL_FRAMES; i++) {
    const framePath = join(FRAMES_DIR, `frame-${String(i).padStart(4, "0")}.png`);
    await page.screenshot({ path: framePath, type: "png" });
    framePaths.push(framePath);

    if (i % 10 === 0) process.stdout.write(`  ${i}/${TOTAL_FRAMES}\r`);
    await new Promise((r) => setTimeout(r, 1000 / FPS));
  }
  console.log(`  ${TOTAL_FRAMES}/${TOTAL_FRAMES} - done`);

  await browser.close();

  // Convert frames to GIF using ffmpeg if available, otherwise ImageMagick
  const gifPath = join(OUT_DIR, "banner.gif");

  try {
    console.log("Converting to GIF with ffmpeg...");
    execSync(
      `ffmpeg -y -framerate ${FPS} -i "${FRAMES_DIR}/frame-%04d.png" -vf "fps=${FPS},scale=${WIDTH}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer" "${gifPath}"`,
      { stdio: "pipe" },
    );
  } catch {
    try {
      console.log("ffmpeg not found, trying ImageMagick...");
      execSync(
        `convert -delay ${Math.round(100 / FPS)} -loop 0 "${FRAMES_DIR}/frame-*.png" -layers Optimize "${gifPath}"`,
        { stdio: "pipe" },
      );
    } catch {
      console.error(
        "Neither ffmpeg nor ImageMagick found. Install one:\n" +
        "  brew install ffmpeg\n" +
        "  brew install imagemagick",
      );
      process.exit(1);
    }
  }

  // Clean up frames
  for (const fp of framePaths) {
    try { unlinkSync(fp); } catch {}
  }

  const stat = readFileSync(gifPath);
  console.log(`\nBanner saved: ${gifPath} (${(stat.length / 1024).toFixed(0)}KB)`);
  console.log("Add to README with: ![Eywa](docs/banner.gif)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
