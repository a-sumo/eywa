import { useEffect, useRef, useState, useCallback } from "react";
import { useRoomContext } from "../context/RoomContext";
import { supabase } from "../lib/supabase";

export function BroadcastTest() {
  const { room } = useRoomContext();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const intervalRef = useRef<number | null>(null);

  const [broadcasting, setBroadcasting] = useState(false);
  const [channelReady, setChannelReady] = useState(false);
  const [frameCount, setFrameCount] = useState(0);
  const [lastInteraction, setLastInteraction] = useState<string>("none");
  const [pointerUV, setPointerUV] = useState<[number, number] | null>(null);

  const slug = room?.slug ?? "demo";

  const W = 256;
  const H = 256;

  const drawFrame = useCallback((n: number, uv: [number, number] | null) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Dark background
    ctx.fillStyle = "#0a0a14";
    ctx.fillRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = "#1a1a2e";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const p = (i / 4) * W;
      ctx.beginPath();
      ctx.moveTo(p, 0); ctx.lineTo(p, H);
      ctx.moveTo(0, p); ctx.lineTo(W, p);
      ctx.stroke();
    }

    // Cursor circle
    if (uv) {
      const cx = uv[0] * W;
      const cy = uv[1] * H;

      // Glow
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 30);
      grad.addColorStop(0, "rgba(78, 234, 255, 0.5)");
      grad.addColorStop(1, "rgba(78, 234, 255, 0)");
      ctx.fillStyle = grad;
      ctx.fillRect(cx - 30, cy - 30, 60, 60);

      // Ring
      ctx.strokeStyle = "#4eeaff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, 16, 0, Math.PI * 2);
      ctx.stroke();

      // Dot
      ctx.fillStyle = "#4eeaff";
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fill();

      // Coords label
      ctx.fillStyle = "#4eeaff";
      ctx.font = "bold 12px system-ui";
      ctx.textAlign = "left";
      ctx.fillText(`${uv[0].toFixed(2)}, ${uv[1].toFixed(2)}`, cx + 22, cy + 4);
    }

    // Frame counter
    ctx.fillStyle = "#30363d";
    ctx.font = "11px system-ui";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(`frame ${n}`, 6, 6);

    // "Move cursor" hint when no pointer
    if (!uv) {
      ctx.fillStyle = "#8b949e";
      ctx.font = "16px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Hover on quad", W / 2, H / 2);
    }
  }, []);

  // Connect/disconnect channel
  useEffect(() => {
    if (!broadcasting) {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
        setChannelReady(false);
      }
      return;
    }

    const channel = supabase.channel(`spectacles:${slug}`, {
      config: { broadcast: { ack: false, self: false } },
    });

    // Listen for interaction events from Spectacles
    channel.on("broadcast", { event: "interaction" }, ({ payload }) => {
      if (!payload) return;
      const { type, uv } = payload as { type: string; uv: [number, number] };
      setLastInteraction(`${type} (${uv?.[0]?.toFixed(2)}, ${uv?.[1]?.toFixed(2)})`);
      if (type === "pointer_exit") {
        setPointerUV(null);
      } else if (uv) {
        setPointerUV(uv);
      }
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
  }, [broadcasting, slug]);

  // Broadcast loop
  useEffect(() => {
    if (!channelReady) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    let frame = 0;
    intervalRef.current = window.setInterval(() => {
      frame++;
      setFrameCount(frame);
      drawFrame(frame, pointerUV);

      const canvas = canvasRef.current;
      if (!canvas || !channelRef.current) return;

      const base64 = canvas.toDataURL("image/jpeg", 0.8).split(",")[1];
      channelRef.current.send({
        type: "broadcast",
        event: "frame",
        payload: { image: base64, frame },
      });
    }, 200); // 5 fps

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [channelReady, drawFrame, pointerUV]);

  // Draw initial frame
  useEffect(() => { drawFrame(0, null); }, [drawFrame]);

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", minHeight: "100vh", background: "#050508",
      gap: "1rem", color: "#e6edf3", fontFamily: "system-ui",
    }}>
      <h2 style={{ margin: 0, color: "#4eeaff" }}>Broadcast Test</h2>
      <p style={{ color: "#8b949e", margin: 0 }}>
        Channel: <code>spectacles:{slug}</code>
      </p>

      <canvas ref={canvasRef} width={W} height={H}
        style={{ border: "2px solid #30363d", borderRadius: 8, maxWidth: "100%", height: "auto" }} />

      <button
        onClick={() => setBroadcasting(!broadcasting)}
        style={{
          padding: "0.75rem 2rem", fontSize: "1rem", cursor: "pointer",
          borderRadius: 8, border: "1px solid",
          background: channelReady ? "#1a3a2e" : "#1a1a2e",
          color: channelReady ? "#4ade80" : "#e6edf3",
          borderColor: channelReady ? "#4ade80" : "#30363d",
        }}
      >
        {channelReady ? `Live - Frame ${frameCount}` : (broadcasting ? "Connecting..." : "Start")}
      </button>

      {broadcasting && (
        <button
          onClick={() => setBroadcasting(false)}
          style={{
            padding: "0.5rem 1.5rem", cursor: "pointer", borderRadius: 8,
            background: "#2a1a1a", color: "#f87171", border: "1px solid #f87171",
          }}
        >
          Stop
        </button>
      )}

      <p style={{ color: "#8b949e", fontSize: "0.75rem", margin: 0 }}>
        Last interaction: <code>{lastInteraction}</code>
      </p>
    </div>
  );
}
