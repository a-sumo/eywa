import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SupabaseClient } from "../lib/supabase.js";
import type { EywaContext, MemoryRow } from "../lib/types.js";

export function registerContextTools(
  server: McpServer,
  db: SupabaseClient,
  ctx: EywaContext,
) {
  server.tool(
    "eywa_context",
    "Get shared context from all agents. See what others are working on, including what systems they're operating on.",
    {
      limit: z.number().optional().default(20).describe("Maximum messages to retrieve"),
    },
    {
      readOnlyHint: true,
      destructiveHint: false,
    },
    async ({ limit }) => {
      const rows = await db.select<MemoryRow>("memories", {
        select: "agent,message_type,content,metadata,ts",
        room_id: `eq.${ctx.roomId}`,
        order: "ts.desc",
        limit: String(limit),
      });

      if (!rows.length) {
        return {
          content: [{ type: "text" as const, text: "No activity in Eywa yet." }],
        };
      }

      const lines: string[] = [];
      for (const m of rows) {
        const content = m.content?.slice(0, 500) ?? "";
        const meta = (m.metadata ?? {}) as Record<string, string>;
        const opParts = [meta.system, meta.action, meta.outcome].filter(Boolean);
        const opTag = opParts.length > 0 ? `  [${opParts.join(":")}]` : "";
        const scopeTag = meta.scope ? ` (${meta.scope})` : "";
        lines.push(`[${m.agent}] ${m.message_type}: ${content}${opTag}${scopeTag}`);
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n\n") }],
      };
    },
  );

  server.tool(
    "eywa_agents",
    "List all agents that have logged to Eywa in this room.",
    {},
    {
      readOnlyHint: true,
      destructiveHint: false,
    },
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

      const lines = ["Agents in Eywa:"];
      for (const [name, ts] of agents) {
        lines.push(`  ${name} (last: ${ts})`);
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    },
  );

  server.tool(
    "eywa_recall",
    "Recall messages from a specific agent.",
    {
      agent: z.string().describe("Agent name to query"),
      limit: z.number().optional().default(20).describe("Maximum messages to retrieve"),
    },
    {
      readOnlyHint: true,
      destructiveHint: false,
    },
    async ({ agent, limit }) => {
      const rows = await db.select<MemoryRow>("memories", {
        select: "message_type,content,metadata,ts,session_id",
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
        const meta = (m.metadata ?? {}) as Record<string, string>;
        const opParts = [meta.system, meta.action, meta.outcome].filter(Boolean);
        const opTag = opParts.length > 0 ? `  [${opParts.join(":")}]` : "";
        lines.push(`[${m.message_type}]: ${content}${opTag}`);
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n\n") }],
      };
    },
  );
}
