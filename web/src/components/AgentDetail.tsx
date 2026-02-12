import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useRealtimeMemories } from "../hooks/useRealtimeMemories";
import { useRoomContext } from "../context/RoomContext";
import { agentColor } from "../lib/agentColor";
import { getAvatar } from "./avatars";
import type { Memory } from "../lib/supabase";

// --- Types ---

interface TimelineEntry {
  id: string;
  content: string;
  category: "file" | "git" | "deploy" | "test" | "decision" | "error" | "session" | "injection" | "other";
  system?: string;
  action?: string;
  scope?: string;
  outcome?: string;
  event?: string;
  messageType: string;
  ts: string;
}

interface AgentSummary {
  filesCreated: string[];
  filesModified: string[];
  commits: number;
  deploys: { success: number; failure: number };
  errors: number;
  injections: number;
  decisions: number;
  totalOps: number;
  firstSeen: string;
  lastSeen: string;
  task: string;
  status: "active" | "idle" | "finished";
  progressPercent: number | null;
}

// --- Helpers ---

const CATEGORY_CONFIG: Record<TimelineEntry["category"], { label: string; color: string; icon: string }> = {
  file: { label: "File", color: "#64748b", icon: "F" },
  git: { label: "Git", color: "#f97316", icon: "G" },
  deploy: { label: "Deploy", color: "#22c55e", icon: "D" },
  test: { label: "Test", color: "#eab308", icon: "T" },
  decision: { label: "Decision", color: "#8b5cf6", icon: "?" },
  error: { label: "Error", color: "#ef4444", icon: "!" },
  session: { label: "Session", color: "#06b6d4", icon: "S" },
  injection: { label: "Inject", color: "#a855f7", icon: ">" },
  other: { label: "Other", color: "#94a3b8", icon: "." },
};

function categorize(m: Memory): TimelineEntry["category"] {
  const meta = (m.metadata ?? {}) as Record<string, unknown>;
  const system = meta.system as string | undefined;
  const action = meta.action as string | undefined;
  const event = meta.event as string | undefined;
  const outcome = meta.outcome as string | undefined;

  if (event === "session_start" || event === "session_done" || event === "session_end" || event === "distress" || event === "checkpoint") return "session";
  if (event === "context_injection" || m.message_type === "injection") return "injection";
  if (outcome === "failure" || outcome === "blocked") return "error";
  if (system === "deploy") return "deploy";
  if (system === "git") return "git";
  if (system === "ci" || action === "test") return "test";
  if (system === "filesystem") return "file";
  if (action === "review" || event === "progress") return "decision";
  return "other";
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatTime(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function buildTimeline(memories: Memory[]): TimelineEntry[] {
  const NOISE_EVENTS = new Set(["agent_connected", "heartbeat"]);
  return memories
    .filter((m) => {
      const meta = (m.metadata ?? {}) as Record<string, unknown>;
      if (NOISE_EVENTS.has(meta.event as string)) return false;
      if (m.message_type === "resource" && (!m.content || m.content.length < 20)) return false;
      return true;
    })
    .map((m) => {
      const meta = (m.metadata ?? {}) as Record<string, unknown>;
      return {
        id: m.id,
        content: (m.content ?? "").slice(0, 500),
        category: categorize(m),
        system: meta.system as string | undefined,
        action: meta.action as string | undefined,
        scope: meta.scope as string | undefined,
        outcome: meta.outcome as string | undefined,
        event: meta.event as string | undefined,
        messageType: m.message_type,
        ts: m.ts,
      };
    })
    .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
}

function buildSummary(memories: Memory[], entries: TimelineEntry[]): AgentSummary {
  const filesCreated = new Set<string>();
  const filesModified = new Set<string>();
  let commits = 0;
  const deploys = { success: 0, failure: 0 };
  let errors = 0;
  let injections = 0;
  let decisions = 0;
  let task = "";
  let status: "active" | "idle" | "finished" = "idle";
  let progressPercent: number | null = null;

  for (const m of memories) {
    const meta = (m.metadata ?? {}) as Record<string, unknown>;
    const system = meta.system as string | undefined;
    const action = meta.action as string | undefined;
    const scope = meta.scope as string | undefined;
    const outcome = meta.outcome as string | undefined;
    const event = meta.event as string | undefined;

    if (event === "session_start") {
      task = (meta.task as string) || task;
      const age = Date.now() - new Date(m.ts).getTime();
      if (age < 30 * 60 * 1000) status = "active";
    }
    if (event === "session_done" || event === "session_end") {
      status = "finished";
      if (!task) task = (meta.summary as string) || "";
    }
    if (event === "progress") {
      progressPercent = (meta.percent as number) ?? progressPercent;
    }

    if (system === "filesystem" && action === "create" && scope) filesCreated.add(scope);
    if (system === "filesystem" && action === "write" && scope) filesModified.add(scope);
    if (system === "git" && action === "write") commits++;
    if (system === "deploy") {
      if (outcome === "success") deploys.success++;
      else deploys.failure++;
    }
    if (outcome === "failure" || outcome === "blocked") errors++;
    if (m.message_type === "injection" || event === "context_injection") injections++;
    if (action === "review") decisions++;
  }

  const timestamps = memories.map((m) => new Date(m.ts).getTime());
  const firstSeen = timestamps.length > 0 ? new Date(Math.min(...timestamps)).toISOString() : "";
  const lastSeen = timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : "";

  return {
    filesCreated: Array.from(filesCreated),
    filesModified: Array.from(filesModified),
    commits,
    deploys,
    errors,
    injections,
    decisions,
    totalOps: entries.length,
    firstSeen,
    lastSeen,
    task,
    status,
    progressPercent,
  };
}

// --- Components ---

function TimelineRow({ entry, expanded, onToggle }: { entry: TimelineEntry; expanded: boolean; onToggle: () => void }) {
  const config = CATEGORY_CONFIG[entry.category];
  const isLong = entry.content.length > 150;

  return (
    <div className="atl-row" onClick={onToggle}>
      <div className="atl-row-time">{formatTime(entry.ts)}</div>
      <div className="atl-row-line">
        <div className="atl-row-dot" style={{ background: config.color, boxShadow: `0 0 6px ${config.color}40` }}>
          <span className="atl-row-dot-icon">{config.icon}</span>
        </div>
      </div>
      <div className="atl-row-body">
        <div className="atl-row-header">
          <span className="atl-pill" style={{ background: `${config.color}18`, color: config.color }}>
            {config.label}
          </span>
          {entry.system && entry.system !== config.label.toLowerCase() && (
            <span className="atl-pill atl-pill-dim">{entry.system}</span>
          )}
          {entry.action && (
            <span className="atl-pill atl-pill-dim">{entry.action}</span>
          )}
          {entry.outcome && (
            <span className="atl-pill" style={{
              background: entry.outcome === "success" ? "#6ee7b718" : entry.outcome === "failure" ? "#fca5a518" : "#fcd34d18",
              color: entry.outcome === "success" ? "#6ee7b7" : entry.outcome === "failure" ? "#fca5a5" : "#fcd34d",
            }}>
              {entry.outcome}
            </span>
          )}
          {entry.scope && (
            <span className="atl-scope">{entry.scope}</span>
          )}
        </div>
        <div className={`atl-row-content ${expanded ? "atl-row-expanded" : ""}`}>
          {expanded ? entry.content : entry.content.slice(0, 150) + (isLong ? "..." : "")}
        </div>
      </div>
    </div>
  );
}

function SummaryBar({ summary }: { summary: AgentSummary }) {
  const allFiles = new Set([...summary.filesCreated, ...summary.filesModified]);
  const stats = [
    { label: "Files", value: allFiles.size, color: "#64748b" },
    { label: "Commits", value: summary.commits, color: "#f97316" },
    { label: "Deploys", value: summary.deploys.success + summary.deploys.failure, color: "#22c55e" },
    { label: "Errors", value: summary.errors, color: "#ef4444" },
    { label: "Injections", value: summary.injections, color: "#a855f7" },
    { label: "Total", value: summary.totalOps, color: "#8b5cf6" },
  ];

  return (
    <div className="atl-summary">
      {stats.map((s) => (
        <div key={s.label} className="atl-summary-stat">
          <span className="atl-summary-value" style={{ color: s.value > 0 ? s.color : "#475569" }}>{s.value}</span>
          <span className="atl-summary-label">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

function FileList({ created, modified }: { created: string[]; modified: string[] }) {
  const [show, setShow] = useState(false);
  const all = new Set([...created, ...modified]);
  if (all.size === 0) return null;

  return (
    <div className="atl-files">
      <button className="atl-files-toggle" onClick={() => setShow(!show)}>
        {show ? "\u25BE" : "\u25B8"} {all.size} file{all.size !== 1 ? "s" : ""} touched
      </button>
      {show && (
        <div className="atl-files-list">
          {Array.from(all).sort().map((f) => (
            <div key={f} className="atl-file-entry">
              <span className="atl-file-badge" style={{
                color: created.includes(f) ? "#22c55e" : "#eab308",
              }}>
                {created.includes(f) ? "+" : "~"}
              </span>
              <span className="atl-file-path">{f}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Category Filter ---

const ALL_CATEGORIES: TimelineEntry["category"][] = ["file", "git", "deploy", "test", "decision", "error", "session", "injection", "other"];

function CategoryFilter({
  active,
  counts,
  onToggle,
}: {
  active: Set<TimelineEntry["category"]>;
  counts: Record<string, number>;
  onToggle: (cat: TimelineEntry["category"]) => void;
}) {
  return (
    <div className="atl-filters">
      {ALL_CATEGORIES.map((cat) => {
        const config = CATEGORY_CONFIG[cat];
        const count = counts[cat] || 0;
        if (count === 0) return null;
        const isActive = active.has(cat);
        return (
          <button
            key={cat}
            className={`atl-filter-btn ${isActive ? "atl-filter-active" : ""}`}
            style={{
              borderColor: isActive ? config.color : "transparent",
              color: isActive ? config.color : "#64748b",
            }}
            onClick={() => onToggle(cat)}
          >
            {config.label} ({count})
          </button>
        );
      })}
    </div>
  );
}

// --- Main ---

export function AgentDetail() {
  const { name, slug } = useParams<{ name: string; slug: string }>();
  const { room } = useRoomContext();
  const navigate = useNavigate();
  const { memories, loading } = useRealtimeMemories(room?.id ?? null, 500);

  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [activeFilters, setActiveFilters] = useState<Set<TimelineEntry["category"]>>(new Set(ALL_CATEGORIES));

  // Filter memories for this agent
  const agentMemories = useMemo(() => {
    return memories.filter((m) => {
      if (m.agent === name) return true;
      const meta = (m.metadata ?? {}) as Record<string, unknown>;
      if (meta.user === name) return true;
      return m.agent.split("/")[0] === name;
    });
  }, [memories, name]);

  const timeline = useMemo(() => buildTimeline(agentMemories), [agentMemories]);
  const summary = useMemo(() => buildSummary(agentMemories, timeline), [agentMemories, timeline]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of timeline) {
      counts[e.category] = (counts[e.category] || 0) + 1;
    }
    return counts;
  }, [timeline]);

  const filteredTimeline = useMemo(() => {
    return timeline.filter((e) => activeFilters.has(e.category));
  }, [timeline, activeFilters]);

  function toggleRow(id: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleFilter(cat: TimelineEntry["category"]) {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  // Agent avatar
  const user = name?.split("/")[0] || name || "";
  const shortName = name?.split("/")[1] || name || "";
  const { avatar, hueRotate, saturate } = getAvatar(user);

  const statusColor = summary.status === "active" ? "#8b5cf6" : summary.status === "finished" ? "#22c55e" : "#64748b";

  return (
    <div className="atl-view">
      {/* Header */}
      <div className="atl-header">
        <button className="atl-back" onClick={() => navigate(`/r/${slug}`)}>
          &larr; Hub
        </button>
        <div className="atl-agent-info">
          <div
            className="atl-avatar"
            style={{
              filter: `hue-rotate(${hueRotate}deg) saturate(${saturate}%)`,
            }}
            dangerouslySetInnerHTML={{ __html: avatar.svg }}
          />
          <div className="atl-agent-text">
            <div className="atl-agent-name" style={{ color: agentColor(name || "") }}>
              {shortName}
            </div>
            <div className="atl-agent-user">{user}</div>
          </div>
          <span className="atl-status-dot" style={{ background: statusColor }} />
          <span className="atl-status-label" style={{ color: statusColor }}>
            {summary.status}
          </span>
          {summary.progressPercent !== null && (
            <span className="atl-progress-badge">{summary.progressPercent}%</span>
          )}
        </div>
      </div>

      {/* Task */}
      {summary.task && (
        <div className="atl-task">{summary.task}</div>
      )}

      {/* Duration */}
      {summary.firstSeen && summary.lastSeen && (
        <div className="atl-duration">
          {formatTime(summary.firstSeen)} - {formatTime(summary.lastSeen)}
          <span className="atl-duration-ago">({timeAgo(summary.lastSeen)})</span>
        </div>
      )}

      {loading && <div className="atl-loading">Loading session history...</div>}

      {!loading && agentMemories.length === 0 && (
        <div className="atl-empty">No activity from {name} yet.</div>
      )}

      {!loading && agentMemories.length > 0 && (
        <>
          {/* Summary stats */}
          <SummaryBar summary={summary} />

          {/* Files touched */}
          <FileList created={summary.filesCreated} modified={summary.filesModified} />

          {/* Category filters */}
          <CategoryFilter
            active={activeFilters}
            counts={categoryCounts}
            onToggle={toggleFilter}
          />

          {/* Timeline */}
          <div className="atl-timeline">
            <div className="atl-timeline-line" />
            {filteredTimeline.map((entry) => (
              <TimelineRow
                key={entry.id}
                entry={entry}
                expanded={expandedRows.has(entry.id)}
                onToggle={() => toggleRow(entry.id)}
              />
            ))}
            {filteredTimeline.length === 0 && (
              <div className="atl-empty">No entries match the selected filters.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
