/**
 * SwarmFlow.tsx - Real-time swarm physics visualizer.
 *
 * Renders agent flow fields, pressure regions, vorticity indicators,
 * and particle trails computed from live Eywa telemetry. Each agent
 * is a source in the flow field; particles trace the aggregate dynamics.
 *
 * Physics formalized in VISION.md "Physics of Agent Swarms" section.
 */

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useRealtimeMemories } from "../hooks/useRealtimeMemories";
import { useRoomContext } from "../context/RoomContext";
import { agentColor } from "../lib/agentColor";
import {
  SwarmFlowRenderer,
  type AgentNode,
  type SwarmMetrics,
  type ScopeRegion,
} from "../lib/swarmFlow";
import type { Memory } from "../lib/supabase";

// --- Extract agent flow data from memories ---

function extractAgentNodes(memories: Memory[]): AgentNode[] {
  const agentMap = new Map<string, {
    name: string;
    ops: Array<{ system: string; action: string; scope: string; outcome: string; ts: number }>;
    lastSeen: number;
    sessionId: string;
  }>();

  for (const m of memories) {
    const meta = (m.metadata ?? {}) as Record<string, unknown>;
    const agent = m.agent;
    if (!agent) continue;

    if (!agentMap.has(agent)) {
      agentMap.set(agent, {
        name: agent,
        ops: [],
        lastSeen: new Date(m.ts).getTime(),
        sessionId: (meta.session_id as string) || "",
      });
    }

    const entry = agentMap.get(agent)!;
    entry.lastSeen = Math.max(entry.lastSeen, new Date(m.ts).getTime());

    if (meta.system && meta.action) {
      entry.ops.push({
        system: meta.system as string,
        action: meta.action as string,
        scope: (meta.scope as string) || "",
        outcome: (meta.outcome as string) || "success",
        ts: new Date(m.ts).getTime(),
      });
    }
  }

  const now = Date.now();
  const nodes: AgentNode[] = [];

  // Action type -> direction bias
  const actionVectors: Record<string, { x: number; y: number }> = {
    write: { x: 0.5, y: 0.3 },
    create: { x: 0.6, y: 0.4 },
    deploy: { x: 0, y: 0.8 },
    test: { x: 0.3, y: -0.3 },
    read: { x: -0.2, y: -0.1 },
    debug: { x: -0.3, y: -0.4 },
    delete: { x: -0.4, y: 0 },
    review: { x: 0.1, y: -0.2 },
  };

  // Scope -> position in field
  const scopePositions: Record<string, { x: number; y: number }> = {
    web: { x: -0.6, y: -0.4 },
    worker: { x: 0.6, y: -0.4 },
    git: { x: 0, y: -0.7 },
    deploy: { x: 0, y: 0.7 },
    filesystem: { x: -0.5, y: 0.3 },
    ci: { x: 0.5, y: 0.3 },
  };

  for (const [id, data] of agentMap) {
    const silentMs = now - data.lastSeen;
    const isActive = silentMs < 5 * 60 * 1000; // 5 min threshold

    // Compute direction from recent operations
    let vx = 0, vy = 0;
    const recentOps = data.ops.slice(-20);
    for (const op of recentOps) {
      const av = actionVectors[op.action] || { x: 0, y: 0 };
      vx += av.x;
      vy += av.y;
    }
    const mag = Math.sqrt(vx * vx + vy * vy);
    if (mag > 0.1) { vx /= mag; vy /= mag; }

    // Position near primary scope
    const primaryScope = getMostCommonScope(recentOps);
    const basePos = scopePositions[primaryScope] || { x: 0, y: 0 };
    const jitter = hashToJitter(id);

    // Curvature: success rate * throughput
    const successes = recentOps.filter(o => o.outcome === "success").length;
    const failures = recentOps.filter(o => o.outcome === "failure" || o.outcome === "blocked").length;
    const curvature = recentOps.length > 0
      ? (successes - failures * 2) / recentOps.length
      : 0;

    nodes.push({
      id,
      name: data.name,
      color: agentColor(data.name),
      x: basePos.x + jitter.x * 0.15,
      y: basePos.y + jitter.y * 0.15,
      vx: isActive ? vx * 0.5 : 0,
      vy: isActive ? vy * 0.5 : 0,
      scope: primaryScope,
      status: isActive ? "active" : "idle",
      curvature,
      opCount: data.ops.length,
      outcomes: {
        success: successes,
        failure: failures,
        blocked: recentOps.filter(o => o.outcome === "blocked").length,
      },
      lastSeen: data.lastSeen,
    });
  }

  return nodes;
}

function getMostCommonScope(ops: Array<{ scope: string }>): string {
  const counts = new Map<string, number>();
  for (const op of ops) {
    // Extract scope category from paths like "web/src/App.tsx" -> "web"
    const scope = op.scope.split("/")[0] || "other";
    const normalized = scope.includes(".") ? "filesystem" : scope;
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
  }
  let max = 0, best = "other";
  for (const [scope, count] of counts) {
    if (count > max) { max = count; best = scope; }
  }
  return best;
}

function hashToJitter(str: string): { x: number; y: number } {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return {
    x: ((hash & 0xFF) / 128) - 1,
    y: (((hash >> 8) & 0xFF) / 128) - 1,
  };
}

// --- Component ---

export function SwarmFlow() {
  const { room } = useRoomContext();
  const { memories } = useRealtimeMemories(room?.id ?? null, 500);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<SwarmFlowRenderer | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const [metrics, setMetrics] = useState<SwarmMetrics | null>(null);
  const [regions, setRegions] = useState<ScopeRegion[]>([]);
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null);

  // Process memories into agent nodes
  const agentNodes = useMemo(() => extractAgentNodes(memories), [memories]);

  // Initialize renderer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new SwarmFlowRenderer(canvas);
    rendererRef.current = renderer;
    renderer.startAnimation();

    return () => {
      renderer.destroy();
      rendererRef.current = null;
    };
  }, []);

  // Resize handler
  useEffect(() => {
    const onResize = () => rendererRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Update agent data
  useEffect(() => {
    if (!rendererRef.current) return;
    rendererRef.current.updateAgents(agentNodes);
    setMetrics(rendererRef.current.getMetrics());
    setRegions(rendererRef.current.getRegions());
  }, [agentNodes]);

  // Periodic metrics update
  useEffect(() => {
    const interval = setInterval(() => {
      if (rendererRef.current) {
        setMetrics(rendererRef.current.getMetrics());
      }
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Mouse interaction
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!rendererRef.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const hit = rendererRef.current.hitTest(x, y);
    rendererRef.current.setHover(hit.agent || null, hit.region || null);
    setHoveredAgent(hit.agent?.name || null);

    if (tooltipRef.current) {
      if (hit.agent || hit.region) {
        tooltipRef.current.style.display = "block";
        tooltipRef.current.style.left = `${x + 12}px`;
        tooltipRef.current.style.top = `${y - 8}px`;

        if (hit.agent) {
          const a = hit.agent;
          const shortName = a.name.split("/").pop() || a.name;
          tooltipRef.current.innerHTML = `
            <div style="font-weight:600;color:${a.color}">${shortName}</div>
            <div>status: ${a.status}</div>
            <div>scope: ${a.scope}</div>
            <div>ops: ${a.opCount} (${a.outcomes.success}ok/${a.outcomes.failure}fail)</div>
            <div>curvature: ${a.curvature.toFixed(2)}</div>
          `;
        } else if (hit.region) {
          const r = hit.region;
          tooltipRef.current.innerHTML = `
            <div style="font-weight:600;color:${r.color}">${r.label}</div>
            <div>agents: ${r.agents.length}</div>
            <div>pressure: ${r.pressure}</div>
            <div>coherence: ${r.flowCoherence.toFixed(2)}</div>
            <div>vorticity: ${r.vorticity.toFixed(2)}</div>
          `;
        }
      } else {
        tooltipRef.current.style.display = "none";
      }
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (tooltipRef.current) tooltipRef.current.style.display = "none";
    rendererRef.current?.setHover(null, null);
    setHoveredAgent(null);
  }, []);

  return (
    <div className="swarm-flow-container">
      <div className="swarm-flow-canvas-wrap">
        <canvas
          ref={canvasRef}
          className="swarm-flow-canvas"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        />
        <div ref={tooltipRef} className="swarm-flow-tooltip" style={{ display: "none" }} />
      </div>
      {metrics && (
        <div className="swarm-flow-panel">
          <div className="swarm-flow-metric-header">Swarm Physics</div>
          <div className="swarm-flow-metrics">
            <MetricRow label="Agents" value={`${metrics.activeAgents}/${metrics.totalAgents}`} />
            <MetricRow label="Re" value={metrics.reynoldsNumber.toFixed(1)} />
            <MetricRow
              label="Regime"
              value={metrics.regime}
              color={
                metrics.regime === "laminar" ? "var(--aurora-cyan)"
                : metrics.regime === "transitional" ? "var(--aurora-purple)"
                : "var(--aurora-pink)"
              }
            />
            <MetricRow label="Flow coherence" value={metrics.avgFlowCoherence.toFixed(2)} />
            <MetricRow label="Avg curvature" value={metrics.avgCurvature.toFixed(2)} />
            <MetricRow label="Throughput" value={`${metrics.throughput} ops`} />
            <MetricRow label="Heat" value={`${(metrics.heatDissipation * 100).toFixed(0)}%`} warn={metrics.heatDissipation > 0.1} />
            <MetricRow label="Max vorticity" value={metrics.maxVorticity.toFixed(2)} warn={metrics.maxVorticity > 0.3} />
          </div>
          {regions.length > 0 && (
            <>
              <div className="swarm-flow-metric-header" style={{ marginTop: 12 }}>Scope Regions</div>
              <div className="swarm-flow-regions">
                {regions.map(r => (
                  <div key={r.id} className="swarm-flow-region-row">
                    <span className="swarm-flow-region-dot" style={{ background: r.color }} />
                    <span className="swarm-flow-region-label">{r.label}</span>
                    <span className="swarm-flow-region-stats">
                      {r.agents.length}a P={r.pressure}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MetricRow({ label, value, color, warn }: {
  label: string;
  value: string;
  color?: string;
  warn?: boolean;
}) {
  return (
    <div className={`swarm-flow-metric-row ${warn ? "warn" : ""}`}>
      <span className="swarm-flow-metric-label">{label}</span>
      <span className="swarm-flow-metric-value" style={color ? { color } : undefined}>
        {value}
      </span>
    </div>
  );
}
