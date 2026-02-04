import { useState, useCallback, useMemo, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useRealtimeMemories } from "../hooks/useRealtimeMemories";
import { useRoomContext } from "../context/RoomContext";
import { MemoryCard } from "./MemoryCard";
import { GeminiPanel3D } from "./GeminiPanel3D";
import { GlassPanel } from "./GlassPanel";
import type { Memory } from "../lib/supabase";

function useIsMobile(breakpoint = 768) {
  const [mobile, setMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth < breakpoint
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [breakpoint]);
  return mobile;
}

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

export function RemixView3D() {
  const { slug } = useParams<{ slug: string }>();
  const { room } = useRoomContext();
  const navigate = useNavigate();
  const location = useLocation();
  const { memories } = useRealtimeMemories(room?.id ?? null, 500);

  const [search, setSearch] = useState("");
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(
    new Set()
  );

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

  const [history, setHistory] = useState<RemixVersion[]>([
    { memoryIds: [], label: "Start", ts: Date.now() },
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [dragOver, setDragOver] = useState(false);

  // Thread groups for source panel
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

  const contextMemories = useMemo(
    () => memories.filter((m) => contextIds.includes(m.id)),
    [memories, contextIds]
  );

  // Group context memories by agent
  const contextByAgent = useMemo(() => {
    const map = new Map<string, Memory[]>();
    for (const m of contextMemories) {
      const list = map.get(m.agent) || [];
      list.push(m);
      map.set(m.agent, list);
    }
    return map;
  }, [contextMemories]);

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

  const contextSummary = useMemo(
    () =>
      contextMemories
        .map((m) => `[${m.agent}] ${m.message_type}: ${m.content?.slice(0, 500)}`)
        .join("\n\n"),
    [contextMemories]
  );

  const isMobile = useIsMobile();

  /* ---- shared panel content (used by both mobile + desktop) ---- */

  const sourceContent = (
    <div className="r3f-source-panel">
      <h3>Browse Memories</h3>
      <input
        className="remix3d-search"
        placeholder="Search memories..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="r3f-scroll">
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
  );

  const contextContent = (
    <div
      className={`r3f-context-panel ${dragOver ? "drop-active" : ""}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <h3>Context ({contextMemories.length})</h3>
      <div className="r3f-scroll">
        {contextMemories.length === 0 && (
          <div className="remix-drop-zone">
            <p>Drag memories here</p>
            <span className="remix-drop-hint">
              Expand a thread on the left and drag memory cards here, or
              click "Add entire thread" to pull a whole conversation
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
                  v{i} — {ver.label}
                </span>
                <span className="remix-history-count">
                  {ver.memoryIds.length}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const chatContent = (
    <div className="r3f-chat-panel">
      <GeminiPanel3D
        contextSummary={contextSummary}
        contextCount={contextIds.length}
      />
    </div>
  );

  return (
    <div className="remix3d-container">
      {/* Header */}
      <div className="remix3d-header">
        <button className="back-btn" onClick={() => navigate(`/r/${slug}`)}>
          &larr; Back
        </button>
        <h2>Remix 3D</h2>
        <span className="remix-meta">
          {contextMemories.length} memories from{" "}
          {contextByAgent.size} agent{contextByAgent.size !== 1 ? "s" : ""}
        </span>
      </div>

      {isMobile ? (
        /* Mobile: flat column fallback */
        <div className="remix3d-mobile">
          <div className="glass-panel">{sourceContent}</div>
          <div className="glass-panel">{contextContent}</div>
          <div className="glass-panel">{chatContent}</div>
        </div>
      ) : (
        /* Desktop: CSS perspective + glass panels */
        <div className="remix3d-scene">
          <GlassPanel
            rotateY={3}
            transformOrigin="right center"
            className="r3f-source-wrap"
          >
            {sourceContent}
          </GlassPanel>

          <GlassPanel
            rotateY={-3}
            transformOrigin="left center"
            className="r3f-context-wrap"
          >
            {contextContent}
          </GlassPanel>

          <GlassPanel
            rotateY={-2}
            transformOrigin="left center"
            className="r3f-chat-wrap"
          >
            {chatContent}
          </GlassPanel>
        </div>
      )}
    </div>
  );
}
