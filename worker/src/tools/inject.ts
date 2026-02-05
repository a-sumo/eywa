import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SupabaseClient } from "../lib/supabase.js";
import type { RemixContext, MemoryRow } from "../lib/types.js";

function estimateTokens(text: string): number {
  return text ? Math.floor(text.length / 4) : 0;
}

export function registerInjectTools(
  server: McpServer,
  db: SupabaseClient,
  ctx: RemixContext,
) {
  server.tool(
    "remix_inject",
    "Push curated context or instructions to another agent. They'll see it in their inbox next time they check.",
    {
      target: z.string().describe("Target agent name, or 'all' for broadcast"),
      content: z.string().describe("The context, instructions, or information to inject"),
      priority: z.enum(["normal", "high", "urgent"]).optional().default("normal").describe("Priority level"),
      label: z.string().optional().describe("Short label (e.g. 'code review feedback', 'architecture decision')"),
    },
    async ({ target, content, priority, label }) => {
      await db.insert("memories", {
        room_id: ctx.roomId,
        agent: ctx.agent,
        session_id: ctx.sessionId,
        message_type: "injection",
        content: `[INJECT → ${target}]${label ? ` (${label})` : ""}: ${content}`,
        token_count: estimateTokens(content),
        metadata: {
          event: "context_injection",
          from_agent: ctx.agent,
          target_agent: target,
          priority,
          label: label ?? null,
        },
      });
      return {
        content: [{
          type: "text" as const,
          text: `Context injected for ${target === "all" ? "all agents" : target}${label ? ` [${label}]` : ""} (${priority} priority).`,
        }],
      };
    },
  );

  server.tool(
    "remix_inbox",
    "Check for context injections sent to you by other agents or the user. Call this periodically to stay in sync.",
    {
      limit: z.number().optional().default(10).describe("Maximum injections to retrieve"),
    },
    async ({ limit }) => {
      // Get injections targeted at this agent (full agent id)
      const targeted = await db.select<MemoryRow>("memories", {
        select: "id,agent,content,metadata,ts",
        room_id: `eq.${ctx.roomId}`,
        message_type: "eq.injection",
        "metadata->>target_agent": `eq.${ctx.agent}`,
        order: "ts.desc",
        limit: String(limit),
      });

      // Get injections targeted at the user name (e.g. "armand" matches "armand/quiet-oak")
      const userTargeted = await db.select<MemoryRow>("memories", {
        select: "id,agent,content,metadata,ts",
        room_id: `eq.${ctx.roomId}`,
        message_type: "eq.injection",
        "metadata->>target_agent": `eq.${ctx.user}`,
        order: "ts.desc",
        limit: String(limit),
      });

      // Get broadcast injections
      const broadcast = await db.select<MemoryRow>("memories", {
        select: "id,agent,content,metadata,ts",
        room_id: `eq.${ctx.roomId}`,
        message_type: "eq.injection",
        "metadata->>target_agent": "eq.all",
        order: "ts.desc",
        limit: String(limit),
      });

      // Merge, deduplicate, sort by time
      const seen = new Set<string>();
      const all: MemoryRow[] = [];
      for (const row of [...targeted, ...userTargeted, ...broadcast]) {
        if (!seen.has(row.id)) {
          seen.add(row.id);
          all.push(row);
        }
      }
      all.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
      const results = all.slice(0, limit);

      if (!results.length) {
        return {
          content: [{ type: "text" as const, text: "Inbox empty — no injections pending." }],
        };
      }

      const lines = [`Inbox (${results.length} injection${results.length > 1 ? "s" : ""}):\n`];
      for (const m of results) {
        const meta = m.metadata as Record<string, unknown>;
        const pri = meta.priority === "urgent" ? " [URGENT]" : meta.priority === "high" ? " [HIGH]" : "";
        const from = meta.from_agent as string;
        const label = meta.label ? ` (${meta.label})` : "";
        const content = m.content?.replace(/^\[INJECT[^\]]*\]\s*(\([^)]*\)\s*)?:\s*/, "") ?? "";
        lines.push(`From ${from}${pri}${label}:\n  ${content.slice(0, 500)}\n  — ${m.ts}`);
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n\n") }],
      };
    },
  );
}
