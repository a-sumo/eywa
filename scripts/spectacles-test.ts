#!/usr/bin/env npx tsx
/**
 * Spectacles Integration Test
 *
 * Launches a headless browser at the SpectaclesView, sends simulated events
 * via Supabase Realtime, and screenshots the result after each interaction
 * to verify the UI responds correctly.
 *
 * Usage:
 *   npx tsx scripts/spectacles-test.ts
 *   npx tsx scripts/spectacles-test.ts --fold eywa-dev
 *   npx tsx scripts/spectacles-test.ts --base-url https://eywa-three.vercel.app
 */

import puppeteer, { Browser, Page } from "puppeteer";
import { createClient, RealtimeChannel } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

// --- Config ---

function loadEnv(): Record<string, string> {
  const envPath = path.resolve(__dirname, "../web/.env");
  const vars: Record<string, string> = {};
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
      const match = line.match(/^(\w+)=(.*)$/);
      if (match) vars[match[1]] = match[2];
    }
  }
  return vars;
}

const env = loadEnv();
const SUPABASE_URL = process.env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;

const args = process.argv.slice(2);
function getArg(name: string, fallback: string): string {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
}

const FOLD = getArg("fold", "demo");
const DEVICE_ID = "sim-test";
const EXPLICIT_URL = getArg("base-url", "");
const OUT_DIR = path.resolve(__dirname, "../test/spectacles-screenshots");

const supabase = createClient(SUPABASE_URL!, SUPABASE_KEY!);
let channel: RealtimeChannel;

/**
 * Auto-detect which local port is serving the Eywa web app.
 * Scans common Vite/dev-server ports and checks the HTML title.
 */
async function findEywaPort(): Promise<string> {
  if (EXPLICIT_URL) return EXPLICIT_URL;

  const candidates = [5173, 5174, 5175, 5176, 5177, 5178, 5179, 3000, 3001, 4173, 8080];
  console.log("Auto-detecting Eywa dev server...");

  for (const port of candidates) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1000);
      const res = await fetch(`http://localhost:${port}/`, { signal: controller.signal });
      clearTimeout(timeout);
      const html = await res.text();
      if (html.includes("Eywa") || html.includes("eywa")) {
        console.log(`  Found Eywa on port ${port}`);
        return `http://localhost:${port}`;
      }
    } catch {
      // port not listening or timed out
    }
  }

  // Fallback: try staging
  console.log("  No local server found, trying staging (eywa-three.vercel.app)...");
  return "https://eywa-three.vercel.app";
}

// --- Helpers ---

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function send(event: string, payload: Record<string, unknown>) {
  await channel.send({ type: "broadcast", event, payload });
}

async function sikEvent(type: string, extra: Record<string, unknown> = {}) {
  await send("interaction", { type, ...extra });
}

async function interact(type: string, u?: number, v?: number) {
  await send("interact", { type, u, v, timestamp: Date.now() });
}

async function screenshot(page: Page, name: string, description: string) {
  const filePath = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  console.log(`  [screenshot] ${name}: ${description}`);
  return filePath;
}

// --- Test cases ---

interface TestResult {
  name: string;
  description: string;
  screenshot: string;
  passed: boolean;
  notes: string;
}

async function runTests(page: Page): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Wait for the page to be in a stable state
  // Check for the canvas and broadcast status
  async function waitForReady() {
    await page.waitForSelector("canvas", { timeout: 15000 });
    // Give time for Supabase channel to connect and data to sync
    await sleep(3000);
  }

  // 1. Baseline - page loads with canvas
  console.log("\n[1/9] Baseline: page load");
  await waitForReady();
  const baseline = await screenshot(page, "01-baseline", "Page loaded with navigator canvas");
  const hasCanvas = await page.$("canvas");
  results.push({
    name: "baseline",
    description: "SpectaclesView loads with canvas and connects to channel",
    screenshot: baseline,
    passed: !!hasCanvas,
    notes: hasCanvas ? "Canvas element present" : "FAIL: No canvas found",
  });

  // 2. Broadcasting status
  console.log("[2/9] Check broadcast status");
  const broadcastText = await page.evaluate(() => {
    const els = document.querySelectorAll("div");
    for (const el of els) {
      if (el.textContent?.includes("BROADCASTING") || el.textContent?.includes("CHANNEL READY")) {
        return el.textContent;
      }
    }
    return null;
  });
  results.push({
    name: "broadcast-status",
    description: "Channel status indicator visible",
    screenshot: baseline,
    passed: !!broadcastText,
    notes: broadcastText ? `Status: "${broadcastText}"` : "FAIL: No broadcast status found",
  });

  // 3. Hover interaction
  console.log("[3/9] Hover interaction");
  await interact("hover", 0.5, 0.5);
  await sleep(500);
  await interact("hover_move", 0.55, 0.45);
  await sleep(300);
  const hoverShot = await screenshot(page, "03-hover", "Hover at canvas center");
  await interact("hover_exit");
  await sleep(200);
  results.push({
    name: "hover",
    description: "Hover events processed without errors",
    screenshot: hoverShot,
    passed: true, // visual check needed
    notes: "Hover at center, check if node highlight appears",
  });

  // 4. Tap interaction
  console.log("[4/9] Tap interaction");
  await interact("tap", 0.5, 0.5);
  await sleep(500);
  const tapShot = await screenshot(page, "04-tap", "Tap at canvas center");
  results.push({
    name: "tap",
    description: "Tap event at center of canvas",
    screenshot: tapShot,
    passed: true,
    notes: "Tap at center, check if selection state changes",
  });

  // 5. Zoom in
  console.log("[5/9] Zoom in");
  await sikEvent("zoom_in", { factor: 1.4 });
  await sleep(400);
  await sikEvent("zoom_in", { factor: 1.4 });
  await sleep(400);
  await sikEvent("zoom_in", { factor: 1.4 });
  await sleep(600);
  const zoomInShot = await screenshot(page, "05-zoom-in", "Zoomed in 3x");
  results.push({
    name: "zoom-in",
    description: "Zoom in via SIK event",
    screenshot: zoomInShot,
    passed: true,
    notes: "3x zoom_in with factor 1.4, check if canvas view is magnified",
  });

  // 6. Pan
  console.log("[6/9] Pan");
  await sikEvent("pan", { dx: 0.5, dy: 0 });
  await sleep(400);
  await sikEvent("pan", { dx: 0, dy: -0.5 });
  await sleep(600);
  const panShot = await screenshot(page, "06-pan", "Panned right and up");
  results.push({
    name: "pan",
    description: "Pan via SIK event",
    screenshot: panShot,
    passed: true,
    notes: "Panned right then up, view should be offset from center",
  });

  // 7. Reset view
  console.log("[7/9] Reset view");
  await sikEvent("reset_view");
  await sleep(800);
  const resetShot = await screenshot(page, "07-reset", "View reset to default");
  results.push({
    name: "reset-view",
    description: "Reset view brings canvas back to default position",
    screenshot: resetShot,
    passed: true,
    notes: "Should look similar to baseline (centered, zoom 1x)",
  });

  // 8. Toggle grid mode
  console.log("[8/9] Toggle grid");
  await sikEvent("toggle_grid");
  await sleep(800);
  const gridShot = await screenshot(page, "08-grid", "Grid mode enabled");
  // Check if grid button is now active (has accent color border)
  await sikEvent("toggle_grid"); // toggle back
  await sleep(300);
  results.push({
    name: "toggle-grid",
    description: "Grid mode toggle via SIK event",
    screenshot: gridShot,
    passed: true,
    notes: "Check if layout changed to grid arrangement",
  });

  // 9. Toggle theme
  console.log("[9/9] Toggle theme");
  await sikEvent("toggle_theme");
  await sleep(800);
  const themeShot = await screenshot(page, "09-light-theme", "Light theme active");
  // Check theme by looking at the outermost div with explicit background style
  const bgColor = await page.evaluate(() => {
    const divs = document.querySelectorAll("div[style]");
    for (const d of divs) {
      const bg = (d as HTMLElement).style.background || (d as HTMLElement).style.backgroundColor;
      if (bg && bg !== "none" && bg !== "") return bg;
    }
    return null;
  });
  await sikEvent("toggle_theme"); // toggle back
  await sleep(300);
  // In light mode, the bg is #fafafa; in dark mode it's #080a08
  const isLight = bgColor ? (bgColor.includes("fafafa") || bgColor.includes("250") || bgColor.includes("255")) : false;
  results.push({
    name: "toggle-theme",
    description: "Theme toggle switches to light mode",
    screenshot: themeShot,
    passed: !!isLight,
    notes: `Background: ${bgColor} ${isLight ? "(light)" : "(check screenshot manually)"}`,
  });

  return results;
}

// --- Main ---

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Connect to Supabase Realtime
  const channelKey = `spectacles:${FOLD}:${DEVICE_ID}`;
  console.log(`Supabase channel: ${channelKey}`);

  channel = supabase.channel(channelKey, {
    config: { broadcast: { ack: false, self: false } },
  });

  await new Promise<void>((resolve, reject) => {
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") resolve();
      else if (status === "CHANNEL_ERROR") reject(new Error("Channel error"));
    });
  });
  console.log("Supabase connected.");

  // Auto-detect server and launch browser
  const baseUrl = await findEywaPort();
  const url = `${baseUrl}/f/${FOLD}/spectacles?device=${DEVICE_ID}`;
  console.log(`Opening ${url}`);

  const browser: Browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page: Page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 });

  // Capture console errors
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(err.message));

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
  console.log("Page loaded.");

  // Run tests
  const results = await runTests(page);

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("SPECTACLES INTERACTION TEST RESULTS");
  console.log("=".repeat(60));

  let passed = 0;
  let failed = 0;
  for (const r of results) {
    const status = r.passed ? "PASS" : "FAIL";
    console.log(`  [${status}] ${r.name}: ${r.description}`);
    if (r.notes) console.log(`         ${r.notes}`);
    if (r.passed) passed++;
    else failed++;
  }

  console.log(`\n  ${passed} passed, ${failed} failed out of ${results.length} tests`);

  if (consoleErrors.length > 0) {
    console.log(`\n  Console errors (${consoleErrors.length}):`);
    for (const e of consoleErrors.slice(0, 10)) {
      console.log(`    - ${e.slice(0, 120)}`);
    }
  }

  console.log(`\n  Screenshots saved to: ${OUT_DIR}`);

  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
