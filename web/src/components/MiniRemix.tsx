import { useState, useMemo, useCallback, type DragEvent } from "react";
import { useRealtimeMemories } from "../hooks/useRealtimeMemories";
import { useRoomContext } from "../context/RoomContext";
import type { Memory } from "../lib/supabase";

/* ── helpers ── */

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

/**
 * 3 categories only: user (blue), assistant (green), tool (yellow).
 * Everything else (resource, unknown) → gray.
 */
const TYPE_COLORS: Record<string, string> = {
  user: "#4C6EF5",
  assistant: "#40C057",
  tool_call: "#FAB005",
  tool_result: "#FAB005",
};

type TypeCategory = "user" | "assistant" | "tool";

/** Map a message_type string to one of the 3 filter categories */
function typeToCategory(t: string): TypeCategory | null {
  if (t === "user") return "user";
  if (t === "assistant") return "assistant";
  if (t === "tool_call" || t === "tool_result") return "tool";
  return null;
}

function sessionDominantCategory(session: { memories: Memory[] }): TypeCategory | null {
  const counts: Record<string, number> = {};
  for (const m of session.memories) {
    const cat = typeToCategory(m.message_type);
    if (cat) counts[cat] = (counts[cat] || 0) + 1;
  }
  let max = 0;
  let dominant: TypeCategory | null = null;
  for (const [cat, count] of Object.entries(counts)) {
    if (count > max) {
      max = count;
      dominant = cat as TypeCategory;
    }
  }
  return dominant;
}

const CATEGORY_COLORS: Record<TypeCategory, string> = {
  user: "#4C6EF5",
  assistant: "#40C057",
  tool: "#FAB005",
};

function sessionTypeColor(session: { memories: Memory[] }): string {
  const cat = sessionDominantCategory(session);
  return cat ? CATEGORY_COLORS[cat] : "#CED4DA";
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

const MIME = "application/remix-thread";

/* ── Animal Head Sprites ── */
// 9×7 grids: 0=empty, 1=body, 2=eye, 3=nose/accent

const ANIMAL_SPRITES: { label: string; rows: string[] }[] = [
  { label: "cat", rows: [
    ".1...1.", "11...11", ".11111.", "1111111",
    "1.2.2.1", "1111111", ".11311.", "..111..", ".......",
  ]},
  { label: "dog", rows: [
    "..111..", ".11111.", "1111111", "1.2.2.1",
    "1111111", ".11311.", ".11111.", "11...11", "1.....1",
  ]},
  { label: "bear", rows: [
    ".1...1.", "111.111", ".11111.", "1111111",
    "1.2.2.1", "1111111", ".11311.", "..111..", ".......",
  ]},
  { label: "rabbit", rows: [
    ".1...1.", ".1...1.", ".1...1.", ".11111.",
    "1.2.2.1", "1111111", ".11311.", "..111..", ".......",
  ]},
  { label: "fox", rows: [
    "1.....1", "11...11", ".11111.", "1111111",
    "1.2.2.1", ".11111.", "..131..", "...1...", ".......",
  ]},
  { label: "owl", rows: [
    ".1...1.", "1111111", "1221221", "1111111",
    ".11311.", ".11111.", "..111..", "..1.1..", ".......",
  ]},
  { label: "frog", rows: [
    ".......", ".2...2.", "111.111", "1111111",
    "1.....1", "1111111", ".11111.", ".......", ".......",
  ]},
  { label: "penguin", rows: [
    "..111..", ".11111.", "1111111", "1.2.2.1",
    "1111111", ".11311.", ".11111.", "..111..", ".......",
  ]},
  { label: "mouse", rows: [
    "11...11", "111.111", ".11111.", ".11111.",
    ".12.21.", ".11311.", "..111..", ".......", ".......",
  ]},
  { label: "pig", rows: [
    ".......", "1.111.1", "1111111", "1.2.2.1",
    "1111111", ".13.31.", ".11111.", "..111..", ".......",
  ]},
  { label: "koala", rows: [
    "11...11", "111.111", "1111111", ".11111.",
    ".12.21.", ".11311.", "..111..", ".......", ".......",
  ]},
  { label: "lion", rows: [
    ".11111.", "1111111", "1.111.1", "1.2.2.1",
    "1.111.1", "1.131.1", "1111111", ".1.1.1.", ".......",
  ]},
  { label: "monkey", rows: [
    "..111..", ".11111.", "1.111.1", "1.2.2.1",
    ".11111.", ".11311.", "..111..", ".......", ".......",
  ]},
  { label: "hamster", rows: [
    ".1...1.", ".11111.", "1111111", "1.2.2.1",
    "1111111", "1113111", ".11111.", "..111..", ".......",
  ]},
  { label: "duck", rows: [
    "..111..", ".11111.", ".12.21.", ".11111.",
    "1133311", ".11111.", "..111..", ".......", ".......",
  ]},
  { label: "wolf", rows: [
    "1.....1", "11...11", "1111111", "1.2.2.1",
    "1111111", ".11111.", "..131..", "..1.1..", ".......",
  ]},
];

function getAnimalSprite(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 7) - hash + name.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % ANIMAL_SPRITES.length;
  const animal = ANIMAL_SPRITES[idx];
  const grid = animal.rows.map((r) =>
    [...r].map((c) => (c === "." ? 0 : Number(c)))
  );
  return { label: animal.label, grid };
}

function PixelCreature({ name, size = 24 }: { name: string; size?: number }) {
  const { grid } = useMemo(() => getAnimalSprite(name), [name]);
  const color = agentColor(name);
  const ROWS = grid.length;
  const COLS = grid[0].length;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${COLS} ${ROWS}`}
      preserveAspectRatio="xMidYMid meet"
      className="mini-pixel-creature"
    >
      {grid.flatMap((row, r) =>
        row.map((cell, c) => {
          if (cell === 0) return null;
          let fill = color;
          if (cell === 2) fill = "#1A1A2E";
          else if (cell === 3) fill = "#5F6368";
          return (
            <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill={fill} />
          );
        })
      )}
    </svg>
  );
}

/* ── Sub-components ── */

/** Clickable legend filters in the title bar */
function MiniLegend({
  filters,
  onToggle,
}: {
  filters: Set<TypeCategory>;
  onToggle: (cat: TypeCategory) => void;
}) {
  const items: { cat: TypeCategory; label: string; color: string }[] = [
    { cat: "user", label: "user", color: CATEGORY_COLORS.user },
    { cat: "assistant", label: "asst", color: CATEGORY_COLORS.assistant },
    { cat: "tool", label: "tool", color: CATEGORY_COLORS.tool },
  ];
  const anyActive = filters.size > 0;
  return (
    <div className="mini-legend">
      {items.map(({ cat, label, color }) => {
        const active = filters.has(cat);
        return (
          <button
            key={cat}
            className={`mini-legend-btn ${active ? "active" : ""} ${anyActive && !active ? "dimmed" : ""}`}
            onClick={() => onToggle(cat)}
          >
            <span className="mini-legend-dot" style={{ background: color }} />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Session block: 14x14 type-colored square */
function MiniSessionBlock({
  session,
  selected,
  inContext,
  dimmed,
  onSelect,
}: {
  session: SessionInfo;
  selected: boolean;
  inContext: boolean;
  dimmed: boolean;
  onSelect: (s: SessionInfo) => void;
}) {
  const typeColor = sessionTypeColor(session);

  function handleDragStart(e: DragEvent<HTMLDivElement>) {
    e.dataTransfer.setData(
      MIME,
      JSON.stringify({ agent: session.agent, sessionId: session.sessionId })
    );
    e.dataTransfer.effectAllowed = "copy";
    (e.currentTarget as HTMLElement).classList.add("dragging");
  }

  function handleDragEnd(e: DragEvent<HTMLDivElement>) {
    (e.currentTarget as HTMLElement).classList.remove("dragging");
  }

  const baseOpacity = session.isActive ? 1 : 0.45;
  const finalOpacity = dimmed ? baseOpacity * 0.2 : baseOpacity;

  return (
    <div
      className={`mini-sblock ${selected ? "selected" : ""} ${inContext ? "in-ctx" : ""}`}
      style={{ background: typeColor, opacity: finalOpacity }}
      draggable={!dimmed}
      onDragStart={dimmed ? undefined : handleDragStart}
      onDragEnd={dimmed ? undefined : handleDragEnd}
      onClick={dimmed ? undefined : () => onSelect(session)}
      title={`${session.sessionId.slice(0, 6)} · ${session.memories.length} mem · ${timeAgo(session.lastTs)}`}
    />
  );
}

/** Agent row: creature + name + time, then wrapping grid of blocks */
function MiniAgentRow({
  agent,
  sessions,
  selectedSession,
  contextIds,
  filters,
  onSelectSession,
}: {
  agent: string;
  sessions: SessionInfo[];
  selectedSession: SessionInfo | null;
  contextIds: Set<string>;
  filters: Set<TypeCategory>;
  onSelectSession: (s: SessionInfo) => void;
}) {
  const newest = sessions[0]?.lastTs;
  const oldest = sessions[sessions.length - 1]?.lastTs;
  const timeLabel =
    newest && oldest && newest !== oldest
      ? `${timeAgo(newest)}\u2009\u2192\u2009${timeAgo(oldest)}`
      : newest
        ? timeAgo(newest)
        : "";

  return (
    <div className="mini-agent-row">
      <div className="mini-agent-label">
        <PixelCreature name={agent} size={24} />
        <div className="mini-agent-label-text">
          <span className="mini-agent-name" style={{ color: agentColor(agent) }}>
            {agent}
          </span>
          <span className="mini-agent-time">{timeLabel}</span>
        </div>
      </div>
      <div className="mini-agent-grid">
        {sessions.map((s) => {
          const cat = sessionDominantCategory(s);
          const dimmed = filters.size > 0 && (cat === null || !filters.has(cat));
          return (
            <MiniSessionBlock
              key={s.sessionId}
              session={s}
              selected={selectedSession?.sessionId === s.sessionId}
              inContext={contextIds.has(s.sessionId)}
              dimmed={dimmed}
              onSelect={onSelectSession}
            />
          );
        })}
      </div>
    </div>
  );
}

/** Detail view: session memory list */
function MiniDetailView({ session }: { session: SessionInfo }) {
  return (
    <div className="mini-detail-view">
      <div className="mini-detail-header">
        <PixelCreature name={session.agent} size={16} />
        <span style={{ color: agentColor(session.agent) }}>
          {session.agent}
        </span>
        <span className="mini-detail-sid">
          {session.sessionId.slice(0, 8)}
        </span>
        <span className="mini-detail-count">
          {session.memories.length} mem · {timeAgo(session.lastTs)}
        </span>
      </div>
      <div className="mini-detail-list">
        {session.memories.map((m) => (
          <div className="mini-detail-row" key={m.id}>
            <span
              className="mini-detail-badge"
              style={{
                background: (TYPE_COLORS[m.message_type] ?? "#9aa0a6") + "20",
                color: TYPE_COLORS[m.message_type] ?? "#9aa0a6",
              }}
            >
              {m.message_type}
            </span>
            <span className="mini-detail-content">
              {m.content.slice(0, 100)}
            </span>
            <span className="mini-detail-time">{timeAgo(m.ts)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Bottom bar: context chips (drop target) + clear */
function MiniContextBar({
  dropped,
  justDroppedId,
  activeSessionId,
  onTapChip,
  onDrop,
  onClear,
}: {
  dropped: SessionInfo[];
  justDroppedId: string | null;
  activeSessionId: string | null;
  onTapChip: (s: SessionInfo) => void;
  onDrop: (agent: string, sessionId: string) => void;
  onClear: () => void;
}) {
  const [dragOver, setDragOver] = useState(false);

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    if (e.dataTransfer.types.includes(MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setDragOver(true);
    }
  }
  function handleDragLeave() {
    setDragOver(false);
  }
  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const raw = e.dataTransfer.getData(MIME);
    if (!raw) return;
    try {
      const { agent, sessionId } = JSON.parse(raw);
      onDrop(agent, sessionId);
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      className={`mini-ctxbar ${dragOver ? "dragover" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <span className="mini-ctxbar-label">ctx</span>
      {dropped.length === 0 && (
        <span className="mini-ctxbar-hint">drag sessions here</span>
      )}
      {dropped.map((s) => {
        const tc = sessionTypeColor(s);
        return (
          <div
            key={s.sessionId}
            className={`mini-ctxbar-chip ${justDroppedId === s.sessionId ? "pop-in" : ""} ${activeSessionId === s.sessionId ? "active" : ""}`}
            style={{ background: tc }}
            onClick={() => onTapChip(s)}
            title={`${s.agent}/${s.sessionId.slice(0, 6)} · ${s.memories.length} mem`}
          />
        );
      })}
      <span className="mini-ctxbar-spacer" />
      {dropped.length > 0 && (
        <button className="mini-ctxbar-clear" onClick={onClear}>
          clear
        </button>
      )}
    </div>
  );
}

/* ── Main ── */

export function MiniRemix() {
  const { room } = useRoomContext();
  const { memories } = useRealtimeMemories(room?.id ?? null, 200);

  const [droppedIds, setDroppedIds] = useState<Set<string>>(new Set());
  const [selectedSession, setSelectedSession] = useState<SessionInfo | null>(null);
  const [justDroppedId, setJustDroppedId] = useState<string | null>(null);
  const [filters, setFilters] = useState<Set<TypeCategory>>(new Set());

  const agentSessions = useMemo(() => buildSessions(memories), [memories]);

  const allSessions = useMemo(() => {
    const all: SessionInfo[] = [];
    for (const sessions of agentSessions.values()) all.push(...sessions);
    return all;
  }, [agentSessions]);

  const droppedSessions = useMemo(
    () => allSessions.filter((s) => droppedIds.has(s.sessionId)),
    [allSessions, droppedIds]
  );

  const agentCount = agentSessions.size;

  const addSession = useCallback((_agent: string, sessionId: string) => {
    setDroppedIds((prev) => {
      if (prev.has(sessionId)) return prev;
      const next = new Set(prev);
      next.add(sessionId);
      return next;
    });
    setJustDroppedId(sessionId);
    setTimeout(() => setJustDroppedId(null), 500);
  }, []);

  const handleSelectSession = useCallback((s: SessionInfo) => {
    setSelectedSession((prev) =>
      prev?.sessionId === s.sessionId ? null : s
    );
  }, []);

  const handleTapChip = useCallback((s: SessionInfo) => {
    setSelectedSession(s);
  }, []);

  const handleClear = useCallback(() => {
    setDroppedIds(new Set());
    setSelectedSession(null);
  }, []);

  const toggleFilter = useCallback((cat: TypeCategory) => {
    setFilters((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  const agents = Array.from(agentSessions.entries());

  return (
    <div className="mini-container">
      <div className="mini-titlebar">
        <span className="mini-led" />
        <span className="mini-titlebar-name">
          {room?.name ?? room?.slug ?? "\u2014"}
        </span>
        <MiniLegend filters={filters} onToggle={toggleFilter} />
        <span className="mini-titlebar-stats">
          {agentCount} agt · {memories.length} mem
        </span>
      </div>

      <div className="mini-body">
        <div className="mini-left-panel">
          {agents.length === 0 && (
            <div className="mini-empty">No agents yet</div>
          )}
          {agents.map(([agent, sessions]) => (
            <MiniAgentRow
              key={agent}
              agent={agent}
              sessions={sessions}
              selectedSession={selectedSession}
              contextIds={droppedIds}
              filters={filters}
              onSelectSession={handleSelectSession}
            />
          ))}
        </div>

        <div className="mini-divider" />

        <div className="mini-right-panel">
          {selectedSession ? (
            <MiniDetailView session={selectedSession} />
          ) : (
            <div className="mini-empty-detail">
              click a session to preview
            </div>
          )}
        </div>
      </div>

      <MiniContextBar
        dropped={droppedSessions}
        justDroppedId={justDroppedId}
        activeSessionId={selectedSession?.sessionId ?? null}
        onTapChip={handleTapChip}
        onDrop={addSession}
        onClear={handleClear}
      />
    </div>
  );
}
