/**
 * SwarmFlow.tsx - Vector field overview of agent swarm.
 *
 * Grid of arrows. Each agent = one arrow.
 * Direction = what they're working toward.
 * Length = activity level. Color = alignment with destination.
 * Green arrows pointing the same way = healthy swarm.
 */

import { useEffect, useRef, useMemo, useCallback } from "react";
import { useRealtimeMemories } from "../hooks/useRealtimeMemories";
import { useFoldContext } from "../context/FoldContext";
import { agentColor } from "../lib/agentColor";
import { SwarmFlowRenderer, type AgentVector } from "../lib/swarmFlow";
import type { Memory } from "../lib/supabase";

// --- Action → direction mapping ---
// Actions map to a 2D direction: x = build→ship, y = explore→stabilize

const ACTION_DIRS: Record<string, { x: number; y: number }> = {
  write:   { x: 0.7,  y: 0.3 },
  create:  { x: 0.8,  y: 0.2 },
  deploy:  { x: 1.0,  y: 0.0 },
  test:    { x: 0.2,  y: -0.8 },
  read:    { x: -0.3, y: 0.5 },
  debug:   { x: -0.2, y: -0.7 },
  delete:  { x: -0.5, y: -0.3 },
  review:  { x: 0.1,  y: -0.5 },
  refactor:{ x: 0.3,  y: -0.6 },
};

function extractAgentVectors(
  memories: Memory[],
  destinationDir: { dx: number; dy: number; label: string } | null,
): AgentVector[] {
  const agentMap = new Map<string, {
    name: string;
    ops: Array<{ action: string; scope: string; outcome: string; ts: number }>;
    lastSeen: number;
  }>();

  for (const m of memories) {
    const meta = (m.metadata ?? {}) as Record<string, unknown>;
    const agent = m.agent;
    if (!agent) continue;

    if (!agentMap.has(agent)) {
      agentMap.set(agent, { name: agent, ops: [], lastSeen: new Date(m.ts).getTime() });
    }

    const entry = agentMap.get(agent)!;
    entry.lastSeen = Math.max(entry.lastSeen, new Date(m.ts).getTime());

    if (meta.action) {
      entry.ops.push({
        action: meta.action as string,
        scope: (meta.scope as string) || "",
        outcome: (meta.outcome as string) || "success",
        ts: new Date(m.ts).getTime(),
      });
    }
  }

  const now = Date.now();
  const vectors: AgentVector[] = [];

  for (const [id, data] of agentMap) {
    const silentMs = now - data.lastSeen;
    const isActive = silentMs < 5 * 60 * 1000;
    const recentOps = data.ops.slice(-30);

    // Compute direction from recent actions
    let dx = 0, dy = 0;
    for (const op of recentOps) {
      const dir = ACTION_DIRS[op.action] || { x: 0, y: 0 };
      dx += dir.x;
      dy += dir.y;
    }
    const mag = Math.sqrt(dx * dx + dy * dy);
    if (mag > 0.1) { dx /= mag; dy /= mag; }

    // Activity: ops per minute, normalized 0..1
    const opsPerMin = recentOps.length > 1
      ? recentOps.length / Math.max(1, (now - recentOps[0].ts) / 60000)
      : 0;
    const activity = Math.min(1, opsPerMin / 5); // 5 ops/min = max

    // Productivity: success rate
    const successes = recentOps.filter(o => o.outcome === "success").length;
    const productivity = recentOps.length > 0 ? successes / recentOps.length : 0;

    // Alignment with destination
    let alignment = 0.5; // default: neutral
    if (destinationDir && mag > 0.1) {
      const dot = dx * destinationDir.dx + dy * destinationDir.dy;
      alignment = (dot + 1) / 2; // map -1..1 to 0..1
    }

    // Primary scope
    const scopeCounts = new Map<string, number>();
    for (const op of recentOps) {
      const s = op.scope.split("/")[0] || "other";
      scopeCounts.set(s, (scopeCounts.get(s) || 0) + 1);
    }
    let bestScope = "other";
    let bestCount = 0;
    for (const [s, c] of scopeCounts) {
      if (c > bestCount) { bestCount = c; bestScope = s; }
    }

    vectors.push({
      id, name: data.name, dx, dy,
      activity: isActive ? activity : 0,
      alignment, productivity,
      status: isActive ? "active" : "idle",
      opCount: data.ops.length,
      scope: bestScope,
      color: agentColor(data.name),
    });
  }

  // Sort: active first, then by opCount
  vectors.sort((a, b) => {
    if (a.status !== b.status) return a.status === "active" ? -1 : 1;
    return b.opCount - a.opCount;
  });

  // Only show agents seen in the last hour, cap at 30
  const oneHourAgo = now - 60 * 60 * 1000;
  const filtered = vectors.filter(v => {
    const entry = agentMap.get(v.id);
    return entry && entry.lastSeen > oneHourAgo;
  });

  // If no recent agents, show top 10 by op count as context
  if (filtered.length === 0) {
    return vectors.slice(0, 10);
  }

  return filtered.slice(0, 30);
}

// Extract destination direction from memories
function extractDestination(memories: Memory[]): { dx: number; dy: number; label: string } | null {
  // Find the latest destination memory
  for (let i = memories.length - 1; i >= 0; i--) {
    const meta = (memories[i].metadata ?? {}) as Record<string, unknown>;
    if (meta.event === "destination") {
      const content = memories[i].content || "";
      // Destination is a goal description. Map it to "forward" direction (building/shipping).
      return { dx: 0.8, dy: 0.3, label: content.slice(0, 80) };
    }
  }
  return null;
}

// --- Component ---

export function SwarmFlow() {
  const { fold } = useFoldContext();
  const { memories } = useRealtimeMemories(fold?.id ?? null, 500);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<SwarmFlowRenderer | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const destination = useMemo(() => extractDestination(memories), [memories]);
  const agentVectors = useMemo(
    () => extractAgentVectors(memories, destination),
    [memories, destination],
  );

  // Initialize renderer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new SwarmFlowRenderer(canvas);
    rendererRef.current = renderer;
    renderer.startAnimation();
    return () => { renderer.destroy(); rendererRef.current = null; };
  }, []);

  // Resize
  useEffect(() => {
    const onResize = () => rendererRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Update data
  useEffect(() => {
    if (!rendererRef.current) return;
    rendererRef.current.updateAgents(agentVectors);
    if (destination) {
      rendererRef.current.setDestination(destination.dx, destination.dy, destination.label);
    }
  }, [agentVectors, destination]);

  // Mouse
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!rendererRef.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const hit = rendererRef.current.hitTest(x, y);
    rendererRef.current.setHover(hit?.id || null);

    if (tooltipRef.current) {
      if (hit) {
        tooltipRef.current.style.display = "block";
        tooltipRef.current.style.left = `${x + 12}px`;
        tooltipRef.current.style.top = `${y - 8}px`;
        const shortName = hit.name.includes("/") ? hit.name.split("/").pop() : hit.name;
        tooltipRef.current.innerHTML = `
          <div style="font-weight:600;color:${hit.color}">${shortName}</div>
          <div>scope: ${hit.scope}</div>
          <div>ops: ${hit.opCount}</div>
          <div>alignment: ${(hit.alignment * 100).toFixed(0)}%</div>
          <div>productivity: ${(hit.productivity * 100).toFixed(0)}%</div>
        `;
      } else {
        tooltipRef.current.style.display = "none";
      }
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (tooltipRef.current) tooltipRef.current.style.display = "none";
    rendererRef.current?.setHover(null);
  }, []);

  return (
    <div className="swarm-flow-container">
      <div className="experimental-banner">
        <span className="experimental-banner-badge">LIVE</span>
        Generated in real-time from Eywa telemetry. Each arrow is an agent. Direction, length, and color show what they're doing, how active they are, and how aligned with the destination.
      </div>
      <div className="swarm-flow-body">
        <div className="swarm-flow-canvas-wrap">
          <canvas
            ref={canvasRef}
            className="swarm-flow-canvas"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          />
          <div ref={tooltipRef} className="swarm-flow-tooltip" style={{ display: "none" }} />
        </div>
      </div>
    </div>
  );
}
