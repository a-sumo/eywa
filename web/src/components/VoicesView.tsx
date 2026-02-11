/**
 * VoicesView.tsx - Ambient voice interface for eywa.
 *
 * Pulsing orb UI inspired by ChatGPT voice mode / Gemini Live.
 * Tap orb to connect, talk hands-free. Audio-reactive visualization.
 * Transcript streams below. Phone-first, works from anywhere.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { useRoomContext } from "../context/RoomContext";
import { useGeminiLive, type VoiceEvent, type VoiceState } from "../hooks/useGeminiLive";
import { useParams } from "react-router-dom";

// --- Orb component ---
function Orb({ state, micLevelRef }: { state: VoiceState; micLevelRef: React.RefObject<number> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef(0);
  const smoothLevel = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const size = 280;
    canvas.width = size * 2;
    canvas.height = size * 2;
    ctx.scale(2, 2); // retina

    const draw = (time: number) => {
      const mic = micLevelRef.current ?? 0;
      // Smooth the mic level
      smoothLevel.current += (mic - smoothLevel.current) * 0.15;
      const level = smoothLevel.current;

      ctx.clearRect(0, 0, size, size);
      const cx = size / 2;
      const cy = size / 2;

      // Outer glow layers
      const baseRadius = 60;
      const pulseSpeed = state === "speaking" ? 0.003 : 0.0015;
      const breathe = Math.sin(time * pulseSpeed) * 0.08;
      const micPulse = state === "listening" ? level * 200 : 0;
      const speakPulse = state === "speaking" ? 8 + Math.sin(time * 0.005) * 6 : 0;
      const radius = baseRadius + baseRadius * breathe + micPulse + speakPulse;

      // Colors based on state
      let coreColor: string;
      let glowColor: string;
      let outerGlow: string;

      switch (state) {
        case "listening":
          coreColor = "#00ff88";
          glowColor = "rgba(0, 255, 136, 0.3)";
          outerGlow = "rgba(0, 255, 136, 0.08)";
          break;
        case "speaking":
          coreColor = "#8866ff";
          glowColor = "rgba(136, 102, 255, 0.35)";
          outerGlow = "rgba(136, 102, 255, 0.1)";
          break;
        case "connecting":
          coreColor = "#ffaa00";
          glowColor = "rgba(255, 170, 0, 0.25)";
          outerGlow = "rgba(255, 170, 0, 0.06)";
          break;
        default:
          coreColor = "#334";
          glowColor = "rgba(51, 51, 68, 0.2)";
          outerGlow = "rgba(51, 51, 68, 0.05)";
      }

      // Outer glow
      const outerGrad = ctx.createRadialGradient(cx, cy, radius, cx, cy, radius * 2.5);
      outerGrad.addColorStop(0, outerGlow);
      outerGrad.addColorStop(1, "transparent");
      ctx.fillStyle = outerGrad;
      ctx.fillRect(0, 0, size, size);

      // Mid glow
      const midGrad = ctx.createRadialGradient(cx, cy, radius * 0.5, cx, cy, radius * 1.6);
      midGrad.addColorStop(0, glowColor);
      midGrad.addColorStop(1, "transparent");
      ctx.fillStyle = midGrad;
      ctx.fillRect(0, 0, size, size);

      // Core orb
      const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      coreGrad.addColorStop(0, coreColor);
      coreGrad.addColorStop(0.7, glowColor);
      coreGrad.addColorStop(1, "transparent");
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();

      // Inner bright core
      const innerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 0.4);
      innerGrad.addColorStop(0, "rgba(255,255,255,0.9)");
      innerGrad.addColorStop(0.5, coreColor);
      innerGrad.addColorStop(1, "transparent");
      ctx.fillStyle = innerGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.4, 0, Math.PI * 2);
      ctx.fill();

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [state, micLevelRef]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: 280, height: 280, cursor: "pointer" }}
    />
  );
}

// --- Transcript entry ---
interface TranscriptEntry {
  id: number;
  role: "user" | "eywa" | "tool" | "status" | "error";
  text: string;
}

// --- Main view ---
export function VoicesView() {
  const { room } = useRoomContext();
  const { slug } = useParams<{ slug: string }>();

  // Transcript
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [liveUser, setLiveUser] = useState("");
  const [liveResponse, setLiveResponse] = useState("");
  const idRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bootstrapRef = useRef(true); // suppress first user_speech (auto-briefing trigger)

  const addEntry = useCallback((role: TranscriptEntry["role"], text: string) => {
    if (!text.trim()) return;
    setTranscript(prev => [...prev.slice(-30), { id: ++idRef.current, role, text }]);
    setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  const onEvent = useCallback((event: VoiceEvent) => {
    switch (event.type) {
      case "user_speech":
        // Suppress the auto-briefing bootstrap message from transcript
        if (bootstrapRef.current) {
          bootstrapRef.current = false;
          return;
        }
        setLiveUser(prev => prev + event.text);
        break;
      case "response":
        if (event.final) {
          if (liveResponse) addEntry("eywa", liveResponse);
          if (liveUser) { addEntry("user", liveUser); setLiveUser(""); }
          setLiveResponse("");
        } else if (event.text) {
          setLiveResponse(prev => prev + event.text);
        }
        break;
      case "tool_call":
        addEntry("tool", `${event.name}: ${(event.result || "").slice(0, 120)}`);
        break;
      case "status":
        addEntry("status", event.text);
        break;
      case "error":
        addEntry("error", event.text);
        break;
    }
  }, [addEntry, liveResponse, liveUser]);

  const { connected, voiceState, micLevelRef, connect, disconnect } = useGeminiLive({
    roomId: room?.id || null,
    roomSlug: slug || "",
    onEvent,
  });

  // Reset bootstrap flag when disconnecting
  useEffect(() => {
    if (!connected) {
      bootstrapRef.current = true;
    }
  }, [connected]);

  const handleOrbTap = () => {
    if (connected) {
      disconnect();
    } else {
      connect();
    }
  };

  const stateLabel: Record<VoiceState, string> = {
    idle: "Tap to connect",
    connecting: "Connecting...",
    listening: "Listening",
    speaking: "Eywa is speaking",
  };

  return (
    <div style={S.page}>
      {/* Room name */}
      <div style={S.roomLabel}>{room?.name || slug || "eywa"}</div>

      {/* Orb area */}
      <div style={S.orbArea} onClick={handleOrbTap}>
        <Orb state={voiceState} micLevelRef={micLevelRef} />
        <div style={S.stateLabel}>{stateLabel[voiceState]}</div>
      </div>

      {/* Transcript */}
      <div style={S.transcript}>
        {transcript.map(entry => (
          <div key={entry.id} style={S.entry}>
            {entry.role === "user" && <div style={S.userText}>{entry.text}</div>}
            {entry.role === "eywa" && <div style={S.eywaText}>{entry.text}</div>}
            {entry.role === "tool" && <div style={S.toolText}>{entry.text}</div>}
            {entry.role === "status" && <div style={S.statusText}>{entry.text}</div>}
            {entry.role === "error" && <div style={S.errorText}>{entry.text}</div>}
          </div>
        ))}
        {liveUser && <div style={S.entry}><div style={{ ...S.userText, opacity: 0.6 }}>{liveUser}</div></div>}
        {liveResponse && <div style={S.entry}><div style={{ ...S.eywaText, opacity: 0.6 }}>{liveResponse}</div></div>}
        <div ref={scrollRef} />
      </div>

      {/* Disconnect button (only when connected) */}
      {connected && (
        <button onClick={disconnect} style={S.endBtn}>End</button>
      )}
    </div>
  );
}

// --- Styles ---
const S: Record<string, React.CSSProperties> = {
  page: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    height: "100vh",
    width: "100%",
    backgroundColor: "#0a0a14",
    color: "#e0e0e0",
    fontFamily: "-apple-system, system-ui, sans-serif",
    overflow: "hidden",
    position: "fixed",
    inset: 0,
    zIndex: 9999,
  },
  roomLabel: {
    fontSize: "12px",
    color: "#444",
    textTransform: "uppercase",
    letterSpacing: "2px",
    marginTop: "16px",
    flexShrink: 0,
  },
  orbArea: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    flexShrink: 0,
    paddingTop: "20px",
  },
  stateLabel: {
    fontSize: "14px",
    color: "#666",
    marginTop: "-8px",
    letterSpacing: "0.5px",
  },
  transcript: {
    flex: 1,
    overflowY: "auto",
    width: "100%",
    maxWidth: "480px",
    padding: "16px 24px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  entry: {},
  userText: {
    textAlign: "right",
    color: "#88ccaa",
    fontSize: "15px",
    lineHeight: "1.5",
    padding: "4px 0",
  },
  eywaText: {
    color: "#ccc",
    fontSize: "15px",
    lineHeight: "1.5",
    padding: "4px 0",
  },
  toolText: {
    color: "#8866ff",
    fontSize: "12px",
    fontFamily: "monospace",
    textAlign: "center",
    padding: "2px 0",
    opacity: 0.7,
  },
  statusText: {
    color: "#555",
    fontSize: "11px",
    textAlign: "center",
    padding: "2px 0",
    fontStyle: "italic",
  },
  errorText: {
    color: "#ff6666",
    fontSize: "12px",
    textAlign: "center",
    padding: "2px 0",
  },
  endBtn: {
    background: "none",
    border: "1px solid #333",
    color: "#666",
    borderRadius: "20px",
    padding: "8px 32px",
    fontSize: "14px",
    cursor: "pointer",
    marginBottom: "32px",
    flexShrink: 0,
  },
};
