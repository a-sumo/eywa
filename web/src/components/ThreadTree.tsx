import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useRealtimeMemories } from "../hooks/useRealtimeMemories";
import { useRoomContext } from "../context/RoomContext";
import { useParams, useNavigate } from "react-router-dom";
import { supabase, type Memory, type GlobalInsight } from "../lib/supabase";
import { agentColor } from "../lib/agentColor";
import { getAvatar } from "./avatars";
import { ConnectAgent } from "./ConnectAgent";
import { useGeminiChat, type ChatMessage } from "../hooks/useGeminiChat";
// useVoiceInput.ts provides global Window type declarations for SpeechRecognition
import "../hooks/useVoiceInput";

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

// --- Destination Editor ---

function DestinationEditor({
  current,
  roomId,
  onClose,
}: {
  current: Destination | null;
  roomId: string;
  onClose: () => void;
}) {
  const [dest, setDest] = useState(current?.destination || "");
  const [milestoneText, setMilestoneText] = useState(
    current?.milestones.join("\n") || ""
  );
  const [notes, setNotes] = useState(current?.notes || "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!dest.trim() || !roomId) return;
    setSaving(true);
    const milestones = milestoneText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    // Preserve existing progress for milestones that still exist
    const progress: Record<string, boolean> = {};
    for (const m of milestones) {
      progress[m] = current?.progress[m] || false;
    }
    await supabase.from("memories").insert({
      room_id: roomId,
      agent: "web-user",
      session_id: `web_${Date.now()}`,
      message_type: "knowledge",
      content: `DESTINATION: ${dest.trim()}`,
      token_count: Math.floor(dest.length / 4),
      metadata: {
        event: "destination",
        destination: dest.trim(),
        milestones,
        progress,
        notes: notes.trim() || null,
        set_by: current?.setBy || "web-user",
        last_updated_by: "web-user",
      },
    });
    setSaving(false);
    onClose();
  }

  return (
    <div className="hub-dest-editor">
      <div className="hub-dest-editor-header">
        <span className="hub-destination-label">
          {current ? "Edit Destination" : "Set Destination"}
        </span>
        <button className="hub-dest-editor-close" onClick={onClose}>
          Cancel
        </button>
      </div>
      <div className="hub-dest-editor-field">
        <label className="hub-dest-editor-label">Where are we going?</label>
        <textarea
          className="hub-dest-editor-input"
          value={dest}
          onChange={(e) => setDest(e.target.value)}
          placeholder="Describe the target state. What does done look like?"
          rows={2}
        />
      </div>
      <div className="hub-dest-editor-field">
        <label className="hub-dest-editor-label">Milestones (one per line)</label>
        <textarea
          className="hub-dest-editor-input"
          value={milestoneText}
          onChange={(e) => setMilestoneText(e.target.value)}
          placeholder="Key checkpoints on the route to destination"
          rows={4}
        />
      </div>
      <div className="hub-dest-editor-field">
        <label className="hub-dest-editor-label">Notes</label>
        <textarea
          className="hub-dest-editor-input hub-dest-editor-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Blockers, course corrections, context..."
          rows={2}
        />
      </div>
      <button
        className="hub-dest-editor-save"
        onClick={handleSave}
        disabled={!dest.trim() || saving}
      >
        {saving ? "Saving..." : current ? "Update Destination" : "Set Destination"}
      </button>
    </div>
  );
}

// --- Tasks ---

interface TaskItem {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assignedTo: string | null;
  milestone: string | null;
  parentTask: string | null;
  createdBy: string;
  notes: string | null;
  blockedReason: string | null;
  ts: string;
}

const TASK_PRIORITY_ORDER: Record<string, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

function extractTasks(memories: Memory[]): TaskItem[] {
  const tasks: TaskItem[] = [];
  for (const m of memories) {
    if (m.message_type !== "task") continue;
    const meta = (m.metadata ?? {}) as Record<string, unknown>;
    if (meta.event !== "task") continue;
    tasks.push({
      id: m.id,
      title: (meta.title as string) || "",
      description: (meta.description as string) || null,
      status: (meta.status as string) || "open",
      priority: (meta.priority as string) || "normal",
      assignedTo: (meta.assigned_to as string) || null,
      milestone: (meta.milestone as string) || null,
      parentTask: (meta.parent_task as string) || null,
      createdBy: (meta.created_by as string) || m.agent,
      notes: (meta.notes as string) || null,
      blockedReason: (meta.blocked_reason as string) || null,
      ts: m.ts,
    });
  }
  // Sort: priority then time
  tasks.sort((a, b) => {
    const pa = TASK_PRIORITY_ORDER[a.priority] ?? 2;
    const pb = TASK_PRIORITY_ORDER[b.priority] ?? 2;
    if (pa !== pb) return pa - pb;
    return new Date(b.ts).getTime() - new Date(a.ts).getTime();
  });
  return tasks;
}

const TASK_PRIORITY_COLORS: Record<string, string> = {
  urgent: "#ef4444",
  high: "#f97316",
  normal: "#8b5cf6",
  low: "#64748b",
};

const TASK_STATUS_COLORS: Record<string, string> = {
  open: "#3b82f6",
  claimed: "#eab308",
  in_progress: "#8b5cf6",
  done: "#22c55e",
  blocked: "#ef4444",
};

function TaskCard({ task }: { task: TaskItem }) {
  const priorityColor = TASK_PRIORITY_COLORS[task.priority] || "#8b5cf6";
  const statusColor = TASK_STATUS_COLORS[task.status] || "#64748b";

  return (
    <div className="hub-task-card" style={{ borderLeftColor: priorityColor }}>
      <div className="hub-task-header">
        <span className="hub-pill" style={{ background: `${statusColor}18`, color: statusColor }}>
          {task.status.replace("_", " ")}
        </span>
        <span className="hub-pill" style={{ background: `${priorityColor}18`, color: priorityColor }}>
          {task.priority}
        </span>
        {task.assignedTo && (
          <span className="hub-task-assignee">{task.assignedTo}</span>
        )}
        {task.milestone && (
          <span className="hub-task-milestone">{task.milestone}</span>
        )}
        <span className="hub-activity-time">{timeAgo(task.ts)}</span>
      </div>
      <div className="hub-task-title">{task.title}</div>
      {task.description && (
        <div className="hub-task-description">{task.description.slice(0, 200)}</div>
      )}
      {task.blockedReason && (
        <div className="hub-task-blocked">Blocked: {task.blockedReason}</div>
      )}
      {task.notes && (
        <div className="hub-task-notes">{task.notes.slice(0, 150)}</div>
      )}
    </div>
  );
}

function TaskQueue({ tasks }: { tasks: TaskItem[] }) {
  const activeTasks = tasks.filter((t) => t.status !== "done");
  if (activeTasks.length === 0) return null;

  return (
    <div className="hub-task-queue">
      <div className="hub-section-label">Tasks ({activeTasks.length})</div>
      {activeTasks.map((t) => (
        <TaskCard key={t.id} task={t} />
      ))}
    </div>
  );
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

interface AgentHeartbeat {
  phase: string;
  tokenPercent: number | null;
  detail: string | null;
  subagents: number | null;
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
  silenceMin: number;
  recentOps: AgentOp[];
  progress: AgentProgress | null;
  toolCallCount: number;
  heartbeat: AgentHeartbeat | null;
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

// Silence thresholds (minutes)
const SILENCE_WARN = 10;
const SILENCE_HIGH = 30;
const SILENCE_CRITICAL = 60;

function getSilenceLevel(mins: number, status: string): "ok" | "warn" | "high" | "critical" {
  if (status === "finished") return "ok";
  if (mins >= SILENCE_CRITICAL) return "critical";
  if (mins >= SILENCE_HIGH) return "high";
  if (mins >= SILENCE_WARN) return "warn";
  return "ok";
}

const SILENCE_COLORS: Record<string, string> = {
  ok: "transparent",
  warn: "#eab308",
  high: "#f97316",
  critical: "#ef4444",
};

function formatSilence(mins: number): string {
  if (mins < 1) return "";
  if (mins < 60) return `${mins}m silent`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m silent` : `${h}h silent`;
}

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
        silenceMin: Math.floor((Date.now() - new Date(m.ts).getTime()) / 60000),
        recentOps: [],
        progress: null,
        toolCallCount: 0,
        heartbeat: null,
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

    // Capture latest heartbeat (telemetry)
    if (meta.event === "heartbeat" && !state.heartbeat) {
      state.heartbeat = {
        phase: (meta.phase as string) || "working",
        tokenPercent: (meta.token_percent as number) ?? null,
        detail: (meta.detail as string) ?? ((m.content ?? "").slice(0, 80) || null),
        subagents: (meta.subagents as number) ?? null,
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

// --- Agent Flow Map ---
// Horizontal river: time flows left to right, destination on right edge.
// Each agent is a lane. Active agents flow rightward with particles.
// Idle agents stall on the left. Done agents reach the right.

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

    // Layout: left margin for labels, right margin for destination
    const LEFT = 80;
    const RIGHT = W - 30;
    const TOP = 12;
    const BOTTOM = H - 12;
    const LANE_W = RIGHT - LEFT;

    // Sort: active first, then done, then idle
    const sorted = [...agents].sort((a, b) => {
      const order: Record<string, number> = { active: 0, finished: 1, idle: 2 };
      return (order[a.status] ?? 2) - (order[b.status] ?? 2);
    });

    // Limit visible lanes to avoid cramming
    const maxLanes = Math.floor((BOTTOM - TOP) / 8);
    const visible = sorted.slice(0, maxLanes);
    const laneH = visible.length > 0 ? (BOTTOM - TOP) / visible.length : 12;

    interface Lane {
      agent: AgentState;
      y: number;        // center Y of lane
      progress: number; // 0..1 how far right (active=0.7, done=1.0, idle=0.15..0.3)
      color: string;
    }

    const lanes: Lane[] = visible.map((a, i) => {
      // Hash for slight variation
      let hash = 0;
      for (let c = 0; c < a.agent.length; c++) {
        hash = ((hash << 5) - hash + a.agent.charCodeAt(c)) | 0;
      }
      const jitter = (Math.abs(hash) % 15) / 100;

      let progress: number;
      if (a.status === "active") {
        progress = 0.55 + jitter + Math.min(0.3, a.opCount * 0.02);
      } else if (a.status === "finished") {
        progress = 0.9 + jitter * 0.5;
      } else {
        progress = 0.08 + jitter * 2;
      }
      progress = Math.min(progress, 0.98);

      const color =
        a.status === "active" ? "#8b5cf6"
        : a.status === "finished" ? "#6ee7b7"
        : "#475569";

      return {
        agent: a,
        y: TOP + i * laneH + laneH / 2,
        progress,
        color,
      };
    });

    let t = 0;

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, W, H);
      t += 0.004;

      // Destination column: subtle glow on right edge
      const destGrad = ctx.createLinearGradient(RIGHT - 20, 0, RIGHT + 10, 0);
      destGrad.addColorStop(0, "transparent");
      destGrad.addColorStop(0.7, "rgba(139, 92, 246, 0.06)");
      destGrad.addColorStop(1, "rgba(139, 92, 246, 0.12)");
      ctx.fillStyle = destGrad;
      ctx.fillRect(RIGHT - 20, TOP, 50, BOTTOM - TOP);

      // Destination progress bar on right edge
      if (destination) {
        const done = destination.milestones.filter((m) => destination.progress[m]).length;
        const total = destination.milestones.length;
        const pct = total > 0 ? done / total : 0;

        // Vertical progress bar
        const barH = BOTTOM - TOP;
        const barX = RIGHT + 2;
        ctx.fillStyle = "rgba(139, 92, 246, 0.15)";
        ctx.fillRect(barX, TOP, 4, barH);
        ctx.fillStyle = pct === 1 ? "#34d399" : "#8b5cf6";
        ctx.fillRect(barX, BOTTOM - barH * pct, 4, barH * pct);
      }

      // Draw lanes
      for (const lane of lanes) {
        const x0 = LEFT;
        const x1 = LEFT + LANE_W * lane.progress;
        const y = lane.y;

        // Lane trace (faint line from left to current position)
        ctx.strokeStyle = lane.color + "18";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
        ctx.stroke();

        // Trail glow for active agents
        if (lane.agent.status === "active") {
          const trailGrad = ctx.createLinearGradient(x0, y, x1, y);
          trailGrad.addColorStop(0, "transparent");
          trailGrad.addColorStop(0.6, lane.color + "08");
          trailGrad.addColorStop(1, lane.color + "20");
          ctx.fillStyle = trailGrad;
          ctx.fillRect(x0, y - laneH * 0.3, x1 - x0, laneH * 0.6);
        }

        // Agent dot at current position
        const r = lane.agent.status === "active" ? 4 : lane.agent.status === "finished" ? 3 : 2.5;
        ctx.fillStyle = lane.color;
        ctx.beginPath();
        ctx.arc(x1, y, r, 0, Math.PI * 2);
        ctx.fill();

        // Pulse for active
        if (lane.agent.status === "active") {
          const pulse = 0.3 + 0.7 * Math.abs(Math.sin(t * 3 + lane.y * 0.1));
          ctx.strokeStyle = lane.color + Math.round(pulse * 80).toString(16).padStart(2, "0");
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(x1, y, r + 3, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Flow particles for active agents (moving right)
        if (lane.agent.status === "active") {
          for (let p = 0; p < 3; p++) {
            const pt = ((t * 1.5 + p * 0.33 + lane.y * 0.002) % 1);
            const px = x0 + (x1 - x0) * pt;
            const alpha = Math.sin(pt * Math.PI) * 0.5;
            ctx.fillStyle = `rgba(139, 92, 246, ${alpha})`;
            ctx.beginPath();
            ctx.arc(px, y, 1.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Agent name label (left side)
        const shortName = lane.agent.agent.split("/")[1] || lane.agent.agent;
        ctx.fillStyle = lane.agent.status === "active" ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.25)";
        ctx.font = `${Math.min(9, laneH * 0.7)}px var(--font-sans)`;
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(shortName, LEFT - 6, y);
      }

      // Overflow indicator
      if (agents.length > maxLanes) {
        ctx.fillStyle = "rgba(255,255,255,0.2)";
        ctx.font = "9px var(--font-sans)";
        ctx.textAlign = "right";
        ctx.textBaseline = "bottom";
        ctx.fillText(`+${agents.length - maxLanes} more`, LEFT - 6, H - 2);
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
        <span style={{ color: "rgba(255,255,255,0.3)", marginLeft: 8, fontSize: 10 }}>{"-->"} destination</span>
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
        {(() => {
          const silenceLevel = getSilenceLevel(state.silenceMin, state.status);
          const silenceColor = SILENCE_COLORS[silenceLevel];
          const silenceText = formatSilence(state.silenceMin);
          return silenceLevel !== "ok" && silenceText ? (
            <span className="hub-pill" style={{
              background: `${silenceColor}18`,
              color: silenceColor,
            }}>
              {silenceText}
            </span>
          ) : null;
        })()}
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
      {/* Heartbeat telemetry */}
      {state.heartbeat && (
        <div className="hub-agent-heartbeat" style={{
          display: "flex", gap: 8, alignItems: "center",
          padding: "2px 0", fontSize: 11, color: "#94a3b8",
        }}>
          <span className="hub-pill" style={{
            background: state.heartbeat.phase === "compacting" ? "#ef444418" :
              state.heartbeat.phase === "waiting_approval" ? "#eab30818" :
              state.heartbeat.phase === "error" ? "#ef444418" :
              state.heartbeat.phase === "thinking" ? "#8b5cf618" : "#22c55e18",
            color: state.heartbeat.phase === "compacting" ? "#ef4444" :
              state.heartbeat.phase === "waiting_approval" ? "#eab308" :
              state.heartbeat.phase === "error" ? "#ef4444" :
              state.heartbeat.phase === "thinking" ? "#8b5cf6" : "#22c55e",
          }}>
            {state.heartbeat.phase}
          </span>
          {state.heartbeat.tokenPercent !== null && (
            <span style={{
              color: state.heartbeat.tokenPercent > 80 ? "#ef4444" :
                state.heartbeat.tokenPercent > 60 ? "#eab308" : "#94a3b8",
            }}>
              {state.heartbeat.tokenPercent}% ctx
            </span>
          )}
          {state.heartbeat.subagents !== null && state.heartbeat.subagents > 0 && (
            <span>{state.heartbeat.subagents} sub-agent{state.heartbeat.subagents > 1 ? "s" : ""}</span>
          )}
          {state.heartbeat.detail && (
            <span style={{ opacity: 0.7 }}>{state.heartbeat.detail}</span>
          )}
          <span style={{ opacity: 0.5 }}>{timeAgo(state.heartbeat.ts)}</span>
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

// --- Approval Card ---

interface PendingApproval {
  id: string;
  agent: string;
  action: string;
  scope: string;
  risk: string;
  context: string;
  ts: string;
}

const RISK_COLORS: Record<string, string> = {
  low: "#22c55e",
  medium: "#eab308",
  high: "#f97316",
  critical: "#ef4444",
};

function ApprovalCard({ approval, roomId }: { approval: PendingApproval; roomId: string }) {
  const [resolving, setResolving] = useState(false);
  const [resolved, setResolved] = useState<"approved" | "denied" | null>(null);

  async function handleResolve(decision: "approved" | "denied") {
    setResolving(true);
    try {
      // Update the approval request status
      await supabase
        .from("memories")
        .update({
          metadata: {
            event: "approval_request",
            status: decision,
            action_description: approval.action,
            scope: approval.scope || null,
            risk_level: approval.risk,
            resolved_by: "web-user",
            resolved_at: new Date().toISOString(),
            response_message: decision === "approved" ? "Approved from dashboard" : "Denied from dashboard",
          },
        })
        .eq("id", approval.id);

      // Inject the decision to the agent
      const content = decision === "approved"
        ? `APPROVED: Your request "${approval.action.slice(0, 100)}" has been approved. Proceed.`
        : `DENIED: Your request "${approval.action.slice(0, 100)}" was denied.`;

      await supabase.from("memories").insert({
        room_id: roomId,
        agent: "web-user",
        session_id: `web_${Date.now()}`,
        message_type: "injection",
        content: `[APPROVAL -> ${approval.agent}]: ${content}`,
        token_count: Math.floor(content.length / 4),
        metadata: {
          event: "approval_response",
          from_agent: "web-user",
          target_agent: approval.agent,
          approval_id: approval.id,
          decision,
          priority: "high",
        },
      });

      setResolved(decision);
    } finally {
      setResolving(false);
    }
  }

  if (resolved) {
    return (
      <div className="hub-approval-card" style={{
        borderLeftColor: resolved === "approved" ? "#22c55e" : "#ef4444",
        opacity: 0.6,
      }}>
        <span style={{ color: resolved === "approved" ? "#22c55e" : "#ef4444" }}>
          {resolved === "approved" ? "Approved" : "Denied"}
        </span>
        <span className="hub-activity-time">{approval.agent}</span>
      </div>
    );
  }

  const riskColor = RISK_COLORS[approval.risk] || RISK_COLORS.medium;

  return (
    <div className="hub-approval-card" style={{ borderLeftColor: riskColor }}>
      <div className="hub-approval-header">
        <AgentAvatar name={approval.agent.split("/")[0]} size={18} />
        <span className="hub-agent-name" style={{ color: agentColor(approval.agent) }}>
          {approval.agent.split("/")[1] || approval.agent}
        </span>
        <span className="hub-pill" style={{ background: `${riskColor}18`, color: riskColor }}>
          {approval.risk}
        </span>
        <span className="hub-activity-time">{timeAgo(approval.ts)}</span>
      </div>
      <div className="hub-approval-action">{approval.action}</div>
      {approval.scope && (
        <div className="hub-approval-scope">{approval.scope}</div>
      )}
      {approval.context && (
        <div className="hub-approval-context">{approval.context}</div>
      )}
      <div className="hub-approval-buttons">
        <button
          className="hub-approve-btn"
          onClick={() => handleResolve("approved")}
          disabled={resolving}
        >
          Approve
        </button>
        <button
          className="hub-deny-btn"
          onClick={() => handleResolve("denied")}
          disabled={resolving}
        >
          Deny
        </button>
      </div>
    </div>
  );
}

// --- Deploy Health ---

interface DeployEntry {
  id: string;
  agent: string;
  scope: string; // "worker" or "web"
  outcome: string;
  content: string;
  ts: string;
}

function extractDeploys(memories: Memory[]): DeployEntry[] {
  const deploys: DeployEntry[] = [];
  for (const m of memories) {
    const meta = (m.metadata ?? {}) as Record<string, unknown>;
    if (meta.system === "deploy" && meta.action === "deploy") {
      deploys.push({
        id: m.id,
        agent: m.agent,
        scope: (meta.scope as string) || "unknown",
        outcome: (meta.outcome as string) || "unknown",
        content: (m.content ?? "").slice(0, 200),
        ts: m.ts,
      });
    }
  }
  return deploys;
}

function DeployHealth({ deploys }: { deploys: DeployEntry[] }) {
  const [expanded, setExpanded] = useState(false);

  if (deploys.length === 0) return null;

  const latest = deploys[0];
  const isSuccess = latest.outcome === "success";
  const recentCount = deploys.length;
  const failCount = deploys.filter((d) => d.outcome === "failure").length;

  return (
    <div className="hub-deploy-health">
      <div
        className="hub-deploy-header"
        onClick={() => setExpanded(!expanded)}
        style={{ cursor: "pointer" }}
      >
        <span
          className="hub-deploy-dot"
          style={{ background: isSuccess ? "#22c55e" : "#ef4444" }}
        />
        <span className="hub-deploy-label">Deploys</span>
        <span className="hub-deploy-latest">
          {latest.scope} {isSuccess ? "live" : "failed"}
        </span>
        <span className="hub-activity-time">{timeAgo(latest.ts)}</span>
        {failCount > 0 && (
          <span className="hub-pill" style={{ background: "#ef444418", color: "#ef4444" }}>
            {failCount} failed
          </span>
        )}
        <span className="hub-deploy-count">{recentCount} total</span>
        <span className="hub-chevron">{expanded ? "\u25B2" : "\u25BC"}</span>
      </div>
      {expanded && (
        <div className="hub-deploy-list">
          {deploys.slice(0, 20).map((d) => {
            const outcomeColor = OUTCOME_COLORS[d.outcome] || "#888";
            const shortAgent = d.agent.split("/")[1] || d.agent;
            return (
              <div key={d.id} className="hub-deploy-row">
                <span
                  className="hub-deploy-dot-sm"
                  style={{ background: d.outcome === "success" ? "#22c55e" : "#ef4444" }}
                />
                <span className="hub-pill" style={{ background: `${outcomeColor}18`, color: outcomeColor }}>
                  {d.outcome}
                </span>
                <span className="hub-deploy-scope">{d.scope}</span>
                <span className="hub-deploy-agent" style={{ color: agentColor(d.agent) }}>
                  {shortAgent}
                </span>
                <span className="hub-activity-time">{timeAgo(d.ts)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// --- Main ---

export function ThreadTree() {
  const { room } = useRoomContext();
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  // Time range
  const [timeRange, setTimeRange] = useState(24);
  const sinceMs = timeRange > 0 ? timeRange * 60 * 60 * 1000 : undefined;

  const { memories, loading } = useRealtimeMemories(room?.id ?? null, 500, sinceMs);

  // Agent card expansion
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());

  // Collapsed groups
  const [showFinished, setShowFinished] = useState(false);

  // Destination editor
  const [editingDest, setEditingDest] = useState(false);

  // Unified input mode: talk to Gemini or inject to agents
  const [inputMode, setInputMode] = useState<"gemini" | "inject">("gemini");
  const {
    messages: chatMessages,
    loading: chatLoading,
    status: chatStatus,
    error: chatError,
    send: sendChat,
    clear: clearChat,
  } = useGeminiChat("", room?.id);
  const [chatInput, setChatInput] = useState("");
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Voice-to-text: simple SpeechRecognition mic button
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<{ stop(): void } | null>(null);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }

    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) {
      alert("Speech recognition is not supported in this browser. Try Chrome.");
      return;
    }

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    let accumulated = "";

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          accumulated += result[0].transcript;
        } else {
          interim = result[0].transcript;
        }
      }
      setChatInput(accumulated + interim);
    };

    recognition.onerror = () => {
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  }, [isRecording]);

  useEffect(() => {
    return () => { recognitionRef.current?.stop(); };
  }, []);

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

  // Auto-scroll chat
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Compute agent states
  const agentStates = useMemo(() => buildAgentStates(memories), [memories]);
  const distressSignals = useMemo(() => extractDistress(memories), [memories]);
  const unresolvedDistress = distressSignals.filter((d) => !d.resolved);
  const destination = useMemo(() => extractDestination(memories), [memories]);
  const tasks = useMemo(() => extractTasks(memories), [memories]);
  const deploys = useMemo(() => extractDeploys(memories), [memories]);

  // Pending approvals
  const pendingApprovals = useMemo(() => {
    return memories
      .filter((m) => {
        const meta = (m.metadata ?? {}) as Record<string, unknown>;
        return meta.event === "approval_request" && meta.status === "pending";
      })
      .map((m) => {
        const meta = (m.metadata ?? {}) as Record<string, unknown>;
        return {
          id: m.id,
          agent: m.agent,
          action: (meta.action_description as string) || m.content || "",
          scope: (meta.scope as string) || "",
          risk: (meta.risk_level as string) || "medium",
          context: (meta.context as string) || "",
          ts: m.ts,
        };
      });
  }, [memories]);

  // Network routes: fetch global insights and match against remaining milestones
  const [networkRoutes, setNetworkRoutes] = useState<
    { domain: string; match: number; insights: GlobalInsight[] }[]
  >([]);

  useEffect(() => {
    if (!destination) { setNetworkRoutes([]); return; }
    const remaining = destination.milestones.filter(m => !destination.progress[m]);
    if (remaining.length === 0) { setNetworkRoutes([]); return; }

    const query = remaining.join(" ").toLowerCase().replace(/[^a-z0-9\s-]/g, " ");
    const keywords = query.split(/\s+/).filter(w => w.length > 2);
    if (keywords.length === 0) { setNetworkRoutes([]); return; }

    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("global_insights")
        .select("*")
        .order("upvotes", { ascending: false })
        .order("ts", { ascending: false })
        .limit(50);
      if (cancelled || !data?.length) return;

      // Score and group by domain
      const scored = (data as GlobalInsight[]).map(ins => {
        const text = `${ins.insight} ${ins.domain_tags.join(" ")}`.toLowerCase();
        let hits = 0;
        for (const kw of keywords) { if (text.includes(kw)) hits++; }
        return { ins, score: hits / keywords.length };
      }).filter(s => s.score > 0.1).sort((a, b) => b.score - a.score);

      const byDomain = new Map<string, { scores: number[]; insights: GlobalInsight[] }>();
      for (const { ins, score } of scored) {
        const domain = ins.domain_tags[0] || "general";
        const group = byDomain.get(domain) || { scores: [], insights: [] };
        group.scores.push(score);
        if (group.insights.length < 2) group.insights.push(ins);
        byDomain.set(domain, group);
      }

      const routes = Array.from(byDomain.entries())
        .map(([domain, g]) => ({
          domain,
          match: Math.round((g.scores.reduce((a, b) => a + b, 0) / g.scores.length) * 100),
          insights: g.insights,
        }))
        .sort((a, b) => b.match - a.match)
        .slice(0, 4);

      if (!cancelled) setNetworkRoutes(routes);
    })();
    return () => { cancelled = true; };
  }, [destination]);

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

  // Empty state - onboarding (skip for demo rooms, they always have seeded data)
  const isDemo = room?.is_demo ?? false;
  const [dismissedOnboarding, setDismissedOnboarding] = useState(false);
  if (!loading && memories.length === 0 && !isDemo && !dismissedOnboarding) {
    return (
      <div className="hub-view">
        <div className="hub-header">
          <h2 className="hub-title">Hub</h2>
          <div style={{ marginLeft: "auto", display: "flex", gap: "6px" }}>
            <button
              onClick={() => navigate(`/r/${slug}/seeds`)}
              style={{
                background: "rgba(78, 234, 255, 0.1)",
                border: "1px solid rgba(78, 234, 255, 0.3)",
                color: "#4eeaff",
                padding: "4px 12px",
                borderRadius: "4px",
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              Seed Monitor
            </button>
            <button
              onClick={() => setDismissedOnboarding(true)}
              style={{
                background: "none",
                border: "1px solid rgba(255,255,255,0.15)",
                color: "var(--text-secondary)",
                padding: "4px 12px",
                borderRadius: "4px",
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              Skip
            </button>
          </div>
        </div>
        <div className="hub-onboarding">
          <div className="hub-onboarding-welcome">
            <h3>Your room is ready</h3>
            <p>Connect an AI agent to start seeing its work here. Every session, decision, and file gets logged in real time so your whole team can see what's happening.</p>
          </div>
          {room ? <ConnectAgent slug={slug || ""} /> : null}
          <div className="hub-onboarding-next">
            <h4>What happens next</h4>
            <div className="hub-onboarding-steps">
              <div className="hub-onboarding-step">
                <span className="hub-onboarding-num">1</span>
                <span>Agent sessions appear here as live cards with progress and status</span>
              </div>
              <div className="hub-onboarding-step">
                <span className="hub-onboarding-num">2</span>
                <span>Use the Gemini chat panel to ask questions across all agent threads</span>
              </div>
              <div className="hub-onboarding-step">
                <span className="hub-onboarding-num">3</span>
                <span>Set a destination to track team progress toward a goal</span>
              </div>
            </div>
          </div>
        </div>
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
    <div className="hub-view hub-two-col">
      {/* LEFT: Dashboard content */}
      <div className="hub-dashboard">
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
      {editingDest ? (
        <DestinationEditor
          current={destination}
          roomId={room?.id || ""}
          onClose={() => setEditingDest(false)}
        />
      ) : destination ? (
        <div className="hub-destination">
          <div className="hub-destination-header">
            <span className="hub-destination-label">Destination</span>
            <button
              className="hub-dest-edit-btn"
              onClick={() => setEditingDest(true)}
              title="Edit destination"
            >
              Edit
            </button>
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
                      className={`hub-milestone hub-milestone-clickable ${destination.progress[m] ? "hub-milestone-done" : ""}`}
                      onClick={async () => {
                        if (!room) return;
                        const newProgress = { ...destination.progress, [m]: !destination.progress[m] };
                        await supabase.from("memories").insert({
                          room_id: room.id,
                          agent: "web-user",
                          session_id: `web_${Date.now()}`,
                          message_type: "knowledge",
                          content: `DESTINATION: ${destination.destination}`,
                          token_count: Math.floor(destination.destination.length / 4),
                          metadata: {
                            event: "destination",
                            destination: destination.destination,
                            milestones: destination.milestones,
                            progress: newProgress,
                            notes: destination.notes,
                            set_by: destination.setBy,
                            last_updated_by: "web-user",
                          },
                        });
                      }}
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
      ) : (
        <button
          className="hub-dest-set-btn"
          onClick={() => setEditingDest(true)}
        >
          + Set Destination
        </button>
      )}

      {/* Deploy health */}
      <DeployHealth deploys={deploys} />

      {/* Network routes (cross-room intelligence) */}
      {networkRoutes.length > 0 && (
        <div className="hub-network-routes">
          <div className="hub-network-routes-header">
            <span className="hub-network-routes-label">Network Routes</span>
            <span className="hub-network-routes-count">{networkRoutes.reduce((a, r) => a + r.insights.length, 0)} signals</span>
          </div>
          <div className="hub-network-routes-grid">
            {networkRoutes.map((route) => (
              <div key={route.domain} className="hub-route-card">
                <div className="hub-route-header">
                  <span className="hub-route-domain">{route.domain}</span>
                  <span className="hub-route-match">{route.match}%</span>
                </div>
                {route.insights.map((ins) => (
                  <div key={ins.id} className="hub-route-insight">
                    {ins.insight.slice(0, 120)}{ins.insight.length > 120 ? "..." : ""}
                    {ins.upvotes > 0 && <span className="hub-route-votes">+{ins.upvotes}</span>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Agent topology map */}
      {sortedAgents.length > 0 && (
        <AgentTopologyMap agents={sortedAgents} destination={destination} />
      )}

      {/* Pending approvals */}
      {pendingApprovals.length > 0 && (
        <div className="hub-approvals">
          <div className="hub-section-label">Pending Approvals ({pendingApprovals.length})</div>
          {pendingApprovals.map((a) => (
            <ApprovalCard key={a.id} approval={a} roomId={room?.id || ""} />
          ))}
        </div>
      )}

      {/* Task queue */}
      <TaskQueue tasks={tasks} />

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

      </div>{/* end hub-dashboard */}

      {/* RIGHT: Gemini chat + activity panel */}
      <div className="hub-chat-panel">
        <div className="hub-chat-header">
          <span className="hub-chat-title">Gemini</span>
          {chatMessages.length > 0 && (
            <button onClick={clearChat} className="hub-chat-clear" title="Clear">Clear</button>
          )}
        </div>
        <div className="hub-chat-messages">
          {chatMessages.length === 0 && !chatLoading && (
            <div className="hub-steering-empty">
              Ask about agent status, patterns, progress, or course corrections.
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
          {chatLoading && !chatMessages[chatMessages.length - 1]?.streaming && (
            <div className="hub-steering-msg hub-steering-model">
              <div className="hub-steering-msg-role">Gemini</div>
              <div className="hub-steering-msg-content hub-steering-typing">
                {chatStatus || "Thinking..."}
              </div>
            </div>
          )}
          {chatError && (
            <div className="hub-steering-error">{chatError}</div>
          )}
          <div ref={chatBottomRef} />
        </div>
        <div className="hub-chat-input-area">
          <div className="hub-chat-mode-row">
            <button
              className={`hub-mode-btn ${inputMode === "gemini" ? "hub-mode-active" : ""}`}
              onClick={() => setInputMode("gemini")}
            >Gemini</button>
            <button
              className={`hub-mode-btn ${inputMode === "inject" ? "hub-mode-active" : ""}`}
              onClick={() => setInputMode("inject")}
            >Inject</button>
            {inputMode === "inject" && (
              <>
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
              </>
            )}
          </div>
          <div className="hub-chat-input-row">
            <input
              className={`hub-command-input ${isRecording ? "hub-input-recording" : ""}`}
              placeholder={isRecording
                ? "Listening..."
                : inputMode === "gemini"
                  ? "Ask Gemini about agents, patterns, progress..."
                  : "Send instructions to agents..."
              }
              value={inputMode === "gemini" ? chatInput : injectContent}
              onChange={(e) => inputMode === "gemini" ? setChatInput(e.target.value) : setInjectContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (isRecording) {
                    recognitionRef.current?.stop();
                    setIsRecording(false);
                  }
                  if (inputMode === "gemini") handleChatSend();
                  else handleInject();
                }
              }}
            />
            {inputMode === "gemini" && (
              <button
                className={`hub-mic-btn ${isRecording ? "hub-mic-recording" : ""}`}
                onClick={toggleRecording}
                title={isRecording ? "Stop recording" : "Voice input"}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              </button>
            )}
            <button
              className="hub-command-send"
              onClick={() => {
                if (isRecording) {
                  recognitionRef.current?.stop();
                  setIsRecording(false);
                }
                if (inputMode === "gemini") handleChatSend();
                else handleInject();
              }}
              disabled={inputMode === "gemini"
                ? (chatLoading || !chatInput.trim())
                : (injectSending || !injectContent.trim())
              }
            >
              {(chatLoading || injectSending) ? "..." : "\u2192"}
            </button>
          </div>
        </div>
        {/* Activity stream */}
        <div className="hub-chat-activity">
          <div className="hub-section-label" style={{ padding: "8px 14px 4px" }}>Activity</div>
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
