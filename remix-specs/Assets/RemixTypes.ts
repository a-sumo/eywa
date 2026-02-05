// RemixTypes.ts — Shared types & layout constants for Remix AR Panel

export enum TabId {
  Memories = 0,
  Context = 1,
  Agent = 2,
}

export interface MemoryItem {
  id: string
  role: "user" | "assistant" | "tool_call"
  content: string
  agent: string
  timestamp: number // epoch ms
}

export interface ContextItem {
  id: string
  sourceMemory: MemoryItem
  addedAt: number
}

export interface AgentInfo {
  name: string
  status: "active" | "idle"
  sessionCount: number
  memoryCount: number
  lastActiveAt: number // epoch ms
  color: vec4
}

// Layout constants in cm (world units)
export const PANEL_WIDTH = 32
export const PANEL_HEIGHT = 24
export const TAB_HEIGHT = 3
export const TAB_WIDTH = 10
export const TAB_SPACING = 0.5
export const ITEM_HEIGHT = 2.5
export const ITEM_SPACING = 0.3
export const CONTENT_OFFSET_Y = -(TAB_HEIGHT + 1) // content starts below tab bar
export const TEXT_SIZE_BODY = 1.2
export const TEXT_SIZE_META = 0.9
export const TEXT_SIZE_TAB = 1.4
export const EXTRUSION_DEPTH = 0.01

// Role-based colors
export const COLOR_USER = new vec4(0.3, 0.5, 1.0, 1.0)       // blue
export const COLOR_ASSISTANT = new vec4(0.2, 0.8, 0.3, 1.0)   // green
export const COLOR_TOOL = new vec4(1.0, 0.85, 0.2, 1.0)       // yellow
export const COLOR_ACTIVE = new vec4(0.2, 0.9, 0.3, 1.0)      // green dot
export const COLOR_IDLE = new vec4(0.5, 0.5, 0.5, 1.0)        // gray dot
export const COLOR_TAB_ACTIVE = new vec4(1.0, 1.0, 1.0, 1.0)  // white
export const COLOR_TAB_INACTIVE = new vec4(0.6, 0.6, 0.6, 1.0) // dim gray

export function roleColor(role: MemoryItem["role"]): vec4 {
  switch (role) {
    case "user": return COLOR_USER
    case "assistant": return COLOR_ASSISTANT
    case "tool_call": return COLOR_TOOL
  }
}

export function timeAgo(timestamp: number): string {
  const now = Date.now()
  const diffSec = Math.floor((now - timestamp) / 1000)
  if (diffSec < 60) return diffSec + "s ago"
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return diffMin + "m ago"
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return diffHr + "h ago"
  return Math.floor(diffHr / 24) + "d ago"
}
