import { useState, useMemo, useCallback } from "react";
import { useRealtimeMemories } from "../hooks/useRealtimeMemories";
import { useRoomContext } from "../context/RoomContext";
import type { Memory } from "../lib/supabase";
import { ANIMAL_SPRITES } from "./animalSprites";

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

interface SessionInfo {
  agent: string;
  sessionId: string;
  memories: Memory[];
  isActive: boolean;
  lastTs: string;
}

function buildSessions(memories: Memory[]): Map<string, SessionInfo[]> {
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

  const result = new Map<string, SessionInfo[]>();
  const now = Date.now();
  for (const [agent, sessionMap] of byAgent) {
    const sessions: SessionInfo[] = [];
    for (const [sessionId, mems] of sessionMap) {
      const sorted = mems.sort(
        (a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime()
      );
      const lastTs = sorted[0]?.ts ?? "";
      sessions.push({
        agent,
        sessionId,
        memories: sorted,
        isActive: now - new Date(lastTs).getTime() < 5 * 60 * 1000,
        lastTs,
      });
    }
    sessions.sort(
      (a, b) => new Date(b.lastTs).getTime() - new Date(a.lastTs).getTime()
    );
    result.set(agent, sessions);
  }
  return result;
}

/* ── Pixel Animal (Twemoji-derived) ── */

function getAnimalSprite(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 7) - hash + name.charCodeAt(i)) | 0;
  }
  return ANIMAL_SPRITES[Math.abs(hash) % ANIMAL_SPRITES.length];
}

function PixelCreature({ name, size = 20 }: { name: string; size?: number }) {
  const sprite = useMemo(() => getAnimalSprite(name), [name]);
  const color = agentColor(name);
  const ROWS = sprite.grid.length;
  const COLS = sprite.grid[0].length;

  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);

  const dark = `rgb(${Math.round(r * 0.25)},${Math.round(g * 0.25)},${Math.round(b * 0.25)})`;
  const mid = color;
  const light = `rgb(${Math.min(255, Math.round(r * 1.3 + 40))},${Math.min(255, Math.round(g * 1.3 + 40))},${Math.min(255, Math.round(b * 1.3 + 40))})`;

  const fills = ["", dark, mid, light];

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${COLS} ${ROWS}`}
      preserveAspectRatio="xMidYMid meet"
      className="mini-pixel-creature"
    >
      {sprite.grid.flatMap((row, ry) =>
        row.map((cell, cx) => {
          if (cell === 0) return null;
          return (
            <rect
              key={`${ry}-${cx}`}
              x={cx}
              y={ry}
              width={1}
              height={1}
              fill={fills[cell]}
            />
          );
        })
      )}
    </svg>
  );
}

/* ── Activity Bar ── */

interface TypeCounts {
  user: number;
  assistant: number;
  tool: number;
  other: number;
}

function MiniActivityBar({ counts }: { counts: TypeCounts }) {
  const total = counts.user + counts.assistant + counts.tool + counts.other;
  if (total === 0) return <div className="mini-bar mini-bar-empty" />;

  const segments = [
    { key: "user", color: CATEGORY_COLORS.user, n: counts.user },
    { key: "assistant", color: CATEGORY_COLORS.assistant, n: counts.assistant },
    { key: "tool", color: CATEGORY_COLORS.tool, n: counts.tool },
    { key: "other", color: "#CED4DA", n: counts.other },
  ].filter((s) => s.n > 0);

  return (
    <div className="mini-bar">
      {segments.map((s) => (
        <div
          key={s.key}
          className="mini-bar-seg"
          style={{ width: `${(s.n / total) * 100}%`, background: s.color }}
        />
      ))}
    </div>
  );
}

/* ── Legend (static, non-interactive) ── */

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
}: {
  agent: string;
  sessions: SessionInfo[];
}) {
  const [idx, setIdx] = useState(0);
  const session = sessions[idx] ?? sessions[0];
  if (!session) return null;

  return (
    <div className="mini-detail">
      <div className="mini-detail-header">
        <PixelCreature name={agent} size={14} />
        <span className="mini-detail-agent" style={{ color: agentColor(agent) }}>
          {agent}
        </span>
        <span className="mini-detail-sid">{session.sessionId.slice(0, 8)}</span>
        <span className="mini-detail-meta">
          {session.memories.length}m · {timeAgo(session.lastTs)}
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
}: {
  memories: Memory[];
  filterAgent: string | null;
}) {
  const sorted = useMemo(() => {
    const list = filterAgent
      ? memories.filter((m) => m.agent === filterAgent)
      : memories;
    return [...list].sort(
      (a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime()
    );
  }, [memories, filterAgent]);

  const items = sorted.slice(0, 40);

  return (
    <div className="mini-feed">
      <div className="mini-feed-header">
        {filterAgent ? `${filterAgent}` : "feed"}
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

  const agentSessions = useMemo(() => buildSessions(memories), [memories]);
  const agents = Array.from(agentSessions.entries());

  const agentTypeCounts = useMemo(() => {
    const result = new Map<string, TypeCounts>();
    for (const [agent, sessions] of agentSessions) {
      const c: TypeCounts = { user: 0, assistant: 0, tool: 0, other: 0 };
      for (const s of sessions) {
        for (const m of s.memories) {
          const cat = typeToCategory(m.message_type);
          if (cat) c[cat]++;
          else c.other++;
        }
      }
      result.set(agent, c);
    }
    return result;
  }, [agentSessions]);

  const handleTapAgent = useCallback((agent: string) => {
    setSelectedAgent((prev) => (prev === agent ? null : agent));
  }, []);

  const selectedSessions = selectedAgent
    ? agentSessions.get(selectedAgent) ?? []
    : [];

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
          {agentSessions.size}a · {memories.length}m
        </span>
      </div>

      {/* Content */}
      <div className={`mini-content ${selectedAgent ? "has-detail" : ""}`}>
        {/* Agent list */}
        <div className="mini-agents">
          {agents.length === 0 && (
            <div className="mini-empty">no agents yet</div>
          )}
          {agents.map(([agent, sessions]) => {
            const counts = agentTypeCounts.get(agent)!;
            const total =
              counts.user + counts.assistant + counts.tool + counts.other;
            const isActive = sessions.some((s) => s.isActive);
            const lastTs = sessions[0]?.lastTs;

            return (
              <div
                key={agent}
                className={`mini-agent-row ${selectedAgent === agent ? "selected" : ""}`}
                onClick={() => handleTapAgent(agent)}
              >
                <div className="mini-agent-info">
                  <PixelCreature name={agent} size={20} />
                  <span
                    className="mini-agent-name"
                    style={{ color: agentColor(agent) }}
                  >
                    {agent}
                  </span>
                  <span className="mini-agent-spacer" />
                  <span
                    className={`mini-status-dot ${isActive ? "active" : ""}`}
                  />
                  <span className="mini-agent-meta">
                    {sessions.length}s · {total}m ·{" "}
                    {lastTs ? timeAgo(lastTs) : "\u2014"}
                  </span>
                </div>
                <MiniActivityBar counts={counts} />
              </div>
            );
          })}
        </div>

        {/* Detail panel (when agent tapped) */}
        {selectedAgent && selectedSessions.length > 0 && (
          <MiniDetailPanel
            agent={selectedAgent}
            sessions={selectedSessions}
          />
        )}

        {/* Activity feed (when no agent selected) */}
        {!selectedAgent && (
          <MiniActivityFeed memories={memories} filterAgent={null} />
        )}
      </div>
    </div>
  );
}
