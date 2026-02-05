import { useEffect, useState, useCallback } from "react";
import { supabase, type Memory } from "../lib/supabase";

export function useRealtimeMemories(roomId: string | null, limit = 50) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchInitial = useCallback(async () => {
    if (!roomId) {
      setMemories([]);
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from("memories")
      .select("*")
      .eq("room_id", roomId)
      .order("ts", { ascending: false })
      .limit(limit);
    if (data) setMemories(data);
    setLoading(false);
  }, [roomId, limit]);

  useEffect(() => {
    fetchInitial();

    if (!roomId) return;

    const channel = supabase
      .channel(`memories-realtime-${roomId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "memories", filter: `room_id=eq.${roomId}` },
        (payload) => {
          setMemories((prev) => [payload.new as Memory, ...prev].slice(0, limit));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchInitial, roomId, limit]);

  return { memories, loading, refresh: fetchInitial };
}

export function useRealtimeAgents(roomId: string | null) {
  const [agents, setAgents] = useState<
    { name: string; lastSeen: string; sessionCount: number; isActive: boolean }[]
  >([]);

  const fetchAgents = useCallback(async () => {
    if (!roomId) {
      setAgents([]);
      return;
    }

    const { data } = await supabase
      .from("memories")
      .select("agent, ts, session_id, metadata")
      .eq("room_id", roomId)
      .order("ts", { ascending: false });

    if (!data) return;

    // Group by user (from metadata) falling back to base agent name (strip -xxxx suffix)
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

    const now = Date.now();
    setAgents(
      Array.from(map.entries()).map(([name, info]) => ({
        name,
        lastSeen: info.lastSeen,
        sessionCount: info.sessions.size,
        isActive: now - new Date(info.lastSeen).getTime() < 5 * 60 * 1000,
      }))
    );
  }, [roomId]);

  useEffect(() => {
    fetchAgents();

    if (!roomId) return;

    const channel = supabase
      .channel(`agents-realtime-${roomId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "memories", filter: `room_id=eq.${roomId}` },
        () => {
          fetchAgents();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchAgents, roomId]);

  return agents;
}
