/**
 * tileLayout.ts - Pure layout function for tiles.
 *
 * Takes all UI state and returns a TileDescriptor[] describing every tile
 * that should exist, with positions in cm (Spectacles world units).
 * Positions are relative to the panel center.
 *
 * Called via useMemo - only recomputes when inputs change.
 */

import type { TileDescriptor, TileLayer } from "./tile";
import type { Memory } from "./supabase";
import type { ChatMessage } from "../hooks/useGeminiChat";

export interface AgentInfo {
  name: string;
  isActive: boolean;
  lastTs: string;
  memoryCount: number;
}

export interface MapAgentInfo {
  name: string;
  isActive: boolean;
  lastTs: string;
  memoryCount: number;
  systems: string[];
  opCount: number;
  curvature: number;
}

export interface ContextItem {
  memoryId: string;
  agent: string;
  content: string;
}

// --- Tile pixel sizes ---
const SIZES = {
  panelBg:    { w: 640, h: 480 },  // background container (low detail, just solid fill)
  header:     { w: 400, h: 120 },
  mascot:     { w: 96,  h: 96 },   // pixel art mascot (32x32 grid at 3x)
  agentDot:   { w: 64,  h: 22 },   // compact agent chip
  memHeader:  { w: 220, h: 20 },
  memCard:    { w: 220, h: 42 },
  ctxHeader:  { w: 180, h: 20 },
  ctxCard:    { w: 180, h: 36 },
  ctxEmpty:   { w: 180, h: 60 },
  promptBtn:  { w: 200, h: 48 },   // larger touch targets for Spectacles
  chatBubble: { w: 220, h: 60 },
  chatEmpty:  { w: 220, h: 60 },
  chatLoading:{ w: 220, h: 40 },
  pageNav:    { w: 220, h: 28 },   // slightly taller for touch
  mic:        { w: 80,  h: 20 },
  transcript: { w: 220, h: 28 },
  hoverGlow:  { w: 230, h: 48 },   // no texture, colored quad
};

// --- Layout constants (cm, from SPECTACLES_ERGONOMICS.md) ---
const PIXELS_PER_CM = 16;
const COL_LEFT = -14;    // left column x center (memories)
const COL_MID = 0;       // middle column x center (context)
const COL_RIGHT = 14;    // right column x center (prompts + chat)
const TOP_Y = 14;        // top of content area
const ROW_GAP = 0.3;     // gap between tiles (cm)
const CARD_H_CM = 2.4;   // memory card height in cm
const CTX_CARD_H_CM = 2.0;
const BTN_H_CM = 3.0; // matches 48px / 16px-per-cm = 3cm
const BUBBLE_H_CM = 3.2;
const NAV_H_CM = 1.5;
const HEADER_H_CM = 6.5;
const SECTION_HDR_CM = 1.2;

const QUICK_PROMPTS = [
  { label: "Summarize", icon: "S", color: "#15D1FF" },
  { label: "Explain",   icon: "E", color: "#e879f9" },
  { label: "Compare",   icon: "C", color: "#4ade80" },
  { label: "Key Points", icon: "K", color: "#fbbf24" },
];

const MEMORIES_PER_PAGE = 5;

export { MEMORIES_PER_PAGE };

// --- Text rendering helpers (high-DPI, tight quads) ---
const TEXT_DPI = 2.5;
const MEM_NAME_PX = 11;
const MEM_TIME_PX = 9;
const MEM_BODY_PX = 9;
const MEM_PAD_X = 2;
const MEM_PAD_Y = 2;
const CTX_NAME_PX = 9;
const CTX_BODY_PX = 8;
const CHAT_ROLE_PX = 9;
const CHAT_BODY_PX = 9;

// --- DOM-like Z stacking model ---
// Each column gets its own base Z depth to eliminate z-fighting between
// columns on Spectacles. Child tiles use small offsets within each column.

// Container base Z (each column gets its own depth)
const Z_COL_LEFT  = 0.5;   // memories column
const Z_COL_MID   = 0.6;   // context column
const Z_COL_RIGHT = 0.7;   // prompts + chat column
const Z_HEADER    = 0.4;   // header (behind content)
const Z_AGENTS    = 0.45;  // agent dots

// Ungrouped tile Z positions
const Z_SECTION_HDR  = 0.3;   // section headers (mem-header, ctx-header)
const Z_STANDALONE   = 0.3;   // standalone tiles (page-nav, chat-empty, etc.)
const Z_HOVER_GLOW   = 1.5;   // hover glow overlay, in front of all content

// Element Z offsets within a group (relative to container Z)
const Z_BG   = 0.0;     // card background
const Z_BAR  = 0.02;    // accent bar
const Z_TEXT = 0.04;    // text content
const Z_ICON = 0.04;    // icons (same depth as text)
const Z_OVER = 0.06;    // overlays (checkmarks, remove buttons)

const measureCtx = (() => {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(16, 16).getContext("2d");
  }
  if (typeof document !== "undefined") {
    return document.createElement("canvas").getContext("2d");
  }
  return null;
})();

function measureTextPx(text: string, font: string): number {
  if (!measureCtx) return text.length * 8;
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}

function truncateToWidth(text: string, font: string, maxWidthPx: number): string {
  if (!text) return text;
  if (measureTextPx(text, font) <= maxWidthPx) return text;
  const ellipsis = "…";
  let trimmed = text;
  while (trimmed.length > 1) {
    trimmed = trimmed.slice(0, -1);
    if (measureTextPx(trimmed + ellipsis, font) <= maxWidthPx) {
      return trimmed + ellipsis;
    }
  }
  return text.slice(0, 1) + ellipsis;
}

function wrapLines(text: string, font: string, maxWidthPx: number, maxLines: number): string[] {
  if (!measureCtx) return [text];
  measureCtx.font = font;
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? current + " " + word : word;
    if (measureCtx.measureText(test).width > maxWidthPx && current) {
      lines.push(current);
      current = word;
      if (lines.length >= maxLines) break;
    } else {
      current = test;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines;
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

const AGENT_PALETTE = [
  "#E64980", "#CC5DE8", "#845EF7", "#5C7CFA",
  "#339AF0", "#22B8CF", "#20C997", "#51CF66",
];

function agentColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AGENT_PALETTE[Math.abs(hash) % AGENT_PALETTE.length];
}

function textTile(params: {
  id: string;
  text: string;
  fontPx: number;
  fontWeight?: "normal" | "bold";
  color: string;
  bg: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  padX?: number;
  padY?: number;
  x: number;
  y: number;
  layer: TileLayer;
  interactive?: boolean;
}): TileDescriptor {
  const {
    id, text, fontPx, fontWeight = "normal", color, bg,
    align = "left", baseline = "alphabetic", padX = MEM_PAD_X, padY = MEM_PAD_Y,
    x, y, layer, interactive = false,
  } = params;

  const scaledFontPx = fontPx * TEXT_DPI;
  const font = `${fontWeight} ${scaledFontPx}px system-ui`;
  const padXScaled = padX * TEXT_DPI;
  const padYScaled = padY * TEXT_DPI;
  const textWidth = measureTextPx(text, font);
  const w = Math.ceil(textWidth + padXScaled * 2);
  const h = Math.ceil((fontPx + padY * 2) * TEXT_DPI);
  const scale = 1 / TEXT_DPI;

  return {
    id,
    type: "text",
    x,
    y,
    w,
    h,
    scale,
    layer,
    interactive,
    draggable: false,
    visible: true,
    data: {
      text,
      font,
      fontPx: scaledFontPx,
      color,
      bg,
      align,
      baseline,
      padX: padXScaled,
      padY: padYScaled,
    },
  };
}

function textBlockTile(params: {
  id: string;
  text: string;
  fontPx: number;
  fontWeight?: "normal" | "bold";
  color: string;
  bg: string;
  maxWidthPx: number;
  lineHeightPx?: number;
  maxLines?: number;
  padX?: number;
  padY?: number;
  x: number;
  y: number;
  layer: TileLayer;
}): TileDescriptor {
  const {
    id, text, fontPx, fontWeight = "normal", color, bg,
    maxWidthPx, lineHeightPx = Math.ceil(fontPx * 1.3), maxLines = 3,
    padX = MEM_PAD_X, padY = MEM_PAD_Y,
    x, y, layer,
  } = params;

  const scaledFontPx = fontPx * TEXT_DPI;
  const font = `${fontWeight} ${scaledFontPx}px system-ui`;
  const padXScaled = padX * TEXT_DPI;
  const padYScaled = padY * TEXT_DPI;
  const lines = wrapLines(text, font, maxWidthPx * TEXT_DPI, maxLines);
  const lineHeightScaled = lineHeightPx * TEXT_DPI;
  const w = Math.ceil(maxWidthPx * TEXT_DPI + padXScaled * 2);
  const h = Math.ceil(lines.length * lineHeightScaled + padYScaled * 2);
  const scale = 1 / TEXT_DPI;

  return {
    id,
    type: "text-block",
    x,
    y,
    w,
    h,
    scale,
    layer,
    interactive: false,
    draggable: false,
    visible: true,
    data: {
      text,
      font,
      fontPx: scaledFontPx,
      color,
      bg,
      maxWidth: maxWidthPx * TEXT_DPI,
      lineHeight: lineHeightScaled,
      padX: padXScaled,
      padY: padYScaled,
      maxLines,
    },
  };
}

function placeInCard(params: {
  cardX: number;
  cardY: number;
  cardWpx: number;
  cardHpx: number;
  leftPx: number;
  topPx: number;
  tileWpx: number;
  tileHpx: number;
}): { x: number; y: number } {
  const { cardX, cardY, cardWpx, cardHpx, leftPx, topPx, tileWpx, tileHpx } = params;
  const tileWBase = tileWpx / TEXT_DPI;
  const tileHBase = tileHpx / TEXT_DPI;
  const x = cardX + (-cardWpx / 2 + leftPx + tileWBase / 2) / PIXELS_PER_CM;
  const y = cardY + (cardHpx / 2 - topPx - tileHBase / 2) / PIXELS_PER_CM;
  return { x, y };
}

/**
 * Compute the desired tile set for the current UI state.
 */
export interface GroupLayout {
  id: string;
  x: number;
  y: number;
  z?: number;
  visible?: boolean;
  zone?: string;
  duration?: number;
}

export function computeLayout(params: {
  agents: AgentInfo[];
  memories: Memory[];
  contextItems: ContextItem[];
  chatMessages: ChatMessage[];
  chatLoading: boolean;
  chatError: string | null;
  memoryPage: number;
  selectedAgent: string | null;
  isListening: boolean;
  voiceTranscript: string;
  room: string;
  channelReady: boolean;
  deviceId: string;
}): { tiles: TileDescriptor[]; groups: GroupLayout[] } {
  const {
    agents, memories, contextItems, chatMessages,
    chatLoading, chatError, memoryPage, selectedAgent,
    isListening, voiceTranscript, room, channelReady, deviceId,
  } = params;

  const tiles: TileDescriptor[] = [];
  const groups: GroupLayout[] = [];
  const layer: TileLayer = 0;

  // ---- Panel background (dark container behind everything) ----
  tiles.push({
    id: "panel-bg",
    type: "panel-bg",
    x: COL_MID,
    y: 0,
    z: 0, // at z=0, behind content
    ...SIZES.panelBg,
    scale: 1,
    layer,
    interactive: false,
    draggable: false,
    visible: true,
    data: {},
  });

  // ---- Header (atomic) ----
  const activeCount = agents.filter(a => a.isActive).length;
  const headerX = COL_MID;
  const headerY = TOP_Y + 2;
  const headerWpx = SIZES.header.w;
  const headerHpx = SIZES.header.h;
  const headerBg = "#0d0d18";
  const headerGroup = "g-header";

  groups.push({ id: headerGroup, x: headerX, y: headerY, z: Z_HEADER, zone: "header" });

  tiles.push({
    id: "header-bg",
    type: "mem-bg",
    group: headerGroup,
    x: 0,
    y: 0,
    z: Z_BG,
    w: headerWpx,
    h: headerHpx,
    scale: 1,
    layer,
    interactive: false,
    draggable: false,
    visible: true,
    data: { inContext: false, bg: "#0c0c18", border: "rgba(21, 209, 255, 0.08)" },
  });

  const titleTile = textTile({
    id: "header-title",
    text: "Eywa",
    fontPx: 20,
    fontWeight: "bold",
    color: "#15D1FF",
    bg: headerBg,
    x: 0,
    y: 0,
    layer,
  });
  const titlePos = placeInCard({
    cardX: 0, cardY: 0, cardWpx: headerWpx, cardHpx: headerHpx,
    leftPx: 8, topPx: 8,
    tileWpx: titleTile.w, tileHpx: titleTile.h,
  });
  titleTile.x = titlePos.x;
  titleTile.y = titlePos.y;
  titleTile.z = Z_TEXT;
  titleTile.group = headerGroup;
  tiles.push(titleTile);

  const roomTile = textTile({
    id: "header-room",
    text: room || "demo",
    fontPx: 11,
    fontWeight: "normal",
    color: "#e6edf3",
    bg: headerBg,
    x: 0,
    y: 0,
    layer,
  });
  const roomPos = placeInCard({
    cardX: 0, cardY: 0, cardWpx: headerWpx, cardHpx: headerHpx,
    leftPx: 8, topPx: 32,
    tileWpx: roomTile.w, tileHpx: roomTile.h,
  });
  roomTile.x = roomPos.x;
  roomTile.y = roomPos.y;
  roomTile.z = Z_TEXT;
  roomTile.group = headerGroup;
  tiles.push(roomTile);

  if (deviceId) {
    const devTile = textTile({
      id: "header-device",
      text: deviceId,
      fontPx: 9,
      fontWeight: "bold",
      color: "#e879f9",
      bg: headerBg,
      x: 0,
      y: 0,
      layer,
    });
    const devPos = placeInCard({
      cardX: 0, cardY: 0, cardWpx: headerWpx, cardHpx: headerHpx,
      leftPx: 8, topPx: 48,
      tileWpx: devTile.w, tileHpx: devTile.h,
    });
    devTile.x = devPos.x;
    devTile.y = devPos.y;
    devTile.z = Z_TEXT;
    devTile.group = headerGroup;
    tiles.push(devTile);
  }

  const statusTile = textTile({
    id: "header-status",
    text: channelReady ? "LIVE" : "LOCAL",
    fontPx: 8,
    fontWeight: "bold",
    color: channelReady ? "#4ade80" : "#cfe8ff",
    bg: headerBg,
    align: "right",
    x: 0,
    y: 0,
    layer,
  });
  const statusPos = placeInCard({
    cardX: 0, cardY: 0, cardWpx: headerWpx, cardHpx: headerHpx,
    leftPx: headerWpx - 8 - (statusTile.w / TEXT_DPI),
    topPx: 18,
    tileWpx: statusTile.w, tileHpx: statusTile.h,
  });
  statusTile.x = statusPos.x;
  statusTile.y = statusPos.y;
  statusTile.z = Z_TEXT;
  statusTile.group = headerGroup;
  tiles.push(statusTile);

  // Mascot (center-right of header, animated separately in render loop)
  tiles.push({
    id: "mascot",
    type: "mascot",
    group: headerGroup,
    x: 6.0,   // center-right, clear of stats (left) and status text (far right)
    y: -0.5,  // slightly below center to clear status text above
    z: Z_TEXT,
    w: SIZES.mascot.w,
    h: SIZES.mascot.h,
    scale: 1,
    layer,
    interactive: false,
    draggable: false,
    visible: true,
    data: { mood: "okay", time: 0, blinking: false, bg: headerBg },
  });

  const stats = [
    `${agents.length} agents (${activeCount} active)`,
    `${memories.length} memories`,
    `${contextItems.length} in context`,
  ];
  stats.forEach((line, idx) => {
    const statTile = textTile({
      id: `header-stat-${idx}`,
      text: line,
      fontPx: 10,
      fontWeight: "normal",
      color: "#e6edf3",
      bg: headerBg,
      x: 0,
      y: 0,
      layer,
    });
    const statPos = placeInCard({
      cardX: 0, cardY: 0, cardWpx: headerWpx, cardHpx: headerHpx,
      leftPx: 8, topPx: 72 + idx * 14,
      tileWpx: statTile.w, tileHpx: statTile.h,
    });
    statTile.x = statPos.x;
    statTile.y = statPos.y;
    statTile.z = Z_TEXT;
    statTile.group = headerGroup;
    tiles.push(statTile);
  });

  // ---- Agent dots (atomic: compact chips, centered row) ----
  const agentY = TOP_Y - HEADER_H_CM + 0.5;
  const maxAgents = Math.min(agents.length, 8);
  const agentSpacing = 4.2; // cm between dot centers
  const agentStartX = -(maxAgents - 1) * agentSpacing / 2; // center the row
  agents.slice(0, 8).forEach((agent, i) => {
    const baseId = `agent-${i}`;
    const dotX = agentStartX + i * agentSpacing;
    const dotY = agentY;
    const isSelected = selectedAgent === agent.name;
    const color = agentColor(agent.name);
    const groupId = `g-agent-${i}`;

    groups.push({ id: groupId, x: dotX, y: dotY, z: Z_AGENTS, zone: "left" });

    tiles.push({
      id: baseId,
      type: "mem-bg",
      group: groupId,
      x: 0,
      y: 0,
      z: Z_BG,
      w: SIZES.agentDot.w,
      h: SIZES.agentDot.h,
      scale: 1,
      layer,
      interactive: true,
      draggable: false,
      visible: true,
      data: {
        inContext: false,
        bg: isSelected ? "#1a1a2e" : "#0d0d18",
        border: "rgba(0,0,0,0)",
      },
    });

    const dotTile = textTile({
      id: `${baseId}-dot`,
      text: "●",
      fontPx: 9,
      fontWeight: "bold",
      color: agent.isActive ? "#4ade80" : "#93c5fd",
      bg: isSelected ? "#1a1a2e" : "#0d0d18",
      x: 0,
      y: 0,
      layer,
    });
    const dotPos = placeInCard({
      cardX: 0, cardY: 0, cardWpx: SIZES.agentDot.w, cardHpx: SIZES.agentDot.h,
      leftPx: 6, topPx: 6,
      tileWpx: dotTile.w, tileHpx: dotTile.h,
    });
    dotTile.x = dotPos.x;
    dotTile.y = dotPos.y;
    dotTile.z = Z_TEXT;
    dotTile.group = groupId;
    tiles.push(dotTile);

    const nameTile = textTile({
      id: `${baseId}-name`,
      text: shortAgent(agent.name).slice(0, 12),
      fontPx: 10,
      fontWeight: isSelected ? "bold" : "normal",
      color,
      bg: isSelected ? "#1a1a2e" : "#0d0d18",
      x: 0,
      y: 0,
      layer,
    });
    const namePos = placeInCard({
      cardX: 0, cardY: 0, cardWpx: SIZES.agentDot.w, cardHpx: SIZES.agentDot.h,
      leftPx: 18, topPx: 6,
      tileWpx: nameTile.w, tileHpx: nameTile.h,
    });
    nameTile.x = namePos.x;
    nameTile.y = namePos.y;
    nameTile.z = Z_TEXT;
    nameTile.group = groupId;
    tiles.push(nameTile);
  });

  // ---- LEFT COLUMN: Memories ----
  let leftY = agentY - SECTION_HDR_CM - ROW_GAP;

  // Memories section header
  tiles.push({
    id: "mem-header",
    type: "mem-header",
    x: COL_LEFT,
    y: leftY,
    z: Z_SECTION_HDR,
    ...SIZES.memHeader,
    scale: 1,
    layer,
    interactive: false,
    draggable: false,
    visible: true,
    data: {},
  });
  leftY -= SECTION_HDR_CM;

  // Filter and paginate memories
  let filtered = selectedAgent
    ? memories.filter(m => m.agent === selectedAgent)
    : memories;
  filtered = [...filtered].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  const totalPages = Math.max(1, Math.ceil(filtered.length / MEMORIES_PER_PAGE));
  const pageStart = memoryPage * MEMORIES_PER_PAGE;
  const visibleMems = filtered.slice(pageStart, pageStart + MEMORIES_PER_PAGE);

  // Memory cards (atomic quads: bg + bar + text)
  visibleMems.forEach((mem, i) => {
    const inContext = contextItems.some(c => c.memoryId === mem.id);
    const cardX = COL_LEFT;
    const cardY = leftY - i * (CARD_H_CM + ROW_GAP);
    const cardWpx = SIZES.memCard.w;
    const cardHpx = SIZES.memCard.h;
    const cardBg = inContext ? "#1a2a2a" : "#151520";
    const cardBorder = inContext ? "#4ade80" : "#30363d";
    const color = agentColor(mem.agent);
    const groupId = `g-mem-${mem.id}`;

    groups.push({ id: groupId, x: cardX, y: cardY, z: Z_COL_LEFT, zone: "left" });

    // Background (interactive)
    tiles.push({
      id: `mem-${mem.id}`,
      type: "mem-bg",
      group: groupId,
      x: 0,
      y: 0,
      z: Z_BG,
      ...SIZES.memCard,
      scale: 1,
      layer,
      interactive: true,
      draggable: true,
      visible: true,
      data: {
        memoryId: mem.id,
        inContext,
        bg: cardBg,
        border: cardBorder,
      },
    });

    // Accent bar (left edge)
    const barWpx = 6;
    tiles.push({
      id: `mem-${mem.id}-bar`,
      type: "mem-bar",
      group: groupId,
      x: (-cardWpx / 2 + barWpx / 2) / PIXELS_PER_CM,
      y: 0,
      z: Z_BAR,
      w: barWpx,
      h: cardHpx,
      scale: 1,
      layer,
      interactive: false,
      draggable: false,
      visible: true,
      data: { color },
    });

    // Agent name (top-left)
    const agentText = shortAgent(mem.agent).slice(0, 14);
    const agentTile = textTile({
      id: `mem-${mem.id}-agent`,
      text: agentText,
      fontPx: MEM_NAME_PX,
      fontWeight: "bold",
      color,
      bg: cardBg,
      x: 0,
      y: 0,
      layer,
    });
    const agentPos = placeInCard({
      cardX: 0, cardY: 0, cardWpx, cardHpx,
      leftPx: 10, topPx: 6,
      tileWpx: agentTile.w, tileHpx: agentTile.h,
    });
    agentTile.x = agentPos.x;
    agentTile.y = agentPos.y;
    agentTile.z = Z_TEXT;
    agentTile.group = groupId;
    tiles.push(agentTile);

    // Time (top-right)
    const timeText = mem.ts ? timeAgo(mem.ts) : "";
    if (timeText) {
      const timeTile = textTile({
        id: `mem-${mem.id}-time`,
        text: timeText,
        fontPx: MEM_TIME_PX,
        fontWeight: "normal",
        color: "#e6edf3",
        bg: cardBg,
        align: "right",
        x: 0,
        y: 0,
        layer,
      });
      const timePos = placeInCard({
        cardX: 0, cardY: 0, cardWpx, cardHpx,
        leftPx: cardWpx - 6 - (timeTile.w / TEXT_DPI),
        topPx: 6,
        tileWpx: timeTile.w, tileHpx: timeTile.h,
      });
      timeTile.x = timePos.x;
      timeTile.y = timePos.y;
      timeTile.z = Z_TEXT;
      timeTile.group = groupId;
      tiles.push(timeTile);
    }

    // Content (single line, truncated to fit)
    const maxContentWidthPx = cardWpx - 20;
    const contentFont = `${MEM_BODY_PX * TEXT_DPI}px system-ui`;
    const contentText = truncateToWidth(mem.content, contentFont, maxContentWidthPx * TEXT_DPI);
    const contentTile = textTile({
      id: `mem-${mem.id}-body`,
      text: contentText,
      fontPx: MEM_BODY_PX,
      fontWeight: "normal",
      color: "#e6edf3",
      bg: cardBg,
      x: 0,
      y: 0,
      layer,
    });
    const contentPos = placeInCard({
      cardX: 0, cardY: 0, cardWpx, cardHpx,
      leftPx: 10, topPx: 22,
      tileWpx: contentTile.w, tileHpx: contentTile.h,
    });
    contentTile.x = contentPos.x;
    contentTile.y = contentPos.y;
    contentTile.z = Z_TEXT;
    contentTile.group = groupId;
    tiles.push(contentTile);

    // Context checkmark (right, same row as content)
    if (inContext) {
      const checkTile = textTile({
        id: `mem-${mem.id}-check`,
        text: "✓",
        fontPx: 12,
        fontWeight: "bold",
        color: "#4ade80",
        bg: cardBg,
        align: "right",
        x: 0,
        y: 0,
        layer,
      });
      const checkPos = placeInCard({
        cardX: 0, cardY: 0, cardWpx, cardHpx,
        leftPx: cardWpx - 6 - (checkTile.w / TEXT_DPI),
        topPx: 22,
        tileWpx: checkTile.w, tileHpx: checkTile.h,
      });
      checkTile.x = checkPos.x;
      checkTile.y = checkPos.y;
      checkTile.z = Z_OVER;
      checkTile.group = groupId;
      tiles.push(checkTile);
    }
  });

  leftY -= visibleMems.length * (CARD_H_CM + ROW_GAP);

  // Page nav (if multiple pages)
  if (totalPages > 1) {
    tiles.push({
      id: "page-nav",
      type: "page-nav",
      x: COL_LEFT,
      y: leftY - ROW_GAP,
      z: Z_STANDALONE,
      ...SIZES.pageNav,
      scale: 1,
      layer,
      interactive: true,
      draggable: false,
      visible: true,
      data: { page: memoryPage, totalPages },
    });
    leftY -= NAV_H_CM + ROW_GAP;
  }

  // ---- MIDDLE COLUMN: Context ----
  let midY = agentY - SECTION_HDR_CM - ROW_GAP;

  // Context section header
  tiles.push({
    id: "ctx-header",
    type: "ctx-header",
    x: COL_MID,
    y: midY,
    z: Z_SECTION_HDR,
    ...SIZES.ctxHeader,
    scale: 1,
    layer,
    interactive: false,
    draggable: false,
    visible: true,
    data: { count: contextItems.length },
  });
  midY -= SECTION_HDR_CM;

  if (contextItems.length === 0) {
    // Empty context placeholder
    tiles.push({
      id: "ctx-empty",
      type: "ctx-empty",
      x: COL_MID,
      y: midY,
      z: Z_STANDALONE,
      ...SIZES.ctxEmpty,
      scale: 1,
      layer,
      interactive: false,
      draggable: false,
      visible: true,
      data: {},
    });
    midY -= 3.5;
  } else {
    // Context cards (atomic)
    contextItems.slice(0, 6).forEach((item, i) => {
      const cardX = COL_MID;
      const cardY = midY - i * (CTX_CARD_H_CM + ROW_GAP);
      const cardWpx = SIZES.ctxCard.w;
      const cardHpx = SIZES.ctxCard.h;
      const bg = "#151520";
      const border = "#30363d";
      const color = agentColor(item.agent);
      const groupId = `g-ctx-${item.memoryId}`;

      groups.push({ id: groupId, x: cardX, y: cardY, z: Z_COL_MID, zone: "mid" });

      tiles.push({
        id: `ctx-${item.memoryId}`,
        type: "ctx-bg",
        group: groupId,
        x: 0,
        y: 0,
        z: Z_BG,
        ...SIZES.ctxCard,
        scale: 1,
        layer,
        interactive: true,
        draggable: false,
        visible: true,
        data: {
          memoryId: item.memoryId,
          bg,
          border,
        },
      });

      const barWpx = 4;
      tiles.push({
        id: `ctx-${item.memoryId}-bar`,
        type: "ctx-bar",
        group: groupId,
        x: (-cardWpx / 2 + barWpx / 2) / PIXELS_PER_CM,
        y: 0,
        z: Z_BAR,
        w: barWpx,
        h: cardHpx,
        scale: 1,
        layer,
        interactive: false,
        draggable: false,
        visible: true,
        data: { color },
      });

      const nameText = shortAgent(item.agent).slice(0, 10);
      const nameTile = textTile({
        id: `ctx-${item.memoryId}-agent`,
        text: nameText,
        fontPx: CTX_NAME_PX,
        fontWeight: "bold",
        color,
        bg,
        x: 0,
        y: 0,
        layer,
      });
      const namePos = placeInCard({
        cardX: 0, cardY: 0, cardWpx, cardHpx,
        leftPx: 8, topPx: 5,
        tileWpx: nameTile.w, tileHpx: nameTile.h,
      });
      nameTile.x = namePos.x;
      nameTile.y = namePos.y;
      nameTile.z = Z_TEXT;
      nameTile.group = groupId;
      tiles.push(nameTile);

      const maxBodyWidthPx = cardWpx - 18;
      const bodyTile = textBlockTile({
        id: `ctx-${item.memoryId}-body`,
        text: item.content,
        fontPx: CTX_BODY_PX,
        fontWeight: "normal",
        color: "#e6edf3",
        bg,
        maxWidthPx: maxBodyWidthPx,
        lineHeightPx: 10,
        maxLines: 2,
        x: 0,
        y: 0,
        layer,
      });
      const bodyPos = placeInCard({
        cardX: 0, cardY: 0, cardWpx, cardHpx,
        leftPx: 8, topPx: 16,
        tileWpx: bodyTile.w, tileHpx: bodyTile.h,
      });
      bodyTile.x = bodyPos.x;
      bodyTile.y = bodyPos.y;
      bodyTile.z = Z_TEXT;
      bodyTile.group = groupId;
      tiles.push(bodyTile);

      const removeTile = textTile({
        id: `ctx-${item.memoryId}-remove`,
        text: "×",
        fontPx: 14,
        fontWeight: "bold",
        color: "#e6edf3",
        bg,
        align: "right",
        padX: 6,
        padY: 4,
        x: 0,
        y: 0,
        layer,
        interactive: true,
      });
      const removePos = placeInCard({
        cardX: 0, cardY: 0, cardWpx, cardHpx,
        leftPx: cardWpx - 6 - (removeTile.w / TEXT_DPI),
        topPx: 8,
        tileWpx: removeTile.w, tileHpx: removeTile.h,
      });
      removeTile.x = removePos.x;
      removeTile.y = removePos.y;
      removeTile.z = Z_OVER;
      removeTile.group = groupId;
      tiles.push(removeTile);
    });
    midY -= contextItems.length * (CTX_CARD_H_CM + ROW_GAP) + ROW_GAP;
  }

  // ---- RIGHT COLUMN: Prompts + Chat ----
  let rightY = agentY - SECTION_HDR_CM - ROW_GAP;

  // ---- Quick prompts (atomic) ----
  const promptsDisabled = contextItems.length === 0;
  QUICK_PROMPTS.forEach((prompt, i) => {
    const btnX = COL_RIGHT;
    const btnY = rightY - i * (BTN_H_CM + ROW_GAP);
    const btnWpx = SIZES.promptBtn.w;
    const btnHpx = SIZES.promptBtn.h;
    const bg = "#151520";
    const color = prompt.color;
    const groupId = `g-prompt-${i}`;

    groups.push({ id: groupId, x: btnX, y: btnY, z: Z_COL_RIGHT, zone: "action" });

    tiles.push({
      id: `prompt-${i}`,
      type: "mem-bg",
      group: groupId,
      x: 0,
      y: 0,
      z: Z_BG,
      w: btnWpx,
      h: btnHpx,
      scale: 1,
      layer,
      interactive: !promptsDisabled,
      draggable: false,
      visible: true,
      data: {
        inContext: false,
        bg,
        border: promptsDisabled ? "#222222" : "#30363d",
      },
    });

    const iconTile = textTile({
      id: `prompt-${i}-icon`,
      text: chatLoading ? "…" : prompt.icon,
      fontPx: 12,
      fontWeight: "bold",
      color: promptsDisabled ? "#e6edf3" : "#0b1220",
      bg: promptsDisabled ? "#1f2937" : color,
      align: "center",
      baseline: "middle",
      padX: 6,
      padY: 6,
      x: 0,
      y: 0,
      layer,
    });
    const iconPos = placeInCard({
      cardX: 0, cardY: 0, cardWpx: btnWpx, cardHpx: btnHpx,
      leftPx: 10, topPx: 6,
      tileWpx: iconTile.w, tileHpx: iconTile.h,
    });
    iconTile.x = iconPos.x;
    iconTile.y = iconPos.y;
    iconTile.z = Z_ICON;
    iconTile.group = groupId;
    tiles.push(iconTile);

    const labelTile = textTile({
      id: `prompt-${i}-label`,
      text: prompt.label,
      fontPx: 11,
      fontWeight: "bold",
      color: promptsDisabled ? "#cfe8ff" : "#e6edf3",
      bg,
      x: 0,
      y: 0,
      layer,
    });
    const labelPos = placeInCard({
      cardX: 0, cardY: 0, cardWpx: btnWpx, cardHpx: btnHpx,
      leftPx: 40, topPx: 10,
      tileWpx: labelTile.w, tileHpx: labelTile.h,
    });
    labelTile.x = labelPos.x;
    labelTile.y = labelPos.y;
    labelTile.z = Z_TEXT;
    labelTile.group = groupId;
    tiles.push(labelTile);
  });
  rightY -= QUICK_PROMPTS.length * (BTN_H_CM + ROW_GAP);

  // ---- Voice input indicators ----
  if (isListening) {
    tiles.push({
      id: "mic",
      type: "mic-indicator",
      x: COL_RIGHT + 8,
      y: TOP_Y - HEADER_H_CM + 0.5,
      z: Z_STANDALONE,
      ...SIZES.mic,
      scale: 1,
      layer,
      interactive: false,
      draggable: false,
      visible: true,
      data: { isListening },
    });

    if (voiceTranscript) {
      tiles.push({
        id: "voice-transcript",
        type: "voice-transcript",
        x: COL_RIGHT,
        y: rightY,
        z: Z_STANDALONE,
        ...SIZES.transcript,
        scale: 1,
        layer,
        interactive: false,
        draggable: false,
        visible: true,
        data: { transcript: voiceTranscript },
      });
      rightY -= 1.8;
    }
  }

  // ---- Chat area (below prompts, far right or below) ----
  const chatY = rightY - ROW_GAP;

  if (chatLoading) {
    tiles.push({
      id: "chat-loading",
      type: "chat-loading",
      x: COL_RIGHT,
      y: chatY,
      z: Z_STANDALONE,
      ...SIZES.chatLoading,
      scale: 1,
      layer,
      interactive: false,
      draggable: false,
      visible: true,
      data: { dotPhase: Math.floor(Date.now() / 400) },
    });
  } else if (chatMessages.length === 0 && !chatError) {
    tiles.push({
      id: "chat-empty",
      type: "chat-empty",
      x: COL_RIGHT,
      y: chatY,
      z: Z_STANDALONE,
      ...SIZES.chatEmpty,
      scale: 1,
      layer,
      interactive: false,
      draggable: false,
      visible: true,
      data: {},
    });
  } else {
    // Show last few chat messages (atomic)
    const maxBubbles = 3;
    const recentMessages = chatMessages.slice(-maxBubbles);
    recentMessages.forEach((msg, i) => {
      const bubbleX = COL_RIGHT;
      const bubbleY = chatY - i * (BUBBLE_H_CM + ROW_GAP);
      const bubbleWpx = SIZES.chatBubble.w;
      const bubbleHpx = SIZES.chatBubble.h;
      const isUser = msg.role === "user";
      const roleColor = isUser ? "#15D1FF" : "#e879f9";
      const groupId = `g-chat-${msg.ts}`;

      groups.push({ id: groupId, x: bubbleX, y: bubbleY, z: Z_COL_RIGHT, zone: "right" });

      tiles.push({
        id: `chat-${msg.ts}`,
        type: "chat-bg",
        group: groupId,
        x: 0,
        y: 0,
        z: Z_BG,
        ...SIZES.chatBubble,
        scale: 1,
        layer,
        interactive: false,
        draggable: false,
        visible: true,
        data: { isUser },
      });

      const roleTile = textTile({
        id: `chat-${msg.ts}-role`,
        text: isUser ? "You" : "Gemini",
        fontPx: CHAT_ROLE_PX,
        fontWeight: "bold",
        color: roleColor,
        bg: isUser ? "#1a2a3a" : "#1a1a2e",
        x: 0,
        y: 0,
        layer,
      });
      const rolePos = placeInCard({
        cardX: 0, cardY: 0, cardWpx: bubbleWpx, cardHpx: bubbleHpx,
        leftPx: 8, topPx: 6,
        tileWpx: roleTile.w, tileHpx: roleTile.h,
      });
      roleTile.x = rolePos.x;
      roleTile.y = rolePos.y;
      roleTile.z = Z_TEXT;
      roleTile.group = groupId;
      tiles.push(roleTile);

      const maxChatWidthPx = bubbleWpx - 16;
      const bodyTile = textBlockTile({
        id: `chat-${msg.ts}-body`,
        text: msg.content,
        fontPx: CHAT_BODY_PX,
        fontWeight: "normal",
        color: "#e6edf3",
        bg: isUser ? "#1a2a3a" : "#1a1a2e",
        maxWidthPx: maxChatWidthPx,
        lineHeightPx: 12,
        maxLines: 3,
        x: 0,
        y: 0,
        layer,
      });
      const bodyPos = placeInCard({
        cardX: 0, cardY: 0, cardWpx: bubbleWpx, cardHpx: bubbleHpx,
        leftPx: 8, topPx: 20,
        tileWpx: bodyTile.w, tileHpx: bodyTile.h,
      });
      bodyTile.x = bodyPos.x;
      bodyTile.y = bodyPos.y;
      bodyTile.z = Z_TEXT;
      bodyTile.group = groupId;
      tiles.push(bodyTile);
    });
  }

  // ---- Hover glow overlay (always exists, moved by scene ops) ----
  tiles.push({
    id: "hover-glow",
    type: "hover-glow",
    x: -100, // off-screen by default
    y: -100,
    z: Z_HOVER_GLOW,
    ...SIZES.hoverGlow,
    scale: 1,
    layer: 1,
    interactive: false,
    draggable: false,
    visible: false, // starts hidden
    data: {},
  });

  return { tiles, groups };
}

/**
 * Compute agent positions for the spacetime map.
 * Simple force-directed: agents orbit the center, cluster by shared systems.
 * Returns pixel positions within the map canvas.
 */
function computeAgentPositions(
  agents: MapAgentInfo[],
  mapW: number,
  mapH: number,
): Array<{ x: number; y: number }> {
  if (agents.length === 0) return [];
  const cx = mapW / 2;
  const cy = mapH / 2;
  const orbitR = Math.min(mapW, mapH) * 0.34;

  // Initial circular placement
  const positions = agents.map((_, i) => {
    const angle = -Math.PI / 2 + (i / agents.length) * Math.PI * 2;
    return { x: cx + Math.cos(angle) * orbitR, y: cy + Math.sin(angle) * orbitR };
  });

  // Simple force iterations: shared systems attract, all repel
  for (let iter = 0; iter < 30; iter++) {
    for (let i = 0; i < agents.length; i++) {
      let fx = 0, fy = 0;

      // Attract to orbit ring (stay near orbitR from center)
      const dx = positions[i].x - cx;
      const dy = positions[i].y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0) {
        const pullStrength = (dist - orbitR) * 0.05;
        fx -= (dx / dist) * pullStrength;
        fy -= (dy / dist) * pullStrength;
      }

      // Repel from other agents
      for (let j = 0; j < agents.length; j++) {
        if (i === j) continue;
        const ddx = positions[i].x - positions[j].x;
        const ddy = positions[i].y - positions[j].y;
        const dd = Math.sqrt(ddx * ddx + ddy * ddy);
        if (dd < 1) continue;
        const repel = 200 / (dd * dd);
        fx += (ddx / dd) * repel;
        fy += (ddy / dd) * repel;
      }

      // Attract to agents with shared systems
      for (let j = 0; j < agents.length; j++) {
        if (i === j) continue;
        const shared = agents[i].systems.filter(s => agents[j].systems.includes(s)).length;
        if (shared > 0) {
          const ddx = positions[j].x - positions[i].x;
          const ddy = positions[j].y - positions[i].y;
          const dd = Math.sqrt(ddx * ddx + ddy * ddy);
          if (dd < 1) continue;
          const attract = shared * 0.5;
          fx += (ddx / dd) * attract;
          fy += (ddy / dd) * attract;
        }
      }

      positions[i].x += fx;
      positions[i].y += fy;
    }
  }

  // Clamp to canvas bounds with margin
  const margin = 40;
  for (const p of positions) {
    p.x = Math.max(margin, Math.min(mapW - margin, p.x));
    p.y = Math.max(margin, Math.min(mapH - margin, p.y));
  }

  return positions;
}

/**
 * Build edge list for the spacetime map.
 * Spawn edges (parent-child), shared system edges.
 */
function computeMapEdges(
  agents: MapAgentInfo[],
): Array<{ from: number; to: number; type: string }> {
  const edges: Array<{ from: number; to: number; type: string }> = [];

  for (let i = 0; i < agents.length; i++) {
    for (let j = i + 1; j < agents.length; j++) {
      const shared = agents[i].systems.filter(s => agents[j].systems.includes(s));
      if (shared.length > 0) {
        edges.push({ from: i, to: j, type: "system" });
      }
    }
  }

  // Spawn edges: agents whose names share a base (e.g. armand/foo and armand/bar)
  // are in the same "swarm" - connect them if they share systems
  // (spawn edges are already captured by system edges above)

  return edges;
}

/**
 * Compute tile set for the 2D spacetime navigation map.
 * Alcubierre-warped grid, agents as curvature sources, flowing spacetime.
 */
export function computeMapLayout(params: {
  agents: MapAgentInfo[];
  destination: string;
  progress: number;
  milestones: Array<{ text: string; done: boolean }>;
  chatMessages: ChatMessage[];
  chatLoading: boolean;
  chatError: string | null;
  isListening: boolean;
  voiceTranscript: string;
  room: string;
  channelReady: boolean;
  deviceId: string;
  flowOffset: number;
}): { tiles: TileDescriptor[]; groups: GroupLayout[] } {
  const {
    agents, destination, progress, milestones,
    chatMessages, chatLoading,
    isListening, voiceTranscript, room,
    channelReady, deviceId, flowOffset,
  } = params;

  const tiles: TileDescriptor[] = [];
  const groups: GroupLayout[] = [];
  const layer: TileLayer = 0;

  const MAP_W = 640;
  const MAP_H = 480;

  // Compute agent positions (force-directed, clusters by shared systems)
  const positions = computeAgentPositions(agents, MAP_W, MAP_H);

  // Compute edges (shared systems, spawn connections)
  const edges = computeMapEdges(agents);

  // --- Main map tile (large, center) ---
  tiles.push({
    id: "agent-map",
    type: "agent-map",
    x: 0,
    y: 2,
    z: 0.5,
    w: MAP_W,
    h: MAP_H,
    scale: 1,
    layer,
    interactive: false,
    draggable: false,
    visible: true,
    data: {
      agents: agents.map((a, i) => ({
        name: a.name,
        isActive: a.isActive,
        systems: a.systems,
        opCount: a.opCount,
        curvature: a.curvature,
        x: positions[i]?.x ?? MAP_W / 2,
        y: positions[i]?.y ?? MAP_H / 2,
      })),
      edges,
      destination,
      progress,
      milestones: milestones.map(m => ({ text: m.text, done: m.done })),
      flowOffset,
      room,
    },
  });

  // --- Status text (top, above map) ---
  const statusY = 2 + MAP_H / (2 * PIXELS_PER_CM) + 1.5;

  const statusLine = channelReady
    ? `LIVE | /${room} | ${deviceId}`
    : `LOCAL | /${room}`;

  const statusTile = textTile({
    id: "map-status",
    text: statusLine,
    fontPx: 9,
    fontWeight: "bold",
    color: channelReady ? "#4ade80" : "#8b949e",
    bg: "#050510",
    align: "center",
    x: 0,
    y: statusY,
    layer,
  });
  tiles.push(statusTile);

  // --- Mascot (top-right of map) ---
  tiles.push({
    id: "mascot",
    type: "mascot",
    x: MAP_W / (2 * PIXELS_PER_CM) + 1,
    y: statusY,
    z: 0.6,
    w: 64,
    h: 64,
    scale: 1,
    layer,
    interactive: false,
    draggable: false,
    visible: true,
    data: { mood: "okay", time: 0, blinking: false, bg: "#050510" },
  });

  // --- Chat / Gemini response area (below map) ---
  const chatBaseY = 2 - MAP_H / (2 * PIXELS_PER_CM) - 1.5;

  if (chatLoading) {
    tiles.push({
      id: "chat-loading",
      type: "chat-loading",
      x: 0,
      y: chatBaseY,
      z: 0.6,
      ...SIZES.chatLoading,
      scale: 1,
      layer,
      interactive: false,
      draggable: false,
      visible: true,
      data: { dotPhase: Math.floor(Date.now() / 400) },
    });
  } else if (chatMessages.length > 0) {
    // Show last Gemini response
    const lastMsg = chatMessages[chatMessages.length - 1];
    const bubbleWpx = 320;
    const bubbleHpx = 60;
    const isUser = lastMsg.role === "user";
    const roleColor = isUser ? "#15D1FF" : "#e879f9";
    const groupId = `g-chat-last`;

    groups.push({ id: groupId, x: 0, y: chatBaseY, z: 0.7, zone: "chat" });

    tiles.push({
      id: `chat-last`,
      type: "chat-bg",
      group: groupId,
      x: 0,
      y: 0,
      z: 0,
      w: bubbleWpx,
      h: bubbleHpx,
      scale: 1,
      layer,
      interactive: false,
      draggable: false,
      visible: true,
      data: { isUser },
    });

    const roleTile = textTile({
      id: `chat-last-role`,
      text: isUser ? "You" : "Gemini",
      fontPx: CHAT_ROLE_PX,
      fontWeight: "bold",
      color: roleColor,
      bg: isUser ? "#1a2a3a" : "#1a1a2e",
      x: 0,
      y: 0,
      layer,
    });
    const rolePos = placeInCard({
      cardX: 0, cardY: 0, cardWpx: bubbleWpx, cardHpx: bubbleHpx,
      leftPx: 8, topPx: 6,
      tileWpx: roleTile.w, tileHpx: roleTile.h,
    });
    roleTile.x = rolePos.x;
    roleTile.y = rolePos.y;
    roleTile.z = 0.04;
    roleTile.group = groupId;
    tiles.push(roleTile);

    const bodyTile = textBlockTile({
      id: `chat-last-body`,
      text: lastMsg.content,
      fontPx: CHAT_BODY_PX,
      fontWeight: "normal",
      color: "#e6edf3",
      bg: isUser ? "#1a2a3a" : "#1a1a2e",
      maxWidthPx: bubbleWpx - 16,
      lineHeightPx: 12,
      maxLines: 3,
      x: 0,
      y: 0,
      layer,
    });
    const bodyPos = placeInCard({
      cardX: 0, cardY: 0, cardWpx: bubbleWpx, cardHpx: bubbleHpx,
      leftPx: 8, topPx: 20,
      tileWpx: bodyTile.w, tileHpx: bodyTile.h,
    });
    bodyTile.x = bodyPos.x;
    bodyTile.y = bodyPos.y;
    bodyTile.z = 0.04;
    bodyTile.group = groupId;
    tiles.push(bodyTile);
  }

  // --- Voice indicators ---
  if (isListening) {
    tiles.push({
      id: "mic",
      type: "mic-indicator",
      x: MAP_W / (2 * PIXELS_PER_CM) - 2,
      y: chatBaseY,
      z: 0.8,
      ...SIZES.mic,
      scale: 1,
      layer,
      interactive: false,
      draggable: false,
      visible: true,
      data: { isListening },
    });

    if (voiceTranscript) {
      tiles.push({
        id: "voice-transcript",
        type: "voice-transcript",
        x: 0,
        y: chatBaseY - 2,
        z: 0.8,
        ...SIZES.transcript,
        scale: 1,
        layer,
        interactive: false,
        draggable: false,
        visible: true,
        data: { transcript: voiceTranscript },
      });
    }
  }

  // --- Hover glow (always exists, hidden by default) ---
  tiles.push({
    id: "hover-glow",
    type: "hover-glow",
    x: -100,
    y: -100,
    z: 1.5,
    ...SIZES.hoverGlow,
    scale: 1,
    layer: 1,
    interactive: false,
    draggable: false,
    visible: false,
    data: {},
  });

  return { tiles, groups };
}

/**
 * Build a content hash for a tile descriptor.
 * Used for dirty tracking - if hash changes, tile needs re-render.
 */
export function tileHash(desc: TileDescriptor): string {
  // For tiles with no dynamic data, use type+id
  switch (desc.type) {
    case "header":
      return `${desc.data.room}|${desc.data.channelReady}|${desc.data.deviceId}|${desc.data.agentCount}|${desc.data.activeCount}|${desc.data.memoryCount}|${desc.data.contextCount}`;
    case "agent-dot":
      return `${desc.data.name}|${desc.data.isActive}|${desc.data.isSelected}|${desc.data.memoryCount}`;
    case "mem-bg":
      return `${desc.data.inContext}|${desc.data.bg}|${desc.data.border}`;
    case "mem-bar":
      return `${desc.data.color}`;
    case "text":
      return `${desc.data.text}|${desc.data.font}|${desc.data.color}|${desc.data.bg}|${desc.data.align}`;
    case "text-block":
      return `${desc.data.text}|${desc.data.font}|${desc.data.color}|${desc.data.bg}|${desc.data.maxWidth}|${desc.data.maxLines}`;
    case "ctx-bg":
      return `${desc.data.memoryId}|${desc.data.bg}|${desc.data.border}`;
    case "ctx-bar":
      return `${desc.data.color}`;
    case "chat-bg":
      return `${desc.data.isUser}`;
    case "mem-card":
      return `${desc.data.memoryId}|${desc.data.inContext}`;
    case "ctx-card":
      return `${desc.data.memoryId}|${desc.data.agent}`;
    case "prompt-btn":
      return `${desc.data.label}|${desc.data.disabled}|${desc.data.loading}`;
    case "chat-bubble":
      return `${desc.data.ts}|${desc.data.content}`;
    case "chat-loading":
      return `loading-${desc.data.dotPhase}`;
    case "page-nav":
      return `${desc.data.page}|${desc.data.totalPages}`;
    case "mic-indicator":
      return `${desc.data.isListening}`;
    case "voice-transcript":
      return `${desc.data.transcript}`;
    case "ctx-header":
      return `ctx-${desc.data.count}`;
    case "agent-map":
      // Update every ~500ms (flowOffset changes continuously, throttle hash)
      return `map-${Math.floor((desc.data.flowOffset as number) / 4)}|${(desc.data.agents as unknown[])?.length}`;
    case "panel-bg":
      return "bg"; // never changes
    case "mascot":
      return `mascot-${desc.data.mood}-${desc.data.time}`;
    default:
      return desc.id;
  }
}
