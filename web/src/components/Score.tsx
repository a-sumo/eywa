import { useMemo, useRef, useEffect } from "react";
import { useRoomContext } from "../context/RoomContext";
import { useRealtimeMemories } from "../hooks/useRealtimeMemories";
import { agentColor, agentColorHSL } from "../lib/agentColor";
import { ParticleGlyph } from "./ParticleGlyph";
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

  if (event === "session_start" || event === "session_end" || event === "session_done") {
    return "lifecycle";
  }
  if (
    m.message_type === "knowledge" ||
    event === "knowledge_stored" ||
    m.metadata?.file_id
  ) {
    return "store";
  }
  if (m.message_type === "injection" || event === "context_injection") {
    return "communicate";
  }
  if (m.message_type === "user") {
    return "decide";
  }
  if (m.message_type === "tool_call") {
    if (SEARCH_PATTERNS.test(m.content)) {
      return "search";
    }
    return "execute";
  }
  if (m.message_type === "assistant") {
    return "write";
  }
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

  const latestBucket = rows.length > 0 ? rows[rows.length - 1].ts : 0;

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
                    <ParticleGlyph
                      key={e.memory.id}
                      memory={e.memory}
                      agentHSL={agentColorHSL(agent)}
                      live={isLatest}
                      title={glyphTitle(e.memory, e.glyph)}
                    />
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
