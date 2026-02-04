import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useRealtimeMemories } from "../hooks/useRealtimeMemories";
import { useRoomContext } from "../context/RoomContext";
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

interface ThreadGroup {
  agent: string;
  sessionId: string;
  memories: Memory[];
}

interface RemixVersion {
  memoryIds: string[];
  label: string;
  ts: number;
}

export function RemixView() {
  const { slug } = useParams<{ slug: string }>();
  const { room } = useRoomContext();
  const navigate = useNavigate();
  const location = useLocation();
  const { memories } = useRealtimeMemories(room?.id ?? null, 500);

  // Search filter for source panel
  const [search, setSearch] = useState("");

  // Expanded threads in source panel
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(
    new Set()
  );

  // Context panel: memories pulled into the remix
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
  const [history, setHistory] = useState<RemixVersion[]>([
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

    // Filter by search
    if (search.trim()) {
      const q = search.toLowerCase();
      return groups.filter(
        (g) =>
          g.agent.toLowerCase().includes(q) ||
          g.memories.some((m) => m.content?.toLowerCase().includes(q))
      );
    }

    return groups;
  }, [memories, search]);

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
        "application/remix-memory"
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
        "application/remix-thread"
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
  } = useGeminiChat(contextSummary);

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
    <div className="remix-view">
      <div className="remix-header">
        <button className="back-btn" onClick={() => navigate(`/r/${slug}`)}>
          &larr; Back
        </button>
        <h2>Remix</h2>
        <span className="remix-meta">
          {contextMemories.length} memories from{" "}
          {contextByAgent.size} agent{contextByAgent.size !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="remix-layout">
        {/* Source Panel - browse all memories */}
        <div className="remix-source-panel">
          <h3>Browse Memories</h3>
          <input
            className="remix-search"
            placeholder="Search memories..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="remix-source-list">
            {threadGroups.map((group) => {
              const key = `${group.agent}::${group.sessionId}`;
              const isExpanded = expandedThreads.has(key);
              return (
                <div key={key} className="remix-source-thread">
                  <div
                    className="remix-source-thread-label"
                    onClick={() => toggleThread(key)}
                    style={{ color: agentColor(group.agent) }}
                  >
                    <span
                      className={`remix-source-thread-toggle ${isExpanded ? "expanded" : ""}`}
                    >
                      &#9654;
                    </span>
                    <span>{group.agent}</span>
                    <span className="remix-source-thread-count">
                      {group.memories.length} mem
                    </span>
                  </div>

                  {isExpanded && (
                    <div className="remix-source-memories">
                      <button
                        className="btn-remix-new"
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
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData(
                              "application/remix-memory",
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
            {threadGroups.length === 0 && (
              <p className="empty">No memories found.</p>
            )}
          </div>
        </div>

        {/* Context Panel (drop zone) */}
        <div
          className={`remix-context-panel ${dragOver ? "remix-drop-active" : ""}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <h3>Context</h3>

          {contextMemories.length === 0 && (
            <div className="remix-drop-zone">
              <p>Drag memories here</p>
              <span className="remix-drop-hint">
                Expand a thread on the left and drag memory cards here, or click
                "Add entire thread" to pull a whole conversation
              </span>
            </div>
          )}

          {Array.from(contextByAgent.entries()).map(([agent, mems]) => (
            <div key={agent} className="remix-agent-section">
              <div
                className="remix-agent-label"
                style={{ color: agentColor(agent) }}
              >
                {agent} ({mems.length})
              </div>
              {mems.map((m) => (
                <div key={m.id} className="remix-memory-item">
                  <MemoryCard memory={m} compact />
                  <button
                    className="remix-remove-btn"
                    onClick={() => removeMemory(m.id)}
                    title="Remove from remix"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          ))}

          {/* Version History */}
          {history.length > 1 && (
            <div className="remix-history">
              <h4>History</h4>
              {history.map((ver, i) => (
                <button
                  key={i}
                  className={`remix-history-item ${i === historyIndex ? "active" : ""}`}
                  onClick={() => rewindTo(i)}
                >
                  <span className="remix-history-dot" />
                  <span>
                    v{i} - {ver.label}
                  </span>
                  <span className="remix-history-count">
                    {ver.memoryIds.length}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Gemini Chat Terminal */}
        <div className="remix-terminal-panel">
          <div className="remix-terminal-header">
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

          <div className="remix-terminal">
            {chatMessages.length === 0 && !chatLoading && (
              <div className="remix-terminal-empty">
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
                className={`remix-chat-msg remix-chat-${msg.role}`}
              >
                <div className="remix-chat-msg-role">
                  {msg.role === "user" ? "You" : "Gemini"}
                </div>
                <div className="remix-chat-msg-content">
                  {msg.content}
                </div>
              </div>
            ))}

            {chatLoading && (
              <div className="remix-chat-msg remix-chat-model">
                <div className="remix-chat-msg-role">Gemini</div>
                <div className="remix-chat-msg-content remix-chat-typing">
                  Thinking...
                </div>
              </div>
            )}

            {chatError && (
              <div className="remix-chat-error">{chatError}</div>
            )}

            <div ref={chatBottomRef} />
          </div>

          <div className="remix-chat-input">
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
