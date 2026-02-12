import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";

export interface LiveTelemetry {
  memoryCount: number;
  activeAgents: number;
  totalAgents: number;
  totalSessions: number;
  lastActivity: string | null;
  recentEvents: { agent: string; type: string; content: string; ts: string }[];
  loading: boolean;
}

const LIVE_SLUG = "live";

/**
 * Fetches real-time telemetry from the "live" fold for display on the landing page.
 * Subscribes to Supabase realtime so counters tick up as agents work.
 */
export function useLiveTelemetry(): LiveTelemetry {
  const [foldId, setFoldId] = useState<string | null>(null);
  const [memoryCount, setMemoryCount] = useState(0);
  const [totalAgents, setTotalAgents] = useState(0);
  const [activeAgents, setActiveAgents] = useState(0);
  const [totalSessions, setTotalSessions] = useState(0);
  const [lastActivity, setLastActivity] = useState<string | null>(null);
  const [recentEvents, setRecentEvents] = useState<LiveTelemetry["recentEvents"]>([]);
  const [loading, setLoading] = useState(true);
  const agentTimestamps = useRef<Map<string, string>>(new Map());
  const sessionSet = useRef<Set<string>>(new Set());

  // Step 1: resolve fold ID from slug
  useEffect(() => {
    supabase
      .from("folds")
      .select("id")
      .eq("slug", LIVE_SLUG)
      .single()
      .then(({ data }) => {
        if (data) setFoldId(data.id);
        else setLoading(false);
      });
  }, []);

  // Step 2: fetch initial stats and subscribe to realtime
  const fetchStats = useCallback(async () => {
    if (!foldId) return;

    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const [countRes, agentsRes, activeRes, lastRes, recentRes] = await Promise.all([
      // Total memory count
      supabase
        .from("memories")
        .select("id", { count: "exact", head: true })
        .eq("fold_id", foldId),
      // All agents (24h window)
      supabase
        .from("memories")
        .select("agent, session_id, ts")
        .eq("fold_id", foldId)
        .gte("ts", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .limit(1000),
      // Active agents (5 min window)
      supabase
        .from("memories")
        .select("agent")
        .eq("fold_id", foldId)
        .gte("ts", fiveMinAgo)
        .limit(200),
      // Last activity
      supabase
        .from("memories")
        .select("ts")
        .eq("fold_id", foldId)
        .order("ts", { ascending: false })
        .limit(1),
      // Recent events for activity feed
      supabase
        .from("memories")
        .select("agent, message_type, content, ts")
        .eq("fold_id", foldId)
        .order("ts", { ascending: false })
        .limit(5),
    ]);

    setMemoryCount(countRes.count ?? 0);

    if (agentsRes.data) {
      const agents = new Set(agentsRes.data.map((r) => r.agent));
      const sessions = new Set(agentsRes.data.map((r) => r.session_id));
      setTotalAgents(agents.size);
      setTotalSessions(sessions.size);
      sessionSet.current = sessions;
      for (const row of agentsRes.data) {
        const existing = agentTimestamps.current.get(row.agent);
        if (!existing || new Date(row.ts) > new Date(existing)) {
          agentTimestamps.current.set(row.agent, row.ts);
        }
      }
    }

    if (activeRes.data) {
      const active = new Set(activeRes.data.map((r) => r.agent));
      setActiveAgents(active.size);
    }

    if (lastRes.data?.[0]) {
      setLastActivity(lastRes.data[0].ts);
    }

    if (recentRes.data) {
      setRecentEvents(
        recentRes.data.map((r) => ({
          agent: r.agent,
          type: r.message_type,
          content: typeof r.content === "string" ? r.content : JSON.stringify(r.content),
          ts: r.ts,
        }))
      );
    }

    setLoading(false);
  }, [foldId]);

  useEffect(() => {
    fetchStats();

    if (!foldId) return;

    const channel = supabase
      .channel("live-telemetry")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "memories", filter: `fold_id=eq.${foldId}` },
        (payload) => {
          const row = payload.new as { agent: string; session_id: string; message_type: string; content: string; ts: string };

          // Increment memory count
          setMemoryCount((prev) => prev + 1);

          // Update last activity
          setLastActivity(row.ts);

          // Track agents
          agentTimestamps.current.set(row.agent, row.ts);
          setTotalAgents(agentTimestamps.current.size);

          // Track sessions
          sessionSet.current.add(row.session_id);
          setTotalSessions(sessionSet.current.size);

          // Recalculate active agents (seen in last 5 min)
          const now = Date.now();
          let active = 0;
          for (const [, ts] of agentTimestamps.current) {
            if (now - new Date(ts).getTime() < 5 * 60 * 1000) active++;
          }
          setActiveAgents(active);

          // Add to recent events (keep last 5)
          setRecentEvents((prev) =>
            [
              {
                agent: row.agent,
                type: row.message_type,
                content: typeof row.content === "string" ? row.content : JSON.stringify(row.content),
                ts: row.ts,
              },
              ...prev,
            ].slice(0, 5)
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchStats, foldId]);

  return { memoryCount, activeAgents, totalAgents, totalSessions, lastActivity, recentEvents, loading };
}
