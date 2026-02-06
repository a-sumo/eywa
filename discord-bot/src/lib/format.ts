import { EmbedBuilder } from "discord.js";

// ── Brand palette ───────────────────────────────────────────────

export const Colors = {
  BRAND: 0x7c3aed, // Purple  — default / brand
  SUCCESS: 0x10b981, // Green   — active / success
  WARNING: 0xf59e0b, // Amber   — idle / warning
  ERROR: 0xef4444, // Red     — error / failed
  INFO: 0x3b82f6, // Blue    — messages / injection
  KNOWLEDGE: 0x6366f1, // Indigo  — knowledge base
  MUTED: 0x6b7280, // Gray    — secondary
} as const;

// ── Time formatting ─────────────────────────────────────────────

export function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ── Text helpers ────────────────────────────────────────────────

export function truncate(text: string, max = 200): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "\u2026";
}

/** Clamp an embed description to Discord's 4096-char limit */
export function clampDescription(lines: string[], maxLen = 3900): string {
  let result = "";
  let count = 0;
  for (const line of lines) {
    if (result.length + line.length + 2 > maxLen) {
      result += `\n\n*\u2026and ${lines.length - count} more*`;
      break;
    }
    result += (count > 0 ? "\n\n" : "") + line;
    count++;
  }
  return result;
}

// ── Status indicators ───────────────────────────────────────────

export function statusEmoji(status: string): string {
  const map: Record<string, string> = {
    active: "\u{1F7E2}",
    idle: "\u{1F7E1}",
    finished: "\u26AB",
    completed: "\u2705",
    failed: "\u274C",
    blocked: "\u{1F534}",
    partial: "\u{1F7E0}",
  };
  return map[status] ?? "\u26AA";
}

export function typeEmoji(type: string | null, event?: string): string {
  if (event === "session_start") return "\u25B6\uFE0F";
  if (event === "session_end" || event === "session_done") return "\u23F9\uFE0F";
  const map: Record<string, string> = {
    assistant: "\u{1F4DD}",
    user: "\u{1F464}",
    tool_call: "\u{1F527}",
    tool_result: "\u{1F4CB}",
    injection: "\u{1F489}",
    knowledge: "\u{1F4DA}",
    resource: "\u{1F504}",
  };
  return map[type ?? ""] ?? "\u25AA\uFE0F";
}

export function priorityLabel(p: string): string {
  if (p === "urgent") return " \u{1F6A8} **URGENT**";
  if (p === "high") return " \u26A0\uFE0F **HIGH**";
  return "";
}

// ── Embed builders ──────────────────────────────────────────────

export function makeEmbed(room?: string) {
  const embed = new EmbedBuilder().setTimestamp();
  if (room) embed.setFooter({ text: `\u{1F3E0} /${room}` });
  return embed;
}

export function errorEmbed(msg: string, room?: string) {
  return makeEmbed(room)
    .setDescription(`\u26A0\uFE0F ${msg}`)
    .setColor(Colors.WARNING);
}

export function emptyEmbed(msg: string, room?: string) {
  return makeEmbed(room).setDescription(msg).setColor(Colors.MUTED);
}
