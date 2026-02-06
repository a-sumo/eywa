import { useMemo, useEffect } from "react";
import { useRealtimeMemories } from "../hooks/useRealtimeMemories";
import { useRoomContext } from "../context/RoomContext";
import type { Memory } from "../lib/supabase";
import { getAvatar } from "./avatars";
import { EywaLogoMono } from "./EywaLogo";
import { GrainTexture, EINK_RGB } from "./GrainTexture";

/* ── Dark palette (optimized for 7-color e-ink dithering) ── */

const EI = {
  bg: "#000000",
  fg: "#FFFFFF",
  cyan: "#40AAFF",
  blue: "#3366FF",
  green: "#44DD88",
  red: "#FF4466",
  orange: "#FF9944",
  dim: "#556677",
  divider: "rgba(255,255,255,0.08)",
} as const;

/* ── Type helpers ── */

type TypeCategory = "user" | "assistant" | "tool";

function typeToCategory(t: string): TypeCategory | null {
  if (t === "user") return "user";
  if (t === "assistant") return "assistant";
  if (t === "tool_call" || t === "tool_result") return "tool";
  return null;
}

function typeColor(t: string): string {
  if (t === "assistant") return EI.cyan;
  if (t === "user") return EI.green;
  if (t === "tool_call" || t === "tool_result") return EI.orange;
  return EI.dim;
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

/* ── Short name ── */

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
    if (!arr) { arr = []; byAgent.set(m.agent, arr); }
    arr.push(m);
    let sids = sessionIds.get(m.agent);
    if (!sids) { sids = new Set(); sessionIds.set(m.agent, sids); }
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
    const lastAction = lastMeaningful?.content.slice(0, 60) ?? "";
    const c: TypeCounts = { user: 0, assistant: 0, tool: 0, other: 0 };
    for (const m of mems) {
      const cat = typeToCategory(m.message_type);
      if (cat) c[cat]++; else c.other++;
    }
    agents.push({ agent, memories: sorted, isActive, lastTs, sessionCount: sessionIds.get(agent)?.size ?? 0, lastAction, typeCounts: c });
  }

  agents.sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return new Date(b.lastTs).getTime() - new Date(a.lastTs).getTime();
  });

  return agents;
}

/* ── Agent Avatar ── */

function EinkAvatar({ name, size = 18 }: { name: string; size?: number }) {
  const { avatar, hueRotate, saturate } = useMemo(() => getAvatar(name), [name]);
  return (
    <div
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        overflow: "hidden",
        filter: `hue-rotate(${hueRotate}deg) saturate(${saturate}%)`,
      }}
      className="ei-avatar"
      dangerouslySetInnerHTML={{ __html: avatar.svg }}
    />
  );
}

/* ── Activity summary ── */

function recentCallCount(memories: Memory[], windowMs: number): number {
  const cutoff = Date.now() - windowMs;
  return memories.filter(
    (m) => new Date(m.ts).getTime() > cutoff && m.message_type === "tool_call"
  ).length;
}

/* ── Main Component ── */

export function MiniEywaEink() {
  const { room } = useRoomContext();
  const { memories } = useRealtimeMemories(room?.id ?? null, 200);

  // Auto-reload every 60s for e-ink refresh
  useEffect(() => {
    const id = setInterval(() => window.location.reload(), 60_000);
    return () => clearInterval(id);
  }, []);

  const agents = useMemo(() => buildAgents(memories), [memories]);
  const activeCount = agents.filter((a) => a.isActive).length;

  const getShort = useMemo(
    () => shortName(agents.map((a) => a.agent)),
    [agents]
  );

  const callsLast10m = useMemo(
    () => recentCallCount(memories, 10 * 60 * 1000),
    [memories]
  );

  const feed = useMemo(() => {
    return [...memories]
      .filter((m) => typeToCategory(m.message_type) !== null)
      .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
      .slice(0, 14);
  }, [memories]);

  const truncate = (text: string, maxLen: number) => {
    if (text.length <= maxLen) return text;
    const truncated = text.slice(0, maxLen);
    const lastSpace = truncated.lastIndexOf(" ");
    return (lastSpace > maxLen * 0.6 ? truncated.slice(0, lastSpace) : truncated) + "...";
  };

  return (
    <div className="ei-container">
      <GrainTexture
        width={600}
        height={448}
        baseColor={[0, 0, 0]}
        palette={EINK_RGB}
        density={0.003}
        seed={77}
        noiseIntensity={10}
      />

      {/* Header bar */}
      <div className="ei-header">
        <EywaLogoMono size={20} className="ei-logo" />
        <span className="ei-header-brand">EYWA</span>
        <span className="ei-header-room">
          {room?.name ?? room?.slug ?? ""}
        </span>
        <span className="ei-header-sep" />
        <span className="ei-header-stat">
          {activeCount}
          <span className="ei-header-stat-dim">/{agents.length}</span>
        </span>
        <span className="ei-header-calls">
          {callsLast10m > 0 ? `${callsLast10m} calls` : "quiet"}
        </span>
        <span className="ei-header-time">{clockTime()}</span>
      </div>

      {/* Body */}
      <div className="ei-body">
        {/* Agent strip */}
        {agents.length > 0 && (
          <div className="ei-strip">
            {agents.slice(0, 8).map((info) => (
              <div key={info.agent} className="ei-strip-agent">
                <EinkAvatar name={info.agent} size={22} />
                <span className={`ei-strip-name${info.isActive ? " ei-strip-name-active" : ""}`}>
                  {getShort(info.agent)}
                </span>
                <span className="ei-strip-status">
                  <span
                    className="ei-dot"
                    style={{ background: info.isActive ? EI.green : EI.dim }}
                  />
                  {timeAgo(info.lastTs)}
                </span>
              </div>
            ))}
            {agents.length > 8 && (
              <span className="ei-strip-overflow">+{agents.length - 8}</span>
            )}
          </div>
        )}
        <div className="ei-strip-divider" />

        {/* Activity feed */}
        <div className="ei-feed">
          {feed.length === 0 && (
            <div className="ei-empty">no activity</div>
          )}
          {feed.map((m, idx) => (
            <div
              key={m.id}
              className={`ei-feed-item${idx === 0 ? " ei-feed-item-latest" : ""}`}
            >
              <span
                className="ei-feed-dot"
                style={{ background: typeColor(m.message_type) }}
              />
              <span className="ei-feed-agent">{getShort(m.agent)}</span>
              <span className="ei-feed-content">
                {truncate(m.content, 120)}
              </span>
              <span className="ei-feed-time">{timeAgo(m.ts)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="ei-footer">
        <span className="ei-footer-brand">EYWA</span>
        <span className="ei-footer-ver">v0.3</span>
      </div>
    </div>
  );
}
