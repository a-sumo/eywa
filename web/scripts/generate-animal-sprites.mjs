/**
 * Fetch Twemoji animal face PNGs → downsample to 12×12 → quantize brightness → output TS sprite data.
 *
 * Run:  node scripts/generate-animal-sprites.mjs
 */

import sharp from "sharp";
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const GRID = 12; // 12×12 output

// Twemoji CDN (jdecked fork, latest)
const CDN = "https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/72x72/";

// Animal face emoji → Twemoji codepoints
const ANIMALS = [
  { name: "cat",     code: "1f431" },
  { name: "dog",     code: "1f436" },
  { name: "bear",    code: "1f43b" },
  { name: "rabbit",  code: "1f430" },
  { name: "fox",     code: "1f98a" },
  { name: "owl",     code: "1f989" },
  { name: "frog",    code: "1f438" },
  { name: "penguin", code: "1f427" },
  { name: "mouse",   code: "1f42d" },
  { name: "pig",     code: "1f437" },
  { name: "koala",   code: "1f428" },
  { name: "lion",    code: "1f981" },
  { name: "monkey",  code: "1f435" },
  { name: "hamster", code: "1f439" },
  { name: "duck",    code: "1f986" },
  { name: "wolf",    code: "1f43a" },
  { name: "tiger",   code: "1f42f" },
  { name: "cow",     code: "1f42e" },
  { name: "chicken", code: "1f414" },
  { name: "octopus", code: "1f419" },
];

async function processAnimal(name, code) {
  const url = `${CDN}${code}.png`;
  console.log(`  ${name}: ${url}`);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${name}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());

  // Resize to GRID×GRID with transparent background, get raw RGBA
  const { data } = await sharp(buf)
    .resize(GRID, GRID, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: "lanczos3",
    })
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Quantize: 0=empty, 1=dark, 2=mid, 3=light
  const grid = [];
  for (let y = 0; y < GRID; y++) {
    const row = [];
    for (let x = 0; x < GRID; x++) {
      const i = (y * GRID + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];

      if (a < 80) {
        row.push(0); // transparent
      } else {
        // Perceived brightness (ITU-R BT.601)
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        if (luma < 70) row.push(1);       // dark (eyes, outlines)
        else if (luma < 160) row.push(2);  // medium (body)
        else row.push(3);                  // light (highlights)
      }
    }
    grid.push(row);
  }

  return { name, grid };
}

async function main() {
  console.log("Fetching Twemoji animal faces...");
  const sprites = [];

  for (const { name, code } of ANIMALS) {
    try {
      const sprite = await processAnimal(name, code);
      sprites.push(sprite);
    } catch (err) {
      console.error(`  SKIP ${name}: ${err.message}`);
    }
  }

  // Generate TypeScript output
  const lines = [
    "// Auto-generated from Twemoji animal faces",
    "// Run: node scripts/generate-animal-sprites.mjs",
    "// Do not edit manually.",
    "",
    "export interface AnimalSprite {",
    "  name: string;",
    "  grid: number[][]; // 12x12, 0=empty 1=dark 2=mid 3=light",
    "}",
    "",
    "export const ANIMAL_SPRITES: AnimalSprite[] = [",
  ];

  for (const s of sprites) {
    lines.push(`  { name: "${s.name}", grid: [`);
    for (const row of s.grid) {
      lines.push(`    [${row.join(",")}],`);
    }
    lines.push("  ]},");
  }

  lines.push("];");
  lines.push("");

  const outPath = join(__dirname, "../src/components/animalSprites.ts");
  writeFileSync(outPath, lines.join("\n"));
  console.log(`\nWrote ${sprites.length} sprites to ${outPath}`);
}

main().catch(console.error);
