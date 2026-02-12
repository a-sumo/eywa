/**
 * SpectaclesReceiver.tsx
 *
 * Simple receiver to test broadcast streaming.
 * Open this in a second tab while SpectaclesView is broadcasting.
 */

import { useEffect, useState, useRef } from "react";
import { useFoldContext } from "../context/FoldContext";
import { supabase } from "../lib/supabase";

export function SpectaclesReceiver() {
  const { fold } = useFoldContext();
  const imgRef = useRef<HTMLImageElement>(null);
  const [status, setStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [frameCount, setFrameCount] = useState(0);
  const [lastFrameTime, setLastFrameTime] = useState<number | null>(null);
  const [fps, setFps] = useState(0);

  useEffect(() => {
    if (!fold?.slug) return;

    setStatus("connecting");

    const channel = supabase.channel(`spectacles:${fold.slug}`, {
      config: { broadcast: { ack: false, self: false } },
    });

    let frameTimestamps: number[] = [];

    channel
      .on("broadcast", { event: "frame" }, ({ payload }) => {
        const now = Date.now();
        setFrameCount((c) => c + 1);
        setLastFrameTime(now);

        // Calculate FPS from last 10 frames
        frameTimestamps.push(now);
        if (frameTimestamps.length > 10) {
          frameTimestamps = frameTimestamps.slice(-10);
        }
        if (frameTimestamps.length >= 2) {
          const duration = frameTimestamps[frameTimestamps.length - 1] - frameTimestamps[0];
          setFps(Math.round((frameTimestamps.length - 1) / (duration / 1000)));
        }

        // Display frame
        if (imgRef.current && payload.image) {
          imgRef.current.src = `data:image/jpeg;base64,${payload.image}`;
        }
      })
      .subscribe((s) => {
        if (s === "SUBSCRIBED") {
          setStatus("connected");
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fold?.slug]);

  const timeSinceFrame = lastFrameTime ? Math.floor((Date.now() - lastFrameTime) / 1000) : null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "#050508",
        padding: "1rem",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
        <div
          style={{
            width: 12,
            height: 12,
            borderRadius: "50%",
            background:
              status === "connected"
                ? frameCount > 0
                  ? "#4ade80"
                  : "#fbbf24"
                : status === "connecting"
                ? "#fbbf24"
                : "#f87171",
            animation: status === "connecting" ? "pulse 1s infinite" : undefined,
          }}
        />
        <h1 style={{ color: "#e879f9", fontSize: "1.25rem", margin: 0 }}>Spectacles Receiver</h1>
      </div>

      <p style={{ color: "#8b949e", fontSize: "0.875rem", marginBottom: "1rem", textAlign: "center" }}>
        {status === "disconnected" && "Disconnected"}
        {status === "connecting" && `Connecting to spectacles:${fold?.slug}...`}
        {status === "connected" && frameCount === 0 && "Connected. Waiting for frames..."}
        {status === "connected" && frameCount > 0 && `Receiving frames at ${fps} fps`}
      </p>

      <div
        style={{
          width: 512,
          height: 512,
          maxWidth: "100%",
          aspectRatio: "1",
          border: `2px solid ${frameCount > 0 ? "#4ade80" : "#30363d"}`,
          borderRadius: "12px",
          overflow: "hidden",
          background: "#0a0a14",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {frameCount > 0 ? (
          <img
            ref={imgRef}
            alt="Spectacles frame"
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        ) : (
          <div style={{ color: "#8b949e", textAlign: "center" }}>
            <div style={{ fontSize: "2rem", marginBottom: "1rem" }}>◎</div>
            <div>No frames yet</div>
            <div style={{ fontSize: "0.75rem", marginTop: "0.5rem", color: "#484f58" }}>
              Open another tab at
              <br />
              <code>/r/{fold?.slug}/spectacles</code>
              <br />
              and click "Broadcast"
            </div>
          </div>
        )}
      </div>

      <p
        style={{
          color: "#484f58",
          fontSize: "0.7rem",
          marginTop: "1rem",
          textAlign: "center",
        }}
      >
        Frames received: {frameCount}
        {timeSinceFrame !== null && ` | Last frame: ${timeSinceFrame}s ago`}
      </p>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
