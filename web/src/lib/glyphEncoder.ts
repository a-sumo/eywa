import type { Memory } from "./supabase";

// --- Action types ---

export type ActionType =
  | "observe"
  | "write"
  | "execute"
  | "search"
  | "communicate"
  | "decide"
  | "store"
  | "lifecycle";

// --- Feature vector ---

export interface FeatureVector {
  action: ActionType;
  density: number;
  lineCount: number;
  codeWeight: number;
  pathWeight: number;
  errorWeight: number;
  successWeight: number;
  brevity: number;
  hash: number;
}

// --- Stroke ---

export interface GlyphStroke {
  x1: number; y1: number;
  x2: number; y2: number;
  cx?: number; cy?: number; // quadratic bezier control point
  width: number;
  r: number; g: number; b: number;
  opacity: number;
}

// --- Regex extractors ---

const RE_PATHS = /[\w.\-/]+\.\w{1,5}/g;
const RE_CODE = /\b(function|class|const|let|var|import|export|return|if|else|for|while|async|await|interface|type)\b/g;
const RE_ERROR = /\b(error|fail|exception|reject|crash|panic|fatal|FAIL)\b/gi;
const RE_SUCCESS = /\b(success|pass|complete|done|ok|PASS)\b/gi;
const SEARCH_PATTERNS = /grep|glob|search|find|rg |ripgrep/i;

function countMatches(text: string, re: RegExp): number {
  const m = text.match(re);
  return m ? m.length : 0;
}

// --- djb2 hash ---

function djb2(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

// --- Action classification ---

function classifyAction(m: Memory): ActionType {
  const event = m.metadata?.event as string | undefined;
  if (event === "session_start" || event === "session_end" || event === "session_done") return "lifecycle";
  if (m.message_type === "knowledge" || event === "knowledge_stored" || m.metadata?.file_id) return "store";
  if (m.message_type === "injection" || event === "context_injection") return "communicate";
  if (m.message_type === "user") return "decide";
  if (m.message_type === "tool_call") return SEARCH_PATTERNS.test(m.content) ? "search" : "execute";
  if (m.message_type === "assistant") return "write";
  return "observe";
}

// --- Feature extraction ---

export function extractFeatures(m: Memory): FeatureVector {
  const text = m.content;
  const len = text.length;
  const density = Math.min(len / 2000, 1);
  return {
    action: classifyAction(m),
    density,
    lineCount: Math.min((text.match(/\n/g)?.length ?? 0) / 50, 1),
    codeWeight: Math.min(countMatches(text, RE_CODE) / 20, 1),
    pathWeight: Math.min(countMatches(text, RE_PATHS) / 10, 1),
    errorWeight: Math.min(countMatches(text, RE_ERROR) / 5, 1),
    successWeight: Math.min(countMatches(text, RE_SUCCESS) / 5, 1),
    brevity: 1 - density,
    hash: djb2(text),
  };
}

// --- HSL to RGB ---

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hN = h / 360, sN = s / 100, lN = l / 100;
  const a = sN * Math.min(lN, 1 - lN);
  const f = (n: number) => {
    const k = (n + hN * 12) % 12;
    return lN - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

function lerpHue(a: number, b: number, t: number): number {
  let diff = b - a;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return ((a + diff * t) % 360 + 360) % 360;
}

// --- Stroke template definitions ---
// Coordinates are 0-1 normalized. Each stroke has optional minDensity threshold.

interface StrokeDef {
  x1: number; y1: number;
  x2: number; y2: number;
  cx?: number; cy?: number;
  minDensity?: number; // stroke only appears if density >= this
  thin?: boolean;      // use thinner stroke
}

// Base radicals per action type
// Each is a recognizable character-like shape
const RADICALS: Record<ActionType, StrokeDef[]> = {
  // 三-like: horizontal lines (text output)
  write: [
    { x1: 0.12, y1: 0.25, x2: 0.88, y2: 0.25 },
    { x1: 0.18, y1: 0.52, x2: 0.82, y2: 0.52 },
    { x1: 0.25, y1: 0.78, x2: 0.75, y2: 0.78, minDensity: 0.05 },
  ],
  // 十-like: cross (execution)
  execute: [
    { x1: 0.5, y1: 0.1, x2: 0.5, y2: 0.9 },
    { x1: 0.12, y1: 0.5, x2: 0.88, y2: 0.5 },
    { x1: 0.25, y1: 0.25, x2: 0.75, y2: 0.25, minDensity: 0.3, thin: true },
    { x1: 0.25, y1: 0.75, x2: 0.75, y2: 0.75, minDensity: 0.5, thin: true },
  ],
  // Spiral arcs (scanning)
  search: [
    { x1: 0.75, y1: 0.15, x2: 0.15, y2: 0.5, cx: 0.15, cy: 0.15 },
    { x1: 0.15, y1: 0.5, x2: 0.75, y2: 0.85, cx: 0.15, cy: 0.85 },
    { x1: 0.75, y1: 0.85, x2: 0.85, y2: 0.5, cx: 0.85, cy: 0.85 },
    { x1: 0.45, y1: 0.45, x2: 0.55, y2: 0.55, minDensity: 0 }, // center dot
  ],
  // 目-like: eye (receiving data)
  observe: [
    { x1: 0.12, y1: 0.5, x2: 0.88, y2: 0.5, cx: 0.5, cy: 0.12 }, // top lid
    { x1: 0.12, y1: 0.5, x2: 0.88, y2: 0.5, cx: 0.5, cy: 0.88 }, // bottom lid
    { x1: 0.45, y1: 0.45, x2: 0.55, y2: 0.55 }, // pupil dot
    { x1: 0.25, y1: 0.5, x2: 0.75, y2: 0.5, minDensity: 0.3, thin: true }, // iris line
  ],
  // 从-like: two pillars linked (message passing)
  communicate: [
    { x1: 0.22, y1: 0.15, x2: 0.22, y2: 0.85 },
    { x1: 0.78, y1: 0.15, x2: 0.78, y2: 0.85 },
    { x1: 0.22, y1: 0.38, x2: 0.78, y2: 0.38, cx: 0.5, cy: 0.2 },
    { x1: 0.22, y1: 0.65, x2: 0.78, y2: 0.65, cx: 0.5, cy: 0.82, minDensity: 0.2 },
  ],
  // 人-like: two legs from apex (human steering)
  decide: [
    { x1: 0.5, y1: 0.12, x2: 0.15, y2: 0.88 },
    { x1: 0.5, y1: 0.12, x2: 0.85, y2: 0.88 },
    { x1: 0.3, y1: 0.52, x2: 0.7, y2: 0.52, minDensity: 0.1, thin: true },
  ],
  // 囗-like: container (knowledge storage)
  store: [
    { x1: 0.18, y1: 0.18, x2: 0.82, y2: 0.18 },
    { x1: 0.82, y1: 0.18, x2: 0.82, y2: 0.82 },
    { x1: 0.82, y1: 0.82, x2: 0.18, y2: 0.82 },
    { x1: 0.18, y1: 0.82, x2: 0.18, y2: 0.18 },
    { x1: 0.35, y1: 0.5, x2: 0.65, y2: 0.5, minDensity: 0.15, thin: true },
    { x1: 0.5, y1: 0.32, x2: 0.5, y2: 0.68, minDensity: 0.3, thin: true },
  ],
  // 米-like: starburst (session events)
  lifecycle: [
    { x1: 0.5, y1: 0.1, x2: 0.5, y2: 0.9 },
    { x1: 0.1, y1: 0.5, x2: 0.9, y2: 0.5 },
    { x1: 0.18, y1: 0.18, x2: 0.82, y2: 0.82 },
    { x1: 0.82, y1: 0.18, x2: 0.18, y2: 0.82 },
  ],
};

// Modifier strokes added by content features (independent of action type)
function getModifierStrokes(f: FeatureVector): StrokeDef[] {
  const mods: StrokeDef[] = [];

  // Code keywords: small horizontal ticks on right edge
  if (f.codeWeight > 0.15) {
    mods.push({ x1: 0.82, y1: 0.3, x2: 0.95, y2: 0.3, thin: true });
    if (f.codeWeight > 0.4) {
      mods.push({ x1: 0.82, y1: 0.5, x2: 0.95, y2: 0.5, thin: true });
    }
    if (f.codeWeight > 0.7) {
      mods.push({ x1: 0.82, y1: 0.7, x2: 0.95, y2: 0.7, thin: true });
    }
  }

  // File paths: diagonal tick at bottom-right
  if (f.pathWeight > 0.15) {
    mods.push({ x1: 0.7, y1: 0.88, x2: 0.92, y2: 0.72, thin: true });
  }

  // Errors: X crossing overlay
  if (f.errorWeight > 0.1) {
    mods.push({ x1: 0.2, y1: 0.2, x2: 0.8, y2: 0.8, thin: true });
    mods.push({ x1: 0.8, y1: 0.2, x2: 0.2, y2: 0.8, thin: true });
  }

  // Success: check mark at bottom
  if (f.successWeight > 0.15) {
    mods.push({ x1: 0.3, y1: 0.7, x2: 0.45, y2: 0.85, thin: true });
    mods.push({ x1: 0.45, y1: 0.85, x2: 0.75, y2: 0.55, thin: true });
  }

  // Many lines: dots below
  if (f.lineCount > 0.25) {
    mods.push({ x1: 0.35, y1: 0.93, x2: 0.38, y2: 0.93, thin: true });
    mods.push({ x1: 0.5, y1: 0.93, x2: 0.53, y2: 0.93, thin: true });
    if (f.lineCount > 0.5) {
      mods.push({ x1: 0.65, y1: 0.93, x2: 0.68, y2: 0.93, thin: true });
    }
  }

  return mods;
}

// --- Stroke generation ---

const CANVAS = 64;
const MARGIN = 6;
const ACTIVE = CANVAS - 2 * MARGIN; // 52

function toCanvas(n: number): number {
  return MARGIN + n * ACTIVE;
}

export function generateStrokes(
  features: FeatureVector,
  agentHSL: { h: number; s: number; l: number },
): GlyphStroke[] {
  const { action, density, errorWeight, successWeight, codeWeight, hash } = features;

  // Color: push saturation and lightness up for visibility
  let h = agentHSL.h;
  let s = Math.max(agentHSL.s, 85);
  let l = Math.max(agentHSL.l, 68);

  if (errorWeight > 0.1) {
    h = lerpHue(h, 0, errorWeight * 0.7);
    s = Math.min(100, s + 10);
  }
  if (successWeight > 0.15) {
    h = lerpHue(h, 160, successWeight * 0.35);
  }
  if (action === "store") {
    h = lerpHue(h, 270, 0.25);
  }
  if (action === "search") {
    h = lerpHue(h, 190, 0.3);
  }

  const [baseR, baseG, baseB] = hslToRgb(h, s, l);

  // Modifier color: slightly shifted hue, lower opacity
  let mh = (h + 30) % 360;
  if (errorWeight > 0.1) mh = lerpHue(h, 355, 0.8);
  if (successWeight > 0.15) mh = lerpHue(h, 150, 0.6);
  const [modR, modG, modB] = hslToRgb(mh, Math.min(100, s + 5), Math.min(85, l + 5));

  // Hash-based jitter per stroke (subtle position variation)
  function jitter(strokeIdx: number): number {
    const bits = djb2(`${hash}:${strokeIdx}`);
    return ((bits % 100) / 100 - 0.5) * 3; // +-1.5px
  }

  const strokes: GlyphStroke[] = [];
  const template = RADICALS[action];

  // Base radical strokes
  let idx = 0;
  for (const def of template) {
    if (def.minDensity !== undefined && density < def.minDensity) continue;

    const j = jitter(idx++);
    strokes.push({
      x1: toCanvas(def.x1) + j,
      y1: toCanvas(def.y1) + j * 0.5,
      x2: toCanvas(def.x2) - j,
      y2: toCanvas(def.y2) - j * 0.5,
      cx: def.cx !== undefined ? toCanvas(def.cx) + j * 0.3 : undefined,
      cy: def.cy !== undefined ? toCanvas(def.cy) - j * 0.3 : undefined,
      width: def.thin ? 2.0 : 3.0,
      r: baseR, g: baseG, b: baseB,
      opacity: def.thin ? 0.75 : 1.0,
    });
  }

  // Modifier strokes from content features
  for (const def of getModifierStrokes(features)) {
    const j = jitter(idx++);
    strokes.push({
      x1: toCanvas(def.x1) + j,
      y1: toCanvas(def.y1) + j * 0.3,
      x2: toCanvas(def.x2) - j,
      y2: toCanvas(def.y2) - j * 0.3,
      cx: def.cx !== undefined ? toCanvas(def.cx) : undefined,
      cy: def.cy !== undefined ? toCanvas(def.cy) : undefined,
      width: 2.0,
      r: modR, g: modG, b: modB,
      opacity: 0.6,
    });
  }

  // Density adds weight: thicken all strokes slightly for dense content
  if (density > 0.5) {
    const boost = (density - 0.5) * 1.5;
    for (const s of strokes) {
      s.width += boost;
    }
  }

  return strokes;
}
