/**
 * SpectaclesView.tsx
 *
 * Simplified XR companion view: activity log + Gemini chat + destination status.
 * Keeps the Supabase broadcast channel alive for Spectacles devices but drops
 * the tile rendering engine. The web page shows useful content directly.
 */

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useRoomContext } from "../context/RoomContext";
import { useRealtimeMemories } from "../hooks/useRealtimeMemories";
import { useGeminiChat, type ChatMessage } from "../hooks/useGeminiChat";
import { useVoiceInput } from "../hooks/useVoiceInput";
import { supabase, type Memory } from "../lib/supabase";
import { agentColor } from "../lib/agentColor";

// --- Helpers ---

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function shortName(agent: string): string {
  return agent.includes("/") ? agent.split("/").pop()! : agent;
}

const NOISE_EVENTS = new Set(["agent_connected"]);

function isNoise(m: Memory): boolean {
  const meta = (m.metadata ?? {}) as Record<string, unknown>;
  if (NOISE_EVENTS.has(meta.event as string)) return true;
  if (m.message_type === "resource" && (!m.content || m.content.length < 20)) return true;
  return false;
}

const SYSTEM_COLORS: Record<string, string> = {
  git: "#f97316", database: "#06b6d4", api: "#8b5cf6", deploy: "#22c55e",
  infra: "#ec4899", browser: "#3b82f6", test: "#eab308", filesystem: "#64748b",
  communication: "#f472b6", terminal: "#a3e635", editor: "#38bdf8",
  ci: "#fb923c", cloud: "#818cf8", monitor: "#2dd4bf",
};

const OUTCOME_COLORS: Record<string, string> = {
  success: "#6ee7b7", failure: "#fca5a5", blocked: "#fcd34d", in_progress: "#93c5fd",
};

// --- Main Component ---

export function SpectaclesView() {
  const { room } = useRoomContext();
  const { memories } = useRealtimeMemories(room?.id ?? null, 200);

  // Broadcast channel (kept alive for Spectacles devices)
  const [channelReady, setChannelReady] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const deviceId = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("device") || "editor";
  }, []);

  // Chat input
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Build context from recent memories for Gemini
  const contextSummary = useMemo(() => {
    const recent = memories.filter(m => !isNoise(m)).slice(0, 20);
    return recent.map(m => {
      const meta = (m.metadata ?? {}) as Record<string, string>;
      const sys = meta.system ? `[${meta.system}]` : "";
      return `[${shortName(m.agent)}] ${sys} ${m.content?.slice(0, 300)}`;
    }).join("\n");
  }, [memories]);

  const { messages: chatMessages, loading: chatLoading, send: sendChat, clear: clearChat } = useGeminiChat(contextSummary, room?.id);

  // Voice
  const voiceResultHandler = useCallback((text: string) => {
    if (text.trim()) sendChat(text.trim());
  }, [sendChat]);
  const { isListening, isSupported: voiceSupported, toggleListening } = useVoiceInput({
    onResult: voiceResultHandler,
  });

  // Extract destination
  const destination = useMemo(() => {
    for (const m of memories) {
      const meta = (m.metadata ?? {}) as Record<string, unknown>;
      if (meta.event === "destination" && m.message_type === "knowledge") {
        const ms = (meta.milestones as string[]) || [];
        const prog = (meta.progress as Record<string, boolean>) || {};
        const done = ms.filter(x => prog[x]).length;
        return {
          text: (meta.destination as string) || "",
          milestones: ms,
          progress: prog,
          done,
          total: ms.length,
        };
      }
    }
    return null;
  }, [memories]);

  // Filtered activity log
  const activityLog = useMemo(() => {
    return memories
      .filter(m => !isNoise(m))
      .slice(0, 100);
  }, [memories]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Supabase broadcast channel
  useEffect(() => {
    if (!room?.slug) return;
    const channelKey = `spectacles:${room.slug}:${deviceId}`;
    const channel = supabase.channel(channelKey, {
      config: { broadcast: { ack: false, self: false } },
    });
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") setChannelReady(true);
    });
    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      setChannelReady(false);
    };
  }, [room?.slug, deviceId]);

  const handleSend = () => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    sendChat(text);
    setChatInput("");
  };

  return (
    <div style={styles.root}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={{
            ...styles.statusDot,
            background: channelReady ? "#4ade80" : "#333",
          }} />
          <span style={styles.title}>Spectacles</span>
          <span style={styles.roomSlug}>/{room?.slug || "..."}</span>
        </div>
        {voiceSupported && (
          <button
            onClick={toggleListening}
            style={{
              ...styles.btn,
              background: isListening ? "rgba(248,113,113,0.15)" : "rgba(255,255,255,0.05)",
              color: isListening ? "#f87171" : "#8b949e",
              borderColor: isListening ? "#f87171" : "#30363d",
            }}
          >
            {isListening ? "Listening..." : "Mic"}
          </button>
        )}
      </div>

      {/* Destination bar */}
      {destination && (
        <div style={styles.destBar}>
          <div style={styles.destText}>
            {destination.text.slice(0, 80)}
          </div>
          <div style={styles.destProgress}>
            <div style={styles.destTrack}>
              <div style={{
                ...styles.destFill,
                width: `${destination.total > 0 ? (destination.done / destination.total) * 100 : 0}%`,
              }} />
            </div>
            <span style={styles.destLabel}>{destination.done}/{destination.total}</span>
          </div>
        </div>
      )}

      {/* Main content: logs + chat side by side */}
      <div style={styles.main}>
        {/* Activity log */}
        <div style={styles.logPanel}>
          <div style={styles.panelHeader}>Activity</div>
          <div style={styles.logScroll}>
            {activityLog.map((m) => {
              const meta = (m.metadata ?? {}) as Record<string, string>;
              const color = agentColor(m.agent);
              return (
                <div key={m.id} style={styles.logEntry}>
                  <div style={styles.logMeta}>
                    <span style={{ color, fontWeight: 600 }}>{shortName(m.agent)}</span>
                    {meta.system && (
                      <span style={{
                        ...styles.pill,
                        background: `${SYSTEM_COLORS[meta.system] || "#8b5cf6"}18`,
                        color: SYSTEM_COLORS[meta.system] || "#8b5cf6",
                      }}>{meta.system}</span>
                    )}
                    {meta.action && (
                      <span style={styles.actionLabel}>{meta.action}</span>
                    )}
                    {meta.outcome && (
                      <span style={{
                        ...styles.pill,
                        background: `${OUTCOME_COLORS[meta.outcome] || "#888"}18`,
                        color: OUTCOME_COLORS[meta.outcome] || "#888",
                      }}>{meta.outcome}</span>
                    )}
                    <span style={styles.timeLabel}>{timeAgo(m.ts)}</span>
                  </div>
                  <div style={styles.logContent}>
                    {(m.content ?? "").slice(0, 200)}
                  </div>
                </div>
              );
            })}
            <div ref={logEndRef} />
          </div>
        </div>

        {/* Chat panel */}
        <div style={styles.chatPanel}>
          <div style={styles.panelHeader}>
            Gemini
            {chatMessages.length > 0 && (
              <button onClick={clearChat} style={styles.clearBtn}>Clear</button>
            )}
          </div>
          <div style={styles.chatScroll}>
            {chatMessages.length === 0 && (
              <div style={styles.chatEmpty}>
                Ask Gemini about agent activity, destination progress, or patterns.
              </div>
            )}
            {chatMessages.map((msg, i) => (
              <div
                key={i}
                style={{
                  ...styles.chatMsg,
                  alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                  background: msg.role === "user" ? "rgba(139,92,246,0.15)" : "rgba(255,255,255,0.04)",
                  borderColor: msg.role === "user" ? "rgba(139,92,246,0.3)" : "rgba(255,255,255,0.06)",
                }}
              >
                {msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div style={styles.toolCalls}>
                    {msg.toolCalls.map((tc, j) => (
                      <span key={j} style={styles.toolPill}>{tc}</span>
                    ))}
                  </div>
                )}
                <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{msg.content}</div>
              </div>
            ))}
            {chatLoading && (
              <div style={{ ...styles.chatMsg, alignSelf: "flex-start", color: "#8b949e" }}>
                Thinking...
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <div style={styles.chatInputRow}>
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Ask Gemini..."
              style={styles.chatInputField}
            />
            <button
              onClick={handleSend}
              disabled={chatLoading || !chatInput.trim()}
              style={{
                ...styles.btn,
                opacity: chatLoading || !chatInput.trim() ? 0.4 : 1,
              }}
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Styles ---

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    background: "var(--bg-primary, #050508)",
    color: "#e6edf3",
    fontFamily: "var(--font-sans, Inter, system-ui, sans-serif)",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    flexShrink: 0,
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
  },
  title: {
    fontSize: "0.95rem",
    fontWeight: 600,
    color: "#15D1FF",
    fontFamily: "var(--font-display, 'Plus Jakarta Sans', system-ui, sans-serif)",
  },
  roomSlug: {
    fontSize: "0.7rem",
    color: "#8b949e",
  },
  destBar: {
    padding: "8px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    background: "rgba(139,92,246,0.04)",
    flexShrink: 0,
  },
  destText: {
    fontSize: "0.75rem",
    color: "#c4b5fd",
    marginBottom: 4,
  },
  destProgress: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  destTrack: {
    flex: 1,
    height: 4,
    background: "rgba(139,92,246,0.15)",
    borderRadius: 2,
    overflow: "hidden",
  },
  destFill: {
    height: "100%",
    background: "#8b5cf6",
    borderRadius: 2,
    transition: "width 0.5s ease-in-out",
  },
  destLabel: {
    fontSize: "0.65rem",
    color: "#8b949e",
    flexShrink: 0,
  },
  main: {
    display: "flex",
    flex: 1,
    overflow: "hidden",
    gap: 0,
  },
  logPanel: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    borderRight: "1px solid rgba(255,255,255,0.06)",
    minWidth: 0,
  },
  chatPanel: {
    width: 380,
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
  },
  panelHeader: {
    padding: "8px 16px",
    fontSize: "0.7rem",
    fontWeight: 600,
    color: "#8b949e",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
    borderBottom: "1px solid rgba(255,255,255,0.04)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexShrink: 0,
  },
  logScroll: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "4px 0",
  },
  logEntry: {
    padding: "6px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.02)",
  },
  logMeta: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: "0.7rem",
    flexWrap: "wrap" as const,
  },
  pill: {
    padding: "1px 6px",
    borderRadius: 3,
    fontSize: "0.6rem",
    fontWeight: 500,
  },
  actionLabel: {
    color: "#8b949e",
    fontSize: "0.6rem",
  },
  timeLabel: {
    color: "#484f58",
    fontSize: "0.6rem",
    marginLeft: "auto",
  },
  logContent: {
    fontSize: "0.7rem",
    color: "rgba(255,255,255,0.5)",
    marginTop: 2,
    lineHeight: 1.4,
    wordBreak: "break-word" as const,
  },
  chatScroll: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "8px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  chatEmpty: {
    color: "#484f58",
    fontSize: "0.75rem",
    textAlign: "center" as const,
    padding: "2rem 1rem",
  },
  chatMsg: {
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid",
    fontSize: "0.75rem",
    maxWidth: "90%",
    wordBreak: "break-word" as const,
  },
  toolCalls: {
    display: "flex",
    gap: 4,
    flexWrap: "wrap" as const,
    marginBottom: 4,
  },
  toolPill: {
    fontSize: "0.55rem",
    padding: "1px 5px",
    borderRadius: 3,
    background: "rgba(139,92,246,0.15)",
    color: "#c4b5fd",
  },
  chatInputRow: {
    display: "flex",
    gap: 6,
    padding: "8px 12px",
    borderTop: "1px solid rgba(255,255,255,0.06)",
    flexShrink: 0,
  },
  chatInputField: {
    flex: 1,
    padding: "6px 10px",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 6,
    color: "#e6edf3",
    fontSize: "0.75rem",
    outline: "none",
  },
  btn: {
    padding: "5px 12px",
    background: "rgba(255,255,255,0.05)",
    color: "#e6edf3",
    border: "1px solid #30363d",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: "0.7rem",
    flexShrink: 0,
  },
  clearBtn: {
    background: "none",
    border: "none",
    color: "#484f58",
    fontSize: "0.6rem",
    cursor: "pointer",
    padding: "0 4px",
  },
};
