/**
 * tileRenderers.ts - Pure render functions for each tile type.
 *
 * Each function draws to an OffscreenCanvas context. Same data = same output.
 * These are extracted from the old SpectaclesView rendering code but operate
 * on individual tiles rather than a monolithic grid.
 */

import type { RenderFn } from "./tile";

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

  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(2, 2, w - 4, h - 4, 4);
  ctx.fill();

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

  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(2, 2, w - 4, h - 4, 3);
  ctx.fill();

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
  ctx.fillStyle = isUser ? "#1a2a3a" : "#1a1a2e";
  ctx.beginPath();
  ctx.roundRect(2, 2, w - 4, h - 4, 6);
  ctx.fill();
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

  // Content preview
  ctx.fillStyle = "#aab0b8";
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

// --- Hover glow tile: semi-transparent highlight ---
export const renderHoverGlow: RenderFn = (ctx, w, h) => {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "rgba(21, 209, 255, 0.08)";
  ctx.beginPath();
  ctx.roundRect(2, 2, w - 4, h - 4, 6);
  ctx.fill();
  ctx.strokeStyle = "rgba(21, 209, 255, 0.3)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(2, 2, w - 4, h - 4, 6);
  ctx.stroke();
};

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
  // Composite tiles still used by layout (section headers, nav, indicators)
  "page-nav": renderPageNav,
  "mic-indicator": renderMic,
  "voice-transcript": renderTranscript,
  "chat-loading": renderChatLoading,
  "chat-empty": renderChatEmpty,
  "ctx-empty": renderContextEmpty,
  "ctx-header": renderContextHeader,
  "mem-header": renderMemoriesHeader,
};
