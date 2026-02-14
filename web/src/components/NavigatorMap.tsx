/**
 * NavigatorMap.tsx - Full-featured Guild Navigator visualization.
 *
 * Uses the vendored navigator-map.js for pixel-identical rendering:
 * recursive grid, radial rings, trajectory arrowheads, alignment panel,
 * comparison panel, graduation labels, legend with agent toggle,
 * warp lanes, regions, dimension layers.
 *
 * Loads a demo scenario by default, with live fold data available on demand.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { useFoldContext } from "../context/FoldContext";
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

// --- Types ---
type Mode = "ctf" | "live";

const TYPE_LABEL: Record<string, string> = {
  source: "origin",
  goal: "destination",
  action: "action",
  state: "state",
};

// --- Step counting & filtering (multi-agent aware) ---
function countSteps(d: NavigatorMapData | null): number {
  if (!d?.nodes) return 0;
  const agentNodes: Record<string, number> = {};
  for (const n of d.nodes) {
    if (n.type === "source" || n.type === "goal") continue;
    const agent = n.agent || "_default";
    agentNodes[agent] = (agentNodes[agent] || 0) + 1;
  }
  let max = 0;
  for (const k of Object.keys(agentNodes)) {
    const s = Math.floor(agentNodes[k] / 2);
    if (s > max) max = s;
  }
  return max;
}

function filterToStep(d: NavigatorMapData, step: number): NavigatorMapData {
  if (!d?.nodes) return d;
  const base = d.nodes.filter((n) => n.type === "source" || n.type === "goal");
  const byAgent: Record<string, typeof d.nodes> = {};
  for (const n of d.nodes) {
    if (n.type === "source" || n.type === "goal") continue;
    const agent = n.agent || "_default";
    if (!byAgent[agent]) byAgent[agent] = [];
    byAgent[agent].push(n);
  }
  const visible = [...base];
  for (const nodes of Object.values(byAgent)) {
    const take = Math.min(step * 2, nodes.length);
    for (let i = 0; i < take; i++) visible.push(nodes[i]);
  }
  const ids = new Set(visible.map((n) => n.id));
  return {
    meta: { ...d.meta, itemCount: visible.length },
    nodes: visible,
    trajectory: d.trajectory.filter((e) => ids.has(e.from) && ids.has(e.to)),
    alignments: (d.alignments || []).filter((a) => ids.has(a.actionId)),
  };
}

export function NavigatorMap() {
  const { fold } = useFoldContext();
  const { memories } = useRealtimeMemories(fold?.id ?? null, 200);
  const [syncing, setSyncing] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [availableRooms, setAvailableRooms] = useState<
    Array<{ id: string; items: number }>
  >([]);
  const [autoSync, setAutoSync] = useState(true);
  const lastSyncRef = useRef(0);
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const roomSlug = fold?.slug || "demo";

  // Canvas + renderer refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<NavigatorMapRenderer | null>(null);
  const dataRef = useRef<NavigatorMapData | null>(null);
  const fullDataRef = useRef<NavigatorMapData | null>(null);
  const hoveredRef = useRef<NavigatorMapNode | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Interaction state
  const draggingRef = useRef(false);
  const dragMovedRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const targetZoomRef = useRef(1);
  const targetPanRef = useRef({ x: 0, y: 0 });
  const viewAnimRef = useRef(false);

  // Animation
  const animStartRef = useRef(0);
  const animatingRef = useRef(false);
  const nodeBirthRef = useRef<Record<string, number>>({});

  // Mode + timeline
  const [mode, setMode] = useState<Mode>("ctf");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [totalSteps, setTotalSteps] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [followLive, setFollowLive] = useState(true);
  const [playing, setPlaying] = useState(false);
  const playRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [gridMode, setGridMode] = useState(false);
  const sseCleanupRef = useRef<(() => void) | null>(null);

  // --- Initialize renderer ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const map = new NavigatorMapRenderer(canvas, {
      theme,
      nodeAlphaFn: (nodeId: string) => {
        const birth = nodeBirthRef.current[nodeId];
        if (!birth) return 1;
        const age = performance.now() - birth;
        return Math.min(1, age / 800);
      },
    });
    mapRef.current = map;
    map.draw(null);
    return () => {
      map.destroy();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Theme sync
  useEffect(() => {
    mapRef.current?.setTheme(theme);
    redraw();
  }, [theme]);

  // Resize
  useEffect(() => {
    const onResize = () => {
      mapRef.current?.resize();
      redraw();
    };
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(onResize);
    if (canvasRef.current?.parentElement)
      ro.observe(canvasRef.current.parentElement);
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

  // --- Apply data with animation ---
  function applyDisplayData(displayData: NavigatorMapData | null) {
    const map = mapRef.current;
    if (!map || !displayData?.nodes?.length) {
      dataRef.current = displayData;
      map?.setData(displayData as NavigatorMapData);
      redraw();
      return;
    }

    const prev: Record<string, { x: number; y: number }> = {};
    if (dataRef.current?.nodes) {
      for (const n of dataRef.current.nodes) prev[n.id] = { x: n.x, y: n.y };
    }

    const now = performance.now();
    for (const n of displayData.nodes) {
      if (!prev[n.id]) nodeBirthRef.current[n.id] = now;
    }

    for (const n of displayData.nodes as any[]) {
      n._toX = n.x;
      n._toY = n.y;
      if (prev[n.id]) {
        n._fromX = prev[n.id].x;
        n._fromY = prev[n.id].y;
      } else {
        n._fromX = n.x;
        n._fromY = n.y;
      }
    }

    dataRef.current = displayData;

    // Auto-select latest action
    for (let i = displayData.nodes.length - 1; i >= 0; i--) {
      if (displayData.nodes[i].type === "action") {
        hoveredRef.current = displayData.nodes[i] as NavigatorMapNode;
        break;
      }
    }

    map.setData(displayData);
    animStartRef.current = now;
    if (!animatingRef.current) {
      animatingRef.current = true;
      requestAnimationFrame(animFrame);
    }
  }

  function animFrame(ts: number) {
    const map = mapRef.current;
    const data = dataRef.current;
    if (!map || !data?.nodes) {
      animatingRef.current = false;
      return;
    }
    const elapsed = ts - animStartRef.current;
    const t = Math.min(1, elapsed / 600);
    const e = 1 - Math.pow(1 - t, 3); // easeOutCubic

    for (const node of data.nodes as any[]) {
      if (node._fromX !== undefined) {
        node.x = node._fromX + (node._toX - node._fromX) * e;
        node.y = node._fromY + (node._toY - node._fromY) * e;
      }
    }
    map.setData(data);
    map.draw(hoveredRef.current);
    if (t < 1) requestAnimationFrame(animFrame);
    else animatingRef.current = false;
  }

  // --- State update ---
  function onNewState(
    newData: NavigatorMapData,
    opts?: { resetHistory?: boolean }
  ) {
    if (opts?.resetHistory) setFollowLive(true);
    fullDataRef.current = newData;
    const steps = countSteps(newData);
    setTotalSteps(steps);
    if (followLive || opts?.resetHistory) {
      applyDisplayData(newData);
      setCurrentStep(steps);
    }
  }

  // --- Load static CTF scenario on mount ---
  useEffect(() => {
    if (mode !== "ctf") return;
    // Disconnect any live SSE
    if (sseCleanupRef.current) {
      sseCleanupRef.current();
      sseCleanupRef.current = null;
    }
    fetch(`${BASE_URL}/test/output-ctf.json`)
      .then((r) => r.json())
      .then((d: NavigatorMapData) => {
        if (d?.nodes?.length) {
          mapRef.current?.resetView();
          nodeBirthRef.current = {};
          onNewState(d, { resetHistory: true });
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // --- Live mode: SSE ---
  useEffect(() => {
    if (mode !== "live" || !roomId) return;
    getMap(roomId)
      .then((d) => {
        onNewState(d as NavigatorMapData, { resetHistory: true });
      })
      .catch(() => {});
    const cleanup = connectStream(roomId, (state) => {
      onNewState(state as NavigatorMapData);
    });
    sseCleanupRef.current = cleanup;
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, roomId]);

  // Fetch rooms list
  useEffect(() => {
    listRooms()
      .then((rooms) =>
        setAvailableRooms(rooms.map((r) => ({ id: r.id, items: r.items })))
      )
      .catch(() => {});
  }, [roomSlug]);

  // --- Sync fold data ---
  const stableRoomId = `eywa-${roomSlug}`;

  const syncData = useCallback(async () => {
    if (syncing || !fold) return;
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
        if (agent.memories.length < 10) {
          agent.memories.push({
            content: m.content || "",
            action: (meta.action as string) || undefined,
          });
        }
      }

      const agents = Array.from(agentMap.values()).slice(0, 15);
      const destination =
        ((fold as unknown as Record<string, unknown>).destination as string) ||
        "Launch-ready product";
      await syncEywaRoom(stableRoomId, { destination, agents });

      const rooms = await listRooms();
      setAvailableRooms(
        rooms.map((r) => ({ id: r.id, items: r.items }))
      );
      if (!roomId) setRoomId(stableRoomId);
      lastSyncRef.current = Date.now();
    } catch (e) {
      console.warn("[NavigatorMap] sync error:", e);
    } finally {
      setSyncing(false);
    }
  }, [memories, fold, stableRoomId, syncing, roomId]);

  // Auto-sync when in live mode
  useEffect(() => {
    if (!autoSync || !fold || mode !== "live") return;
    if (lastSyncRef.current === 0 && memories.length > 0) syncData();
    const hasActive = memories.some(
      (m) =>
        m.agent.startsWith("autonomous/") &&
        Date.now() - new Date(m.ts).getTime() < 5 * 60 * 1000
    );
    const interval = hasActive ? 30_000 : 120_000;
    syncIntervalRef.current = setInterval(() => syncData(), interval);
    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    };
  }, [autoSync, fold, memories, syncData, mode]);

  // --- View animation ---
  const VIEW_LERP = 0.18;

  function startViewAnim() {
    if (viewAnimRef.current) return;
    viewAnimRef.current = true;
    requestAnimationFrame(viewAnimFrameFn);
  }

  function viewAnimFrameFn() {
    const map = mapRef.current;
    if (!map) {
      viewAnimRef.current = false;
      return;
    }
    map.zoom += (targetZoomRef.current - map.zoom) * VIEW_LERP;
    map.panX += (targetPanRef.current.x - map.panX) * VIEW_LERP;
    map.panY += (targetPanRef.current.y - map.panY) * VIEW_LERP;
    map.recalcGoalScreen();
    map.draw(hoveredRef.current);
    const dz = Math.abs(targetZoomRef.current - map.zoom);
    const dp =
      Math.abs(targetPanRef.current.x - map.panX) +
      Math.abs(targetPanRef.current.y - map.panY);
    if (dz > 0.002 || dp > 0.5) {
      requestAnimationFrame(viewAnimFrameFn);
    } else {
      map.zoom = targetZoomRef.current;
      map.panX = targetPanRef.current.x;
      map.panY = targetPanRef.current.y;
      map.recalcGoalScreen();
      map.draw(hoveredRef.current);
      viewAnimRef.current = false;
    }
  }

  // --- Timeline playback ---
  function startPlay() {
    setPlaying(true);
    setFollowLive(false);
    let step = currentStep;
    if (step >= totalSteps) step = 0;
    playRef.current = setInterval(() => {
      step++;
      if (step > totalSteps) {
        stopPlay();
        return;
      }
      setCurrentStep(step);
      nodeBirthRef.current = {};
      if (fullDataRef.current) applyDisplayData(filterToStep(fullDataRef.current, step));
    }, 800);
  }

  function stopPlay() {
    setPlaying(false);
    if (playRef.current) {
      clearInterval(playRef.current);
      playRef.current = null;
    }
  }

  useEffect(() => {
    return () => {
      if (playRef.current) clearInterval(playRef.current);
    };
  }, []);

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
      x:
        mx -
        (mx - targetPanRef.current.x) * (newZoom / targetZoomRef.current),
      y:
        my -
        (my - targetPanRef.current.y) * (newZoom / targetZoomRef.current),
    };
    targetZoomRef.current = newZoom;
    startViewAnim();
  }

  function onMouseDown(e: React.MouseEvent) {
    draggingRef.current = true;
    dragMovedRef.current = false;
    const map = mapRef.current;
    if (!map) return;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: map.panX,
      panY: map.panY,
    };
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
    if (node !== hoveredRef.current) {
      hoveredRef.current = node;
      redraw();
    }

    // Warp lane hover
    const wl =
      map.hitTestWarpLane(e.clientX, e.clientY) ||
      map.hitTestWarpLanePanel?.(e.clientX, e.clientY);
    if (wl !== map.hoveredWarpLane) {
      map.hoveredWarpLane = wl || null;
      redraw();
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    if (node) {
      canvas.style.cursor = "pointer";
      showTooltip(node, e.clientX, e.clientY);
    } else if (wl) {
      canvas.style.cursor = "pointer";
      showWarpTooltip(wl, e.clientX, e.clientY);
    } else if (
      map.hitTestLegend(e.clientX, e.clientY) ||
      map.hitTestLayerPanel(e.clientX, e.clientY)
    ) {
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

    // Layer panel
    const layer = map.hitTestLayerPanel(e.clientX, e.clientY);
    if (layer) {
      const prev = map.switchLayer(layer);
      if (prev && dataRef.current?.nodes) {
        const now = performance.now();
        for (const n of dataRef.current.nodes as any[]) {
          const p = prev[n.id];
          if (p) {
            n._fromX = p.x;
            n._fromY = p.y;
          } else {
            n._fromX = n.x;
            n._fromY = n.y;
          }
          n._toX = n.x;
          n._toY = n.y;
        }
        animStartRef.current = now;
        if (!animatingRef.current) {
          animatingRef.current = true;
          requestAnimationFrame(animFrame);
        }
      }
      return;
    }

    // Warp lane click: center on endpoints
    const wl =
      map.hitTestWarpLane(e.clientX, e.clientY) ||
      map.hitTestWarpLanePanel?.(e.clientX, e.clientY);
    if (wl && dataRef.current?.nodes) {
      const nodeMap: Record<string, any> = {};
      for (const n of dataRef.current.nodes) nodeMap[n.id] = n;
      const from = nodeMap[(wl as any).fromId];
      const to = nodeMap[(wl as any).toId];
      if (from && to) {
        const midX = (from.x + to.x) / 2;
        const midY = (from.y + to.y) / 2;
        targetPanRef.current = {
          x: -midX * map.scale * targetZoomRef.current,
          y: midY * map.scale * targetZoomRef.current,
        };
        targetZoomRef.current = Math.max(1.5, targetZoomRef.current);
        startViewAnim();
      }
      return;
    }

    // Legend click
    const agent = map.hitTestLegend(e.clientX, e.clientY);
    if (agent) {
      map.toggleAgent(agent);
      redraw();
      return;
    }

    // Node click: select/pin for details
    const node = map.hitTest(e.clientX, e.clientY);
    if (node) {
      hoveredRef.current = node;
      showTooltip(node, e.clientX, e.clientY);
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
    const goalId = map?.goalId;

    let stats = "";
    if (goalId && node.polar?.[goalId]) {
      const p = node.polar[goalId];
      stats = `r: ${p.r.toFixed(3)}  \u03b8: ${p.theta.toFixed(3)}`;
      const alignment = dataRef.current?.alignments?.find(
        (a) => a.actionId === node.id && a.goalId === goalId
      );
      if (alignment) {
        stats += `\nalignment: ${alignment.alignment.toFixed(3)}`;
        if (alignment.relevance != null)
          stats += `  relevance: ${alignment.relevance.toFixed(3)}`;
      }
    }

    // Meta lines
    const meta = node.meta as Record<string, unknown> | undefined;
    if (meta) {
      const lines: string[] = [];
      if (meta.system) lines.push(`system: ${meta.system}`);
      if (meta.scope) lines.push(`scope: ${meta.scope}`);
      if (meta.outcome) lines.push(`outcome: ${meta.outcome}`);
      if (lines.length) stats += (stats ? "\n" : "") + lines.join("\n");
    }

    const typeStr = TYPE_LABEL[node.type] || node.type;

    el.innerHTML = `
      <div style="font-size:10px;text-transform:uppercase;opacity:0.6;margin-bottom:2px;letter-spacing:0.5px">
        ${typeStr}${node.agent ? ` \u00b7 ${node.agent}` : ""}
      </div>
      <div style="font-size:12px;margin-bottom:4px">${node.label}</div>
      ${stats ? `<div style="font-size:10px;opacity:0.5;font-family:monospace;white-space:pre-line">${stats}</div>` : ""}
    `;
    el.style.display = "block";
    const mw = map?.W ?? 800;
    const mh = map?.H ?? 600;
    el.style.left = Math.min(mx + 16, mw - 340) + "px";
    el.style.top = Math.min(Math.max(10, my - 10), mh - 120) + "px";
  }

  function showWarpTooltip(wl: any, mx: number, my: number) {
    const el = tooltipRef.current;
    if (!el) return;
    const map = mapRef.current;
    const nodeMap: Record<string, any> = {};
    if (dataRef.current?.nodes)
      for (const n of dataRef.current.nodes) nodeMap[n.id] = n;
    const from = nodeMap[wl.fromId];
    const to = nodeMap[wl.toId];
    el.innerHTML = `
      <div style="font-size:10px;text-transform:uppercase;opacity:0.6;margin-bottom:2px;letter-spacing:0.5px">warp lane</div>
      <div style="font-size:12px;margin-bottom:4px">${wl.bridge || `${(from?.label || wl.fromId).slice(0, 40)} \u2194 ${(to?.label || wl.toId).slice(0, 40)}`}</div>
      <div style="font-size:10px;opacity:0.5;font-family:monospace">strength: ${wl.strength.toFixed(3)}\ntype: ${wl.type}</div>
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

  // --- Grid toggle ---
  function toggleGrid() {
    const next = !gridMode;
    setGridMode(next);
    mapRef.current?.setGridMode(next);
    redraw();
  }

  // --- Slider handler ---
  function onSliderChange(e: React.ChangeEvent<HTMLInputElement>) {
    const step = parseInt(e.target.value, 10);
    setCurrentStep(step);
    const isLive = step >= totalSteps;
    setFollowLive(isLive);
    nodeBirthRef.current = {};
    if (isLive) {
      applyDisplayData(fullDataRef.current);
    } else if (fullDataRef.current) {
      applyDisplayData(filterToStep(fullDataRef.current, step));
    }
  }

  const isDark = theme === "dark";
  const c = isDark
    ? { accent: "#00dc6e", accentBg: "rgba(0,220,100,0.1)", border: "rgba(0,220,100,0.15)", text: "#c8e8d0", muted: "rgba(0,210,110,0.4)", bg: "#080a08", panelBg: "rgba(8,12,8,0.92)" }
    : { accent: "#6417ec", accentBg: "rgba(100,23,236,0.08)", border: "rgba(80,60,140,0.2)", text: "#3c3c46", muted: "rgba(50,50,60,0.4)", bg: "#fafafa", panelBg: "rgba(250,250,250,0.95)" };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: c.bg,
        color: c.text,
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 0,
          borderBottom: `1px solid ${c.border}`,
          background: c.bg,
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        {/* Scenario picker */}
        <div style={{ display: "flex", gap: 0 }}>
          <button
            onClick={() => { setMode("ctf"); mapRef.current?.resetView(); }}
            style={{
              fontFamily: "Inter, system-ui, sans-serif",
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: 0.5,
              textTransform: "uppercase" as const,
              padding: "10px 14px",
              border: "none",
              borderRight: `1px solid ${c.border}`,
              background: mode === "ctf" ? c.accentBg : "transparent",
              color: mode === "ctf" ? c.accent : c.muted,
              cursor: "pointer",
            }}
          >
            CTF
          </button>
          <button
            onClick={() => {
              setMode("live");
              mapRef.current?.resetView();
              nodeBirthRef.current = {};
              if (!roomId) setRoomId(stableRoomId);
            }}
            style={{
              fontFamily: "Inter, system-ui, sans-serif",
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: 0.5,
              textTransform: "uppercase" as const,
              padding: "10px 14px",
              border: "none",
              borderRight: `1px solid ${c.border}`,
              background: mode === "live" ? c.accentBg : "transparent",
              color: mode === "live" ? c.accent : c.muted,
              cursor: "pointer",
            }}
          >
            Live: {roomSlug}
          </button>
        </div>

        {/* Live mode controls */}
        {mode === "live" && (
          <>
            {availableRooms.length > 0 && (
              <select
                value={roomId || ""}
                onChange={(e) => setRoomId(e.target.value)}
                style={{
                  background: isDark ? "#151520" : "#f0f0f0",
                  color: isDark ? "#cfe8ff" : "#333",
                  border: `1px solid ${c.border}`,
                  borderRadius: 4,
                  padding: "2px 6px",
                  fontSize: 10,
                  margin: "0 6px",
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
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 3,
                fontSize: 10,
                color: c.muted,
                cursor: "pointer",
                padding: "0 6px",
              }}
            >
              <input
                type="checkbox"
                checked={autoSync}
                onChange={(e) => setAutoSync(e.target.checked)}
                style={{ accentColor: c.accent }}
              />
              Auto
            </label>
            <button
              onClick={syncData}
              disabled={syncing}
              style={{
                background: syncing ? "transparent" : c.accentBg,
                color: syncing ? c.muted : c.accent,
                border: `1px solid ${c.border}`,
                borderRadius: 4,
                padding: "3px 8px",
                fontSize: 10,
                cursor: syncing ? "default" : "pointer",
                margin: "0 4px",
              }}
            >
              {syncing ? "..." : "Sync"}
            </button>
          </>
        )}

        <div style={{ flex: 1 }} />

        {/* Controls */}
        <button
          onClick={toggleGrid}
          title="Toggle grid view"
          style={{
            width: 32,
            height: 32,
            border: "none",
            background: gridMode ? c.accentBg : "transparent",
            cursor: "pointer",
            color: gridMode ? c.accent : c.muted,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
            <rect x="2" y="2" width="5" height="5" rx="0.8" />
            <rect x="9" y="2" width="5" height="5" rx="0.8" />
            <rect x="2" y="9" width="5" height="5" rx="0.8" />
            <rect x="9" y="9" width="5" height="5" rx="0.8" />
          </svg>
        </button>
        <button
          onClick={() => setShowInfo(true)}
          title="About"
          style={{
            width: 32,
            height: 32,
            border: "none",
            background: "transparent",
            cursor: "pointer",
            color: c.muted,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
            <circle cx="8" cy="8" r="6" />
            <line x1="8" y1="7.5" x2="8" y2="11.5" />
            <circle cx="8" cy="5.2" r="0.7" fill="currentColor" stroke="none" />
          </svg>
        </button>
        <button
          onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
          title="Toggle theme"
          style={{
            width: 32,
            height: 32,
            border: "none",
            background: "transparent",
            cursor: "pointer",
            color: c.muted,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
            fontSize: 14,
          }}
        >
          {isDark ? "\u2600" : "\u263E"}
        </button>
        {roomId && (
          <a
            href={`${BASE_URL}?room=${roomId}&theme=${theme}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: c.muted,
              fontSize: 10,
              textDecoration: "none",
              padding: "0 10px",
            }}
          >
            \u2197
          </a>
        )}
      </div>

      {/* Description bar */}
      {mode === "ctf" && (
        <div
          style={{
            padding: "6px 14px",
            fontSize: 11,
            lineHeight: 1.5,
            color: c.muted,
            borderBottom: `1px solid ${c.border}`,
            background: c.bg,
          }}
        >
          <strong style={{ color: c.text, fontWeight: 600 }}>Bloom filter hash collision.</strong>{" "}
          Three agents attack a crypto CTF challenge: an expert takes the direct path, a methodical AI succeeds with more steps, and a struggling AI wastes time on dead ends before solving it.
        </div>
      )}

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

        {/* Tooltip */}
        <div
          ref={tooltipRef}
          style={{
            display: "none",
            position: "absolute",
            top: 0,
            left: 0,
            maxWidth: 340,
            padding: "10px 14px",
            background: c.panelBg,
            border: `1px solid ${c.border}`,
            borderRadius: 8,
            color: c.text,
            fontSize: 12,
            lineHeight: 1.4,
            pointerEvents: "none",
            zIndex: 20,
            backdropFilter: "blur(8px)",
            boxShadow: isDark
              ? "0 2px 12px rgba(0,200,100,0.08)"
              : "0 2px 12px rgba(100,23,236,0.08)",
          }}
        />

        {/* Timeline */}
        {totalSteps > 0 && (
          <div
            style={{
              position: "absolute",
              bottom: 14,
              left: "50%",
              transform: "translateX(-50%)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              zIndex: 10,
            }}
          >
            <button
              onClick={() => (playing ? stopPlay() : totalSteps > 0 && startPlay())}
              title="Play/Pause"
              style={{
                fontFamily: "Inter, system-ui, sans-serif",
                fontSize: 12,
                width: 26,
                height: 26,
                borderRadius: 6,
                border: `1px solid ${c.border}`,
                background: "transparent",
                cursor: "pointer",
                color: c.muted,
                padding: 0,
                flexShrink: 0,
              }}
              dangerouslySetInnerHTML={{
                __html: playing ? "&#9646;&#9646;" : "&#9654;",
              }}
            />
            <input
              type="range"
              min={0}
              max={totalSteps}
              value={currentStep}
              onChange={onSliderChange}
              style={{
                width: 200,
                accentColor: c.accent,
              }}
            />
            <span
              style={{
                fontSize: 10,
                fontWeight: 500,
                color: c.muted,
                whiteSpace: "nowrap",
              }}
            >
              {currentStep}/{totalSteps}
            </span>
            <span
              onClick={() => {
                setFollowLive(true);
                nodeBirthRef.current = {};
                if (fullDataRef.current) {
                  applyDisplayData(fullDataRef.current);
                  setCurrentStep(totalSteps);
                }
              }}
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: 0.5,
                textTransform: "uppercase",
                color: followLive ? (isDark ? "#080a08" : "#fff") : c.accent,
                cursor: "pointer",
                padding: "3px 8px",
                borderRadius: 6,
                border: `1px solid ${c.border}`,
                background: followLive ? c.accent : c.accentBg,
              }}
            >
              LIVE
            </span>
          </div>
        )}
      </div>

      {/* Info modal */}
      {showInfo && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowInfo(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            backdropFilter: "blur(6px)",
            zIndex: 30,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              position: "relative",
              width: 520,
              maxWidth: "92vw",
              maxHeight: "88vh",
              background: isDark ? "#0c0e0c" : "#fafafa",
              border: `1px solid ${c.border}`,
              borderRadius: 16,
              boxShadow: isDark
                ? "0 12px 48px rgba(0,200,100,0.12)"
                : "0 12px 48px rgba(100,23,236,0.12)",
              overflowY: "auto",
              padding: "32px 28px",
              fontSize: 12,
              lineHeight: 1.6,
              color: c.muted,
            }}
          >
            <button
              onClick={() => setShowInfo(false)}
              style={{
                position: "absolute",
                top: 14,
                right: 14,
                background: "none",
                border: "none",
                fontSize: 20,
                cursor: "pointer",
                color: c.muted,
                padding: "4px 8px",
                lineHeight: 1,
              }}
            >
              &times;
            </button>

            <h2 style={{ fontSize: 14, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: c.muted, margin: "0 0 6px" }}>
              Guild Navigator
            </h2>
            <p style={{ fontSize: 12, lineHeight: 1.65, color: c.muted, margin: "0 0 20px" }}>
              Guild Navigator maps how agents solve problems by projecting their actions into a shared spatial coordinate system.
              Each step an agent takes is placed according to its semantic relationship to every other step, so you can see the
              shape of a problem-solving process: where it wanders, where it converges, and how different strategies compare
              against the same goal.
            </p>

            <h2 style={{ fontSize: 14, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: c.muted, margin: "24px 0 6px" }}>
              Unit System
            </h2>
            <p style={{ fontSize: 11, color: c.muted, margin: "0 0 16px" }}>
              Every unit is named after a woman who expanded human understanding.
            </p>

            {[
              { abbr: "kh", name: "khema", qty: "distance", bio: "Khema was declared by the Buddha as the foremost of his female disciples in wisdom. A former queen of King Bimbisara, she attained arahantship after seeing through the impermanence of physical beauty. Her deep insight into the nature of reality makes her the namesake for the fundamental unit of semantic distance.", portrait: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSsPc8s0ry5QhMzmWvjmJnUa2so2lxkpxqVSA&s" },
              { abbr: "hy", name: "hypatia", qty: "curvature", bio: "Hypatia of Alexandria (c. 350-415 CE) was a Neoplatonist philosopher, mathematician, and astronomer. She edited Apollonius's treatise on conic sections, the geometry of curves. Her mastery of curved geometry makes her the namesake for the unit of trajectory curvature." },
              { abbr: "rd", name: "ride", qty: "velocity", bio: "Sally Ride (1951-2012) was a physicist and astronaut who in 1983 became the first American woman in space aboard Space Shuttle Challenger. Her traversal of space at 17,500 mph makes her the namesake for the unit of semantic velocity." },
              { abbr: "bt", name: "butler", qty: "time", bio: "Octavia E. Butler (1947-2006) was a science fiction author whose works explored deep time, evolution, and the boundaries of human identity. The first SF writer to receive a MacArthur Fellowship, her narratives spanning millennia make her the namesake for the unit of computational time." },
              { abbr: "hp", name: "hopper", qty: "cost", bio: "Grace Hopper (1906-1992) was a computer scientist and US Navy rear admiral who pioneered machine-independent programming languages. She famously distributed nanosecond-length wires to teach computational scale. Her pursuit of efficiency makes her the namesake for the unit of compute cost." },
            ].map((u) => (
              <div
                key={u.abbr}
                style={{
                  marginBottom: 12,
                  padding: "12px 14px",
                  border: `1px solid ${c.border}`,
                  borderRadius: 10,
                  background: c.accentBg,
                  display: "flex",
                  gap: 12,
                  alignItems: "flex-start",
                }}
              >
                {(u as any).portrait ? (
                  <img
                    src={(u as any).portrait}
                    alt={u.name}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: "50%",
                      flexShrink: 0,
                      border: `2px solid ${c.border}`,
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: "50%",
                      flexShrink: 0,
                      border: `2px solid ${c.border}`,
                      background: c.accentBg,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 16,
                      fontWeight: 600,
                      color: c.accent,
                      textTransform: "capitalize",
                    }}
                  >
                    {u.abbr[0].toUpperCase() + u.abbr.slice(1)}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 2 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: c.accent }}>{u.abbr}</span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: c.muted }}>{u.name}</span>
                    <span style={{ fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.5, color: c.muted, marginLeft: "auto" }}>{u.qty}</span>
                  </div>
                  <div style={{ fontSize: 11, lineHeight: 1.55, color: c.muted }}>{u.bio}</div>
                </div>
              </div>
            ))}

            <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${c.border}`, fontSize: 11, color: c.muted, textAlign: "center" }}>
              Built by{" "}
              <a href="https://curvilinear.ai" target="_blank" rel="noopener noreferrer" style={{ color: c.accent, textDecoration: "none" }}>
                Curvilinear
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
