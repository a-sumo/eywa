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
    "[COORDINATION] Get shared context from all agents. See what others are working on, including what systems they're operating on.",
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
        fold_id: `eq.${ctx.foldId}`,
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
    "[COORDINATION] List all agents that have logged to Eywa in this fold.",
    {},
    {
      readOnlyHint: true,
      destructiveHint: false,
    },
    async () => {
      // Only look at last 24h, cap rows to avoid unbounded scan
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const rows = await db.select<MemoryRow>("memories", {
        select: "agent,ts",
        fold_id: `eq.${ctx.foldId}`,
        ts: `gte.${since}`,
        order: "ts.desc",
        limit: "500",
      });

      const agents = new Map<string, string>();
      for (const row of rows) {
        if (!agents.has(row.agent)) {
          agents.set(row.agent, row.ts);
        }
      }

      if (!agents.size) {
        return {
          content: [{ type: "text" as const, text: "No agents active in the last 24h." }],
        };
      }

      // Separate active (last 1h) from recent
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      const active: [string, string][] = [];
      const recent: [string, string][] = [];
      for (const [name, ts] of agents) {
        if (new Date(ts).getTime() > oneHourAgo) {
          active.push([name, ts]);
        } else {
          recent.push([name, ts]);
        }
      }

      const lines = [`Agents (${agents.size} in last 24h, ${active.length} active):`];
      if (active.length > 0) {
        lines.push("\nActive (last 1h):");
        for (const [name, ts] of active) {
          lines.push(`  ${name} (last: ${ts})`);
        }
      }
      if (recent.length > 0) {
        lines.push(`\nRecent (${recent.length} agents, 1-24h ago)`);
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    },
  );

  server.tool(
    "eywa_recall",
    "[COORDINATION] Recall messages from a specific agent.",
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
        fold_id: `eq.${ctx.foldId}`,
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
