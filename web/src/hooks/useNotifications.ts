import { useEffect, useState, useCallback, useRef } from "react";
import { supabase, type Memory } from "../lib/supabase";

export interface Notification {
  id: string;
  type: "session_done" | "injection" | "connection" | "error" | "knowledge";
  agent: string;
  message: string;
  ts: string;
  read: boolean;
  metadata: Record<string, unknown>;
}

function memoryToNotification(m: Memory): Notification | null {
  const meta = (m.metadata ?? {}) as Record<string, unknown>;
  const event = meta.event as string | undefined;

  if (event === "session_done") {
    const status = meta.status as string;
    const summary = (meta.summary as string) ?? "";
    return {
      id: m.id,
      type: "session_done",
      agent: m.agent,
      message: `${m.agent} finished [${status}]: ${summary.slice(0, 120)}`,
      ts: m.ts,
      read: false,
      metadata: meta,
    };
  }

  if (event === "session_end") {
    const summary = (meta.summary as string) ?? "";
    return {
      id: m.id,
      type: "session_done",
      agent: m.agent,
      message: `${m.agent} ended session: ${summary.slice(0, 120)}`,
      ts: m.ts,
      read: false,
      metadata: meta,
    };
  }

  if (event === "context_injection") {
    const from = (meta.from_agent as string) ?? m.agent;
    const target = (meta.target_agent as string) ?? "all";
    const label = meta.label as string | null;
    const priority = meta.priority as string;
    return {
      id: m.id,
      type: "injection",
      agent: from,
      message: `${from} injected context${target !== "all" ? ` for ${target}` : ""}${label ? ` (${label})` : ""}${priority === "urgent" ? " [URGENT]" : ""}`,
      ts: m.ts,
      read: false,
      metadata: meta,
    };
  }

  if (event === "agent_connected") {
    return {
      id: m.id,
      type: "connection",
      agent: m.agent,
      message: `${m.agent} connected`,
      ts: m.ts,
      read: false,
      metadata: meta,
    };
  }

  if (event === "knowledge_stored") {
    const title = meta.title as string | null;
    return {
      id: m.id,
      type: "knowledge",
      agent: m.agent,
      message: `${m.agent} stored knowledge${title ? `: ${title}` : ""}`,
      ts: m.ts,
      read: false,
      metadata: meta,
    };
  }

  return null;
}

export function useNotifications(roomId: string | null) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const seenIds = useRef(new Set<string>());

  // Load initial notification-worthy events
  useEffect(() => {
    if (!roomId) return;

    (async () => {
      const { data } = await supabase
        .from("memories")
        .select("*")
        .eq("fold_id", roomId)
        .in("metadata->>event", [
          "session_done",
          "session_end",
          "context_injection",
          "agent_connected",
          "knowledge_stored",
        ])
        .order("ts", { ascending: false })
        .limit(30);

      if (data) {
        const initial: Notification[] = [];
        for (const m of data as Memory[]) {
          const n = memoryToNotification(m);
          if (n) {
            seenIds.current.add(n.id);
            initial.push(n);
          }
        }
        setNotifications(initial);
      }
    })();
  }, [roomId]);

  // Subscribe to realtime inserts for new notifications
  useEffect(() => {
    if (!roomId) return;

    const channel = supabase
      .channel(`notifications-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "memories",
          filter: `fold_id=eq.${roomId}`,
        },
        (payload) => {
          const m = payload.new as Memory;
          const n = memoryToNotification(m);
          if (n && !seenIds.current.has(n.id)) {
            seenIds.current.add(n.id);
            setNotifications((prev) => [n, ...prev].slice(0, 50));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const markRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  return { notifications, unreadCount, dismiss, markRead, markAllRead, clearAll };
}
