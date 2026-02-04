import { useMemo, useEffect } from "react";
import { useRealtimeMemories } from "../hooks/useRealtimeMemories";
import { useRoomContext } from "../context/RoomContext";
import type { Memory } from "../lib/supabase";
import { ANIMAL_SPRITES } from "./animalSprites";

/* ── E-Ink 7-Color Palette ── */

const EINK = {
  black: "#000000",
  white: "#FFFFFF",
  red: "#FF0000",
  green: "#00FF00",
  blue: "#0000FF",
  yellow: "#FFFF00",
  orange: "#FF8000",
} as const;

const EINK_AGENT_COLORS = [EINK.red, EINK.green, EINK.blue, EINK.yellow, EINK.orange];

function einkAgentColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return EINK_AGENT_COLORS[Math.abs(hash) % EINK_AGENT_COLORS.length];
}

/* ── Type helpers (copied from MiniRemix) ── */

type TypeCategory = "user" | "assistant" | "tool";

const EINK_CATEGORY_COLORS: Record<TypeCategory, string> = {
  user: EINK.blue,
  assistant: EINK.green,
  tool: EINK.yellow,
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

/* ── Time helpers ── */

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function clockTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/* ── Session builder ── */

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

/* ── Pixel Animal (E-Ink variant) ── */

interface TypeCounts {
  user: number;
  assistant: number;
  tool: number;
  other: number;
}

function getAnimalSprite(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 7) - hash + name.charCodeAt(i)) | 0;
  }
  return ANIMAL_SPRITES[Math.abs(hash) % ANIMAL_SPRITES.length];
}

function EinkPixelCreature({ name, size = 20 }: { name: string; size?: number }) {
  const sprite = useMemo(() => getAnimalSprite(name), [name]);
  const color = einkAgentColor(name);
  const ROWS = sprite.grid.length;
  const COLS = sprite.grid[0].length;

  // Map: 0=empty, 1=black, 2=agentColor, 3=white
  const fills = ["", EINK.black, color, EINK.white];

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${COLS} ${ROWS}`}
      preserveAspectRatio="xMidYMid meet"
      shapeRendering="crispEdges"
      className="eink-pixel-creature"
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
              shapeRendering="crispEdges"
            />
          );
        })
      )}
    </svg>
  );
}

/* ── E-Ink Activity Bar ── */

function EinkActivityBar({ counts }: { counts: TypeCounts }) {
  const total = counts.user + counts.assistant + counts.tool + counts.other;
  if (total === 0) return <div className="eink-bar eink-bar-empty" />;

  const segments = [
    { key: "user", color: EINK_CATEGORY_COLORS.user, n: counts.user },
    { key: "assistant", color: EINK_CATEGORY_COLORS.assistant, n: counts.assistant },
    { key: "tool", color: EINK_CATEGORY_COLORS.tool, n: counts.tool },
  ].filter((s) => s.n > 0);

  return (
    <div className="eink-bar">
      {segments.map((s) => (
        <div
          key={s.key}
          className="eink-bar-seg"
          style={{ width: `${(s.n / total) * 100}%`, background: s.color }}
        />
      ))}
    </div>
  );
}

/* ── Main Component ── */

export function MiniRemixEink() {
  const { room } = useRoomContext();
  const { memories } = useRealtimeMemories(room?.id ?? null, 200);

  // Auto-reload every 60s for e-ink refresh
  useEffect(() => {
    const id = setInterval(() => window.location.reload(), 60_000);
    return () => clearInterval(id);
  }, []);

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

  // Feed: sorted newest first
  const feed = useMemo(() => {
    return [...memories]
      .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
      .slice(0, 18);
  }, [memories]);

  return (
    <div className="eink-container">
      {/* Header */}
      <div className="eink-header">
        <span className="eink-header-room">
          {room?.name ?? room?.slug ?? "—"}
        </span>
        <span className="eink-header-stats">
          {agentSessions.size} agents | {memories.length} mem
        </span>
        <span className="eink-header-legend">
          <span className="eink-legend-dot" style={{ background: EINK.blue }} />
          <span>USR</span>
          <span className="eink-legend-dot" style={{ background: EINK.green }} />
          <span>AST</span>
          <span className="eink-legend-dot" style={{ background: EINK.yellow }} />
          <span>TOL</span>
        </span>
        <span className="eink-header-time">{clockTime()}</span>
      </div>

      {/* Body: two columns */}
      <div className="eink-body">
        {/* Left: Agents */}
        <div className="eink-left">
          <div className="eink-section-title">
            AGENTS ({agentSessions.size})
          </div>
          {agents.length === 0 && (
            <div className="eink-empty">no agents</div>
          )}
          {agents.slice(0, 8).map(([agent, sessions]) => {
            const counts = agentTypeCounts.get(agent)!;
            const total = counts.user + counts.assistant + counts.tool + counts.other;
            const isActive = sessions.some((s) => s.isActive);
            const lastTs = sessions[0]?.lastTs;

            return (
              <div key={agent} className="eink-agent-card">
                <div className="eink-agent-top">
                  <EinkPixelCreature name={agent} size={18} />
                  <span className="eink-agent-name">{agent}</span>
                  <span className={`eink-agent-badge ${isActive ? "active" : "idle"}`}>
                    {isActive ? "ACTIVE" : "IDLE"}
                  </span>
                </div>
                <div className="eink-agent-stats">
                  {sessions.length}s | {total}m | {lastTs ? timeAgo(lastTs) : "—"}
                </div>
                <EinkActivityBar counts={counts} />
              </div>
            );
          })}
        </div>

        {/* Gutter */}
        <div className="eink-gutter" />

        {/* Right: Feed */}
        <div className="eink-right">
          <div className="eink-section-title">
            RECENT ACTIVITY ({memories.length})
          </div>
          {feed.length === 0 && (
            <div className="eink-empty">no activity</div>
          )}
          {feed.map((m) => {
            const cat = typeToCategory(m.message_type);
            const dotColor = einkAgentColor(m.agent);
            return (
              <div key={m.id} className="eink-feed-row">
                <span className="eink-feed-time">{timeAgo(m.ts)}</span>
                <span className="eink-feed-dot" style={{ background: dotColor }} />
                <span className="eink-feed-initial">
                  {m.agent.charAt(0).toUpperCase()}
                </span>
                <span className="eink-feed-type" style={{ color: cat ? EINK_CATEGORY_COLORS[cat] : EINK.black }}>
                  {typeLabel(m.message_type)}
                </span>
                <span className="eink-feed-content">
                  {m.content.slice(0, 42)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
