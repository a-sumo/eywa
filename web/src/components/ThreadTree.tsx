import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useRealtimeMemories } from "../hooks/useRealtimeMemories";
import { useChat } from "../hooks/useChat";
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
import { getAvatar } from "./avatars";
import { useRealtimeLinks } from "../hooks/useRealtimeLinks";

// --- Pixel creature palette (matches MiniEywa / SessionGraph) ---

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

function AgentAvatar({ name, size = 20 }: { name: string; size?: number }) {
  const { avatar, hueRotate, saturate } = useMemo(() => getAvatar(name), [name]);
  return (
    <div
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: "50%",
        overflow: "hidden",
        filter: `hue-rotate(${hueRotate}deg) saturate(${saturate}%)`,
      }}
      dangerouslySetInnerHTML={{ __html: avatar.svg }}
    />
  );
}

interface ThreadInfo {
  agent: string;
  user: string;
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

// Time range options
const TIME_RANGES = [
  { label: "1h", hours: 1 },
  { label: "6h", hours: 6 },
  { label: "24h", hours: 24 },
  { label: "7d", hours: 168 },
  { label: "All", hours: 0 },
];

// Memory type short labels
const TYPE_CHAR: Record<string, string> = {
  user: "U",
  assistant: "A",
  tool_call: "T",
  tool_result: "R",
  injection: "\u2192",
  knowledge: "K",
  resource: "\u00B7",
};


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

  if (thread.status === "active") {
    tags.push({ label: "active", color: "#489664", key: "status:active" });
  } else if (thread.status === "finished") {
    tags.push({ label: "finished", color: "#B45050", key: "status:finished" });
  } else {
    tags.push({ label: "idle", color: "#B48C50", key: "status:idle" });
  }

  if (thread.isCodeThread) {
    tags.push({ label: "has-files", color: "#5570cc", key: "type:has-files" });
  }

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
  const navigate = useNavigate();

  // Time range (hours, 0 = all)
  const [timeRange, setTimeRange] = useState(24);
  const sinceMs = timeRange > 0 ? timeRange * 60 * 60 * 1000 : undefined;

  const { memories } = useRealtimeMemories(room?.id ?? null, 500, sinceMs);
  const { links } = useRealtimeLinks(room?.id ?? null);

  // Embedded chat
  const { messages: chatMessages, send: chatSend } = useChat(room?.id ?? null, "general");
  const [chatInput, setChatInput] = useState("");
  const chatSender = localStorage.getItem("eywa_user") || "anon";
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Thread selection
  const [selectedThread, setSelectedThread] = useState<{ agent: string; sessionId: string } | null>(null);
  const [sortMode, setSortMode] = useState<SortMode | null>(null);

  // Inject state (always visible in right panel)
  const [injectTarget, setInjectTarget] = useState("all");
  const [injectContent, setInjectContent] = useState("");
  const [injectPriority, setInjectPriority] = useState<"normal" | "high" | "urgent">("normal");
  const [injectSending, setInjectSending] = useState(false);

  // Link creation
  const [linkingMemory, setLinkingMemory] = useState<string | null>(null);
  const [linkTarget, setLinkTarget] = useState<{ agent: string; sessionId: string } | null>(null);
  const [linkType, setLinkType] = useState<"reference" | "inject" | "fork">("reference");
  const [linkSending, setLinkSending] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
  const [agentFilter, setAgentFilter] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set());

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const handleInject = useCallback(async () => {
    if (!injectContent.trim() || !room) return;
    setInjectSending(true);
    try {
      await supabase.from("memories").insert({
        room_id: room.id,
        agent: "web-user",
        session_id: `web_${Date.now()}`,
        message_type: "injection",
        content: `[INJECT \u2192 ${injectTarget}]: ${injectContent}`,
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
    } finally {
      setInjectSending(false);
    }
  }, [injectContent, injectTarget, injectPriority, room]);

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

  const handleChatSend = () => {
    const text = chatInput.trim();
    if (!text) return;
    chatSend(chatSender, text);
    setChatInput("");
  };

  const rawThreads = buildThreads(memories);

  // Filter out connection-event-only threads
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

        let delivered = false;
        if (target === "all") {
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

    return { items, sent: items.length, delivered: items.filter((i) => i.delivered).length };
  }, [memories, filteredThreads]);

  const effectiveSortMode: SortMode =
    sortMode ?? (filteredThreads.some((t) => t.isCodeThread) ? "files" : "time");

  const threadTagsMap = useMemo(() => {
    const map = new Map<string, ThreadTag[]>();
    for (const t of filteredThreads) {
      const key = `${t.agent}::${t.sessionId}`;
      map.set(key, deriveThreadTags(t));
    }
    return map;
  }, [filteredThreads]);

  const allAgents = useMemo(
    () => Array.from(new Set(filteredThreads.map((t) => t.user))),
    [filteredThreads]
  );

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
      if (next.has(value)) next.delete(value);
      else next.add(value);
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

  // Selected thread detail
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

  const allSessions = useMemo(() => {
    return filteredThreads.map((t) => ({
      agent: t.agent,
      sessionId: t.sessionId,
      user: t.user,
      label: t.task.slice(0, 60) || t.sessionId.slice(0, 20),
    }));
  }, [filteredThreads]);

  // Empty state
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
        <div className="time-range-toggle">
          {TIME_RANGES.map(({ label, hours }) => (
            <button
              key={hours}
              className={`time-range-btn ${timeRange === hours ? "time-range-active" : ""}`}
              onClick={() => setTimeRange(hours)}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          className="btn-eywa-new"
          onClick={() => navigate(`/r/${slug}/workspace/new`)}
        >
          + New Session
        </button>
      </div>

      {/* Compact filter bar */}
      <div className="thread-filter-bar">
        <div className="filter-group">
          <span className="filter-group-label">Order</span>
          <div className="thread-sort-toggle">
            <button
              className={`sort-btn ${effectiveSortMode === "time" ? "sort-btn-active" : ""}`}
              onClick={() => setSortMode("time")}
            >Time</button>
            <button
              className={`sort-btn ${effectiveSortMode === "files" ? "sort-btn-active" : ""}`}
              onClick={() => setSortMode("files")}
            >Files</button>
          </div>
        </div>
        <div className="filter-group">
          <span className="filter-group-label">Status</span>
          {(["active", "finished", "idle"] as const).map((s) => (
            <button
              key={s}
              className={`filter-chip ${statusFilter.has(s) ? "filter-chip-active" : ""}`}
              onClick={() => toggleFilter(setStatusFilter, s)}
            >{s}</button>
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
            >{a}</button>
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
            >{ft.label}</button>
          ))}
        </div>
      </div>

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
          <button className="filter-clear-all" onClick={clearAllFilters}>Clear all</button>
        </div>
      )}

      {/* Three-panel split: memories | context | chat */}
      <div className="thread-split">
        {/* Left: Memory feed */}
        <div className="thread-memories-pane">
          <div className="pane-header">
            <span>Memories</span>
            <span className="pane-count">{memories.length}</span>
          </div>
          <div className="memories-feed">
            {memories.map((m) => (
              <div
                key={m.id}
                className={`memory-tile ${
                  selectedThread &&
                  m.agent === selectedThread.agent &&
                  m.session_id === selectedThread.sessionId
                    ? "memory-tile-active"
                    : ""
                }`}
                title={`${m.agent} - ${m.message_type}\n${m.content?.slice(0, 200)}`}
                onClick={() => {
                  const thread = displayThreads.find(
                    (t) => t.agent === m.agent && t.sessionId === m.session_id
                  );
                  if (thread) {
                    setSelectedThread({ agent: thread.agent, sessionId: thread.sessionId });
                  }
                }}
              >
                <span className="mt-dot" style={{ background: agentColor(m.agent) }} />
                <span className={`mt-type mt-type-${m.message_type}`}>
                  {TYPE_CHAR[m.message_type] || "\u00B7"}
                </span>
                <span className="mt-text">{m.content?.slice(0, 50) || ""}</span>
                <span className="mt-time">{timeAgo(m.ts)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Mid: Context (threads + detail) */}
        <div className="thread-context-pane">
          <div className="pane-header">
            <span>Context</span>
            <span className="pane-count">{displayThreads.length} threads</span>
          </div>

          {/* Thread list */}
          <div className="context-threads">
            {Array.from(agentThreads.entries()).map(([agent, agentTs]) => (
              <div key={agent} className="thread-agent-group">
                <div className="thread-agent-label">
                  <AgentAvatar name={agent} size={18} />
                  <span style={{ color: agentColorHex(agent) }}>{agent}</span>
                  <button
                    className="inject-agent-btn"
                    onClick={(e) => { e.stopPropagation(); setInjectTarget(agent); }}
                    title={`Inject context to ${agent}`}
                  >&#x21E8;</button>
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
                          setSelectedThread(
                            isSelected ? null : { agent: thread.agent, sessionId: thread.sessionId }
                          );
                        }}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData(
                            "application/eywa-thread",
                            JSON.stringify({
                              agent: thread.agent,
                              sessionId: thread.sessionId,
                            })
                          );
                          e.dataTransfer.effectAllowed = "copy";
                        }}
                      >
                        <div className="thread-card-compact-row">
                          <span className={`thread-status-dot status-${thread.status}`} />
                          <span className="thread-compact-label">{compactLabel(thread)}</span>
                          <span className="thread-compact-count">{thread.memories.length}</span>
                          <span className="thread-compact-time">{timeAgo(thread.lastSeen)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Selected thread detail (inline below thread list) */}
          {selectedThreadInfo && (
            <div className="thread-inline-detail">
              <div className="thread-detail-header">
                <AgentAvatar name={selectedThreadInfo.user} size={22} />
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

              {/* Links */}
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
                      >&times;</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Link creation */}
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
                        ))}
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
                        >{t}</button>
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

              {/* Memory cards */}
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
                            "application/eywa-memory",
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
          )}
        </div>

        {/* Right: Chat + Inject */}
        <div className="thread-chat-pane">
          {/* Inject section */}
          <div className="pane-header">
            <span>Inject</span>
          </div>
          <div className="chat-inject-section">
            <div className="inject-row">
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
                  >{p}</button>
                ))}
              </div>
            </div>
            <div className="inject-input-row">
              <textarea
                className="inject-textarea"
                placeholder="Context, instructions, feedback..."
                value={injectContent}
                onChange={(e) => setInjectContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    handleInject();
                  }
                }}
                rows={2}
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

          {/* Recent injections */}
          {injectionData.items.length > 0 && (
            <div className="chat-injections">
              <div className="chat-injections-header">
                Injections ({injectionData.sent} sent, {injectionData.delivered} delivered)
              </div>
              {injectionData.items.slice(0, 5).map((inj) => (
                <div key={inj.id} className="injection-recent-item">
                  <span
                    className={`injection-priority-dot priority-${inj.priority}`}
                    title={inj.priority}
                  />
                  <span className="injection-route">
                    {inj.from} &rarr; {inj.target}
                  </span>
                  <span className="injection-preview">
                    {inj.content.slice(0, 40)}{inj.content.length > 40 ? "..." : ""}
                  </span>
                  <span
                    className={`injection-status ${inj.delivered ? "injection-delivered" : "injection-pending"}`}
                  >
                    {inj.delivered ? "\u2713" : "\u23F3"}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Chat section */}
          <div className="chat-section">
            <div className="pane-header">
              <span>#general</span>
              <span className="pane-count">{chatSender}</span>
            </div>
            <div className="chat-section-messages">
              {chatMessages.map((m) => (
                <div key={m.id} className="chat-msg-compact">
                  <span className="chat-msg-who">{m.sender}</span>
                  <span className="chat-msg-text">{m.content}</span>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div className="chat-section-input">
              <input
                placeholder="Message..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleChatSend();
                }}
              />
              <button onClick={handleChatSend} disabled={!chatInput.trim()}>
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
