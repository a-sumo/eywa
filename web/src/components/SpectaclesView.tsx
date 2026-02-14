/**
 * SpectaclesView.tsx
 *
 * Fullscreen Guild Navigator map for Spectacles streaming.
 *
 * Architecture:
 * 1. Web page renders the navigator map on a visible canvas (for debugging/preview)
 * 2. A hidden broadcast canvas renders frames at ~5fps
 * 3. Frames are sent to Spectacles via Supabase Realtime
 * 4. Spectacles sends SIK interaction events (zoom, pan, select, etc.) back via Realtime
 * 5. This view processes those events and updates the renderer accordingly
 *
 * Controls follow Spectacles ergonomics:
 * - Tap targets: 2.0+ cm (44px+ on web fallback)
 * - Pinch uncertainty: 1-2 cm, generous padding
 * - Gestures: clap (expand), snap (reset), peace sign (focus)
 */

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useFoldContext } from "../context/FoldContext";
import { useRealtimeMemories } from "../hooks/useRealtimeMemories";
import { supabase } from "../lib/supabase";
import { NavigatorMap as NavigatorMapRenderer } from "../lib/navigator-map.js";
import type { NavigatorMapData, NavigatorMapNode } from "../lib/navigator-map.js";
import {
  syncEywaRoom,
  getMap,
  listRooms,
  connectStream,
} from "../lib/navigatorClient";

// --- SIK Interaction Event Types ---
// These arrive from Spectacles via Supabase Realtime broadcast
interface SikEvent {
  type:
    | "zoom_in"
    | "zoom_out"
    | "pan"
    | "reset_view"
    | "select"
    | "toggle_agent"
    | "toggle_grid"
    | "toggle_theme"
    | "toggle_info"
    | "focus_agent"
    | "focus_node"
    | "pan_to_region";
  // zoom
  factor?: number;
  // pan (normalized -1 to 1, relative to canvas)
  dx?: number;
  dy?: number;
  // select (normalized 0-1 coords on the broadcast canvas)
  x?: number;
  y?: number;
  // toggle_agent / focus_agent
  agent?: string;
  // focus_node
  nodeId?: string;
  // focus zoom level (optional, defaults to 2.5 for focus commands)
  focusZoom?: number;
  // pan_to_region: normalized world coords
  wx?: number;
  wy?: number;
}

// --- Button style for Spectacles-sized controls ---
// Min 44px touch target per ergonomics spec (2cm at screen distance)
const CTRL_BTN: React.CSSProperties = {
  minWidth: 48,
  minHeight: 48,
  padding: "10px 16px",
  fontSize: 16,
  fontWeight: 600,
  borderRadius: 12,
  border: "none",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  touchAction: "manipulation",
  userSelect: "none",
};

// --- Debug button grid definition ---
const DEBUG_BUTTONS: Array<{ label: string; cmd: SikEvent | null }> = [
  { label: "Z+",    cmd: { type: "zoom_in", factor: 1.4 } },
  { label: "Z-",    cmd: { type: "zoom_out", factor: 0.6 } },
  { label: "Reset",  cmd: { type: "reset_view" } },
  { label: "Grid",   cmd: { type: "toggle_grid" } },
  { label: "PanL",   cmd: { type: "pan", dx: -0.3, dy: 0 } },
  { label: "PanR",   cmd: { type: "pan", dx: 0.3, dy: 0 } },
  { label: "PanU",   cmd: { type: "pan", dx: 0, dy: -0.3 } },
  { label: "PanD",   cmd: { type: "pan", dx: 0, dy: 0.3 } },
  { label: "Focus",  cmd: null },  // cycles through agents
  { label: "Theme",  cmd: { type: "toggle_theme" } },
  { label: "Info",   cmd: { type: "toggle_info" } },
  { label: "SIM",    cmd: null },  // toggles sim mode
];
const DBG_COLS = 4;
const DBG_ROWS = 3;

function renderDebugButtons(ctx: CanvasRenderingContext2D, w: number, h: number, hoverIdx: number, simActive: boolean) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#0a0c0a";
  ctx.fillRect(0, 0, w, h);
  const cellW = w / DBG_COLS;
  const cellH = h / DBG_ROWS;
  const pad = 6;
  for (let i = 0; i < DEBUG_BUTTONS.length; i++) {
    const btn = DEBUG_BUTTONS[i];
    const col = i % DBG_COLS;
    const row = Math.floor(i / DBG_COLS);
    const x = col * cellW + pad;
    const y = row * cellH + pad;
    const bw = cellW - pad * 2;
    const bh = cellH - pad * 2;
    const isHover = i === hoverIdx;
    const isSimBtn = btn.label === "SIM";
    const active = isSimBtn && simActive;
    ctx.beginPath();
    ctx.roundRect(x, y, bw, bh, 8);
    ctx.fillStyle = active ? "rgba(0,232,120,0.35)" : isHover ? "rgba(0,232,120,0.22)" : "rgba(0,232,120,0.06)";
    ctx.fill();
    ctx.strokeStyle = active ? "#4ade80" : "rgba(0,232,120,0.25)";
    ctx.lineWidth = active ? 2 : 1;
    ctx.stroke();
    ctx.fillStyle = isHover || active ? "#fff" : "#4ade80";
    ctx.font = `bold ${Math.round(bh * 0.28)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(btn.label, x + bw / 2, y + bh / 2);
  }
}

function renderEventLog(ctx: CanvasRenderingContext2D, w: number, h: number, events: Array<{ event: string; detail: string; ts: number }>) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#0a0c0a";
  ctx.fillRect(0, 0, w, h);
  // Header
  ctx.fillStyle = "#4ade80";
  ctx.font = "bold 14px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("EVENT LOG", 12, 10);
  ctx.strokeStyle = "rgba(0,232,120,0.15)";
  ctx.beginPath();
  ctx.moveTo(12, 30);
  ctx.lineTo(w - 12, 30);
  ctx.stroke();
  // Events
  const lineH = 24;
  const startY = 38;
  const maxVisible = Math.floor((h - startY) / lineH);
  const visible = events.slice(-maxVisible);
  for (let i = 0; i < visible.length; i++) {
    const e = visible[i];
    const y = startY + i * lineH;
    const age = Date.now() - e.ts;
    const alpha = Math.max(0.3, 1 - age / 12000);
    ctx.fillStyle = `rgba(74,222,128,${alpha})`;
    ctx.font = "bold 12px monospace";
    ctx.fillText(e.event, 12, y);
    ctx.fillStyle = `rgba(255,255,255,${alpha * 0.55})`;
    ctx.font = "12px monospace";
    ctx.fillText(e.detail.slice(0, 35), 120, y);
  }
  if (visible.length === 0) {
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.font = "13px system-ui, sans-serif";
    ctx.fillText("Waiting for events...", 12, startY);
  }
}

export function SpectaclesView() {
  const { fold } = useFoldContext();
  const { memories } = useRealtimeMemories(fold?.id ?? null, 200);

  const [roomId, setRoomId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [synced, setSynced] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [channelReady, setChannelReady] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);
  const [gridMode, setGridMode] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  // Voice state (events from Spectacles EywaGeminiLive)
  const [voiceInput, setVoiceInput] = useState<string | null>(null);
  const [voiceResponse, setVoiceResponse] = useState<string | null>(null);
  const [voiceInjects, setVoiceInjects] = useState<Array<{ message: string; ts: number }>>([]);
  const voiceInputTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceResponseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const roomSlug = fold?.slug || "demo";
  const deviceId = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("device") || "editor";
  }, []);

  // Event log (only shown when device=sim*)
  const isSimDevice = deviceId.startsWith("sim");
  const [eventLog, setEventLog] = useState<Array<{ event: string; detail: string; ts: number }>>([]);
  const pushEvent = useCallback((event: string, detail: string) => {
    const entry = { event, detail, ts: Date.now() };
    eventLogRef.current = [...eventLogRef.current.slice(-14), entry];
    if (isSimDevice) {
      setEventLog((prev) => [...prev.slice(-7), entry]);
    }
  }, [isSimDevice]);

  // Refs
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const mapDataRef = useRef<NavigatorMapData | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const themeRef = useRef(theme);
  themeRef.current = theme;

  // Visible canvas + renderer
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<NavigatorMapRenderer | null>(null);
  const hoveredRef = useRef<NavigatorMapNode | null>(null);
  const draggingRef = useRef(false);
  const dragMovedRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const targetZoomRef = useRef(1);
  const targetPanRef = useRef({ x: 0, y: 0 });
  const viewAnimRef = useRef(false);

  // Broadcast canvas + renderer (hidden, fixed size for Spectacles)
  const broadcastCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const broadcastMapRef = useRef<NavigatorMapRenderer | null>(null);

  // Debug tile state (accessible from setInterval via refs)
  const eventLogRef = useRef<Array<{ event: string; detail: string; ts: number }>>([]);
  const debugHoverRef = useRef(-1);
  const focusIdxRef = useRef(0);
  const simModeRef = useRef(false);
  const simTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Remote cursor from LS (u,v on navigator-map tile, null when not hovering)
  const remoteCursorRef = useRef<{ u: number; v: number; ts: number } | null>(null);
  const sendSceneOpsRef = useRef<(() => void) | null>(null);

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

  // Sync both renderers' view state (zoom, pan) so broadcast matches visible
  function syncBroadcastView() {
    const vis = mapRef.current;
    const brd = broadcastMapRef.current;
    if (!vis || !brd) return;
    brd.setZoom(vis.zoom);
    // Scale pan proportionally to broadcast canvas size
    const sx = brd.W / vis.W;
    const sy = brd.H / vis.H;
    brd.setPan(vis.panX * sx, vis.panY * sy);
    brd.draw(hoveredRef.current);
  }

  // --- Data loading ---
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
    if (syncing || !fold || memories.length === 0) return;
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
  }, [memories, fold, roomId, roomSlug, syncing]);

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

    const cleanupSSE = connectStream(roomId, (state) => {
      const d = state as NavigatorMapData;
      mapDataRef.current = d;
      mapRef.current?.setData(d);
      broadcastMapRef.current?.setData(d);
      redraw();
    });

    const tick = async () => { await syncData(); await fetchMap(); };
    fetchMap();
    const interval = setInterval(tick, 30_000);

    return () => { cancelled = true; clearInterval(interval); cleanupSSE(); };
  }, [roomId, syncData]);

  // --- SIK Interaction Handler ---
  // Processes interaction events from Spectacles via Supabase Realtime
  const handleSikEvent = useCallback((evt: SikEvent) => {
    const map = mapRef.current;
    if (!map) return;

    switch (evt.type) {
      case "zoom_in": {
        const factor = evt.factor || 1.3;
        targetZoomRef.current = Math.min(20, targetZoomRef.current * factor);
        pushEvent("zoom_in", `${Math.round(targetZoomRef.current * 100)}%`);
        startViewAnim();
        break;
      }
      case "zoom_out": {
        const factor = evt.factor || 0.7;
        targetZoomRef.current = Math.max(0.1, targetZoomRef.current * factor);
        pushEvent("zoom_out", `${Math.round(targetZoomRef.current * 100)}%`);
        startViewAnim();
        break;
      }
      case "pan": {
        // dx/dy are normalized -1 to 1, scale to canvas pixels
        const px = (evt.dx || 0) * map.W * 0.2;
        const py = (evt.dy || 0) * map.H * 0.2;
        targetPanRef.current = {
          x: targetPanRef.current.x + px,
          y: targetPanRef.current.y + py,
        };
        pushEvent("pan", `dx=${(evt.dx||0).toFixed(2)} dy=${(evt.dy||0).toFixed(2)}`);
        startViewAnim();
        break;
      }
      case "reset_view": {
        targetZoomRef.current = 1;
        targetPanRef.current = { x: 0, y: 0 };
        pushEvent("reset_view", "");
        startViewAnim();
        break;
      }
      case "select": {
        // Normalized coords (0-1) on the broadcast canvas, map to visible canvas
        if (evt.x != null && evt.y != null) {
          const sx = evt.x * map.W;
          const sy = evt.y * map.H;
          const agent = map.hitTestLegend(sx, sy);
          if (agent) {
            map.toggleAgent(agent);
            pushEvent("select", `legend: ${agent}`);
          } else {
            const node = map.hitTest(sx, sy);
            hoveredRef.current = node;
            pushEvent("select", node ? `node: ${(node as any).label || (node as any).id || "?"}` : `miss (${evt.x.toFixed(2)},${evt.y.toFixed(2)})`);
          }
          redraw();
        }
        break;
      }
      case "toggle_agent": {
        if (evt.agent) {
          map.toggleAgent(evt.agent);
          pushEvent("toggle_agent", evt.agent);
          redraw();
        }
        break;
      }
      case "toggle_grid": {
        const next = !map.gridMode;
        map.setGridMode(next);
        setGridMode(next);
        pushEvent("toggle_grid", next ? "on" : "off");
        redraw();
        break;
      }
      case "toggle_theme": {
        setTheme((t) => {
          const next = t === "dark" ? "light" : "dark";
          pushEvent("toggle_theme", next);
          return next;
        });
        break;
      }
      case "toggle_info": {
        setShowInfo((v) => {
          pushEvent("toggle_info", !v ? "open" : "close");
          return !v;
        });
        break;
      }
      case "focus_agent": {
        // Pan + zoom the map to center on an agent's latest node
        if (!evt.agent || !map.data?.nodes) break;
        const agentNodes = map.data.nodes.filter(
          (n: any) => n.agent === evt.agent
        );
        if (agentNodes.length === 0) {
          pushEvent("focus_agent", `not found: ${evt.agent}`);
          break;
        }
        // Use the last node (most recent) for this agent
        const target = agentNodes[agentNodes.length - 1];
        const fz = evt.focusZoom || 2.5;
        targetZoomRef.current = fz;
        targetPanRef.current = {
          x: -target.x * map.scale * 0.85 * fz,
          y: target.y * map.scale * 0.85 * fz,
        };
        pushEvent("focus_agent", evt.agent);
        startViewAnim();
        break;
      }
      case "focus_node": {
        if (!evt.nodeId || !map.data?.nodes) break;
        const node = map.data.nodes.find((n: any) => n.id === evt.nodeId);
        if (!node) {
          pushEvent("focus_node", `not found: ${evt.nodeId}`);
          break;
        }
        const fz = evt.focusZoom || 3;
        targetZoomRef.current = fz;
        targetPanRef.current = {
          x: -node.x * map.scale * 0.85 * fz,
          y: node.y * map.scale * 0.85 * fz,
        };
        pushEvent("focus_node", `${(node as any).label || evt.nodeId}`);
        startViewAnim();
        break;
      }
      case "pan_to_region": {
        // Pan to a world-space coordinate without changing zoom
        if (evt.wx == null || evt.wy == null) break;
        targetPanRef.current = {
          x: -evt.wx * map.scale * 0.85 * targetZoomRef.current,
          y: evt.wy * map.scale * 0.85 * targetZoomRef.current,
        };
        if (evt.focusZoom) targetZoomRef.current = evt.focusZoom;
        pushEvent("pan_to_region", `(${evt.wx.toFixed(2)},${evt.wy.toFixed(2)})`);
        startViewAnim();
        break;
      }
    }

    // After any interaction, sync broadcast canvas
    syncBroadcastView();
  }, [pushEvent]);

  // --- Supabase Realtime channel ---
  useEffect(() => {
    if (!fold?.slug) return;
    const channelKey = `spectacles:${fold.slug}:${deviceId}`;
    const channel = supabase.channel(channelKey, {
      config: { broadcast: { ack: false, self: false } },
    });

    // Listen for SIK interaction events from Spectacles (legacy format)
    channel.on("broadcast", { event: "interaction" }, (msg) => {
      const payload = msg.payload as SikEvent;
      if (payload?.type) {
        handleSikEvent(payload);
      }
    });

    // Listen for interact events from TilePanel (tap/hover on quads)
    channel.on("broadcast", { event: "interact" }, (msg) => {
      const p = msg.payload;
      if (!p?.type) return;

      // Route by tile ID
      if (p.id === "debug-buttons") {
        if (p.u != null && p.v != null) {
          const col = Math.floor(p.u * DBG_COLS);
          const row = Math.floor(p.v * DBG_ROWS);
          const idx = row * DBG_COLS + col;
          if (idx < 0 || idx >= DEBUG_BUTTONS.length) return;
          const btn = DEBUG_BUTTONS[idx];

          if (p.type === "tap") {
            pushEvent("btn_tap", btn.label);
            // Handle special buttons
            if (btn.label === "Focus") {
              const agents = mapDataRef.current?.meta?.agents;
              if (agents && agents.length > 0) {
                const agent = agents[focusIdxRef.current % agents.length];
                focusIdxRef.current++;
                handleSikEvent({ type: "focus_agent", agent });
                pushEvent("focus", agent);
              }
            } else if (btn.label === "SIM") {
              simModeRef.current = !simModeRef.current;
              pushEvent("sim", simModeRef.current ? "started" : "stopped");
              if (simModeRef.current && !simTimerRef.current) {
                let step = 0;
                const agents = mapDataRef.current?.meta?.agents || [];
                simTimerRef.current = setInterval(() => {
                  if (!simModeRef.current) {
                    if (simTimerRef.current) { clearInterval(simTimerRef.current); simTimerRef.current = null; }
                    return;
                  }
                  const phase = step % (agents.length + 3);
                  if (phase < agents.length) {
                    handleSikEvent({ type: "focus_agent", agent: agents[phase], focusZoom: 2.5 });
                    pushEvent("sim", `focus ${agents[phase]}`);
                  } else if (phase === agents.length) {
                    handleSikEvent({ type: "reset_view" });
                    pushEvent("sim", "reset");
                  } else if (phase === agents.length + 1) {
                    handleSikEvent({ type: "zoom_in", factor: 1.5 });
                    pushEvent("sim", "zoom");
                  } else {
                    handleSikEvent({ type: "toggle_grid" });
                    pushEvent("sim", "grid");
                  }
                  step++;
                }, 2500);
              } else if (!simModeRef.current && simTimerRef.current) {
                clearInterval(simTimerRef.current);
                simTimerRef.current = null;
              }
            } else if (btn.cmd) {
              handleSikEvent(btn.cmd);
            }
          } else if (p.type === "hover" || p.type === "hover_move") {
            debugHoverRef.current = idx;
          } else if (p.type === "hover_exit") {
            debugHoverRef.current = -1;
          }
        }
        return;
      }

      // Navigator map interactions (default)
      const map = mapRef.current;
      if (!map) return;

      // Track remote cursor position for rendering on broadcast canvas
      if ((p.type === "hover" || p.type === "hover_move" || p.type === "tap" || p.type === "drag_delta") && p.u != null && p.v != null) {
        remoteCursorRef.current = { u: p.u, v: p.v, ts: Date.now() };
      } else if (p.type === "hover_exit" || p.type === "drag_end") {
        remoteCursorRef.current = null;
      }

      if (p.type === "tap" && p.u != null && p.v != null) {
        const sx = p.u * map.W;
        const sy = p.v * map.H;
        const agent = map.hitTestLegend(sx, sy);
        if (agent) {
          map.toggleAgent(agent);
          pushEvent("tap", `legend: ${agent}`);
        } else {
          const node = map.hitTest(sx, sy);
          hoveredRef.current = node;
          pushEvent("tap", node ? `node: ${(node as any).label || (node as any).id || "?"}` : `(${p.u.toFixed(2)},${p.v.toFixed(2)})`);
        }
        redraw();
        syncBroadcastView();
      } else if (p.type === "hover" || p.type === "hover_move") {
        if (p.u != null && p.v != null) {
          const sx = p.u * map.W;
          const sy = p.v * map.H;
          const node = map.hitTest(sx, sy);
          if (node !== hoveredRef.current) {
            hoveredRef.current = node;
            pushEvent(p.type, node ? `node: ${(node as any).label || (node as any).id || "?"}` : `(${p.u.toFixed(2)},${p.v.toFixed(2)})`);
            redraw();
            syncBroadcastView();
          }
        }
      } else if (p.type === "hover_exit") {
        if (hoveredRef.current) {
          hoveredRef.current = null;
          pushEvent("hover_exit", "");
          redraw();
          syncBroadcastView();
        }
      } else if (p.type === "drag_delta" && p.dx != null && p.dy != null) {
        // Direct pan from pinch-and-drag on the tile (dx/dy in cm from TilePanel)
        // Convert cm delta to canvas pixels: 1cm ≈ pixelsPerCm (16 default) * scale
        const scale = map.zoom * 15; // cm-to-screen-pixel factor (aggressive for snappy pan)
        targetPanRef.current = {
          x: targetPanRef.current.x + p.dx * scale,
          y: targetPanRef.current.y - p.dy * scale, // flip Y: LS +Y is up, screen +Y is down
        };
        pushEvent("drag", `dx=${p.dx.toFixed(2)} dy=${p.dy.toFixed(2)}`);
        startViewAnim();
        syncBroadcastView();
      }
    });

    // Listen for sync requests (LS reconnect or user-triggered)
    channel.on("broadcast", { event: "sync_request" }, () => {
      console.log("[SpectaclesView] Sync request from glasses, resending scene ops");
      // Resend scene ops so reconnected LS gets correct tile layout
      if (sendSceneOpsRef.current) sendSceneOpsRef.current();
      syncData();
    });

    // Voice events from Spectacles (EywaGeminiLive)
    channel.on("broadcast", { event: "voice_input" }, (msg) => {
      const p = msg.payload;
      if (p?.text) {
        setVoiceInput(p.text);
        pushEvent("voice_input", p.text.slice(0, 60));
        if (voiceInputTimer.current) clearTimeout(voiceInputTimer.current);
        voiceInputTimer.current = setTimeout(() => setVoiceInput(null), 4000);
      }
    });

    channel.on("broadcast", { event: "voice_response" }, (msg) => {
      const p = msg.payload;
      if (p?.text) {
        setVoiceResponse(p.text);
        pushEvent("voice_response", p.text.slice(0, 60));
        if (voiceResponseTimer.current) clearTimeout(voiceResponseTimer.current);
        voiceResponseTimer.current = setTimeout(() => setVoiceResponse(null), 6000);
      }
    });

    channel.on("broadcast", { event: "voice_inject" }, (msg) => {
      const p = msg.payload;
      if (p?.message) {
        setVoiceInjects((prev) => [...prev.slice(-4), { message: p.message, ts: Date.now() }]);
        pushEvent("voice_inject", p.message.slice(0, 60));
      }
    });

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") setChannelReady(true);
    });
    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      setChannelReady(false);
      if (voiceInputTimer.current) clearTimeout(voiceInputTimer.current);
      if (voiceResponseTimer.current) clearTimeout(voiceResponseTimer.current);
    };
  }, [fold?.slug, deviceId, handleSikEvent, syncData, pushEvent]);

  // --- Broadcast loop (3 tiles: navigator-map, debug-buttons, event-log) ---
  useEffect(() => {
    if (!channelReady) return;

    const MAP_ID = "navigator-map";
    const BTN_ID = "debug-buttons";
    const LOG_ID = "event-log";
    const MAP_W = 1024, MAP_H = 768;
    const BTN_W = 512, BTN_H = 384;
    const LOG_W = 512, LOG_H = 384;

    // Helper: create offscreen canvas
    const mkCanvas = (w: number, h: number) => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      c.style.cssText = "position:absolute;left:-9999px";
      document.body.appendChild(c);
      return c;
    };

    const bCanvas = mkCanvas(MAP_W, MAP_H);
    const btnCanvas = mkCanvas(BTN_W, BTN_H);
    const logCanvas = mkCanvas(LOG_W, LOG_H);
    broadcastCanvasRef.current = bCanvas;

    const bMap = new NavigatorMapRenderer(bCanvas, { theme: themeRef.current });
    broadcastMapRef.current = bMap;
    if (mapDataRef.current) bMap.setData(mapDataRef.current);

    const btnCtx = btnCanvas.getContext("2d")!;
    const logCtx = logCanvas.getContext("2d")!;

    setBroadcasting(true);

    // Send scene ops immediately so quads exist before textures arrive
    const sendSceneOps = () => {
      channelRef.current?.send({
        type: "broadcast",
        event: "scene",
        payload: {
          ops: [
            { op: "create", id: MAP_ID, x: -5, y: 0, z: 0.5, w: MAP_W, h: MAP_H, s: 0.42, layer: 0, visible: true, interactive: true, draggable: false },
            { op: "create", id: BTN_ID, x: 16, y: 4, z: 0.5, w: BTN_W, h: BTN_H, s: 0.3, layer: 0, visible: true, interactive: true, draggable: false },
            { op: "create", id: LOG_ID, x: 16, y: -4, z: 0.5, w: LOG_W, h: LOG_H, s: 0.3, layer: 0, visible: true, interactive: false, draggable: false },
          ],
        },
      });
    };
    sendSceneOpsRef.current = sendSceneOps;
    sendSceneOps();

    // Announce presence
    channelRef.current?.send({
      type: "broadcast",
      event: "broadcaster_online",
      payload: { deviceId, ts: Date.now() },
    });

    // Helper: canvas to base64 JPEG
    const canvasToBase64 = (canvas: HTMLCanvasElement, quality: number): Promise<string | null> =>
      new Promise((resolve) => {
        canvas.toBlob((blob) => {
          if (!blob) { resolve(null); return; }
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(",")[1]);
          reader.readAsDataURL(blob);
        }, "image/jpeg", quality);
      });

    // Broadcast loop: always full-res 1024x768. Async toBlob encoding is
    // non-blocking and pipelined: we render the next frame while the previous
    // one encodes. Map sends as fast as the encoder can go (~15-25fps).
    // Buttons/log only at 5fps (they rarely change).
    let lastSideBroadcast = 0;
    let lastMapBroadcast = 0;
    let loopRunning = true;
    let mapEncoding = false;
    let sideEncoding = false;

    const drawCursor = (ctx: CanvasRenderingContext2D, u: number, v: number, w: number, h: number) => {
      const cx = u * w;
      const cy = v * h;
      const r = Math.max(6, w * 0.012);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(0, 232, 120, 0.9)";
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = "#00e878";
      ctx.fill();
    };

    const broadcastTick = () => {
      if (!loopRunning) return;
      requestAnimationFrame(broadcastTick);

      const channel = channelRef.current;
      if (!channel) return;

      const now = Date.now();
      const cursor = remoteCursorRef.current;
      const cursorActive = cursor != null && (now - cursor.ts < 1500);

      // Map: 30fps when cursor active, 5fps idle
      const mapInterval = cursorActive ? 33 : 200;
      const needMap = !mapEncoding && now - lastMapBroadcast >= mapInterval;
      const needSide = !sideEncoding && now - lastSideBroadcast >= 200;

      // Scene ops sent on init + sync_request (not in tick loop)

      // Map tile: full-res, pipelined async encode
      if (needMap) {
        if (bMap.themeName !== themeRef.current) bMap.setTheme(themeRef.current);
        syncBroadcastView();
        bMap.draw(hoveredRef.current);
        if (cursorActive) {
          const ctx = bCanvas.getContext("2d");
          if (ctx) drawCursor(ctx, cursor!.u, cursor!.v, MAP_W, MAP_H);
        }
        mapEncoding = true;
        lastMapBroadcast = now;
        canvasToBase64(bCanvas, 0.7).then((mapB64) => {
          mapEncoding = false;
          if (mapB64) {
            channel.send({ type: "broadcast", event: "tex", payload: { id: MAP_ID, image: mapB64, w: MAP_W, h: MAP_H } });
          }
        }).catch(() => { mapEncoding = false; });
      }

      // Side tiles: 5fps, independent pipeline
      if (needSide) {
        renderDebugButtons(btnCtx, BTN_W, BTN_H, debugHoverRef.current, simModeRef.current);
        renderEventLog(logCtx, LOG_W, LOG_H, eventLogRef.current);
        sideEncoding = true;
        lastSideBroadcast = now;
        Promise.all([
          canvasToBase64(btnCanvas, 0.85),
          canvasToBase64(logCanvas, 0.85),
        ]).then(([btnB64, logB64]) => {
          sideEncoding = false;
          const textures: Array<{ id: string; image: string }> = [];
          if (btnB64) textures.push({ id: BTN_ID, image: btnB64 });
          if (logB64) textures.push({ id: LOG_ID, image: logB64 });
          if (textures.length > 0) {
            channel.send({ type: "broadcast", event: "tex_batch", payload: { textures } });
          }
        }).catch(() => { sideEncoding = false; });
      }
    };

    requestAnimationFrame(broadcastTick);
    return () => {
      loopRunning = false;
      bMap.destroy();
      broadcastMapRef.current = null;
      [bCanvas, btnCanvas, logCanvas].forEach((c) => document.body.removeChild(c));
      broadcastCanvasRef.current = null;
      setBroadcasting(false);
    };
  }, [channelReady, deviceId]);

  // --- View animation (smooth zoom/pan) ---
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

  // --- Canvas event handlers (web fallback) ---
  // Convert viewport coords to canvas-local coords (renderer uses canvas-local CSS pixels)
  function canvasLocal(e: { clientX: number; clientY: number }) {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: e.clientX, y: e.clientY };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const map = mapRef.current;
    if (!map) return;
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.1, Math.min(20, targetZoomRef.current * factor));
    // Zoom toward cursor: offset from canvas center in canvas-local coords
    const { x, y } = canvasLocal(e);
    const mx = x - map.cx;
    const my = y - map.cy;
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
    const { x, y } = canvasLocal(e);
    const node = map.hitTest(x, y);
    if (node !== hoveredRef.current) { hoveredRef.current = node; redraw(); }
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.style.cursor = (node || map.hitTestLegend(x, y)) ? "pointer" : "default";
    }
  }

  function onMouseUp() { draggingRef.current = false; }

  function onClick(e: React.MouseEvent) {
    if (dragMovedRef.current) return;
    const map = mapRef.current;
    if (!map) return;
    const { x, y } = canvasLocal(e);
    const agent = map.hitTestLegend(x, y);
    if (agent) { map.toggleAgent(agent); redraw(); }
  }

  function onDoubleClick() {
    handleSikEvent({ type: "reset_view" });
  }

  // --- Web control handlers (map to SIK events for consistency) ---
  const zoomIn = () => handleSikEvent({ type: "zoom_in", factor: 1.4 });
  const zoomOut = () => handleSikEvent({ type: "zoom_out", factor: 0.6 });
  const resetView = () => handleSikEvent({ type: "reset_view" });
  const toggleGrid = () => handleSikEvent({ type: "toggle_grid" });
  const toggleTheme = () => handleSikEvent({ type: "toggle_theme" });
  const toggleInfo = () => handleSikEvent({ type: "toggle_info" });

  const isDark = theme === "dark";
  const bg = isDark ? "#080a08" : "#fafafa";
  const fg = isDark ? "#e6edf3" : "#1a1a1a";
  const accent = isDark ? "#00e878" : "#6417ec";
  const btnBg = isDark ? "rgba(0,232,120,0.08)" : "rgba(100,23,236,0.06)";
  const btnBorder = isDark ? "rgba(0,232,120,0.2)" : "rgba(100,23,236,0.2)";
  const btnActive = isDark ? "rgba(0,232,120,0.18)" : "rgba(100,23,236,0.14)";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        width: "100vw",
        background: bg,
        color: fg,
        overflow: "hidden",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
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

        {/* Empty state */}
        {!mapDataRef.current && (
          <div style={{
            position: "absolute", inset: 0, display: "flex",
            alignItems: "center", justifyContent: "center",
            color: isDark ? "#484f58" : "#999", fontSize: 15, pointerEvents: "none",
          }}>
            {syncing ? "Syncing room data..." : "Connecting..."}
          </div>
        )}

        {/* Info overlay */}
        {showInfo && mapDataRef.current && (
          <div
            onClick={() => setShowInfo(false)}
            style={{
              position: "absolute", inset: 0, display: "flex",
              alignItems: "center", justifyContent: "center",
              background: "rgba(0,0,0,0.4)", backdropFilter: "blur(6px)",
              zIndex: 20, cursor: "pointer",
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: isDark ? "#0c0e0c" : "#fafafa",
                border: `1px solid ${isDark ? "rgba(0,220,100,0.15)" : "rgba(80,60,140,0.15)"}`,
                borderRadius: 16, padding: "28px 24px", maxWidth: 480, maxHeight: "80vh",
                overflow: "auto", cursor: "default",
              }}
            >
              <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600, color: accent, textTransform: "uppercase", letterSpacing: 1 }}>
                Room: {roomSlug}
              </h3>
              <p style={{ margin: "0 0 8px", fontSize: 12, lineHeight: 1.6, opacity: 0.7 }}>
                {mapDataRef.current.meta.itemCount} items across {mapDataRef.current.meta.agents.length} agent{mapDataRef.current.meta.agents.length !== 1 ? "s" : ""}
              </p>
              {mapDataRef.current.meta.agents.map((a) => (
                <div key={a} style={{ fontSize: 12, opacity: 0.6, padding: "2px 0" }}>{a}</div>
              ))}
              <button
                onClick={() => setShowInfo(false)}
                style={{ ...CTRL_BTN, marginTop: 16, background: btnBg, color: accent, border: `1px solid ${btnBorder}` }}
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* Broadcast status indicator */}
        {broadcasting && (
          <div style={{
            position: "absolute", top: 12, left: 12,
            fontSize: 11, fontWeight: 700, color: "#4ade80",
            background: "rgba(0,0,0,0.5)", padding: "6px 12px",
            borderRadius: 8, letterSpacing: "0.5px",
            backdropFilter: "blur(4px)",
          }}>
            BROADCASTING
          </div>
        )}

        {channelReady && !broadcasting && (
          <div style={{
            position: "absolute", top: 12, left: 12,
            fontSize: 11, fontWeight: 600, color: "#f59e0b",
            background: "rgba(0,0,0,0.5)", padding: "6px 12px",
            borderRadius: 8, backdropFilter: "blur(4px)",
          }}>
            CHANNEL READY
          </div>
        )}

        {/* Event log overlay (sim mode only) */}
        {isSimDevice && eventLog.length > 0 && (
          <div style={{
            position: "absolute", top: 12, right: 12,
            width: 280, maxHeight: 320,
            background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)",
            borderRadius: 10, padding: "8px 0",
            border: "1px solid rgba(0,232,120,0.15)",
            pointerEvents: "none", zIndex: 25,
            fontFamily: "JetBrains Mono, monospace",
          }}>
            <div style={{
              fontSize: 9, fontWeight: 700, color: "#4ade80",
              padding: "0 10px 6px", letterSpacing: 1,
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              textTransform: "uppercase",
            }}>
              Event Log
            </div>
            {eventLog.map((e, i) => {
              const age = Date.now() - e.ts;
              const opacity = Math.max(0.3, 1 - age / 8000);
              return (
                <div key={e.ts + i} style={{
                  fontSize: 10, padding: "3px 10px",
                  opacity, display: "flex", gap: 6, alignItems: "baseline",
                  transition: "opacity 0.3s",
                }}>
                  <span style={{ color: "#4ade80", fontWeight: 600, flexShrink: 0, minWidth: 72 }}>
                    {e.event}
                  </span>
                  <span style={{ color: "rgba(255,255,255,0.6)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {e.detail}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Voice overlay: shows transcripts from Spectacles EywaGeminiLive */}
        {(voiceInput || voiceResponse || voiceInjects.length > 0) && (
          <div style={{
            position: "absolute", bottom: 80, left: 12, right: 12,
            display: "flex", flexDirection: "column", gap: 6,
            pointerEvents: "none", zIndex: 15,
          }}>
            {/* Voice injects (commands sent to agents) */}
            {voiceInjects.slice(-2).map((inj, i) => (
              <div key={inj.ts + i} style={{
                fontSize: 11, color: "#e879f9", fontWeight: 600,
                background: "rgba(232,121,249,0.08)", padding: "6px 12px",
                borderRadius: 8, border: "1px solid rgba(232,121,249,0.2)",
                backdropFilter: "blur(4px)",
              }}>
                INJECTED: {inj.message}
              </div>
            ))}

            {/* User speech (what was said) */}
            {voiceInput && (
              <div style={{
                fontSize: 12, color: "#f87171", fontWeight: 500,
                background: "rgba(248,113,113,0.08)", padding: "6px 12px",
                borderRadius: 8, border: "1px solid rgba(248,113,113,0.15)",
                backdropFilter: "blur(4px)",
              }}>
                You: {voiceInput}
              </div>
            )}

            {/* Gemini response */}
            {voiceResponse && (
              <div style={{
                fontSize: 12, color: "#15D1FF", fontWeight: 500,
                background: "rgba(21,209,255,0.08)", padding: "6px 12px",
                borderRadius: 8, border: "1px solid rgba(21,209,255,0.15)",
                backdropFilter: "blur(4px)",
              }}>
                Eywa: {voiceResponse.length > 200 ? voiceResponse.slice(0, 197) + "..." : voiceResponse}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Control bar - large touch targets per Spectacles ergonomics */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          padding: "10px 16px",
          borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.08)"}`,
          background: isDark ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.9)",
          flexShrink: 0,
          flexWrap: "wrap",
        }}
      >
        {/* Fold name */}
        <span style={{ fontSize: 13, fontWeight: 600, color: accent, marginRight: 8 }}>
          {roomSlug}
        </span>

        {/* Zoom controls */}
        <button
          onClick={zoomOut}
          style={{ ...CTRL_BTN, background: btnBg, color: fg, border: `1px solid ${btnBorder}` }}
          title="Zoom out"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="9" cy="9" r="6" /><line x1="13.5" y1="13.5" x2="18" y2="18" /><line x1="6" y1="9" x2="12" y2="9" />
          </svg>
        </button>

        <button
          onClick={zoomIn}
          style={{ ...CTRL_BTN, background: btnBg, color: fg, border: `1px solid ${btnBorder}` }}
          title="Zoom in"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="9" cy="9" r="6" /><line x1="13.5" y1="13.5" x2="18" y2="18" /><line x1="6" y1="9" x2="12" y2="9" /><line x1="9" y1="6" x2="9" y2="12" />
          </svg>
        </button>

        <button
          onClick={resetView}
          style={{ ...CTRL_BTN, background: btnBg, color: fg, border: `1px solid ${btnBorder}` }}
          title="Reset view"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 10a7 7 0 0112.9-3.8M17 10a7 7 0 01-12.9 3.8" />
            <polyline points="3 4 3 10 9 10" /><polyline points="17 16 17 10 11 10" />
          </svg>
        </button>

        <div style={{ width: 1, height: 32, background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)" }} />

        {/* Grid toggle */}
        <button
          onClick={toggleGrid}
          style={{
            ...CTRL_BTN,
            background: gridMode ? btnActive : btnBg,
            color: gridMode ? accent : fg,
            border: `1px solid ${gridMode ? accent : btnBorder}`,
          }}
          title="Grid view"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <rect x="3" y="3" width="6" height="6" rx="1" /><rect x="11" y="3" width="6" height="6" rx="1" />
            <rect x="3" y="11" width="6" height="6" rx="1" /><rect x="11" y="11" width="6" height="6" rx="1" />
          </svg>
        </button>

        {/* Info */}
        <button
          onClick={toggleInfo}
          style={{
            ...CTRL_BTN,
            background: showInfo ? btnActive : btnBg,
            color: showInfo ? accent : fg,
            border: `1px solid ${showInfo ? accent : btnBorder}`,
          }}
          title="Room info"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <circle cx="10" cy="10" r="7" /><line x1="10" y1="9" x2="10" y2="14" /><circle cx="10" cy="6.5" r="0.8" fill="currentColor" stroke="none" />
          </svg>
        </button>

        {/* Theme */}
        <button
          onClick={toggleTheme}
          style={{ ...CTRL_BTN, background: btnBg, color: fg, border: `1px solid ${btnBorder}` }}
          title="Toggle theme"
        >
          {isDark ? (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <circle cx="10" cy="10" r="4" /><line x1="10" y1="2" x2="10" y2="4" /><line x1="10" y1="16" x2="10" y2="18" />
              <line x1="2" y1="10" x2="4" y2="10" /><line x1="16" y1="10" x2="18" y2="10" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M16 11.5A6.5 6.5 0 018.5 4a6.5 6.5 0 107.5 7.5z" />
            </svg>
          )}
        </button>

        <div style={{ width: 1, height: 32, background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)" }} />

        {/* Sync */}
        <button
          onClick={syncData}
          disabled={syncing}
          style={{
            ...CTRL_BTN,
            background: syncing ? (isDark ? "#1a1a1a" : "#eee") : "rgba(21,209,255,0.12)",
            color: syncing ? (isDark ? "#6b7280" : "#999") : "#15D1FF",
            border: "1px solid rgba(21,209,255,0.3)",
            cursor: syncing ? "default" : "pointer",
          }}
        >
          {syncing ? "Syncing..." : "Sync"}
        </button>
      </div>
    </div>
  );
}
