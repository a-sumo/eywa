import { useMemo, useEffect } from "react";
import { useRealtimeMemories } from "../hooks/useRealtimeMemories";
import { useRoomContext } from "../context/RoomContext";
import type { Memory } from "../lib/supabase";
import { getAvatar } from "./avatars";

/* ── Waveshare 7-Color E-Ink Palette ──
   Available pigments: black, white, red, green, blue, yellow, orange
   White background, black text, blue accents */

const EI = {
  bg: "#FFFFFF",
  fg: "#2D2D3F",       // soft charcoal
  blue: "#7B9ACC",     // soft periwinkle
  red: "#CC8E8E",      // soft rose
  green: "#7EAE8E",    // soft sage
  orange: "#CCA87E",   // soft peach
  dim: "#A0A0B0",
  divider: "#E0DDE8",
  headerBg: "#EDE8F5", // light lavender
  headerFg: "#4A4460", // dark violet-gray
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
  if (t === "assistant") return EI.blue;
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

/* ── Tracking Marker ── */

function TrackingMarker({ size = 48 }: { size?: number }) {
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
  return (
    <svg width={size} height={size} viewBox="0 0 8 8" shapeRendering="crispEdges">
      <rect x={0} y={0} width={8} height={8} fill={EI.bg} />
      {pattern.flatMap((row, y) =>
        row.map((cell, x) =>
          cell === 1 ? <rect key={`${y}-${x}`} x={x} y={y} width={1} height={1} fill={EI.fg} /> : null
        )
      )}
    </svg>
  );
}

/* ── Eywa Logo (original aurora colors, great on 7-color e-ink) ── */

function EywaLogoColor({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 227 235" fill="none">
      <path d="M104 119.772C104 105.718 116.165 94.7547 130.143 96.2108L212.55 104.795C220.478 105.621 226.5 112.303 226.5 120.273C226.5 128.315 220.372 135.033 212.364 135.77L129.858 143.36C115.977 144.637 104 133.711 104 119.772Z" fill="#5577BB"/>
      <path d="M108.76 115.522C122.535 115.249 133.285 127.346 131.399 140.996L119.891 224.298C119.094 230.065 114.162 234.362 108.341 234.362C102.442 234.362 97.4782 229.951 96.7852 224.093L86.9089 140.602C85.351 127.433 95.4996 115.784 108.76 115.522Z" fill="#7766AA"/>
      <path d="M110.125 0.766382C116.648 0.766369 122.171 5.57125 123.072 12.0312L135.586 101.719C137.482 115.311 127.072 127.515 113.35 127.786C99.8466 128.053 89.0605 116.63 90.0996 103.163L97.0672 12.8569C97.5934 6.03582 103.284 0.766395 110.125 0.766382Z" fill="#5577BB"/>
      <path d="M0 121.46C0 113.001 6.32766 105.88 14.7274 104.886L83.0607 96.7954C97.929 95.0351 111 106.65 111 121.622V123.754C111 139.082 97.3328 150.8 82.1846 148.461L14.1425 137.954C6.00503 136.697 0 129.693 0 121.46Z" fill="#BB6666"/>
      <rect width="69.0908" height="37.6259" rx="18.813" transform="matrix(-0.682103 -0.731256 0.714523 -0.699611 153.127 179.555)" fill="#5577BB"/>
      <rect width="71.2152" height="41.6372" rx="20.8186" transform="matrix(0.798895 -0.60147 0.582827 0.812597 43 142.042)" fill="#7766AA"/>
      <rect width="69.0901" height="37.4677" rx="18.7339" transform="matrix(-0.682386 0.730992 -0.714252 -0.699889 170.38 84.1525)" fill="#5577BB"/>
      <rect width="75.2802" height="37.978" rx="18.989" transform="matrix(0.679222 0.733933 -0.717276 0.696789 83.8679 59.6776)" fill="#BB6666"/>
    </svg>
  );
}

/* ── Agent Avatar (full kurzgesagt SVG with hue-rotate color variant) ── */

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

/* ── Rotating colored-squares border ── */
/* Pastel squares placed along all 4 edges, color assignment rotates each reload */

const BORDER_COLORS = [
  "#C8B8E8", // lavender
  "#E8B8C8", // pink
  "#B8D8C8", // mint
  "#E8D0B8", // peach
  "#B8D0E8", // sky
  "#E8E0B8", // butter
  "#E8C0B0", // coral
];

// simple deterministic hash for slot visibility
function slotHash(i: number): number {
  let h = i * 2654435761;
  h = ((h >>> 16) ^ h) * 0x45d9f3b;
  h = ((h >>> 16) ^ h);
  return (h >>> 0) / 0xffffffff;
}

function BorderSquares() {
  const sq = 4;       // square size px
  const stride = 10;  // spacing between squares
  const inset = 1;    // distance from container edge
  const W = 600;
  const H = 448;

  // step offset advances by 1 each minute (syncs with 60s reload)
  const step = Math.floor(Date.now() / 60000);

  // build all possible slot positions around the perimeter
  const slots: { x: number; y: number }[] = [];

  // top edge
  for (let x = inset; x + sq <= W - inset; x += stride) {
    slots.push({ x, y: inset });
  }
  // right edge
  for (let y = inset + stride; y + sq <= H - inset; y += stride) {
    slots.push({ x: W - inset - sq, y });
  }
  // bottom edge (reverse for continuous flow)
  for (let x = W - inset - sq; x >= inset; x -= stride) {
    slots.push({ x, y: H - inset - sq });
  }
  // left edge (reverse for continuous flow)
  for (let y = H - inset - sq; y >= inset + stride; y -= stride) {
    slots.push({ x: inset, y });
  }

  const total = slots.length;

  // ~40% of slots are visible, chosen by hash.
  // each reload, the visibility pattern shifts by 1 slot around the perimeter.
  const visible = slots.map((pos, i) => {
    const shifted = (i + step) % total;
    const show = slotHash(shifted) < 0.4;
    return show ? { ...pos, idx: i } : null;
  }).filter((s): s is { x: number; y: number; idx: number } => s !== null);

  return (
    <svg
      width={W}
      height={H}
      style={{ position: "absolute", inset: 0 }}
      aria-hidden="true"
    >
      {visible.map((s) => (
        <rect
          key={s.idx}
          x={s.x}
          y={s.y}
          width={sq}
          height={sq}
          fill={BORDER_COLORS[(s.idx + step) % BORDER_COLORS.length]}
          opacity={0.7}
          shapeRendering="crispEdges"
        />
      ))}
    </svg>
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
      <BorderSquares />

      {/* Header bar */}
      <div className="ei-header">
        <EywaLogoColor size={22} />
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
        {/* Unified agent strip */}
        {agents.length > 0 && (
          <div className="ei-strip">
            {agents.slice(0, 8).map((info) => (
              <div key={info.agent} className="ei-strip-agent">
                <EinkAvatar name={info.agent} size={20} />
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

        {/* Compact activity feed */}
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
        <TrackingMarker size={36} />
        <span className="ei-footer-brand">EYWA</span>
        <span className="ei-footer-ver">v0.3</span>
      </div>
    </div>
  );
}
