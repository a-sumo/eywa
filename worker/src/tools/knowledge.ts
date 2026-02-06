import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SupabaseClient } from "../lib/supabase.js";
import type { RemixContext, MemoryRow } from "../lib/types.js";

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

export function registerKnowledgeTools(
  server: McpServer,
  db: SupabaseClient,
  ctx: RemixContext,
) {
  server.tool(
    "remix_learn",
    "Store persistent project knowledge that survives across sessions. Use for architecture decisions, conventions, gotchas, API patterns, or anything future sessions should know.",
    {
      content: z.string().describe("The knowledge to store"),
      tags: z.array(z.string()).optional().describe("Tags for categorization (e.g. 'architecture', 'api', 'convention', 'gotcha')"),
      title: z.string().optional().describe("Short title for quick scanning"),
    },
    async ({ content, tags, title }) => {
      const parentId = await getLatestMemoryId(db, ctx.roomId, ctx.sessionId);
      await db.insert("memories", {
        room_id: ctx.roomId,
        agent: ctx.agent,
        session_id: ctx.sessionId,
        parent_id: parentId,
        message_type: "knowledge",
        content: `${title ? `[${title}] ` : ""}${content}`,
        token_count: estimateTokens(content),
        metadata: {
          event: "knowledge_stored",
          tags: tags ?? [],
          title: title ?? null,
          stored_by: ctx.agent,
        },
      });
      return {
        content: [{
          type: "text" as const,
          text: `Knowledge stored${title ? `: "${title}"` : ""}${tags?.length ? ` [${tags.join(", ")}]` : ""}`,
        }],
      };
    },
  );

  server.tool(
    "remix_knowledge",
    "Retrieve the project knowledge base. Returns persistent context accumulated across all sessions — architecture decisions, conventions, gotchas, patterns.",
    {
      tag: z.string().optional().describe("Filter by tag"),
      search: z.string().optional().describe("Search within knowledge content"),
      limit: z.number().optional().default(20).describe("Maximum entries to return"),
    },
    async ({ tag, search, limit }) => {
      const params: Record<string, string> = {
        select: "id,agent,content,metadata,ts",
        room_id: `eq.${ctx.roomId}`,
        message_type: "eq.knowledge",
        order: "ts.desc",
        limit: String(limit),
      };

      if (search) {
        params.content = `ilike.*${search}*`;
      }

      const rows = await db.select<MemoryRow>("memories", params);

      // Client-side tag filter (PostgREST array containment on jsonb is tricky)
      const filtered = tag
        ? rows.filter((r) => {
            const meta = r.metadata as Record<string, unknown>;
            const tags = (meta.tags as string[]) ?? [];
            return tags.includes(tag);
          })
        : rows;

      if (!filtered.length) {
        return {
          content: [{
            type: "text" as const,
            text: tag || search
              ? `No knowledge entries found${tag ? ` with tag "${tag}"` : ""}${search ? ` matching "${search}"` : ""}.`
              : "Knowledge base is empty. Use remix_learn to store project knowledge.",
          }],
        };
      }

      const lines = [`Knowledge base (${filtered.length} entries):\n`];
      for (const m of filtered) {
        const meta = m.metadata as Record<string, unknown>;
        const tags = (meta.tags as string[]) ?? [];
        const title = meta.title as string | null;
        const storedBy = meta.stored_by as string;
        const tagStr = tags.length ? ` {${tags.join(", ")}}` : "";
        const titleStr = title ? `**${title}**\n  ` : "";
        lines.push(`${titleStr}${m.content?.replace(/^\[[^\]]*\]\s*/, "").slice(0, 500) ?? ""}${tagStr}\n  — ${storedBy}, ${m.ts}`);
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n\n") }],
      };
    },
  );

  server.tool(
    "remix_forget",
    "Remove a knowledge entry by its ID. Use when knowledge is outdated or incorrect.",
    {
      knowledge_id: z.string().describe("The ID of the knowledge entry to remove"),
    },
    async ({ knowledge_id }) => {
      try {
        await db.delete("memories", {
          id: `eq.${knowledge_id}`,
          room_id: `eq.${ctx.roomId}`,
          message_type: "eq.knowledge",
        });
      } catch (err) {
        return {
          content: [{
            type: "text" as const,
            text: `Failed to remove knowledge entry: ${err instanceof Error ? err.message : String(err)}`,
          }],
        };
      }

      return {
        content: [{ type: "text" as const, text: `Knowledge entry ${knowledge_id} removed.` }],
      };
    },
  );
}
