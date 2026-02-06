import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useRealtimeMemories } from "../hooks/useRealtimeMemories";
import { useRoomContext } from "../context/RoomContext";
import { useNavigate, useParams } from "react-router-dom";
import { supabase, type Memory } from "../lib/supabase";
import {
  summarizeThread,
  type ThreadSummary,
} from "../lib/threadSimilarity";
import { ConnectAgent } from "./ConnectAgent";
import { agentColor } from "../lib/agentColor";
import { MemoryCard } from "./MemoryCard";
import { SessionGraph } from "./SessionGraph";
import { ANIMAL_SPRITES } from "./animalSprites";
import { useRealtimeLinks } from "../hooks/useRealtimeLinks";

// --- Pixel creature palette (matches MiniRemix / SessionGraph) ---

const AGENT_PALETTE = [
  "#E64980", "#CC5DE8", "#845EF7", "#5C7CFA",
  "#339AF0", "#22B8CF", "#20C997", "#51CF66",
  "#94D82D", "#FCC419", "#FF922B", "#E8590C",
];

function agentColorHex(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AGENT_PALETTE[Math.abs(hash) % AGENT_PALETTE.length];
}

function getAnimalSprite(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 7) - hash + name.charCodeAt(i)) | 0;
  }
  return ANIMAL_SPRITES[Math.abs(hash) % ANIMAL_SPRITES.length];
}

function PixelCreature({ name, size = 20 }: { name: string; size?: number }) {
  const sprite = useMemo(() => getAnimalSprite(name), [name]);
  const color = agentColorHex(name);
  const ROWS = sprite.grid.length;
  const COLS = sprite.grid[0].length;

  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);

  const dark = `rgb(${Math.round(r * 0.25)},${Math.round(g * 0.25)},${Math.round(b * 0.25)})`;
  const mid = color;
  const light = `rgb(${Math.min(255, Math.round(r * 1.3 + 40))},${Math.min(255, Math.round(g * 1.3 + 40))},${Math.min(255, Math.round(b * 1.3 + 40))})`;

  const fills = ["", dark, mid, light];

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${COLS} ${ROWS}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ imageRendering: "pixelated", flexShrink: 0 }}
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
            />
          );
        })
      )}
    </svg>
  );
}

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

    const ACTIVE_THRESHOLD = 30 * 60 * 1000; // 30 minutes
    const isRecent = Date.now() - new Date(last.ts).getTime() < ACTIVE_THRESHOLD;

    let status: "active" | "finished" | "idle" = "idle";
    let task = "";

    if (endEvent) {
      status = "finished";
      task = String(
        (endEvent.metadata as Record<string, unknown>)?.summary || ""
      );
    } else if (startEvent) {
      // Only "active" if there's recent activity — otherwise stale unclosed session
      status = isRecent ? "active" : "idle";
      task = String(
        (startEvent.metadata as Record<string, unknown>)?.task || ""
      );
    } else if (isRecent) {
      status = "active";
    }

    // Skip ghost sessions: 1 memory, not recent, not active
    if (sorted.length <= 1 && !isRecent && status !== "active") {
      continue;
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


export function ThreadTree() {
  const { room } = useRoomContext();
  const { slug } = useParams<{ slug: string }>();
  const { memories } = useRealtimeMemories(room?.id ?? null, 500);
  const { links } = useRealtimeLinks(room?.id ?? null);
  const navigate = useNavigate();

  // Split pane state
  const [selectedThread, setSelectedThread] = useState<{ agent: string; sessionId: string } | null>(null);

  const [sortMode, setSortMode] = useState<SortMode | null>(null);

  // Link creation state
  const [linkingMemory, setLinkingMemory] = useState<string | null>(null); // memory ID being linked
  const [linkTarget, setLinkTarget] = useState<{ agent: string; sessionId: string } | null>(null);
  const [linkType, setLinkType] = useState<"reference" | "inject" | "fork">("reference");
  const [linkSending, setLinkSending] = useState(false);

  // Filter state
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
  const [agentFilter, setAgentFilter] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set());

  // Pipeline state
  const [pipelineOpen, setPipelineOpen] = useState(true);

  // Inject state
  const [injectOpen, setInjectOpen] = useState(false);
  const [injectTarget, setInjectTarget] = useState("all");
  const [injectContent, setInjectContent] = useState("");
  const [injectPriority, setInjectPriority] = useState<"normal" | "high" | "urgent">("normal");
  const [injectSending, setInjectSending] = useState(false);
  const injectRef = useRef<HTMLDivElement>(null);

  // Close inject panel on outside click
  useEffect(() => {
    if (!injectOpen) return;
    function handleClick(e: MouseEvent) {
      if (injectRef.current && !injectRef.current.contains(e.target as Node)) {
        setInjectOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [injectOpen]);

  const handleInject = useCallback(async () => {
    if (!injectContent.trim() || !room) return;
    setInjectSending(true);
    try {
      await supabase.from("memories").insert({
        room_id: room.id,
        agent: "web-user",
        session_id: `web_${Date.now()}`,
        message_type: "injection",
        content: `[INJECT → ${injectTarget}]: ${injectContent}`,
        token_count: Math.floor(injectContent.length / 4),
        metadata: {
          event: "context_injection",
          from_agent: "web-user",
          target_agent: injectTarget,
          priority: injectPriority,
          label: null,
        },
      });
      setInjectContent("");
      setInjectOpen(false);
    } finally {
      setInjectSending(false);
    }
  }, [injectContent, injectTarget, injectPriority, room]);

  function openInjectFor(agent: string) {
    setInjectTarget(agent);
    setInjectOpen(true);
  }

  const handleCreateLink = useCallback(async () => {
    if (!linkingMemory || !linkTarget || !room) return;
    setLinkSending(true);
    try {
      await supabase.from("links").insert({
        room_id: room.id,
        source_memory_id: linkingMemory,
        target_agent: linkTarget.agent,
        target_session_id: linkTarget.sessionId,
        target_position: "head",
        link_type: linkType,
        created_by: "web-user",
        label: null,
        metadata: {},
      });
      setLinkingMemory(null);
      setLinkTarget(null);
    } finally {
      setLinkSending(false);
    }
  }, [linkingMemory, linkTarget, linkType, room]);

  const handleDeleteLink = useCallback(async (linkId: string) => {
    await supabase.from("links").delete().eq("id", linkId);
  }, []);

  const rawThreads = buildThreads(memories);

  // Phase 1: Filter out connection-event-only threads
  const filteredThreads = rawThreads.filter(
    (t) =>
      !t.memories.every(
        (m) =>
          (m.metadata as Record<string, unknown>)?.event === "agent_connected"
      )
  );

  // Injection pipeline data
  const injectionData = useMemo(() => {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const injections = memories.filter(
      (m) =>
        m.message_type === "injection" &&
        (m.metadata as Record<string, unknown>)?.event === "context_injection" &&
        new Date(m.ts).getTime() > oneHourAgo
    );

    // Build a map of each agent's latest activity timestamp
    const agentLastSeen = new Map<string, number>();
    for (const t of filteredThreads) {
      const existing = agentLastSeen.get(t.user) ?? 0;
      const ts = new Date(t.lastSeen).getTime();
      if (ts > existing) agentLastSeen.set(t.user, ts);
    }

    const items = injections
      .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
      .map((m) => {
        const meta = m.metadata as Record<string, unknown>;
        const target = String(meta?.target_agent ?? "all");
        const from = String(meta?.from_agent ?? m.agent);
        const priority = String(meta?.priority ?? "normal") as "normal" | "high" | "urgent";
        const injectionTs = new Date(m.ts).getTime();

        // Delivery heuristic: target agent has activity after injection time
        let delivered = false;
        if (target === "all") {
          // For "all" — delivered if any agent has activity after injection
          for (const [, lastTs] of agentLastSeen) {
            if (lastTs > injectionTs) { delivered = true; break; }
          }
        } else {
          const lastTs = agentLastSeen.get(target) ?? 0;
          delivered = lastTs > injectionTs;
        }

        return {
          id: m.id,
          from,
          target,
          content: m.content?.replace(/^\[INJECT[^\]]*\]:\s*/, "") ?? "",
          ts: m.ts,
          priority,
          delivered,
        };
      });

    const sent = items.length;
    const delivered = items.filter((i) => i.delivered).length;

    return { items, sent, stored: sent, delivered, seen: delivered };
  }, [memories, filteredThreads]);

  // Auto-detect sort mode
  const effectiveSortMode: SortMode =
    sortMode ?? (filteredThreads.some((t) => t.isCodeThread) ? "files" : "time");

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
    return thread.task.slice(0, 120) + (thread.task.length > 120 ? "..." : "");
  }

  const hasActiveFilters = statusFilter.size > 0 || agentFilter.size > 0 || typeFilter.size > 0;

  // Get selected thread's memories for detail pane
  const selectedThreadInfo = useMemo(() => {
    if (!selectedThread) return null;
    return displayThreads.find(
      (t) => t.agent === selectedThread.agent && t.sessionId === selectedThread.sessionId
    ) ?? null;
  }, [selectedThread, displayThreads]);

  const selectedMemories = useMemo(() => {
    if (!selectedThreadInfo) return [];
    return [...selectedThreadInfo.memories].sort(
      (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime()
    );
  }, [selectedThreadInfo]);

  // Links involving the selected thread (as source or target)
  const selectedThreadLinks = useMemo(() => {
    if (!selectedThreadInfo) return [];
    const memIds = new Set(selectedThreadInfo.memories.map((m) => m.id));
    return links.filter(
      (l) =>
        memIds.has(l.source_memory_id) ||
        (l.target_agent === selectedThreadInfo.agent &&
          l.target_session_id === selectedThreadInfo.sessionId)
    );
  }, [links, selectedThreadInfo]);

  // All sessions for link target picker
  const allSessions = useMemo(() => {
    return filteredThreads.map((t) => ({
      agent: t.agent,
      sessionId: t.sessionId,
      user: t.user,
      label: t.task.slice(0, 60) || t.sessionId.slice(0, 20),
    }));
  }, [filteredThreads]);

  // Only show connect screen if we have loaded memories and there are genuinely no threads
  if (!filteredThreads.length && memories.length === 0) {
    return (
      <div className="thread-tree">
        <h2 className="section-title">Threads</h2>
        {room ? <ConnectAgent slug={slug || ""} /> : null}
      </div>
    );
  }

  return (
    <div className="thread-tree">
      <div className="thread-tree-header">
        <h2 className="section-title">Threads</h2>

        <button
          className="btn-inject"
          onClick={() => { setInjectTarget("all"); setInjectOpen((prev) => !prev); }}
          title="Inject context to agents"
        >
          Inject
        </button>

        <button
          className="btn-remix-new"
          onClick={() => navigate(`/r/${slug}/remix/new`)}
        >
          + New Session
        </button>
      </div>

      {/* Inject panel */}
      {injectOpen && (
        <div className="inject-panel" ref={injectRef}>
          <div className="inject-panel-header">
            <span>Inject context</span>
            <button className="inject-close" onClick={() => setInjectOpen(false)}>&times;</button>
          </div>
          <div className="inject-row">
            <label className="inject-label">To</label>
            <select
              className="inject-select"
              value={injectTarget}
              onChange={(e) => setInjectTarget(e.target.value)}
            >
              <option value="all">All agents</option>
              {allAgents.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <div className="inject-priority-group">
              {(["normal", "high", "urgent"] as const).map((p) => (
                <button
                  key={p}
                  className={`inject-priority-btn ${injectPriority === p ? `inject-priority-${p}` : ""}`}
                  onClick={() => setInjectPriority(p)}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div className="inject-input-row">
            <textarea
              className="inject-textarea"
              placeholder="Context, instructions, or feedback..."
              value={injectContent}
              onChange={(e) => setInjectContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  handleInject();
                }
              }}
              rows={3}
            />
            <button
              className="inject-send"
              onClick={handleInject}
              disabled={injectSending || !injectContent.trim()}
            >
              {injectSending ? "..." : "Send"}
            </button>
          </div>
        </div>
      )}

      {/* Injection Pipeline */}
      {injectionData.sent > 0 && (
        <div className="injection-pipeline">
          <div
            className="injection-pipeline-header"
            onClick={() => setPipelineOpen((p) => !p)}
          >
            <span className="injection-pipeline-title">Injection Pipeline</span>
            <span className="injection-pipeline-badge">{injectionData.sent}</span>
            <span className="injection-pipeline-toggle">
              {pipelineOpen ? "\u25BE" : "\u25B8"}
            </span>
          </div>

          {pipelineOpen && (
            <div className="injection-pipeline-body">
              <div className="injection-pipeline-stages">
                <div className="pipeline-stage">
                  <span className="pipeline-stage-label">Source</span>
                  <span className="pipeline-stage-count">{injectionData.sent} sent</span>
                </div>
                <span className="pipeline-arrow">&rarr;</span>
                <div className="pipeline-stage">
                  <span className="pipeline-stage-label">Supabase</span>
                  <span className="pipeline-stage-count">{injectionData.stored} stored</span>
                </div>
                <span className="pipeline-arrow">&rarr;</span>
                <div className="pipeline-stage">
                  <span className="pipeline-stage-label">Piggyback</span>
                  <span className="pipeline-stage-count">{injectionData.delivered} delivered</span>
                </div>
                <span className="pipeline-arrow">&rarr;</span>
                <div className="pipeline-stage">
                  <span className="pipeline-stage-label">Agent</span>
                  <span className="pipeline-stage-count">{injectionData.seen} seen</span>
                </div>
              </div>

              <div className="injection-recent-list">
                <span className="injection-recent-label">Recent:</span>
                {injectionData.items.slice(0, 8).map((inj) => (
                  <div key={inj.id} className="injection-recent-item">
                    <span
                      className={`injection-priority-dot priority-${inj.priority}`}
                      title={inj.priority}
                    />
                    <span className="injection-route">
                      {inj.from} &rarr; {inj.target}
                    </span>
                    <span className="injection-preview">
                      {inj.content.slice(0, 50)}{inj.content.length > 50 ? "..." : ""}
                    </span>
                    <span className="injection-time">{timeAgo(inj.ts)}</span>
                    <span
                      className={`injection-status ${inj.delivered ? "injection-delivered" : "injection-pending"}`}
                      title={inj.delivered ? "Delivered" : "Pending"}
                    >
                      {inj.delivered ? "\u2713" : "\u23F3"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Compact filter bar */}
      <div className="thread-filter-bar">
        <div className="filter-group">
          <span className="filter-group-label">Order</span>
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
        </div>
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

      {/* Split pane: thread list + detail + graph */}
      <div className={`thread-split ${!selectedThreadInfo ? "thread-split-no-detail" : ""}`}>
        {/* Left pane — vertical thread list */}
        <div className="thread-list-pane">
          {Array.from(agentThreads.entries()).map(([agent, agentTs]) => (
            <div key={agent} className="thread-agent-group">
              <div className="thread-agent-label">
                <PixelCreature name={agent} size={18} />
                <span style={{ color: agentColorHex(agent) }}>{agent}</span>
                <button
                  className="inject-agent-btn"
                  onClick={(e) => { e.stopPropagation(); openInjectFor(agent); }}
                  title={`Inject context to ${agent}`}
                >
                  &#x21E8;
                </button>
                <span className="thread-count">
                  {agentTs.length} thread{agentTs.length !== 1 ? "s" : ""}
                </span>
              </div>

              <div className="thread-branches">
                {agentTs.map((thread) => {
                  const isSelected =
                    selectedThread?.agent === thread.agent &&
                    selectedThread?.sessionId === thread.sessionId;

                  return (
                    <div
                      key={thread.sessionId}
                      className={`thread-card thread-card-collapsed thread-${thread.status} ${isSelected ? "thread-card-selected" : ""}`}
                      onClick={() => {
                        setSelectedThread({ agent: thread.agent, sessionId: thread.sessionId });
                      }}
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
                        <span className="thread-compact-count">
                          {thread.memories.length}
                        </span>
                        <span className="thread-compact-time">
                          {timeAgo(thread.lastSeen)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Center pane — thread detail */}
        <div className="thread-detail-pane">
          {selectedThreadInfo ? (
            <div className="thread-inline-detail">
              <div className="thread-detail-header">
                <PixelCreature name={selectedThreadInfo.user} size={22} />
                <div className="thread-detail-header-info">
                  <span
                    className="thread-detail-agent"
                    style={{ color: agentColorHex(selectedThreadInfo.user) }}
                  >
                    {selectedThreadInfo.agent}
                  </span>
                  <span className="thread-detail-meta">
                    {selectedThreadInfo.memories.length} memories &middot; {selectedThreadInfo.duration}
                  </span>
                </div>
                <div className="thread-detail-tags">
                  {(threadTagsMap.get(`${selectedThreadInfo.agent}::${selectedThreadInfo.sessionId}`) || []).map((tag) => (
                    <span
                      key={tag.key}
                      className="thread-tag"
                      style={{ background: `${tag.color}18`, color: tag.color, borderColor: `${tag.color}40` }}
                      onClick={(e) => handleTagClick(e, tag)}
                    >
                      {tag.label}
                    </span>
                  ))}
                </div>
                <button
                  className="thread-detail-open-btn"
                  onClick={() =>
                    navigate(
                      `/r/${slug}/thread/${encodeURIComponent(selectedThreadInfo.agent)}/${encodeURIComponent(selectedThreadInfo.sessionId)}`
                    )
                  }
                >
                  Open &rarr;
                </button>
              </div>

              {selectedThreadInfo.task && (
                <p className="thread-view-task">{selectedThreadInfo.task}</p>
              )}

              {/* Links section */}
              {selectedThreadLinks.length > 0 && (
                <div className="thread-links-section">
                  <span className="thread-links-label">Links ({selectedThreadLinks.length})</span>
                  {selectedThreadLinks.map((l) => (
                    <div key={l.id} className="thread-link-row">
                      <span className={`thread-link-type link-type-${l.link_type}`}>{l.link_type}</span>
                      <span className="thread-link-route">
                        {l.source_memory_id.slice(0, 8)}... &rarr; {l.target_agent.split("/")[0]}/{l.target_session_id.slice(0, 12)}...
                      </span>
                      <span className="thread-link-pos">@{l.target_position}</span>
                      <span className="thread-link-time">{timeAgo(l.ts)}</span>
                      <button
                        className="thread-link-delete"
                        onClick={() => handleDeleteLink(l.id)}
                        title="Remove link"
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Link creation panel */}
              {linkingMemory && (
                <div className="link-create-panel">
                  <div className="link-create-header">
                    <span>Link memory {linkingMemory.slice(0, 8)}...</span>
                    <button className="inject-close" onClick={() => setLinkingMemory(null)}>&times;</button>
                  </div>
                  <div className="link-create-row">
                    <label className="inject-label">To</label>
                    <select
                      className="inject-select"
                      value={linkTarget ? `${linkTarget.agent}::${linkTarget.sessionId}` : ""}
                      onChange={(e) => {
                        const [a, s] = e.target.value.split("::");
                        if (a && s) setLinkTarget({ agent: a, sessionId: s });
                      }}
                    >
                      <option value="">Select session...</option>
                      {allSessions
                        .filter((s) => !(s.agent === selectedThreadInfo.agent && s.sessionId === selectedThreadInfo.sessionId))
                        .map((s) => (
                          <option key={`${s.agent}::${s.sessionId}`} value={`${s.agent}::${s.sessionId}`}>
                            {s.user} - {s.label}
                          </option>
                        ))
                      }
                    </select>
                  </div>
                  <div className="link-create-row">
                    <label className="inject-label">Type</label>
                    <div className="inject-priority-group">
                      {(["reference", "inject", "fork"] as const).map((t) => (
                        <button
                          key={t}
                          className={`inject-priority-btn ${linkType === t ? "inject-priority-normal" : ""}`}
                          onClick={() => setLinkType(t)}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    className="inject-send"
                    onClick={handleCreateLink}
                    disabled={linkSending || !linkTarget}
                    style={{ marginTop: "0.5rem", width: "100%" }}
                  >
                    {linkSending ? "..." : "Create link @head"}
                  </button>
                </div>
              )}

              <div className="feed">
                {selectedMemories.map((m) => {
                  const memLinks = links.filter((l) => l.source_memory_id === m.id);
                  return (
                    <div key={m.id} className="memory-card-with-link">
                      <MemoryCard
                        memory={m}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData(
                            "application/remix-memory",
                            JSON.stringify({ id: m.id })
                          );
                          e.dataTransfer.effectAllowed = "copy";
                        }}
                      />
                      <div className="memory-link-actions">
                        <button
                          className={`memory-link-btn ${linkingMemory === m.id ? "memory-link-btn-active" : ""}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setLinkingMemory(linkingMemory === m.id ? null : m.id);
                            setLinkTarget(null);
                          }}
                          title="Link this memory to another session"
                        >
                          {memLinks.length > 0 ? `${memLinks.length}` : "+"} &#x1F517;
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="thread-detail-empty">
              Select a thread to view details
            </div>
          )}
        </div>

        {/* Right pane — graph always visible */}
        <div className="thread-graph-pane">
          <SessionGraph links={links} />
        </div>
      </div>
    </div>
  );
}
