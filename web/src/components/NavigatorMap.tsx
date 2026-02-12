/**
 * NavigatorMap.tsx - Direct canvas rendering using the Guild Navigator renderer.
 *
 * Uses the vendored navigator-map.js for pixel-identical rendering:
 * recursive grid, radial rings, trajectory arrowheads, alignment panel,
 * comparison panel, graduation labels, legend with agent toggle, etc.
 *
 * Data fetched from the Guild Navigator backend via SSE or polling.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { useRoomContext } from "../context/RoomContext";
import { useRealtimeMemories } from "../hooks/useRealtimeMemories";
import { NavigatorMap as NavigatorMapRenderer } from "../lib/navigator-map.js";
import type { NavigatorMapNode, NavigatorMapData } from "../lib/navigator-map.js";
import {
  syncEywaRoom,
  getMap,
  listRooms,
  connectStream,
  BASE_URL,
} from "../lib/navigatorClient";

export function NavigatorMap() {
  const { room } = useRoomContext();
  const { memories } = useRealtimeMemories(room?.id ?? null, 200);
  const [syncing, setSyncing] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [availableRooms, setAvailableRooms] = useState<Array<{ id: string; items: number }>>([]);

  const roomSlug = room?.slug || "demo";

  // Canvas + renderer refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<NavigatorMapRenderer | null>(null);
  const dataRef = useRef<NavigatorMapData | null>(null);
  const hoveredRef = useRef<NavigatorMapNode | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Interaction state (refs to avoid re-renders on every mouse move)
  const draggingRef = useRef(false);
  const dragMovedRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const targetZoomRef = useRef(1);
  const targetPanRef = useRef({ x: 0, y: 0 });
  const viewAnimRef = useRef(false);

  // Theme
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  // --- Initialize renderer ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const map = new NavigatorMapRenderer(canvas, { theme });
    mapRef.current = map;
    map.draw(null);

    return () => {
      map.destroy();
      mapRef.current = null;
    };
    // Only re-init on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Theme sync ---
  useEffect(() => {
    mapRef.current?.setTheme(theme);
    redraw();
  }, [theme]);

  // --- Resize handler ---
  useEffect(() => {
    const onResize = () => {
      mapRef.current?.resize();
      redraw();
    };
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(onResize);
    if (canvasRef.current?.parentElement) ro.observe(canvasRef.current.parentElement);
    return () => {
      window.removeEventListener("resize", onResize);
      ro.disconnect();
    };
  }, []);

  function redraw() {
    const map = mapRef.current;
    if (!map) return;
    requestAnimationFrame(() => map.draw(hoveredRef.current));
  }

  // --- Data loading ---
  // Fetch room list on load
  useEffect(() => {
    listRooms()
      .then((rooms) => setAvailableRooms(rooms.map((r) => ({ id: r.id, items: r.items }))))
      .catch(() => {});
  }, [roomSlug]);

  // SSE connection for live updates
  useEffect(() => {
    if (!roomId) return;

    // Initial fetch
    getMap(roomId).then((d) => {
      dataRef.current = d as NavigatorMapData;
      mapRef.current?.setData(d as NavigatorMapData);
      redraw();
    }).catch(() => {});

    // SSE for live updates
    const cleanup = connectStream(
      roomId,
      (state) => {
        dataRef.current = state as NavigatorMapData;
        mapRef.current?.setData(state as NavigatorMapData);
        redraw();
      },
    );

    return cleanup;
  }, [roomId]);

  // --- Sync data ---
  const syncData = useCallback(async () => {
    if (syncing || !room) return;
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
          agent.memories.push({ content: m.content || "", action: (meta.action as string) || undefined });
        }
      }

      const agents = Array.from(agentMap.values()).slice(0, 15);
      const targetRoom = `eywa-${roomSlug}-${Date.now().toString(36)}`;
      const destination =
        ((room as unknown as Record<string, unknown>).destination as string) || "Launch-ready product";
      await syncEywaRoom(targetRoom, { destination, agents });

      const rooms = await listRooms();
      setAvailableRooms(rooms.map((r) => ({ id: r.id, items: r.items })));
      setRoomId(targetRoom);
    } catch (e) {
      console.warn("[NavigatorMap] sync error:", e);
    } finally {
      setSyncing(false);
    }
  }, [memories, room, roomSlug, syncing]);

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

  // --- Canvas event handlers ---
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

    // Hover: hit test nodes and legend
    const node = map.hitTest(e.clientX, e.clientY);
    if (node !== hoveredRef.current) {
      hoveredRef.current = node;
      redraw();
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    if (node) {
      canvas.style.cursor = "pointer";
      showTooltip(node, e.clientX, e.clientY);
    } else if (map.hitTestLegend(e.clientX, e.clientY)) {
      canvas.style.cursor = "pointer";
      hideTooltip();
    } else {
      canvas.style.cursor = draggingRef.current ? "grabbing" : "default";
      hideTooltip();
    }
  }

  function onMouseUp() {
    draggingRef.current = false;
  }

  function onClick(e: React.MouseEvent) {
    if (dragMovedRef.current) return;
    const map = mapRef.current;
    if (!map) return;
    const agent = map.hitTestLegend(e.clientX, e.clientY);
    if (agent) {
      map.toggleAgent(agent);
      redraw();
    }
  }

  function onDoubleClick() {
    targetZoomRef.current = 1;
    targetPanRef.current = { x: 0, y: 0 };
    startViewAnim();
  }

  // --- Tooltip ---
  function showTooltip(node: NavigatorMapNode, mx: number, my: number) {
    const el = tooltipRef.current;
    if (!el) return;
    const map = mapRef.current;

    let stats = "";
    const goalId = map?.goalId;
    if (goalId && node.polar?.[goalId]) {
      const p = node.polar[goalId];
      stats = `r: ${p.r.toFixed(3)}  \u03b8: ${p.theta.toFixed(3)}`;
    }

    el.innerHTML = `
      <div style="font-size:10px;text-transform:uppercase;opacity:0.6;margin-bottom:2px">
        ${node.type}${node.agent ? ` \u00b7 ${node.agent}` : ""}
      </div>
      <div style="font-size:12px;margin-bottom:4px">${node.label}</div>
      ${stats ? `<div style="font-size:10px;opacity:0.5;font-family:monospace">${stats}</div>` : ""}
    `;
    el.style.display = "block";
    const mw = map?.W ?? 800;
    el.style.left = Math.min(mx + 16, mw - 340) + "px";
    el.style.top = Math.max(10, my - 10) + "px";
  }

  function hideTooltip() {
    const el = tooltipRef.current;
    if (el) el.style.display = "none";
  }

  const isDark = theme === "dark";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: isDark ? "#080a08" : "#fafafa",
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 14px",
          borderBottom: `1px solid ${isDark ? "#1e1e2e" : "#e5e5e5"}`,
          background: isDark ? "#0a0a14" : "#fafafa",
          flexShrink: 0,
          flexWrap: "wrap",
        }}
      >
        <span style={{ color: isDark ? "#15D1FF" : "#6417ec", fontWeight: 600, fontSize: 13 }}>
          Navigator
        </span>

        {availableRooms.length > 0 && (
          <select
            value={roomId || ""}
            onChange={(e) => setRoomId(e.target.value)}
            style={{
              background: isDark ? "#151520" : "#f0f0f0",
              color: isDark ? "#cfe8ff" : "#333",
              border: `1px solid ${isDark ? "#30363d" : "#ccc"}`,
              borderRadius: 4,
              padding: "2px 6px",
              fontSize: 11,
            }}
          >
            <option value="">Select room...</option>
            {availableRooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.id} ({r.items})
              </option>
            ))}
          </select>
        )}

        <div style={{ flex: 1 }} />

        <button
          onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
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
          {isDark ? "\u2600" : "\u263E"}
        </button>

        <button
          onClick={syncData}
          disabled={syncing}
          style={{
            background: syncing ? (isDark ? "#1e1e2e" : "#eee") : "rgba(21,209,255,0.12)",
            color: syncing ? (isDark ? "#6b7280" : "#999") : "#15D1FF",
            border: "1px solid rgba(21,209,255,0.3)",
            borderRadius: 6,
            padding: "4px 12px",
            fontSize: 11,
            cursor: syncing ? "default" : "pointer",
          }}
        >
          {syncing ? "Syncing..." : "Sync Room Data"}
        </button>

        {roomId && (
          <a
            href={`${BASE_URL}?room=${roomId}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#6b7280", fontSize: 11, textDecoration: "none" }}
          >
            Open standalone
          </a>
        )}
      </div>

      {/* Canvas map */}
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

        {/* Tooltip overlay */}
        <div
          ref={tooltipRef}
          style={{
            display: "none",
            position: "absolute",
            top: 0,
            left: 0,
            maxWidth: 320,
            padding: "8px 12px",
            background: isDark ? "rgba(10,12,10,0.92)" : "rgba(255,255,255,0.95)",
            border: `1px solid ${isDark ? "rgba(0,210,110,0.15)" : "rgba(100,100,120,0.2)"}`,
            borderRadius: 8,
            color: isDark ? "#c8e8d0" : "#333",
            fontSize: 12,
            lineHeight: 1.4,
            pointerEvents: "none",
            zIndex: 10,
            backdropFilter: "blur(8px)",
          }}
        />

        {/* Empty state */}
        {!roomId && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: isDark ? "#6b7280" : "#999",
              fontSize: 13,
              gap: 12,
              pointerEvents: "none",
            }}
          >
            <span>Click "Sync Room Data" to generate a spatial map of agent activity.</span>
            <span style={{ fontSize: 11, opacity: 0.5 }}>
              Maps destination, agents, and their trajectories in polar coordinates.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
