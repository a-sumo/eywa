/**
 * SpectaclesView.tsx
 *
 * Fullscreen Guild Navigator map for Spectacles streaming.
 * Web users see the interactive canvas (same renderer as NavigatorMap.tsx).
 * A hidden canvas renders frames and broadcasts to Spectacles via Supabase Realtime.
 *
 * Both the visible and broadcast canvases use the vendored navigator-map.js
 * for pixel-identical rendering with guild-navigator.
 */

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useRoomContext } from "../context/RoomContext";
import { useRealtimeMemories } from "../hooks/useRealtimeMemories";
import { supabase } from "../lib/supabase";
import { NavigatorMap as NavigatorMapRenderer } from "../lib/navigator-map.js";
import type { NavigatorMapData } from "../lib/navigator-map.js";
import {
  syncEywaRoom,
  getMap,
  listRooms,
  connectStream,
  BASE_URL,
} from "../lib/navigatorClient";

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

  // Refs
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const mapDataRef = useRef<NavigatorMapData | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const themeRef = useRef(theme);
  themeRef.current = theme;

  // Visible canvas + renderer
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<NavigatorMapRenderer | null>(null);
  const hoveredRef = useRef<import("../lib/navigator-map.js").NavigatorMapNode | null>(null);
  const draggingRef = useRef(false);
  const dragMovedRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const targetZoomRef = useRef(1);
  const targetPanRef = useRef({ x: 0, y: 0 });
  const viewAnimRef = useRef(false);

  // Broadcast canvas + renderer (hidden, fixed size for Spectacles)
  const broadcastCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const broadcastMapRef = useRef<NavigatorMapRenderer | null>(null);

  // --- Initialize visible renderer ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const map = new NavigatorMapRenderer(canvas, { theme });
    mapRef.current = map;
    map.draw(null);
    return () => { map.destroy(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Theme sync
  useEffect(() => {
    mapRef.current?.setTheme(theme);
    broadcastMapRef.current?.setTheme(theme);
    redraw();
  }, [theme]);

  // Resize
  useEffect(() => {
    const onResize = () => { mapRef.current?.resize(); redraw(); };
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(onResize);
    if (canvasRef.current?.parentElement) ro.observe(canvasRef.current.parentElement);
    return () => { window.removeEventListener("resize", onResize); ro.disconnect(); };
  }, []);

  function redraw() {
    const map = mapRef.current;
    if (!map) return;
    requestAnimationFrame(() => map.draw(hoveredRef.current));
  }

  // Find best Navigator room on load
  useEffect(() => {
    listRooms()
      .then((rooms) => {
        const match = rooms
          .filter((r) =>
            r.id.startsWith(`eywa-${roomSlug}`) || r.id === roomSlug || r.id === "demo"
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
        { name: string; isActive: boolean; memories: Array<{ content: string; action?: string }> }
      >();
      const now = Date.now();
      for (const m of memories) {
        if (!agentMap.has(m.agent)) {
          agentMap.set(m.agent, { name: m.agent, isActive: false, memories: [] });
        }
        const agent = agentMap.get(m.agent)!;
        if (now - new Date(m.ts).getTime() < 5 * 60 * 1000) agent.isActive = true;
        const meta = (m.metadata ?? {}) as Record<string, unknown>;
        if (agent.memories.length < 10) {
          agent.memories.push({
            content: (m.content || "").slice(0, 200),
            action: (meta.action as string) || undefined,
          });
        }
      }

      const agents = Array.from(agentMap.values()).slice(0, 15);
      const targetRoom = roomId || `eywa-${roomSlug}`;
      await syncEywaRoom(targetRoom, { destination: "Launch-ready product", agents });
      setSynced(true);
    } catch (e) {
      console.warn("[SpectaclesView] sync error:", e);
    } finally {
      setSyncing(false);
    }
  }, [memories, room, roomId, roomSlug, syncing]);

  // Auto-sync once
  useEffect(() => {
    if (!synced && roomId && memories.length > 0) syncData();
  }, [synced, roomId, memories.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch map data via SSE + periodic re-sync
  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;

    const fetchMap = async () => {
      try {
        const map = await getMap(roomId);
        if (cancelled) return;
        const d = map as NavigatorMapData;
        mapDataRef.current = d;
        mapRef.current?.setData(d);
        broadcastMapRef.current?.setData(d);
        redraw();
      } catch (e) {
        console.warn("[SpectaclesView] map fetch error:", e);
      }
    };

    // SSE for live updates
    const cleanupSSE = connectStream(roomId, (state) => {
      const d = state as NavigatorMapData;
      mapDataRef.current = d;
      mapRef.current?.setData(d);
      broadcastMapRef.current?.setData(d);
      redraw();
    });

    // Also periodic re-sync + fetch
    const tick = async () => { await syncData(); await fetchMap(); };
    fetchMap();
    const interval = setInterval(tick, 30_000);

    return () => { cancelled = true; clearInterval(interval); cleanupSSE(); };
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

  // Broadcast loop: render map to hidden canvas using NavigatorMap, send frames
  useEffect(() => {
    if (!channelReady) return;

    const TILE_ID = "navigator-map";
    const W = 1024;
    const H = 768;

    // Create hidden canvas for broadcast rendering
    const bCanvas = document.createElement("canvas");
    bCanvas.style.cssText = "position:absolute;left:-9999px;width:1024px;height:768px";
    document.body.appendChild(bCanvas);
    broadcastCanvasRef.current = bCanvas;

    // Create a NavigatorMap renderer for the broadcast canvas
    const bMap = new NavigatorMapRenderer(bCanvas, { theme: themeRef.current });
    broadcastMapRef.current = bMap;

    // Seed with current data if available
    if (mapDataRef.current) bMap.setData(mapDataRef.current);

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
      const channel = channelRef.current;
      if (!channel) return;

      // Create tile quad on first frame
      if (!tileCreated) {
        channel.send({
          type: "broadcast",
          event: "scene",
          payload: {
            ops: [{
              op: "create",
              id: TILE_ID,
              x: 0, y: 0, z: 0.5,
              w: W, h: H, scale: 1,
              layer: 0, visible: true, interactive: false, draggable: false,
            }],
          },
        });
        tileCreated = true;
      }

      // Sync theme
      if (bMap.themeName !== themeRef.current) bMap.setTheme(themeRef.current);

      // Render frame
      bMap.draw(null);

      // Capture and send
      try {
        const blob = await new Promise<Blob | null>((resolve) => bCanvas.toBlob(resolve, "image/jpeg", 0.8));
        if (!blob) return;
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = (reader.result as string).split(",")[1];
          channel.send({
            type: "broadcast",
            event: "tex_batch",
            payload: { textures: [{ id: TILE_ID, image: base64 }] },
          });
        };
        reader.readAsDataURL(blob);
      } catch {
        // encoding can fail if tab is backgrounded
      }
    }, 200); // ~5fps

    intervalRef.current = loop;
    return () => {
      clearInterval(loop);
      intervalRef.current = null;
      bMap.destroy();
      broadcastMapRef.current = null;
      document.body.removeChild(bCanvas);
      broadcastCanvasRef.current = null;
      setBroadcasting(false);
    };
  }, [channelReady, deviceId]);

  // --- Interaction handlers (same pattern as NavigatorMap.tsx) ---
  const VIEW_LERP = 0.18;

  function startViewAnim() {
    if (viewAnimRef.current) return;
    viewAnimRef.current = true;
    requestAnimationFrame(viewAnimFrame);
  }

  function viewAnimFrame() {
    const map = mapRef.current;
    if (!map) { viewAnimRef.current = false; return; }
    map.zoom += (targetZoomRef.current - map.zoom) * VIEW_LERP;
    map.panX += (targetPanRef.current.x - map.panX) * VIEW_LERP;
    map.panY += (targetPanRef.current.y - map.panY) * VIEW_LERP;
    map.recalcGoalScreen();
    map.draw(hoveredRef.current);
    const dz = Math.abs(targetZoomRef.current - map.zoom);
    const dp = Math.abs(targetPanRef.current.x - map.panX) + Math.abs(targetPanRef.current.y - map.panY);
    if (dz > 0.002 || dp > 0.5) {
      requestAnimationFrame(viewAnimFrame);
    } else {
      map.zoom = targetZoomRef.current;
      map.panX = targetPanRef.current.x;
      map.panY = targetPanRef.current.y;
      map.recalcGoalScreen();
      map.draw(hoveredRef.current);
      viewAnimRef.current = false;
    }
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const map = mapRef.current;
    if (!map) return;
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.1, Math.min(20, targetZoomRef.current * factor));
    const mx = e.clientX - map.cx;
    const my = e.clientY - map.cy;
    targetPanRef.current = {
      x: mx - (mx - targetPanRef.current.x) * (newZoom / targetZoomRef.current),
      y: my - (my - targetPanRef.current.y) * (newZoom / targetZoomRef.current),
    };
    targetZoomRef.current = newZoom;
    startViewAnim();
  }

  function onMouseDown(e: React.MouseEvent) {
    draggingRef.current = true;
    dragMovedRef.current = false;
    const map = mapRef.current;
    if (!map) return;
    dragStartRef.current = { x: e.clientX, y: e.clientY, panX: map.panX, panY: map.panY };
  }

  function onMouseMove(e: React.MouseEvent) {
    const map = mapRef.current;
    if (!map) return;
    if (draggingRef.current) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) dragMovedRef.current = true;
      map.setPan(dragStartRef.current.panX + dx, dragStartRef.current.panY + dy);
      targetPanRef.current = { x: map.panX, y: map.panY };
      redraw();
      return;
    }
    const node = map.hitTest(e.clientX, e.clientY);
    if (node !== hoveredRef.current) { hoveredRef.current = node; redraw(); }
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.style.cursor = (node || map.hitTestLegend(e.clientX, e.clientY)) ? "pointer" : "default";
    }
  }

  function onMouseUp() { draggingRef.current = false; }

  function onClick(e: React.MouseEvent) {
    if (dragMovedRef.current) return;
    const map = mapRef.current;
    if (!map) return;
    const agent = map.hitTestLegend(e.clientX, e.clientY);
    if (agent) { map.toggleAgent(agent); redraw(); }
  }

  function onDoubleClick() {
    targetZoomRef.current = 1;
    targetPanRef.current = { x: 0, y: 0 };
    startViewAnim();
  }

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));
  const isDark = theme === "dark";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        width: "100vw",
        background: isDark ? "#080a08" : "#fafafa",
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
        <span style={{
          fontSize: 13, fontWeight: 600, color: "#15D1FF",
          fontFamily: "var(--font-display, 'Plus Jakarta Sans', system-ui, sans-serif)",
        }}>
          Eywa
        </span>
        <span style={{ fontSize: 11, color: isDark ? "#484f58" : "#999" }}>
          /{roomSlug}
        </span>

        {broadcasting && (
          <span style={{
            fontSize: 10, fontWeight: 700, color: "#4ade80",
            background: "rgba(74,222,128,0.12)", padding: "2px 6px",
            borderRadius: 3, letterSpacing: "0.5px",
          }}>
            BROADCASTING
          </span>
        )}

        <div style={{ flex: 1 }} />

        <button
          onClick={toggleTheme}
          style={{
            background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
            color: isDark ? "#e6edf3" : "#333",
            border: `1px solid ${isDark ? "#30363d" : "#ddd"}`,
            borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer",
          }}
        >
          {isDark ? "Light" : "Dark"}
        </button>

        <button
          onClick={syncData}
          disabled={syncing}
          style={{
            background: syncing ? (isDark ? "#1e1e2e" : "#eee") : "rgba(21,209,255,0.12)",
            color: syncing ? (isDark ? "#6b7280" : "#999") : "#15D1FF",
            border: "1px solid rgba(21,209,255,0.3)",
            borderRadius: 6, padding: "4px 10px", fontSize: 11,
            cursor: syncing ? "default" : "pointer",
          }}
        >
          {syncing ? "Syncing..." : "Sync"}
        </button>
      </div>

      {/* Navigator map canvas */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: "100%", display: "block" }}
          onWheel={onWheel}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onClick={onClick}
          onDoubleClick={onDoubleClick}
        />
        {!mapDataRef.current && (
          <div style={{
            position: "absolute", inset: 0, display: "flex",
            alignItems: "center", justifyContent: "center",
            color: isDark ? "#484f58" : "#999", fontSize: 13, pointerEvents: "none",
          }}>
            {syncing ? "Syncing room data..." : "Connecting..."}
          </div>
        )}
      </div>
    </div>
  );
}
