import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SupabaseClient } from "../lib/supabase.js";
import type { EywaContext, MemoryRow, LinkRow } from "../lib/types.js";

function estimateTokens(text: string): number {
  return text ? Math.floor(text.length / 4) : 0;
}

/** Get the latest memory ID for this session (for parent chaining) */
async function getLatestMemoryId(
  db: SupabaseClient,
  foldId: string,
  sessionId: string,
): Promise<string | null> {
  const rows = await db.select<MemoryRow>("memories", {
    select: "id",
    fold_id: `eq.${foldId}`,
    session_id: `eq.${sessionId}`,
    order: "ts.desc",
    limit: "1",
  });
  return rows.length > 0 ? rows[0].id : null;
}

export function registerInjectTools(
  server: McpServer,
  db: SupabaseClient,
  ctx: EywaContext,
) {
  server.tool(
    "eywa_inject",
    "Push curated context or instructions to another agent. They'll see it in their inbox next time they check.",
    {
      target: z.string().max(128).regex(/^[a-zA-Z0-9_.\-\/]+$|^all$/, "Target must be an agent name (letters, numbers, hyphens, underscores, dots, slashes) or 'all'").describe("Target agent name, or 'all' for broadcast"),
      content: z.string().describe("The context, instructions, or information to inject"),
      priority: z.enum(["normal", "high", "urgent"]).optional().default("normal").describe("Priority level"),
      label: z.string().optional().describe("Short label (e.g. 'code review feedback', 'architecture decision')"),
    },
    {
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    async ({ target, content, priority, label }) => {
      const parentId = await getLatestMemoryId(db, ctx.foldId, ctx.sessionId);
      await db.insert("memories", {
        fold_id: ctx.foldId,
        agent: ctx.agent,
        session_id: ctx.sessionId,
        parent_id: parentId,
        message_type: "injection",
        content: `[INJECT -> ${target}]${label ? ` (${label})` : ""}: ${content}`,
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
    "eywa_inbox",
    "Check for context injections sent to you by other agents or the user. Call this periodically to stay in sync.",
    {
      limit: z.number().optional().default(10).describe("Maximum injections to retrieve"),
    },
    {
      readOnlyHint: true,
      destructiveHint: false,
    },
    async ({ limit }) => {
      // Get injections targeted at this agent (full agent id)
      const targeted = await db.select<MemoryRow>("memories", {
        select: "id,agent,content,metadata,ts",
        fold_id: `eq.${ctx.foldId}`,
        message_type: "eq.injection",
        "metadata->>target_agent": `eq.${ctx.agent}`,
        order: "ts.desc",
        limit: String(limit),
      });

      // Get injections targeted at the user name (e.g. "armand" matches "armand/quiet-oak")
      const userTargeted = await db.select<MemoryRow>("memories", {
        select: "id,agent,content,metadata,ts",
        fold_id: `eq.${ctx.foldId}`,
        message_type: "eq.injection",
        "metadata->>target_agent": `eq.${ctx.user}`,
        order: "ts.desc",
        limit: String(limit),
      });

      // Get broadcast injections
      const broadcast = await db.select<MemoryRow>("memories", {
        select: "id,agent,content,metadata,ts",
        fold_id: `eq.${ctx.foldId}`,
        message_type: "eq.injection",
        "metadata->>target_agent": "eq.all",
        order: "ts.desc",
        limit: String(limit),
      });

      // Get inject-type links targeting this agent's sessions
      const injectLinks = await db.select<LinkRow>("links", {
        select: "id,source_memory_id,created_by,label,ts",
        fold_id: `eq.${ctx.foldId}`,
        link_type: "eq.inject",
        target_agent: `eq.${ctx.agent}`,
        order: "ts.desc",
        limit: String(limit),
      });

      // Also check links targeting the user name
      const userInjectLinks = await db.select<LinkRow>("links", {
        select: "id,source_memory_id,created_by,label,ts",
        fold_id: `eq.${ctx.foldId}`,
        link_type: "eq.inject",
        target_agent: `eq.${ctx.user}`,
        order: "ts.desc",
        limit: String(limit),
      });

      // Fetch the source memories for inject links
      const linkMemoryIds = new Set<string>();
      for (const link of [...injectLinks, ...userInjectLinks]) {
        linkMemoryIds.add(link.source_memory_id);
      }

      let linkedMemories: MemoryRow[] = [];
      if (linkMemoryIds.size > 0) {
        const ids = Array.from(linkMemoryIds);
        linkedMemories = await db.select<MemoryRow>("memories", {
          select: "id,agent,content,metadata,ts",
          id: `in.(${ids.join(",")})`,
        });
      }

      // Build a map of link metadata by source memory ID
      const linkMetaByMemory = new Map<string, { createdBy: string; label: string | null; linkTs: string }>();
      for (const link of [...injectLinks, ...userInjectLinks]) {
        if (!linkMetaByMemory.has(link.source_memory_id)) {
          linkMetaByMemory.set(link.source_memory_id, {
            createdBy: link.created_by,
            label: link.label,
            linkTs: link.ts,
          });
        }
      }

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

      // Also add linked memories (with special marking)
      const linkedResults: { memory: MemoryRow; linkMeta: { createdBy: string; label: string | null; linkTs: string } }[] = [];
      for (const mem of linkedMemories) {
        if (!seen.has(mem.id)) {
          seen.add(mem.id);
          const meta = linkMetaByMemory.get(mem.id);
          if (meta) {
            linkedResults.push({ memory: mem, linkMeta: meta });
          }
        }
      }
      linkedResults.sort((a, b) => new Date(b.linkMeta.linkTs).getTime() - new Date(a.linkMeta.linkTs).getTime());

      const injectionResults = all.slice(0, limit);

      if (!injectionResults.length && !linkedResults.length) {
        return {
          content: [{ type: "text" as const, text: "Inbox empty -- no injections pending." }],
        };
      }

      const lines: string[] = [];

      if (injectionResults.length) {
        lines.push(`Inbox (${injectionResults.length} injection${injectionResults.length > 1 ? "s" : ""}):\n`);
        for (const m of injectionResults) {
          const meta = m.metadata as Record<string, unknown>;
          const pri = meta.priority === "urgent" ? " [URGENT]" : meta.priority === "high" ? " [HIGH]" : "";
          const from = meta.from_agent as string;
          const label = meta.label ? ` (${meta.label})` : "";
          const content = m.content?.replace(/^\[INJECT[^\]]*\]\s*(\([^)]*\)\s*)?:\s*/, "") ?? "";
          lines.push(`From ${from}${pri}${label}:\n  ${content.slice(0, 500)}\n  -- ${m.ts}`);
        }
      }

      if (linkedResults.length) {
        lines.push(`\nLinked memories (${linkedResults.length} inject-link${linkedResults.length > 1 ? "s" : ""}):\n`);
        for (const { memory, linkMeta } of linkedResults) {
          const label = linkMeta.label ? ` (${linkMeta.label})` : "";
          const content = memory.content?.slice(0, 500) ?? "(no content)";
          lines.push(`Linked by ${linkMeta.createdBy}${label}:\n  ${content}\n  -- linked ${linkMeta.linkTs}`);
        }
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n\n") }],
      };
    },
  );
}
