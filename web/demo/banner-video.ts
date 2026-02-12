import { chromium } from "playwright";

const WIDTH = 1920;
const HEIGHT = 1080;
const DURATION_S = 120;
const OUT_DIR = "/Users/armand/Documents/eywa/video/public";

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

  .landing-hero-dark {
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    justify-content: center !important;
    min-height: ${HEIGHT}px !important;
    padding: 0 !important;
    margin: 0 !important;
  }
`;

async function run() {
  console.log(`Recording ${DURATION_S}s banner at ${WIDTH}x${HEIGHT}...`);

  const browser = await chromium.launch({
    headless: false,
    args: [`--window-size=${WIDTH},${HEIGHT}`, "--disable-infobars", "--no-first-run"],
  });

  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    recordVideo: {
      dir: OUT_DIR,
      size: { width: WIDTH, height: HEIGHT },
    },
  });

  const page = await context.newPage();
  await page.goto("http://localhost:5176", { waitUntil: "networkidle" });
  await page.addStyleTag({ content: HIDE_CSS });

  console.log("Warming up (3s)...");
  await new Promise((r) => setTimeout(r, 3000));

  console.log(`Recording ${DURATION_S}s... just wait.`);
  await new Promise((r) => setTimeout(r, DURATION_S * 1000));

  const videoPath = await page.video()?.path();
  await page.close();
  await context.close();
  await browser.close();

  console.log(`Done: ${videoPath}`);
  console.log("Rename to eywa-banner-loop.mp4 when ready.");
}

run().catch(console.error);
