import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SupabaseClient } from "../lib/supabase.js";
import type { RemixContext, MemoryRow } from "../lib/types.js";

export function registerContextTools(
  server: McpServer,
  db: SupabaseClient,
  ctx: RemixContext,
) {
  server.tool(
    "remix_context",
    "Get shared context from all agents. See what others are working on.",
    {
      limit: z.number().optional().default(20).describe("Maximum messages to retrieve"),
    },
    async ({ limit }) => {
      const rows = await db.select<MemoryRow>("memories", {
        select: "agent,message_type,content,ts",
        room_id: `eq.${ctx.roomId}`,
        order: "ts.desc",
        limit: String(limit),
      });

      if (!rows.length) {
        return {
          content: [{ type: "text" as const, text: "No activity in Remix yet." }],
        };
      }

      const lines: string[] = [];
      for (const m of rows) {
        const content = m.content?.slice(0, 500) ?? "";
        lines.push(`[${m.agent}] ${m.message_type}: ${content}`);
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n\n") }],
      };
    },
  );

  server.tool(
    "remix_agents",
    "List all agents that have logged to Remix in this room.",
    {},
    async () => {
      const rows = await db.select<MemoryRow>("memories", {
        select: "agent,ts",
        room_id: `eq.${ctx.roomId}`,
        order: "ts.desc",
      });

      const agents = new Map<string, string>();
      for (const row of rows) {
        if (!agents.has(row.agent)) {
          agents.set(row.agent, row.ts);
        }
      }

      if (!agents.size) {
        return {
          content: [{ type: "text" as const, text: "No agents found." }],
        };
      }

      const lines = ["Agents in Remix:"];
      for (const [name, ts] of agents) {
        lines.push(`  ${name} (last: ${ts})`);
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    },
  );

  server.tool(
    "remix_recall",
    "Recall messages from a specific agent.",
    {
      agent: z.string().describe("Agent name to query"),
      limit: z.number().optional().default(20).describe("Maximum messages to retrieve"),
    },
    async ({ agent, limit }) => {
      const rows = await db.select<MemoryRow>("memories", {
        select: "message_type,content,ts,session_id",
        room_id: `eq.${ctx.roomId}`,
        agent: `eq.${agent}`,
        order: "ts.desc",
        limit: String(limit),
      });

      if (!rows.length) {
        return {
          content: [
            { type: "text" as const, text: `No messages from agent '${agent}'` },
          ],
        };
      }

      const lines = [`Messages from ${agent}:`];
      for (const m of rows) {
        const content = m.content?.slice(0, 500) ?? "";
        lines.push(`[${m.message_type}]: ${content}`);
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n\n") }],
      };
    },
  );
}
