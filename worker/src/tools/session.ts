import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SupabaseClient } from "../lib/supabase.js";
import type { RemixContext } from "../lib/types.js";

function estimateTokens(text: string): number {
  return text ? Math.floor(text.length / 4) : 0;
}

export function registerSessionTools(
  server: McpServer,
  db: SupabaseClient,
  ctx: RemixContext,
) {
  server.tool(
    "remix_whoami",
    "Check your agent identity, session, and room.",
    {},
    async () => ({
      content: [
        {
          type: "text" as const,
          text: `Agent: ${ctx.agent}\nSession: ${ctx.sessionId}\nRoom: /${ctx.roomSlug} (${ctx.roomName})`,
        },
      ],
    }),
  );

  server.tool(
    "remix_start",
    "Start logging this session. Call this when beginning work on a task.",
    { task_description: z.string().describe("Brief description of what you're working on") },
    async ({ task_description }) => {
      await db.insert("memories", {
        room_id: ctx.roomId,
        agent: ctx.agent,
        session_id: ctx.sessionId,
        message_type: "resource",
        content: `SESSION START: ${task_description}`,
        token_count: estimateTokens(task_description),
        metadata: { event: "session_start", task: task_description },
      });
      return {
        content: [
          {
            type: "text" as const,
            text: `Logging started for: ${task_description}\nSession: ${ctx.sessionId} in room /${ctx.roomSlug}\nRemember to call remix_log for important exchanges.`,
          },
        ],
      };
    },
  );

  server.tool(
    "remix_stop",
    "Stop logging and save a session summary.",
    { summary: z.string().describe("Summary of what was accomplished") },
    async ({ summary }) => {
      await db.insert("memories", {
        room_id: ctx.roomId,
        agent: ctx.agent,
        session_id: ctx.sessionId,
        message_type: "resource",
        content: `SESSION END: ${summary}`,
        token_count: estimateTokens(summary),
        metadata: { event: "session_end", summary },
      });
      return {
        content: [{ type: "text" as const, text: "Session ended. Summary logged." }],
      };
    },
  );
}
