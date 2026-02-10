/**
 * SpectaclesView.tsx
 *
 * Fullscreen Guild Navigator map for Spectacles streaming.
 * Web users see the interactive iframe. A hidden canvas renders the same
 * map data natively and broadcasts frames to Spectacles via Supabase Realtime.
 */

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useRoomContext } from "../context/RoomContext";
import { useRealtimeMemories } from "../hooks/useRealtimeMemories";
import { supabase, type Memory } from "../lib/supabase";
import {
  syncEywaRoom,
  getMap,
  listRooms,
  BASE_URL,
  type NavigatorMapResponse,
  type NavigatorNode,
} from "../lib/navigatorClient";

// --- Canvas map renderer ---

interface MapRenderOpts {
  nodes: NavigatorNode[];
  trajectory: NavigatorMapResponse["trajectory"];
  alignments: NavigatorMapResponse["alignments"];
  width: number;
  height: number;
  dark: boolean;
  panX: number;
  panY: number;
  zoom: number;
}

function renderMapToCanvas(ctx: OffscreenCanvasRenderingContext2D, opts: MapRenderOpts) {
  const { nodes, trajectory, alignments, width, height, dark, panX, panY, zoom } = opts;

  // Colors
  const bg = dark ? "#0a0a14" : "#f5f5f5";
  const gridColor = dark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.04)";
  const textColor = dark ? "#e6edf3" : "#1a1a1a";
  const dimText = dark ? "#484f58" : "#999";
  const edgeColor = dark ? "rgba(139,92,246,0.3)" : "rgba(139,92,246,0.4)";
  const alignColor = (a: number) =>
    a > 0.5
      ? dark ? "rgba(74,222,128,0.4)" : "rgba(34,197,94,0.4)"
      : a > 0
        ? dark ? "rgba(250,204,21,0.3)" : "rgba(202,138,4,0.3)"
        : dark ? "rgba(248,113,113,0.3)" : "rgba(220,38,38,0.3)";

  const nodeColors: Record<string, string> = {
    goal: "#15D1FF",
    source: "#8b5cf6",
    action: dark ? "#4ade80" : "#16a34a",
    state: dark ? "#fbbf24" : "#ca8a04",
  };

  // Clear
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  if (nodes.length === 0) {
    ctx.fillStyle = dimText;
    ctx.font = "16px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Syncing map data...", width / 2, height / 2);
    return;
  }

  // Grid
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;
  const gridStep = 60 * zoom;
  const gx0 = (panX * zoom + width / 2) % gridStep;
  const gy0 = (panY * zoom + height / 2) % gridStep;
  for (let x = gx0; x < width; x += gridStep) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = gy0; y < height; y += gridStep) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // Transform: node coords are roughly [-1, 1], map to canvas with pan/zoom
  const scale = Math.min(width, height) * 0.35 * zoom;
  const cx = width / 2 + panX * zoom;
  const cy = height / 2 + panY * zoom;

  const toScreen = (x: number, y: number): [number, number] => [
    cx + x * scale,
    cy - y * scale, // flip y
  ];

  // Build node position map
  const nodePos = new Map<string, [number, number]>();
  for (const n of nodes) {
    nodePos.set(n.id, toScreen(n.x, n.y));
  }

  // Draw alignment lines (goal-action connections)
  for (const a of alignments) {
    const from = nodePos.get(a.actionId);
    const to = nodePos.get(a.goalId);
    if (!from || !to) continue;
    ctx.strokeStyle = alignColor(a.alignment);
    ctx.lineWidth = 1.5 * zoom;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(from[0], from[1]);
    ctx.lineTo(to[0], to[1]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Draw trajectory edges
  const nodeById = new Map(nodes.map(n => [n.id, n]));
  for (const t of trajectory) {
    const from = nodePos.get(t.from);
    const to = nodePos.get(t.to);
    if (!from || !to) continue;
    ctx.strokeStyle = edgeColor;
    ctx.lineWidth = 2 * zoom;
    ctx.beginPath();
    ctx.moveTo(from[0], from[1]);
    ctx.lineTo(to[0], to[1]);
    ctx.stroke();

    // Arrow head
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0) {
      const ux = dx / len;
      const uy = dy / len;
      const arrowLen = 8 * zoom;
      const ax = to[0] - ux * arrowLen;
      const ay = to[1] - uy * arrowLen;
      ctx.fillStyle = edgeColor;
      ctx.beginPath();
      ctx.moveTo(to[0], to[1]);
      ctx.lineTo(ax - uy * 4 * zoom, ay + ux * 4 * zoom);
      ctx.lineTo(ax + uy * 4 * zoom, ay - ux * 4 * zoom);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Draw nodes
  for (const n of nodes) {
    const pos = nodePos.get(n.id);
    if (!pos) continue;
    const [sx, sy] = pos;
    const color = nodeColors[n.type] || "#8b949e";
    const radius = n.type === "goal" ? 14 * zoom : 8 * zoom;

    // Glow for goals
    if (n.type === "goal") {
      const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, radius * 2.5);
      grad.addColorStop(0, color + "40");
      grad.addColorStop(1, color + "00");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(sx, sy, radius * 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Node circle
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    ctx.fill();

    // Border
    ctx.strokeStyle = dark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.1)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Label
    const label = n.label.length > 24 ? n.label.slice(0, 22) + ".." : n.label;
    ctx.fillStyle = textColor;
    ctx.font = `${Math.max(10, 11 * zoom)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(label, sx, sy + radius + 14 * zoom);

    // Type tag
    if (n.type !== "action") {
      ctx.fillStyle = dimText;
      ctx.font = `${Math.max(8, 9 * zoom)}px Inter, system-ui, sans-serif`;
      ctx.fillText(n.type, sx, sy + radius + 26 * zoom);
    }

    // Agent tag
    if (n.agent) {
      const short = n.agent.includes("/") ? n.agent.split("/").pop()! : n.agent;
      ctx.fillStyle = "#8b5cf6";
      ctx.font = `${Math.max(8, 9 * zoom)}px Inter, system-ui, sans-serif`;
      ctx.fillText(short, sx, sy - radius - 6 * zoom);
    }
  }

  // Title
  ctx.fillStyle = dimText;
  ctx.font = "11px Inter, system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Eywa Navigator", 12, 20);
  ctx.fillText(`${nodes.length} nodes`, 12, 34);
}

// --- Main Component ---

export function SpectaclesView() {
  const { room } = useRoomContext();
  const { memories } = useRealtimeMemories(room?.id ?? null, 200);

  const [roomId, setRoomId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [synced, setSynced] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [channelReady, setChannelReady] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);

  const roomSlug = room?.slug || "demo";
  const deviceId = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("device") || "editor";
  }, []);

  // Refs for broadcast loop
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const mapDataRef = useRef<NavigatorMapResponse | null>(null);
  const broadcastCanvasRef = useRef<OffscreenCanvas | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const themeRef = useRef(theme);
  themeRef.current = theme;

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

  // Sync Eywa data to Navigator
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
          agentMap.set(m.agent, { name: m.agent, isActive: false, memories: [] });
        }
        const agent = agentMap.get(m.agent)!;
        if (now - new Date(m.ts).getTime() < 5 * 60 * 1000) agent.isActive = true;
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

  // Fetch map data + re-sync every 30s
  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;

    const fetchMap = async () => {
      try {
        const map = await getMap(roomId);
        if (!cancelled) mapDataRef.current = map;
      } catch (e) {
        console.warn("[SpectaclesView] map fetch error:", e);
      }
    };

    // Also re-sync Eywa data periodically
    const tick = async () => {
      await syncData();
      await fetchMap();
    };

    fetchMap(); // initial fetch
    const interval = setInterval(tick, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [roomId, syncData]);

  // Supabase broadcast channel
  useEffect(() => {
    if (!room?.slug) return;
    const channelKey = `spectacles:${room.slug}:${deviceId}`;
    const channel = supabase.channel(channelKey, {
      config: { broadcast: { ack: false, self: false } },
    });

    channel.on("broadcast", { event: "sync_request" }, () => {
      console.log("[SpectaclesView] Sync request from glasses");
    });

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") setChannelReady(true);
    });
    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      setChannelReady(false);
    };
  }, [room?.slug, deviceId]);

  // Broadcast loop: render map to hidden canvas, send via scene+tex protocol
  // that TilePanel expects (create one big tile, update its texture each frame)
  useEffect(() => {
    if (!channelReady) return;

    const TILE_ID = "navigator-map";
    const W = 1024;
    const H = 768;
    const offscreen = new OffscreenCanvas(W, H);
    broadcastCanvasRef.current = offscreen;
    setBroadcasting(true);
    let tileCreated = false;

    // Announce presence
    channelRef.current?.send({
      type: "broadcast",
      event: "broadcaster_online",
      payload: { deviceId, ts: Date.now() },
    });

    // Broadcast at ~5fps
    const loop = setInterval(async () => {
      const mapData = mapDataRef.current;
      const ctx = offscreen.getContext("2d");
      const channel = channelRef.current;
      if (!ctx || !channel) return;

      // Create the tile quad on first frame (TilePanel scene op protocol)
      if (!tileCreated) {
        channel.send({
          type: "broadcast",
          event: "scene",
          payload: {
            ops: [{
              op: "create",
              id: TILE_ID,
              x: 0,
              y: 0,
              z: 0.5,
              w: W,
              h: H,
              scale: 1,
              layer: 0,
              visible: true,
              interactive: false,
              draggable: false,
            }],
          },
        });
        tileCreated = true;
      }

      renderMapToCanvas(ctx, {
        nodes: mapData?.nodes || [],
        trajectory: mapData?.trajectory || [],
        alignments: mapData?.alignments || [],
        width: W,
        height: H,
        dark: themeRef.current === "dark",
        panX: 0,
        panY: 0,
        zoom: 1,
      });

      // Encode to JPEG and send as tex_batch (what TilePanel listens for)
      try {
        const blob = await offscreen.convertToBlob({ type: "image/jpeg", quality: 0.8 });
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = (reader.result as string).split(",")[1];
          channel.send({
            type: "broadcast",
            event: "tex_batch",
            payload: {
              textures: [{ id: TILE_ID, image: base64 }],
            },
          });
        };
        reader.readAsDataURL(blob);
      } catch {
        // encoding can fail if tab is backgrounded
      }
    }, 33); // ~30fps

    intervalRef.current = loop;
    return () => {
      clearInterval(loop);
      intervalRef.current = null;
      setBroadcasting(false);
    };
  }, [channelReady, deviceId]);

  const iframeSrc = useMemo(() => {
    if (!roomId) return null;
    return `${BASE_URL}?room=${roomId}&theme=${theme}&scenario=saas-deploy`;
  }, [roomId, theme]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

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
            fontFamily: "var(--font-display, 'Plus Jakarta Sans', system-ui, sans-serif)",
          }}
        >
          Eywa
        </span>
        <span style={{ fontSize: 11, color: isDark ? "#484f58" : "#999" }}>
          /{roomSlug}
        </span>

        {broadcasting && (
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
            BROADCASTING
          </span>
        )}

        <div style={{ flex: 1 }} />

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          style={{
            background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
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
              ? isDark ? "#1e1e2e" : "#eee"
              : "rgba(21,209,255,0.12)",
            color: syncing
              ? isDark ? "#6b7280" : "#999"
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
