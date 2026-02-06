#!/usr/bin/env node
/**
 * Avatar Pipeline: Generate kurzgesagt-style animal avatars
 *
 * Steps:
 * 1. Call Imagen API to generate raster PNGs
 * 2. Run vtracer to convert to SVG
 * 3. Clean + optimize SVGs
 * 4. Build TypeScript module with color rotation
 *
 * Usage: node scripts/avatar-pipeline/generate.mjs
 */

import { writeFile, readFile, mkdir, readdir, unlink } from "fs/promises";
import { execSync } from "child_process";
import { existsSync } from "fs";
import path from "path";

const API_KEY = process.env.VITE_GEMINI_API_KEY || "AIzaSyDhkpOu6it90ZJDPpu9lW-DAb6vKmvoWqs";
const OUT_DIR = path.resolve("scripts/avatar-pipeline/out");
const RASTER_DIR = path.join(OUT_DIR, "rasters");
const SVG_DIR = path.join(OUT_DIR, "svgs");
const FINAL_DIR = path.resolve("src/assets/avatars");

const ANIMALS = [
  "owl",
  "fox",
  "bear",
  "penguin",
  "cat",
  "octopus",
  "rabbit",
  "wolf",
  "deer",
  "chameleon",
];

const STYLE_PROMPT = `Generate a single cute {animal} face icon in the Kurzgesagt animation style.

Rules:
- Front-facing animal face only, centered, filling the frame
- Thick black outlines (3-4px), flat solid color fills, NO gradients
- Round geometric shapes, large cute expressive eyes with white highlights
- Maximum 5-6 colors total, simple flat regions
- Pure white background, NO text, NO labels, NO extra objects
- Think: emoji-style mascot, app icon, simple enough to be a 32x32 avatar
- Do NOT generate photographs or realistic art. This must look like a cartoon/vector illustration.`;

// Generate image using Gemini multimodal models (better style consistency)
async function generateWithGemini(prompt, model) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ["image", "text"],
      },
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`${model} failed (${resp.status}): ${err.slice(0, 200)}`);
  }

  const data = await resp.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  const imgPart = parts.find(p => p.inlineData?.mimeType?.startsWith("image/"));
  if (!imgPart) {
    throw new Error(`${model}: no image in response`);
  }

  return Buffer.from(imgPart.inlineData.data, "base64");
}

// Generate with Imagen predict API
async function generateWithImagen(prompt, model) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${API_KEY}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: {
        sampleCount: 1,
        aspectRatio: "1:1",
        outputOptions: { mimeType: "image/png" },
      },
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`${model} failed (${resp.status}): ${err.slice(0, 200)}`);
  }

  const data = await resp.json();
  const b64 = data.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) throw new Error(`${model}: no image in response`);
  return Buffer.from(b64, "base64");
}

async function generateImage(animal) {
  const prompt = STYLE_PROMPT.replace("{animal}", animal);

  // Priority order: Gemini 3 models for hackathon, then fallback
  const attempts = [
    { model: "gemini-2.5-flash-image", fn: generateWithGemini },
    { model: "gemini-3-flash-preview", fn: generateWithGemini },
    { model: "gemini-3-pro-image-preview", fn: generateWithGemini },
    { model: "imagen-4.0-fast-generate-001", fn: generateWithImagen },
  ];

  for (const { model, fn } of attempts) {
    console.log(`  Trying ${model}...`);
    try {
      const buf = await fn(prompt, model);
      console.log(`  Success with ${model} (${(buf.length / 1024).toFixed(1)}KB)`);
      return buf;
    } catch (e) {
      console.log(`  ${e.message}`);
    }
  }

  throw new Error(`All models failed for ${animal}`);
}

function rasterToSvg(pngPath, svgPath) {
  // vtracer settings tuned for clean, simple icon output
  execSync(`vtracer \
    --input "${pngPath}" \
    --output "${svgPath}" \
    --colormode color \
    --hierarchical stacked \
    --mode polygon \
    --filter_speckle 8 \
    --color_precision 6 \
    --corner_threshold 60 \
    --segment_length 4.0 \
    --splice_threshold 45 \
    --path_precision 3`, { stdio: "pipe" });
}

function cleanSvg(svgContent, animal) {
  // Strip XML declaration, comments
  let svg = svgContent
    .replace(/<\?xml[^?]*\?>\s*/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();

  // Remove background/near-white paths (white bg from generation)
  // Match paths with fill colors close to white (#F0F0F0, #FBFAF7, #FFFFFF, etc.)
  svg = svg.replace(/<path[^>]*fill="#F[0-9A-Fa-f]{5}"[^>]*\/>/g, "");
  svg = svg.replace(/<path[^>]*fill="#E[0-9A-Fa-f]{5}"[^>]*\/>/g, "");
  // Also catch paths with fill before d attribute
  svg = svg.replace(/<path[^>]*fill="(#[Ff][Ff][Ff][Ff][Ff][Ff]|#[Ff][Bb][Ff][Aa][Ff][0-9a-fA-F]|white)"[^>]*\/>/g, "");

  // More targeted: remove the first path if it's the full-canvas background rect
  // (vtracer always outputs it as M0,0 L{w},0 L{w},{h} L0,{h} Z)
  svg = svg.replace(/<path d="M0,0 L\d+,0 L\d+,\d+ L0,\d+ Z\s*"[^>]*\/>/g, "");

  // Extract width/height and add viewBox
  const wMatch = svg.match(/width="(\d+)"/);
  const hMatch = svg.match(/height="(\d+)"/);
  const w = wMatch ? wMatch[1] : "1024";
  const h = hMatch ? hMatch[1] : "1024";

  // Add viewBox, set width/height to 100% for responsive sizing
  if (!svg.includes("viewBox")) {
    svg = svg.replace("<svg", `<svg viewBox="0 0 ${w} ${h}"`);
  }
  svg = svg.replace(/width="\d+"/, 'width="100%"');
  svg = svg.replace(/height="\d+"/, 'height="100%"');

  // Add data attribute for identification
  svg = svg.replace("<svg", `<svg data-animal="${animal}"`);

  return svg;
}

function buildColorVariants(baseSvg, animal) {
  // We'll do color rotation in CSS at runtime, not at build time.
  // The SVG paths keep their original colors, and we apply
  // CSS hue-rotate + saturate filters per agent.
  return baseSvg;
}

async function buildTypescriptModule(svgMap) {
  const entries = Object.entries(svgMap);

  let ts = `// Auto-generated by avatar-pipeline/generate.mjs
// Kurzgesagt-style animal avatars for agent identification
// 10 base animals, color variants applied via CSS hue-rotate

export interface AvatarDef {
  name: string;
  svg: string;
}

export const AVATARS: AvatarDef[] = [
`;

  for (const [name, svg] of entries) {
    // Escape backticks and ${} in SVG content
    const escaped = svg.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
    ts += `  { name: "${name}", svg: \`${escaped}\` },\n`;
  }

  ts += `];

export const AVATAR_COUNT = ${entries.length};

/**
 * Get avatar for an agent name. Deterministic hash picks the animal,
 * CSS hue-rotate picks the color variant.
 */
export function getAvatar(agentName: string): { avatar: AvatarDef; hueRotate: number; saturate: number } {
  let hash = 0;
  for (let i = 0; i < agentName.length; i++) {
    hash = agentName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const idx = Math.abs(hash) % AVATARS.length;
  // Spread hue across 360 degrees, vary saturation slightly
  const hueRotate = Math.abs(hash >> 8) % 360;
  const saturate = 80 + (Math.abs(hash >> 16) % 40); // 80-120%
  return { avatar: AVATARS[idx], hueRotate, saturate };
}

/**
 * Get a data URI for use in <img> tags or D3 image nodes.
 * Applies hue rotation via SVG filter embedded in the SVG itself.
 */
export function getAvatarDataUri(agentName: string): string {
  const { avatar, hueRotate, saturate } = getAvatar(agentName);
  // Wrap SVG with an embedded filter for color rotation
  const filtered = avatar.svg.replace(
    "<svg",
    \`<svg style="filter: hue-rotate(\${hueRotate}deg) saturate(\${saturate}%)"\`
  );
  return \`data:image/svg+xml;charset=utf-8,\${encodeURIComponent(filtered)}\`;
}
`;

  return ts;
}

// ── Main ──

async function main() {
  console.log("Avatar Pipeline");
  console.log("================");

  // Create dirs
  for (const dir of [OUT_DIR, RASTER_DIR, SVG_DIR, FINAL_DIR]) {
    await mkdir(dir, { recursive: true });
  }

  const svgMap = {};

  for (const animal of ANIMALS) {
    const pngPath = path.join(RASTER_DIR, `${animal}.png`);
    const svgPath = path.join(SVG_DIR, `${animal}.svg`);

    // Step 1: Generate raster (skip if cached)
    if (!existsSync(pngPath)) {
      console.log(`\n[1/3] Generating ${animal}...`);
      try {
        const imageData = await generateImage(animal);
        await writeFile(pngPath, imageData);
        console.log(`  Saved ${pngPath} (${(imageData.length / 1024).toFixed(1)}KB)`);
        // Rate limit - be nice to the API
        await new Promise(r => setTimeout(r, 2000));
      } catch (e) {
        console.error(`  FAILED: ${e.message}`);
        continue;
      }
    } else {
      console.log(`\n[1/3] ${animal}.png cached, skipping generation`);
    }

    // Step 2: Vectorize
    console.log(`[2/3] Vectorizing ${animal}...`);
    try {
      rasterToSvg(pngPath, svgPath);
      console.log(`  Saved ${svgPath}`);
    } catch (e) {
      console.error(`  Vectorize failed: ${e.message}`);
      continue;
    }

    // Step 3: Clean SVG
    console.log(`[3/3] Cleaning ${animal} SVG...`);
    const raw = await readFile(svgPath, "utf-8");
    const cleaned = cleanSvg(raw, animal);
    const final = buildColorVariants(cleaned, animal);

    const finalPath = path.join(FINAL_DIR, `${animal}.svg`);
    await writeFile(finalPath, final);
    await writeFile(svgPath, final); // also update in working dir

    svgMap[animal] = final;
    console.log(`  Done: ${animal}`);
  }

  // Step 4: Build TypeScript module
  console.log("\n[4/4] Building TypeScript module...");
  const tsContent = await buildTypescriptModule(svgMap);
  const tsPath = path.resolve("src/components/avatars.ts");
  await writeFile(tsPath, tsContent);
  console.log(`  Wrote ${tsPath}`);

  console.log(`\nPipeline complete. ${Object.keys(svgMap).length}/${ANIMALS.length} avatars generated.`);
}

main().catch(e => {
  console.error("Pipeline failed:", e);
  process.exit(1);
});
