/**
 * Eywa Demo - Playwright automated browser walkthrough
 * For Gemini 3 Hackathon (3 minute video)
 *
 * Usage:
 *   cd web
 *   npx playwright test demo/playwright-demo.ts --headed --timeout 300000
 *
 * Or run directly:
 *   npx tsx demo/playwright-demo.ts
 *
 * Prerequisites:
 *   - web app running at localhost:5173 (npm run dev)
 *   - screen recording running (macOS: Cmd+Shift+5, or OBS)
 *
 * The script pauses at key moments so you can record voiceover.
 * Press any key in the terminal to advance, or let timers auto-advance.
 */

import { chromium, type Page, type Browser } from "playwright";

const BASE_URL = process.env.DEMO_URL || "http://localhost:5173";
const ROOM = process.env.DEMO_ROOM || "demo";
const HUB_URL = `${BASE_URL}/r/${ROOM}`;

// Timing (ms) - adjust these to match your voiceover pace
const PAUSE = {
  pageLoad: 3000,       // Let the page fully render + data load
  shortBeat: 1500,      // Brief pause between actions
  readMoment: 4000,     // Time for viewer to read something
  geminiThink: 12000,   // Wait for Gemini tool calls + response
  longPause: 6000,      // Dramatic pause / voiceover moment
  typeSpeed: 80,        // ms between keystrokes (human-like)
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
  await page.evaluate(
    ([targetY, dur]) => {
      const start = window.scrollY;
      const distance = targetY - start;
      const startTime = performance.now();
      function step(now: number) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / dur, 1);
        // ease-in-out cubic
        const ease =
          progress < 0.5
            ? 4 * progress * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 3) / 2;
        window.scrollTo(0, start + distance * ease);
        if (progress < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    },
    [y, duration] as const
  );
  await sleep(duration + 200);
}

async function waitForGeminiResponse(page: Page, timeout = 20000) {
  // Wait for "Thinking..." to appear then disappear
  try {
    await page.waitForSelector(".hub-steering-typing", { timeout: 5000 });
  } catch {
    // Already responded or no thinking indicator
  }
  try {
    await page.waitForSelector(".hub-steering-typing", {
      state: "detached",
      timeout,
    });
  } catch {
    // Timeout is OK, we'll continue
  }
  await sleep(1500); // Let the response render
}

async function run() {
  console.log("\n🎬 Eywa Demo Script - Gemini 3 Hackathon");
  console.log("=========================================\n");
  console.log("Start your screen recording NOW, then press Enter.\n");

  // Wait for user to start recording (optional, auto-continues after 5s)
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
    deviceScaleFactor: 2, // Retina for crisp recording
  });

  const page = await context.newPage();

  // ============================================
  // ACT 1: THE HOOK - HubView loads (0:00 - 0:20)
  // ============================================
  console.log("📍 Act 1: Loading HubView...");

  await page.goto(HUB_URL, { waitUntil: "networkidle" });
  await sleep(PAUSE.pageLoad);

  // Let the page settle, data loads via realtime
  await sleep(PAUSE.readMoment);

  // ============================================
  // ACT 2: DESTINATION + LIVE SWARM (0:20 - 0:45)
  // ============================================
  console.log("📍 Act 2: Showing destination + agents...");

  // Scroll slowly to destination banner
  const destBanner = page.locator(".hub-destination");
  if (await destBanner.isVisible()) {
    await destBanner.scrollIntoViewIfNeeded();
    await sleep(PAUSE.readMoment);
  }

  // Scroll to show agent cards
  const agentGrid = page.locator(".hub-agent-grid").first();
  if (await agentGrid.isVisible()) {
    await agentGrid.scrollIntoViewIfNeeded();
    await sleep(PAUSE.readMoment);

    // Click first active agent to expand it
    const firstCard = page.locator(".hub-agent-card.hub-agent-active").first();
    if (await firstCard.isVisible()) {
      await firstCard.click();
      await sleep(PAUSE.shortBeat);
    }
  }

  // ============================================
  // ACT 3: GEMINI STEERING (0:45 - 1:30) - THE STAR
  // ============================================
  console.log("📍 Act 3: Gemini steering panel...");

  // Scroll back up to steering panel
  await smoothScroll(page, 0, 1000);
  await sleep(PAUSE.shortBeat);

  // Open Gemini steering panel
  const steeringToggle = page.locator(".hub-steering-toggle");
  await steeringToggle.click();
  await sleep(PAUSE.shortBeat);

  // First query: "What are my agents doing?"
  console.log("  > Asking: What are my agents doing?");
  const steeringInput = page.locator(".hub-steering-input input");
  await typeHuman(page, ".hub-steering-input input", "What are my agents doing right now?");
  await sleep(PAUSE.shortBeat);

  // Send
  await page.keyboard.press("Enter");
  await waitForGeminiResponse(page, PAUSE.geminiThink);
  await sleep(PAUSE.readMoment);

  // Second query: "Detect patterns"
  console.log("  > Asking: Detect patterns across my agents");
  await typeHuman(page, ".hub-steering-input input", "Detect patterns across my agents");
  await sleep(PAUSE.shortBeat);

  await page.keyboard.press("Enter");
  await waitForGeminiResponse(page, PAUSE.geminiThink);
  await sleep(PAUSE.longPause);

  // ============================================
  // ACT 4: COURSE CORRECTION (1:30 - 2:00)
  // ============================================
  console.log("📍 Act 4: Course correction...");

  // Third query: milestone check
  console.log("  > Asking: Which milestones are stuck?");
  await typeHuman(
    page,
    ".hub-steering-input input",
    "Which milestones are stuck and what should I prioritize?"
  );
  await sleep(PAUSE.shortBeat);

  await page.keyboard.press("Enter");
  await waitForGeminiResponse(page, PAUSE.geminiThink);
  await sleep(PAUSE.readMoment);

  // ============================================
  // ACT 5: INJECT (2:00 - 2:15)
  // ============================================
  console.log("📍 Act 5: Inject bar...");

  // Scroll to inject bar at bottom
  const injectBar = page.locator(".hub-inject-bar");
  await injectBar.scrollIntoViewIfNeeded();
  await sleep(PAUSE.shortBeat);

  // Set priority to urgent
  const urgentBtn = page.locator('.hub-priority-btn:has-text("urgent")');
  await urgentBtn.click();
  await sleep(PAUSE.shortBeat);

  // Type inject message
  await typeHuman(
    page,
    ".hub-inject-input",
    "Focus on the global insights network. It's the last remaining milestone for the demo."
  );
  await sleep(PAUSE.shortBeat);

  // Send inject
  await page.locator(".hub-inject-send").click();
  await sleep(PAUSE.readMoment);

  // ============================================
  // ACT 6: MULTI-SURFACE FLASH (2:15 - 2:50)
  // ============================================
  console.log("📍 Act 6: Multi-surface (Discord + VS Code would be manual cuts)");

  // Show the knowledge hub briefly
  await page.goto(`${BASE_URL}/r/${ROOM}/knowledge`, {
    waitUntil: "networkidle",
  });
  await sleep(PAUSE.readMoment);

  // ============================================
  // ACT 7: CLOSE (2:50 - 3:00)
  // ============================================
  console.log("📍 Act 7: Back to HubView for closing shot");

  await page.goto(HUB_URL, { waitUntil: "networkidle" });
  await sleep(PAUSE.pageLoad);

  // Final lingering shot on the full dashboard
  await sleep(PAUSE.longPause);

  console.log("\n✅ Demo complete! Stop your screen recording.\n");
  console.log("Next steps:");
  console.log("  1. Record voiceover using web/demo/voiceover.md");
  console.log("  2. Splice Discord + VS Code screenshots/clips manually");
  console.log("  3. Stitch with: ffmpeg -i screen.mp4 -i voiceover.m4a -c:v copy -c:a aac demo.mp4\n");

  await sleep(3000);
  await browser.close();
}

run().catch((e) => {
  console.error("Demo script error:", e);
  process.exit(1);
});
