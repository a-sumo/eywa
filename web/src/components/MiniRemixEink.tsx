import { useMemo, useEffect } from "react";
import { useRealtimeMemories } from "../hooks/useRealtimeMemories";
import { useRoomContext } from "../context/RoomContext";
import type { Memory } from "../lib/supabase";
import { ANIMAL_SPRITES, CUTE_COUNT } from "./animalSprites";

/* ── E-Ink 7-Color Palette (soft pastels for web preview) ── */

const EINK = {
  black: "#6B7280",    // soft gray for text/lines
  white: "#FFFDF8",    // warm cream
  red: "#E8A0A0",      // soft rose
  green: "#A8D8B4",    // soft sage
  blue: "#A0C4E8",     // soft sky
  yellow: "#F0E6A0",   // soft butter
  orange: "#F0C8A0",   // soft peach
} as const;

// Pastel creature colors - soft and cozy
const EINK_AGENT_COLORS = [
  "#F4B4C4",  // blush pink
  "#B4D4F4",  // baby blue
  "#F4D4B4",  // warm peach
  "#B4E4C4",  // mint green
  "#E4D4F4",  // soft lavender
  "#F4E4B4",  // pale yellow
];

function einkAgentColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return EINK_AGENT_COLORS[Math.abs(hash) % EINK_AGENT_COLORS.length];
}

/* ── Type helpers ── */

type TypeCategory = "user" | "assistant" | "tool";

const EINK_CATEGORY_COLORS: Record<TypeCategory, string> = {
  user: EINK.blue,
  assistant: EINK.green,
  tool: EINK.orange,
};

function typeToCategory(t: string): TypeCategory | null {
  if (t === "user") return "user";
  if (t === "assistant") return "assistant";
  if (t === "tool_call" || t === "tool_result") return "tool";
  return null;
}

function typeLabel(t: string): string {
  if (t === "tool_call") return "CALL";
  if (t === "tool_result") return "RES";
  if (t === "assistant") return "ASST";
  if (t === "user") return "USR";
  return t.slice(0, 4).toUpperCase();
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

/* ── Short name: strip common prefix (e.g. "armand/bold-dove" -> "bold-dove") ── */

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

/* ── Sparkline: 8 buckets over last 60 min ── */

const SPARK_CHARS = " ▁▂▃▄▅▆▇█";
const SPARK_BUCKETS = 8;
const SPARK_WINDOW = 60 * 60 * 1000; // 1 hour

function sparkline(memories: Memory[]): string {
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
  return counts.map((c) => SPARK_CHARS[Math.round((c / max) * (SPARK_CHARS.length - 1))]).join("");
}

/* ── Session/Agent builder ── */

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

    // Find last meaningful action (assistant message or tool_call with content)
    const lastMeaningful = sorted.find(
      (m) => m.message_type === "assistant" || m.message_type === "user"
    );
    const lastAction = lastMeaningful?.content.slice(0, 60) ?? "";

    const c: TypeCounts = { user: 0, assistant: 0, tool: 0, other: 0 };
    for (const m of mems) {
      const cat = typeToCategory(m.message_type);
      if (cat) c[cat]++;
      else c.other++;
    }

    agents.push({
      agent,
      memories: sorted,
      isActive,
      lastTs,
      sessionCount: sessionIds.get(agent)?.size ?? 0,
      lastAction,
      typeCounts: c,
    });
  }

  // Sort: active first (by recency), then idle (by recency)
  agents.sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return new Date(b.lastTs).getTime() - new Date(a.lastTs).getTime();
  });

  return agents;
}

/* ── Tracking Marker for Spectacles ── */
// Asymmetric high-contrast pattern for reliable image tracking
// Placed bottom-left of e-ink display

function TrackingMarker({ size = 64 }: { size?: number }) {
  // Asymmetric pattern - unique orientation, high contrast
  // Grid: 8x8, 1=filled, 0=empty
  const pattern = [
    [1,1,1,1,1,1,1,1],
    [1,0,0,0,0,0,0,1],
    [1,0,1,1,0,1,0,1],
    [1,0,1,0,0,1,0,1],
    [1,0,0,0,1,1,0,1],
    [1,0,1,0,0,0,0,1],
    [1,0,0,1,0,1,0,1],
    [1,1,1,1,1,1,1,1],
  ];

  const cellSize = size / 8;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 8 8"
      className="eink-tracking-marker"
      shapeRendering="crispEdges"
    >
      {/* White background */}
      <rect x={0} y={0} width={8} height={8} fill={EINK.white} />
      {/* Pattern cells */}
      {pattern.flatMap((row, y) =>
        row.map((cell, x) =>
          cell === 1 ? (
            <rect
              key={`${y}-${x}`}
              x={x}
              y={y}
              width={1}
              height={1}
              fill={EINK.black}
            />
          ) : null
        )
      )}
      {/* Corner marker for orientation (asymmetric) */}
      <rect x={1} y={1} width={2} height={2} fill={EINK.black} />
    </svg>
  );
}

/* ── Pixel Animal (E-Ink variant) ── */

function getAnimalSprite(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 7) - hash + name.charCodeAt(i)) | 0;
  }
  const roll = Math.abs(hash >> 4) % 4;
  if (roll > 0) {
    return ANIMAL_SPRITES[Math.abs(hash) % CUTE_COUNT];
  }
  return ANIMAL_SPRITES[CUTE_COUNT + (Math.abs(hash) % (ANIMAL_SPRITES.length - CUTE_COUNT))];
}

function EinkPixelCreature({ name, size = 18 }: { name: string; size?: number }) {
  const sprite = useMemo(() => getAnimalSprite(name), [name]);
  const color = einkAgentColor(name);
  const ROWS = sprite.grid.length;
  const COLS = sprite.grid[0].length;
  // 0=empty, 1=black (eyes), 2=black (accents), 3=agent color (body)
  const fills = ["", EINK.black, EINK.black, color];

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

/* ── Sparkline SVG (bar chart, e-ink safe) ── */

function EinkSparkline({ memories }: { memories: Memory[] }) {
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
  const barW = 6;
  const gap = 1;
  const h = 14;
  const w = SPARK_BUCKETS * (barW + gap) - gap;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="eink-sparkline">
      {counts.map((c, i) => {
        const barH = Math.max(1, Math.round((c / max) * (h - 2)));
        return (
          <rect
            key={i}
            x={i * (barW + gap)}
            y={h - barH}
            width={barW}
            height={barH}
            fill={EINK.black}
            shapeRendering="crispEdges"
          />
        );
      })}
    </svg>
  );
}

/* ── Activity summary for header ── */

function recentCallCount(memories: Memory[], windowMs: number): number {
  const cutoff = Date.now() - windowMs;
  return memories.filter(
    (m) => new Date(m.ts).getTime() > cutoff && m.message_type === "tool_call"
  ).length;
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

  const agents = useMemo(() => buildAgents(memories), [memories]);
  const activeAgents = agents.filter((a) => a.isActive);
  const idleAgents = agents.filter((a) => !a.isActive);

  const getShort = useMemo(
    () => shortName(agents.map((a) => a.agent)),
    [agents]
  );

  const callsLast10m = useMemo(
    () => recentCallCount(memories, 10 * 60 * 1000),
    [memories]
  );

  // Feed: sorted newest first
  const feed = useMemo(() => {
    return [...memories]
      .filter((m) => {
        const cat = typeToCategory(m.message_type);
        return cat !== null;
      })
      .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
      .slice(0, 22);
  }, [memories]);

  // Sparkline text for the header (all agents combined)
  const headerSparkText = useMemo(() => sparkline(memories), [memories]);

  // Smart truncate at word boundary
  const truncate = (text: string, maxLen: number) => {
    if (text.length <= maxLen) return text;
    const truncated = text.slice(0, maxLen);
    const lastSpace = truncated.lastIndexOf(" ");
    return (lastSpace > maxLen * 0.6 ? truncated.slice(0, lastSpace) : truncated) + "...";
  };

  return (
    <div className="eink-container">
      {/* Header */}
      <div className="eink-header">
        <span className="eink-header-room">
          {room?.name ?? room?.slug ?? "-"}
        </span>
        <span className="eink-header-counts">
          {activeAgents.length}/{agents.length}
        </span>
        <span className="eink-header-spark">{headerSparkText}</span>
        <span className="eink-header-calls">
          {callsLast10m > 0 ? `${callsLast10m} calls/10m` : "quiet"}
        </span>
        <span className="eink-header-time">{clockTime()}</span>
      </div>

      {/* Stacked layout: Agents strip + Full-width feed */}
      <div className="eink-body-stacked">
        {/* Top: Active agents strip */}
        {activeAgents.length > 0 && (
          <div className="eink-agents-strip">
            {activeAgents.slice(0, 4).map((info) => (
              <div key={info.agent} className="eink-agent-card">
                <div className="eink-agent-card-header">
                  <EinkPixelCreature name={info.agent} size={20} />
                  <span className="eink-agent-card-name">{getShort(info.agent)}</span>
                  <span className="eink-agent-card-ago">{timeAgo(info.lastTs)}</span>
                </div>
                {info.lastAction && (
                  <div className="eink-agent-card-task">{truncate(info.lastAction, 40)}</div>
                )}
                <EinkSparkline memories={info.memories} />
              </div>
            ))}
          </div>
        )}

        {/* Idle count (compact) */}
        {idleAgents.length > 0 && (
          <div className="eink-idle-strip">
            <span className="eink-idle-label">IDLE</span>
            {idleAgents.slice(0, 8).map((info) => (
              <span key={info.agent} className="eink-idle-chip">
                <EinkPixelCreature name={info.agent} size={10} />
                {getShort(info.agent)}
              </span>
            ))}
            {idleAgents.length > 8 && (
              <span className="eink-idle-more">+{idleAgents.length - 8}</span>
            )}
          </div>
        )}

        {/* Full-width activity feed */}
        <div className="eink-feed-full">
          <div className="eink-feed-header-row">
            <span className="eink-section-title">RECENT ACTIVITY</span>
          </div>
          {feed.length === 0 && (
            <div className="eink-empty">no activity</div>
          )}
          {feed.slice(0, 8).map((m, idx) => {
            const cat = typeToCategory(m.message_type);
            return (
              <div key={m.id} className="eink-feed-item">
                <div className="eink-feed-meta">
                  <EinkPixelCreature name={m.agent} size={12} />
                  <span className="eink-feed-agent">{getShort(m.agent)}</span>
                  <span
                    className="eink-feed-badge"
                    style={{ background: cat ? EINK_CATEGORY_COLORS[cat] : EINK.white }}
                  >
                    {typeLabel(m.message_type)}
                  </span>
                  <span className="eink-feed-time">{timeAgo(m.ts)}</span>
                </div>
                <div className="eink-feed-text">
                  {truncate(m.content, idx < 2 ? 180 : 100)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom: Tracking marker for Spectacles */}
      <div className="eink-footer">
        <TrackingMarker size={40} />
        <span className="eink-footer-label">REMIX</span>
      </div>
    </div>
  );
}
