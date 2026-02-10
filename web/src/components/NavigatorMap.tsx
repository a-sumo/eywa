/**
 * NavigatorMap.tsx - Embeds Guild Navigator's interactive spatial map.
 *
 * Guild Navigator has its own canvas renderer with zoom/pan, animated transitions,
 * tooltips, timeline scrubbing, and SSE live updates. We embed it directly
 * instead of reimplementing it.
 */

import { useEffect, useState, useCallback } from "react";
import { useRoomContext } from "../context/RoomContext";
import { useRealtimeMemories } from "../hooks/useRealtimeMemories";
import {
  syncEywaRoom,
  listRooms,
  BASE_URL,
} from "../lib/navigatorClient";

export function NavigatorMap() {
  const { room } = useRoomContext();
  const { memories } = useRealtimeMemories(room?.id ?? null, 200);
  const [syncing, setSyncing] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [availableRooms, setAvailableRooms] = useState<Array<{ id: string; items: number }>>([]);

  const roomSlug = room?.slug || "demo";

  // Find best Navigator room on load
  useEffect(() => {
    listRooms().then(rooms => {
      setAvailableRooms(rooms.map(r => ({ id: r.id, items: r.items })));
      // Find a room with our slug prefix that has data, or fall back to "demo"
      const match = rooms
        .filter(r => r.id.startsWith(`eywa-${roomSlug}`) || r.id === "demo")
        .sort((a, b) => b.items - a.items)[0];
      if (match && match.items > 0) {
        setRoomId(match.id);
      } else {
        setRoomId(`eywa-${roomSlug}`);
      }
    }).catch(() => {
      setRoomId("demo");
    });
  }, [roomSlug]);

  // Sync Eywa data to Guild Navigator
  const syncData = useCallback(async () => {
    if (syncing || !room) return;
    setSyncing(true);
    try {
      const agentMap = new Map<string, {
        name: string; isActive: boolean;
        memories: Array<{ content: string; action?: string }>;
      }>();

      const now = Date.now();
      for (const m of memories) {
        if (!agentMap.has(m.agent)) {
          agentMap.set(m.agent, { name: m.agent, isActive: false, memories: [] });
        }
        const agent = agentMap.get(m.agent)!;
        if (now - new Date(m.ts).getTime() < 5 * 60 * 1000) agent.isActive = true;
        const meta = (m.metadata ?? {}) as Record<string, unknown>;
        agent.memories.push({ content: m.content || "", action: (meta.action as string) || undefined });
      }

      const targetRoom = roomId || `eywa-${roomSlug}`;
      const destination = ((room as unknown as Record<string, unknown>).destination as string) || "Launch-ready product";
      await syncEywaRoom(targetRoom, { destination, agents: Array.from(agentMap.values()) });

      // Refresh room list to pick up the new room
      const rooms = await listRooms();
      setAvailableRooms(rooms.map(r => ({ id: r.id, items: r.items })));
      const match = rooms.find(r => r.id === targetRoom);
      if (match) setRoomId(match.id);
    } catch (e) {
      console.warn("[NavigatorMap] sync error:", e);
    } finally {
      setSyncing(false);
    }
  }, [memories, room, roomId, roomSlug, syncing]);

  const handleRoomSelect = useCallback((id: string) => {
    setRoomId(id);
  }, []);

  const iframeSrc = roomId ? `${BASE_URL}?room=${roomId}` : null;

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      background: "#0a0a14",
    }}>
      {/* Toolbar */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 14px",
        borderBottom: "1px solid #1e1e2e",
        background: "#0a0a14",
        flexShrink: 0,
        flexWrap: "wrap",
      }}>
        <span style={{ color: "#15D1FF", fontWeight: 600, fontSize: 13 }}>Navigator</span>

        {/* Room selector */}
        {availableRooms.length > 0 && (
          <select
            value={roomId || ""}
            onChange={e => handleRoomSelect(e.target.value)}
            style={{
              background: "#151520",
              color: "#cfe8ff",
              border: "1px solid #30363d",
              borderRadius: 4,
              padding: "2px 6px",
              fontSize: 11,
            }}
          >
            {availableRooms.map(r => (
              <option key={r.id} value={r.id}>{r.id} ({r.items})</option>
            ))}
          </select>
        )}

        <div style={{ flex: 1 }} />

        <button
          onClick={syncData}
          disabled={syncing}
          style={{
            background: syncing ? "#1e1e2e" : "#15D1FF20",
            color: syncing ? "#6b7280" : "#15D1FF",
            border: "1px solid #15D1FF30",
            borderRadius: 6,
            padding: "4px 12px",
            fontSize: 11,
            cursor: syncing ? "default" : "pointer",
          }}
        >
          {syncing ? "Syncing..." : "Sync Room Data"}
        </button>

        {iframeSrc && (
          <a
            href={iframeSrc}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: "#6b7280",
              fontSize: 11,
              textDecoration: "none",
            }}
          >
            Open fullscreen
          </a>
        )}
      </div>

      {/* Embedded Guild Navigator */}
      <div style={{ flex: 1, position: "relative" }}>
        {iframeSrc ? (
          <iframe
            src={iframeSrc}
            style={{
              width: "100%",
              height: "100%",
              border: "none",
              background: "#fafafa",
            }}
            title="Guild Navigator"
            allow="fullscreen"
          />
        ) : (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            color: "#6b7280",
            fontSize: 13,
          }}>
            Loading rooms...
          </div>
        )}
      </div>
    </div>
  );
}
