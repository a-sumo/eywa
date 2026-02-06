/**
 * SpectaclesRenderer.tsx
 *
 * Renders a simplified Eywa UI to a canvas, captures frames as JPEG,
 * and pushes them to the worker for Spectacles to consume.
 *
 * This component acts as the "GPU" for the Spectacles display.
 * Open this page in a browser tab to power the AR experience.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "react-router-dom";

// Frame dimensions - matches what Spectacles expects
const FRAME_WIDTH = 512;
const FRAME_HEIGHT = 512;
const FRAME_RATE = 10; // fps - balance between smoothness and bandwidth

interface Memory {
  id: string;
  agent: string;
  content: string;
  type: string;
  ts: string;
}

interface DragState {
  isDragging: boolean;
  itemId: string | null;
  startUV: [number, number] | null;
  currentUV: [number, number] | null;
}

interface InteractionEvent {
  type: "pointer_move" | "pointer_down" | "pointer_up" | "drag" | "drop";
  uv: [number, number];
  itemId?: string;
}

export function SpectaclesRenderer() {
  const { slug } = useParams<{ slug: string }>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    itemId: null,
    startUV: null,
    currentUV: null,
  });
  const [pointerUV, setPointerUV] = useState<[number, number] | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastPush, setLastPush] = useState<number>(0);

  // Fetch initial data
  useEffect(() => {
    // Mock data for now - replace with Supabase fetch
    setMemories([
      { id: "1", agent: "claude/quiet-oak", content: "Implementing auth flow with JWT tokens", type: "assistant", ts: "2m ago" },
      { id: "2", agent: "gemini/swift-fox", content: "Database schema updated for user sessions", type: "assistant", ts: "5m ago" },
      { id: "3", agent: "claude/bold-pine", content: "Fixed CORS issue in API gateway", type: "assistant", ts: "8m ago" },
      { id: "4", agent: "human/armand", content: "Use Redis for session storage", type: "decision", ts: "12m ago" },
    ]);
  }, [slug]);

  // Listen for interaction events from Spectacles via Supabase Realtime
  useEffect(() => {
    // TODO: Set up Supabase Realtime subscription
    // For now, simulate with a polling mechanism or WebSocket
    const eventSource = new EventSource(`/api/spectacles/events?room=${slug}`);

    eventSource.onopen = () => setConnected(true);
    eventSource.onerror = () => setConnected(false);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data) as InteractionEvent;
      handleInteraction(data);
    };

    return () => eventSource.close();
  }, [slug]);

  // Handle interactions from Spectacles
  const handleInteraction = useCallback((event: InteractionEvent) => {
    switch (event.type) {
      case "pointer_move":
        setPointerUV(event.uv);
        if (dragState.isDragging) {
          setDragState(prev => ({ ...prev, currentUV: event.uv }));
        }
        break;

      case "pointer_down":
        // Check if pointer is over a memory card
        const hitItem = hitTest(event.uv, memories);
        if (hitItem) {
          setDragState({
            isDragging: true,
            itemId: hitItem.id,
            startUV: event.uv,
            currentUV: event.uv,
          });
        }
        break;

      case "pointer_up":
        if (dragState.isDragging && dragState.itemId) {
          // Determine drop zone
          const dropZone = getDropZone(event.uv);
          if (dropZone === "context") {
            // Add to context - this is the main action!
            console.log(`Dropped ${dragState.itemId} into context`);
            // TODO: Call remix_inject or add to context
          }
        }
        setDragState({
          isDragging: false,
          itemId: null,
          startUV: null,
          currentUV: null,
        });
        break;
    }
  }, [dragState, memories]);

  // Hit test: given UV coords, which memory card (if any) is under it?
  const hitTest = (uv: [number, number], items: Memory[]): Memory | null => {
    const [u, v] = uv;
    // Memory cards are in the left column (u < 0.5)
    // Each card is roughly 0.15 tall, starting at v = 0.2
    if (u > 0.5) return null;

    const cardIndex = Math.floor((v - 0.2) / 0.18);
    if (cardIndex >= 0 && cardIndex < items.length) {
      return items[cardIndex];
    }
    return null;
  };

  // Get drop zone from UV coords
  const getDropZone = (uv: [number, number]): "context" | "trash" | null => {
    const [u, v] = uv;
    // Context zone is the right side (u > 0.5)
    if (u > 0.5 && v > 0.3 && v < 0.8) {
      return "context";
    }
    // Trash zone is bottom right
    if (u > 0.8 && v > 0.85) {
      return "trash";
    }
    return null;
  };

  // Render the UI to canvas
  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear with dark background
    ctx.fillStyle = "#0a0a12";
    ctx.fillRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);

    // Draw header
    ctx.fillStyle = "#4eeaff";
    ctx.font = "bold 24px system-ui";
    ctx.fillText("Eywa", 20, 40);

    ctx.fillStyle = "#888";
    ctx.font = "14px system-ui";
    ctx.fillText(`Room: ${slug || "demo"}`, 20, 60);

    // Draw connection status
    ctx.fillStyle = connected ? "#4ade80" : "#f87171";
    ctx.beginPath();
    ctx.arc(FRAME_WIDTH - 20, 30, 6, 0, Math.PI * 2);
    ctx.fill();

    // Draw memory cards (left column)
    ctx.fillStyle = "#ffffff";
    ctx.font = "12px system-ui";
    ctx.fillText("Memories", 20, 100);

    memories.forEach((mem, i) => {
      const y = 120 + i * 90;
      const isBeingDragged = dragState.isDragging && dragState.itemId === mem.id;

      // Card background
      ctx.fillStyle = isBeingDragged ? "#2a4a5a" : "#1a1a2e";
      ctx.strokeStyle = isBeingDragged ? "#4eeaff" : "#333";
      ctx.lineWidth = isBeingDragged ? 2 : 1;

      // If dragging, offset the card toward current pointer
      let cardX = 20;
      let cardY = y;
      if (isBeingDragged && dragState.currentUV) {
        cardX = dragState.currentUV[0] * FRAME_WIDTH - 100;
        cardY = dragState.currentUV[1] * FRAME_HEIGHT - 30;
      }

      ctx.beginPath();
      ctx.roundRect(cardX, cardY, 220, 80, 8);
      ctx.fill();
      ctx.stroke();

      // Agent name
      ctx.fillStyle = "#4eeaff";
      ctx.font = "bold 11px system-ui";
      ctx.fillText(mem.agent, cardX + 10, cardY + 20);

      // Content preview
      ctx.fillStyle = "#ccc";
      ctx.font = "11px system-ui";
      const lines = wrapText(ctx, mem.content, 200);
      lines.slice(0, 2).forEach((line, li) => {
        ctx.fillText(line, cardX + 10, cardY + 38 + li * 14);
      });

      // Timestamp
      ctx.fillStyle = "#666";
      ctx.font = "10px system-ui";
      ctx.fillText(mem.ts, cardX + 10, cardY + 70);
    });

    // Draw context zone (right column)
    const contextZone = {
      x: FRAME_WIDTH / 2 + 20,
      y: 100,
      w: FRAME_WIDTH / 2 - 40,
      h: 350,
    };

    const isOverContext = pointerUV &&
      pointerUV[0] > 0.5 &&
      pointerUV[1] > 0.2 &&
      pointerUV[1] < 0.9;

    ctx.fillStyle = isOverContext && dragState.isDragging ? "#1a2a3a" : "#12121a";
    ctx.strokeStyle = isOverContext && dragState.isDragging ? "#4eeaff" : "#333";
    ctx.lineWidth = isOverContext && dragState.isDragging ? 2 : 1;
    ctx.setLineDash(dragState.isDragging ? [5, 5] : []);
    ctx.beginPath();
    ctx.roundRect(contextZone.x, contextZone.y, contextZone.w, contextZone.h, 8);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#888";
    ctx.font = "12px system-ui";
    ctx.fillText("Drop here to add context", contextZone.x + 40, contextZone.y + 180);

    // Draw pointer cursor if we have UV
    if (pointerUV) {
      const px = pointerUV[0] * FRAME_WIDTH;
      const py = pointerUV[1] * FRAME_HEIGHT;

      ctx.fillStyle = dragState.isDragging ? "#4eeaff" : "#ffffff";
      ctx.beginPath();
      ctx.arc(px, py, 8, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "#000";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Draw "Drag memories to context" instruction
    if (!dragState.isDragging) {
      ctx.fillStyle = "#666";
      ctx.font = "11px system-ui";
      ctx.fillText("Pinch and drag memories to context zone", 20, FRAME_HEIGHT - 20);
    }

  }, [memories, dragState, pointerUV, connected, slug]);

  // Helper: wrap text to fit width
  const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
    const words = text.split(" ");
    const lines: string[] = [];
    let currentLine = "";

    words.forEach(word => {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    });
    if (currentLine) lines.push(currentLine);
    return lines;
  };

  // Push frame to worker
  const pushFrame = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Failed to create blob"))),
          "image/jpeg",
          0.85
        );
      });

      await fetch(`/api/spectacles/frame?room=${slug}`, {
        method: "POST",
        body: blob,
        headers: { "Content-Type": "image/jpeg" },
      });

      setLastPush(Date.now());
    } catch (err) {
      console.error("Failed to push frame:", err);
    }
  }, [slug]);

  // Render loop
  useEffect(() => {
    let animationId: number;
    let lastFrameTime = 0;
    const frameInterval = 1000 / FRAME_RATE;

    const loop = (timestamp: number) => {
      if (timestamp - lastFrameTime >= frameInterval) {
        renderFrame();
        pushFrame();
        lastFrameTime = timestamp;
      }
      animationId = requestAnimationFrame(loop);
    };

    animationId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationId);
  }, [renderFrame, pushFrame]);

  // For debugging: allow mouse interaction on the canvas
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const u = (e.clientX - rect.left) / rect.width;
    const v = (e.clientY - rect.top) / rect.height;

    handleInteraction({ type: "pointer_down", uv: [u, v] });
    setTimeout(() => {
      handleInteraction({ type: "pointer_up", uv: [u, v] });
    }, 100);
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const u = (e.clientX - rect.left) / rect.width;
    const v = (e.clientY - rect.top) / rect.height;

    handleInteraction({ type: "pointer_move", uv: [u, v] });
  };

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "2rem",
      background: "#0a0a12",
      minHeight: "100vh",
      color: "#fff"
    }}>
      <h1 style={{ marginBottom: "1rem", color: "#4eeaff" }}>
        Spectacles Renderer
      </h1>
      <p style={{ marginBottom: "1rem", color: "#888" }}>
        Keep this tab open to power the Spectacles display
      </p>

      <div style={{
        display: "flex",
        gap: "1rem",
        marginBottom: "1rem",
        fontSize: "0.875rem"
      }}>
        <span>
          Status: {connected ? "Connected" : "Disconnected"}
          <span style={{
            display: "inline-block",
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: connected ? "#4ade80" : "#f87171",
            marginLeft: "0.5rem"
          }} />
        </span>
        <span>Last push: {lastPush ? `${Math.floor((Date.now() - lastPush) / 1000)}s ago` : "never"}</span>
      </div>

      <canvas
        ref={canvasRef}
        width={FRAME_WIDTH}
        height={FRAME_HEIGHT}
        onClick={handleCanvasClick}
        onMouseMove={handleCanvasMouseMove}
        style={{
          border: "2px solid #333",
          borderRadius: "8px",
          cursor: "pointer",
        }}
      />

      <p style={{ marginTop: "1rem", color: "#666", fontSize: "0.75rem" }}>
        Click/drag on canvas to simulate Spectacles interaction
      </p>
    </div>
  );
}
