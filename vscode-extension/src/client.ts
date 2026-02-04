import { createClient, SupabaseClient } from "@supabase/supabase-js";

export interface AgentInfo {
  name: string;
  lastSeen: string;
  sessionCount: number;
  isActive: boolean;
  status: string;
  lastContent: string;
}

export interface KnowledgeEntry {
  id: string;
  title: string | null;
  content: string;
  tags: string[];
  agent: string;
  ts: string;
}

export interface MemoryEvent {
  id: string;
  agent: string;
  content: string;
  metadata: Record<string, unknown>;
  ts: string;
  message_type: string;
}

export class RemixClient {
  private supabase: SupabaseClient;
  private roomSlug: string;
  private roomId: string | null = null;

  constructor(url: string, key: string, room: string) {
    this.supabase = createClient(url, key);
    this.roomSlug = room;
  }

  private async resolveRoom(): Promise<string> {
    if (this.roomId) return this.roomId;

    const { data } = await this.supabase
      .from("rooms")
      .select("id")
      .eq("slug", this.roomSlug)
      .limit(1)
      .single();

    if (data) this.roomId = data.id;
    return this.roomId ?? "";
  }

  async getAgents(): Promise<AgentInfo[]> {
    const roomId = await this.resolveRoom();
    if (!roomId) return [];

    const { data: rows } = await this.supabase
      .from("memories")
      .select("agent,content,ts,session_id,metadata")
      .eq("room_id", roomId)
      .order("ts", { ascending: false });

    if (!rows?.length) return [];

    const map = new Map<string, {
      lastSeen: string;
      sessions: Set<string>;
      status: string;
      lastContent: string;
    }>();

    const now = Date.now();

    for (const row of rows) {
      const existing = map.get(row.agent);
      if (!existing) {
        const meta = (row.metadata ?? {}) as Record<string, string>;
        let status = "idle";
        if (meta.event === "session_start") status = "active";
        else if (meta.event === "session_done") status = meta.status || "done";
        else if (meta.event === "session_end") status = "finished";

        map.set(row.agent, {
          lastSeen: row.ts,
          sessions: new Set([row.session_id]),
          status,
          lastContent: (row.content ?? "").slice(0, 200),
        });
      } else {
        if (row.session_id) existing.sessions.add(row.session_id);
      }
    }

    return Array.from(map.entries()).map(([name, info]) => ({
      name,
      lastSeen: info.lastSeen,
      sessionCount: info.sessions.size,
      isActive: now - new Date(info.lastSeen).getTime() < 5 * 60 * 1000,
      status: info.status,
      lastContent: info.lastContent,
    }));
  }

  async getKnowledge(limit = 20): Promise<KnowledgeEntry[]> {
    const roomId = await this.resolveRoom();
    if (!roomId) return [];

    const { data: rows } = await this.supabase
      .from("memories")
      .select("id,agent,content,metadata,ts")
      .eq("room_id", roomId)
      .eq("message_type", "knowledge")
      .order("ts", { ascending: false })
      .limit(limit);

    if (!rows?.length) return [];

    return rows.map((m) => {
      const meta = (m.metadata ?? {}) as Record<string, unknown>;
      return {
        id: m.id,
        title: (meta.title as string) ?? null,
        content: (m.content ?? "").replace(/^\[[^\]]*\]\s*/, ""),
        tags: (meta.tags as string[]) ?? [],
        agent: m.agent,
        ts: m.ts,
      };
    });
  }

  async getRecentEvents(since: string, limit = 50): Promise<MemoryEvent[]> {
    const roomId = await this.resolveRoom();
    if (!roomId) return [];

    const { data: rows } = await this.supabase
      .from("memories")
      .select("id,agent,content,metadata,ts,message_type")
      .eq("room_id", roomId)
      .gt("ts", since)
      .order("ts", { ascending: false })
      .limit(limit);

    return (rows ?? []).map((r) => ({
      id: r.id,
      agent: r.agent,
      content: r.content ?? "",
      metadata: (r.metadata ?? {}) as Record<string, unknown>,
      ts: r.ts,
      message_type: r.message_type ?? "",
    }));
  }

  async inject(
    fromAgent: string,
    target: string,
    content: string,
    priority: "normal" | "high" | "urgent" = "normal",
  ): Promise<void> {
    const roomId = await this.resolveRoom();
    if (!roomId) return;

    await this.supabase.from("memories").insert({
      room_id: roomId,
      agent: fromAgent,
      session_id: `vscode_${Date.now()}`,
      message_type: "injection",
      content: `[INJECT → ${target}]: ${content}`,
      token_count: Math.floor(content.length / 4),
      metadata: {
        event: "context_injection",
        from_agent: fromAgent,
        target_agent: target,
        priority,
        label: null,
      },
    });
  }
}
