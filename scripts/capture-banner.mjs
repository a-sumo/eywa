#!/usr/bin/env node

/**
 * Capture Eywa banners: animated GIF for README + social media images.
 *
 * Usage:
 *   1. Start the dev server: cd web && npm run dev
 *   2. Run this script: node scripts/capture-banner.mjs
 *   3. Optionally: node scripts/capture-banner.mjs --social-only
 *
 * Output:
 *   docs/banner.gif          - 1200x340 animated (4s loop)
 *   docs/banner.png          - 1200x340 static (mid-frame)
 *   docs/banner-start.png    - 1200x340 static (first frame)
 *   docs/og-banner.png       - 1200x630  (Open Graph)
 *   docs/social-banner.png   - 1600x900  (general social/presentation)
 *   docs/twitter-banner.png  - 1500x500  (Twitter/X header)
 *   docs/linkedin-banner.png - 1584x396  (LinkedIn banner)
 */

import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, unlinkSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "docs");
const FRAMES_DIR = join(OUT_DIR, "frames");

const FPS = 15;
const DURATION_S = 4;
const TOTAL_FRAMES = FPS * DURATION_S;
const DEV_URL = "http://localhost:5173";

// All banner configurations.
// The FlowBackground canvas draws the logo at: canvasHeight * 0.3 - 40.
// We use a viewport taller than the target so the logo sits naturally,
// then clip a centered region where logo + title are framed properly.
//
// Math for each banner:
//   captureH     = max(H + 300, round(1.5 * H))
//   logoY        = captureH * 0.3 - 40
//   clipY        = round(logoY - 0.35 * H)    (puts logo ~35% from top of clip)
//   contentShift = round(-0.2 * captureH + 45) (title sits just below logo)

const BANNERS = [
  { name: "banner",          width: 1200, height: 340,  fontSize: "3.4rem", gif: true },
  { name: "og-banner",       width: 1200, height: 630,  fontSize: "3.4rem" },
  { name: "social-banner",   width: 1600, height: 900,  fontSize: "4rem"   },
  { name: "twitter-banner",  width: 1500, height: 500,  fontSize: "3.6rem" },
  { name: "linkedin-banner", width: 1584, height: 396,  fontSize: "3.4rem" },
];

// CSS to hide non-hero elements
const HIDE_CSS = `
  .landing-nav, nav, header,
  .landing-hero-actions,
  .landing-hero-subtitle,
  .landing-hero-solution,
  .landing-features,
  .landing-footer,
  .landing-fade-overlay,
  .landing-section,
  .landing-pricing,
  .landing-cta,
  .landing-agents-orbit,
  .landing-error,
  footer { display: none !important; }

  html, body, #root, .landing-dark {
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
  }
`;

function computeLayout(width, height) {
  // Viewport must be tall enough for the logo (at captureH*0.3 - 40)
  // to land at the vertically-centered target position in the clip.
  // Target: logo center at H/2 - 55 from top of clip (slightly above center).
  const captureH = Math.max(height + 300, Math.ceil((height + 30) / 0.6));
  const logoY = captureH * 0.3 - 40;
  const clipY = Math.max(0, Math.round(logoY - (height / 2 - 55)));
  const contentShift = Math.round(-0.2 * captureH + 45);
  return { captureH, clipY, contentShift };
}

function bannerCSS(captureH, contentShift, fontSize) {
  return HIDE_CSS + `
    .landing-hero-dark {
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: center !important;
      min-height: ${captureH}px !important;
      padding: 0 !important;
      margin: 0 !important;
    }
    .landing-hero-content {
      transform: translateY(${contentShift}px) !important;
    }
    .landing-hero-title {
      font-size: ${fontSize} !important;
      margin: 0 !important;
      text-align: center !important;
    }
  `;
}

async function injectCSS(page, css) {
  await page.evaluate((cssText) => {
    const style = document.createElement("style");
    style.textContent = cssText;
    document.head.appendChild(style);
  }, css);
}

async function main() {
  const socialOnly = process.argv.includes("--social-only");

  mkdirSync(FRAMES_DIR, { recursive: true });
  console.log("Launching browser...");

  const puppeteer = await import("puppeteer");
  const browser = await puppeteer.default.launch({
    headless: true,
    args: ["--no-sandbox"],
  });

  // Verify dev server
  const testPage = await browser.newPage();
  try {
    await testPage.goto(DEV_URL, { waitUntil: "networkidle0", timeout: 10000 });
  } catch {
    console.error("Could not reach dev server. Start it first: cd web && npm run dev");
    await browser.close();
    process.exit(1);
  }
  await testPage.close();

  // ---- GIF Banner ----
  let framePaths = [];
  if (!socialOnly) {
    const gifBanner = BANNERS.find((b) => b.gif);
    framePaths = await captureGifFrames(browser, gifBanner);
  }

  // ---- Static Banners (social + main static if social-only) ----
  const staticBanners = socialOnly ? BANNERS.filter((b) => !b.gif) : BANNERS.filter((b) => !b.gif);
  for (const banner of staticBanners) {
    await captureStaticBanner(browser, banner);
  }

  await browser.close();

  // ---- Post-processing ----
  if (!socialOnly && framePaths.length > 0) {
    // Export static PNGs from GIF frames.
    // Use an early frame for banner.png - mid-frame can hit pulse peaks
    // where fast particles obscure the title text.
    const startFrame = join(FRAMES_DIR, "frame-0000.png");
    const calmFrame = join(FRAMES_DIR, `frame-${String(Math.min(8, TOTAL_FRAMES - 1)).padStart(4, "0")}.png`);
    try { copyFileSync(startFrame, join(OUT_DIR, "banner-start.png")); } catch {}
    try { copyFileSync(calmFrame, join(OUT_DIR, "banner.png")); } catch {}

    encodeGif();

    for (const fp of framePaths) {
      try { unlinkSync(fp); } catch {}
    }
  }

  console.log("\nDone. Banners in docs/");
}

async function captureGifFrames(browser, banner) {
  const { width, height, fontSize } = banner;
  const { captureH, clipY, contentShift } = computeLayout(width, height);

  const page = await browser.newPage();
  await page.setViewport({ width, height: captureH });
  await page.goto(DEV_URL, { waitUntil: "networkidle0", timeout: 10000 });
  await injectCSS(page, bannerCSS(captureH, contentShift, fontSize));

  console.log("Warming up animation (3s)...");
  await new Promise((r) => setTimeout(r, 3000));

  console.log(`Capturing ${TOTAL_FRAMES} frames at ${FPS}fps...`);
  const framePaths = [];

  for (let i = 0; i < TOTAL_FRAMES; i++) {
    const framePath = join(FRAMES_DIR, `frame-${String(i).padStart(4, "0")}.png`);
    await page.screenshot({
      path: framePath,
      type: "png",
      clip: { x: 0, y: clipY, width, height },
    });
    framePaths.push(framePath);

    if (i % 10 === 0) process.stdout.write(`  ${i}/${TOTAL_FRAMES}\r`);
    await new Promise((r) => setTimeout(r, 1000 / FPS));
  }
  console.log(`  ${TOTAL_FRAMES}/${TOTAL_FRAMES} - done`);

  await page.close();
  return framePaths;
}

async function captureStaticBanner(browser, banner) {
  const { name, width, height, fontSize } = banner;
  const { captureH, clipY, contentShift } = computeLayout(width, height);

  const page = await browser.newPage();
  await page.setViewport({ width, height: captureH });
  await page.goto(DEV_URL, { waitUntil: "networkidle0", timeout: 10000 });
  await injectCSS(page, bannerCSS(captureH, contentShift, fontSize));

  await new Promise((r) => setTimeout(r, 2500));

  const outPath = join(OUT_DIR, `${name}.png`);
  await page.screenshot({
    path: outPath,
    type: "png",
    clip: { x: 0, y: clipY, width, height },
  });

  console.log(`  ${name}.png (${width}x${height})`);
  await page.close();
}

function encodeGif() {
  const gifPath = join(OUT_DIR, "banner.gif");
  const width = BANNERS.find((b) => b.gif).width;

  try {
    console.log("Converting to GIF with ffmpeg...");
    execSync(
      `ffmpeg -y -framerate ${FPS} -i "${FRAMES_DIR}/frame-%04d.png" -vf "fps=${FPS},scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer" "${gifPath}"`,
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

  const stat = readFileSync(gifPath);
  console.log(`Banner GIF: ${gifPath} (${(stat.length / 1024).toFixed(0)}KB)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
