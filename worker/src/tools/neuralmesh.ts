import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SupabaseClient } from "../lib/supabase.js";
import type { EywaContext, MemoryRow } from "../lib/types.js";

export function registerNeuralmeshTools(
  server: McpServer,
  db: SupabaseClient,
  ctx: EywaContext,
) {
  server.tool(
    "neuralmesh_status",
    "See what all agents are currently working on in this room.",
    {},
    async () => {
      const rows = await db.select<MemoryRow>("memories", {
        select: "agent,content,ts,metadata",
        room_id: `eq.${ctx.roomId}`,
        order: "ts.desc",
      });

      if (!rows.length) {
        return {
          content: [{ type: "text" as const, text: "No agents active." }],
        };
      }

      const agents = new Map<
        string,
        { status: string; description: string; lastSeen: string }
      >();

      for (const row of rows) {
        if (agents.has(row.agent)) continue;

        const meta = (row.metadata ?? {}) as Record<string, string>;
        const task = meta.task ?? "";
        const event = meta.event ?? "";
        const summary = meta.summary ?? "";

        let status = "idle";
        let description = row.content?.slice(0, 200) ?? "";

        if (event === "session_start") {
          status = "active";
          description = task || description;
        } else if (event === "session_end") {
          status = "finished";
          description = summary || description;
        }

        agents.set(row.agent, { status, description, lastSeen: row.ts });
      }

      const lines = ["=== Remix Agent Status ===\n"];
      for (const [name, info] of agents) {
        lines.push(
          `  ${name} [${info.status}] - ${info.description}\n    Last seen: ${info.lastSeen}`,
        );
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    },
  );

  server.tool(
    "neuralmesh_pull",
    "Pull recent context from another agent's session.",
    {
      agent: z.string().describe("Agent name to pull context from"),
      limit: z.number().optional().default(20).describe("Maximum memories to retrieve"),
    },
    async ({ agent, limit }) => {
      const rows = await db.select<MemoryRow>("memories", {
        select: "message_type,content,ts,metadata",
        room_id: `eq.${ctx.roomId}`,
        agent: `eq.${agent}`,
        order: "ts.desc",
        limit: String(limit),
      });

      if (!rows.length) {
        return {
          content: [
            { type: "text" as const, text: `No context found for agent '${agent}'` },
          ],
        };
      }

      const lines = [`=== Context from ${agent} (${rows.length} items) ===\n`];
      for (const m of [...rows].reverse()) {
        const meta = (m.metadata ?? {}) as Record<string, string>;
        let prefix = `[${m.message_type}]`;
        if (meta.event) prefix = `[${meta.event}]`;
        if (meta.path) prefix += ` (${meta.path})`;
        lines.push(`${prefix}: ${m.content ?? ""}`);
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n\n") }],
      };
    },
  );

  server.tool(
    "neuralmesh_sync",
    "Sync another agent's current session history into your context.",
    {
      agent: z.string().describe("Agent name to sync from"),
    },
    async ({ agent }) => {
      // Find their most recent session
      const sessionRows = await db.select<MemoryRow>("memories", {
        select: "session_id",
        room_id: `eq.${ctx.roomId}`,
        agent: `eq.${agent}`,
        order: "ts.desc",
        limit: "1",
      });

      if (!sessionRows.length) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No sessions found for agent '${agent}'`,
            },
          ],
        };
      }

      const targetSession = sessionRows[0].session_id;

      const rows = await db.select<MemoryRow>("memories", {
        select: "message_type,content,ts,metadata",
        room_id: `eq.${ctx.roomId}`,
        agent: `eq.${agent}`,
        session_id: `eq.${targetSession}`,
        order: "ts.asc",
      });

      if (!rows.length) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No messages in ${agent}'s current session`,
            },
          ],
        };
      }

      const lines = [
        `=== Synced session from ${agent} (session: ${targetSession}, ${rows.length} items) ===\n`,
      ];
      for (const m of rows) {
        const meta = (m.metadata ?? {}) as Record<string, string>;
        const label = meta.event || m.message_type || "";
        lines.push(`[${m.ts}] ${label}: ${m.content ?? ""}`);
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n\n") }],
      };
    },
  );

  server.tool(
    "neuralmesh_msg",
    "Send a message to teammates via Remix.",
    {
      content: z.string().describe("Message text"),
      channel: z.string().optional().default("general").describe("Channel to send to"),
    },
    async ({ content, channel }) => {
      await db.insert("messages", {
        room_id: ctx.roomId,
        sender: ctx.agent,
        channel,
        content,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: `Message sent to #${channel} as ${ctx.agent}`,
          },
        ],
      };
    },
  );
}
