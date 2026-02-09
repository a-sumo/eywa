/**
 * Eywa Demo - Playwright automated browser walkthrough
 * Hackathon demo video (3 minutes)
 *
 * Usage:
 *   cd web
 *   npx tsx demo/playwright-demo.ts
 *
 * Prerequisites:
 *   - web app running at localhost:5173 (npm run dev)
 *   - screen recording running (macOS: Cmd+Shift+5, or OBS)
 *
 * The script pauses at key moments for voiceover timing.
 */

import { chromium, type Page, type Browser } from "playwright";

const BASE_URL = process.env.DEMO_URL || "http://localhost:5173";
const ROOM = process.env.DEMO_ROOM || "demo";
const HUB_URL = `${BASE_URL}/r/${ROOM}`;

const PAUSE = {
  pageLoad: 3000,
  shortBeat: 1500,
  readMoment: 4000,
  geminiThink: 12000,
  longPause: 6000,
  typeSpeed: 80,
};

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function typeHuman(page: Page, selector: string, text: string) {
  await page.click(selector);
  for (const char of text) {
    await page.keyboard.type(char, { delay: PAUSE.typeSpeed });
  }
}

async function smoothScroll(page: Page, y: number, duration = 1500) {
  await page.evaluate(`window.scrollTo({ top: ${y}, behavior: 'smooth' })`);
  await sleep(duration + 200);
}

async function waitForGeminiResponse(page: Page, timeout = 20000) {
  try {
    await page.waitForSelector(".hub-steering-typing", { timeout: 5000 });
  } catch {
    // Already responded
  }
  try {
    await page.waitForSelector(".hub-steering-typing", {
      state: "detached",
      timeout,
    });
  } catch {
    // Timeout OK
  }
  await sleep(1500);
}

async function run() {
  console.log("\n  Eywa Demo Script");
  console.log("  ================\n");
  console.log("  Start screen recording, then press Enter.\n");
  await sleep(2000);

  const browser: Browser = await chromium.launch({
    headless: false,
    args: [
      "--window-size=1440,900",
      "--disable-infobars",
      "--no-first-run",
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    recordVideo: {
      dir: "demo/recordings",
      size: { width: 1440, height: 900 },
    },
  });

  const page = await context.newPage();

  // ============================================
  // ACT 1: THE HOOK (0:00 - 0:20)
  // HubView loads with topology map + destination
  // ============================================
  console.log("  [0:00] Loading HubView...");

  await page.goto(HUB_URL, { waitUntil: "networkidle" });
  await sleep(PAUSE.pageLoad);
  await sleep(PAUSE.readMoment);

  // ============================================
  // ACT 2: DESTINATION + GEMINI (0:20 - 0:50)
  // Show destination, then ask Gemini two questions
  // ============================================
  console.log("  [0:20] Destination + Gemini steering...");

  // Scroll to destination banner
  const destBanner = page.locator(".hub-destination");
  if (await destBanner.isVisible()) {
    await destBanner.scrollIntoViewIfNeeded();
    await sleep(PAUSE.readMoment);
  }

  // Scroll back up for Gemini
  await smoothScroll(page, 0, 1000);
  await sleep(PAUSE.shortBeat);

  // Query 1: "What are my agents doing right now?"
  console.log('  > "What are my agents doing right now?"');
  await typeHuman(page, ".hub-command-input", "What are my agents doing right now?");
  await sleep(PAUSE.shortBeat);
  await page.keyboard.press("Enter");
  await waitForGeminiResponse(page, PAUSE.geminiThink);
  await sleep(PAUSE.readMoment);

  // Query 2: "Detect patterns across my agents"
  console.log('  > "Detect patterns across my agents"');
  await typeHuman(page, ".hub-command-input", "Detect patterns across my agents");
  await sleep(PAUSE.shortBeat);
  await page.keyboard.press("Enter");
  await waitForGeminiResponse(page, PAUSE.geminiThink);
  await sleep(PAUSE.longPause);

  // ============================================
  // ACT 3: COURSE CORRECTION (0:50 - 1:15)
  // Ask about stuck milestones, then inject
  // ============================================
  console.log("  [0:50] Course correction...");

  // Query 3: milestone check
  console.log('  > "Which milestones are stuck?"');
  await typeHuman(
    page,
    ".hub-command-input",
    "Which milestones are stuck and what should I prioritize?"
  );
  await sleep(PAUSE.shortBeat);
  await page.keyboard.press("Enter");
  await waitForGeminiResponse(page, PAUSE.geminiThink);
  await sleep(PAUSE.readMoment);

  // Switch to inject mode and send a targeted instruction
  console.log("  > Sending inject...");
  const injectModeBtn = page.locator('.hub-mode-btn:has-text("Inject")');
  if (await injectModeBtn.isVisible()) {
    await injectModeBtn.click();
    await sleep(PAUSE.shortBeat);

    const urgentBtn = page.locator('.hub-priority-btn:has-text("urgent")');
    if (await urgentBtn.isVisible()) {
      await urgentBtn.click();
      await sleep(PAUSE.shortBeat);
    }

    await typeHuman(
      page,
      ".hub-command-input",
      "pale-oak: fix the TS compiler errors first, then wire EywaGeminiLive into the scene."
    );
    await sleep(PAUSE.shortBeat);
    await page.locator(".hub-command-send").click();
    await sleep(PAUSE.readMoment);
  }

  // ============================================
  // ACT 4: MULTI-SURFACE FLASH (1:15 - 1:50)
  // VS Code + Discord + Spectacles are manual cuts
  // Show knowledge/network on web as a bridge
  // ============================================
  console.log("  [1:15] Multi-surface (manual cuts for VS Code, Discord, Spectacles)");
  console.log("         Record VS Code sidebar (timeline graph + Needs You) separately");
  console.log("         Record Discord /course and /claims separately");
  console.log("         Record SpectaclesView broadcast UI separately");

  // Brief pause on HubView while voiceover covers multi-surface
  await sleep(PAUSE.longPause);

  // ============================================
  // ACT 5: RECOVERY + NETWORK (1:50 - 2:25)
  // Show network route query
  // ============================================
  console.log("  [1:50] Recovery + Network...");

  // Switch back to Gemini mode if we're still in inject
  const geminiModeBtn = page.locator('.hub-mode-btn:has-text("Gemini")');
  if (await geminiModeBtn.isVisible()) {
    await geminiModeBtn.click();
    await sleep(PAUSE.shortBeat);
  }

  // Query network
  console.log('  > "What does the network recommend for our remaining work?"');
  await typeHuman(
    page,
    ".hub-command-input",
    "What does the network recommend for our remaining work?"
  );
  await sleep(PAUSE.shortBeat);
  await page.keyboard.press("Enter");
  await waitForGeminiResponse(page, PAUSE.geminiThink);
  await sleep(PAUSE.readMoment);

  // ============================================
  // ACT 6: META MOMENT + CLOSE (2:25 - 3:00)
  // Pull back to full HubView
  // ============================================
  console.log("  [2:25] Meta moment + close...");

  // Scroll to show the full topology map
  await smoothScroll(page, 0, 1000);
  await sleep(PAUSE.longPause);

  // Final lingering shot
  await sleep(PAUSE.longPause);

  const videoPath = await page.video()?.path();
  await page.close();
  await context.close();
  await browser.close();

  console.log("\n  Done.\n");
  if (videoPath) {
    console.log(`  Video: ${videoPath}`);
  }
  console.log("\n  Next:");
  console.log("  1. Record voiceover from web/demo/voiceover.md");
  console.log("  2. Record VS Code sidebar, Discord /course + /claims, Spectacles clips manually");
  console.log("  3. Stitch: ffmpeg -i screen.mp4 -i voiceover.m4a -c:v copy -c:a aac demo.mp4\n");
}

run().catch((e) => {
  console.error("Demo script error:", e);
  process.exit(1);
});
