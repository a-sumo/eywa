import { useState, useMemo, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useRealtimeMemories } from "../hooks/useRealtimeMemories";
import { useRoomContext } from "../context/RoomContext";
import type { Memory } from "../lib/supabase";
import { getAvatar } from "./avatars";

/* ── Palette ── */

const AGENT_PALETTE = [
  "#E64980", "#CC5DE8", "#845EF7", "#5C7CFA",
  "#339AF0", "#22B8CF", "#20C997", "#51CF66",
  "#94D82D", "#FCC419", "#FF922B", "#E8590C",
];

function agentColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AGENT_PALETTE[Math.abs(hash) % AGENT_PALETTE.length];
}

const TYPE_COLORS: Record<string, string> = {
  user: "#4C6EF5",
  assistant: "#40C057",
  tool_call: "#FAB005",
  tool_result: "#FAB005",
};

type TypeCategory = "user" | "assistant" | "tool";

const CATEGORY_COLORS: Record<TypeCategory, string> = {
  user: "#4C6EF5",
  assistant: "#40C057",
  tool: "#FAB005",
};

function typeToCategory(t: string): TypeCategory | null {
  if (t === "user") return "user";
  if (t === "assistant") return "assistant";
  if (t === "tool_call" || t === "tool_result") return "tool";
  return null;
}

function typeLabel(t: string): string {
  if (t === "tool_call") return "call";
  if (t === "tool_result") return "res";
  if (t === "assistant") return "asst";
  return t.slice(0, 4);
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

/* Strip common prefix ("armand/bold-dove" -> "bold-dove" when all share "armand/") */

function shortName(agents: string[]): (agent: string) => string {
  if (agents.length === 0) return (a) => a;
  // Find the most common prefix before "/"
  const prefixCounts = new Map<string, number>();
  for (const a of agents) {
    const slash = a.indexOf("/");
    if (slash > 0) {
      const p = a.slice(0, slash + 1);
      prefixCounts.set(p, (prefixCounts.get(p) ?? 0) + 1);
    }
  }
  // Strip prefix if majority of agents share it
  let common = "";
  for (const [p, count] of prefixCounts) {
    if (count > agents.length / 2) { common = p; break; }
  }
  return (agent: string) => common && agent.startsWith(common) ? agent.slice(common.length) : agent;
}

/* ── Sparkline (SVG bar chart) ── */

const SPARK_BUCKETS = 8;
const SPARK_WINDOW = 60 * 60 * 1000; // 1 hour

function MiniSparkline({ memories, color }: { memories: Memory[]; color: string }) {
  const now = Date.now();
  const bucketSize = SPARK_WINDOW / SPARK_BUCKETS;
  const counts = new Array(SPARK_BUCKETS).fill(0);

  for (const m of memories) {
    const age = now - new Date(m.ts).getTime();
    if (age > SPARK_WINDOW || age < 0) continue;
    const idx = Math.min(SPARK_BUCKETS - 1, Math.floor((SPARK_WINDOW - age) / bucketSize));
    counts[idx]++;
  }

  const max = Math.max(1, ...counts);
  const barW = 4;
  const gap = 1;
  const h = 12;
  const w = SPARK_BUCKETS * (barW + gap) - gap;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="mini-sparkline">
      {counts.map((c, i) => {
        const barH = Math.max(c > 0 ? 2 : 0, Math.round((c / max) * h));
        return (
          <rect
            key={i}
            x={i * (barW + gap)}
            y={h - barH}
            width={barW}
            height={barH}
            fill={color}
            opacity={0.7}
            rx={0.5}
          />
        );
      })}
    </svg>
  );
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

/* ── Legend ── */

function MiniLegend() {
  return (
    <div className="mini-legend">
      <span className="mini-legend-dot" style={{ background: CATEGORY_COLORS.user }} />
      <span>usr</span>
      <span className="mini-legend-dot" style={{ background: CATEGORY_COLORS.assistant }} />
      <span>ast</span>
      <span className="mini-legend-dot" style={{ background: CATEGORY_COLORS.tool }} />
      <span>tol</span>
    </div>
  );
}

/* ── Detail Panel ── */

function MiniDetailPanel({
  agent,
  sessions,
  getShort,
}: {
  agent: string;
  sessions: { sessionId: string; memories: Memory[]; lastTs: string }[];
  getShort: (a: string) => string;
}) {
  const [idx, setIdx] = useState(0);
  const session = sessions[idx] ?? sessions[0];
  if (!session) return null;

  return (
    <div className="mini-detail">
      <div className="mini-detail-header">
        <PixelCreature name={agent} size={14} />
        <span className="mini-detail-agent" style={{ color: agentColor(agent) }}>
          {getShort(agent)}
        </span>
        <span className="mini-detail-sid">{session.sessionId.slice(0, 8)}</span>
        <span className="mini-detail-meta">
          {session.memories.length}m - {timeAgo(session.lastTs)}
        </span>
      </div>

      {sessions.length > 1 && (
        <div className="mini-detail-tabs">
          {sessions.map((s, i) => (
            <button
              key={s.sessionId}
              className={`mini-detail-tab ${i === idx ? "active" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                setIdx(i);
              }}
            >
              <span
                className="mini-detail-tab-dot"
                style={{
                  background: i === idx
                    ? (() => {
                        const cat = typeToCategory(
                          s.memories[0]?.message_type ?? ""
                        );
                        return cat ? CATEGORY_COLORS[cat] : "#CED4DA";
                      })()
                    : "transparent",
                  borderColor: (() => {
                    const cat = typeToCategory(
                      s.memories[0]?.message_type ?? ""
                    );
                    return cat ? CATEGORY_COLORS[cat] : "#CED4DA";
                  })(),
                }}
              />
              {s.sessionId.slice(0, 4)}
            </button>
          ))}
        </div>
      )}

      <div className="mini-detail-list">
        {session.memories.map((m) => (
          <div className="mini-detail-row" key={m.id}>
            <span
              className="mini-detail-badge"
              style={{
                background: (TYPE_COLORS[m.message_type] ?? "#CED4DA") + "22",
                color: TYPE_COLORS[m.message_type] ?? "#999",
              }}
            >
              {typeLabel(m.message_type)}
            </span>
            <span className="mini-detail-content">
              {m.content.slice(0, 80)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Activity Feed ── */

function MiniActivityFeed({
  memories,
  filterAgent,
  getShort,
}: {
  memories: Memory[];
  filterAgent: string | null;
  getShort: (a: string) => string;
}) {
  const sorted = useMemo(() => {
    const list = filterAgent
      ? memories.filter((m) => m.agent === filterAgent)
      : memories;
    return [...list]
      .filter((m) => typeToCategory(m.message_type) !== null)
      .sort(
        (a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime()
      );
  }, [memories, filterAgent]);

  const items = sorted.slice(0, 40);

  return (
    <div className="mini-feed">
      <div className="mini-feed-header">
        {filterAgent ? getShort(filterAgent) : "feed"}
        <span className="mini-feed-count">{sorted.length}</span>
      </div>
      <div className="mini-feed-list">
        {items.map((m) => (
          <div className="mini-feed-row" key={m.id}>
            <span className="mini-feed-time">{timeAgo(m.ts)}</span>
            <span
              className="mini-feed-dot"
              style={{ background: agentColor(m.agent) }}
            />
            <span
              className="mini-feed-type"
              style={{ color: TYPE_COLORS[m.message_type] ?? "#999" }}
            >
              {typeLabel(m.message_type)}
            </span>
            <span className="mini-feed-content">{m.content.slice(0, 60)}</span>
          </div>
        ))}
        {items.length === 0 && (
          <div className="mini-empty">no activity</div>
        )}
      </div>
    </div>
  );
}

/* ── Main ── */

export function MiniRemix() {
  const { room } = useRoomContext();
  const { memories } = useRealtimeMemories(room?.id ?? null, 200);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);

  const agents = useMemo(() => buildAgents(memories), [memories]);
  const activeAgents = agents.filter((a) => a.isActive);
  const idleAgents = agents.filter((a) => !a.isActive);

  const getShort = useMemo(
    () => shortName(agents.map((a) => a.agent)),
    [agents]
  );

  // Build session lists for the detail panel
  const agentSessions = useMemo(() => {
    const byAgent = new Map<string, Map<string, Memory[]>>();
    for (const m of memories) {
      let agentMap = byAgent.get(m.agent);
      if (!agentMap) {
        agentMap = new Map();
        byAgent.set(m.agent, agentMap);
      }
      let arr = agentMap.get(m.session_id);
      if (!arr) {
        arr = [];
        agentMap.set(m.session_id, arr);
      }
      arr.push(m);
    }

    const result = new Map<string, { sessionId: string; memories: Memory[]; lastTs: string }[]>();
    for (const [agent, sessionMap] of byAgent) {
      const sessions: { sessionId: string; memories: Memory[]; lastTs: string }[] = [];
      for (const [sessionId, mems] of sessionMap) {
        const sorted = mems.sort(
          (a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime()
        );
        sessions.push({ sessionId, memories: sorted, lastTs: sorted[0]?.ts ?? "" });
      }
      sessions.sort((a, b) => new Date(b.lastTs).getTime() - new Date(a.lastTs).getTime());
      result.set(agent, sessions);
    }
    return result;
  }, [memories]);

  const handleTapAgent = useCallback((agent: string) => {
    setSelectedAgent((prev) => (prev === agent ? null : agent));
  }, []);

  const selectedSessions = selectedAgent
    ? agentSessions.get(selectedAgent) ?? []
    : [];

  const roomUrl = room
    ? `${window.location.origin}/r/${room.slug}`
    : "";

  const callsLast10m = useMemo(() => {
    const cutoff = Date.now() - 10 * 60 * 1000;
    return memories.filter(
      (m) => new Date(m.ts).getTime() > cutoff && m.message_type === "tool_call"
    ).length;
  }, [memories]);

  return (
    <div className="mini-container">
      {/* Title bar */}
      <div className="mini-titlebar">
        <span className="mini-led" />
        <span className="mini-titlebar-name">
          {room?.name ?? room?.slug ?? "\u2014"}
        </span>
        <MiniLegend />
        <span className="mini-titlebar-stats">
          {activeAgents.length}/{agents.length}
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
      <div className={`mini-content ${selectedAgent ? "has-detail" : ""}`}>
        {/* Agent list */}
        <div className="mini-agents">
          {agents.length === 0 && (
            <div className="mini-empty">no agents yet</div>
          )}

          {/* Active agents - full rows with sparklines */}
          {activeAgents.map((info) => {
            const color = agentColor(info.agent);
            return (
              <div
                key={info.agent}
                className={`mini-agent-row ${selectedAgent === info.agent ? "selected" : ""}`}
                onClick={() => handleTapAgent(info.agent)}
              >
                <div className="mini-agent-info">
                  <PixelCreature name={info.agent} size={16} />
                  <span className="mini-agent-name" style={{ color }}>
                    {getShort(info.agent)}
                  </span>
                  <span className="mini-agent-spacer" />
                  <MiniSparkline memories={info.memories} color={color} />
                  <span className="mini-agent-ago">{timeAgo(info.lastTs)}</span>
                </div>
                {info.lastAction && (
                  <div className="mini-agent-action">{info.lastAction}</div>
                )}
              </div>
            );
          })}

          {/* Idle section header */}
          {idleAgents.length > 0 && (
            <div className="mini-idle-header">idle ({idleAgents.length})</div>
          )}

          {/* Idle agents - compact rows, capped at 8 */}
          {idleAgents.slice(0, 8).map((info) => {
            const color = agentColor(info.agent);
            return (
              <div
                key={info.agent}
                className={`mini-agent-row mini-agent-idle ${selectedAgent === info.agent ? "selected" : ""}`}
                onClick={() => handleTapAgent(info.agent)}
              >
                <div className="mini-agent-info">
                  <PixelCreature name={info.agent} size={14} />
                  <span className="mini-agent-name mini-agent-name-idle" style={{ color }}>
                    {getShort(info.agent)}
                  </span>
                  <span className="mini-agent-spacer" />
                  <span className="mini-agent-ago">{timeAgo(info.lastTs)}</span>
                </div>
              </div>
            );
          })}
          {idleAgents.length > 8 && (
            <div className="mini-idle-overflow">
              +{idleAgents.length - 8} more
            </div>
          )}
        </div>

        {/* Detail panel (when agent tapped) */}
        {selectedAgent && selectedSessions.length > 0 && (
          <MiniDetailPanel
            agent={selectedAgent}
            sessions={selectedSessions}
            getShort={getShort}
          />
        )}

        {/* Activity feed (when no agent selected) */}
        {!selectedAgent && (
          <MiniActivityFeed memories={memories} filterAgent={null} getShort={getShort} />
        )}
      </div>
    </div>
  );
}
