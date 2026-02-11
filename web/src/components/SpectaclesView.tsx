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
// Agent color palette (matches tileRenderers.ts)
const AGENT_PALETTE = [
  "#E64980", "#CC5DE8", "#845EF7", "#5C7CFA",
  "#339AF0", "#22B8CF", "#20C997", "#51CF66",
];
function mapAgentColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AGENT_PALETTE[Math.abs(hash) % AGENT_PALETTE.length];
}
function hexR(hex: string): number { return parseInt(hex.slice(1, 3), 16); }
function hexG(hex: string): number { return parseInt(hex.slice(3, 5), 16); }
function hexB(hex: string): number { return parseInt(hex.slice(5, 7), 16); }

interface MapRenderOpts {
  nodes: NavigatorNode[];
  trajectory: NavigatorMapResponse["trajectory"];
  width: number;
  height: number;
  dark: boolean;
  panX: number;
  panY: number;
  zoom: number;
}

function renderMapToCanvas(ctx: OffscreenCanvasRenderingContext2D, opts: MapRenderOpts) {
  const { nodes, trajectory, width: W, height: H, dark, panX, panY, zoom } = opts;

  // Theme colors
  const bg = dark ? "#080a08" : "#fafafa";
  const gridColor = dark ? "rgba(0, 220, 100, 0.08)" : "rgba(60, 60, 70, 0.12)";
  const textColor = dark ? [0, 210, 110] : [50, 50, 60];
  const dimText = dark ? "rgba(0, 210, 110, 0.4)" : "rgba(100, 100, 110, 0.6)";
  const ringColor = dark ? [0, 180, 90] : [80, 60, 140];
  const bgRgb = dark ? "8, 10, 8" : "250, 250, 250";

  // Clear
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  if (nodes.length === 0) {
    ctx.fillStyle = dimText;
    ctx.font = `${Math.max(12, W / 50)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Syncing map data...", W / 2, H / 2);
    return;
  }

  // Responsive grid spacing
  const pad = 30;
  const spacing = Math.max(28, Math.min(48, W / 22));
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;
  const gx0 = ((panX * zoom + W / 2) % spacing + spacing) % spacing;
  const gy0 = ((panY * zoom + H / 2) % spacing + spacing) % spacing;
  for (let x = gx0; x < W; x += spacing) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = gy0; y < H; y += spacing) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  // Coordinate transform
  const scale = Math.min(W, H) * 0.38 * zoom;
  const cx = W / 2 + panX * zoom;
  const cy = H / 2 + panY * zoom;
  const toScreen = (x: number, y: number): [number, number] => [
    cx + x * scale * 0.85,
    cy - y * scale * 0.85,
  ];

  // Build node position map
  const nodePos = new Map<string, [number, number]>();
  for (const n of nodes) {
    nodePos.set(n.id, toScreen(n.x, n.y));
  }

  // Radial rings around goal
  const goalNode = nodes.find(n => n.type === "goal");
  if (goalNode) {
    const [gx, gy] = nodePos.get(goalNode.id)!;
    ctx.lineWidth = 0.8;
    for (let r = 0.2; r <= 1.0; r += 0.2) {
      ctx.strokeStyle = `rgba(${ringColor[0]}, ${ringColor[1]}, ${ringColor[2]}, ${r < 0.95 ? 0.1 : 0.18})`;
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.arc(gx, gy, r * scale * 0.85, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  // Draw trajectory edges (agent-colored, curvature-weighted)
  let maxCurv = 0;
  for (const t of trajectory) {
    const c = (t as unknown as { curvature?: number }).curvature || 0;
    if (c > maxCurv) maxCurv = c;
  }
  for (const t of trajectory) {
    const from = nodePos.get(t.from);
    const to = nodePos.get(t.to);
    if (!from || !to) continue;
    const color = mapAgentColor(t.agent);
    const r = hexR(color), g = hexG(color), b = hexB(color);
    const curv = (t as unknown as { curvature?: number }).curvature || 0;
    const normCurv = maxCurv > 0 ? curv / maxCurv : 0;
    ctx.lineWidth = (0.8 + normCurv * 1.4) * zoom;
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${(dark ? 0.5 : 0.35) + normCurv * 0.3})`;
    if (normCurv > 0.5) ctx.setLineDash([]);
    else ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(from[0], from[1]);
    ctx.lineTo(to[0], to[1]);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Font sizes that scale with canvas
  const labelFont = Math.max(10, Math.min(14, W / 60));
  const smallFont = Math.max(8, Math.min(11, W / 80));

  // Draw action nodes (small filled circles + glow)
  for (const n of nodes) {
    if (n.type !== "action") continue;
    const pos = nodePos.get(n.id);
    if (!pos) continue;
    const color = n.agent ? mapAgentColor(n.agent) : (dark ? "#4ade80" : "#16a34a");
    const r = hexR(color), g = hexG(color), b = hexB(color);
    const rad = 4 * zoom;
    // Glow
    const glow = ctx.createRadialGradient(pos[0], pos[1], rad * 0.5, pos[0], pos[1], rad * 4);
    glow.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${dark ? 0.12 : 0.06})`);
    glow.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(pos[0], pos[1], rad * 4, 0, Math.PI * 2);
    ctx.fill();
    // Dot
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${dark ? 0.9 : 0.75})`;
    ctx.beginPath();
    ctx.arc(pos[0], pos[1], rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 1)`;
    ctx.lineWidth = 1.2 * zoom;
    ctx.stroke();
  }

  // Draw state nodes (ring outline)
  for (const n of nodes) {
    if (n.type !== "state") continue;
    const pos = nodePos.get(n.id);
    if (!pos) continue;
    const color = n.agent ? mapAgentColor(n.agent) : (dark ? "#fbbf24" : "#ca8a04");
    const r = hexR(color), g = hexG(color), b = hexB(color);
    const rad = 4.5 * zoom;
    ctx.fillStyle = dark ? "rgba(10, 14, 10, 0.9)" : "rgba(255, 255, 255, 0.85)";
    ctx.beginPath();
    ctx.arc(pos[0], pos[1], rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${dark ? 0.8 : 0.6})`;
    ctx.lineWidth = 1.5 * zoom;
    ctx.stroke();
  }

  // Draw source nodes
  for (const n of nodes) {
    if (n.type !== "source") continue;
    const pos = nodePos.get(n.id);
    if (!pos) continue;
    const name = n.agent || n.label || n.id;
    const color = mapAgentColor(name);
    const rad = 6 * zoom;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(pos[0], pos[1], rad, 0, Math.PI * 2);
    ctx.fill();
    // Label
    const short = name.includes("/") ? name.split("/").pop()! : name;
    ctx.fillStyle = `rgba(${textColor[0]}, ${textColor[1]}, ${textColor[2]}, 0.7)`;
    ctx.font = `${smallFont * zoom}px Inter, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(short.replace(" (active)", ""), pos[0], pos[1] + rad + 4);
  }

  // Draw goal nodes (4-point star + glow)
  for (const n of nodes) {
    if (n.type !== "goal") continue;
    const pos = nodePos.get(n.id);
    if (!pos) continue;
    const sz = 18 * zoom;
    // Glow
    const glow = ctx.createRadialGradient(pos[0], pos[1], 0, pos[0], pos[1], sz * 2.5);
    const gc = dark ? [0, 255, 200] : [200, 160, 40];
    glow.addColorStop(0, `rgba(${gc[0]}, ${gc[1]}, ${gc[2]}, 0.25)`);
    glow.addColorStop(0.5, `rgba(${gc[0]}, ${gc[1]}, ${gc[2]}, 0.06)`);
    glow.addColorStop(1, `rgba(${gc[0]}, ${gc[1]}, ${gc[2]}, 0)`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(pos[0], pos[1], sz * 2.5, 0, Math.PI * 2);
    ctx.fill();
    // Star
    ctx.save();
    ctx.translate(pos[0], pos[1]);
    const outerV = sz, outerH = sz * 0.6, pinch = sz * 0.08;
    ctx.beginPath();
    ctx.moveTo(0, -outerV);
    ctx.quadraticCurveTo(pinch, -pinch, outerH, 0);
    ctx.quadraticCurveTo(pinch, pinch, 0, outerV);
    ctx.quadraticCurveTo(-pinch, pinch, -outerH, 0);
    ctx.quadraticCurveTo(-pinch, -pinch, 0, -outerV);
    ctx.closePath();
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, sz);
    grad.addColorStop(0, `rgba(${gc[0]}, ${gc[1]}, ${gc[2]}, 0.6)`);
    grad.addColorStop(0.35, `rgba(${gc[0]}, ${gc[1]}, ${gc[2]}, 0.3)`);
    grad.addColorStop(1, `rgba(${gc[0]}, ${gc[1]}, ${gc[2]}, 0.06)`);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();
    // Label below
    const label = n.label.length > 24 ? n.label.slice(0, 22) + ".." : n.label;
    ctx.fillStyle = `rgba(${textColor[0]}, ${textColor[1]}, ${textColor[2]}, 0.9)`;
    ctx.font = `bold ${labelFont * zoom}px Inter, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(label, pos[0], pos[1] + sz + 6);
  }

  // Edge fades (vignette)
  const fadeW = Math.max(16, W / 40);
  const lG = ctx.createLinearGradient(0, 0, fadeW, 0);
  lG.addColorStop(0, `rgba(${bgRgb}, 0.8)`); lG.addColorStop(1, `rgba(${bgRgb}, 0)`);
  ctx.fillStyle = lG; ctx.fillRect(0, 0, fadeW, H);
  const rG = ctx.createLinearGradient(W - fadeW, 0, W, 0);
  rG.addColorStop(0, `rgba(${bgRgb}, 0)`); rG.addColorStop(1, `rgba(${bgRgb}, 0.8)`);
  ctx.fillStyle = rG; ctx.fillRect(W - fadeW, 0, fadeW, H);
  const tG = ctx.createLinearGradient(0, 0, 0, fadeW);
  tG.addColorStop(0, `rgba(${bgRgb}, 0.8)`); tG.addColorStop(1, `rgba(${bgRgb}, 0)`);
  ctx.fillStyle = tG; ctx.fillRect(0, 0, W, fadeW);
  const bG = ctx.createLinearGradient(0, H - fadeW, 0, H);
  bG.addColorStop(0, `rgba(${bgRgb}, 0)`); bG.addColorStop(1, `rgba(${bgRgb}, 0.8)`);
  ctx.fillStyle = bG; ctx.fillRect(0, H - fadeW, W, fadeW);

  // Title
  ctx.fillStyle = dimText;
  ctx.font = `${smallFont}px Inter, system-ui, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("Eywa Navigator", 12, 10);
  ctx.fillText(`${nodes.length} nodes`, 12, 10 + smallFont + 4);
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
        // Cap at 10 memories per agent to avoid overwhelming the map
        if (agent.memories.length < 10) {
          agent.memories.push({
            content: (m.content || "").slice(0, 200),
            action: (meta.action as string) || undefined,
          });
        }
      }

      // Cap at 15 agents max
      const agents = Array.from(agentMap.values()).slice(0, 15);
      const targetRoom = roomId || `eywa-${roomSlug}`;
      await syncEywaRoom(targetRoom, {
        destination: "Launch-ready product",
        agents,
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
