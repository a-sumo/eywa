/**
 * SpectaclesView.tsx
 *
 * Fullscreen Guild Navigator map for Spectacles streaming.
 * Embeds the Navigator iframe with theme toggle, scroll/zoom (handled by
 * Navigator's own canvas), and auto-syncs Eywa room data on load.
 */

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRoomContext } from "../context/RoomContext";
import { useRealtimeMemories } from "../hooks/useRealtimeMemories";
import {
  syncEywaRoom,
  listRooms,
  BASE_URL,
} from "../lib/navigatorClient";

export function SpectaclesView() {
  const { room } = useRoomContext();
  const { memories } = useRealtimeMemories(room?.id ?? null, 200);

  const [roomId, setRoomId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [synced, setSynced] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  const roomSlug = room?.slug || "demo";

  // Find best Navigator room on load
  useEffect(() => {
    listRooms()
      .then((rooms) => {
        const match = rooms
          .filter(
            (r) =>
              r.id.startsWith(`eywa-${roomSlug}`) ||
              r.id === roomSlug ||
              r.id === "demo"
          )
          .sort((a, b) => b.items - a.items)[0];
        setRoomId(match && match.items > 0 ? match.id : `eywa-${roomSlug}`);
      })
      .catch(() => setRoomId(`eywa-${roomSlug}`));
  }, [roomSlug]);

  // Auto-sync Eywa data to Navigator on first load
  const syncData = useCallback(async () => {
    if (syncing || !room || memories.length === 0) return;
    setSyncing(true);
    try {
      const agentMap = new Map<
        string,
        {
          name: string;
          isActive: boolean;
          memories: Array<{ content: string; action?: string }>;
        }
      >();
      const now = Date.now();
      for (const m of memories) {
        if (!agentMap.has(m.agent)) {
          agentMap.set(m.agent, {
            name: m.agent,
            isActive: false,
            memories: [],
          });
        }
        const agent = agentMap.get(m.agent)!;
        if (now - new Date(m.ts).getTime() < 5 * 60 * 1000)
          agent.isActive = true;
        const meta = (m.metadata ?? {}) as Record<string, unknown>;
        agent.memories.push({
          content: m.content || "",
          action: (meta.action as string) || undefined,
        });
      }

      const targetRoom = roomId || `eywa-${roomSlug}`;
      await syncEywaRoom(targetRoom, {
        destination: "Launch-ready product",
        agents: Array.from(agentMap.values()),
      });
      setSynced(true);
    } catch (e) {
      console.warn("[SpectaclesView] sync error:", e);
    } finally {
      setSyncing(false);
    }
  }, [memories, room, roomId, roomSlug, syncing]);

  // Auto-sync once when we have data
  useEffect(() => {
    if (!synced && roomId && memories.length > 0) {
      syncData();
    }
  }, [synced, roomId, memories.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-sync every 30s
  useEffect(() => {
    if (!roomId) return;
    const interval = setInterval(() => syncData(), 30_000);
    return () => clearInterval(interval);
  }, [roomId, syncData]);

  const iframeSrc = useMemo(() => {
    if (!roomId) return null;
    return `${BASE_URL}?room=${roomId}&theme=${theme}`;
  }, [roomId, theme]);

  const toggleTheme = () =>
    setTheme((t) => (t === "dark" ? "light" : "dark"));

  const isDark = theme === "dark";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        width: "100vw",
        background: isDark ? "#050508" : "#f5f5f5",
        color: isDark ? "#e6edf3" : "#1a1a1a",
        overflow: "hidden",
      }}
    >
      {/* Minimal toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "6px 14px",
          borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.08)"}`,
          background: isDark ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.8)",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "#15D1FF",
            fontFamily:
              "var(--font-display, 'Plus Jakarta Sans', system-ui, sans-serif)",
          }}
        >
          Eywa
        </span>
        <span
          style={{
            fontSize: 11,
            color: isDark ? "#484f58" : "#999",
          }}
        >
          /{roomSlug}
        </span>

        {synced && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "#4ade80",
              background: "rgba(74,222,128,0.12)",
              padding: "2px 6px",
              borderRadius: 3,
              letterSpacing: "0.5px",
            }}
          >
            LIVE
          </span>
        )}

        <div style={{ flex: 1 }} />

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          style={{
            background: isDark
              ? "rgba(255,255,255,0.06)"
              : "rgba(0,0,0,0.06)",
            color: isDark ? "#e6edf3" : "#333",
            border: `1px solid ${isDark ? "#30363d" : "#ddd"}`,
            borderRadius: 6,
            padding: "4px 10px",
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          {isDark ? "Light" : "Dark"}
        </button>

        {/* Sync button */}
        <button
          onClick={syncData}
          disabled={syncing}
          style={{
            background: syncing
              ? isDark
                ? "#1e1e2e"
                : "#eee"
              : "rgba(21,209,255,0.12)",
            color: syncing
              ? isDark
                ? "#6b7280"
                : "#999"
              : "#15D1FF",
            border: "1px solid rgba(21,209,255,0.3)",
            borderRadius: 6,
            padding: "4px 10px",
            fontSize: 11,
            cursor: syncing ? "default" : "pointer",
          }}
        >
          {syncing ? "Syncing..." : "Sync"}
        </button>
      </div>

      {/* Navigator map iframe - takes all remaining space */}
      <div style={{ flex: 1, position: "relative" }}>
        {iframeSrc ? (
          <iframe
            src={iframeSrc}
            style={{
              width: "100%",
              height: "100%",
              border: "none",
              background: isDark ? "#0a0a14" : "#fafafa",
            }}
            title="Eywa Navigator Map"
            allow="fullscreen"
          />
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: isDark ? "#484f58" : "#999",
              fontSize: 13,
            }}
          >
            {syncing ? "Syncing room data..." : "Connecting..."}
          </div>
        )}
      </div>
    </div>
  );
}
