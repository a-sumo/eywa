import { useMemo } from "react";
import { useRealtimeMemories } from "../hooks/useRealtimeMemories";
import { useRoomContext } from "../context/RoomContext";
import { useNavigate, useParams } from "react-router-dom";
import type { Memory } from "../lib/supabase";
import {
  summarizeThread,
  threadDivergence,
  divergenceLevel,
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

    threads.push({
      agent: first.agent,
      sessionId: first.session_id,
      memories: sorted,
      status,
      task: task || last.content?.slice(0, 100) || "",
      duration: formatDuration(duration),
      lastSeen: last.ts,
      summary: summarizeThread(sorted),
    });
  }

  threads.sort((a, b) => {
    if (a.status === "active" && b.status !== "active") return -1;
    if (b.status === "active" && a.status !== "active") return 1;
    return new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime();
  });

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

export function ThreadTree() {
  const { room } = useRoomContext();
  const { slug } = useParams<{ slug: string }>();
  const { memories } = useRealtimeMemories(room?.id ?? null, 500);
  const navigate = useNavigate();

  const threads = buildThreads(memories);

  // Compute cross-agent divergence for each thread
  const divergenceMap = useMemo(() => {
    const map = new Map<
      string,
      { div: number; level: DivergenceLevel; otherAgent: string }
    >();

    for (let i = 0; i < threads.length; i++) {
      for (let j = i + 1; j < threads.length; j++) {
        if (threads[i].agent === threads[j].agent) continue;

        const div = threadDivergence(threads[i].summary, threads[j].summary);
        const level = divergenceLevel(div);

        // Only show if there's meaningful divergence
        if (div < 0.3) continue;

        const keyI = `${threads[i].agent}::${threads[i].sessionId}`;
        const keyJ = `${threads[j].agent}::${threads[j].sessionId}`;

        const existingI = map.get(keyI);
        if (!existingI || existingI.div < div) {
          map.set(keyI, { div, level, otherAgent: threads[j].agent });
        }

        const existingJ = map.get(keyJ);
        if (!existingJ || existingJ.div < div) {
          map.set(keyJ, { div, level, otherAgent: threads[i].agent });
        }
      }
    }

    return map;
  }, [threads]);

  // Group threads by agent
  const agentThreads = new Map<string, ThreadInfo[]>();
  for (const t of threads) {
    const list = agentThreads.get(t.agent) || [];
    list.push(t);
    agentThreads.set(t.agent, list);
  }

  if (!threads.length) {
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
        <button
          className="btn-remix-new"
          onClick={() => navigate(`/r/${slug}/remix/new`)}
        >
          + New Remix
        </button>
      </div>

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

                return (
                  <div
                    key={thread.sessionId}
                    className={`thread-card thread-${thread.status}`}
                    onClick={() =>
                      navigate(
                        `/r/${slug}/thread/${encodeURIComponent(thread.agent)}/${encodeURIComponent(thread.sessionId)}`
                      )
                    }
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

                    <div className="thread-card-bottom">
                      <span>{thread.memories.length} memories</span>
                      <span>{timeAgo(thread.lastSeen)}</span>
                    </div>
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
