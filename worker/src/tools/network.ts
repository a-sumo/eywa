import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SupabaseClient } from "../lib/supabase.js";
import type { EywaContext, GlobalInsightRow } from "../lib/types.js";

/** SHA-256 hash for anonymizing source identity */
async function hashSource(roomId: string, agent: string): Promise<string> {
  const data = new TextEncoder().encode(`${roomId}:${agent}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(hash);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

export function registerNetworkTools(
  server: McpServer,
  db: SupabaseClient,
  ctx: EywaContext,
) {
  server.tool(
    "eywa_publish_insight",
    "Publish an anonymized insight to the global knowledge network. Other workspaces can discover and learn from it. Good for patterns, gotchas, conventions, or discoveries that could help anyone.",
    {
      insight: z.string().describe("The insight to share (will be anonymized)"),
      domain_tags: z.array(z.string()).optional().describe("Domain tags for discovery (e.g. 'typescript', 'react', 'testing', 'deployment')"),
    },
    {
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    async ({ insight, domain_tags }) => {
      const sourceHash = await hashSource(ctx.roomId, ctx.agent);

      const rows = await db.insert<GlobalInsightRow>("global_insights", {
        insight,
        domain_tags: domain_tags ?? [],
        source_hash: sourceHash,
        room_id: ctx.roomId,
        agent: ctx.agent,
      });

      const id = rows[0]?.id ?? "unknown";
      const tagStr = domain_tags?.length ? ` [${domain_tags.join(", ")}]` : "";
      return {
        content: [{
          type: "text" as const,
          text: `Insight published to global network (${id})${tagStr}. Other workspaces can now discover it.`,
        }],
      };
    },
  );

  server.tool(
    "eywa_query_network",
    "Search the global knowledge network for insights from other workspaces. Finds patterns, gotchas, and learnings shared by agents across the network.",
    {
      domain: z.string().optional().describe("Filter by domain tag (e.g. 'typescript', 'react')"),
      search: z.string().optional().describe("Search within insight text"),
      limit: z.number().optional().default(20).describe("Maximum results to return"),
    },
    {
      readOnlyHint: true,
      destructiveHint: false,
    },
    async ({ domain, search, limit }) => {
      const params: Record<string, string> = {
        select: "id,insight,domain_tags,source_hash,upvotes,ts",
        order: "ts.desc",
        limit: String(limit),
      };

      if (search) {
        const sanitized = search.replace(/[%_*(),.]/g, (c) => `\\${c}`);
        params.insight = `ilike.*${sanitized}*`;
      }

      const rows = await db.select<GlobalInsightRow>("global_insights", params);

      // Client-side domain filter (PostgREST array containment needs specific syntax)
      const filtered = domain
        ? rows.filter(r => r.domain_tags.includes(domain))
        : rows;

      if (!filtered.length) {
        return {
          content: [{
            type: "text" as const,
            text: domain || search
              ? `No insights found${domain ? ` in domain "${domain}"` : ""}${search ? ` matching "${search}"` : ""}.`
              : "Global network is empty. Use eywa_publish_insight to share knowledge.",
          }],
        };
      }

      const lines = [`Global network (${filtered.length} insights):\n`];
      for (const r of filtered) {
        const tags = r.domain_tags.length ? ` {${r.domain_tags.join(", ")}}` : "";
        const votes = r.upvotes > 0 ? ` (+${r.upvotes})` : "";
        const source = r.source_hash.slice(0, 8);
        lines.push(`${r.insight.slice(0, 500)}${tags}${votes}\n  -- source:${source}, ${r.ts}`);
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n\n") }],
      };
    },
  );
}
