/**
 * tileRenderers.ts - Pure render functions for each tile type.
 *
 * Each function draws to an OffscreenCanvas context. Same data = same output.
 * These are extracted from the old SpectaclesView rendering code but operate
 * on individual tiles rather than a monolithic grid.
 */

import type { RenderFn } from "./tile";
import { computeFrame, type Mood as MascotMood } from "../components/mascotCore";

// --- Colors (same palette as the old SpectaclesView) ---
const C = {
  bg: "#0a0a14",
  panelBg: "#0d0d18",
  cardBg: "#151520",
  cardHover: "#1a1a2a",
  accent: "#15D1FF",
  pink: "#e879f9",
  green: "#4ade80",
  orange: "#fbbf24",
  text: "#e6edf3",
  muted: "#cfe8ff",
  border: "#30363d",
  dropActive: "#2a4a5a",
};

const AGENT_PALETTE = [
  "#E64980", "#CC5DE8", "#845EF7", "#5C7CFA",
  "#339AF0", "#22B8CF", "#20C997", "#51CF66",
];

export function agentColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AGENT_PALETTE[Math.abs(hash) % AGENT_PALETTE.length];
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function shortAgent(agent: string): string {
  const slash = agent.indexOf("/");
  return slash > 0 ? agent.slice(slash + 1) : agent;
}

function wrapText(ctx: OffscreenCanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? current + " " + word : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function clearTile(ctx: OffscreenCanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = C.panelBg;
  ctx.fillRect(0, 0, w, h);
}

// --- Text tile: crisp single-line text on solid background ---
// data: { text, font, fontPx, color, bg, align, baseline, padX, padY }
export const renderText: RenderFn = (ctx, w, h, data) => {
  const text = (data.text as string) || "";
  const font = (data.font as string) || "12px system-ui";
  const fontPx = (data.fontPx as number) || 12;
  const color = (data.color as string) || C.text;
  const bg = (data.bg as string) || C.cardBg;
  const align = (data.align as CanvasTextAlign) || "left";
  const baseline = (data.baseline as CanvasTextBaseline) || "alphabetic";
  const padX = (data.padX as number) || 0;
  const padY = (data.padY as number) || 0;

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;

  const x = align === "right" ? (w - padX) : align === "center" ? (w / 2) : padX;
  const y = baseline === "middle" ? (h / 2) : padY + fontPx;
  ctx.fillText(text, x, y);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
};

// --- Memory card background ---
// data: { inContext, bg, border }
export const renderMemBg: RenderFn = (ctx, w, h, data) => {
  const inContext = data.inContext as boolean;
  const bg = (data.bg as string) || (inContext ? "#1a2a2a" : C.cardBg);
  const border = (data.border as string) || (inContext ? C.green : C.border);

  // Fill entire canvas to prevent transparent areas (black = transparent on Spectacles)
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Rounded border
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(2, 2, w - 4, h - 4, 4);
  ctx.stroke();
};

// --- Memory card accent bar ---
// data: { color }
export const renderMemBar: RenderFn = (ctx, w, h, data) => {
  const color = (data.color as string) || C.accent;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, [4, 0, 0, 4]);
  ctx.fill();
};

// --- Text block tile: multi-line wrapped text ---
// data: { text, font, fontPx, color, bg, maxWidth, lineHeight, padX, padY, maxLines }
export const renderTextBlock: RenderFn = (ctx, w, h, data) => {
  const text = (data.text as string) || "";
  const font = (data.font as string) || "12px system-ui";
  const fontPx = (data.fontPx as number) || 12;
  const color = (data.color as string) || C.text;
  const bg = (data.bg as string) || C.cardBg;
  const maxWidth = (data.maxWidth as number) || (w - 8);
  const lineHeight = (data.lineHeight as number) || Math.ceil(fontPx * 1.3);
  const padX = (data.padX as number) || 0;
  const padY = (data.padY as number) || 0;
  const maxLines = (data.maxLines as number) || 3;

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  const lines = wrapText(ctx, text, maxWidth);
  const visible = lines.slice(0, maxLines);
  for (let i = 0; i < visible.length; i++) {
    const y = padY + fontPx + i * lineHeight;
    ctx.fillText(visible[i], padX, y);
  }
};

// --- Context card background ---
// data: { bg, border }
export const renderCtxBg: RenderFn = (ctx, w, h, data) => {
  const bg = (data.bg as string) || C.cardBg;
  const border = (data.border as string) || C.border;

  // Fill entire canvas to prevent transparency
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(2, 2, w - 4, h - 4, 3);
  ctx.stroke();
};

// --- Context card accent bar ---
// data: { color }
export const renderCtxBar: RenderFn = (ctx, w, h, data) => {
  const color = (data.color as string) || C.accent;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
};

// --- Chat bubble background ---
// data: { isUser }
export const renderChatBg: RenderFn = (ctx, w, h, data) => {
  const isUser = data.isUser as boolean;
  // Fill entire canvas to prevent transparency
  ctx.fillStyle = isUser ? "#1a2a3a" : "#1a1a2e";
  ctx.fillRect(0, 0, w, h);
};

// --- Panel background tile: dark container ---
export const renderPanelBg: RenderFn = (ctx, w, h) => {
  // Dark space background
  ctx.fillStyle = "#08080f";
  ctx.fillRect(0, 0, w, h);

  // Subtle rounded inner area
  ctx.fillStyle = "#0c0c18";
  ctx.beginPath();
  ctx.roundRect(8, 8, w - 16, h - 16, 12);
  ctx.fill();

  // Very subtle border
  ctx.strokeStyle = "rgba(21, 209, 255, 0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(8, 8, w - 16, h - 16, 12);
  ctx.stroke();
};

// --- Header tile: logo + room + status ---
// data: { room, channelReady, deviceId, agentCount, activeCount, memoryCount, contextCount }
export const renderHeader: RenderFn = (ctx, w, h, data) => {
  clearTile(ctx, w, h);
  const room = (data.room as string) || "demo";
  const ready = data.channelReady as boolean;
  const device = (data.deviceId as string) || "";
  const agentCount = (data.agentCount as number) || 0;
  const activeCount = (data.activeCount as number) || 0;
  const memCount = (data.memoryCount as number) || 0;
  const ctxCount = (data.contextCount as number) || 0;

  // Logo
  ctx.fillStyle = C.accent;
  ctx.font = "bold 20px system-ui, sans-serif";
  ctx.fillText("Eywa", 8, 24);

  // Room
  ctx.fillStyle = C.muted;
  ctx.font = "11px system-ui";
  ctx.fillText(room, 8, 42);

  // Device
  if (device) {
    ctx.fillStyle = C.pink;
    ctx.font = "bold 9px system-ui";
    ctx.fillText(device, 8, 56);
  }

  // Connection dot
  ctx.fillStyle = ready ? C.green : C.muted;
  ctx.beginPath();
  ctx.arc(w - 16, 20, 5, 0, Math.PI * 2);
  ctx.fill();

  // Status
  ctx.fillStyle = C.muted;
  ctx.font = "8px system-ui";
  ctx.textAlign = "right";
  ctx.fillText(ready ? "LIVE" : "LOCAL", w - 8, 38);
  ctx.textAlign = "left";

  // Divider
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(8, 66);
  ctx.lineTo(w - 8, 66);
  ctx.stroke();

  // Stats
  ctx.fillStyle = C.text;
  ctx.font = "10px system-ui";
  ctx.fillText(`${agentCount} agents (${activeCount} active)`, 8, 82);
  ctx.fillText(`${memCount} memories`, 8, 96);
  ctx.fillText(`${ctxCount} in context`, 8, 110);
};

// --- Agent dot tile: colored dot + short name ---
// data: { name, isActive, memoryCount, isSelected }
export const renderAgentDot: RenderFn = (ctx, w, h, data) => {
  clearTile(ctx, w, h);
  const name = (data.name as string) || "";
  const isActive = data.isActive as boolean;
  const isSelected = data.isSelected as boolean;
  const color = agentColor(name);

  // Selection background
  if (isSelected) {
    ctx.fillStyle = "#1a1a2e";
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 4);
    ctx.fill();
  }

  // Active dot
  ctx.fillStyle = isActive ? C.green : "#93c5fd";
  ctx.beginPath();
  ctx.arc(8, h / 2, 3, 0, Math.PI * 2);
  ctx.fill();

  // Name
  ctx.fillStyle = color;
  ctx.font = isSelected ? "bold 10px system-ui" : "10px system-ui";
  ctx.fillText(shortAgent(name).slice(0, 12), 16, h / 2 + 3);
};

// --- Memory card tile: agent color bar, name, content preview, time ---
// data: { agent, content, ts, inContext }
export const renderMemoryCard: RenderFn = (ctx, w, h, data) => {
  clearTile(ctx, w, h);
  const agent = (data.agent as string) || "";
  const content = (data.content as string) || "";
  const ts = (data.ts as string) || "";
  const inContext = data.inContext as boolean;
  const color = agentColor(agent);

  // Card background
  ctx.fillStyle = inContext ? "#1a2a2a" : C.cardBg;
  ctx.beginPath();
  ctx.roundRect(2, 2, w - 4, h - 4, 4);
  ctx.fill();

  // Border
  ctx.strokeStyle = inContext ? C.green : C.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(2, 2, w - 4, h - 4, 4);
  ctx.stroke();

  // Agent color bar (left edge)
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(2, 2, 3, h - 4, [4, 0, 0, 4]);
  ctx.fill();

  // Agent name
  ctx.fillStyle = color;
  ctx.font = "bold 9px system-ui";
  ctx.fillText(shortAgent(agent).slice(0, 14), 10, 14);

  // Time
  if (ts) {
    ctx.fillStyle = C.muted;
    ctx.font = "8px system-ui";
    ctx.textAlign = "right";
    ctx.fillText(timeAgo(ts), w - 6, 14);
    ctx.textAlign = "left";
  }

  // Content preview (high contrast for Spectacles readability)
  ctx.fillStyle = "#e6edf3";
  ctx.font = "9px system-ui";
  const maxChars = Math.floor((w - 20) / 4.5);
  ctx.fillText(content.slice(0, maxChars), 10, 30);

  // Context indicator
  if (inContext) {
    ctx.fillStyle = C.green;
    ctx.font = "bold 11px system-ui";
    ctx.textAlign = "right";
    ctx.fillText("\u2713", w - 6, 30);
    ctx.textAlign = "left";
  }
};

// --- Context card tile: compact, with x button ---
// data: { agent, content }
export const renderContextCard: RenderFn = (ctx, w, h, data) => {
  clearTile(ctx, w, h);
  const agent = (data.agent as string) || "";
  const content = (data.content as string) || "";
  const color = agentColor(agent);

  // Card background
  ctx.fillStyle = C.cardBg;
  ctx.beginPath();
  ctx.roundRect(2, 2, w - 4, h - 4, 3);
  ctx.fill();

  // Color bar
  ctx.fillStyle = color;
  ctx.fillRect(2, 4, 2, h - 8);

  // Agent name
  ctx.fillStyle = color;
  ctx.font = "bold 9px system-ui";
  ctx.fillText(shortAgent(agent).slice(0, 10), 8, 14);

  // Content
  ctx.fillStyle = C.text;
  ctx.font = "8px system-ui";
  const maxChars = Math.floor((w - 30) / 4);
  ctx.fillText(content.slice(0, maxChars), 8, 28);

  // Remove button
  ctx.fillStyle = C.muted;
  ctx.font = "10px system-ui";
  ctx.textAlign = "right";
  ctx.fillText("\u00D7", w - 6, 18);
  ctx.textAlign = "left";
};

// --- Prompt button tile: icon circle + label ---
// data: { label, icon, color, disabled, loading }
export const renderPromptBtn: RenderFn = (ctx, w, h, data) => {
  clearTile(ctx, w, h);
  const label = (data.label as string) || "";
  const icon = (data.icon as string) || "";
  const color = (data.color as string) || C.accent;
  const disabled = data.disabled as boolean;
  const loading = data.loading as boolean;

  // Button background
  ctx.fillStyle = C.cardBg;
  ctx.beginPath();
  ctx.roundRect(2, 2, w - 4, h - 4, 6);
  ctx.fill();

  // Border
  ctx.strokeStyle = disabled ? "#222" : C.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(2, 2, w - 4, h - 4, 6);
  ctx.stroke();

  // Icon circle
  const iconR = 10;
  const iconX = 18;
  const iconY = h / 2;
  ctx.fillStyle = disabled ? "#1f2937" : color;
  ctx.beginPath();
  ctx.arc(iconX, iconY, iconR, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = disabled ? C.text : "#0b1220";
  ctx.font = "bold 12px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(loading ? "..." : icon, iconX, iconY + 4);
  ctx.textAlign = "left";

  // Label
  ctx.fillStyle = disabled ? C.text : C.text;
  ctx.font = "bold 11px system-ui";
  ctx.fillText(label, 34, h / 2 + 4);

  // Disabled overlay
  if (disabled) {
    ctx.fillStyle = "rgba(10, 10, 20, 0.5)";
    ctx.fillRect(0, 0, w, h);
  }
};

// --- Chat bubble tile: role indicator + word-wrapped text ---
// data: { role, content }
export const renderChatBubble: RenderFn = (ctx, w, h, data) => {
  clearTile(ctx, w, h);
  const role = (data.role as string) || "model";
  const content = (data.content as string) || "";
  const isUser = role === "user";

  // Bubble background
  ctx.fillStyle = isUser ? "#1a2a3a" : "#1a1a2e";
  ctx.beginPath();
  ctx.roundRect(2, 2, w - 4, h - 4, 6);
  ctx.fill();

  // Role label
  ctx.fillStyle = isUser ? C.accent : C.pink;
  ctx.font = "bold 9px system-ui";
  ctx.fillText(isUser ? "You" : "Gemini", 8, 14);

  // Content (word-wrapped)
  ctx.fillStyle = C.text;
  ctx.font = "9px system-ui";
  const lines = wrapText(ctx, content, w - 16);
  const lineH = 12;
  lines.slice(0, Math.floor((h - 22) / lineH)).forEach((line, i) => {
    ctx.fillText(line, 8, 26 + i * lineH);
  });
};

// --- Page nav tile: < page N/M > ---
// data: { page, totalPages }
export const renderPageNav: RenderFn = (ctx, w, h, data) => {
  clearTile(ctx, w, h);
  const page = (data.page as number) || 0;
  const total = (data.totalPages as number) || 1;

  ctx.fillStyle = C.muted;
  ctx.font = "10px system-ui";
  ctx.textAlign = "center";

  // Prev arrow
  if (page > 0) {
    ctx.fillStyle = C.accent;
    ctx.fillText("\u25C0", 20, h / 2 + 4);
  }

  // Page indicator
  ctx.fillStyle = C.text;
  ctx.font = "bold 10px system-ui";
  ctx.fillText(`${page + 1} / ${total}`, w / 2, h / 2 + 4);

  // Next arrow
  if (page < total - 1) {
    ctx.fillStyle = C.accent;
    ctx.font = "10px system-ui";
    ctx.fillText("\u25B6", w - 20, h / 2 + 4);
  }

  ctx.textAlign = "left";
};

// --- Mic indicator tile ---
// data: { isListening }
export const renderMic: RenderFn = (ctx, w, h, data) => {
  clearTile(ctx, w, h);
  const listening = data.isListening as boolean;

  if (!listening) return; // invisible when not listening

  // Red dot
  ctx.fillStyle = "#f87171";
  ctx.beginPath();
  ctx.arc(10, h / 2, 4, 0, Math.PI * 2);
  ctx.fill();

  // Label
  ctx.fillStyle = "#f87171";
  ctx.font = "bold 9px system-ui";
  ctx.fillText("MIC", 20, h / 2 + 3);
};

// --- Voice transcript tile ---
// data: { transcript }
export const renderTranscript: RenderFn = (ctx, w, h, data) => {
  clearTile(ctx, w, h);
  const transcript = (data.transcript as string) || "";

  if (!transcript) return;

  // Background pill
  ctx.fillStyle = "rgba(248, 113, 113, 0.1)";
  ctx.beginPath();
  ctx.roundRect(2, 2, w - 4, h - 4, 4);
  ctx.fill();
  ctx.strokeStyle = "#f87171";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(2, 2, w - 4, h - 4, 4);
  ctx.stroke();

  // Text
  ctx.fillStyle = "#f87171";
  ctx.font = "9px system-ui";
  ctx.fillText(transcript.slice(0, 35), 6, h / 2 + 3);
};

// --- Chat loading indicator ---
// data: { dotPhase }
export const renderChatLoading: RenderFn = (ctx, w, h, data) => {
  clearTile(ctx, w, h);
  const phase = (data.dotPhase as number) || 0;

  ctx.fillStyle = "#1a1a2e";
  ctx.beginPath();
  ctx.roundRect(2, 2, w - 4, h - 4, 6);
  ctx.fill();

  ctx.fillStyle = C.accent;
  ctx.font = "11px system-ui";
  ctx.fillText("Thinking", 8, h / 2 + 4);

  const dots = ".".repeat((phase % 3) + 1);
  ctx.fillText(dots, 68, h / 2 + 4);
};

// --- Chat empty state ---
export const renderChatEmpty: RenderFn = (ctx, w, h) => {
  clearTile(ctx, w, h);
  ctx.fillStyle = C.muted;
  ctx.font = "10px system-ui";
  ctx.textAlign = "center";
  ctx.fillText("Ask a question or", w / 2, h / 2 - 6);
  ctx.fillText("use a quick prompt", w / 2, h / 2 + 10);
  ctx.textAlign = "left";
};

// --- Context empty state ---
export const renderContextEmpty: RenderFn = (ctx, w, h) => {
  clearTile(ctx, w, h);
  ctx.fillStyle = C.muted;
  ctx.font = "10px system-ui";
  ctx.textAlign = "center";
  ctx.fillText("Pinch a memory", w / 2, h / 2 - 6);
  ctx.fillText("to add it here", w / 2, h / 2 + 10);
  ctx.textAlign = "left";
};

// --- Context section header ---
// data: { count }
export const renderContextHeader: RenderFn = (ctx, w, h, data) => {
  clearTile(ctx, w, h);
  const count = (data.count as number) || 0;

  ctx.fillStyle = C.muted;
  ctx.font = "bold 10px system-ui, sans-serif";
  ctx.fillText("CONTEXT", 4, h / 2 + 3);

  if (count > 0) {
    ctx.fillStyle = C.accent;
    ctx.font = "9px system-ui";
    ctx.textAlign = "right";
    ctx.fillText(`${count} items`, w - 4, h / 2 + 3);
    ctx.textAlign = "left";
  }
};

// --- Memories section header ---
export const renderMemoriesHeader: RenderFn = (ctx, w, h) => {
  clearTile(ctx, w, h);
  ctx.fillStyle = C.muted;
  ctx.font = "bold 10px system-ui, sans-serif";
  ctx.fillText("MEMORIES", 4, h / 2 + 3);
};

// --- Hover glow tile: highlight overlay ---
export const renderHoverGlow: RenderFn = (ctx, w, h) => {
  // Fill with near-black (not pure black, to avoid full transparency on Spectacles)
  ctx.fillStyle = "#080810";
  ctx.fillRect(0, 0, w, h);
  // Glow fill
  ctx.fillStyle = "rgba(21, 209, 255, 0.12)";
  ctx.beginPath();
  ctx.roundRect(2, 2, w - 4, h - 4, 6);
  ctx.fill();
  ctx.strokeStyle = "rgba(21, 209, 255, 0.5)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(2, 2, w - 4, h - 4, 6);
  ctx.stroke();
};

// --- Mascot tile: pixel art jellyfish from mascotCore ---
// data: { mood, time, blinking, bg }
export const renderMascot: RenderFn = (ctx, w, h, data) => {
  const mood = (data.mood as string as MascotMood) || "okay";
  const time = (data.time as number) || 0;
  const blinking = (data.blinking as boolean) || false;
  const bg = (data.bg as string) || "#0c0c18";

  // Fill background (non-black)
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Compute mascot frame (32x32 grid)
  const pixels = computeFrame(time, mood, blinking);
  const cellW = w / 32;
  const cellH = h / 32;

  for (const { x, y, color } of pixels) {
    ctx.fillStyle = color;
    ctx.fillRect(
      Math.floor(x * cellW),
      Math.floor(y * cellH),
      Math.ceil(cellW),
      Math.ceil(cellH)
    );
  }
};

// --- Spacetime Map: Alcubierre-warped grid with agents as curvature sources ---
// Adapted from Curvilinear WarpGrid for dark aurora theme.
// Agents bend the grid. Destination pulls everything toward center.
// Sub-agent spawning = spanning tree branches. Flowing dashes scroll spacetime.
//
// data: {
//   agents: Array<{ name, isActive, systems, opCount, curvature, x, y, parentIdx? }>,
//   edges: Array<{ from, to, type }>,
//   destination: string,
//   progress: number (0-100),
//   milestones: Array<{ text, done }>,
//   flowOffset: number (continuous, advances each frame),
//   room: string,
// }

// Alcubierre shape function (from Curvilinear)
function alcubierre(r: number, R: number, sig: number): number {
  const denom = 2 * Math.tanh(sig * R);
  if (denom < 0.001) return 0;
  return (Math.tanh(sig * (r + R)) - Math.tanh(sig * (r - R))) / denom;
}

// Reusable point buffers for smooth curve drawing
const _ptsX = new Float64Array(512);
const _ptsY = new Float64Array(512);

function drawSmooth(
  ctx: OffscreenCanvasRenderingContext2D,
  n: number,
) {
  if (n < 2) return;
  ctx.beginPath();
  ctx.moveTo(_ptsX[0], _ptsY[0]);
  if (n === 2) {
    ctx.lineTo(_ptsX[1], _ptsY[1]);
  } else {
    for (let i = 1; i < n - 1; i++) {
      const xc = (_ptsX[i] + _ptsX[i + 1]) * 0.5;
      const yc = (_ptsY[i] + _ptsY[i + 1]) * 0.5;
      ctx.quadraticCurveTo(_ptsX[i], _ptsY[i], xc, yc);
    }
    ctx.lineTo(_ptsX[n - 1], _ptsY[n - 1]);
  }
  ctx.stroke();
}

export const renderAgentMap: RenderFn = (ctx, w, h, data) => {
  const agents = (data.agents as Array<Record<string, unknown>>) || [];
  const edges = (data.edges as Array<Record<string, unknown>>) || [];
  const destination = (data.destination as string) || "";
  const progress = (data.progress as number) || 0;
  const milestones = (data.milestones as Array<Record<string, unknown>>) || [];
  const flowOffset = (data.flowOffset as number) || 0;
  const room = (data.room as string) || "";

  const cw = w;
  const ch = h;
  const cx = cw / 2;
  const cy = ch / 2;

  // --- Background ---
  ctx.fillStyle = "#050510";
  ctx.fillRect(0, 0, cw, ch);

  // --- Build warp sources from agents + destination ---
  interface WarpSource { x: number; y: number; strength: number; bubbleR: number }
  const sources: WarpSource[] = [];

  // Destination: strongest warp source at center
  const destBubbleR = Math.min(cw, ch) * 0.12;
  sources.push({ x: cx, y: cy, strength: 0.8, bubbleR: destBubbleR });

  // Agents as warp sources (strength proportional to curvature)
  for (const agent of agents) {
    const ax = (agent.x as number) ?? cx;
    const ay = (agent.y as number) ?? cy;
    const kappa = Math.abs((agent.curvature as number) || 0);
    const isActive = agent.isActive as boolean;
    if (isActive && kappa > 0) {
      sources.push({
        x: ax, y: ay,
        strength: Math.min(kappa / 4, 0.6),
        bubbleR: Math.min(cw, ch) * 0.06,
      });
    }
  }

  // Warp displacement function
  const spacing = Math.max(24, Math.min(40, cw / 18));
  const ambientScale = spacing * 1.0;
  const maxDisp = spacing * 1.0;

  const warp = (x: number, y: number): [number, number] => {
    let tx = 0;
    for (const src of sources) {
      const dx = x - src.x;
      const dy = y - src.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) continue;
      const sig = 6.0 / src.bubbleR;
      const f = alcubierre(dist, src.bubbleR, sig);
      const softCore = 60;
      const soft = dist * dist / (dist * dist + softCore * softCore);
      tx += -ambientScale * 0.6 * src.strength * f * soft;
    }
    if (tx > maxDisp) tx = maxDisp;
    else if (tx < -maxDisp) tx = -maxDisp;
    return [x + tx, y];
  };

  // --- Draw warped grid ---
  const pad = 10;
  const step = 6;
  const gridExtend = spacing * 2;
  const gridAlpha = 0.12;

  ctx.lineWidth = 0.6;
  ctx.strokeStyle = `rgba(21, 209, 255, ${gridAlpha})`;

  // Horizontal lines (flow with flowOffset)
  for (let gy = pad; gy <= ch - pad; gy += spacing) {
    let n = 0;
    for (let gx = pad - gridExtend; gx <= cw - pad + gridExtend; gx += step) {
      const flowedX = gx + (flowOffset % spacing);
      const [wx, wy] = warp(flowedX, gy);
      _ptsX[n] = wx; _ptsY[n] = wy; n++;
      if (n >= 510) break;
    }
    drawSmooth(ctx, n);
  }

  // Vertical lines (flow with flowOffset)
  for (let gx = pad - gridExtend; gx <= cw - pad + gridExtend; gx += spacing) {
    let n = 0;
    for (let gy = pad; gy <= ch - pad; gy += step) {
      const flowedX = gx + (flowOffset % spacing);
      const [wx, wy] = warp(flowedX, gy);
      _ptsX[n] = wx; _ptsY[n] = wy; n++;
      if (n >= 510) break;
    }
    drawSmooth(ctx, n);
  }

  // --- Edge fade (aurora-tinted) ---
  const fadeW = 18;
  const lG = ctx.createLinearGradient(0, 0, fadeW, 0);
  lG.addColorStop(0, "rgba(5, 5, 16, 1)"); lG.addColorStop(1, "rgba(5, 5, 16, 0)");
  ctx.fillStyle = lG; ctx.fillRect(0, 0, fadeW, ch);
  const rG = ctx.createLinearGradient(cw - fadeW, 0, cw, 0);
  rG.addColorStop(0, "rgba(5, 5, 16, 0)"); rG.addColorStop(1, "rgba(5, 5, 16, 1)");
  ctx.fillStyle = rG; ctx.fillRect(cw - fadeW, 0, fadeW, ch);
  const tG = ctx.createLinearGradient(0, 0, 0, fadeW);
  tG.addColorStop(0, "rgba(5, 5, 16, 1)"); tG.addColorStop(1, "rgba(5, 5, 16, 0)");
  ctx.fillStyle = tG; ctx.fillRect(0, 0, cw, fadeW);
  const bG = ctx.createLinearGradient(0, ch - fadeW, 0, ch);
  bG.addColorStop(0, "rgba(5, 5, 16, 0)"); bG.addColorStop(1, "rgba(5, 5, 16, 1)");
  ctx.fillStyle = bG; ctx.fillRect(0, ch - fadeW, cw, fadeW);

  // --- Room label ---
  ctx.fillStyle = "#6b7280";
  ctx.font = "8px system-ui";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(`/${room}`, 20, 20);
  const activeCount = agents.filter(a => a.isActive).length;
  ctx.textAlign = "right";
  ctx.fillText(`${agents.length} agents (${activeCount} active)`, cw - 20, 20);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  // --- Edges: spanning tree connections + shared-system links ---
  // Draw warped curves between connected agents
  for (const edge of edges) {
    const fi = edge.from as number;
    const ti = edge.to as number;
    if (fi >= agents.length || ti >= agents.length) continue;
    const fromA = agents[fi];
    const toA = agents[ti];
    const fx = (fromA.x as number) ?? cx;
    const fy = (fromA.y as number) ?? cy;
    const tx = (toA.x as number) ?? cx;
    const ty = (toA.y as number) ?? cy;
    const edgeType = (edge.type as string) || "system";

    // Draw warped curve between the two agents
    const segs = 16;
    let n = 0;
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const rawX = fx + (tx - fx) * t;
      const rawY = fy + (ty - fy) * t;
      const [wx, wy] = warp(rawX, rawY);
      _ptsX[n] = wx; _ptsY[n] = wy; n++;
    }

    if (edgeType === "spawn") {
      // Sub-agent spawn: solid line, aurora pink
      ctx.strokeStyle = "rgba(232, 121, 249, 0.25)";
      ctx.lineWidth = 1.2;
    } else {
      // Shared system: dashed, subtle
      ctx.strokeStyle = "rgba(21, 209, 255, 0.08)";
      ctx.lineWidth = 0.6;
      ctx.setLineDash([3, 4]);
    }
    drawSmooth(ctx, n);
    ctx.setLineDash([]);

    // Flow particles along spawn edges
    if (edgeType === "spawn") {
      for (let p = 0; p < 2; p++) {
        const t = ((flowOffset * 0.01 + p * 0.5 + fi * 0.1) % 1);
        const [px, py] = warp(fx + (tx - fx) * t, fy + (ty - fy) * t);
        const alpha = Math.sin(t * Math.PI) * 0.5;
        ctx.fillStyle = `rgba(232, 121, 249, ${alpha})`;
        ctx.beginPath();
        ctx.arc(px, py, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // --- Agent paths toward destination (warped curves) ---
  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    const ax = (agent.x as number) ?? cx;
    const ay = (agent.y as number) ?? cy;
    const isActive = agent.isActive as boolean;

    // Warped curve from agent to destination center
    const segs = 20;
    let n = 0;
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const rawX = ax + (cx - ax) * t;
      const rawY = ay + (cy - ay) * t;
      const [wx, wy] = warp(rawX, rawY);
      _ptsX[n] = wx; _ptsY[n] = wy; n++;
    }

    ctx.strokeStyle = isActive
      ? `rgba(74, 222, 128, 0.15)`
      : "rgba(139, 148, 158, 0.04)";
    ctx.lineWidth = isActive ? 1.0 : 0.4;
    drawSmooth(ctx, n);

    // Flow particles toward destination (active agents only)
    if (isActive) {
      for (let p = 0; p < 3; p++) {
        const t = ((flowOffset * 0.008 + p / 3 + i * 0.13) % 1);
        const rawX = ax + (cx - ax) * t;
        const rawY = ay + (cy - ay) * t;
        const [px, py] = warp(rawX, rawY);
        const alpha = Math.sin(t * Math.PI) * 0.5;
        ctx.fillStyle = `rgba(74, 222, 128, ${alpha})`;
        ctx.beginPath();
        ctx.arc(px, py, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // --- Destination node at center ---
  const destR = 22;
  const [destWx, destWy] = warp(cx, cy);

  // Progress ring
  if (progress > 0) {
    ctx.strokeStyle = "rgba(74, 222, 128, 0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(destWx, destWy, destR + 6, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = "#4ade80";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(destWx, destWy, destR + 6, -Math.PI / 2, -Math.PI / 2 + (progress / 100) * Math.PI * 2);
    ctx.stroke();
    ctx.lineCap = "butt";
  }

  // Milestone dots
  if (milestones.length > 0) {
    const msR = destR + 14;
    const msStep = (Math.PI * 2) / milestones.length;
    for (let i = 0; i < milestones.length; i++) {
      const ms = milestones[i];
      const angle = -Math.PI / 2 + i * msStep;
      ctx.fillStyle = ms.done ? "#4ade80" : "#30363d";
      ctx.beginPath();
      ctx.arc(destWx + Math.cos(angle) * msR, destWy + Math.sin(angle) * msR, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Destination glow
  const destGlow = ctx.createRadialGradient(destWx, destWy, 0, destWx, destWy, destR * 3);
  destGlow.addColorStop(0, "rgba(21, 209, 255, 0.2)");
  destGlow.addColorStop(0.4, "rgba(21, 209, 255, 0.05)");
  destGlow.addColorStop(1, "rgba(21, 209, 255, 0)");
  ctx.fillStyle = destGlow;
  ctx.beginPath();
  ctx.arc(destWx, destWy, destR * 3, 0, Math.PI * 2);
  ctx.fill();

  // Destination circle
  ctx.fillStyle = "#15D1FF";
  ctx.beginPath();
  ctx.arc(destWx, destWy, destR, 0, Math.PI * 2);
  ctx.fill();

  // Destination label
  ctx.fillStyle = "#0b1220";
  ctx.font = "bold 10px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(destination ? `${progress}%` : "?", destWx, destWy);
  ctx.textBaseline = "alphabetic";

  // Destination text below
  if (destination) {
    ctx.fillStyle = "rgba(21, 209, 255, 0.7)";
    ctx.font = "8px system-ui";
    const text = destination.length > 45 ? destination.slice(0, 42) + "..." : destination;
    ctx.fillText(text, destWx, destWy + destR + 14);
  }
  ctx.textAlign = "left";

  // --- Agent nodes ---
  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    const rawX = (agent.x as number) ?? cx;
    const rawY = (agent.y as number) ?? cy;
    const [ax, ay] = warp(rawX, rawY);
    const isActive = agent.isActive as boolean;
    const kappa = (agent.curvature as number) || 0;
    const opCount = (agent.opCount as number) || 0;
    const color = agentColor(agent.name as string);
    const nodeR = isActive ? (5 + Math.min(opCount, 6)) : 4;

    // Curvature glow
    if (kappa !== 0) {
      const glowRGB = kappa > 0 ? "74, 222, 128" : "248, 113, 113";
      const intensity = Math.min(Math.abs(kappa) / 4, 0.35);
      const aGlow = ctx.createRadialGradient(ax, ay, 0, ax, ay, nodeR * 3);
      aGlow.addColorStop(0, `rgba(${glowRGB}, ${intensity})`);
      aGlow.addColorStop(1, `rgba(${glowRGB}, 0)`);
      ctx.fillStyle = aGlow;
      ctx.beginPath();
      ctx.arc(ax, ay, nodeR * 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Node
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(ax, ay, nodeR, 0, Math.PI * 2);
    ctx.fill();

    // Active ring
    if (isActive) {
      ctx.strokeStyle = "#4ade80";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(ax, ay, nodeR + 2, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Name
    ctx.fillStyle = isActive ? "#e6edf3" : "#6b7280";
    ctx.font = isActive ? "bold 7px system-ui" : "7px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(shortAgent(agent.name as string), ax, ay + nodeR + 9);

    // Curvature label
    if (kappa !== 0) {
      ctx.fillStyle = kappa > 0 ? "#4ade80" : "#f87171";
      ctx.font = "bold 6px system-ui";
      ctx.fillText(`\u03BA=${kappa}`, ax, ay + nodeR + 17);
    }

    ctx.textAlign = "left";
  }

  // --- Bottom status ---
  const done = milestones.filter(m => m.done).length;
  const total = milestones.length;
  ctx.fillStyle = "#4b5563";
  ctx.font = "7px system-ui";
  ctx.textAlign = "center";
  if (total > 0) {
    ctx.fillText(`${done}/${total} milestones`, cx, ch - 14);
  }
  if (!destination) {
    ctx.fillText("No destination set", cx, ch - 14);
  }
  ctx.textAlign = "left";
};

// --- Navigator Map: 2D semantic layout from Guild Navigator API ---
// data: { nodes, trajectory, agents, flowOffset, room }
export const renderNavigatorMap: RenderFn = (ctx, w, h, data) => {
  const nodes = (data.nodes as Array<Record<string, unknown>>) || [];
  const trajectory = (data.trajectory as Array<Record<string, unknown>>) || [];
  const agents = (data.agents as string[]) || [];

  const cx = w / 2;
  const cy = h / 2;
  const pad = 16;
  const scale = Math.min(cx, cy) - pad;

  // Background
  ctx.fillStyle = "#080a08";
  ctx.fillRect(0, 0, w, h);

  if (nodes.length === 0) {
    ctx.fillStyle = "rgba(0, 210, 110, 0.4)";
    ctx.font = `${Math.max(8, w / 30)}px system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Syncing map data...", cx, cy);
    return;
  }

  // Coordinate transform: data coords roughly [-1, 1] to screen
  const toP = (nx: number, ny: number): [number, number] => [
    cx + nx * scale * 0.85,
    cy - ny * scale * 0.85,
  ];

  // Grid
  const spacing = Math.max(28, Math.min(48, w / 22));
  ctx.strokeStyle = "rgba(0, 220, 100, 0.07)";
  ctx.lineWidth = 0.8;
  for (let y = pad; y <= h - pad; y += spacing) {
    ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(w - pad, y); ctx.stroke();
  }
  for (let x = pad; x <= w - pad; x += spacing) {
    ctx.beginPath(); ctx.moveTo(x, pad); ctx.lineTo(x, h - pad); ctx.stroke();
  }

  // Find goal node for radial rings
  const goalNode = nodes.find(n => (n.type as string) === "goal");
  if (goalNode && typeof goalNode.x === "number") {
    const [gx, gy] = toP(goalNode.x as number, goalNode.y as number);
    ctx.lineWidth = 0.8;
    for (let r = 0.2; r <= 1.0; r += 0.2) {
      ctx.strokeStyle = `rgba(0, 180, 90, ${r < 0.95 ? 0.1 : 0.18})`;
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.arc(gx, gy, r * scale * 0.85, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // Ring labels with units
    const ringFontSize = Math.max(7, Math.min(10, w / 35));
    ctx.font = `500 ${ringFontSize}px system-ui`;
    ctx.fillStyle = "rgba(0, 210, 110, 0.35)";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    for (let r = 0.2; r <= 1.0; r += 0.2) {
      const label = r >= 0.95 ? "1 kh" : `${(r * 10).toFixed(0)} rd`;
      ctx.fillText(label, gx + r * scale * 0.85 + 4, gy - 4);
    }
  }

  // Pre-compute pixel positions
  const posMap = new Map<string, [number, number]>();
  for (const n of nodes) {
    if (typeof n.x === "number" && typeof n.y === "number") {
      posMap.set(n.id as string, toP(n.x as number, n.y as number));
    }
  }

  // Draw trajectory edges (agent-colored, curvature-weighted)
  const agentTrajs = new Map<string, Array<Record<string, unknown>>>();
  for (const t of trajectory) {
    const a = t.agent as string;
    const list = agentTrajs.get(a) || [];
    list.push(t);
    agentTrajs.set(a, list);
  }
  let maxCurv = 0;
  for (const t of trajectory) {
    const c = (t.curvature as number) || 0;
    if (c > maxCurv) maxCurv = c;
  }
  for (const [agent, trajs] of agentTrajs) {
    const color = agentColor(agent);
    const r = hexR(color), g = hexG(color), b = hexB(color);
    for (const t of trajs) {
      const from = posMap.get(t.from as string);
      const to = posMap.get(t.to as string);
      if (!from || !to) continue;
      const curv = (t.curvature as number) || 0;
      const normCurv = maxCurv > 0 ? curv / maxCurv : 0;
      const lineW = 1.5 + normCurv * 2;
      ctx.lineWidth = lineW;
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${0.5 + normCurv * 0.25})`;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(from[0], from[1]);
      ctx.lineTo(to[0], to[1]);
      ctx.stroke();
      // Arrowhead at midpoint showing direction
      const edx = to[0] - from[0], edy = to[1] - from[1];
      const elen = Math.sqrt(edx * edx + edy * edy);
      if (elen > 16) {
        const mx = (from[0] + to[0]) / 2, my = (from[1] + to[1]) / 2;
        const ux = edx / elen, uy = edy / elen;
        const arrowSize = Math.min(5, elen * 0.15);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.55 + normCurv * 0.2})`;
        ctx.beginPath();
        ctx.moveTo(mx + ux * arrowSize, my + uy * arrowSize);
        ctx.lineTo(mx - ux * arrowSize * 0.6 + uy * arrowSize * 0.5, my - uy * arrowSize * 0.6 - ux * arrowSize * 0.5);
        ctx.lineTo(mx - ux * arrowSize * 0.6 - uy * arrowSize * 0.5, my - uy * arrowSize * 0.6 + ux * arrowSize * 0.5);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
  ctx.setLineDash([]);

  // Draw action dots (agent-colored, small filled circles + glow)
  for (const n of nodes) {
    const type = n.type as string;
    if (type !== "action") continue;
    const pos = posMap.get(n.id as string);
    if (!pos) continue;
    const agent = (n.agent as string) || "";
    const color = agent ? agentColor(agent) : "#4ade80";
    const r = hexR(color), g = hexG(color), b = hexB(color);
    // Glow
    const glow = ctx.createRadialGradient(pos[0], pos[1], 2.5, pos[0], pos[1], 20);
    glow.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.12)`);
    glow.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(pos[0], pos[1], 20, 0, Math.PI * 2);
    ctx.fill();
    // Dot
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.9)`;
    ctx.beginPath();
    ctx.arc(pos[0], pos[1], 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 1.0)`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Draw state dots (ring outline, darker fill)
  for (const n of nodes) {
    const type = n.type as string;
    if (type !== "state") continue;
    const pos = posMap.get(n.id as string);
    if (!pos) continue;
    const agent = (n.agent as string) || "";
    const color = agent ? agentColor(agent) : "#fbbf24";
    const r = hexR(color), g = hexG(color), b = hexB(color);
    ctx.fillStyle = "rgba(10, 14, 10, 0.9)";
    ctx.beginPath();
    ctx.arc(pos[0], pos[1], 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.8)`;
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }

  // Draw source nodes (agent-colored, label top N)
  const srcNodes = nodes.filter(n => (n.type as string) === "source");
  const srcSorted = [...srcNodes].sort((a, b) => {
    const da = Math.sqrt((a.x as number) ** 2 + (a.y as number) ** 2);
    const db = Math.sqrt((b.x as number) ** 2 + (b.y as number) ** 2);
    return db - da;
  });
  const labelSet = new Set(srcSorted.slice(0, 8).map(n => n.id as string));
  const fontSize = Math.max(7, Math.min(10, w / 30));

  for (const n of srcNodes) {
    const pos = posMap.get(n.id as string);
    if (!pos) continue;
    const idx = parseInt((n.id as string).replace("source-", ""));
    const name = agents[idx] || (n.label as string) || "";
    const color = agentColor(name);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(pos[0], pos[1], 6, 0, Math.PI * 2);
    ctx.fill();
    if (labelSet.has(n.id as string)) {
      const short = name.includes("/") ? name.split("/").pop()! : name;
      ctx.fillStyle = "rgba(0, 210, 110, 0.6)";
      ctx.font = `${fontSize}px system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(short.replace(" (active)", ""), pos[0], pos[1] + 8);
    }
  }

  // Draw goal nodes (4-point star + glow)
  for (const n of nodes) {
    if ((n.type as string) !== "goal") continue;
    const pos = posMap.get(n.id as string);
    if (!pos) continue;
    const sz = 18;
    // Glow
    const glow = ctx.createRadialGradient(pos[0], pos[1], 0, pos[0], pos[1], sz * 2.5);
    glow.addColorStop(0, "rgba(0, 255, 200, 0.25)");
    glow.addColorStop(0.5, "rgba(0, 220, 170, 0.06)");
    glow.addColorStop(1, "rgba(0, 180, 140, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(pos[0], pos[1], sz * 2.5, 0, Math.PI * 2);
    ctx.fill();
    // Star shape
    ctx.save();
    ctx.translate(pos[0], pos[1]);
    const outerV = sz, outerH = sz * 0.6, pinch = sz * 0.08;
    ctx.beginPath();
    ctx.moveTo(0, -outerV);
    ctx.quadraticCurveTo(pinch, -pinch, outerH, 0);
    ctx.quadraticCurveTo(pinch, pinch, 0, outerV);
    ctx.quadraticCurveTo(-pinch, pinch, -outerH, 0);
    ctx.quadraticCurveTo(-pinch, -pinch, 0, -outerV);
    ctx.closePath();
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, sz);
    grad.addColorStop(0, "rgba(0, 255, 200, 0.6)");
    grad.addColorStop(0.35, "rgba(0, 220, 170, 0.3)");
    grad.addColorStop(1, "rgba(0, 180, 140, 0.06)");
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();
    // Label
    const label = (n.label as string) || "";
    ctx.fillStyle = "rgba(0, 210, 110, 0.8)";
    ctx.font = `bold ${Math.max(8, fontSize)}px system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(
      label.length > 20 ? label.slice(0, 18) + ".." : label,
      pos[0], pos[1] + sz + 4,
    );
  }

  // Edge fades (vignette)
  const fadeW = Math.max(12, w / 40);
  const bgC = "8, 10, 8";
  const lG = ctx.createLinearGradient(0, 0, fadeW, 0);
  lG.addColorStop(0, `rgba(${bgC}, 0.8)`); lG.addColorStop(1, `rgba(${bgC}, 0)`);
  ctx.fillStyle = lG; ctx.fillRect(0, 0, fadeW, h);
  const rG = ctx.createLinearGradient(w - fadeW, 0, w, 0);
  rG.addColorStop(0, `rgba(${bgC}, 0)`); rG.addColorStop(1, `rgba(${bgC}, 0.8)`);
  ctx.fillStyle = rG; ctx.fillRect(w - fadeW, 0, fadeW, h);
  const tG = ctx.createLinearGradient(0, 0, 0, fadeW);
  tG.addColorStop(0, `rgba(${bgC}, 0.8)`); tG.addColorStop(1, `rgba(${bgC}, 0)`);
  ctx.fillStyle = tG; ctx.fillRect(0, 0, w, fadeW);
  const bG = ctx.createLinearGradient(0, h - fadeW, 0, h);
  bG.addColorStop(0, `rgba(${bgC}, 0)`); bG.addColorStop(1, `rgba(${bgC}, 0.8)`);
  ctx.fillStyle = bG; ctx.fillRect(0, h - fadeW, w, fadeW);

  // Header
  const hdrH = Math.max(20, h / 15);
  const hdrG2 = ctx.createLinearGradient(0, 0, 0, hdrH);
  hdrG2.addColorStop(0, "rgba(8, 10, 8, 0.9)");
  hdrG2.addColorStop(1, "rgba(8, 10, 8, 0)");
  ctx.fillStyle = hdrG2;
  ctx.fillRect(0, 0, w, hdrH);

  const hdrFont = Math.max(8, Math.min(12, w / 25));
  ctx.font = `bold ${hdrFont}px system-ui`;
  ctx.fillStyle = "rgba(0, 255, 200, 0.8)";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("Navigator", 8, hdrH / 2);
  ctx.fillStyle = "rgba(0, 210, 110, 0.4)";
  ctx.font = `${hdrFont - 2}px system-ui`;
  ctx.textAlign = "right";
  ctx.fillText(`${agents.length}a / ${nodes.length}n`, w - 8, hdrH / 2);

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
};

// Hex color component helpers
function hexR(hex: string): number { return parseInt(hex.slice(1, 3), 16); }
function hexG(hex: string): number { return parseInt(hex.slice(3, 5), 16); }
function hexB(hex: string): number { return parseInt(hex.slice(5, 7), 16); }

// --- Registry of active renderers ---
// Atomic primitives used by the new layout system
export const RENDERERS: Record<string, RenderFn> = {
  "panel-bg": renderPanelBg,
  "text": renderText,
  "text-block": renderTextBlock,
  "mem-bg": renderMemBg,
  "mem-bar": renderMemBar,
  "ctx-bg": renderCtxBg,
  "ctx-bar": renderCtxBar,
  "chat-bg": renderChatBg,
  "hover-glow": renderHoverGlow,
  "mascot": renderMascot,
  // Composite tiles still used by layout (section headers, nav, indicators)
  "page-nav": renderPageNav,
  "mic-indicator": renderMic,
  "voice-transcript": renderTranscript,
  "chat-loading": renderChatLoading,
  "chat-empty": renderChatEmpty,
  "ctx-empty": renderContextEmpty,
  "ctx-header": renderContextHeader,
  "mem-header": renderMemoriesHeader,
  "agent-map": renderAgentMap,
  "navigator-map": renderNavigatorMap,
};
