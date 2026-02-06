import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SupabaseClient } from "../lib/supabase.js";
import type { EywaContext, MemoryRow } from "../lib/types.js";

function estimateTokens(text: string): number {
  return text ? Math.floor(text.length / 4) : 0;
}

/** Get the latest memory ID for this session (for parent chaining) */
async function getLatestMemoryId(
  db: SupabaseClient,
  roomId: string,
  sessionId: string,
): Promise<string | null> {
  const rows = await db.select<MemoryRow>("memories", {
    select: "id",
    room_id: `eq.${roomId}`,
    session_id: `eq.${sessionId}`,
    order: "ts.desc",
    limit: "1",
  });
  return rows.length > 0 ? rows[0].id : null;
}

export function registerSessionTools(
  server: McpServer,
  db: SupabaseClient,
  ctx: EywaContext,
) {
  server.tool(
    "eywa_whoami",
    "Check your agent identity, session, and room.",
    {},
    async () => ({
      content: [
        {
          type: "text" as const,
          text: `Agent: ${ctx.agent}\nUser: ${ctx.user}\nSession: ${ctx.sessionId}\nRoom: /${ctx.roomSlug} (${ctx.roomName})`,
        },
      ],
    }),
  );

  server.tool(
    "eywa_start",
    "Start logging this session. Call this when beginning work on a task.",
    { task_description: z.string().describe("Brief description of what you're working on") },
    async ({ task_description }) => {
      const parentId = await getLatestMemoryId(db, ctx.roomId, ctx.sessionId);
      await db.insert("memories", {
        room_id: ctx.roomId,
        agent: ctx.agent,
        session_id: ctx.sessionId,
        parent_id: parentId,
        message_type: "resource",
        content: `SESSION START: ${task_description}`,
        token_count: estimateTokens(task_description),
        metadata: { event: "session_start", task: task_description, user: ctx.user },
      });
      return {
        content: [
          {
            type: "text" as const,
            text: `Logging started for: ${task_description}\nSession: ${ctx.sessionId} in room /${ctx.roomSlug}\nRemember to call eywa_log for important exchanges.`,
          },
        ],
      };
    },
  );

  server.tool(
    "eywa_stop",
    "Stop logging and save a session summary.",
    { summary: z.string().describe("Summary of what was accomplished") },
    async ({ summary }) => {
      const parentId = await getLatestMemoryId(db, ctx.roomId, ctx.sessionId);
      await db.insert("memories", {
        room_id: ctx.roomId,
        agent: ctx.agent,
        session_id: ctx.sessionId,
        parent_id: parentId,
        message_type: "resource",
        content: `SESSION END: ${summary}`,
        token_count: estimateTokens(summary),
        metadata: { event: "session_end", summary, user: ctx.user },
      });
      return {
        content: [{ type: "text" as const, text: "Session ended. Summary logged." }],
      };
    },
  );

  server.tool(
    "eywa_done",
    "Mark session as complete with structured summary, status, artifacts, and next steps. Use this instead of eywa_stop when you want to record what was accomplished.",
    {
      summary: z.string().describe("What was accomplished this session"),
      status: z.enum(["completed", "blocked", "failed", "partial"]).describe("Session outcome"),
      artifacts: z.array(z.string()).optional().describe("Key files or outputs produced"),
      tags: z.array(z.string()).optional().describe("Tags for categorization (e.g. 'bugfix', 'feature', 'refactor')"),
      next_steps: z.string().optional().describe("Suggested follow-up work for the next session"),
    },
    async ({ summary, status, artifacts, tags, next_steps }) => {
      const parentId = await getLatestMemoryId(db, ctx.roomId, ctx.sessionId);
      await db.insert("memories", {
        room_id: ctx.roomId,
        agent: ctx.agent,
        session_id: ctx.sessionId,
        parent_id: parentId,
        message_type: "resource",
        content: `SESSION DONE [${status.toUpperCase()}]: ${summary}${next_steps ? `\nNext steps: ${next_steps}` : ""}${artifacts?.length ? `\nArtifacts: ${artifacts.join(", ")}` : ""}`,
        token_count: estimateTokens(summary),
        metadata: {
          event: "session_done",
          status,
          summary,
          artifacts: artifacts ?? [],
          tags: tags ?? [],
          next_steps: next_steps ?? null,
          user: ctx.user,
        },
      });
      return {
        content: [{
          type: "text" as const,
          text: `Session marked as ${status}. Summary logged.${artifacts?.length ? `\nArtifacts: ${artifacts.join(", ")}` : ""}${tags?.length ? `\nTags: ${tags.join(", ")}` : ""}${next_steps ? `\nNext: ${next_steps}` : ""}`,
        }],
      };
    },
  );
}
