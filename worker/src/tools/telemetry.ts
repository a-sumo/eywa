import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SupabaseClient } from "../lib/supabase.js";
import type { EywaContext, MemoryRow } from "../lib/types.js";

const VALID_PHASES = ["working", "thinking", "compacting", "waiting_approval", "idle", "error"] as const;

export function registerTelemetryTools(
  server: McpServer,
  db: SupabaseClient,
  ctx: EywaContext,
) {
  // Agent-callable heartbeat (pragmatic fallback until hosts emit notifications natively)
  server.tool(
    "eywa_heartbeat",
    "Report a heartbeat with your current phase and status. Call every few minutes during long tasks so the team can see you're alive. This is the agent-side fallback for MCP Host Telemetry (see docs/mcp-host-telemetry.md).",
    {
      phase: z.enum(VALID_PHASES).describe("Current phase: working, thinking, compacting, waiting_approval, idle, error"),
      tokens_used: z.number().optional().describe("Total tokens consumed this session"),
      tokens_limit: z.number().optional().describe("Context window limit"),
      detail: z.string().optional().describe("Brief description of current work"),
      files_active: z.array(z.string()).optional().describe("Files currently being modified"),
      subagents: z.number().optional().describe("Number of active sub-agents"),
    },
    {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async ({ phase, tokens_used, tokens_limit, detail, files_active, subagents }) => {
      const tokenPercent = tokens_used && tokens_limit
        ? Math.round((tokens_used / tokens_limit) * 100)
        : null;

      await db.insert("memories", {
        room_id: ctx.roomId,
        agent: ctx.agent,
        session_id: ctx.sessionId,
        message_type: "telemetry",
        content: detail || `heartbeat: ${phase}`,
        token_count: 0,
        metadata: {
          event: "heartbeat",
          phase,
          tokens_used: tokens_used ?? null,
          tokens_limit: tokens_limit ?? null,
          token_percent: tokenPercent,
          files_active: files_active ?? null,
          subagents: subagents ?? null,
          user: ctx.user,
        },
      });

      const parts = [`Heartbeat recorded: ${phase}`];
      if (tokenPercent !== null) parts.push(`${tokenPercent}% context used`);
      if (subagents) parts.push(`${subagents} sub-agents`);

      return {
        content: [{ type: "text" as const, text: parts.join(" | ") }],
      };
    },
  );
}

/**
 * Store a host telemetry notification. Called by the notification handler
 * registered in index.ts when a host emits lifecycle events.
 */
export async function storeHostTelemetry(
  db: SupabaseClient,
  ctx: EywaContext,
  notificationType: string,
  params: Record<string, unknown>,
): Promise<void> {
  const shortType = notificationType.replace("notifications/host.", "");

  await db.insert("memories", {
    room_id: ctx.roomId,
    agent: ctx.agent,
    session_id: ctx.sessionId,
    message_type: "telemetry",
    content: `host:${shortType}`,
    token_count: 0,
    metadata: {
      event: `host_${shortType}`,
      ...params,
      user: ctx.user,
    },
  });
}

/**
 * Get the latest telemetry for an agent in a room.
 * Used by HubView and Gemini steering to show real-time agent state.
 */
export async function getLatestTelemetry(
  db: SupabaseClient,
  roomId: string,
  agent?: string,
): Promise<MemoryRow[]> {
  const query: Record<string, string> = {
    select: "agent,content,metadata,ts",
    room_id: `eq.${roomId}`,
    message_type: "eq.telemetry",
    order: "ts.desc",
    limit: agent ? "1" : "20",
  };
  if (agent) query.agent = `eq.${agent}`;

  return db.select<MemoryRow>("memories", query);
}
