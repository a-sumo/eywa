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

export interface ContextItem {
  memoryId: string;
  agent: string;
  content: string;
}

// --- Tile pixel sizes ---
const SIZES = {
  panelBg:    { w: 640, h: 480 },  // background container (low detail, just solid fill)
  header:     { w: 400, h: 120 },
  agentDot:   { w: 120, h: 24 },
  memHeader:  { w: 220, h: 20 },
  memCard:    { w: 220, h: 42 },
  ctxHeader:  { w: 180, h: 20 },
  ctxCard:    { w: 180, h: 36 },
  ctxEmpty:   { w: 180, h: 60 },
  promptBtn:  { w: 180, h: 40 },
  chatBubble: { w: 220, h: 60 },
  chatEmpty:  { w: 220, h: 60 },
  chatLoading:{ w: 220, h: 40 },
  pageNav:    { w: 220, h: 24 },
  mic:        { w: 80,  h: 20 },
  transcript: { w: 220, h: 28 },
  hoverGlow:  { w: 230, h: 48 }, // no texture, colored quad
};

// --- Layout constants (cm, from SPECTACLES_ERGONOMICS.md) ---
const PIXELS_PER_CM = 16;
const COL_LEFT = -10;    // left column x center
const COL_RIGHT = 10;    // right column x center
const TOP_Y = 14;        // top of content area
const ROW_GAP = 0.3;     // gap between tiles (cm)
const AGENT_GAP = 0.15;
const CARD_H_CM = 2.4;   // memory card height in cm
const CTX_CARD_H_CM = 2.0;
const BTN_H_CM = 2.4;
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
// Groups act as stacking contexts. Each group sits at a base Z depth,
// and child tiles get Z offsets relative to the group. This prevents
// Z-fighting between elements at different hierarchy levels.

// Group Z depths (assigned to groups based on visual role)
const GROUP_Z_HEADER = 0.5;   // header section
const GROUP_Z_AGENTS = 0.5;   // agent dot row
const GROUP_Z_CARDS  = 0.8;   // content cards (memory, context, prompt, chat)

// Ungrouped tile Z positions (tiles not in any group)
const Z_SECTION_HDR  = 0.3;   // section headers (mem-header, ctx-header)
const Z_STANDALONE   = 0.3;   // standalone tiles (page-nav, chat-empty, etc.)
const Z_HOVER_GLOW   = 1.5;   // hover glow overlay, in front of all content

// Local Z offsets within a group (relative to group Z)
// Wider spacing than before (was 0.03cm) to eliminate Z-fighting
const Z_BG   = 0.0;    // card background
const Z_BAR  = 0.1;    // accent bar
const Z_TEXT = 0.2;    // text content
const Z_ICON = 0.2;    // icons (same depth as text)
const Z_OVER = 0.3;    // overlays (checkmarks, remove buttons)

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
    x: (COL_LEFT + COL_RIGHT) / 2,
    y: 0,
    z: 0, // at z=0, behind content at z=0.05
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
  const headerX = (COL_LEFT + COL_RIGHT) / 2;
  const headerY = TOP_Y + 2;
  const headerWpx = SIZES.header.w;
  const headerHpx = SIZES.header.h;
  const headerBg = "#0d0d18";
  const headerGroup = "g-header";

  groups.push({ id: headerGroup, x: headerX, y: headerY, z: GROUP_Z_HEADER, zone: "header" });

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

  // ---- Agent dots (atomic: tiny dot + name text) ----
  const agentY = TOP_Y - HEADER_H_CM + 0.5;
  agents.slice(0, 8).forEach((agent, i) => {
    const baseId = `agent-${i}`;
    const dotX = COL_LEFT - 4 + i * 3.2;
    const dotY = agentY;
    const isSelected = selectedAgent === agent.name;
    const color = agentColor(agent.name);
    const groupId = `g-agent-${i}`;

    groups.push({ id: groupId, x: dotX, y: dotY, z: GROUP_Z_AGENTS, zone: "left" });

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

    groups.push({ id: groupId, x: cardX, y: cardY, z: GROUP_Z_CARDS, zone: "left" });

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

  // ---- RIGHT COLUMN: Context + Prompts/Chat ----
  let rightY = agentY - SECTION_HDR_CM - ROW_GAP;

  // Context section header
  tiles.push({
    id: "ctx-header",
    type: "ctx-header",
    x: COL_RIGHT,
    y: rightY,
    z: Z_SECTION_HDR,
    ...SIZES.ctxHeader,
    scale: 1,
    layer,
    interactive: false,
    draggable: false,
    visible: true,
    data: { count: contextItems.length },
  });
  rightY -= SECTION_HDR_CM;

  if (contextItems.length === 0) {
    // Empty context placeholder
    tiles.push({
      id: "ctx-empty",
      type: "ctx-empty",
      x: COL_RIGHT,
      y: rightY,
      z: Z_STANDALONE,
      ...SIZES.ctxEmpty,
      scale: 1,
      layer,
      interactive: false,
      draggable: false,
      visible: true,
      data: {},
    });
    rightY -= 3.5;
  } else {
    // Context cards (atomic)
    contextItems.slice(0, 6).forEach((item, i) => {
      const cardX = COL_RIGHT;
      const cardY = rightY - i * (CTX_CARD_H_CM + ROW_GAP);
      const cardWpx = SIZES.ctxCard.w;
      const cardHpx = SIZES.ctxCard.h;
      const bg = "#151520";
      const border = "#30363d";
      const color = agentColor(item.agent);
      const groupId = `g-ctx-${item.memoryId}`;

      groups.push({ id: groupId, x: cardX, y: cardY, z: GROUP_Z_CARDS, zone: "right" });

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
        x: 0,
        y: 0,
        layer,
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
    rightY -= contextItems.length * (CTX_CARD_H_CM + ROW_GAP) + ROW_GAP;
  }

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

    groups.push({ id: groupId, x: btnX, y: btnY, z: GROUP_Z_CARDS, zone: "action" });

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

      groups.push({ id: groupId, x: bubbleX, y: bubbleY, z: GROUP_Z_CARDS, zone: "right" });

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
    case "panel-bg":
      return "bg"; // never changes
    default:
      return desc.id;
  }
}
