/**
 * Injection piggyback module for the Remix MCP worker.
 * {@link InboxTracker} is instantiated per-session and checked on every tool
 * response. New injections (targeted, broadcast, or user-level) are automatically
 * appended to the tool result so agents see them without polling.
 * Deduplication via surfacedIds (bounded to 200) prevents double-surfacing.
 */
import type { SupabaseClient } from "./supabase.js";
import type { RemixContext, MemoryRow, LinkRow } from "./types.js";

/**
 * Session-scoped tracker for pending injections.
 * Appends new injections to every tool response so agents
 * see them without explicitly calling remix_inbox.
 */
export class InboxTracker {
  private lastCheck: string;
  private surfacedIds = new Set<string>();

  constructor() {
    this.lastCheck = new Date().toISOString();
  }

  /**
   * Check for new injections since last tool call.
   * Returns formatted text to append, or null if nothing pending.
   */
  async check(
    db: SupabaseClient,
    ctx: RemixContext,
  ): Promise<string | null> {
    const since = this.lastCheck;
    this.lastCheck = new Date().toISOString();

    // Targeted injections
    const targeted = await db.select<MemoryRow>("memories", {
      select: "id,agent,content,metadata,ts",
      room_id: `eq.${ctx.roomId}`,
      message_type: "eq.injection",
      "metadata->>target_agent": `eq.${ctx.agent}`,
      ts: `gt.${since}`,
      order: "ts.desc",
      limit: "10",
    });

    // Broadcast injections (also check user-level targeting)
    const broadcast = await db.select<MemoryRow>("memories", {
      select: "id,agent,content,metadata,ts",
      room_id: `eq.${ctx.roomId}`,
      message_type: "eq.injection",
      "metadata->>target_agent": "eq.all",
      ts: `gt.${since}`,
      order: "ts.desc",
      limit: "10",
    });

    // Also check injections targeted at the user name (not just the full agent id)
    const userTargeted = await db.select<MemoryRow>("memories", {
      select: "id,agent,content,metadata,ts",
      room_id: `eq.${ctx.roomId}`,
      message_type: "eq.injection",
      "metadata->>target_agent": `eq.${ctx.user}`,
      ts: `gt.${since}`,
      order: "ts.desc",
      limit: "10",
    });

    // Merge, deduplicate, filter already-surfaced
    const seen = new Set<string>();
    const fresh: MemoryRow[] = [];
    for (const row of [...targeted, ...broadcast, ...userTargeted]) {
      if (!seen.has(row.id) && !this.surfacedIds.has(row.id)) {
        seen.add(row.id);
        fresh.push(row);
        this.surfacedIds.add(row.id);
      }
    }

    // Don't show self-injections
    const filtered = fresh.filter(
      (r) => (r.metadata as Record<string, unknown>).from_agent !== ctx.agent,
    );

    // Also check for new inject-type links targeting this agent
    const injectLinks = await db.select<LinkRow>("links", {
      select: "id,source_memory_id,created_by,label,ts",
      room_id: `eq.${ctx.roomId}`,
      link_type: "eq.inject",
      target_agent: `eq.${ctx.agent}`,
      ts: `gt.${since}`,
      order: "ts.desc",
      limit: "5",
    });

    const userInjectLinks = await db.select<LinkRow>("links", {
      select: "id,source_memory_id,created_by,label,ts",
      room_id: `eq.${ctx.roomId}`,
      link_type: "eq.inject",
      target_agent: `eq.${ctx.user}`,
      ts: `gt.${since}`,
      order: "ts.desc",
      limit: "5",
    });

    // Filter out already-surfaced links and self-created links
    const freshLinks: LinkRow[] = [];
    for (const link of [...injectLinks, ...userInjectLinks]) {
      const linkKey = `link:${link.id}`;
      if (!this.surfacedIds.has(linkKey) && link.created_by !== ctx.agent) {
        this.surfacedIds.add(linkKey);
        freshLinks.push(link);
      }
    }

    // Fetch source memories for fresh links
    let linkedMemories: MemoryRow[] = [];
    if (freshLinks.length > 0) {
      const ids = freshLinks.map((l) => l.source_memory_id);
      linkedMemories = await db.select<MemoryRow>("memories", {
        select: "id,agent,content,ts",
        id: `in.(${ids.join(",")})`,
      });
    }

    const memoryById = new Map<string, MemoryRow>();
    for (const m of linkedMemories) {
      memoryById.set(m.id, m);
    }

    if (!filtered.length && !freshLinks.length) return null;

    // Keep surfacedIds bounded
    if (this.surfacedIds.size > 200) {
      const arr = Array.from(this.surfacedIds);
      this.surfacedIds = new Set(arr.slice(arr.length - 100));
    }

    const lines: string[] = [];

    if (filtered.length) {
      lines.push(`\n---\n📥 INCOMING (${filtered.length} new injection${filtered.length > 1 ? "s" : ""}):`);
      for (const m of filtered) {
        const meta = m.metadata as Record<string, unknown>;
        const pri = meta.priority === "urgent" ? " 🔴 URGENT" : meta.priority === "high" ? " ⚠️ HIGH" : "";
        const from = meta.from_agent as string;
        const label = meta.label ? ` (${meta.label})` : "";
        const content = m.content?.replace(/^\[INJECT[^\]]*\]\s*(\([^)]*\)\s*)?:\s*/, "") ?? "";
        lines.push(`From ${from}${pri}${label}:\n${content.slice(0, 1000)}`);
      }
    }

    if (freshLinks.length) {
      lines.push(`\n---\n🔗 LINKED (${freshLinks.length} inject-link${freshLinks.length > 1 ? "s" : ""}):`);
      for (const link of freshLinks) {
        const mem = memoryById.get(link.source_memory_id);
        const label = link.label ? ` (${link.label})` : "";
        const content = mem?.content?.slice(0, 800) ?? "(memory not found)";
        lines.push(`Linked by ${link.created_by}${label}:\n${content}`);
      }
    }

    return lines.join("\n\n");
  }
}
