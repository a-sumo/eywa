import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SupabaseClient } from "../lib/supabase.js";
import type { EywaContext, LinkRow, MemoryRow } from "../lib/types.js";

export function registerLinkTools(
  server: McpServer,
  db: SupabaseClient,
  ctx: EywaContext,
) {
  server.tool(
    "eywa_link",
    "Create a link connecting a specific memory to another session. Use this to reference, fork, or inject a memory into a different agent's session.",
    {
      source_memory_id: z.string().describe("UUID of the memory to link from"),
      target_agent: z.string().describe("Target agent name (e.g. 'armand/quiet-oak')"),
      target_session_id: z.string().describe("Target session ID to link to"),
      target_position: z.string().optional().default("head").describe("Where in the target session: 'head' (latest), 'start', or 'after:<memory_id>'"),
      link_type: z.enum(["reference", "inject", "fork"]).optional().default("reference").describe("Type of link: reference (read-only pointer), inject (push context), fork (branch off)"),
      label: z.string().optional().describe("Short label for the link"),
    },
    {
      readOnlyHint: false,
      idempotentHint: false,
    },
    async ({ source_memory_id, target_agent, target_session_id, target_position, link_type, label }) => {
      // Verify source memory exists
      const sourceMems = await db.select<MemoryRow>("memories", {
        select: "id,agent,session_id,content",
        id: `eq.${source_memory_id}`,
        limit: "1",
      });

      if (!sourceMems.length) {
        return {
          content: [{ type: "text" as const, text: `Memory not found: ${source_memory_id}` }],
        };
      }

      const source = sourceMems[0];

      const rows = await db.insert<LinkRow>("links", {
        room_id: ctx.roomId,
        source_memory_id,
        target_agent,
        target_session_id,
        target_position,
        link_type,
        created_by: ctx.agent,
        label: label ?? null,
        metadata: {
          source_agent: source.agent,
          source_session_id: source.session_id,
        },
      });

      const link = rows[0];
      const preview = source.content?.slice(0, 80) ?? "(no content)";

      return {
        content: [{
          type: "text" as const,
          text: `Link created (${link_type}): ${source.agent}/${source.session_id} -> ${target_agent}/${target_session_id} @${target_position}\nMemory: "${preview}"\nID: ${link.id}`,
        }],
      };
    },
  );

  server.tool(
    "eywa_links",
    "List links in this room. Shows connections between memories and sessions.",
    {
      limit: z.number().optional().default(20).describe("Maximum links to return"),
      target_agent: z.string().optional().describe("Filter by target agent"),
      link_type: z.string().optional().describe("Filter by link type"),
    },
    {
      readOnlyHint: true,
      destructiveHint: false,
    },
    async ({ limit, target_agent, link_type }) => {
      const params: Record<string, string> = {
        select: "id,source_memory_id,target_agent,target_session_id,target_position,link_type,created_by,label,ts",
        room_id: `eq.${ctx.roomId}`,
        order: "ts.desc",
        limit: String(limit),
      };

      if (target_agent) {
        params.target_agent = `eq.${target_agent}`;
      }
      if (link_type) {
        params.link_type = `eq.${link_type}`;
      }

      const links = await db.select<LinkRow>("links", params);

      if (!links.length) {
        return {
          content: [{ type: "text" as const, text: "No links found." }],
        };
      }

      const lines = [`${links.length} link${links.length > 1 ? "s" : ""}:\n`];
      for (const l of links) {
        const labelStr = l.label ? ` "${l.label}"` : "";
        lines.push(
          `[${l.link_type}]${labelStr} ${l.source_memory_id.slice(0, 8)}... -> ${l.target_agent}/${l.target_session_id.slice(0, 12)}... @${l.target_position} (by ${l.created_by}, ${l.ts})`
        );
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    },
  );

  server.tool(
    "eywa_unlink",
    "Delete a link by its ID.",
    {
      link_id: z.string().describe("UUID of the link to delete"),
    },
    {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
    },
    async ({ link_id }) => {
      await db.delete("links", {
        id: `eq.${link_id}`,
        room_id: `eq.${ctx.roomId}`,
      });

      return {
        content: [{ type: "text" as const, text: `Link ${link_id} deleted.` }],
      };
    },
  );

  server.tool(
    "eywa_fetch",
    "Fetch a specific memory by ID. Use this to pull context from another session into your current context.",
    {
      memory_id: z.string().describe("UUID of the memory to fetch"),
    },
    {
      readOnlyHint: true,
      destructiveHint: false,
    },
    async ({ memory_id }) => {
      const rows = await db.select<MemoryRow>("memories", {
        select: "id,agent,session_id,message_type,content,metadata,ts",
        id: `eq.${memory_id}`,
        room_id: `eq.${ctx.roomId}`,
        limit: "1",
      });

      if (!rows.length) {
        return {
          content: [{ type: "text" as const, text: `Memory not found: ${memory_id}` }],
        };
      }

      const m = rows[0];
      const meta = m.metadata as Record<string, unknown>;
      const opParts = [meta.system, meta.action, meta.outcome].filter(Boolean);
      const opTag = opParts.length > 0 ? `\nOperation: ${opParts.join(":")}` : "";
      const scopeStr = meta.scope ? `\nScope: ${meta.scope}` : "";

      return {
        content: [{
          type: "text" as const,
          text: `Memory ${m.id}:\nAgent: ${m.agent}\nSession: ${m.session_id}\nType: ${m.message_type}\nTime: ${m.ts}\n${meta.event ? `Event: ${meta.event}\n` : ""}${opTag}${scopeStr}---\n${m.content ?? "(no content)"}`,
        }],
      };
    },
  );
}
