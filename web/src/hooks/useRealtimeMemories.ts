import React, { useEffect, useState, useCallback } from "react";
import { supabase, type Memory } from "../lib/supabase";

export function useRealtimeMemories(foldId: string | null, limit = 50, sinceMs?: number) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInitial = useCallback(async () => {
    if (!foldId) {
      setMemories([]);
      setLoading(false);
      return;
    }

    let query = supabase
      .from("memories")
      .select("*")
      .eq("fold_id", foldId)
      .order("ts", { ascending: false })
      .limit(limit);

    if (sinceMs != null && sinceMs > 0) {
      query = query.gte("ts", new Date(Date.now() - sinceMs).toISOString());
    }

    const { data, error: queryError } = await query;
    if (queryError) {
      setError(queryError.message);
    } else {
      setError(null);
      if (data) setMemories(data);
    }
    setLoading(false);
  }, [foldId, limit, sinceMs]);

  useEffect(() => {
    fetchInitial();

    if (!foldId) return;

    const channel = supabase
      .channel(`memories-realtime-${foldId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "memories", filter: `fold_id=eq.${foldId}` },
        (payload) => {
          setMemories((prev) => [payload.new as Memory, ...prev].slice(0, limit));
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "memories", filter: `fold_id=eq.${foldId}` },
        (payload) => {
          const updated = payload.new as Memory;
          setMemories((prev) => prev.map((m) => m.id === updated.id ? updated : m));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchInitial, foldId, limit]);

  return { memories, loading, error, refresh: fetchInitial };
}

export function useRealtimeAgents(foldId: string | null, sinceMs?: number) {
  const [agents, setAgents] = useState<
    { name: string; lastSeen: string; sessionCount: number; isActive: boolean }[]
  >([]);

  // Keep a mutable ref for incremental updates so we don't refetch everything
  const agentMapRef = React.useRef<Map<string, { lastSeen: string; sessions: Set<string>; agents: Set<string> }>>(new Map());

  const buildAgentList = useCallback(() => {
    const now = Date.now();
    setAgents(
      Array.from(agentMapRef.current.entries()).map(([name, info]) => ({
        name,
        lastSeen: info.lastSeen,
        sessionCount: info.sessions.size,
        isActive: now - new Date(info.lastSeen).getTime() < 5 * 60 * 1000,
      }))
    );
  }, []);

  const fetchAgents = useCallback(async () => {
    if (!foldId) {
      agentMapRef.current.clear();
      setAgents([]);
      return;
    }

    let query = supabase
      .from("memories")
      .select("agent, ts, session_id, metadata")
      .eq("fold_id", foldId)
      .order("ts", { ascending: false })
      .limit(1000);

    if (sinceMs != null && sinceMs > 0) {
      query = query.gte("ts", new Date(Date.now() - sinceMs).toISOString());
    }

    const { data } = await query;

    if (!data) return;

    // Rebuild map from scratch on initial fetch
    const map = new Map<string, { lastSeen: string; sessions: Set<string>; agents: Set<string> }>();
    for (const row of data) {
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      const user = (meta.user as string) ?? row.agent.split("/")[0];
      const existing = map.get(user);
      if (!existing) {
        map.set(user, {
          lastSeen: row.ts,
          sessions: new Set([row.session_id]),
          agents: new Set([row.agent]),
        });
      } else {
        existing.sessions.add(row.session_id);
        existing.agents.add(row.agent);
      }
    }

    agentMapRef.current = map;
    buildAgentList();
  }, [foldId, sinceMs, buildAgentList]);

  useEffect(() => {
    fetchAgents();

    if (!foldId) return;

    const channel = supabase
      .channel(`agents-realtime-${foldId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "memories", filter: `fold_id=eq.${foldId}` },
        (payload) => {
          // Incremental update: merge new row into existing map
          const row = payload.new as { agent: string; ts: string; session_id: string; metadata: Record<string, unknown> };
          const meta = (row.metadata ?? {}) as Record<string, unknown>;
          const user = (meta.user as string) ?? row.agent.split("/")[0];
          const map = agentMapRef.current;
          const existing = map.get(user);
          if (!existing) {
            map.set(user, {
              lastSeen: row.ts,
              sessions: new Set([row.session_id]),
              agents: new Set([row.agent]),
            });
          } else {
            existing.sessions.add(row.session_id);
            existing.agents.add(row.agent);
            if (new Date(row.ts) > new Date(existing.lastSeen)) {
              existing.lastSeen = row.ts;
            }
          }
          buildAgentList();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchAgents, foldId, buildAgentList]);

  return agents;
}
