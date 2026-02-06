/**
 * SpectaclesView.tsx
 *
 * Combined Spectacles simulator - renders and handles interaction in one view.
 * Also pushes frames to Supabase for real Spectacles hardware to pick up.
 */

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useRoomContext } from "../context/RoomContext";
import { useRealtimeMemories } from "../hooks/useRealtimeMemories";
import { supabase, type Memory } from "../lib/supabase";

const FRAME_WIDTH = 512;
const FRAME_HEIGHT = 512;

const ZONES = {
  agents: { x: 0, y: 0.12, w: 0.28, h: 0.88 },
  memories: { x: 0.30, y: 0.12, w: 0.38, h: 0.88 },
  context: { x: 0.70, y: 0.12, w: 0.28, h: 0.88 },
};

const COLORS = {
  bg: "#0a0a14",
  cardBg: "#151520",
  cardBgHover: "#1a1a2a",
  cardBgDrag: "#2a3a4a",
  accent: "#4eeaff",
  accentPink: "#e879f9",
  accentGreen: "#4ade80",
  text: "#e6edf3",
  textMuted: "#8b949e",
  border: "#30363d",
  dropZoneActive: "#2a4a5a",
};

const AGENT_PALETTE = [
  "#E64980", "#CC5DE8", "#845EF7", "#5C7CFA",
  "#339AF0", "#22B8CF", "#20C997", "#51CF66",
];

function agentColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AGENT_PALETTE[Math.abs(hash) % AGENT_PALETTE.length];
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function shortAgent(agent: string): string {
  const slash = agent.indexOf("/");
  return slash > 0 ? agent.slice(slash + 1) : agent;
}

interface AgentInfo {
  name: string;
  isActive: boolean;
  lastTs: string;
  memoryCount: number;
}

interface ContextItem {
  memoryId: string;
  agent: string;
  content: string;
}

export function SpectaclesView() {
  const { room } = useRoomContext();
  const { memories } = useRealtimeMemories(room?.id ?? null, 100);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Interaction state
  const [pointerUV, setPointerUV] = useState<[number, number] | null>(null);
  const [isPointerDown, setIsPointerDown] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [dragMemoryId, setDragMemoryId] = useState<string | null>(null);
  const [dragUV, setDragUV] = useState<[number, number] | null>(null);
  const [contextItems, setContextItems] = useState<ContextItem[]>([]);
  const [frameCount, setFrameCount] = useState(0);
  const [broadcasting, setBroadcasting] = useState(false);
  const [channelReady, setChannelReady] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Build agent list from memories
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

  // Filter memories by selected agent
  const visibleMemories = useMemo(() => {
    let filtered = selectedAgent
      ? memories.filter(m => m.agent === selectedAgent)
      : memories;
    return filtered
      .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
      .slice(0, 8);
  }, [memories, selectedAgent]);

  // Convert mouse position to UV
  const getUVFromEvent = useCallback((e: React.MouseEvent | React.TouchEvent): [number, number] | null => {
    const container = containerRef.current;
    if (!container) return null;

    const rect = container.getBoundingClientRect();
    let clientX: number, clientY: number;

    if ("touches" in e) {
      if (e.touches.length === 0) return null;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const u = Math.max(0, Math.min(1, x / rect.width));
    const v = Math.max(0, Math.min(1, y / rect.height));

    return [u, v];
  }, []);

  // Hit testing
  const getAgentAtUV = useCallback((uv: [number, number]): number | null => {
    const [u, v] = uv;
    const zone = ZONES.agents;
    if (u < zone.x || u > zone.x + zone.w) return null;

    const rowHeight = 0.08;
    const startY = zone.y + 0.05;
    const idx = Math.floor((v - startY) / rowHeight);
    if (idx >= 0 && idx < Math.min(agents.length, 10)) {
      return idx;
    }
    return null;
  }, [agents.length]);

  const getMemoryAtUV = useCallback((uv: [number, number]): number | null => {
    const [u, v] = uv;
    const zone = ZONES.memories;
    if (u < zone.x || u > zone.x + zone.w) return null;

    const cardHeight = 0.10;
    const cardGap = 0.01;
    const startY = zone.y + 0.05;
    const idx = Math.floor((v - startY) / (cardHeight + cardGap));
    if (idx >= 0 && idx < visibleMemories.length) {
      return idx;
    }
    return null;
  }, [visibleMemories.length]);

  const isInContextZone = useCallback((uv: [number, number]): boolean => {
    const [u, v] = uv;
    const zone = ZONES.context;
    return u >= zone.x && u <= zone.x + zone.w && v >= zone.y && v <= zone.y + zone.h;
  }, []);

  // Event handlers
  const handlePointerMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const uv = getUVFromEvent(e);
    setPointerUV(uv);
    if (dragMemoryId && uv) {
      setDragUV(uv);
    }
  }, [getUVFromEvent, dragMemoryId]);

  const handlePointerDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const uv = getUVFromEvent(e);
    if (!uv) return;

    setIsPointerDown(true);
    setPointerUV(uv);

    // Check agent click
    const agentIdx = getAgentAtUV(uv);
    if (agentIdx !== null && agents[agentIdx]) {
      const agent = agents[agentIdx];
      setSelectedAgent(prev => prev === agent.name ? null : agent.name);
      return;
    }

    // Check memory click (start drag)
    const memIdx = getMemoryAtUV(uv);
    if (memIdx !== null && visibleMemories[memIdx]) {
      setDragMemoryId(visibleMemories[memIdx].id);
      setDragUV(uv);
    }
  }, [getUVFromEvent, getAgentAtUV, getMemoryAtUV, agents, visibleMemories]);

  const handlePointerUp = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const uv = getUVFromEvent(e);
    setIsPointerDown(false);

    if (dragMemoryId && uv && isInContextZone(uv)) {
      const mem = memories.find(m => m.id === dragMemoryId);
      if (mem && !contextItems.find(c => c.memoryId === mem.id)) {
        setContextItems(prev => [...prev, {
          memoryId: mem.id,
          agent: mem.agent,
          content: mem.content.slice(0, 50),
        }]);
      }
    }

    setDragMemoryId(null);
    setDragUV(null);
  }, [getUVFromEvent, dragMemoryId, isInContextZone, memories, contextItems]);

  const handlePointerLeave = useCallback(() => {
    setPointerUV(null);
    if (!isPointerDown) {
      setDragMemoryId(null);
      setDragUV(null);
    }
  }, [isPointerDown]);

  // Render frame
  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = FRAME_WIDTH;
    const H = FRAME_HEIGHT;

    // Clear
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, W, H);

    // Header
    ctx.fillStyle = COLORS.accent;
    ctx.font = "bold 20px system-ui, -apple-system, sans-serif";
    ctx.fillText("Eywa", 16, 32);

    ctx.fillStyle = COLORS.textMuted;
    ctx.font = "11px system-ui";
    ctx.fillText(room?.slug ?? "demo", 70, 30);

    // Connection indicator
    ctx.fillStyle = COLORS.accentGreen;
    ctx.beginPath();
    ctx.arc(W - 20, 24, 5, 0, Math.PI * 2);
    ctx.fill();

    // Tab labels
    const tabs = ["Agents", "Memories", "Context"];
    const tabZones = [ZONES.agents, ZONES.memories, ZONES.context];
    ctx.font = "bold 10px system-ui";
    tabs.forEach((label, i) => {
      const zone = tabZones[i];
      const isActive = (i === 0 && selectedAgent) || (i === 2 && contextItems.length > 0);
      ctx.fillStyle = isActive ? COLORS.accent : COLORS.textMuted;
      ctx.fillText(label, zone.x * W + 4, (zone.y - 0.02) * H);
    });

    // Agents panel
    const agentZone = ZONES.agents;
    ctx.fillStyle = "#0d0d18";
    ctx.fillRect(agentZone.x * W, agentZone.y * H, agentZone.w * W, agentZone.h * H);

    agents.slice(0, 10).forEach((agent, i) => {
      const rowHeight = 0.08;
      const bounds = {
        x: agentZone.x + 0.01,
        y: agentZone.y + 0.05 + i * rowHeight,
        w: agentZone.w - 0.02,
        h: rowHeight - 0.01,
      };
      const isSelected = selectedAgent === agent.name;
      const color = agentColor(agent.name);

      ctx.fillStyle = isSelected ? "#1a1a2e" : "transparent";
      ctx.fillRect(bounds.x * W, bounds.y * H, bounds.w * W, bounds.h * H);

      ctx.fillStyle = agent.isActive ? COLORS.accentGreen : COLORS.textMuted;
      ctx.beginPath();
      ctx.arc((bounds.x + 0.02) * W, (bounds.y + bounds.h / 2) * H, 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = color;
      ctx.font = isSelected ? "bold 10px system-ui" : "10px system-ui";
      ctx.fillText(shortAgent(agent.name).slice(0, 12), (bounds.x + 0.05) * W, (bounds.y + bounds.h / 2 + 3) * H);

      ctx.fillStyle = COLORS.textMuted;
      ctx.font = "9px system-ui";
      ctx.fillText(`${agent.memoryCount}`, (bounds.x + bounds.w - 0.04) * W, (bounds.y + bounds.h / 2 + 3) * H);
    });

    // Memories panel
    const memZone = ZONES.memories;
    ctx.fillStyle = "#0d0d18";
    ctx.fillRect(memZone.x * W, memZone.y * H, memZone.w * W, memZone.h * H);

    visibleMemories.forEach((mem, i) => {
      const cardHeight = 0.10;
      const cardGap = 0.01;
      const bounds = {
        x: memZone.x + 0.01,
        y: memZone.y + 0.05 + i * (cardHeight + cardGap),
        w: memZone.w - 0.02,
        h: cardHeight,
      };

      const isDragging = dragMemoryId === mem.id;
      const isHovered = pointerUV && !isDragging &&
        pointerUV[0] >= bounds.x && pointerUV[0] <= bounds.x + bounds.w &&
        pointerUV[1] >= bounds.y && pointerUV[1] <= bounds.y + bounds.h;
      const color = agentColor(mem.agent);

      let drawX = bounds.x * W;
      let drawY = bounds.y * H;
      const drawW = bounds.w * W;
      const drawH = bounds.h * H;

      if (isDragging && dragUV) {
        drawX = dragUV[0] * W - drawW / 2;
        drawY = dragUV[1] * H - drawH / 2;
      }

      ctx.fillStyle = isDragging ? COLORS.cardBgDrag : (isHovered ? COLORS.cardBgHover : COLORS.cardBg);
      ctx.strokeStyle = isDragging ? COLORS.accent : (isHovered ? color : COLORS.border);
      ctx.lineWidth = isDragging ? 2 : 1;

      ctx.beginPath();
      ctx.roundRect(drawX, drawY, drawW, drawH, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = color;
      ctx.font = "bold 9px system-ui";
      ctx.fillText(shortAgent(mem.agent), drawX + 6, drawY + 14);

      ctx.fillStyle = COLORS.textMuted;
      ctx.font = "8px system-ui";
      ctx.fillText(timeAgo(mem.ts), drawX + drawW - 24, drawY + 14);

      ctx.fillStyle = COLORS.text;
      ctx.font = "9px system-ui";
      const maxChars = Math.floor((drawW - 12) / 5);
      const content = mem.content.slice(0, maxChars * 2);
      const lines = [content.slice(0, maxChars), content.slice(maxChars, maxChars * 2)];
      lines.forEach((line, li) => {
        if (line.trim()) {
          ctx.fillText(line, drawX + 6, drawY + 28 + li * 12);
        }
      });
    });

    if (visibleMemories.length === 0) {
      ctx.fillStyle = COLORS.textMuted;
      ctx.font = "11px system-ui";
      ctx.fillText("No memories yet", (memZone.x + memZone.w / 2 - 0.08) * W, (memZone.y + memZone.h / 2) * H);
    }

    // Context panel
    const ctxZone = ZONES.context;
    const isOverContext = pointerUV && isInContextZone(pointerUV);
    const isDropTarget = dragMemoryId && isOverContext;

    ctx.fillStyle = isDropTarget ? COLORS.dropZoneActive : "#0d0d18";
    ctx.strokeStyle = isDropTarget ? COLORS.accent : COLORS.border;
    ctx.lineWidth = isDropTarget ? 2 : 1;
    ctx.setLineDash(dragMemoryId ? [4, 4] : []);
    ctx.fillRect(ctxZone.x * W, ctxZone.y * H, ctxZone.w * W, ctxZone.h * H);
    ctx.strokeRect(ctxZone.x * W, ctxZone.y * H, ctxZone.w * W, ctxZone.h * H);
    ctx.setLineDash([]);

    if (contextItems.length === 0) {
      ctx.fillStyle = COLORS.textMuted;
      ctx.font = "10px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("Drop memories", (ctxZone.x + ctxZone.w / 2) * W, (ctxZone.y + ctxZone.h / 2 - 0.02) * H);
      ctx.fillText("here", (ctxZone.x + ctxZone.w / 2) * W, (ctxZone.y + ctxZone.h / 2 + 0.02) * H);
      ctx.textAlign = "left";
    } else {
      contextItems.slice(0, 6).forEach((item, i) => {
        const itemY = ctxZone.y + 0.04 + i * 0.12;
        const color = agentColor(item.agent);

        ctx.fillStyle = COLORS.cardBg;
        ctx.fillRect((ctxZone.x + 0.01) * W, itemY * H, (ctxZone.w - 0.02) * W, 0.10 * H);

        ctx.fillStyle = color;
        ctx.font = "bold 8px system-ui";
        ctx.fillText(shortAgent(item.agent).slice(0, 10), (ctxZone.x + 0.02) * W, (itemY + 0.03) * H);

        ctx.fillStyle = COLORS.text;
        ctx.font = "8px system-ui";
        ctx.fillText(item.content.slice(0, 20), (ctxZone.x + 0.02) * W, (itemY + 0.07) * H);
      });
    }

    // Pointer cursor
    if (pointerUV && !dragMemoryId) {
      ctx.fillStyle = "rgba(78, 234, 255, 0.3)";
      ctx.strokeStyle = COLORS.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pointerUV[0] * W, pointerUV[1] * H, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Status bar
    ctx.fillStyle = COLORS.textMuted;
    ctx.font = "9px system-ui";
    ctx.fillText(`Frame ${frameCount} | ${agents.filter(a => a.isActive).length} active`, 10, H - 10);
  }, [room, agents, visibleMemories, selectedAgent, contextItems, pointerUV, dragMemoryId, dragUV, frameCount, isInContextZone]);

  // Set up broadcast channel
  useEffect(() => {
    if (!broadcasting || !room?.slug) {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
        setChannelReady(false);
      }
      return;
    }

    const channel = supabase.channel(`spectacles:${room.slug}`, {
      config: { broadcast: { ack: false, self: false } },
    });

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setChannelReady(true);
      }
    });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      setChannelReady(false);
    };
  }, [broadcasting, room?.slug]);

  // Broadcast frame via WebSocket (not REST)
  const broadcastFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const channel = channelRef.current;
    if (!canvas || !channel || !channelReady) return;

    const base64 = canvas.toDataURL("image/jpeg", 0.7).split(",")[1];

    // Use track() for presence-style updates that go over WebSocket
    channel.send({
      type: "broadcast",
      event: "frame",
      payload: { image: base64, frame: frameCount },
    }).catch(() => {
      // Ignore send errors - frames are disposable
    });
  }, [channelReady, frameCount]);

  // Render loop
  useEffect(() => {
    let animationId: number;
    let lastRenderTime = 0;
    let lastBroadcastTime = 0;
    const frameInterval = 1000 / 30; // 30 fps for local render
    const broadcastInterval = 1000 / 10; // 10 fps for broadcast

    const loop = (timestamp: number) => {
      if (timestamp - lastRenderTime >= frameInterval) {
        renderFrame();
        setFrameCount(c => c + 1);
        lastRenderTime = timestamp;

        // Broadcast at slower rate, only when channel is ready
        if (channelReady && timestamp - lastBroadcastTime >= broadcastInterval) {
          broadcastFrame();
          lastBroadcastTime = timestamp;
        }
      }
      animationId = requestAnimationFrame(loop);
    };

    animationId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationId);
  }, [renderFrame, channelReady, broadcastFrame]);

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
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
        <div style={{
          width: 12,
          height: 12,
          borderRadius: "50%",
          background: "#4ade80",
        }} />
        <h1 style={{ color: "#4eeaff", fontSize: "1.25rem", margin: 0 }}>
          Spectacles Simulator
        </h1>
      </div>

      <p style={{ color: "#8b949e", fontSize: "0.875rem", marginBottom: "1rem", textAlign: "center" }}>
        Click agents to filter. Drag memories to context.
      </p>

      <div
        ref={containerRef}
        onMouseMove={handlePointerMove}
        onMouseDown={handlePointerDown}
        onMouseUp={handlePointerUp}
        onMouseLeave={handlePointerLeave}
        onTouchMove={handlePointerMove}
        onTouchStart={handlePointerDown}
        onTouchEnd={handlePointerUp}
        style={{
          position: "relative",
          cursor: "crosshair",
        }}
      >
        <canvas
          ref={canvasRef}
          width={FRAME_WIDTH}
          height={FRAME_HEIGHT}
          style={{
            border: "2px solid #30363d",
            borderRadius: "12px",
            maxWidth: "100%",
            height: "auto",
          }}
        />
      </div>

      <div style={{
        display: "flex",
        gap: "0.5rem",
        marginTop: "1rem",
      }}>
        <button
          onClick={() => setSelectedAgent(null)}
          style={{
            padding: "0.5rem 1rem",
            background: "#1a1a2e",
            color: "#e6edf3",
            border: "1px solid #30363d",
            borderRadius: "6px",
            cursor: "pointer",
            fontSize: "0.75rem",
          }}
        >
          Clear Filter
        </button>
        <button
          onClick={() => setContextItems([])}
          style={{
            padding: "0.5rem 1rem",
            background: "#1a1a2e",
            color: "#e6edf3",
            border: "1px solid #30363d",
            borderRadius: "6px",
            cursor: "pointer",
            fontSize: "0.75rem",
          }}
        >
          Clear Context
        </button>
        <button
          onClick={() => setBroadcasting(!broadcasting)}
          style={{
            padding: "0.5rem 1rem",
            background: channelReady ? "#1a3a2e" : (broadcasting ? "#2a2a1e" : "#1a1a2e"),
            color: channelReady ? "#4ade80" : (broadcasting ? "#fbbf24" : "#e6edf3"),
            border: `1px solid ${channelReady ? "#4ade80" : (broadcasting ? "#fbbf24" : "#30363d")}`,
            borderRadius: "6px",
            cursor: "pointer",
            fontSize: "0.75rem",
          }}
        >
          {channelReady ? "◉ Live" : (broadcasting ? "◐ Connecting..." : "○ Broadcast")}
        </button>
      </div>

      <p style={{
        color: "#484f58",
        fontSize: "0.7rem",
        marginTop: "1rem",
        textAlign: "center",
      }}>
        {contextItems.length} items in context | Frame {frameCount}
        {broadcasting && ` | Streaming to spectacles:${room?.slug}`}
      </p>
    </div>
  );
}
