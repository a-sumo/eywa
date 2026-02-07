/**
 * SpectaclesView.tsx
 *
 * Micro-tile Spectacles renderer. The UI is decomposed into many small
 * independent tiles - each memory card, button, and status element is its
 * own OffscreenCanvas + quad on Spectacles. Only dirty tiles re-render
 * and re-broadcast. Most tiles broadcast exactly once.
 *
 * Protocol:
 *   Scene ops:  { event: "scene", payload: { op, id, ... } }  (JSON, batched)
 *   Textures:   { event: "tex",   payload: { id, image } }    (JPEG base64)
 *   Interaction: { event: "interact", payload: { id, type } }  (from Spectacles)
 *   Legacy:     { event: "tile", payload: { col, row, image } } (backward compat)
 */

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useRoomContext } from "../context/RoomContext";
import { useRealtimeMemories } from "../hooks/useRealtimeMemories";
import { useGeminiChat } from "../hooks/useGeminiChat";
import { useVoiceInput } from "../hooks/useVoiceInput";
import { supabase, type Memory } from "../lib/supabase";
import { TileScene } from "../lib/tileScene";
import { RENDERERS } from "../lib/tileRenderers";
import { computeLayout, tileHash, MEMORIES_PER_PAGE, type AgentInfo, type ContextItem, type GroupLayout } from "../lib/tileLayout";
import { applyLayoutActions, type LayoutAction } from "../lib/layoutActions";

// --- Colors ---
const C = {
  accent: "#15D1FF",
  pink: "#e879f9",
  green: "#4ade80",
  text: "#e6edf3",
  muted: "#8b949e",
  border: "#30363d",
};

// Max scene ops per broadcast batch (high enough for initial burst of ~20 tiles)
const MAX_OPS_PER_FRAME = 30;
// Max textures per broadcast frame
const MAX_TEX_PER_FRAME = 4;
// Broadcast interval for scene ops (ms)
const SCENE_BROADCAST_INTERVAL = 100; // 10fps
// Broadcast interval for cursor updates (ms)
const CURSOR_BROADCAST_INTERVAL = 50; // 20fps
const PIXELS_PER_CM = 16;

interface ConnectedDevice {
  deviceId: string;
  channelName: string;
  gridCols: number;
  gridRows: number;
  lastSeen: number;
}

function useDeviceId(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get("device") || "editor";
}

export function SpectaclesView() {
  const { room } = useRoomContext();
  const { memories } = useRealtimeMemories(room?.id ?? null, 100);
  const manualDeviceId = useDeviceId();

  // Interaction state
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [contextItems, setContextItems] = useState<ContextItem[]>([]);
  const [memoryPage, setMemoryPage] = useState(0);
  const [broadcasting, setBroadcasting] = useState(false);
  const [channelReady, setChannelReady] = useState(false);
  const [hoveredTileId, setHoveredTileId] = useState<string | null>(null);
  const [cameraPose, setCameraPose] = useState<{ x: number; y: number; z: number } | null>(null);
  const [layoutActions, setLayoutActions] = useState<LayoutAction[]>([]);
  const [chatFocusGroupId, setChatFocusGroupId] = useState<string | null>(null);

  // Auto-discovery
  const [devices, setDevices] = useState<Map<string, ConnectedDevice>>(new Map());
  const [activeDeviceId, setActiveDeviceId] = useState<string>(manualDeviceId);
  const lobbyRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const deviceId = activeDeviceId || "default";

  // Refs
  const previewRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const sceneRef = useRef<TileScene | null>(null);
  const lastSceneBroadcast = useRef(0);
  const lastCursorBroadcast = useRef(0);
  const cursorRef = useRef<{ x: number; y: number; visible: boolean }>({ x: 0, y: 0, visible: false });

  // --- Initialize TileScene ---
  useEffect(() => {
    if (!sceneRef.current) {
      const scene = new TileScene();
      for (const [type, fn] of Object.entries(RENDERERS)) {
        scene.registerRenderer(type, fn);
      }
      sceneRef.current = scene;
    }
  }, []);

  // --- Lobby: auto-discover Spectacles devices ---
  useEffect(() => {
    if (!room?.slug || manualDeviceId) return;

    const lobbyKey = `spectacles:${room.slug}:lobby`;
    const lobby = supabase.channel(lobbyKey, {
      config: { broadcast: { ack: false, self: false } },
    });

    const handleDevice = (event: string, payload: any) => {
      if (!payload?.deviceId) return;
      const dev: ConnectedDevice = {
        deviceId: payload.deviceId,
        channelName: payload.channelName || room.slug,
        gridCols: payload.gridCols || 3,
        gridRows: payload.gridRows || 2,
        lastSeen: Date.now(),
      };

      if (event === "device_disconnect") {
        setDevices(prev => {
          const next = new Map(prev);
          next.delete(dev.deviceId);
          return next;
        });
        setActiveDeviceId(prev => prev === dev.deviceId ? "" : prev);
      } else {
        setDevices(prev => {
          const next = new Map(prev);
          next.set(dev.deviceId, dev);
          return next;
        });
        setActiveDeviceId(prev => prev || dev.deviceId);
        setBroadcasting(true);
      }
    };

    lobby.on("broadcast", { event: "device_connect" }, ({ payload }) => handleDevice("device_connect", payload));
    lobby.on("broadcast", { event: "device_heartbeat" }, ({ payload }) => handleDevice("device_heartbeat", payload));
    lobby.on("broadcast", { event: "device_disconnect" }, ({ payload }) => handleDevice("device_disconnect", payload));
    lobby.subscribe();
    lobbyRef.current = lobby;

    return () => {
      supabase.removeChannel(lobby);
      lobbyRef.current = null;
    };
  }, [room?.slug, manualDeviceId]);

  // Prune stale devices
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setDevices(prev => {
        const next = new Map(prev);
        let changed = false;
        for (const [id, dev] of next) {
          if (now - dev.lastSeen > 30000) {
            next.delete(id);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Build context summary for Gemini
  const contextSummary = useMemo(() => {
    if (contextItems.length === 0) return "";
    return contextItems.map(item => {
      const mem = memories.find(m => m.id === item.memoryId);
      if (!mem) return `[${item.agent}]: ${item.content}`;
      return `[${mem.agent}] ${mem.message_type}: ${mem.content?.slice(0, 500)}`;
    }).join("\n\n");
  }, [contextItems, memories]);

  const { messages: chatMessages, loading: chatLoading, error: chatError, send: sendChat, clear: clearChat } = useGeminiChat(contextSummary);

  // Voice input
  const voiceResultHandler = useCallback((text: string) => {
    if (text.trim()) sendChat(text.trim());
  }, [sendChat]);
  const { isListening, isSupported: voiceSupported, transcript: voiceTranscript, toggleListening } = useVoiceInput({
    onResult: voiceResultHandler,
  });

  // Build agent list
  const agents = useMemo((): AgentInfo[] => {
    const byAgent = new Map<string, Memory[]>();
    for (const m of memories) {
      const arr = byAgent.get(m.agent) ?? [];
      arr.push(m);
      byAgent.set(m.agent, arr);
    }
    const now = Date.now();
    const result: AgentInfo[] = [];
    for (const [name, mems] of byAgent) {
      const sorted = mems.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
      const lastTs = sorted[0]?.ts ?? "";
      const isActive = now - new Date(lastTs).getTime() < 5 * 60 * 1000;
      result.push({ name, isActive, lastTs, memoryCount: mems.length });
    }
    result.sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return new Date(b.lastTs).getTime() - new Date(a.lastTs).getTime();
    });
    return result;
  }, [memories]);

  // Total memory pages
  const totalMemoryPages = useMemo(() => {
    const filtered = selectedAgent ? memories.filter(m => m.agent === selectedAgent) : memories;
    return Math.max(1, Math.ceil(filtered.length / MEMORIES_PER_PAGE));
  }, [memories, selectedAgent]);

  // --- Compute layout (memoized) ---
  const { tiles: desiredTiles, groups: desiredGroups } = useMemo(() => computeLayout({
    agents,
    memories,
    contextItems,
    chatMessages,
    chatLoading,
    chatError,
    memoryPage,
    selectedAgent,
    isListening,
    voiceTranscript,
    room: room?.slug ?? "demo",
    channelReady,
    deviceId,
  }), [agents, memories, contextItems, chatMessages, chatLoading, chatError, memoryPage, selectedAgent, isListening, voiceTranscript, room?.slug, channelReady, deviceId]);

  const applyCameraLayout = useCallback((tiles: ReturnType<typeof computeLayout>["tiles"], groups: ReturnType<typeof computeLayout>["groups"]) => {
    if (!cameraPose) return groups;

    // Build group bounds (cm) from tiles
    const bounds = new Map<string, { minX: number; maxX: number; minY: number; maxY: number }>();
    for (const tile of tiles) {
      const gid = tile.group;
      if (!gid) continue;
      const wCm = (tile.w / PIXELS_PER_CM) * tile.scale;
      const hCm = (tile.h / PIXELS_PER_CM) * tile.scale;
      const minX = tile.x - wCm / 2;
      const maxX = tile.x + wCm / 2;
      const minY = tile.y - hCm / 2;
      const maxY = tile.y + hCm / 2;
      const b = bounds.get(gid);
      if (!b) {
        bounds.set(gid, { minX, maxX, minY, maxY });
      } else {
        b.minX = Math.min(b.minX, minX);
        b.maxX = Math.max(b.maxX, maxX);
        b.minY = Math.min(b.minY, minY);
        b.maxY = Math.max(b.maxY, maxY);
      }
    }

    // Compute overall bounds in world (group positions applied)
    let minX = 9999, maxX = -9999, minY = 9999, maxY = -9999;
    for (const g of groups) {
      const b = bounds.get(g.id);
      if (!b) continue;
      minX = Math.min(minX, g.x + b.minX);
      maxX = Math.max(maxX, g.x + b.maxX);
      minY = Math.min(minY, g.y + b.minY);
      maxY = Math.max(maxY, g.y + b.maxY);
    }
    if (minX > maxX || minY > maxY) return groups;

    const contentCx = (minX + maxX) / 2;
    const contentCy = (minY + maxY) / 2;

    // Comfort box from ergonomics spec
    const COMFORT_W = 47;
    const COMFORT_H = 28;
    const TARGET_Y_OFFSET = -3;

    const targetCx = cameraPose.x;
    const targetCy = cameraPose.y + TARGET_Y_OFFSET;
    let dx = targetCx - contentCx;
    let dy = targetCy - contentCy;

    // Clamp to comfort rectangle
    const halfW = COMFORT_W / 2;
    const halfH = COMFORT_H / 2;
    if (minX + dx < targetCx - halfW) dx += (targetCx - halfW) - (minX + dx);
    if (maxX + dx > targetCx + halfW) dx -= (maxX + dx) - (targetCx + halfW);
    if (minY + dy < targetCy - halfH) dy += (targetCy - halfH) - (minY + dy);
    if (maxY + dy > targetCy + halfH) dy -= (maxY + dy) - (targetCy + halfH);

    return groups.map(g => ({ ...g, x: g.x + dx, y: g.y + dy }));
  }, [cameraPose]);

  const effectiveGroups = useMemo(() => applyCameraLayout(desiredTiles, desiredGroups), [applyCameraLayout, desiredTiles, desiredGroups]);

  const emphasizedGroups = useMemo(() => {
    if (!hoveredTileId) return effectiveGroups;
    const tile = desiredTiles.find(t => t.id === hoveredTileId);
    const gid = tile?.group;
    if (!gid) return effectiveGroups;
    const HOVER_Z_PULL = 1.5; // cm toward user (ergonomics spec: active 1-2cm)
    return effectiveGroups.map(g => g.id === gid ? { ...g, z: (g.z ?? 0) + HOVER_Z_PULL } : g);
  }, [effectiveGroups, desiredTiles, hoveredTileId]);

  const actionGroups = useMemo(() => applyLayoutActions(emphasizedGroups, layoutActions), [emphasizedGroups, layoutActions]);

  // Track latest chat model response for focus
  useEffect(() => {
    const lastModel = [...chatMessages].reverse().find(m => m.role !== "user");
    const groupId = lastModel ? `g-chat-${lastModel.ts}` : null;
    if (groupId && groupId !== chatFocusGroupId) {
      setChatFocusGroupId(groupId);
    }
  }, [chatMessages, chatFocusGroupId]);

  // Apply chat focus (pull latest response toward camera)
  const focusedGroups = useMemo(() => {
    if (!chatFocusGroupId || !cameraPose) return actionGroups;
    const targetX = cameraPose.x;
    const targetY = cameraPose.y - 3;
    const targetZ = 2.5;
    return actionGroups.map(g => g.id === chatFocusGroupId
      ? { ...g, x: targetX, y: targetY, z: targetZ, duration: 320 }
      : g
    );
  }, [actionGroups, chatFocusGroupId, cameraPose]);

  // Final groups passed to reconcile. Duration values tell Spectacles to animate.
  const finalGroups = focusedGroups;

  // --- Interaction handler: map tile IDs to actions ---
  const handleTileInteraction = useCallback((tileId: string, type: string) => {
    // Agent dots
    if (tileId.startsWith("agent-")) {
      const idx = parseInt(tileId.split("-")[1], 10);
      if (agents[idx]) {
        setSelectedAgent(prev => prev === agents[idx].name ? null : agents[idx].name);
        setMemoryPage(0);
      }
      return;
    }

    // Memory cards - tap to add to context
    if (tileId.startsWith("mem-")) {
      const memId = tileId.slice(4); // "mem-{uuid}" -> uuid
      const mem = memories.find(m => m.id === memId);
      if (mem && !contextItems.find(c => c.memoryId === mem.id)) {
        setContextItems(prev => [...prev, {
          memoryId: mem.id,
          agent: mem.agent,
          content: mem.content.slice(0, 50),
        }]);
      }
      return;
    }

    // Context cards - tap to remove
    if (tileId.startsWith("ctx-") && tileId !== "ctx-header" && tileId !== "ctx-empty") {
      const memId = tileId.slice(4);
      setContextItems(prev => prev.filter(c => c.memoryId !== memId));
      return;
    }

    // Page nav
    if (tileId === "page-nav") {
      // Determine prev/next from interaction position (simplified: cycle forward)
      setMemoryPage(p => (p + 1) % totalMemoryPages);
      return;
    }

    // Prompt buttons
    if (tileId.startsWith("prompt-")) {
      if (contextItems.length === 0 || chatLoading) return;
      const idx = parseInt(tileId.split("-")[1], 10);
      const prompts = ["Summarize", "Explain", "Compare", "Key Points"];
      if (prompts[idx]) {
        sendChat(prompts[idx] + " the context.");
      }
      return;
    }
  }, [agents, memories, contextItems, totalMemoryPages, chatLoading, sendChat]);

  const findTileAt = useCallback((x: number, y: number) => {
    const scene = sceneRef.current;
    if (!scene) return null;
    for (const tile of scene.getAllTiles()) {
      if (!tile.visible || !tile.interactive) continue;
      const pos = scene.getTileWorldPosition(tile.id) ?? { x: tile.x, y: tile.y };
      const wCm = (tile.w / PIXELS_PER_CM) * tile.scale;
      const hCm = (tile.h / PIXELS_PER_CM) * tile.scale;
      if (x >= pos.x - wCm / 2 && x <= pos.x + wCm / 2 && y >= pos.y - hCm / 2 && y <= pos.y + hCm / 2) {
        return tile.id;
      }
    }
    return null;
  }, []);

  const broadcastCursor = useCallback((x: number, y: number, visible: boolean) => {
    const channel = channelRef.current;
    if (!channel || !channelReady) return;
    const now = performance.now();
    if (now - lastCursorBroadcast.current < CURSOR_BROADCAST_INTERVAL) return;
    lastCursorBroadcast.current = now;
    channel.send({
      type: "broadcast",
      event: "cursor",
      payload: { x, y, visible },
    }).catch(() => {});
  }, [channelReady]);

  // --- Supabase broadcast channel ---
  useEffect(() => {
    if (!broadcasting || !room?.slug) {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
        setChannelReady(false);
      }
      return;
    }

    const channelKey = deviceId === "default"
      ? `spectacles:${room.slug}`
      : `spectacles:${room.slug}:${deviceId}`;

    const channel = supabase.channel(channelKey, {
      config: { broadcast: { ack: false, self: false } },
    });

    // Listen for micro-tile interaction events from Spectacles
    channel.on("broadcast", { event: "interact" }, ({ payload }) => {
      if (!payload?.id || !payload?.type) return;
      const { id, type, x, y } = payload as { id: string; type: string; x?: number; y?: number };

      if (type === "hover" || type === "hover_move") {
        if (x !== undefined && y !== undefined) {
          cursorRef.current = { x, y, visible: true };
          broadcastCursor(x, y, true);
          const hovered = findTileAt(x, y);
          setHoveredTileId(hovered);
        } else {
          setHoveredTileId(id);
        }
        return;
      }

      if (type === "hover_exit") {
        cursorRef.current = { x: 0, y: 0, visible: false };
        broadcastCursor(0, 0, false);
        setHoveredTileId(null);
        return;
      }

      if (type === "tap") {
        const cursor = cursorRef.current;
        const targetId = cursor.visible ? (findTileAt(cursor.x, cursor.y) ?? id) : id;
        handleTileInteraction(targetId, type);
      }
    });

    channel.on("broadcast", { event: "camera" }, ({ payload }) => {
      if (!payload || payload.x === undefined || payload.y === undefined || payload.z === undefined) return;
      setCameraPose({ x: payload.x as number, y: payload.y as number, z: payload.z as number });
    });

    channel.on("broadcast", { event: "layout" }, ({ payload }) => {
      if (!payload?.actions || !Array.isArray(payload.actions)) return;
      setLayoutActions(payload.actions as LayoutAction[]);
    });

    // Legacy interaction events (from old RealtimePanel)
    channel.on("broadcast", { event: "interaction" }, ({ payload }) => {
      if (!payload) return;
      // Old format uses col/row/u/v - convert to tile ID
      // For backward compat, just handle the basics
      if (payload.type === "pointer_exit") {
        setHoveredTileId(null);
      }
    });

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setChannelReady(true);
        // Resync: re-send all create ops + textures for tiles that already exist.
        // The Spectacles side may connect after the initial burst was sent.
        if (sceneRef.current) {
          sceneRef.current.resync();
        }
      }
    });

    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      setChannelReady(false);
    };
  }, [broadcasting, room?.slug, deviceId, handleTileInteraction]);

  // Track last hovered tile to avoid spamming visibility ops
  const lastHoveredRef = useRef<string | null>(null);

  // --- Render loop ---
  useEffect(() => {
    let animId: number;
    const scene = sceneRef.current;
    if (!scene) return;

    const loop = () => {
      // 1. Reconcile desired state with current tiles
      scene.reconcile(desiredTiles, finalGroups);

      // 2. Update content hashes so dirty tiles get flagged
      for (const desc of desiredTiles) {
        const tile = scene.getTile(desc.id);
        if (tile) {
          tile.setData(desc.data);
          tile.updateHash(tileHash(desc));
        }
      }

      // 3. Render dirty tiles
      scene.renderDirty();

      // 4. Handle hover glow positioning (only on change)
      if (hoveredTileId !== lastHoveredRef.current) {
        lastHoveredRef.current = hoveredTileId;
        if (hoveredTileId) {
          const pos = scene.getTileWorldPosition(hoveredTileId);
          if (pos) {
            scene.queueVisibilityOp("hover-glow", true);
            scene.queueMoveOp("hover-glow", pos.x, pos.y);
          }
        } else {
          scene.queueVisibilityOp("hover-glow", false);
        }
      }

      // 5. Draw preview to visible canvas
      drawPreview(scene);

      // 6. Broadcast to Spectacles (throttled)
      broadcastScene(scene);

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [desiredTiles, finalGroups, hoveredTileId, channelReady]);

  // --- Draw composite preview to visible canvas ---
  const previewCtxRef = useRef<CanvasRenderingContext2D | null>(null);

  const drawPreview = useCallback((scene: TileScene) => {
    const canvas = previewRef.current;
    if (!canvas) return;
    if (!previewCtxRef.current) {
      previewCtxRef.current = canvas.getContext("2d");
    }
    const ctx = previewCtxRef.current;
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;

    // Clear
    ctx.fillStyle = "#050508";
    ctx.fillRect(0, 0, W, H);

    // Map tile positions (cm) to preview pixels
    // Scene coordinates: x and y in cm, origin at center
    // Preview: origin at center, scale to fit
    const scale = 12; // pixels per cm
    const cx = W / 2;
    const cy = H / 2;

    const allTiles = scene.getAllTiles();
    for (const tile of allTiles) {
      if (!tile.visible || tile.type === "hover-glow") continue;

      const pos = scene.getTileWorldPosition(tile.id) ?? { x: tile.x, y: tile.y };
      // Convert cm position to pixel position
      const drawW = tile.w * tile.scale;
      const drawH = tile.h * tile.scale;
      const px = cx + pos.x * scale - (drawW / 2);
      const py = cy - pos.y * scale - (drawH / 2); // flip Y

      ctx.drawImage(tile.canvas, px, py, drawW, drawH);

      // Hover highlight
      if (tile.id === hoveredTileId) {
        ctx.strokeStyle = C.accent;
        ctx.lineWidth = 2;
        ctx.shadowColor = C.accent;
        ctx.shadowBlur = 8;
        ctx.strokeRect(px - 1, py - 1, drawW + 2, drawH + 2);
        ctx.shadowBlur = 0;
      }
    }
  }, [hoveredTileId]);

  // --- Broadcast scene ops and textures ---
  const broadcastScene = useCallback((scene: TileScene) => {
    const channel = channelRef.current;
    if (!channel || !channelReady) return;

    const now = performance.now();

    // Throttle scene ops to 10fps. Only take from queue when we're ready to send.
    if (scene.pendingOpCount > 0 && now - lastSceneBroadcast.current >= SCENE_BROADCAST_INTERVAL) {
      lastSceneBroadcast.current = now;

      const ops = scene.takeOps(MAX_OPS_PER_FRAME);
      if (ops.length === 1) {
        channel.send({
          type: "broadcast",
          event: "scene",
          payload: ops[0],
        }).catch(() => {});
      } else if (ops.length > 1) {
        channel.send({
          type: "broadcast",
          event: "scene",
          payload: { ops },
        }).catch(() => {});
      }
    }

    // Send textures when available (up to MAX_TEX_PER_FRAME per broadcast)
    if (scene.pendingTexCount > 0) {
      const textures = scene.takeTextures(MAX_TEX_PER_FRAME);
      for (const tex of textures) {
        channel.send({
          type: "broadcast",
          event: "tex",
          payload: tex,
        }).catch(() => {});
      }
    }
  }, [channelReady]);

  // --- Preview mouse interaction (for web testing) ---
  const handlePreviewMouseMove = useCallback((e: React.MouseEvent) => {
    const canvas = previewRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (canvas.width / rect.width);
    const py = (e.clientY - rect.top) * (canvas.height / rect.height);

    const scene = sceneRef.current;
    if (!scene) return;

    const scale = 12;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    // Find tile under cursor
    let found: string | null = null;
    for (const tile of scene.getAllTiles()) {
      if (!tile.visible || !tile.interactive) continue;
      const pos = scene.getTileWorldPosition(tile.id) ?? { x: tile.x, y: tile.y };
      const drawW = tile.w * tile.scale;
      const drawH = tile.h * tile.scale;
      const tx = cx + pos.x * scale - drawW / 2;
      const ty = cy - pos.y * scale - drawH / 2;
      if (px >= tx && px <= tx + drawW && py >= ty && py <= ty + drawH) {
        found = tile.id;
        break;
      }
    }
    setHoveredTileId(found);
  }, []);

  const handlePreviewClick = useCallback((e: React.MouseEvent) => {
    if (hoveredTileId) {
      handleTileInteraction(hoveredTileId, "tap");
    }
  }, [hoveredTileId, handleTileInteraction]);

  const handlePreviewLeave = useCallback(() => {
    setHoveredTileId(null);
  }, []);

  // --- UI ---
  // Preview canvas sized to show all tiles comfortably
  const previewW = 600;
  const previewH = 500;

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "100vh",
      background: "#050508",
      padding: "1rem",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
        <div style={{
          width: 12, height: 12, borderRadius: "50%",
          background: channelReady ? "#4ade80" : (devices.size > 0 ? "#fbbf24" : "#333"),
        }} />
        <h1 style={{ color: C.accent, fontSize: "1.25rem", margin: 0 }}>
          Spectacles Renderer
        </h1>
        <span style={{ color: C.muted, fontSize: "0.7rem", marginLeft: "0.5rem" }}>
          micro-tile
        </span>
      </div>

      {/* Device discovery bar */}
      {!manualDeviceId && (
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
          {devices.size === 0 ? (
            <span style={{ color: C.muted, fontSize: "0.8rem" }}>
              Waiting for Spectacles devices...
            </span>
          ) : (
            Array.from(devices.values()).map(dev => (
              <button
                key={dev.deviceId}
                onClick={() => { setActiveDeviceId(dev.deviceId); setBroadcasting(true); }}
                style={{
                  ...btnStyle,
                  background: activeDeviceId === dev.deviceId ? "#1a3a2e" : "#1a1a2e",
                  color: activeDeviceId === dev.deviceId ? "#4ade80" : C.text,
                  borderColor: activeDeviceId === dev.deviceId ? "#4ade80" : C.border,
                }}
              >
                {dev.deviceId}
              </button>
            ))
          )}
        </div>
      )}

      <div
        ref={containerRef}
        style={{ position: "relative", cursor: "crosshair" }}
      >
        <canvas
          ref={previewRef}
          width={previewW}
          height={previewH}
          onMouseMove={handlePreviewMouseMove}
          onClick={handlePreviewClick}
          onMouseLeave={handlePreviewLeave}
          style={{
            border: "2px solid #30363d",
            borderRadius: "12px",
            maxWidth: "100%",
            height: "auto",
          }}
        />
      </div>

      <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", flexWrap: "wrap", justifyContent: "center" }}>
        <button
          onClick={() => { setSelectedAgent(null); setMemoryPage(0); }}
          style={btnStyle}
        >
          Clear Filter
        </button>
        <button
          onClick={() => setContextItems([])}
          style={btnStyle}
        >
          Clear Context
        </button>
        <button
          onClick={() => clearChat()}
          style={btnStyle}
        >
          Clear Chat
        </button>
        {voiceSupported && (
          <button
            onClick={toggleListening}
            style={{
              ...btnStyle,
              background: isListening ? "#3a1a1a" : "#1a1a2e",
              color: isListening ? "#f87171" : "#e6edf3",
              borderColor: isListening ? "#f87171" : "#30363d",
            }}
          >
            {isListening ? "\u25CF Listening..." : "\u25CB Mic"}
          </button>
        )}
        <button
          onClick={() => setBroadcasting(!broadcasting)}
          style={{
            ...btnStyle,
            background: channelReady ? "#1a3a2e" : (broadcasting ? "#2a2a1e" : "#1a1a2e"),
            color: channelReady ? "#4ade80" : (broadcasting ? "#fbbf24" : "#e6edf3"),
            borderColor: channelReady ? "#4ade80" : (broadcasting ? "#fbbf24" : "#30363d"),
          }}
        >
          {channelReady ? "\u25C9 Live" : (broadcasting ? "\u25D0 Connecting..." : "\u25CB Broadcast")}
        </button>
      </div>

      <p style={{
        color: "#484f58",
        fontSize: "0.7rem",
        marginTop: "1rem",
        textAlign: "center",
      }}>
        {sceneRef.current?.size ?? 0} tiles | {devices.size} device{devices.size !== 1 ? "s" : ""} | {contextItems.length} ctx | {chatMessages.length} msgs
        {channelReady && ` | spectacles:${room?.slug}:${deviceId}`}
      </p>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "0.5rem 1rem",
  background: "#1a1a2e",
  color: "#e6edf3",
  border: "1px solid #30363d",
  borderRadius: "6px",
  cursor: "pointer",
  fontSize: "0.75rem",
};
