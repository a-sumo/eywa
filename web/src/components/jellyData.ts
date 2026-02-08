/* Pixel data format for the Eywa jellyfish mascot.
   Each pixel is tagged by body part so animations can target groups. */

export type JellyPart =
  | "bell"
  | "eye-left"
  | "eye-right"
  | "tentacle-0"
  | "tentacle-1"
  | "tentacle-2"
  | "tentacle-3"
  | "tentacle-4"
  | "organ"
  | "highlight";

export interface JellyPixel {
  x: number;
  y: number;
  color: string;
  part: JellyPart;
}

export interface JellyData {
  width: number;
  height: number;
  pixels: JellyPixel[];
}

/* Aurora palette for the editor */
export const JELLY_PALETTE = [
  "#15D1FF", // cyan
  "#2543FF", // blue
  "#6417EC", // purple
  "#E72B76", // pink
  "#4ade80", // green
  "#10a8cc", // cyan dim
  "#1d35cc", // blue dim
  "#5012bd", // purple dim
  "#0a0a1a", // near-black (eyes)
  "#1a1e2e", // dark fill
  "#ffffff", // white highlight
];

export const PART_COLORS: Record<JellyPart, string> = {
  bell: "#2543FF",
  "eye-left": "#0a0a1a",
  "eye-right": "#0a0a1a",
  "tentacle-0": "#15D1FF",
  "tentacle-1": "#6417EC",
  "tentacle-2": "#E72B76",
  "tentacle-3": "#6417EC",
  "tentacle-4": "#15D1FF",
  organ: "#E72B76",
  highlight: "#ffffff",
};

export const ALL_PARTS: JellyPart[] = [
  "bell",
  "eye-left",
  "eye-right",
  "tentacle-0",
  "tentacle-1",
  "tentacle-2",
  "tentacle-3",
  "tentacle-4",
  "organ",
  "highlight",
];

/* Precomputed animation metadata per pixel */
export interface AnimPixel {
  x: number;       // rest x
  y: number;       // rest y
  color: string;
  part: JellyPart;
  depth: number;   // 0..1, distance from root within the part (tentacles: 0=root, 1=tip)
  rootY: number;   // y of the topmost pixel in this part group
  side: number;    // -1 left of center, 0 center, 1 right of center
}

/* Build animation-ready pixel array from raw JellyData.
   Computes depth (normalized distance from root) and side for each pixel. */
export function buildAnimPixels(data: JellyData): AnimPixel[] {
  const midX = (data.width - 1) / 2;

  // Group by part to find roots and max depths
  const groups = new Map<JellyPart, JellyPixel[]>();
  for (const p of data.pixels) {
    let arr = groups.get(p.part);
    if (!arr) { arr = []; groups.set(p.part, arr); }
    arr.push(p);
  }

  const partMeta = new Map<JellyPart, { minY: number; maxY: number }>();
  for (const [part, pxs] of groups) {
    let minY = Infinity, maxY = -Infinity;
    for (const p of pxs) {
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    partMeta.set(part, { minY, maxY });
  }

  return data.pixels.map((p) => {
    const meta = partMeta.get(p.part)!;
    const range = meta.maxY - meta.minY;
    const depth = range > 0 ? (p.y - meta.minY) / range : 0;
    const side = p.x < midX - 0.5 ? -1 : p.x > midX + 0.5 ? 1 : 0;
    return {
      x: p.x,
      y: p.y,
      color: p.color,
      part: p.part,
      depth,
      rootY: meta.minY,
      side,
    };
  });
}

/* Default cross body pixel data for EywaMascot.
   Edit at /jelly, export JSON, paste back here. */
export const DEFAULT_JELLY: JellyData = {
  width: 32,
  height: 32,
  pixels: [
    // top nub
    {x:15,y:12,color:"#15D1FF",part:"highlight"},{x:16,y:12,color:"#15D1FF",part:"highlight"},
    // up arm (purple)
    {x:14,y:13,color:"#7946FF",part:"tentacle-0"},{x:15,y:13,color:"#7946FF",part:"tentacle-0"},{x:16,y:13,color:"#7946FF",part:"tentacle-0"},{x:17,y:13,color:"#7946FF",part:"tentacle-0"},
    {x:14,y:14,color:"#7946FF",part:"tentacle-0"},{x:15,y:14,color:"#7946FF",part:"tentacle-0"},{x:16,y:14,color:"#7946FF",part:"tentacle-0"},{x:17,y:14,color:"#7946FF",part:"tentacle-0"},
    {x:14,y:15,color:"#7946FF",part:"tentacle-0"},{x:15,y:15,color:"#7946FF",part:"tentacle-0"},{x:16,y:15,color:"#7946FF",part:"tentacle-0"},{x:17,y:15,color:"#7946FF",part:"tentacle-0"},
    // cross center: left arm (pink) | core | right arm (cyan)
    {x:11,y:16,color:"#E72B76",part:"tentacle-1"},{x:12,y:16,color:"#E72B76",part:"tentacle-1"},{x:13,y:16,color:"#E72B76",part:"tentacle-1"},{x:14,y:16,color:"#eef0ff",part:"bell"},{x:15,y:16,color:"#eef0ff",part:"bell"},{x:16,y:16,color:"#eef0ff",part:"bell"},{x:17,y:16,color:"#eef0ff",part:"bell"},{x:18,y:16,color:"#69E6FF",part:"tentacle-2"},{x:19,y:16,color:"#69E6FF",part:"tentacle-2"},{x:20,y:16,color:"#69E6FF",part:"tentacle-2"},
    {x:11,y:17,color:"#E72B76",part:"tentacle-1"},{x:12,y:17,color:"#E72B76",part:"tentacle-1"},{x:13,y:17,color:"#E72B76",part:"tentacle-1"},{x:14,y:17,color:"#eef0ff",part:"bell"},{x:15,y:17,color:"#eef0ff",part:"bell"},{x:16,y:17,color:"#eef0ff",part:"bell"},{x:17,y:17,color:"#eef0ff",part:"bell"},{x:18,y:17,color:"#69E6FF",part:"tentacle-2"},{x:19,y:17,color:"#69E6FF",part:"tentacle-2"},{x:20,y:17,color:"#69E6FF",part:"tentacle-2"},
    {x:11,y:18,color:"#E72B76",part:"tentacle-1"},{x:12,y:18,color:"#E72B76",part:"tentacle-1"},{x:13,y:18,color:"#E72B76",part:"tentacle-1"},{x:14,y:18,color:"#eef0ff",part:"bell"},{x:15,y:18,color:"#eef0ff",part:"bell"},{x:16,y:18,color:"#eef0ff",part:"bell"},{x:17,y:18,color:"#eef0ff",part:"bell"},{x:18,y:18,color:"#69E6FF",part:"tentacle-2"},{x:19,y:18,color:"#69E6FF",part:"tentacle-2"},{x:20,y:18,color:"#69E6FF",part:"tentacle-2"},
    {x:11,y:19,color:"#E72B76",part:"tentacle-1"},{x:12,y:19,color:"#E72B76",part:"tentacle-1"},{x:13,y:19,color:"#E72B76",part:"tentacle-1"},{x:14,y:19,color:"#eef0ff",part:"bell"},{x:15,y:19,color:"#eef0ff",part:"bell"},{x:16,y:19,color:"#eef0ff",part:"bell"},{x:17,y:19,color:"#eef0ff",part:"bell"},{x:18,y:19,color:"#69E6FF",part:"tentacle-2"},{x:19,y:19,color:"#69E6FF",part:"tentacle-2"},{x:20,y:19,color:"#69E6FF",part:"tentacle-2"},
    // down arm (blue)
    {x:14,y:20,color:"#393CF5",part:"tentacle-3"},{x:15,y:20,color:"#393CF5",part:"tentacle-3"},{x:16,y:20,color:"#393CF5",part:"tentacle-3"},{x:17,y:20,color:"#393CF5",part:"tentacle-3"},
    {x:14,y:21,color:"#393CF5",part:"tentacle-3"},{x:15,y:21,color:"#393CF5",part:"tentacle-3"},{x:16,y:21,color:"#393CF5",part:"tentacle-3"},{x:17,y:21,color:"#393CF5",part:"tentacle-3"},
    {x:14,y:22,color:"#393CF5",part:"tentacle-3"},{x:15,y:22,color:"#393CF5",part:"tentacle-3"},{x:16,y:22,color:"#393CF5",part:"tentacle-3"},{x:17,y:22,color:"#393CF5",part:"tentacle-3"},
    // bottom nub
    {x:15,y:23,color:"#15D1FF",part:"highlight"},{x:16,y:23,color:"#15D1FF",part:"highlight"},
    // eyes (2px vertical)
    {x:14,y:17,color:"#0a0a12",part:"eye-left"},{x:14,y:18,color:"#0a0a12",part:"eye-left"},
    {x:17,y:17,color:"#0a0a12",part:"eye-right"},{x:17,y:18,color:"#0a0a12",part:"eye-right"},
  ],
};
