/**
 * Supabase client for the Eywa VS Code extension.
 * Provides typed access to rooms, agents, sessions, knowledge, and injections.
 */
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

export interface DestinationInfo {
  destination: string;
  milestones: string[];
  progress: Record<string, boolean>;
  notes: string | null;
  setBy: string;
  ts: string;
}

export interface AgentProgress {
  agent: string;
  percent: number;
  status: string;
  detail: string | null;
  task: string;
  ts: string;
}

/**
 * Session info grouped by user for the agent tree.
 * Status is derived from session lifecycle events and a 30-minute active threshold.
 * Ghost sessions (1 memory, stale, not active) are filtered out.
 */
export interface SessionInfo {
  agent: string;
  user: string;
  sessionId: string;
  status: "active" | "finished" | "idle";
  task: string;
  memoryCount: number;
  lastSeen: string;
}

export type AttentionReason = "distress" | "blocked" | "stopped" | "checkpoint" | "idle";

export interface AttentionItem {
  agent: string;
  reason: AttentionReason;
  summary: string;
  ts: string;
  sessionId: string;
  /** Higher = more urgent. distress=4, blocked=3, stopped=2, checkpoint=1, idle=0 */
  urgency: number;
}

const ATTENTION_URGENCY: Record<AttentionReason, number> = {
  distress: 4,
  blocked: 3,
  stopped: 2,
  checkpoint: 1,
  idle: 0,
};

export class EywaClient {
  private supabase: SupabaseClient;
  private roomSlug: string;
  private roomId: string | null = null;

  constructor(url: string, key: string, room: string) {
    this.supabase = createClient(url, key);
    this.roomSlug = room;
  }

  getSupabase(): SupabaseClient {
    return this.supabase;
  }

  async resolveRoomId(): Promise<string> {
    return this.resolveRoom();
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

  /** Recent operations that have scope/system metadata (for decoration seeding). */
  async getRecentOperations(since: string, limit = 200): Promise<MemoryEvent[]> {
    const roomId = await this.resolveRoom();
    if (!roomId) return [];

    const { data: rows } = await this.supabase
      .from("memories")
      .select("id,agent,content,metadata,ts,message_type")
      .eq("room_id", roomId)
      .gt("ts", since)
      .not("metadata->>scope", "is", null)
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

  /**
   * Fetch all sessions grouped by user. Determines status from lifecycle events
   * (session_start/session_done) and a 30-min active threshold. Filters ghost
   * sessions and caps at 20 per user.
   */
  async getSessions(): Promise<Map<string, SessionInfo[]>> {
    const roomId = await this.resolveRoom();
    if (!roomId) return new Map();

    const { data: rows } = await this.supabase
      .from("memories")
      .select("agent,content,ts,session_id,metadata")
      .eq("room_id", roomId)
      .order("ts", { ascending: false });

    if (!rows?.length) return new Map();

    // Group by agent::session_id
    const sessionMap = new Map<string, typeof rows>();
    for (const row of rows) {
      const key = `${row.agent}::${row.session_id}`;
      const list = sessionMap.get(key) || [];
      list.push(row);
      sessionMap.set(key, list);
    }

    const now = Date.now();
    const userSessions = new Map<string, SessionInfo[]>();

    for (const [, mems] of sessionMap) {
      const sorted = [...mems].sort(
        (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime(),
      );
      const first = sorted[0];
      const last = sorted[sorted.length - 1];

      const startEvent = sorted.find(
        (m) => (m.metadata as Record<string, unknown>)?.event === "session_start",
      );
      const endEvent = sorted.find(
        (m) => {
          const ev = (m.metadata as Record<string, unknown>)?.event;
          return ev === "session_done" || ev === "session_end";
        },
      );

      const ACTIVE_THRESHOLD = 30 * 60 * 1000; // 30 minutes
      const isRecent = now - new Date(last.ts).getTime() < ACTIVE_THRESHOLD;

      let status: "active" | "finished" | "idle" = "idle";
      let task = "";

      if (endEvent) {
        status = "finished";
        task = String((endEvent.metadata as Record<string, unknown>)?.summary || "");
      } else if (startEvent) {
        // Only "active" if there's recent activity — otherwise it's a stale unclosed session
        status = isRecent ? "active" : "idle";
        task = String((startEvent.metadata as Record<string, unknown>)?.task || "");
      } else if (isRecent) {
        status = "active";
      }

      // Skip ghost sessions: 1 memory, not recent, not active
      if (sorted.length <= 1 && !isRecent && status !== "active") {
        continue;
      }

      const firstMeta = (first.metadata ?? {}) as Record<string, unknown>;
      const user = (firstMeta.user as string) ?? first.agent.split("/")[0];

      const info: SessionInfo = {
        agent: first.agent,
        user,
        sessionId: first.session_id,
        status,
        task: task || (last.content ?? "").slice(0, 100),
        memoryCount: sorted.length,
        lastSeen: last.ts,
      };

      const list = userSessions.get(user) || [];
      list.push(info);
      userSessions.set(user, list);
    }

    // Sort sessions within each user: active first, then by lastSeen
    for (const [user, sessions] of userSessions) {
      sessions.sort((a, b) => {
        const order = { active: 0, idle: 1, finished: 2 };
        const diff = order[a.status] - order[b.status];
        if (diff !== 0) return diff;
        return new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime();
      });
      // Cap at 20 visible sessions per user — show active + most recent
      userSessions.set(user, sessions.slice(0, 20));
    }

    return userSessions;
  }

  async getDestination(): Promise<DestinationInfo | null> {
    const roomId = await this.resolveRoom();
    if (!roomId) return null;

    const { data: rows } = await this.supabase
      .from("memories")
      .select("agent,content,metadata,ts")
      .eq("room_id", roomId)
      .eq("message_type", "knowledge")
      .eq("metadata->>event", "destination")
      .order("ts", { ascending: false })
      .limit(1);

    if (!rows?.length) return null;

    const meta = (rows[0].metadata ?? {}) as Record<string, unknown>;
    return {
      destination: (meta.destination as string) || "",
      milestones: (meta.milestones as string[]) || [],
      progress: (meta.progress as Record<string, boolean>) || {},
      notes: (meta.notes as string) || null,
      setBy: (meta.set_by as string) || rows[0].agent,
      ts: rows[0].ts,
    };
  }

  async getAgentProgress(): Promise<AgentProgress[]> {
    const roomId = await this.resolveRoom();
    if (!roomId) return [];

    const { data: rows } = await this.supabase
      .from("memories")
      .select("agent,metadata,ts")
      .eq("room_id", roomId)
      .eq("metadata->>event", "progress")
      .order("ts", { ascending: false })
      .limit(50);

    if (!rows?.length) return [];

    // Latest progress per agent
    const seen = new Set<string>();
    const results: AgentProgress[] = [];
    for (const row of rows) {
      if (seen.has(row.agent)) continue;
      seen.add(row.agent);
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      results.push({
        agent: row.agent,
        percent: (meta.percent as number) ?? 0,
        status: (meta.status as string) || "working",
        detail: (meta.detail as string) || null,
        task: (meta.task as string) || "",
        ts: row.ts,
      });
    }
    return results;
  }

  /**
   * Get agents that need human attention: distress signals, blocked progress,
   * stopped sessions, recent checkpoints, and idle-after-active sessions.
   */
  async getAttentionItems(): Promise<AttentionItem[]> {
    const roomId = await this.resolveRoom();
    if (!roomId) return [];

    const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2 hours

    // Parallel queries for different attention signals
    const [distressRows, progressRows, sessionRows] = await Promise.all([
      // Distress signals and checkpoints
      this.supabase
        .from("memories")
        .select("agent,content,metadata,ts,session_id")
        .eq("room_id", roomId)
        .gt("ts", cutoff)
        .in("metadata->>event", ["distress", "checkpoint"])
        .order("ts", { ascending: false })
        .limit(20),
      // Blocked progress reports
      this.supabase
        .from("memories")
        .select("agent,content,metadata,ts,session_id")
        .eq("room_id", roomId)
        .eq("metadata->>event", "progress")
        .eq("metadata->>status", "blocked")
        .gt("ts", cutoff)
        .order("ts", { ascending: false })
        .limit(20),
      // Recent session lifecycle (done/end) to find stopped sessions
      this.supabase
        .from("memories")
        .select("agent,content,metadata,ts,session_id")
        .eq("room_id", roomId)
        .gt("ts", cutoff)
        .in("metadata->>event", ["session_done", "session_end"])
        .order("ts", { ascending: false })
        .limit(20),
    ]);

    const items: AttentionItem[] = [];
    const seen = new Set<string>(); // dedupe per agent+reason

    // Distress signals
    for (const row of distressRows.data ?? []) {
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      const event = meta.event as string;
      const reason: AttentionReason = event === "distress" ? "distress" : "checkpoint";
      const key = `${row.agent}:${reason}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const remaining = (meta.remaining as string) || "";
      const task = (meta.task as string) || "";
      items.push({
        agent: row.agent,
        reason,
        summary: reason === "distress"
          ? (remaining || task || "Context exhausted, needs direction").slice(0, 150)
          : (task || "Checkpointed, may need direction").slice(0, 150),
        ts: row.ts,
        sessionId: row.session_id,
        urgency: ATTENTION_URGENCY[reason],
      });
    }

    // Blocked agents
    for (const row of progressRows.data ?? []) {
      const key = `${row.agent}:blocked`;
      if (seen.has(key)) continue;
      seen.add(key);

      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      items.push({
        agent: row.agent,
        reason: "blocked",
        summary: ((meta.detail as string) || (meta.task as string) || "Blocked, needs input").slice(0, 150),
        ts: row.ts,
        sessionId: row.session_id,
        urgency: ATTENTION_URGENCY.blocked,
      });
    }

    // Stopped sessions (done/end without a follow-up session_start from same agent)
    for (const row of sessionRows.data ?? []) {
      const key = `${row.agent}:stopped`;
      if (seen.has(key)) continue;
      // Skip if agent already has a distress or blocked item
      if (seen.has(`${row.agent}:distress`) || seen.has(`${row.agent}:blocked`)) continue;
      seen.add(key);

      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      items.push({
        agent: row.agent,
        reason: "stopped",
        summary: ((meta.summary as string) || "Session ended, awaiting direction").slice(0, 150),
        ts: row.ts,
        sessionId: row.session_id,
        urgency: ATTENTION_URGENCY.stopped,
      });
    }

    // Sort by urgency desc, then recency
    items.sort((a, b) => {
      if (a.urgency !== b.urgency) return b.urgency - a.urgency;
      return new Date(b.ts).getTime() - new Date(a.ts).getTime();
    });

    return items;
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
