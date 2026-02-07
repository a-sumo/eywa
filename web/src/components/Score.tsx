import { useMemo, useRef, useEffect } from "react";
import { useRoomContext } from "../context/RoomContext";
import { useRealtimeMemories } from "../hooks/useRealtimeMemories";
import { agentColor } from "../lib/agentColor";
import type { Memory } from "../lib/supabase";
import "./Score.css";

// --- Glyph types and classification ---

type GlyphType =
  | "observe"
  | "write"
  | "execute"
  | "search"
  | "communicate"
  | "decide"
  | "store"
  | "lifecycle";

const SEARCH_PATTERNS = /grep|glob|search|find|rg |ripgrep/i;

function memoryToGlyph(m: Memory): GlyphType {
  const event = m.metadata?.event as string | undefined;

  // Lifecycle events first (most specific)
  if (event === "session_start" || event === "session_end" || event === "session_done") {
    return "lifecycle";
  }

  // Knowledge / file storage
  if (
    m.message_type === "knowledge" ||
    event === "knowledge_stored" ||
    m.metadata?.file_id
  ) {
    return "store";
  }

  // Injection / communication
  if (m.message_type === "injection" || event === "context_injection") {
    return "communicate";
  }

  // Human steering
  if (m.message_type === "user") {
    return "decide";
  }

  // Tool calls - distinguish search from general execution
  if (m.message_type === "tool_call") {
    if (SEARCH_PATTERNS.test(m.content)) {
      return "search";
    }
    return "execute";
  }

  // Assistant output
  if (m.message_type === "assistant") {
    return "write";
  }

  // Tool results, resources, everything else
  return "observe";
}

const GLYPH_LABELS: Record<GlyphType, string> = {
  observe: "Observe",
  write: "Write",
  execute: "Execute",
  search: "Search",
  communicate: "Communicate",
  decide: "Decide",
  store: "Store",
  lifecycle: "Lifecycle",
};

// --- SVG Glyph Components (20px, stroke-based, currentColor) ---

function GlyphObserve() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M2 10s3.5-5 8-5 8 5 8 5-3.5 5-8 5-8-5-8-5z" />
      <circle cx="10" cy="10" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function GlyphWrite() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M14 3l3 3-10 10H4v-3L14 3z" />
    </svg>
  );
}

function GlyphExecute() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="6" />
      <path d="M10 4V2M10 18v-2M4 10H2M18 10h-2M5.8 5.8L4.4 4.4M15.6 15.6l-1.4-1.4M5.8 14.2l-1.4 1.4M15.6 4.4l-1.4 1.4" />
    </svg>
  );
}

function GlyphSearch() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M10 4a6 6 0 100 0" opacity="0.4" />
      <path d="M10 6a4 4 0 100 0" opacity="0.7" />
      <circle cx="10" cy="10" r="2" />
    </svg>
  );
}

function GlyphCommunicate() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="5" cy="10" r="2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="10" r="2" fill="currentColor" stroke="none" />
      <path d="M7 10c0-3 6-3 6 0" />
    </svg>
  );
}

function GlyphDecide() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="M10 2l6 8-6 8-6-8z" />
    </svg>
  );
}

function GlyphStore() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M10 2v12M7 11l3 3 3-3M6 18h8" />
    </svg>
  );
}

function GlyphLifecycle() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M10 2v4M10 14v4M2 10h4M14 10h4M4.5 4.5l2.8 2.8M12.7 12.7l2.8 2.8M15.5 4.5l-2.8 2.8M7.3 12.7l-2.8 2.8" />
    </svg>
  );
}

const GLYPH_MAP: Record<GlyphType, () => React.JSX.Element> = {
  observe: GlyphObserve,
  write: GlyphWrite,
  execute: GlyphExecute,
  search: GlyphSearch,
  communicate: GlyphCommunicate,
  decide: GlyphDecide,
  store: GlyphStore,
  lifecycle: GlyphLifecycle,
};

function Glyph({ type, className }: { type: GlyphType; className?: string }) {
  const Component = GLYPH_MAP[type];
  return (
    <span className={`score-glyph ${className ?? ""}`}>
      <Component />
    </span>
  );
}

// --- Time quantization ---

const BUCKET_MS = 5000;

function quantize(ts: string): number {
  return Math.floor(new Date(ts).getTime() / BUCKET_MS) * BUCKET_MS;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// --- Row building ---

interface ScoreRow {
  ts: number;
  events: Record<string, { memory: Memory; glyph: GlyphType }[]>;
}

function buildRows(memories: Memory[]): { agents: string[]; rows: ScoreRow[] } {
  const agentSet = new Set<string>();
  const buckets = new Map<number, Record<string, { memory: Memory; glyph: GlyphType }[]>>();

  for (const m of memories) {
    agentSet.add(m.agent);
    const bucket = quantize(m.ts);
    if (!buckets.has(bucket)) {
      buckets.set(bucket, {});
    }
    const row = buckets.get(bucket)!;
    if (!row[m.agent]) {
      row[m.agent] = [];
    }
    row[m.agent].push({ memory: m, glyph: memoryToGlyph(m) });
  }

  const agents = Array.from(agentSet).sort();
  const rows: ScoreRow[] = Array.from(buckets.entries())
    .map(([ts, events]) => ({ ts, events }))
    .sort((a, b) => a.ts - b.ts);

  return { agents, rows };
}

// --- Tooltip ---

function glyphTitle(m: Memory, glyphType: GlyphType): string {
  const preview = m.content.length > 80 ? m.content.slice(0, 80) + "..." : m.content;
  const time = new Date(m.ts).toLocaleTimeString();
  return `${GLYPH_LABELS[glyphType]} - ${m.agent}\n${time}\n${preview}`;
}

// --- Main component ---

export function Score() {
  const { room, loading: roomLoading } = useRoomContext();
  const { memories, loading } = useRealtimeMemories(room?.id ?? null, 200);
  const bodyRef = useRef<HTMLDivElement>(null);
  const wasAtBottom = useRef(true);

  const { agents, rows } = useMemo(() => buildRows(memories), [memories]);

  // Track if user is at the bottom before render
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    wasAtBottom.current = atBottom;
  });

  // Auto-scroll to bottom when new rows arrive, only if already at bottom
  useEffect(() => {
    const el = bodyRef.current;
    if (el && wasAtBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [rows.length]);

  if (roomLoading || loading) {
    return <div className="score-loading">Loading score...</div>;
  }

  if (rows.length === 0) {
    return (
      <div className="score score-empty">
        <p>No activity yet. Agent events will appear here as glyphs on a timeline.</p>
      </div>
    );
  }

  const latestBucket = rows.length > 0 ? rows[rows.length - 1].ts : 0;

  return (
    <div className="score">
      <div className="score-header">
        <span className="score-ts-head" />
        {agents.map((agent) => (
          <span key={agent} className="score-col-head">
            <span
              className="score-agent-dot"
              style={{ background: agentColor(agent) }}
            />
            <span className="score-agent-name" title={agent}>
              {agent.split("/").pop() ?? agent}
            </span>
          </span>
        ))}
      </div>

      <div className="score-body" ref={bodyRef}>
        {rows.map((row) => {
          const isLatest = row.ts === latestBucket;
          return (
            <div className="score-line" key={row.ts}>
              <span className="score-ts">{formatTime(row.ts)}</span>
              {agents.map((agent) => (
                <span key={agent} className="score-cell">
                  {row.events[agent]?.map((e) => (
                    <span
                      key={e.memory.id}
                      title={glyphTitle(e.memory, e.glyph)}
                      style={{ color: agentColor(agent) }}
                    >
                      <Glyph
                        type={e.glyph}
                        className={isLatest ? "glyph-live" : "glyph-idle"}
                      />
                    </span>
                  ))}
                </span>
              ))}
            </div>
          );
        })}
        <div className="score-now" />
      </div>
    </div>
  );
}
