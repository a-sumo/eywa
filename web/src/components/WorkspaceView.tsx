import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useRealtimeMemories } from "../hooks/useRealtimeMemories";
import { useFoldContext } from "../context/FoldContext";
import { MemoryCard } from "./MemoryCard";
import { useGeminiChat } from "../hooks/useGeminiChat";
import type { Memory } from "../lib/supabase";

function agentColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 45%)`;
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function shortSessionId(sessionId: string): string {
  // Strip "session_" prefix if present, show first 13 chars (date portion)
  const stripped = sessionId.replace(/^session_/, "");
  return stripped.length > 13 ? stripped.slice(0, 13) : stripped;
}

function shortTimestamp(ts: string): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

type GroupMode = "agent" | "session" | "timeline";

interface ThreadGroup {
  agent: string;
  sessionId: string;
  memories: Memory[];
}

interface WorkspaceVersion {
  memoryIds: string[];
  label: string;
  ts: number;
}

export function WorkspaceView() {
  const { t } = useTranslation("fold");
  const { slug } = useParams<{ slug: string }>();
  const { fold } = useFoldContext();
  const navigate = useNavigate();
  const location = useLocation();
  const { memories } = useRealtimeMemories(fold?.id ?? null, 500);

  // Search filter for source panel
  const [search, setSearch] = useState("");

  // Group mode for browse panel
  const [groupMode, setGroupMode] = useState<GroupMode>("session");

  // Expanded threads in source panel
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(
    new Set()
  );

  // Context panel: memories pulled into the workspace
  const [contextIds, setContextIds] = useState<string[]>(() => {
    const state = location.state as {
      seedThread?: { agent: string; sessionId: string };
    } | null;
    if (state?.seedThread) {
      const seedMems = memories
        .filter(
          (m) =>
            m.agent === state.seedThread!.agent &&
            m.session_id === state.seedThread!.sessionId
        )
        .map((m) => m.id);
      return seedMems;
    }
    return [];
  });

  // Version history
  const [history, setHistory] = useState<WorkspaceVersion[]>([
    { memoryIds: [], label: "Start", ts: Date.now() },
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Drop zone state
  const [dragOver, setDragOver] = useState(false);

  // Build thread groups for source panel
  const threadGroups = useMemo(() => {
    const sessionMap = new Map<string, Memory[]>();
    for (const m of memories) {
      const key = `${m.agent}::${m.session_id}`;
      const list = sessionMap.get(key) || [];
      list.push(m);
      sessionMap.set(key, list);
    }

    const groups: ThreadGroup[] = [];
    for (const [, mems] of sessionMap) {
      const sorted = [...mems].sort(
        (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime()
      );
      groups.push({
        agent: sorted[0].agent,
        sessionId: sorted[0].session_id,
        memories: sorted,
      });
    }

    // Filter out connection-only threads (all memories are agent_connected)
    const filtered = groups.filter(
      (g) =>
        !g.memories.every(
          (m) => (m.metadata as Record<string, unknown>)?.event === "agent_connected"
        )
    );

    // Filter by search
    if (search.trim()) {
      const q = search.toLowerCase();
      return filtered.filter(
        (g) =>
          g.agent.toLowerCase().includes(q) ||
          g.memories.some((m) => m.content?.toLowerCase().includes(q))
      );
    }

    return filtered;
  }, [memories, search]);

  // Grouped data based on groupMode
  const displayGroups = useMemo(() => {
    if (groupMode === "agent") {
      // Merge all sessions from same agent into one group
      const agentMap = new Map<string, ThreadGroup>();
      for (const g of threadGroups) {
        const existing = agentMap.get(g.agent);
        if (existing) {
          existing.memories = [...existing.memories, ...g.memories].sort(
            (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime()
          );
        } else {
          agentMap.set(g.agent, {
            agent: g.agent,
            sessionId: g.sessionId,
            memories: [...g.memories],
          });
        }
      }
      return Array.from(agentMap.values());
    }
    // "session" mode = current default
    return threadGroups;
  }, [threadGroups, groupMode]);

  // Flat timeline: all memories sorted chronologically
  const timelineMemories = useMemo(() => {
    if (groupMode !== "timeline") return [];
    const all = threadGroups.flatMap((g) => g.memories);
    return all.sort(
      (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime()
    );
  }, [threadGroups, groupMode]);

  const contextMemories = memories.filter((m) => contextIds.includes(m.id));

  // Group context memories by agent
  const contextByAgent = new Map<string, Memory[]>();
  for (const m of contextMemories) {
    const list = contextByAgent.get(m.agent) || [];
    list.push(m);
    contextByAgent.set(m.agent, list);
  }

  const toggleThread = useCallback((key: string) => {
    setExpandedThreads((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const addMemory = useCallback(
    (memoryId: string) => {
      if (contextIds.includes(memoryId)) return;
      const newIds = [...contextIds, memoryId];
      setContextIds(newIds);

      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push({
        memoryIds: newIds,
        label: `+1 memory`,
        ts: Date.now(),
      });
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    },
    [contextIds, history, historyIndex]
  );

  const addThread = useCallback(
    (agent: string, sessionId: string) => {
      const threadMems = memories
        .filter((m) => m.agent === agent && m.session_id === sessionId)
        .map((m) => m.id);
      const newIds = [...new Set([...contextIds, ...threadMems])];
      setContextIds(newIds);

      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push({
        memoryIds: newIds,
        label: `+${agent}'s thread`,
        ts: Date.now(),
      });
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    },
    [contextIds, memories, history, historyIndex]
  );

  const removeMemory = useCallback(
    (memoryId: string) => {
      const newIds = contextIds.filter((id) => id !== memoryId);
      setContextIds(newIds);

      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push({
        memoryIds: newIds,
        label: `-1 memory`,
        ts: Date.now(),
      });
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    },
    [contextIds, history, historyIndex]
  );

  const rewindTo = useCallback(
    (index: number) => {
      setHistoryIndex(index);
      setContextIds(history[index].memoryIds);
    },
    [history]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);

      const memoryData = e.dataTransfer.getData(
        "application/eywa-memory"
      );
      if (memoryData) {
        try {
          const { id } = JSON.parse(memoryData);
          addMemory(id);
        } catch {
          /* ignore */
        }
        return;
      }

      const threadData = e.dataTransfer.getData(
        "application/eywa-thread"
      );
      if (threadData) {
        try {
          const { agent, sessionId } = JSON.parse(threadData);
          addThread(agent, sessionId);
        } catch {
          /* ignore */
        }
      }
    },
    [addMemory, addThread]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  // Build context summary for Gemini system prompt
  const contextSummary = contextMemories
    .map((m) => `[${m.agent}] ${m.message_type}: ${m.content?.slice(0, 500)}`)
    .join("\n\n");

  // Gemini chat
  const {
    messages: chatMessages,
    loading: chatLoading,
    error: chatError,
    send: sendChat,
    clear: clearChat,
    autoContextError,
  } = useGeminiChat(contextSummary, fold?.id);

  const [chatInput, setChatInput] = useState("");
  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, chatLoading]);

  const handleSendChat = () => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    setChatInput("");
    sendChat(text);
  };

  return (
    <div className="eywa-view">
      <div className="eywa-header">
        <button className="back-btn" onClick={() => navigate(`/f/${slug}`)}>
          &larr; Back
        </button>
        <h2>{t("workspace.title")}</h2>
        <span className="eywa-meta">
          {contextMemories.length} memories from{" "}
          {contextByAgent.size} agent{contextByAgent.size !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="eywa-layout">
        {/* Source Panel - browse all memories */}
        <div className="eywa-source-panel">
          <h3>Browse Memories</h3>
          <div className="browse-group-toggle">
            {(["agent", "session", "timeline"] as const).map((mode) => (
              <button
                key={mode}
                className={`browse-group-btn ${groupMode === mode ? "browse-group-active" : ""}`}
                onClick={() => setGroupMode(mode)}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
          <input
            className="eywa-search"
            placeholder="Search memories..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="eywa-source-list">
            {groupMode === "timeline" ? (
              <>
                {timelineMemories.map((m) => (
                  <div
                    key={m.id}
                    className="timeline-row"
                    onClick={() => addMemory(m.id)}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(
                        "application/eywa-memory",
                        JSON.stringify({ id: m.id })
                      );
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                  >
                    <span className="timeline-time">
                      {shortTimestamp(m.ts)}
                    </span>
                    <span
                      className="timeline-dot"
                      style={{ background: agentColor(m.agent) }}
                    />
                    <span className="timeline-agent">{m.agent}</span>
                    <span className="timeline-content">
                      {(m.content || "").slice(0, 80)}
                    </span>
                  </div>
                ))}
                {timelineMemories.length === 0 && (
                  <p className="empty">No memories found.</p>
                )}
              </>
            ) : (
              <>
                {displayGroups.map((group) => {
                  const key =
                    groupMode === "agent"
                      ? group.agent
                      : `${group.agent}::${group.sessionId}`;
                  const isExpanded = expandedThreads.has(key);
                  const latestTs =
                    group.memories[group.memories.length - 1]?.ts;
                  return (
                    <div key={key} className="eywa-source-thread">
                      <div
                        className="eywa-source-thread-label"
                        onClick={() => toggleThread(key)}
                      >
                        <span
                          className={`eywa-source-thread-toggle ${isExpanded ? "expanded" : ""}`}
                        >
                          &#9654;
                        </span>
                        <span style={{ color: agentColor(group.agent) }}>
                          {group.agent}
                        </span>
                        {groupMode === "session" && (
                          <span className="eywa-source-thread-session">
                            / {shortSessionId(group.sessionId)}
                          </span>
                        )}
                        <span className="eywa-source-thread-count">
                          {group.memories.length} mem
                        </span>
                        {latestTs && (
                          <span className="eywa-source-thread-time">
                            {timeAgo(latestTs)}
                          </span>
                        )}
                      </div>

                      {isExpanded && (
                        <div className="eywa-source-memories">
                          <button
                            className="btn-eywa-new"
                            style={{
                              marginBottom: "0.35rem",
                              fontSize: "0.75rem",
                              padding: "0.3rem 0.6rem",
                            }}
                            onClick={() =>
                              addThread(group.agent, group.sessionId)
                            }
                          >
                            + Add entire thread
                          </button>
                          {group.memories.map((m) => (
                            <MemoryCard
                              key={m.id}
                              memory={m}
                              compact
                              hideAgent
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.setData(
                                  "application/eywa-memory",
                                  JSON.stringify({ id: m.id })
                                );
                                e.dataTransfer.effectAllowed = "copy";
                              }}
                              onPull={() => addMemory(m.id)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                {displayGroups.length === 0 && (
                  <p className="empty">No memories found.</p>
                )}
              </>
            )}
          </div>
        </div>

        {/* Context Panel (drop zone) */}
        <div
          className={`eywa-context-panel ${dragOver ? "eywa-drop-active" : ""}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <h3>Context</h3>

          {contextMemories.length === 0 && (
            <div className="eywa-drop-zone">
              <p>Drag memories here</p>
              <span className="eywa-drop-hint">
                Expand a thread on the left and drag memory cards here, or click
                "Add entire thread" to pull a whole conversation
              </span>
            </div>
          )}

          {Array.from(contextByAgent.entries()).map(([agent, mems]) => (
            <div key={agent} className="eywa-agent-section">
              <div
                className="eywa-agent-label"
                style={{ color: agentColor(agent) }}
              >
                {agent} ({mems.length})
              </div>
              {mems.map((m) => (
                <div key={m.id} className="eywa-memory-item">
                  <MemoryCard memory={m} compact />
                  <button
                    className="eywa-remove-btn"
                    onClick={() => removeMemory(m.id)}
                    title="Remove from workspace"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          ))}

          {/* Version History */}
          {history.length > 1 && (
            <div className="eywa-history">
              <h4>History</h4>
              {history.map((ver, i) => (
                <button
                  key={i}
                  className={`eywa-history-item ${i === historyIndex ? "active" : ""}`}
                  onClick={() => rewindTo(i)}
                >
                  <span className="eywa-history-dot" />
                  <span>
                    v{i} - {ver.label}
                  </span>
                  <span className="eywa-history-count">
                    {ver.memoryIds.length}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Gemini Chat Terminal */}
        <div className="eywa-terminal-panel">
          <div className="eywa-terminal-header">
            <span>Gemini Agent</span>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              {contextMemories.length > 0 && (
                <button
                  className="back-btn"
                  style={{ fontSize: "0.7rem", padding: "0.25rem 0.5rem" }}
                  onClick={() => {
                    navigator.clipboard.writeText(contextSummary);
                  }}
                >
                  Copy ctx
                </button>
              )}
              {chatMessages.length > 0 && (
                <button
                  className="back-btn"
                  style={{ fontSize: "0.7rem", padding: "0.25rem 0.5rem" }}
                  onClick={clearChat}
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="eywa-terminal">
            {autoContextError && (
              <div style={{ color: "var(--color-text-secondary)", fontSize: "0.75rem", opacity: 0.7, padding: "0.5rem 1rem" }}>
                Fold context unavailable. Chat works but without live agent data.
              </div>
            )}
            {chatMessages.length === 0 && !chatLoading && (
              <div className="eywa-terminal-empty">
                {contextMemories.length === 0 ? (
                  <>
                    <p>Add context from the left panels first.</p>
                    <p>Then chat with Gemini about the combined context.</p>
                  </>
                ) : (
                  <>
                    <p>
                      {contextMemories.length} memories loaded as context.
                    </p>
                    <p>Ask Gemini anything about these threads.</p>
                  </>
                )}
              </div>
            )}

            {chatMessages.map((msg, i) => (
              <div
                key={i}
                className={`eywa-chat-msg eywa-chat-${msg.role}`}
              >
                <div className="eywa-chat-msg-role">
                  {msg.role === "user" ? "You" : "Gemini"}
                </div>
                <div className="eywa-chat-msg-content">
                  {msg.content}
                </div>
              </div>
            ))}

            {chatLoading && (
              <div className="eywa-chat-msg eywa-chat-model">
                <div className="eywa-chat-msg-role">Gemini</div>
                <div className="eywa-chat-msg-content eywa-chat-typing">
                  Thinking...
                </div>
              </div>
            )}

            {chatError && (
              <div className="eywa-chat-error">{chatError}</div>
            )}

            <div ref={chatBottomRef} />
          </div>

          <div className="eywa-chat-input">
            <input
              placeholder={
                contextMemories.length === 0
                  ? "Add context first..."
                  : "Ask Gemini about the context..."
              }
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendChat()}
              disabled={chatLoading}
            />
            <button
              onClick={handleSendChat}
              disabled={chatLoading || !chatInput.trim()}
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
