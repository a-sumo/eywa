import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useRealtimeMemories } from "../hooks/useRealtimeMemories";
import { useRoomContext } from "../context/RoomContext";
import { useParams } from "react-router-dom";
import { supabase, type Memory } from "../lib/supabase";
import { agentColor } from "../lib/agentColor";
import { getAvatar } from "./avatars";
import { ConnectAgent } from "./ConnectAgent";
import { useGeminiChat, type ChatMessage } from "../hooks/useGeminiChat";

// --- Destination ---

interface Destination {
  destination: string;
  milestones: string[];
  progress: Record<string, boolean>;
  notes: string | null;
  setBy: string;
  updatedBy: string | null;
  ts: string;
}

function extractDestination(memories: Memory[]): Destination | null {
  for (const m of memories) {
    const meta = (m.metadata ?? {}) as Record<string, unknown>;
    if (meta.event === "destination" && m.message_type === "knowledge") {
      return {
        destination: (meta.destination as string) || "",
        milestones: (meta.milestones as string[]) || [],
        progress: (meta.progress as Record<string, boolean>) || {},
        notes: (meta.notes as string) || null,
        setBy: (meta.set_by as string) || m.agent,
        updatedBy: (meta.last_updated_by as string) || null,
        ts: m.ts,
      };
    }
  }
  return null;
}

// --- Types ---

interface AgentProgress {
  percent: number;
  task: string;
  status: string;
  detail: string | null;
  ts: string;
}

interface AgentOp {
  id: string;
  content: string;
  system?: string;
  action?: string;
  scope?: string;
  outcome?: string;
  event?: string;
  type: string;
  ts: string;
}

interface AgentState {
  agent: string;
  user: string;
  status: "active" | "idle" | "finished";
  task: string;
  sessionId: string;
  systems: Set<string>;
  actions: Set<string>;
  opCount: number;
  outcomes: { success: number; failure: number; blocked: number };
  lastSeen: string;
  recentOps: AgentOp[];
  progress: AgentProgress | null;
  toolCallCount: number;
}

// Context pressure thresholds (matches worker/src/lib/pressure.ts)
const PRESSURE_WARN = 30;
const PRESSURE_HIGH = 50;
const PRESSURE_CRITICAL = 70;

function getPressureLevel(toolCalls: number): "ok" | "warn" | "high" | "critical" {
  if (toolCalls >= PRESSURE_CRITICAL) return "critical";
  if (toolCalls >= PRESSURE_HIGH) return "high";
  if (toolCalls >= PRESSURE_WARN) return "warn";
  return "ok";
}

const PRESSURE_COLORS: Record<string, string> = {
  ok: "transparent",
  warn: "#eab308",
  high: "#f97316",
  critical: "#ef4444",
};

interface DistressSignal {
  id: string;
  agent: string;
  task: string;
  done: string;
  remaining: string;
  context: string;
  filesChanged: string[];
  resolved: boolean;
  ts: string;
}

// --- Constants ---

const ACTIVE_THRESHOLD = 30 * 60 * 1000; // 30 min

const TIME_RANGES = [
  { label: "1h", hours: 1 },
  { label: "6h", hours: 6 },
  { label: "24h", hours: 24 },
  { label: "All", hours: 0 },
];

const NOISE_EVENTS = new Set(["agent_connected"]);

const SYSTEM_COLORS: Record<string, string> = {
  git: "#f97316",
  database: "#06b6d4",
  api: "#8b5cf6",
  deploy: "#22c55e",
  infra: "#ec4899",
  browser: "#3b82f6",
  test: "#eab308",
  build: "#a855f7",
  filesystem: "#64748b",
  communication: "#f472b6",
  terminal: "#a3e635",
  editor: "#38bdf8",
  ci: "#fb923c",
  cloud: "#818cf8",
  monitor: "#2dd4bf",
};

const OUTCOME_COLORS: Record<string, string> = {
  success: "#6ee7b7",
  failure: "#fca5a5",
  blocked: "#fcd34d",
  in_progress: "#93c5fd",
};

const EVENT_STYLES: Record<string, { borderColor: string; bgTint: string }> = {
  distress: { borderColor: "#ef4444", bgTint: "rgba(239, 68, 68, 0.06)" },
  session_start: { borderColor: "#22c55e", bgTint: "transparent" },
  session_done: { borderColor: "#64748b", bgTint: "transparent" },
  session_end: { borderColor: "#64748b", bgTint: "transparent" },
  context_injection: { borderColor: "#a855f7", bgTint: "rgba(168, 85, 247, 0.04)" },
  checkpoint: { borderColor: "#eab308", bgTint: "rgba(234, 179, 8, 0.04)" },
};

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

function isNoise(m: Memory): boolean {
  const meta = (m.metadata ?? {}) as Record<string, unknown>;
  if (NOISE_EVENTS.has(meta.event as string)) return true;
  // Resource-only with no useful content
  if (m.message_type === "resource" && (!m.content || m.content.length < 20)) return true;
  return false;
}

function extractOp(m: Memory): AgentOp {
  const meta = (m.metadata ?? {}) as Record<string, unknown>;
  return {
    id: m.id,
    content: (m.content ?? "").slice(0, 300),
    system: meta.system as string | undefined,
    action: meta.action as string | undefined,
    scope: meta.scope as string | undefined,
    outcome: meta.outcome as string | undefined,
    event: meta.event as string | undefined,
    type: m.message_type,
    ts: m.ts,
  };
}

function extractDistress(memories: Memory[]): DistressSignal[] {
  const signals: DistressSignal[] = [];
  for (const m of memories) {
    const meta = (m.metadata ?? {}) as Record<string, unknown>;
    if (meta.event === "distress") {
      signals.push({
        id: m.id,
        agent: m.agent,
        task: (meta.task as string) || "",
        done: (meta.done as string) || "",
        remaining: (meta.remaining as string) || "",
        context: (meta.context as string) || "",
        filesChanged: (meta.files_changed as string[]) || [],
        resolved: meta.resolved === true,
        ts: m.ts,
      });
    }
  }
  return signals;
}

function buildAgentStates(memories: Memory[]): Map<string, AgentState> {
  const agents = new Map<string, AgentState>();

  for (const m of memories) {
    if (isNoise(m)) continue;

    const meta = (m.metadata ?? {}) as Record<string, unknown>;
    const user = (meta.user as string) ?? m.agent.split("/")[0];

    let state = agents.get(m.agent);
    if (!state) {
      let status: "active" | "idle" | "finished" = "idle";
      let task = "";

      if (meta.event === "session_start") {
        const age = Date.now() - new Date(m.ts).getTime();
        status = age < ACTIVE_THRESHOLD ? "active" : "idle";
        task = (meta.task as string) || "";
      } else if (meta.event === "session_done" || meta.event === "session_end") {
        status = "finished";
        task = (meta.summary as string) || "";
      } else if (meta.event === "distress") {
        status = "finished";
        task = `DISTRESS: ${(meta.task as string) || ""}`;
      } else if (Date.now() - new Date(m.ts).getTime() < ACTIVE_THRESHOLD) {
        status = "active";
      }

      state = {
        agent: m.agent,
        user,
        status,
        task: task || (m.content ?? "").slice(0, 120),
        sessionId: m.session_id,
        systems: new Set(),
        actions: new Set(),
        opCount: 0,
        outcomes: { success: 0, failure: 0, blocked: 0 },
        lastSeen: m.ts,
        recentOps: [],
        progress: null,
        toolCallCount: 0,
      };
      agents.set(m.agent, state);
    }

    // Count tool calls for context pressure estimation
    if (m.message_type === "tool_call" || m.message_type === "tool_result") {
      state.toolCallCount++;
    }

    if (meta.system) state.systems.add(meta.system as string);
    if (meta.action) state.actions.add(meta.action as string);
    if (meta.outcome === "success") state.outcomes.success++;
    else if (meta.outcome === "failure") state.outcomes.failure++;
    else if (meta.outcome === "blocked") state.outcomes.blocked++;

    // Capture latest progress event
    if (meta.event === "progress" && !state.progress) {
      state.progress = {
        percent: (meta.percent as number) ?? 0,
        task: (meta.task as string) || "",
        status: (meta.status as string) || "working",
        detail: (meta.detail as string) || null,
        ts: m.ts,
      };
    }

    state.opCount++;
    if (state.recentOps.length < 10) {
      state.recentOps.push(extractOp(m));
    }
  }

  return agents;
}

// --- Agent Topology Map ---

function AgentTopologyMap({
  agents,
  destination,
}: {
  agents: AgentState[];
  destination: Destination | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    // Build node positions using deterministic layout from agent name
    const centerX = W / 2;
    const centerY = H / 2;
    const maxRadius = Math.min(W, H) * 0.38;

    interface Node {
      x: number;
      y: number;
      r: number;
      agent: AgentState;
      color: string;
      systems: string[];
    }

    const nodes: Node[] = agents.map((a, i) => {
      // Hash agent name to angle
      let hash = 0;
      for (let c = 0; c < a.agent.length; c++) {
        hash = ((hash << 5) - hash + a.agent.charCodeAt(c)) | 0;
      }
      const angle = ((hash % 360) / 360) * Math.PI * 2;

      // Distance from center based on status: active closer, idle farther
      const distFraction =
        a.status === "active" ? 0.35 + (i % 5) * 0.08
        : a.status === "finished" ? 0.55 + (i % 4) * 0.08
        : 0.75 + (i % 3) * 0.06;
      const dist = maxRadius * Math.min(distFraction, 0.95);

      // Size based on operation count
      const r = Math.max(3, Math.min(8, 3 + Math.log2(a.opCount + 1)));

      const color =
        a.status === "active" ? "#8b5cf6"
        : a.status === "finished" ? "#6ee7b7"
        : "#64748b";

      return {
        x: centerX + Math.cos(angle) * dist,
        y: centerY + Math.sin(angle) * dist,
        r,
        agent: a,
        color,
        systems: Array.from(a.systems),
      };
    });

    // Find edges: shared systems between agents
    interface Edge { a: number; b: number; color: string; }
    const edges: Edge[] = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const shared = nodes[i].systems.filter((s) => nodes[j].systems.includes(s));
        if (shared.length > 0) {
          const color = SYSTEM_COLORS[shared[0]] || "#64748b";
          edges.push({ a: i, b: j, color });
        }
      }
    }

    let flowOffset = 0;

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, W, H);
      flowOffset += 0.003;

      // Subtle radial gradient background
      const grad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, maxRadius);
      grad.addColorStop(0, "rgba(139, 92, 246, 0.04)");
      grad.addColorStop(0.5, "rgba(6, 182, 212, 0.02)");
      grad.addColorStop(1, "transparent");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // Orbit rings (very subtle)
      ctx.strokeStyle = "rgba(139, 92, 246, 0.06)";
      ctx.lineWidth = 0.5;
      for (const frac of [0.35, 0.55, 0.75]) {
        ctx.beginPath();
        ctx.arc(centerX, centerY, maxRadius * frac, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Draw edges with flow
      for (const e of edges) {
        const na = nodes[e.a];
        const nb = nodes[e.b];
        ctx.strokeStyle = e.color + "20";
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(na.x, na.y);
        ctx.lineTo(nb.x, nb.y);
        ctx.stroke();
      }

      // Destination node at center
      if (destination) {
        const done = destination.milestones.filter((m) => destination.progress[m]).length;
        const total = destination.milestones.length;
        const pct = total > 0 ? done / total : 0;

        // Progress ring
        ctx.strokeStyle = "rgba(139, 92, 246, 0.3)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(centerX, centerY, 14, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = pct === 1 ? "#34d399" : "#8b5cf6";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(centerX, centerY, 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
        ctx.stroke();

        // Center glow
        const cGrad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 18);
        cGrad.addColorStop(0, "rgba(139, 92, 246, 0.15)");
        cGrad.addColorStop(1, "transparent");
        ctx.fillStyle = cGrad;
        ctx.fillRect(centerX - 18, centerY - 18, 36, 36);

        // Center dot
        ctx.fillStyle = "#c4b5fd";
        ctx.beginPath();
        ctx.arc(centerX, centerY, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw agent nodes
      for (const node of nodes) {
        // Glow for active
        if (node.agent.status === "active") {
          const pulse = 0.5 + 0.5 * Math.sin(flowOffset * 60 + node.x);
          const glow = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, node.r * 3);
          glow.addColorStop(0, `rgba(139, 92, 246, ${0.15 * pulse})`);
          glow.addColorStop(1, "transparent");
          ctx.fillStyle = glow;
          ctx.fillRect(node.x - node.r * 3, node.y - node.r * 3, node.r * 6, node.r * 6);
        }

        // Node
        ctx.fillStyle = node.color;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2);
        ctx.fill();

        // Label for active agents
        if (node.agent.status === "active") {
          ctx.fillStyle = "rgba(255,255,255,0.5)";
          ctx.font = "8px var(--font-sans)";
          ctx.textAlign = "center";
          ctx.fillText(
            node.agent.agent.split("/")[1] || node.agent.agent,
            node.x,
            node.y + node.r + 10
          );
        }
      }

      // Flow particles moving toward center (active agents only)
      for (const node of nodes) {
        if (node.agent.status !== "active") continue;
        const t = ((flowOffset * 2 + node.x * 0.01) % 1);
        const px = node.x + (centerX - node.x) * t;
        const py = node.y + (centerY - node.y) * t;
        ctx.fillStyle = `rgba(139, 92, 246, ${0.4 * (1 - t)})`;
        ctx.beginPath();
        ctx.arc(px, py, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }

      animRef.current = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, [agents, destination]);

  return (
    <div className="hub-topology">
      <canvas
        ref={canvasRef}
        className="hub-topology-canvas"
        style={{ width: "100%", height: 180 }}
      />
      <div className="hub-topology-legend">
        <span className="hub-topology-dot" style={{ background: "#8b5cf6" }} /> active
        <span className="hub-topology-dot" style={{ background: "#6ee7b7" }} /> done
        <span className="hub-topology-dot" style={{ background: "#64748b" }} /> idle
        <span className="hub-topology-center">&#9673;</span> destination
      </div>
    </div>
  );
}

// --- Sub-components ---

function AgentAvatar({ name, size = 20 }: { name: string; size?: number }) {
  const { avatar, hueRotate, saturate } = useMemo(() => getAvatar(name), [name]);
  return (
    <div
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: "50%",
        overflow: "hidden",
        filter: `hue-rotate(${hueRotate}deg) saturate(${saturate}%)`,
      }}
      dangerouslySetInnerHTML={{ __html: avatar.svg }}
    />
  );
}

function SystemPill({ system }: { system: string }) {
  const color = SYSTEM_COLORS[system] || "#a78bfa";
  return (
    <span className="hub-pill" style={{ background: `${color}18`, color }}>
      {system}
    </span>
  );
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  const color = OUTCOME_COLORS[outcome] || "#888";
  return (
    <span className="hub-pill" style={{ background: `${color}18`, color }}>
      {outcome}
    </span>
  );
}

function AgentCard({
  state,
  expanded,
  onToggle,
}: {
  state: AgentState;
  expanded: boolean;
  onToggle: () => void;
}) {
  const systemsList = Array.from(state.systems);
  const statusDot =
    state.status === "active"
      ? "hub-dot-active"
      : state.status === "finished"
        ? "hub-dot-finished"
        : "hub-dot-idle";
  const totalOutcomes = state.outcomes.success + state.outcomes.failure + state.outcomes.blocked;
  const successRate = totalOutcomes > 0 ? Math.round((state.outcomes.success / totalOutcomes) * 100) : null;
  const pressure = getPressureLevel(state.toolCallCount);
  const pressureColor = PRESSURE_COLORS[pressure];

  return (
    <div
      className={`hub-agent-card hub-agent-${state.status}`}
      onClick={onToggle}
    >
      <div className="hub-agent-card-header">
        <span className={`hub-dot ${statusDot}`} />
        <AgentAvatar name={state.user} size={20} />
        <span className="hub-agent-name" style={{ color: agentColor(state.agent) }}>
          {state.agent.split("/")[1] || state.agent}
        </span>
        {pressure !== "ok" && (
          <span className="hub-pill hub-pressure-pill" style={{
            background: `${pressureColor}18`,
            color: pressureColor,
          }}>
            {pressure === "critical" ? "CTX CRITICAL" : pressure === "high" ? "CTX HIGH" : "CTX WARN"}
          </span>
        )}
        <span className="hub-agent-meta">{state.opCount} mem</span>
        <span className="hub-agent-meta">{timeAgo(state.lastSeen)}</span>
        <span className="hub-chevron">{expanded ? "\u25B2" : "\u25BC"}</span>
      </div>
      {/* Progress bar */}
      {state.progress && (
        <div className="hub-progress-bar">
          <div className="hub-progress-track">
            <div
              className="hub-progress-fill"
              style={{
                width: `${state.progress.percent}%`,
                background: state.progress.status === "blocked"
                  ? "#fcd34d"
                  : state.progress.percent === 100
                    ? "#34d399"
                    : "#8b5cf6",
              }}
            />
          </div>
          <span className="hub-progress-pct">{state.progress.percent}%</span>
          {state.progress.status !== "working" && (
            <span className="hub-pill" style={{
              background: state.progress.status === "blocked" ? "#fcd34d18" : "#67e8f918",
              color: state.progress.status === "blocked" ? "#fcd34d" : "#67e8f9",
            }}>
              {state.progress.status}
            </span>
          )}
          {state.progress.detail && (
            <span className="hub-progress-detail">{state.progress.detail}</span>
          )}
        </div>
      )}
      <div className="hub-agent-task">{state.task}</div>
      {(systemsList.length > 0 || successRate !== null) && (
        <div className="hub-agent-systems">
          {systemsList.map((s) => (
            <SystemPill key={s} system={s} />
          ))}
          {successRate !== null && (
            <span className="hub-success-rate" style={{
              color: successRate > 80 ? "#6ee7b7" : successRate > 50 ? "#fcd34d" : "#fca5a5",
            }}>
              {successRate}% success
              {state.outcomes.failure > 0 && ` (${state.outcomes.failure} fail)`}
            </span>
          )}
        </div>
      )}
      {expanded && (
        <div className="hub-agent-ops">
          {state.recentOps.map((op) => (
            <ActivityRow key={op.id} op={op} showAgent={false} />
          ))}
          {state.recentOps.length === 0 && (
            <div className="hub-empty">No operations logged yet</div>
          )}
        </div>
      )}
    </div>
  );
}

function ActivityRow({ op, showAgent = true }: { op: AgentOp; showAgent?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const meta = (op.event && EVENT_STYLES[op.event]) || null;
  const borderColor = meta?.borderColor || (op.outcome ? OUTCOME_COLORS[op.outcome] || "#333" : "#333");
  const bgTint = meta?.bgTint || "transparent";
  const isLong = op.content.length > 200;

  const isDistress = op.event === "distress";
  const isInjection = op.type === "injection" || op.event === "context_injection";
  const isSessionStart = op.event === "session_start";
  const isSessionEnd = op.event === "session_done" || op.event === "session_end";

  return (
    <div
      className={`hub-activity-row ${isDistress ? "hub-activity-distress" : ""}`}
      style={{ borderLeftColor: borderColor, background: bgTint }}
      onClick={() => isLong && setExpanded(!expanded)}
    >
      <div className="hub-activity-main">
        {showAgent && (
          <span className="hub-activity-agent" style={{ color: agentColor(op.id.slice(0, 20)) }}>
            {/* agent name is embedded in content context, we pass it separately */}
          </span>
        )}
        {isDistress && <span className="hub-event-icon hub-event-distress">SOS</span>}
        {isInjection && <span className="hub-event-icon hub-event-injection">&rarr;</span>}
        {isSessionStart && <span className="hub-event-icon hub-event-start">&#9654;</span>}
        {isSessionEnd && <span className="hub-event-icon hub-event-end">&#10003;</span>}
        <span className={`hub-activity-content ${expanded ? "hub-activity-expanded" : ""}`}>
          {expanded ? op.content : op.content.slice(0, 200) + (isLong ? "..." : "")}
        </span>
        <span className="hub-activity-time">{timeAgo(op.ts)}</span>
      </div>
      <div className="hub-activity-badges">
        {op.system && <SystemPill system={op.system} />}
        {op.outcome && <OutcomeBadge outcome={op.outcome} />}
        {op.scope && (
          <span className="hub-pill hub-pill-scope">{op.scope}</span>
        )}
      </div>
    </div>
  );
}

function DistressAlert({ signal }: { signal: DistressSignal }) {
  return (
    <div className="hub-distress-alert">
      <div className="hub-distress-header">
        <span className="hub-distress-label">DISTRESS</span>
        <span className="hub-distress-agent" style={{ color: agentColor(signal.agent) }}>
          {signal.agent}
        </span>
        <span className="hub-activity-time">{timeAgo(signal.ts)}</span>
      </div>
      <div className="hub-distress-task">{signal.task}</div>
      <div className="hub-distress-detail">
        <span style={{ color: "#6ee7b7" }}>Done: </span>
        {signal.done.slice(0, 150)}
      </div>
      <div className="hub-distress-detail hub-distress-remaining">
        <span style={{ color: "#fca5a5" }}>Remaining: </span>
        {signal.remaining.slice(0, 200)}
      </div>
      {signal.filesChanged.length > 0 && (
        <div className="hub-distress-files">
          Files: {signal.filesChanged.join(", ")}
        </div>
      )}
    </div>
  );
}

// --- Main ---

export function ThreadTree() {
  const { room } = useRoomContext();
  const { slug } = useParams<{ slug: string }>();

  // Time range
  const [timeRange, setTimeRange] = useState(24);
  const sinceMs = timeRange > 0 ? timeRange * 60 * 60 * 1000 : undefined;

  const { memories, loading } = useRealtimeMemories(room?.id ?? null, 500, sinceMs);

  // Agent card expansion
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());

  // Collapsed groups
  const [showFinished, setShowFinished] = useState(false);

  // Gemini steering
  const [steeringOpen, setSteeringOpen] = useState(false);
  const {
    messages: chatMessages,
    loading: chatLoading,
    error: chatError,
    send: sendChat,
    clear: clearChat,
  } = useGeminiChat("", room?.id);
  const [chatInput, setChatInput] = useState("");
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Auto-open steering if Gemini posts proactive alerts
  useEffect(() => {
    if (chatMessages.length > 0 && chatMessages[0]?.role === "model") {
      setSteeringOpen(true);
    }
  }, [chatMessages]);

  const handleChatSend = useCallback(() => {
    if (!chatInput.trim()) return;
    sendChat(chatInput);
    setChatInput("");
  }, [chatInput, sendChat]);

  // Inject state
  const [injectTarget, setInjectTarget] = useState("all");
  const [injectContent, setInjectContent] = useState("");
  const [injectPriority, setInjectPriority] = useState<"normal" | "high" | "urgent">("normal");
  const [injectSending, setInjectSending] = useState(false);

  const handleInject = useCallback(async () => {
    if (!injectContent.trim() || !room) return;
    setInjectSending(true);
    try {
      await supabase.from("memories").insert({
        room_id: room.id,
        agent: "web-user",
        session_id: `web_${Date.now()}`,
        message_type: "injection",
        content: `[INJECT \u2192 ${injectTarget}]: ${injectContent}`,
        token_count: Math.floor(injectContent.length / 4),
        metadata: {
          event: "context_injection",
          from_agent: "web-user",
          target_agent: injectTarget,
          priority: injectPriority,
          label: null,
        },
      });
      setInjectContent("");
    } finally {
      setInjectSending(false);
    }
  }, [injectContent, injectTarget, injectPriority, room]);

  // Compute agent states
  const agentStates = useMemo(() => buildAgentStates(memories), [memories]);
  const distressSignals = useMemo(() => extractDistress(memories), [memories]);
  const unresolvedDistress = distressSignals.filter((d) => !d.resolved);
  const destination = useMemo(() => extractDestination(memories), [memories]);

  // Auto-expand active agents
  useEffect(() => {
    const active = new Set<string>();
    for (const [agent, state] of agentStates) {
      if (state.status === "active") active.add(agent);
    }
    setExpandedAgents((prev) => new Set([...prev, ...active]));
  }, [agentStates]);

  const sortedAgents = useMemo(() => {
    const arr = Array.from(agentStates.values());
    arr.sort((a, b) => {
      const order = { active: 0, finished: 1, idle: 2 };
      const diff = order[a.status] - order[b.status];
      if (diff !== 0) return diff;
      return new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime();
    });
    return arr;
  }, [agentStates]);

  const activeAgents = sortedAgents.filter((a) => a.status === "active");
  const finishedAgents = sortedAgents.filter((a) => a.status === "finished");
  const idleCount = sortedAgents.filter((a) => a.status === "idle").length;

  // Activity stream: filtered, sorted desc
  const activityStream = useMemo(() => {
    return memories
      .filter((m) => !isNoise(m))
      .slice(0, 100)
      .map((m) => ({
        ...extractOp(m),
        agent: m.agent,
        messageType: m.message_type,
      }));
  }, [memories]);

  // All unique agents for inject target selector
  const allAgentNames = useMemo(() => {
    const names = new Set<string>();
    for (const a of sortedAgents) {
      names.add(a.agent);
    }
    return Array.from(names);
  }, [sortedAgents]);

  // Toggle agent expansion
  function toggleAgent(agent: string) {
    setExpandedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(agent)) next.delete(agent);
      else next.add(agent);
      return next;
    });
  }

  // Empty state
  if (!loading && memories.length === 0) {
    return (
      <div className="hub-view">
        <div className="hub-header">
          <h2 className="hub-title">Hub</h2>
        </div>
        {room ? <ConnectAgent slug={slug || ""} /> : null}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="hub-view">
        <div className="hub-header">
          <h2 className="hub-title">Hub</h2>
        </div>
        <div className="hub-empty">Loading...</div>
      </div>
    );
  }

  return (
    <div className="hub-view">
      {/* Header: time range + stats */}
      <div className="hub-header">
        <div className="hub-time-range">
          {TIME_RANGES.map(({ label, hours }) => (
            <button
              key={hours}
              className={`hub-time-btn ${timeRange === hours ? "hub-time-active" : ""}`}
              onClick={() => setTimeRange(hours)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="hub-stats">
          <span className="hub-stat"><b>{activeAgents.length}</b> active</span>
          <span className="hub-stat-sep">&middot;</span>
          <span className="hub-stat"><b>{finishedAgents.length}</b> done</span>
          <span className="hub-stat-sep">&middot;</span>
          <span className="hub-stat"><b>{idleCount}</b> idle</span>
        </div>
      </div>

      {/* Destination banner */}
      {destination && (
        <div className="hub-destination">
          <div className="hub-destination-header">
            <span className="hub-destination-label">Destination</span>
            <span className="hub-activity-time">{timeAgo(destination.ts)}</span>
          </div>
          <div className="hub-destination-text">{destination.destination}</div>
          {destination.milestones.length > 0 && (() => {
            const done = destination.milestones.filter((m) => destination.progress[m]).length;
            const total = destination.milestones.length;
            const pct = Math.round((done / total) * 100);
            return (
              <>
                <div className="hub-destination-progress">
                  <div className="hub-destination-track">
                    <div
                      className="hub-destination-fill"
                      style={{
                        width: `${pct}%`,
                        background: pct === 100
                          ? "#34d399"
                          : "linear-gradient(90deg, #8b5cf6, #06b6d4)",
                      }}
                    />
                  </div>
                  <span className="hub-destination-pct">
                    {done}/{total} ({pct}%)
                  </span>
                </div>
                <div className="hub-destination-milestones">
                  {destination.milestones.map((m) => (
                    <span
                      key={m}
                      className={`hub-milestone ${destination.progress[m] ? "hub-milestone-done" : ""}`}
                    >
                      {destination.progress[m] ? "\u2713 " : ""}{m}
                    </span>
                  ))}
                </div>
              </>
            );
          })()}
          {destination.notes && (
            <div className="hub-destination-notes">{destination.notes}</div>
          )}
        </div>
      )}

      {/* Agent topology map */}
      {sortedAgents.length > 0 && (
        <AgentTopologyMap agents={sortedAgents} destination={destination} />
      )}

      {/* Gemini steering panel */}
      <div className="hub-steering">
        <button
          className="hub-steering-toggle"
          onClick={() => setSteeringOpen(!steeringOpen)}
        >
          <span className="hub-steering-label">Steering</span>
          {chatMessages.length > 0 && (
            <span className="hub-steering-count">{chatMessages.length}</span>
          )}
          <span className="hub-chevron">{steeringOpen ? "\u25B2" : "\u25BC"}</span>
        </button>
        {steeringOpen && (
          <div className="hub-steering-body">
            <div className="hub-steering-messages">
              {chatMessages.length === 0 && !chatLoading && (
                <div className="hub-steering-empty">
                  Gemini steering agent. Ask about agent status, patterns, or progress.
                </div>
              )}
              {chatMessages.map((msg: ChatMessage, i: number) => (
                <div
                  key={i}
                  className={`hub-steering-msg hub-steering-${msg.role}`}
                >
                  <div className="hub-steering-msg-role">
                    {msg.role === "user" ? "You" : "Gemini"}
                  </div>
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div className="hub-steering-tools">
                      {msg.toolCalls.map((t, j) => (
                        <span key={j} className="hub-steering-tool-pill">{t}</span>
                      ))}
                    </div>
                  )}
                  <div className="hub-steering-msg-content">{msg.content}</div>
                </div>
              ))}
              {chatLoading && (
                <div className="hub-steering-msg hub-steering-model">
                  <div className="hub-steering-msg-role">Gemini</div>
                  <div className="hub-steering-msg-content hub-steering-typing">Thinking...</div>
                </div>
              )}
              {chatError && (
                <div className="hub-steering-error">{chatError}</div>
              )}
              <div ref={chatBottomRef} />
            </div>
            <div className="hub-steering-input">
              <input
                placeholder="Ask Gemini about agents, patterns, progress..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleChatSend();
                  }
                }}
              />
              <button
                onClick={handleChatSend}
                disabled={chatLoading || !chatInput.trim()}
              >
                {chatLoading ? "..." : "\u2192"}
              </button>
              {chatMessages.length > 0 && (
                <button
                  onClick={clearChat}
                  className="hub-steering-clear"
                  title="Clear chat"
                >
                  \u2715
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Distress alerts */}
      {unresolvedDistress.map((d) => (
        <DistressAlert key={d.id} signal={d} />
      ))}

      {/* Active agents */}
      {activeAgents.length > 0 && (
        <div className="hub-section">
          <div className="hub-section-label">Active agents</div>
          <div className="hub-agent-grid">
            {activeAgents.map((a) => (
              <AgentCard
                key={a.agent}
                state={a}
                expanded={expandedAgents.has(a.agent)}
                onToggle={() => toggleAgent(a.agent)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Finished agents (collapsible) */}
      {finishedAgents.length > 0 && (
        <div className="hub-section">
          <button
            className="hub-collapse-btn"
            onClick={() => setShowFinished(!showFinished)}
          >
            {showFinished ? "\u25BE" : "\u25B8"} {finishedAgents.length} finished
          </button>
          {showFinished && (
            <div className="hub-agent-grid">
              {finishedAgents.map((a) => (
                <AgentCard
                  key={a.agent}
                  state={a}
                  expanded={expandedAgents.has(a.agent)}
                  onToggle={() => toggleAgent(a.agent)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Idle count */}
      {idleCount > 0 && (
        <div className="hub-idle-count">{idleCount} idle agents</div>
      )}

      {/* Activity stream */}
      <div className="hub-section">
        <div className="hub-section-label">Activity</div>
        <div className="hub-activity-stream">
          {activityStream.map((item) => {
            const borderColor =
              (item.event && EVENT_STYLES[item.event]?.borderColor) ||
              (item.outcome ? OUTCOME_COLORS[item.outcome] || "#333" : "#333");
            const bgTint =
              (item.event && EVENT_STYLES[item.event]?.bgTint) || "transparent";
            const isDistress = item.event === "distress";
            const isInjection = item.messageType === "injection" || item.event === "context_injection";
            const isSessionStart = item.event === "session_start";
            const isSessionEnd = item.event === "session_done" || item.event === "session_end";
            const isLong = item.content.length > 200;

            return (
              <ActivityRowFull
                key={item.id}
                agent={item.agent}
                content={item.content}
                system={item.system}
                outcome={item.outcome}
                scope={item.scope}
                ts={item.ts}
                borderColor={borderColor}
                bgTint={bgTint}
                isDistress={isDistress}
                isInjection={isInjection}
                isSessionStart={isSessionStart}
                isSessionEnd={isSessionEnd}
                isLong={isLong}
              />
            );
          })}
          {activityStream.length === 0 && (
            <div className="hub-empty">No activity yet</div>
          )}
        </div>
      </div>

      {/* Sticky inject bar */}
      <div className="hub-inject-bar">
        <select
          className="hub-inject-target"
          value={injectTarget}
          onChange={(e) => setInjectTarget(e.target.value)}
        >
          <option value="all">All agents</option>
          {allAgentNames.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <div className="hub-inject-priority">
          {(["normal", "high", "urgent"] as const).map((p) => (
            <button
              key={p}
              className={`hub-priority-btn ${injectPriority === p ? `hub-priority-${p}` : ""}`}
              onClick={() => setInjectPriority(p)}
            >
              {p}
            </button>
          ))}
        </div>
        <input
          className="hub-inject-input"
          placeholder="Send context, instructions, feedback..."
          value={injectContent}
          onChange={(e) => setInjectContent(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleInject();
            }
          }}
        />
        <button
          className="hub-inject-send"
          onClick={handleInject}
          disabled={injectSending || !injectContent.trim()}
        >
          {injectSending ? "..." : "\u2192"}
        </button>
      </div>
    </div>
  );
}

// Full activity row with agent name for the stream
function ActivityRowFull({
  agent,
  content,
  system,
  outcome,
  scope,
  ts,
  borderColor,
  bgTint,
  isDistress,
  isInjection,
  isSessionStart,
  isSessionEnd,
  isLong,
}: {
  agent: string;
  content: string;
  system?: string;
  outcome?: string;
  scope?: string;
  ts: string;
  borderColor: string;
  bgTint: string;
  isDistress: boolean;
  isInjection: boolean;
  isSessionStart: boolean;
  isSessionEnd: boolean;
  isLong: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const shortName = agent.split("/")[1] || agent;

  return (
    <div
      className={`hub-activity-row ${isDistress ? "hub-activity-distress" : ""}`}
      style={{ borderLeftColor: borderColor, background: bgTint }}
      onClick={() => isLong && setExpanded(!expanded)}
    >
      <div className="hub-activity-main">
        <span className="hub-activity-agent" style={{ color: agentColor(agent) }}>
          {shortName}
        </span>
        {isDistress && <span className="hub-event-icon hub-event-distress">SOS</span>}
        {isInjection && <span className="hub-event-icon hub-event-injection">&rarr;</span>}
        {isSessionStart && <span className="hub-event-icon hub-event-start">&#9654;</span>}
        {isSessionEnd && <span className="hub-event-icon hub-event-end">&#10003;</span>}
        <span className={`hub-activity-content ${expanded ? "hub-activity-expanded" : ""}`}>
          {expanded ? content : content.slice(0, 200) + (isLong ? "..." : "")}
        </span>
        <span className="hub-activity-time">{timeAgo(ts)}</span>
      </div>
      {(system || outcome || scope) && (
        <div className="hub-activity-badges">
          {system && <SystemPill system={system} />}
          {outcome && <OutcomeBadge outcome={outcome} />}
          {scope && <span className="hub-pill hub-pill-scope">{scope}</span>}
        </div>
      )}
    </div>
  );
}
