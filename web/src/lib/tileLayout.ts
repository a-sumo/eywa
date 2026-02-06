/**
 * tileLayout.ts - Pure layout function for micro-tiles.
 *
 * Takes all UI state and returns a TileDescriptor[] describing every tile
 * that should exist, with positions in cm (Spectacles world units).
 * Positions are relative to the panel center.
 *
 * Called via useMemo - only recomputes when inputs change.
 */

import type { TileDescriptor, TileLayer } from "./microTile";
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
const COL_LEFT = -20;    // left column x center
const COL_RIGHT = 4;     // right column x center
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

/**
 * Compute the desired tile set for the current UI state.
 */
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
}): TileDescriptor[] {
  const {
    agents, memories, contextItems, chatMessages,
    chatLoading, chatError, memoryPage, selectedAgent,
    isListening, voiceTranscript, room, channelReady, deviceId,
  } = params;

  const tiles: TileDescriptor[] = [];
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

  // ---- Header (top, spanning both columns) ----
  const activeCount = agents.filter(a => a.isActive).length;
  tiles.push({
    id: "header",
    type: "header",
    x: (COL_LEFT + COL_RIGHT) / 2,
    y: TOP_Y + 2,
    ...SIZES.header,
    scale: 1,
    layer,
    interactive: false,
    draggable: false,
    visible: true,
    data: {
      room,
      channelReady,
      deviceId,
      agentCount: agents.length,
      activeCount,
      memoryCount: memories.length,
      contextCount: contextItems.length,
    },
  });

  // ---- Agent dots (below header, horizontal row) ----
  const agentY = TOP_Y - HEADER_H_CM + 0.5;
  agents.slice(0, 8).forEach((agent, i) => {
    tiles.push({
      id: `agent-${i}`,
      type: "agent-dot",
      x: COL_LEFT - 4 + i * 3.2,
      y: agentY,
      ...SIZES.agentDot,
      scale: 1,
      layer,
      interactive: true,
      draggable: false,
      visible: true,
      data: {
        name: agent.name,
        isActive: agent.isActive,
        memoryCount: agent.memoryCount,
        isSelected: selectedAgent === agent.name,
      },
    });
  });

  // ---- LEFT COLUMN: Memories ----
  let leftY = agentY - SECTION_HDR_CM - ROW_GAP;

  // Memories section header
  tiles.push({
    id: "mem-header",
    type: "mem-header",
    x: COL_LEFT,
    y: leftY,
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

  // Memory cards
  visibleMems.forEach((mem, i) => {
    const inContext = contextItems.some(c => c.memoryId === mem.id);
    tiles.push({
      id: `mem-${mem.id}`,
      type: "mem-card",
      x: COL_LEFT,
      y: leftY - i * (CARD_H_CM + ROW_GAP),
      ...SIZES.memCard,
      scale: 1,
      layer,
      interactive: true,
      draggable: true,
      visible: true,
      data: {
        memoryId: mem.id,
        agent: mem.agent,
        content: mem.content,
        ts: mem.ts,
        inContext,
        index: i,
      },
    });
  });

  leftY -= visibleMems.length * (CARD_H_CM + ROW_GAP);

  // Page nav (if multiple pages)
  if (totalPages > 1) {
    tiles.push({
      id: "page-nav",
      type: "page-nav",
      x: COL_LEFT,
      y: leftY - ROW_GAP,
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
    // Context cards
    contextItems.slice(0, 6).forEach((item, i) => {
      tiles.push({
        id: `ctx-${item.memoryId}`,
        type: "ctx-card",
        x: COL_RIGHT,
        y: rightY - i * (CTX_CARD_H_CM + ROW_GAP),
        ...SIZES.ctxCard,
        scale: 1,
        layer,
        interactive: true,
        draggable: false,
        visible: true,
        data: {
          memoryId: item.memoryId,
          agent: item.agent,
          content: item.content,
          index: i,
        },
      });
    });
    rightY -= contextItems.length * (CTX_CARD_H_CM + ROW_GAP) + ROW_GAP;
  }

  // ---- Quick prompts ----
  const promptsDisabled = contextItems.length === 0;
  QUICK_PROMPTS.forEach((prompt, i) => {
    tiles.push({
      id: `prompt-${i}`,
      type: "prompt-btn",
      x: COL_RIGHT,
      y: rightY - i * (BTN_H_CM + ROW_GAP),
      ...SIZES.promptBtn,
      scale: 1,
      layer,
      interactive: !promptsDisabled,
      draggable: false,
      visible: true,
      data: {
        label: prompt.label,
        icon: prompt.icon,
        color: prompt.color,
        disabled: promptsDisabled,
        loading: chatLoading,
        index: i,
      },
    });
  });
  rightY -= QUICK_PROMPTS.length * (BTN_H_CM + ROW_GAP);

  // ---- Voice input indicators ----
  if (isListening) {
    tiles.push({
      id: "mic",
      type: "mic-indicator",
      x: COL_RIGHT + 8,
      y: TOP_Y - HEADER_H_CM + 0.5,
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
      ...SIZES.chatEmpty,
      scale: 1,
      layer,
      interactive: false,
      draggable: false,
      visible: true,
      data: {},
    });
  } else {
    // Show last few chat messages
    const maxBubbles = 3;
    const recentMessages = chatMessages.slice(-maxBubbles);
    recentMessages.forEach((msg, i) => {
      tiles.push({
        id: `chat-${msg.ts}`,
        type: "chat-bubble",
        x: COL_RIGHT,
        y: chatY - i * (BUBBLE_H_CM + ROW_GAP),
        ...SIZES.chatBubble,
        scale: 1,
        layer,
        interactive: false,
        draggable: false,
        visible: true,
        data: {
          role: msg.role,
          content: msg.content,
          ts: msg.ts,
        },
      });
    });
  }

  // ---- Hover glow overlay (always exists, moved by scene ops) ----
  tiles.push({
    id: "hover-glow",
    type: "hover-glow",
    x: -100, // off-screen by default
    y: -100,
    ...SIZES.hoverGlow,
    scale: 1,
    layer: 1,
    interactive: false,
    draggable: false,
    visible: false, // starts hidden
    data: {},
  });

  return tiles;
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
