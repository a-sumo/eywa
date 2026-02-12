import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SupabaseClient } from "../lib/supabase.js";
import type { EywaContext, GlobalInsightRow, MemoryRow } from "../lib/types.js";

/** SHA-256 hash for anonymizing source identity */
async function hashSource(foldId: string, agent: string): Promise<string> {
  const data = new TextEncoder().encode(`${foldId}:${agent}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(hash);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

/** Extract keywords for matching (shared with relevance.ts but kept local to avoid circular deps) */
const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "must", "to", "of", "in",
  "for", "on", "with", "at", "by", "from", "as", "into", "through",
  "and", "but", "or", "not", "so", "yet", "if", "when", "where",
  "how", "what", "which", "who", "this", "that", "it", "its",
  "use", "using", "used", "get", "set", "add", "new", "make",
]);

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

/** Group insights by domain and score relevance to a task */
function computeRoutes(
  task: string,
  insights: GlobalInsightRow[],
): { domain: string; relevance: number; insights: GlobalInsightRow[] }[] {
  const keywords = extractKeywords(task);
  if (keywords.length === 0) return [];

  // Score each insight against the task
  const scored = insights.map(insight => {
    const text = `${insight.insight} ${insight.domain_tags.join(" ")}`.toLowerCase();
    let matches = 0;
    for (const kw of keywords) {
      if (text.includes(kw)) matches++;
    }
    return { insight, score: matches / keywords.length };
  }).filter(s => s.score > 0.15);

  // Group by primary domain tag
  const byDomain = new Map<string, { scores: number[]; insights: GlobalInsightRow[] }>();
  for (const { insight, score } of scored) {
    const domain = insight.domain_tags[0] || "general";
    const group = byDomain.get(domain) || { scores: [], insights: [] };
    group.scores.push(score);
    group.insights.push(insight);
    byDomain.set(domain, group);
  }

  // Compute per-domain relevance (average score weighted by count)
  const routes = Array.from(byDomain.entries()).map(([domain, group]) => {
    const avg = group.scores.reduce((a, b) => a + b, 0) / group.scores.length;
    const countBoost = Math.min(group.insights.length / 3, 1); // more insights = more signal
    return {
      domain,
      relevance: Math.round((avg * 0.7 + countBoost * 0.3) * 100) / 100,
      insights: group.insights.slice(0, 3), // top 3 per domain
    };
  });

  return routes.sort((a, b) => b.relevance - a.relevance).slice(0, 5);
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
      const sourceHash = await hashSource(ctx.foldId, ctx.agent);

      const rows = await db.insert<GlobalInsightRow>("global_insights", {
        insight,
        domain_tags: domain_tags ?? [],
        source_hash: sourceHash,
        room_id: ctx.foldId,
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

  server.tool(
    "eywa_route",
    "Get lane recommendations for a task based on cross-fold intelligence. Analyzes what approaches worked for similar tasks across the network and returns recommended routes. Like Waze for agent swarms: routing from real telemetry.",
    {
      task: z.string().optional().describe("Task or goal to get routing for. Defaults to the fold's destination milestones."),
    },
    {
      readOnlyHint: true,
      destructiveHint: false,
    },
    async ({ task }) => {
      // If no task provided, use the fold's destination milestones
      let routeQuery = task ?? "";
      if (!routeQuery) {
        const destRows = await db.select<MemoryRow>("memories", {
          select: "metadata",
          room_id: `eq.${ctx.foldId}`,
          message_type: "eq.knowledge",
          "metadata->>event": "eq.destination",
          order: "ts.desc",
          limit: "1",
        });
        if (destRows.length > 0) {
          const meta = (destRows[0].metadata ?? {}) as Record<string, unknown>;
          const milestones = (meta.milestones as string[]) || [];
          const progress = (meta.progress as Record<string, boolean>) || {};
          const remaining = milestones.filter(m => !progress[m]);
          routeQuery = remaining.length > 0
            ? remaining.join(" ")
            : (meta.destination as string) || "";
        }
      }

      if (!routeQuery) {
        return {
          content: [{
            type: "text" as const,
            text: "No task provided and no destination set. Use eywa_destination to set a destination, or pass a task description.",
          }],
        };
      }

      // Fetch global insights
      const insights = await db.select<GlobalInsightRow>("global_insights", {
        select: "id,insight,domain_tags,source_hash,upvotes,ts",
        order: "upvotes.desc,ts.desc",
        limit: "100",
      });

      if (!insights.length) {
        return {
          content: [{
            type: "text" as const,
            text: "Network is empty. No routing data available yet. Use eywa_publish_insight to contribute learnings.",
          }],
        };
      }

      const routes = computeRoutes(routeQuery, insights);

      if (routes.length === 0) {
        return {
          content: [{
            type: "text" as const,
            text: `No matching routes found for: "${routeQuery.slice(0, 100)}". The network has ${insights.length} insights but none match your task. Try broader terms or contribute your own learnings.`,
          }],
        };
      }

      const lines = [`Route recommendations for: ${routeQuery.slice(0, 150)}\n`];
      lines.push(`Analyzed ${insights.length} insights across the network.\n`);

      for (const route of routes) {
        const pct = Math.round(route.relevance * 100);
        lines.push(`[${route.domain}] (${pct}% match, ${route.insights.length} signals)`);
        for (const ins of route.insights) {
          const votes = ins.upvotes > 0 ? ` (+${ins.upvotes})` : "";
          lines.push(`  - ${ins.insight.slice(0, 200)}${votes}`);
        }
        lines.push("");
      }

      lines.push("These routes are derived from real agent telemetry across the network. Higher match % = more agents found success with this approach for similar tasks.");

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    },
  );
}
