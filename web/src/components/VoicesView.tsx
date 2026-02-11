/**
 * VoicesView.tsx - Ambient voice interface for eywa.
 *
 * Full-screen, phone-friendly page. Tap to connect, talk to control
 * your agent swarm. Works from anywhere: AirPods, phone speaker,
 * laptop mic. Bookmark on your phone and use it while buying groceries.
 */

import { useState, useRef, useCallback } from "react";
import { useRoomContext } from "../context/RoomContext";
import { useGeminiLive, type VoiceEvent } from "../hooks/useGeminiLive";
import { useParams } from "react-router-dom";

interface LogEntry {
  id: number;
  type: VoiceEvent["type"];
  text: string;
  ts: number;
}

export function VoicesView() {
  const { room } = useRoomContext();
  const { slug } = useParams<{ slug: string }>();
  const [log, setLog] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState("Tap to connect");
  const [currentResponse, setCurrentResponse] = useState("");
  const [currentUserSpeech, setCurrentUserSpeech] = useState("");
  const idRef = useRef(0);
  const logEndRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((type: VoiceEvent["type"], text: string) => {
    if (!text) return;
    setLog((prev) => {
      const next = [...prev, { id: ++idRef.current, type, text, ts: Date.now() }];
      // Keep last 50 entries
      return next.slice(-50);
    });
    setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  const onEvent = useCallback(
    (event: VoiceEvent) => {
      switch (event.type) {
        case "status":
          setStatus(event.text);
          break;
        case "user_speech":
          setCurrentUserSpeech((prev) => prev + event.text);
          break;
        case "response":
          if (event.final) {
            if (currentResponse) {
              addLog("response", currentResponse);
            }
            if (currentUserSpeech) {
              addLog("user_speech", currentUserSpeech);
              setCurrentUserSpeech("");
            }
            setCurrentResponse("");
          } else if (event.text) {
            setCurrentResponse((prev) => prev + event.text);
          }
          break;
        case "tool_call":
          addLog("tool_call", `${event.name}: ${event.result}`);
          break;
        case "error":
          setStatus(event.text);
          addLog("error", event.text);
          break;
      }
    },
    [addLog, currentResponse, currentUserSpeech]
  );

  const { connected, listening, connect, disconnect } = useGeminiLive({
    roomId: room?.id || null,
    roomSlug: slug || "",
    onEvent,
  });

  const handleTap = () => {
    if (connected) {
      disconnect();
      setStatus("Disconnected");
    } else {
      connect();
    }
  };

  return (
    <div style={styles.container}>
      {/* Status bar */}
      <div style={styles.header}>
        <div style={styles.roomName}>{room?.name || slug || "eywa"}</div>
        <div style={styles.statusRow}>
          <span
            style={{
              ...styles.dot,
              backgroundColor: connected ? (listening ? "#00ff88" : "#ffaa00") : "#555",
            }}
          />
          <span style={styles.statusText}>{status}</span>
        </div>
      </div>

      {/* Log */}
      <div style={styles.log}>
        {log.map((entry) => (
          <div key={entry.id} style={styles.logEntry}>
            {entry.type === "user_speech" && (
              <div style={styles.userBubble}>{entry.text}</div>
            )}
            {entry.type === "response" && (
              <div style={styles.responseBubble}>{entry.text}</div>
            )}
            {entry.type === "tool_call" && (
              <div style={styles.toolBubble}>{entry.text}</div>
            )}
            {entry.type === "error" && (
              <div style={styles.errorBubble}>{entry.text}</div>
            )}
          </div>
        ))}

        {/* Live transcriptions */}
        {currentUserSpeech && (
          <div style={styles.logEntry}>
            <div style={{ ...styles.userBubble, opacity: 0.7 }}>{currentUserSpeech}...</div>
          </div>
        )}
        {currentResponse && (
          <div style={styles.logEntry}>
            <div style={{ ...styles.responseBubble, opacity: 0.7 }}>{currentResponse}...</div>
          </div>
        )}

        <div ref={logEndRef} />
      </div>

      {/* Connect button */}
      <div style={styles.buttonArea}>
        <button
          onClick={handleTap}
          style={{
            ...styles.mainButton,
            backgroundColor: connected ? "#1a1a2e" : "#00ff88",
            color: connected ? "#00ff88" : "#0a0a14",
            border: connected ? "2px solid #00ff88" : "2px solid transparent",
          }}
        >
          {connected ? (listening ? "Listening..." : "Connecting...") : "Connect"}
        </button>
        {connected && (
          <div style={styles.hint}>Speak naturally. Eywa is listening.</div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    width: "100%",
    backgroundColor: "#0a0a14",
    color: "#e0e0e0",
    fontFamily: "'SF Pro', -apple-system, system-ui, sans-serif",
    overflow: "hidden",
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
  },
  header: {
    padding: "20px 24px 12px",
    borderBottom: "1px solid #1a1a2e",
    flexShrink: 0,
  },
  roomName: {
    fontSize: "14px",
    color: "#666",
    textTransform: "uppercase" as const,
    letterSpacing: "1px",
    marginBottom: "4px",
  },
  statusRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  dot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    flexShrink: 0,
  },
  statusText: {
    fontSize: "13px",
    color: "#888",
  },
  log: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "16px 24px",
    display: "flex",
    flexDirection: "column" as const,
    gap: "12px",
  },
  logEntry: {
    display: "flex",
    flexDirection: "column" as const,
  },
  userBubble: {
    alignSelf: "flex-end" as const,
    backgroundColor: "#1a2a1a",
    color: "#aaffaa",
    padding: "10px 14px",
    borderRadius: "16px 16px 4px 16px",
    maxWidth: "85%",
    fontSize: "15px",
    lineHeight: "1.4",
  },
  responseBubble: {
    alignSelf: "flex-start" as const,
    backgroundColor: "#1a1a2e",
    color: "#e0e0e0",
    padding: "10px 14px",
    borderRadius: "16px 16px 16px 4px",
    maxWidth: "85%",
    fontSize: "15px",
    lineHeight: "1.4",
  },
  toolBubble: {
    alignSelf: "center" as const,
    backgroundColor: "#2a1a2e",
    color: "#cc88ff",
    padding: "6px 12px",
    borderRadius: "8px",
    fontSize: "12px",
    fontFamily: "monospace",
    maxWidth: "90%",
    textAlign: "center" as const,
  },
  errorBubble: {
    alignSelf: "center" as const,
    backgroundColor: "#2e1a1a",
    color: "#ff6666",
    padding: "6px 12px",
    borderRadius: "8px",
    fontSize: "12px",
  },
  buttonArea: {
    padding: "16px 24px 32px",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: "8px",
    flexShrink: 0,
  },
  mainButton: {
    width: "100%",
    maxWidth: "320px",
    padding: "16px 32px",
    borderRadius: "28px",
    fontSize: "18px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "all 0.2s",
    outline: "none",
  },
  hint: {
    fontSize: "12px",
    color: "#555",
  },
};
