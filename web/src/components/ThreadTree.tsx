import { useState, useMemo, useRef, useEffect } from "react";
import { useRealtimeMemories } from "../hooks/useRealtimeMemories";
import { useRoomContext } from "../context/RoomContext";
import { useNavigate, useParams } from "react-router-dom";
import type { Memory } from "../lib/supabase";
import {
  summarizeThread,
  findDivergentThreads,
  type ThreadSummary,
} from "../lib/threadSimilarity";
import { ConnectAgent } from "./ConnectAgent";

interface ThreadInfo {
  agent: string;      // unique agent id, e.g. "armand-a3f2"
  user: string;       // base user name for grouping, e.g. "armand"
  sessionId: string;
  memories: Memory[];
  status: "active" | "finished" | "idle";
  task: string;
  duration: string;
  lastSeen: string;
  summary: ThreadSummary;
  filePaths: string[];
  fileCount: number;
  isCodeThread: boolean;
}

interface ThreadTag {
  label: string;
  color: string;
  key: string;
}

interface Notification {
  id: string;
  type: "divergence" | "connection" | "session";
  message: string;
  timestamp: string;
  icon: string;
}

function extractFilePaths(memories: Memory[]): string[] {
  const paths = new Set<string>();
  for (const m of memories) {
    const meta = m.metadata as Record<string, unknown>;
    if (meta?.path && typeof meta.path === "string") {
      paths.add(meta.path);
    }
    if (meta?.file_id && typeof meta.file_id === "string") {
      paths.add(meta.file_id);
    }
  }
  return Array.from(paths);
}

function agentColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 45%)`;
}

function formatDuration(ms: number): string {
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "<1m";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return `${hours}h ${remainMins}m`;
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function buildThreads(memories: Memory[]): ThreadInfo[] {
  const sessionMap = new Map<string, Memory[]>();

  for (const m of memories) {
    const key = `${m.agent}::${m.session_id}`;
    const list = sessionMap.get(key) || [];
    list.push(m);
    sessionMap.set(key, list);
  }

  const threads: ThreadInfo[] = [];

  for (const [, mems] of sessionMap) {
    const sorted = [...mems].sort(
      (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime()
    );
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const duration =
      new Date(last.ts).getTime() - new Date(first.ts).getTime();

    const startEvent = sorted.find(
      (m) =>
        (m.metadata as Record<string, unknown>)?.event === "session_start"
    );
    const endEvent = sorted.find(
      (m) =>
        (m.metadata as Record<string, unknown>)?.event === "session_end"
    );

    let status: "active" | "finished" | "idle" = "idle";
    let task = "";

    if (startEvent && !endEvent) {
      status = "active";
      task = String(
        (startEvent.metadata as Record<string, unknown>)?.task || ""
      );
    } else if (endEvent) {
      status = "finished";
      task = String(
        (endEvent.metadata as Record<string, unknown>)?.summary || ""
      );
    }

    if (
      status === "idle" &&
      Date.now() - new Date(last.ts).getTime() < 5 * 60 * 1000
    ) {
      status = "active";
    }

    const filePaths = extractFilePaths(sorted);

    // Extract user from metadata, falling back to stripping -xxxx suffix
    const firstMeta = (first.metadata ?? {}) as Record<string, unknown>;
    const user = (firstMeta.user as string) ?? first.agent.split("/")[0];

    threads.push({
      agent: first.agent,
      user,
      sessionId: first.session_id,
      memories: sorted,
      status,
      task: task || last.content?.slice(0, 100) || "",
      duration: formatDuration(duration),
      lastSeen: last.ts,
      summary: summarizeThread(sorted),
      filePaths,
      fileCount: filePaths.length,
      isCodeThread: filePaths.length > 0,
    });
  }

  return threads;
}

function deriveThreadTags(thread: ThreadInfo): ThreadTag[] {
  const tags: ThreadTag[] = [];

  // Status tag
  if (thread.status === "active") {
    tags.push({ label: "active", color: "#489664", key: "status:active" });
  } else if (thread.status === "finished") {
    tags.push({ label: "finished", color: "#B45050", key: "status:finished" });
  } else {
    tags.push({ label: "idle", color: "#B48C50", key: "status:idle" });
  }

  // Has files
  if (thread.isCodeThread) {
    tags.push({ label: "has-files", color: "#5570cc", key: "type:has-files" });
  }

  // Message type distribution
  let toolCount = 0;
  let assistantCount = 0;
  const total = thread.memories.length;

  for (const m of thread.memories) {
    if (m.message_type === "tool_call" || m.message_type === "tool_result") toolCount++;
    else if (m.message_type === "assistant") assistantCount++;
  }

  if (total > 0) {
    if (toolCount / total > 0.6) {
      tags.push({ label: "heavy-tool", color: "#B48C50", key: "type:heavy-tool" });
    } else if (assistantCount / total > 0.6) {
      tags.push({ label: "mostly-assistant", color: "#489664", key: "type:mostly-assistant" });
    } else {
      tags.push({ label: "mixed", color: "#888", key: "type:mixed" });
    }
  }

  return tags;
}

type SortMode = "time" | "files";

function sortThreads(threads: ThreadInfo[], mode: SortMode): ThreadInfo[] {
  return [...threads].sort((a, b) => {
    if (a.status === "active" && b.status !== "active") return -1;
    if (b.status === "active" && a.status !== "active") return 1;

    if (mode === "files") {
      if (a.isCodeThread && !b.isCodeThread) return -1;
      if (!a.isCodeThread && b.isCodeThread) return 1;
      if (a.fileCount !== b.fileCount) return b.fileCount - a.fileCount;
    }

    return new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime();
  });
}

function buildNotifications(memories: Memory[], divergentPairs: ReturnType<typeof findDivergentThreads>): Notification[] {
  const notifications: Notification[] = [];

  // Divergence alerts
  for (const pair of divergentPairs) {
    const pct = Math.round(pair.divergence * 100);
    notifications.push({
      id: `div::${pair.threadA.agent}::${pair.threadA.sessionId}||${pair.threadB.agent}::${pair.threadB.sessionId}`,
      type: "divergence",
      message: `${pair.threadA.agent} and ${pair.threadB.agent} threads diverged ${pct}%`,
      timestamp: new Date().toISOString(),
      icon: "\u26A0",
    });
  }

  // Agent connections (last 10)
  const connections = memories
    .filter((m) => (m.metadata as Record<string, unknown>)?.event === "agent_connected")
    .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
    .slice(0, 10);

  for (const m of connections) {
    notifications.push({
      id: `conn::${m.id}`,
      type: "connection",
      message: `${m.agent} connected`,
      timestamp: m.ts,
      icon: "\u2192",
    });
  }

  // Session events (last 10)
  const sessionEvents = memories
    .filter((m) => {
      const event = (m.metadata as Record<string, unknown>)?.event;
      return event === "session_start" || event === "session_end";
    })
    .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
    .slice(0, 10);

  for (const m of sessionEvents) {
    const event = (m.metadata as Record<string, unknown>)?.event;
    const label = event === "session_start" ? "started a session" : "ended a session";
    notifications.push({
      id: `sess::${m.id}`,
      type: "session",
      message: `${m.agent} ${label}`,
      timestamp: m.ts,
      icon: event === "session_start" ? "\u25B6" : "\u25A0",
    });
  }

  return notifications;
}

export function ThreadTree() {
  const { room } = useRoomContext();
  const { slug } = useParams<{ slug: string }>();
  const { memories } = useRealtimeMemories(room?.id ?? null, 500);
  const navigate = useNavigate();

  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(
    new Set()
  );
  const [sortMode, setSortMode] = useState<SortMode | null>(null);
  const [dismissedNotifications, setDismissedNotifications] = useState<
    Set<string>
  >(new Set());
  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  // Filter state
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
  const [agentFilter, setAgentFilter] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set());

  // Close notification dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false);
      }
    }
    if (bellOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [bellOpen]);

  const rawThreads = buildThreads(memories);

  // Phase 1: Filter out connection-event-only threads
  const filteredThreads = rawThreads.filter(
    (t) =>
      !t.memories.every(
        (m) =>
          (m.metadata as Record<string, unknown>)?.event === "agent_connected"
      )
  );

  // Auto-detect sort mode
  const effectiveSortMode: SortMode =
    sortMode ?? (filteredThreads.some((t) => t.isCodeThread) ? "files" : "time");

  // Divergence notifications (high divergence only, >= 0.7)
  const divergentPairs = useMemo(
    () => findDivergentThreads(memories, 0.7),
    [memories]
  );

  // Build notification feed
  const allNotifications = useMemo(
    () => buildNotifications(memories, divergentPairs),
    [memories, divergentPairs]
  );

  const activeNotifications = allNotifications.filter(
    (n) => !dismissedNotifications.has(n.id)
  );

  function dismissNotification(id: string) {
    setDismissedNotifications((prev) => new Set(prev).add(id));
  }

  // Derive tags per thread (memoized)
  const threadTagsMap = useMemo(() => {
    const map = new Map<string, ThreadTag[]>();
    for (const t of filteredThreads) {
      const key = `${t.agent}::${t.sessionId}`;
      map.set(key, deriveThreadTags(t));
    }
    return map;
  }, [filteredThreads]);

  // Collect all unique agents for filter bar
  const allAgents = useMemo(
    () => Array.from(new Set(filteredThreads.map((t) => t.user))),
    [filteredThreads]
  );

  // Phase 3: Filter bar logic
  const displayThreads = useMemo(() => {
    return filteredThreads.filter((t) => {
      if (statusFilter.size && !statusFilter.has(t.status)) return false;
      if (agentFilter.size && !agentFilter.has(t.user)) return false;
      if (typeFilter.size) {
        const tags = threadTagsMap.get(`${t.agent}::${t.sessionId}`) || [];
        const tagKeys = new Set(tags.map((tg) => tg.key));
        let match = false;
        for (const f of typeFilter) {
          if (tagKeys.has(f)) { match = true; break; }
        }
        if (!match) return false;
      }
      return true;
    });
  }, [filteredThreads, statusFilter, agentFilter, typeFilter, threadTagsMap]);

  // Group threads by user, then sort within each group
  const agentThreads = new Map<string, ThreadInfo[]>();
  for (const t of displayThreads) {
    const list = agentThreads.get(t.user) || [];
    list.push(t);
    agentThreads.set(t.user, list);
  }
  for (const [agent, ts] of agentThreads) {
    agentThreads.set(agent, sortThreads(ts, effectiveSortMode));
  }

  function toggleExpand(threadKey: string) {
    setExpandedThreads((prev) => {
      const next = new Set(prev);
      if (next.has(threadKey)) {
        next.delete(threadKey);
      } else {
        next.add(threadKey);
      }
      return next;
    });
  }

  function toggleFilter(
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
    value: string
  ) {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
  }

  function handleTagClick(e: React.MouseEvent, tag: ThreadTag) {
    e.stopPropagation();
    if (tag.key.startsWith("status:")) {
      toggleFilter(setStatusFilter, tag.key.split(":")[1]);
    } else if (tag.key.startsWith("type:")) {
      toggleFilter(setTypeFilter, tag.key);
    }
  }

  function clearAllFilters() {
    setStatusFilter(new Set());
    setAgentFilter(new Set());
    setTypeFilter(new Set());
  }

  function compactLabel(thread: ThreadInfo): string {
    if (thread.filePaths.length > 0) {
      const names = thread.filePaths
        .slice(0, 3)
        .map((p) => p.split("/").pop() || p);
      return names.join(", ") + (thread.filePaths.length > 3 ? "..." : "");
    }
    return thread.task.slice(0, 60) + (thread.task.length > 60 ? "..." : "");
  }

  const hasActiveFilters = statusFilter.size > 0 || agentFilter.size > 0 || typeFilter.size > 0;

  if (!filteredThreads.length) {
    return (
      <div className="thread-tree">
        <h2 className="section-title">Threads</h2>
        <ConnectAgent slug={slug || ""} />
      </div>
    );
  }

  return (
    <div className="thread-tree">
      <div className="thread-tree-header">
        <h2 className="section-title">Threads</h2>
        <div className="thread-sort-toggle">
          <button
            className={`sort-btn ${effectiveSortMode === "time" ? "sort-btn-active" : ""}`}
            onClick={() => setSortMode("time")}
          >
            Time
          </button>
          <button
            className={`sort-btn ${effectiveSortMode === "files" ? "sort-btn-active" : ""}`}
            onClick={() => setSortMode("files")}
          >
            Files
          </button>
        </div>

        {/* Notification bell */}
        <div className="notification-bell-wrapper" ref={bellRef}>
          <button
            className="notification-bell"
            onClick={() => setBellOpen((prev) => !prev)}
            title="Notifications"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {activeNotifications.length > 0 && (
              <span className="notification-badge">
                {activeNotifications.length}
              </span>
            )}
          </button>

          {bellOpen && (
            <div className="notification-dropdown">
              <div className="notification-dropdown-header">
                Notifications
                <span className="notification-dropdown-count">
                  {activeNotifications.length}
                </span>
              </div>
              {activeNotifications.length === 0 ? (
                <div className="notification-empty">All clear</div>
              ) : (
                <div className="notification-list">
                  {activeNotifications.map((n) => (
                    <div key={n.id} className={`notification-item notification-${n.type}`}>
                      <span className="notification-icon">{n.icon}</span>
                      <div className="notification-content">
                        <span className="notification-message">{n.message}</span>
                        <span className="notification-time">{timeAgo(n.timestamp)}</span>
                      </div>
                      <button
                        className="notification-dismiss"
                        onClick={() => dismissNotification(n.id)}
                        title="Dismiss"
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <button
          className="btn-remix-new"
          onClick={() => navigate(`/r/${slug}/remix/new`)}
        >
          + New Remix
        </button>
      </div>

      {/* Filter bar */}
      <div className="thread-filter-bar">
        <div className="filter-group">
          <span className="filter-group-label">Status</span>
          {(["active", "finished", "idle"] as const).map((s) => (
            <button
              key={s}
              className={`filter-chip ${statusFilter.has(s) ? "filter-chip-active" : ""}`}
              onClick={() => toggleFilter(setStatusFilter, s)}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="filter-group">
          <span className="filter-group-label">Agent</span>
          {allAgents.map((a) => (
            <button
              key={a}
              className={`filter-chip ${agentFilter.has(a) ? "filter-chip-active" : ""}`}
              onClick={() => toggleFilter(setAgentFilter, a)}
              style={agentFilter.has(a) ? { borderColor: agentColor(a), color: agentColor(a) } : undefined}
            >
              {a}
            </button>
          ))}
        </div>
        <div className="filter-group">
          <span className="filter-group-label">Type</span>
          {[
            { key: "type:has-files", label: "Has Files" },
            { key: "type:heavy-tool", label: "Heavy Tool" },
            { key: "type:mixed", label: "Mixed" },
          ].map((ft) => (
            <button
              key={ft.key}
              className={`filter-chip ${typeFilter.has(ft.key) ? "filter-chip-active" : ""}`}
              onClick={() => toggleFilter(setTypeFilter, ft.key)}
            >
              {ft.label}
            </button>
          ))}
        </div>
      </div>

      {/* Active filters row */}
      {hasActiveFilters && (
        <div className="filter-active-row">
          {Array.from(statusFilter).map((s) => (
            <span key={`s-${s}`} className="filter-active-chip" onClick={() => toggleFilter(setStatusFilter, s)}>
              {s} &times;
            </span>
          ))}
          {Array.from(agentFilter).map((a) => (
            <span key={`a-${a}`} className="filter-active-chip" onClick={() => toggleFilter(setAgentFilter, a)}>
              {a} &times;
            </span>
          ))}
          {Array.from(typeFilter).map((t) => (
            <span key={`t-${t}`} className="filter-active-chip" onClick={() => toggleFilter(setTypeFilter, t)}>
              {t.replace("type:", "")} &times;
            </span>
          ))}
          <button className="filter-clear-all" onClick={clearAllFilters}>
            Clear all
          </button>
        </div>
      )}

      <div className="thread-tree-container">
        {Array.from(agentThreads.entries()).map(([agent, agentTs]) => (
          <div key={agent} className="thread-agent-group">
            <div className="thread-agent-label">
              <span
                className="thread-agent-dot"
                style={{
                  background: agentTs.some((t) => t.status === "active")
                    ? "#489664"
                    : agentColor(agent),
                }}
              />
              <span style={{ color: agentColor(agent) }}>{agent}</span>
              <span className="thread-count">
                {agentTs.length} thread{agentTs.length !== 1 ? "s" : ""}
              </span>
            </div>

            <div className="thread-branches">
              {agentTs.map((thread) => {
                const key = `${thread.agent}::${thread.sessionId}`;
                const tags = threadTagsMap.get(key) || [];
                const isExpanded = expandedThreads.has(key);

                if (!isExpanded) {
                  return (
                    <div
                      key={thread.sessionId}
                      className={`thread-card thread-card-collapsed thread-${thread.status}`}
                      onClick={() => toggleExpand(key)}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(
                          "application/remix-thread",
                          JSON.stringify({
                            agent: thread.agent,
                            sessionId: thread.sessionId,
                          })
                        );
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                    >
                      <div className="thread-card-compact-row">
                        <span
                          className={`thread-status-dot status-${thread.status}`}
                        />
                        <span className="thread-compact-label">
                          {compactLabel(thread)}
                        </span>
                        <div className="thread-tags">
                          {tags.map((tag) => (
                            <span
                              key={tag.key}
                              className="thread-tag"
                              style={{ background: `${tag.color}18`, color: tag.color, borderColor: `${tag.color}40` }}
                              onClick={(e) => handleTagClick(e, tag)}
                              title={`Filter by ${tag.label}`}
                            >
                              {tag.label}
                            </span>
                          ))}
                        </div>
                        <span className="thread-compact-time">
                          {timeAgo(thread.lastSeen)}
                        </span>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={thread.sessionId}
                    className={`thread-card thread-card-expanded thread-${thread.status}`}
                    onClick={() => toggleExpand(key)}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(
                        "application/remix-thread",
                        JSON.stringify({
                          agent: thread.agent,
                          sessionId: thread.sessionId,
                        })
                      );
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                  >
                    <div className="thread-card-top">
                      <span
                        className={`thread-status-dot status-${thread.status}`}
                      />
                      <span className="thread-session-id">
                        {thread.sessionId.slice(0, 20)}...
                      </span>
                      <div className="thread-tags">
                        {tags.map((tag) => (
                          <span
                            key={tag.key}
                            className="thread-tag"
                            style={{ background: `${tag.color}18`, color: tag.color, borderColor: `${tag.color}40` }}
                            onClick={(e) => handleTagClick(e, tag)}
                            title={`Filter by ${tag.label}`}
                          >
                            {tag.label}
                          </span>
                        ))}
                      </div>
                      <span className="thread-duration">
                        {thread.duration}
                      </span>
                    </div>

                    <p className="thread-task">
                      {thread.task.slice(0, 120)}
                      {thread.task.length > 120 ? "..." : ""}
                    </p>

                    {thread.filePaths.length > 0 && (
                      <div className="thread-files-list">
                        {thread.filePaths.slice(0, 8).map((fp) => (
                          <span key={fp} className="file-tag">
                            {fp.split("/").pop() || fp}
                          </span>
                        ))}
                        {thread.filePaths.length > 8 && (
                          <span className="file-tag">
                            +{thread.filePaths.length - 8} more
                          </span>
                        )}
                      </div>
                    )}

                    <div className="thread-card-bottom">
                      <span>{thread.memories.length} memories</span>
                      <span>{timeAgo(thread.lastSeen)}</span>
                    </div>

                    <button
                      className="thread-go-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(
                          `/r/${slug}/thread/${encodeURIComponent(thread.agent)}/${encodeURIComponent(thread.sessionId)}`
                        );
                      }}
                    >
                      View thread &rarr;
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
