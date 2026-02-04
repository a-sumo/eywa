import { useState, useMemo } from "react";
import { useRealtimeMemories } from "../hooks/useRealtimeMemories";
import { useRoomContext } from "../context/RoomContext";
import { useNavigate, useParams } from "react-router-dom";
import type { Memory } from "../lib/supabase";
import {
  summarizeThread,
  threadDivergence,
  divergenceLevel,
  findDivergentThreads,
  type ThreadSummary,
  type DivergenceLevel,
} from "../lib/threadSimilarity";

interface ThreadInfo {
  agent: string;
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

    threads.push({
      agent: first.agent,
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

  // No sort here — sorting is handled externally by sortMode
  return threads;
}

function DivergenceBadge({
  div,
  level,
  otherAgent,
}: {
  div: number;
  level: DivergenceLevel;
  otherAgent: string;
}) {
  const pct = Math.round(div * 100);
  return (
    <span
      className={`divergence-indicator divergence-${level}`}
      title={`${pct}% diverged from ${otherAgent}'s thread`}
    >
      <span className="divergence-bar">
        <span
          className="divergence-bar-fill"
          style={{ width: `${pct}%` }}
        />
      </span>
      {pct}%
    </span>
  );
}

type SortMode = "time" | "files";

function sortThreads(threads: ThreadInfo[], mode: SortMode): ThreadInfo[] {
  return [...threads].sort((a, b) => {
    // Active threads always pinned to top
    if (a.status === "active" && b.status !== "active") return -1;
    if (b.status === "active" && a.status !== "active") return 1;

    if (mode === "files") {
      // Code threads first
      if (a.isCodeThread && !b.isCodeThread) return -1;
      if (!a.isCodeThread && b.isCodeThread) return 1;
      // Then by file count desc
      if (a.fileCount !== b.fileCount) return b.fileCount - a.fileCount;
    }

    // Fall back to time (most recent first)
    return new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime();
  });
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

  const rawThreads = buildThreads(memories);

  // Auto-detect sort mode: "files" if any thread has files, else "time"
  const effectiveSortMode: SortMode =
    sortMode ?? (rawThreads.some((t) => t.isCodeThread) ? "files" : "time");

  // Compute cross-agent divergence for each thread
  const divergenceMap = useMemo(() => {
    const map = new Map<
      string,
      { div: number; level: DivergenceLevel; otherAgent: string }
    >();

    for (let i = 0; i < rawThreads.length; i++) {
      for (let j = i + 1; j < rawThreads.length; j++) {
        if (rawThreads[i].agent === rawThreads[j].agent) continue;

        const div = threadDivergence(
          rawThreads[i].summary,
          rawThreads[j].summary
        );
        const level = divergenceLevel(div);

        if (div < 0.3) continue;

        const keyI = `${rawThreads[i].agent}::${rawThreads[i].sessionId}`;
        const keyJ = `${rawThreads[j].agent}::${rawThreads[j].sessionId}`;

        const existingI = map.get(keyI);
        if (!existingI || existingI.div < div) {
          map.set(keyI, { div, level, otherAgent: rawThreads[j].agent });
        }

        const existingJ = map.get(keyJ);
        if (!existingJ || existingJ.div < div) {
          map.set(keyJ, { div, level, otherAgent: rawThreads[i].agent });
        }
      }
    }

    return map;
  }, [rawThreads]);

  // Divergence notification toasts (high divergence only, >= 0.7)
  const divergentPairs = useMemo(
    () => findDivergentThreads(memories, 0.7),
    [memories]
  );

  const activeNotifications = divergentPairs.filter((pair) => {
    const key = `${pair.threadA.agent}::${pair.threadA.sessionId}||${pair.threadB.agent}::${pair.threadB.sessionId}`;
    return !dismissedNotifications.has(key);
  });

  function dismissNotification(
    threadA: { agent: string; sessionId: string },
    threadB: { agent: string; sessionId: string }
  ) {
    const key = `${threadA.agent}::${threadA.sessionId}||${threadB.agent}::${threadB.sessionId}`;
    setDismissedNotifications((prev) => new Set(prev).add(key));
  }

  // Group threads by agent, then sort within each group
  const agentThreads = new Map<string, ThreadInfo[]>();
  for (const t of rawThreads) {
    const list = agentThreads.get(t.agent) || [];
    list.push(t);
    agentThreads.set(t.agent, list);
  }
  // Sort within each agent group
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

  function compactLabel(thread: ThreadInfo): string {
    if (thread.filePaths.length > 0) {
      const names = thread.filePaths
        .slice(0, 3)
        .map((p) => p.split("/").pop() || p);
      return names.join(", ") + (thread.filePaths.length > 3 ? "..." : "");
    }
    return thread.task.slice(0, 60) + (thread.task.length > 60 ? "..." : "");
  }

  if (!rawThreads.length) {
    return (
      <div className="thread-tree">
        <h2 className="section-title">Threads</h2>
        <div className="empty-state">
          <div className="empty-state-icon">&#128464;</div>
          <h3 className="empty-state-title">No threads yet</h3>
          <p className="empty-state-desc">
            Connect an AI agent to start seeing threads
          </p>
        </div>
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
        <button
          className="btn-remix-new"
          onClick={() => navigate(`/r/${slug}/remix/new`)}
        >
          + New Remix
        </button>
      </div>

      {activeNotifications.length > 0 && (
        <div className="divergence-toasts">
          {activeNotifications.map((pair) => {
            const pct = Math.round(pair.divergence * 100);
            return (
              <div
                key={`${pair.threadA.agent}::${pair.threadA.sessionId}||${pair.threadB.agent}::${pair.threadB.sessionId}`}
                className={`divergence-toast ${pair.level === "high" ? "divergence-toast-high" : ""}`}
              >
                <span className="divergence-toast-text">
                  <strong>{pair.threadA.agent}</strong> and{" "}
                  <strong>{pair.threadB.agent}</strong> threads have diverged{" "}
                  {pct}%
                </span>
                <button
                  className="divergence-toast-dismiss"
                  onClick={() =>
                    dismissNotification(pair.threadA, pair.threadB)
                  }
                >
                  Dismiss
                </button>
              </div>
            );
          })}
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
                const divInfo = divergenceMap.get(key);
                const isExpanded = expandedThreads.has(key);

                if (!isExpanded) {
                  // Collapsed compact card
                  return (
                    <div
                      key={thread.sessionId}
                      className={`thread-card thread-card-collapsed thread-${thread.status}`}
                      onClick={() => toggleExpand(key)}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(
                          "application/neuralmesh-thread",
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
                        <span className="thread-compact-time">
                          {timeAgo(thread.lastSeen)}
                        </span>
                      </div>
                    </div>
                  );
                }

                // Expanded full card
                return (
                  <div
                    key={thread.sessionId}
                    className={`thread-card thread-card-expanded thread-${thread.status}`}
                    onClick={() => toggleExpand(key)}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(
                        "application/neuralmesh-thread",
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
                      {divInfo && (
                        <DivergenceBadge
                          div={divInfo.div}
                          level={divInfo.level}
                          otherAgent={divInfo.otherAgent}
                        />
                      )}
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
