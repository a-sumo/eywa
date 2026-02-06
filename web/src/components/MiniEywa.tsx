import { useState, useEffect, useMemo, useCallback, useRef, type DragEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { useRealtimeMemories } from "../hooks/useRealtimeMemories";
import { useRoomContext } from "../context/RoomContext";
import { supabase } from "../lib/supabase";
import type { Memory, Room } from "../lib/supabase";
import { getAvatar } from "./avatars";
import { EywaLogoMono } from "./EywaLogo";
import { GrainTexture } from "./GrainTexture";

/* ── Palette (aurora-derived, vivid on dark) ── */

const AGENT_PALETTE = [
  "#15D1FF", "#6417EC", "#E72B76", "#4ade80",
  "#2543FF", "#ff6b9d", "#8b5cf6", "#06b6d4",
  "#a78bfa", "#f472b6", "#34d399", "#60a5fa",
];

function agentColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AGENT_PALETTE[Math.abs(hash) % AGENT_PALETTE.length];
}

const TYPE_COLORS: Record<string, string> = {
  user: "#4ade80",
  assistant: "#15D1FF",
  tool_call: "#a78bfa",
  tool_result: "#8b5cf6",
  injection: "#E72B76",
};

type TypeCategory = "user" | "assistant" | "tool";

function typeToCategory(t: string): TypeCategory | null {
  if (t === "user") return "user";
  if (t === "assistant") return "assistant";
  if (t === "tool_call" || t === "tool_result") return "tool";
  return null;
}

function typeLabel(t: string): string {
  if (t === "tool_call") return "call";
  if (t === "tool_result") return "result";
  if (t === "assistant") return "asst";
  if (t === "injection") return "inject";
  return t;
}

/* ── Helpers ── */

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function shortName(agents: string[]): (agent: string) => string {
  if (agents.length === 0) return (a) => a;
  const prefixCounts = new Map<string, number>();
  for (const a of agents) {
    const slash = a.indexOf("/");
    if (slash > 0) {
      const p = a.slice(0, slash + 1);
      prefixCounts.set(p, (prefixCounts.get(p) ?? 0) + 1);
    }
  }
  let common = "";
  for (const [p, count] of prefixCounts) {
    if (count > agents.length / 2) { common = p; break; }
  }
  return (agent: string) => common && agent.startsWith(common) ? agent.slice(common.length) : agent;
}

/* ── Agent builder ── */

interface AgentInfo {
  agent: string;
  memories: Memory[];
  isActive: boolean;
  lastTs: string;
  sessionCount: number;
  lastAction: string;
  typeCounts: TypeCounts;
}

interface TypeCounts {
  user: number;
  assistant: number;
  tool: number;
  other: number;
}

function buildAgents(memories: Memory[]): AgentInfo[] {
  const byAgent = new Map<string, Memory[]>();
  const sessionIds = new Map<string, Set<string>>();

  for (const m of memories) {
    let arr = byAgent.get(m.agent);
    if (!arr) {
      arr = [];
      byAgent.set(m.agent, arr);
    }
    arr.push(m);

    let sids = sessionIds.get(m.agent);
    if (!sids) {
      sids = new Set();
      sessionIds.set(m.agent, sids);
    }
    sids.add(m.session_id);
  }

  const now = Date.now();
  const agents: AgentInfo[] = [];

  for (const [agent, mems] of byAgent) {
    const sorted = [...mems].sort(
      (a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime()
    );
    const lastTs = sorted[0]?.ts ?? "";
    const isActive = now - new Date(lastTs).getTime() < 5 * 60 * 1000;

    const lastMeaningful = sorted.find(
      (m) => m.message_type === "assistant" || m.message_type === "user"
    );
    const lastAction = lastMeaningful?.content.slice(0, 80) ?? "";

    const c: TypeCounts = { user: 0, assistant: 0, tool: 0, other: 0 };
    for (const m of mems) {
      const cat = typeToCategory(m.message_type);
      if (cat) c[cat]++;
      else c.other++;
    }

    agents.push({
      agent, memories: sorted, isActive, lastTs,
      sessionCount: sessionIds.get(agent)?.size ?? 0,
      lastAction, typeCounts: c,
    });
  }

  agents.sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return new Date(b.lastTs).getTime() - new Date(a.lastTs).getTime();
  });

  return agents;
}

/* ── Agent Avatar ── */

function PixelCreature({ name, size = 16 }: { name: string; size?: number }) {
  const { avatar, hueRotate, saturate } = useMemo(() => getAvatar(name), [name]);
  return (
    <div
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: "50%",
        overflow: "hidden",
        filter: `hue-rotate(${hueRotate}deg) saturate(${saturate}%)`,
      }}
      className="mini-pixel-creature"
      dangerouslySetInnerHTML={{ __html: avatar.svg }}
    />
  );
}

/* ── Inject helper ── */

async function injectToAgent(target: string, content: string, roomId: string) {
  await supabase.from("memories").insert({
    room_id: roomId,
    agent: "web-user",
    session_id: `web_${Date.now()}`,
    message_type: "injection",
    content: `[INJECT → ${target}]: ${content}`,
    token_count: Math.floor(content.length / 4),
    metadata: {
      event: "context_injection",
      from_agent: "web-user",
      target_agent: target,
      priority: "normal",
      label: null,
    },
  });
}

/* ── Room Picker ── */

function MiniRoomPicker({ currentSlug, onClose }: { currentSlug: string; onClose: () => void }) {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase
      .from("rooms")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        setRooms(data ?? []);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  return (
    <div className="mini-room-picker" ref={ref}>
      {loading && <div className="mini-room-picker-item">loading...</div>}
      {rooms.map((r) => (
        <div
          key={r.id}
          className={`mini-room-picker-item${r.slug === currentSlug ? " active" : ""}`}
          onClick={() => {
            if (r.slug !== currentSlug) navigate(`/r/${r.slug}/mini`);
            onClose();
          }}
        >
          <span className="mini-room-picker-name">{r.name || r.slug}</span>
          <span className="mini-room-picker-slug">/{r.slug}</span>
        </div>
      ))}
      {!loading && rooms.length === 0 && (
        <div className="mini-room-picker-item">no rooms</div>
      )}
    </div>
  );
}

/* ── Dot Info (graph tooltip) ── */

interface DotInfo {
  memory: Memory;
  x: number;
  y: number;
}

/* ── Mini Graph (decorative SVG, clickable dots) ── */

function MiniGraph({
  memories,
  agents,
  getShort,
  onDotTap,
  selectedDotId,
}: {
  memories: Memory[];
  agents: AgentInfo[];
  getShort: (a: string) => string;
  onDotTap: (info: DotInfo | null) => void;
  selectedDotId: string | null;
}) {
  const WIDTH = 312;
  const HEIGHT = 130;
  const PADDING_X = 24;
  const AVATAR_ROW = 22;
  const PADDING_BOTTOM = 8;

  const graphData = useMemo(() => {
    if (agents.length === 0) return { tracks: [], dots: [], edges: [], memoryMap: new Map<string, Memory>() };

    const typed = memories
      .filter((m) => typeToCategory(m.message_type) !== null)
      .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
      .slice(0, 30);

    const memoryMap = new Map(typed.map((m) => [m.id, m]));

    const seenAgents = new Set(typed.map((m) => m.agent));
    const activeAgents = agents
      .filter((a) => seenAgents.has(a.agent))
      .slice(0, 6);

    if (activeAgents.length === 0) return { tracks: [], dots: [], edges: [], memoryMap };

    const agentNames = activeAgents.map((a) => a.agent);
    const agentIndex = new Map(agentNames.map((n, i) => [n, i]));
    const trackCount = agentNames.length;
    const usableW = WIDTH - PADDING_X * 2;

    function trackX(i: number): number {
      if (trackCount <= 1) return WIDTH / 2;
      return PADDING_X + i * (usableW / (trackCount - 1));
    }

    const svgTop = AVATAR_ROW;
    const usableH = HEIGHT - svgTop - PADDING_BOTTOM;
    const yStep = typed.length > 1 ? usableH / (typed.length - 1) : 0;

    const tracks = agentNames.map((name, i) => ({
      x: trackX(i),
      name,
      color: agentColor(name),
    }));

    const dots = typed
      .filter((m) => agentIndex.has(m.agent))
      .map((m, i) => {
        const ai = agentIndex.get(m.agent)!;
        return {
          id: m.id,
          x: trackX(ai),
          y: svgTop + i * yStep,
          color: TYPE_COLORS[m.message_type] ?? "#B8B8C8",
        };
      });

    const injectionMems = memories
      .filter((m) => m.metadata?.event === "context_injection")
      .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
      .slice(0, 15);

    const edges = injectionMems
      .map((m) => {
        const fromAgent = (m.metadata?.from_agent as string) ?? m.agent;
        const toAgent = m.metadata?.target_agent as string;
        if (!toAgent) return null;

        const fromIdx = agentIndex.get(fromAgent);
        const toIdx = agentIndex.get(toAgent);
        if (fromIdx === undefined || toIdx === undefined) return null;

        const typedIdx = typed.findIndex((t) => t.id === m.id);
        const y = typedIdx >= 0 ? svgTop + typedIdx * yStep : svgTop;

        const x1 = trackX(fromIdx);
        const x2 = trackX(toIdx);
        const midX = (x1 + x2) / 2;
        const cpOffset = Math.abs(x2 - x1) * 0.3;

        return {
          id: m.id,
          d: `M${x1},${y} C${midX},${y - cpOffset} ${midX},${y + cpOffset} ${x2},${y}`,
          color: agentColor(fromAgent),
        };
      })
      .filter(Boolean) as { id: string; d: string; color: string }[];

    return { tracks, dots, edges, memoryMap };
  }, [memories, agents]);

  const handleDotClick = useCallback(
    (dotId: string, x: number, y: number) => {
      if (selectedDotId === dotId) {
        onDotTap(null);
        return;
      }
      const mem = graphData.memoryMap.get(dotId);
      if (mem) onDotTap({ memory: mem, x, y });
    },
    [selectedDotId, graphData.memoryMap, onDotTap]
  );

  if (agents.length === 0 || graphData.tracks.length === 0) {
    return <div className="mini-graph"><div className="mini-empty" style={{ padding: "40px 8px" }}>waiting for data</div></div>;
  }

  return (
    <div className="mini-graph" onClick={() => onDotTap(null)}>
      {/* Agent avatars at top of each track */}
      {graphData.tracks.map((t) => (
        <div
          key={`av-${t.name}`}
          className="mini-graph-avatar"
          style={{ left: t.x - 8 }}
          title={getShort(t.name)}
        >
          <PixelCreature name={t.name} size={16} />
        </div>
      ))}

      <svg
        width={WIDTH}
        height={HEIGHT}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Track lines */}
        {graphData.tracks.map((t, i) => (
          <line
            key={`track-${i}`}
            x1={t.x} y1={AVATAR_ROW}
            x2={t.x} y2={HEIGHT - PADDING_BOTTOM}
            stroke={t.color}
            strokeWidth={1}
            opacity={0.12}
          />
        ))}

        {/* Injection edges */}
        {graphData.edges.map((e) => (
          <path
            key={`edge-${e.id}`}
            d={e.d}
            fill="none"
            stroke={e.color}
            strokeWidth={2}
            opacity={0.4}
            strokeLinecap="round"
          />
        ))}

        {/* Event dots (clickable) */}
        {graphData.dots.map((d) => (
          <g key={`dot-${d.id}`}>
            {/* Highlight ring when selected */}
            {selectedDotId === d.id && (
              <circle cx={d.x} cy={d.y} r={9} fill="none" stroke={d.color} strokeWidth={1.5} opacity={0.5} />
            )}
            <circle
              cx={d.x}
              cy={d.y}
              r={5}
              fill={d.color}
              opacity={selectedDotId === d.id ? 1 : 0.85}
              style={{ cursor: "pointer" }}
              onClick={(e) => {
                e.stopPropagation();
                handleDotClick(d.id, d.x, d.y);
              }}
            />
            {/* Larger invisible hit target for small screens */}
            <circle
              cx={d.x}
              cy={d.y}
              r={12}
              fill="transparent"
              style={{ cursor: "pointer" }}
              onClick={(e) => {
                e.stopPropagation();
                handleDotClick(d.id, d.x, d.y);
              }}
            />
          </g>
        ))}
      </svg>
    </div>
  );
}

/* ── Activity Feed (draggable + tappable rows) ── */

function MiniActivityFeed({
  memories,
  getShort,
  draggingId,
  onDragStart,
  onDragEnd,
  expandedId,
  onTapRow,
}: {
  memories: Memory[];
  getShort: (a: string) => string;
  draggingId: string | null;
  onDragStart: (m: Memory) => void;
  onDragEnd: () => void;
  expandedId: string | null;
  onTapRow: (id: string | null) => void;
}) {
  const sorted = useMemo(() => {
    return [...memories]
      .filter((m) => typeToCategory(m.message_type) !== null)
      .sort(
        (a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime()
      );
  }, [memories]);

  const items = sorted.slice(0, 40);

  const handleDragStart = useCallback(
    (e: DragEvent<HTMLDivElement>, m: Memory) => {
      e.dataTransfer.setData(
        "application/eywa-memory",
        JSON.stringify({ id: m.id, content: m.content, agent: m.agent })
      );
      e.dataTransfer.effectAllowed = "copy";
      onDragStart(m);
    },
    [onDragStart]
  );

  return (
    <div className="mini-feed">
      <div className="mini-feed-header">
        feed
        <span className="mini-feed-count">{sorted.length}</span>
      </div>
      <div className="mini-feed-list">
        {items.map((m, idx) => {
          const isExpanded = expandedId === m.id;
          return (
            <div
              className={`mini-feed-row${idx === 0 ? " mini-feed-row-latest" : ""}${draggingId === m.id ? " dragging" : ""}${isExpanded ? " expanded" : ""}`}
              key={m.id}
              draggable
              onDragStart={(e) => handleDragStart(e, m)}
              onDragEnd={onDragEnd}
              onClick={() => onTapRow(isExpanded ? null : m.id)}
            >
              <span
                className="mini-feed-dot"
                style={{ background: TYPE_COLORS[m.message_type] ?? "#B8B8C8" }}
              />
              <span className="mini-feed-agent">{getShort(m.agent)}</span>
              {!isExpanded && (
                <>
                  <span className="mini-feed-content">{m.content.slice(0, 80)}</span>
                  <span className="mini-feed-time">{timeAgo(m.ts)}</span>
                </>
              )}
              {isExpanded && (
                <div className="mini-feed-expanded">
                  <div className="mini-feed-expanded-meta">
                    <span className="mini-feed-expanded-type" style={{ color: TYPE_COLORS[m.message_type] ?? "#999" }}>
                      {typeLabel(m.message_type)}
                    </span>
                    <span className="mini-feed-expanded-time">{timeAgo(m.ts)}</span>
                    <span className="mini-feed-expanded-sid">{m.session_id.slice(0, 8)}</span>
                  </div>
                  <div className="mini-feed-expanded-content">{m.content.slice(0, 300)}</div>
                </div>
              )}
            </div>
          );
        })}
        {items.length === 0 && (
          <div className="mini-empty">no activity</div>
        )}
      </div>
    </div>
  );
}

/* ── Main ── */

export function MiniEywa() {
  const { room } = useRoomContext();
  const { slug } = useParams<{ slug: string }>();
  const { memories } = useRealtimeMemories(room?.id ?? null, 200);
  const [showQr, setShowQr] = useState(false);
  const [showRoomPicker, setShowRoomPicker] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [dotInfo, setDotInfo] = useState<DotInfo | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const agents = useMemo(() => buildAgents(memories), [memories]);
  const activeCount = agents.filter((a) => a.isActive).length;

  const getShort = useMemo(
    () => shortName(agents.map((a) => a.agent)),
    [agents]
  );

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }, []);

  const handleDrop = useCallback(
    async (e: DragEvent<HTMLDivElement>, targetAgent: string) => {
      e.preventDefault();
      setDropTarget(null);
      setDraggingId(null);

      const raw = e.dataTransfer.getData("application/eywa-memory");
      if (!raw || !room) return;

      try {
        const data = JSON.parse(raw) as { id: string; content: string; agent: string };
        await injectToAgent(targetAgent, data.content, room.id);
        showToast(`injected to ${getShort(targetAgent)}`);
      } catch {
        showToast("injection failed");
      }
    },
    [room, showToast, getShort]
  );

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>, agent: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDropTarget(agent);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDropTarget(null);
  }, []);

  const handleDotTap = useCallback((info: DotInfo | null) => {
    setDotInfo(info);
    setExpandedRow(null);
  }, []);

  const handleRowTap = useCallback((id: string | null) => {
    setExpandedRow(id);
    setDotInfo(null);
  }, []);

  const roomUrl = room
    ? `${window.location.origin}/r/${room.slug}`
    : "";

  const callsLast10m = useMemo(() => {
    const cutoff = Date.now() - 10 * 60 * 1000;
    return memories.filter(
      (m) => new Date(m.ts).getTime() > cutoff && m.message_type === "tool_call"
    ).length;
  }, [memories]);

  const isDragging = draggingId !== null;

  return (
    <div className="mini-container">
      <GrainTexture
        width={320}
        height={480}
        density={0.005}
        seed={31}
        noiseIntensity={12}
      />

      {/* Title bar */}
      <div className="mini-titlebar">
        <EywaLogoMono size={14} className="mini-logo" />
        <button
          className="mini-titlebar-name mini-titlebar-name-btn"
          onClick={() => setShowRoomPicker((p) => !p)}
          title="Switch room"
        >
          {room?.name ?? room?.slug ?? "\u2014"}
          <span className="mini-room-arrow">{showRoomPicker ? "\u25B4" : "\u25BE"}</span>
        </button>
        <span className="mini-titlebar-stats" style={{ marginLeft: "auto" }}>
          {activeCount}/{agents.length}
          {callsLast10m > 0 ? ` ${callsLast10m}c` : ""}
        </span>
        <button
          className="mini-qr-btn"
          onClick={() => setShowQr((p) => !p)}
          title="Show QR code"
        >
          {showQr ? "\u2715" : "QR"}
        </button>
      </div>

      {/* Room picker dropdown */}
      {showRoomPicker && (
        <MiniRoomPicker
          currentSlug={slug ?? ""}
          onClose={() => setShowRoomPicker(false)}
        />
      )}

      {/* QR overlay */}
      {showQr && roomUrl && (
        <div className="mini-qr-overlay" onClick={() => setShowQr(false)}>
          <div className="mini-qr-card" onClick={(e) => e.stopPropagation()}>
            <QRCodeSVG
              value={roomUrl}
              size={200}
              bgColor="#0d1117"
              fgColor="#e6edf3"
              level="L"
            />
            <span className="mini-qr-label">Scan to join</span>
            <code className="mini-qr-url">{roomUrl}</code>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="mini-content">
        {/* Agent strip (drop zone) */}
        <div className={`mini-strip${isDragging ? " drag-active" : ""}`}>
          {agents.length === 0 && (
            <div className="mini-empty">no agents yet</div>
          )}
          {agents.slice(0, 6).map((info) => (
            <div
              key={info.agent}
              className={`mini-strip-agent${dropTarget === info.agent ? " drop-hover" : ""}`}
              onDragOver={(e) => handleDragOver(e, info.agent)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, info.agent)}
            >
              <PixelCreature name={info.agent} size={18} />
              <span className={`mini-strip-name${info.isActive ? " mini-strip-name-active" : ""}`}>
                {getShort(info.agent)}
              </span>
              <span className="mini-strip-status">
                <span
                  className="mini-strip-dot"
                  style={{ background: info.isActive ? "#4ade80" : "#334155" }}
                />
                {timeAgo(info.lastTs)}
              </span>
            </div>
          ))}
          {agents.length > 6 && (
            <span className="mini-strip-overflow">+{agents.length - 6}</span>
          )}
        </div>

        {/* Mini graph */}
        <MiniGraph
          memories={memories}
          agents={agents}
          getShort={getShort}
          onDotTap={handleDotTap}
          selectedDotId={dotInfo?.memory.id ?? null}
        />

        {/* Dot info tooltip (between graph and feed) */}
        {dotInfo && (
          <div className="mini-dot-info" onClick={() => setDotInfo(null)}>
            <PixelCreature name={dotInfo.memory.agent} size={14} />
            <span className="mini-dot-info-agent" style={{ color: agentColor(dotInfo.memory.agent) }}>
              {getShort(dotInfo.memory.agent)}
            </span>
            <span className="mini-dot-info-type" style={{ color: TYPE_COLORS[dotInfo.memory.message_type] ?? "#999" }}>
              {typeLabel(dotInfo.memory.message_type)}
            </span>
            <span className="mini-dot-info-time">{timeAgo(dotInfo.memory.ts)}</span>
            <div className="mini-dot-info-content">{dotInfo.memory.content.slice(0, 120)}</div>
          </div>
        )}

        {/* Activity feed (always visible, draggable + tappable rows) */}
        <MiniActivityFeed
          memories={memories}
          getShort={getShort}
          draggingId={draggingId}
          onDragStart={(m) => setDraggingId(m.id)}
          onDragEnd={() => { setDraggingId(null); setDropTarget(null); }}
          expandedId={expandedRow}
          onTapRow={handleRowTap}
        />
      </div>

      {/* Toast */}
      {toast && (
        <div className="mini-toast">{toast}</div>
      )}
    </div>
  );
}
