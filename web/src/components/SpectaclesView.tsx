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

  // Voice events from Spectacles
  const [voiceEvents, setVoiceEvents] = useState<Array<{
    type: "input" | "response" | "inject";
    text: string;
    ts: number;
  }>>([]);

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

    // Listen for voice events from Spectacles
    channel.on("broadcast", { event: "voice_input" }, (msg) => {
      setVoiceEvents(prev => [...prev.slice(-49), {
        type: "input", text: msg.payload.text, ts: msg.payload.timestamp,
      }]);
    });
    channel.on("broadcast", { event: "voice_response" }, (msg) => {
      setVoiceEvents(prev => [...prev.slice(-49), {
        type: "response", text: msg.payload.text, ts: msg.payload.timestamp,
      }]);
    });
    channel.on("broadcast", { event: "voice_inject" }, (msg) => {
      setVoiceEvents(prev => [...prev.slice(-49), {
        type: "inject", text: msg.payload.message, ts: msg.payload.timestamp,
      }]);
    });
    channel.on("broadcast", { event: "interact" }, (msg) => {
      const p = msg.payload;
      console.log("[Spectacles] Interaction:", p.type, p.id, `(${p.x?.toFixed(2)}, ${p.y?.toFixed(2)})`);
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

  // Broadcasting state
  const [broadcasting, setBroadcasting] = useState(false);

  const handleStartBroadcast = useCallback(() => {
    if (!channelRef.current || !channelReady) return;
    setBroadcasting(true);
    // Send a presence ping so Spectacles devices know a broadcaster is active
    channelRef.current.send({
      type: "broadcast",
      event: "broadcaster_online",
      payload: { deviceId, ts: Date.now() },
    });
  }, [channelReady, deviceId]);

  return (
    <div style={styles.root}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={{
            ...styles.statusDot,
            background: channelReady ? "#4ade80" : "#333",
          }} />
          <span style={styles.title}>Spectacles Broadcast</span>
          <span style={styles.roomSlug}>/{room?.slug || "..."}</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
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
      </div>

      {/* Explanation banner */}
      <div style={styles.banner}>
        <div style={styles.bannerTitle}>This page livestreams to Snap Spectacles</div>
        <div style={styles.bannerDesc}>
          Activity, destination progress, and Gemini chat from this room are broadcast in real time
          to any Spectacles device running the Eywa lens. The glasses render this content as floating
          AR panels in world space.
        </div>
        {!broadcasting ? (
          <div style={styles.bannerActions}>
            <button onClick={handleStartBroadcast} disabled={!channelReady} style={{
              ...styles.broadcastBtn,
              opacity: channelReady ? 1 : 0.4,
            }}>
              {channelReady ? "Start Broadcast" : "Connecting..."}
            </button>
            <div style={styles.bannerSteps}>
              <div style={styles.step}><span style={styles.stepNum}>1</span> Open the Eywa lens on Spectacles</div>
              <div style={styles.step}><span style={styles.stepNum}>2</span> Click "Start Broadcast" above</div>
              <div style={styles.step}><span style={styles.stepNum}>3</span> The AR panel appears in front of you (no marker needed)</div>
              <div style={styles.step}><span style={styles.stepNum}>4</span> Optional: point at a tracking marker to anchor the panel to a surface</div>
            </div>
          </div>
        ) : (
          <div style={styles.bannerLive}>
            <span style={styles.liveDot} />
            Broadcasting to <strong>spectacles:{room?.slug}:{deviceId}</strong>
          </div>
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

          {/* Voice feed from Spectacles */}
          {voiceEvents.length > 0 && (
            <div style={styles.voiceFeed}>
              <div style={styles.voiceFeedHeader}>
                <span style={styles.liveDot} /> Spectacles Voice
              </div>
              {voiceEvents.slice(-8).map((ev, i) => (
                <div key={i} style={{
                  ...styles.voiceMsg,
                  ...(ev.type === "input" ? styles.voiceInput : {}),
                  ...(ev.type === "response" ? styles.voiceResponse : {}),
                  ...(ev.type === "inject" ? styles.voiceInject : {}),
                }}>
                  <span style={styles.voiceLabel}>
                    {ev.type === "input" ? "You" : ev.type === "inject" ? "Injected" : "Eywa"}
                  </span>
                  {ev.text}
                </div>
              ))}
            </div>
          )}

          <div style={styles.chatScroll}>
            {chatMessages.length === 0 && voiceEvents.length === 0 && (
              <div style={styles.chatEmpty}>
                Ask Gemini here, or speak through Spectacles. Voice transcriptions
                and responses from the glasses appear above.
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
  banner: {
    padding: "14px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    background: "rgba(21,209,255,0.04)",
  },
  bannerTitle: {
    fontSize: "0.85rem",
    fontWeight: 600,
    color: "#15D1FF",
    fontFamily: "var(--font-display, 'Plus Jakarta Sans', system-ui, sans-serif)",
    marginBottom: 4,
  },
  bannerDesc: {
    fontSize: "0.72rem",
    color: "rgba(255,255,255,0.5)",
    lineHeight: 1.5,
    marginBottom: 12,
  },
  bannerActions: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 10,
  },
  broadcastBtn: {
    padding: "8px 20px",
    background: "linear-gradient(135deg, #8b5cf6, #15D1FF)",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: "0.8rem",
    fontWeight: 600,
    alignSelf: "flex-start" as const,
    transition: "opacity 0.2s ease-in-out",
  },
  bannerSteps: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
  },
  step: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: "0.68rem",
    color: "rgba(255,255,255,0.45)",
  },
  stepNum: {
    width: 18,
    height: 18,
    borderRadius: "50%",
    background: "rgba(139,92,246,0.15)",
    color: "#c4b5fd",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "0.55rem",
    fontWeight: 600,
    flexShrink: 0,
  },
  bannerLive: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: "0.75rem",
    color: "#4ade80",
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#4ade80",
    flexShrink: 0,
  },
  voiceFeed: {
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    padding: "6px 12px",
    maxHeight: 180,
    overflowY: "auto" as const,
    background: "rgba(74,222,128,0.03)",
  },
  voiceFeedHeader: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: "0.6rem",
    fontWeight: 600,
    color: "#4ade80",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
    marginBottom: 4,
  },
  voiceMsg: {
    fontSize: "0.7rem",
    padding: "3px 8px",
    borderRadius: 4,
    marginBottom: 2,
    lineHeight: 1.4,
  },
  voiceInput: {
    color: "#c4b5fd",
    background: "rgba(139,92,246,0.08)",
  },
  voiceResponse: {
    color: "rgba(255,255,255,0.7)",
    background: "rgba(255,255,255,0.03)",
  },
  voiceInject: {
    color: "#fcd34d",
    background: "rgba(252,211,77,0.08)",
    borderLeft: "2px solid #fcd34d",
  },
  voiceLabel: {
    fontWeight: 600,
    marginRight: 6,
    fontSize: "0.6rem",
  },
};
