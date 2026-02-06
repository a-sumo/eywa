#!/usr/bin/env node
/**
 * Capture screenshots of Eywa views for the slide deck.
 *
 * Usage:
 *   node scripts/capture-slides.mjs [base-url] [room-slug]
 *
 * Examples:
 *   node scripts/capture-slides.mjs                          # http://localhost:5173 / demo
 *   node scripts/capture-slides.mjs http://localhost:5176 hack
 *
 * Screenshots are saved to public/slides/ and can be referenced
 * in slidesData.ts as { type: 'image', src: '/slides/thread-tree.png' }
 */

import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, "../public/slides");
mkdirSync(outDir, { recursive: true });

const BASE = process.argv[2] || "http://localhost:5173";
const ROOM = process.argv[3] || "demo";

const viewport = { width: 1440, height: 900 };

const captures = [
  {
    name: "landing",
    path: "/",
    description: "Landing page",
  },
  {
    name: "thread-tree",
    path: `/r/${ROOM}`,
    description: "Thread tree overview",
    waitFor: ".thread-tree",
  },
  {
    name: "thread-view",
    path: `/r/${ROOM}`,
    description: "Single thread timeline",
    // Will click into first thread if available
    action: async (page) => {
      const firstThread = page.locator(".thread-row").first();
      if (await firstThread.isVisible({ timeout: 3000 }).catch(() => false)) {
        await firstThread.click();
        await page.waitForTimeout(1000);
      }
    },
  },
  {
    name: "workspace-view",
    path: `/r/${ROOM}/workspace/new`,
    description: "3-panel Eywa workspace",
    waitFor: ".eywa-view",
  },
  {
    name: "chat",
    path: `/r/${ROOM}/chat`,
    description: "Team chat",
    waitFor: ".chat",
  },
];

async function run() {
  console.log(`\nCapturing screenshots from ${BASE} (room: ${ROOM})\n`);
  console.log(`Output: ${outDir}\n`);

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport });

  let captured = 0;

  for (const cap of captures) {
    const page = await context.newPage();
    const url = `${BASE}${cap.path}`;
    const outPath = resolve(outDir, `${cap.name}.png`);

    process.stdout.write(`  ${cap.name.padEnd(20)} ${cap.description}...`);

    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });

      if (cap.waitFor) {
        await page
          .waitForSelector(cap.waitFor, { timeout: 5000 })
          .catch(() => {});
      }

      if (cap.action) {
        await cap.action(page);
      }

      // Small pause for animations to settle
      await page.waitForTimeout(800);

      await page.screenshot({ path: outPath, fullPage: false });
      console.log(` saved`);
      captured++;
    } catch (err) {
      console.log(` FAILED (${err.message.slice(0, 60)})`);
    }

    await page.close();
  }

  await browser.close();

  console.log(`\nDone: ${captured}/${captures.length} screenshots captured.`);
  console.log(`\nTo use in slides, add to slidesData.ts:`);
  console.log(`  { type: 'image', title: '...', src: '/slides/thread-tree.png' }\n`);
}

run().catch(console.error);
