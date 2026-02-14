import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useRealtimeMemories } from "../hooks/useRealtimeMemories";
import { useFoldContext } from "../context/FoldContext";
import { useParams, useNavigate } from "react-router-dom";
import { supabase, type Memory, type GlobalInsight } from "../lib/supabase";
import { agentColor } from "../lib/agentColor";
import { TASK_PRIORITY_COLORS, TASK_STATUS_COLORS, SYSTEM_COLORS, OUTCOME_COLORS, EVENT_STYLES } from "../lib/colors";
import { getAvatar } from "./avatars";
import { OnboardingOverlay } from "./OnboardingOverlay";
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
  foldId,
  onClose,
}: {
  current: Destination | null;
  foldId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation("fold");
  const [dest, setDest] = useState(current?.destination || "");
  const [milestoneText, setMilestoneText] = useState(
    current?.milestones.join("\n") || ""
  );
  const [notes, setNotes] = useState(current?.notes || "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!dest.trim() || !foldId) return;
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
      fold_id: foldId,
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
          {current ? t("hub.editDestination") : t("hub.setDestination")}
        </span>
        <button className="hub-dest-editor-close" onClick={onClose}>
          {t("hub.cancel")}
        </button>
      </div>
      <div className="hub-dest-editor-field">
        <label className="hub-dest-editor-label">{t("hub.whereGoing")}</label>
        <textarea
          className="hub-dest-editor-input"
          value={dest}
          onChange={(e) => setDest(e.target.value)}
          placeholder={t("hub.whereGoingPlaceholder")}
          rows={2}
        />
      </div>
      <div className="hub-dest-editor-field">
        <label className="hub-dest-editor-label">{t("hub.milestonesLabel")}</label>
        <textarea
          className="hub-dest-editor-input"
          value={milestoneText}
          onChange={(e) => setMilestoneText(e.target.value)}
          placeholder={t("hub.milestonesPlaceholder")}
          rows={4}
        />
      </div>
      <div className="hub-dest-editor-field">
        <label className="hub-dest-editor-label">{t("hub.notesLabel")}</label>
        <textarea
          className="hub-dest-editor-input hub-dest-editor-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t("hub.notesPlaceholder")}
          rows={2}
        />
      </div>
      <button
        className="hub-dest-editor-save"
        onClick={handleSave}
        disabled={!dest.trim() || saving}
      >
        {saving ? t("hub.saving") : current ? t("hub.updateDestination") : t("hub.setDestination")}
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

// Color constants imported from ../lib/colors

function TaskCard({ task }: { task: TaskItem }) {
  const { t } = useTranslation("fold");
  const priorityColor = TASK_PRIORITY_COLORS[task.priority] || "#B0A0DC";
  const statusColor = TASK_STATUS_COLORS[task.status] || "#8E9099";

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
        <div className="hub-task-blocked">{t("hub.blocked")}{task.blockedReason}</div>
      )}
      {task.notes && (
        <div className="hub-task-notes">{task.notes.slice(0, 150)}</div>
      )}
    </div>
  );
}

function TaskQueue({ tasks }: { tasks: TaskItem[] }) {
  const { t } = useTranslation("fold");
  const activeTasks = tasks.filter((tk) => tk.status !== "done");
  if (activeTasks.length === 0) return null;

  return (
    <div className="hub-task-queue">
      <div className="hub-section-label">{t("hub.tasks", { count: activeTasks.length })}</div>
      {activeTasks.map((tk) => (
        <TaskCard key={tk.id} task={tk} />
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
  warn: "#E8C56A",
  high: "#D4976A",
  critical: "#FFB4AB",
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
  warn: "#E8C56A",
  high: "#D4976A",
  critical: "#FFB4AB",
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

// SYSTEM_COLORS, OUTCOME_COLORS, EVENT_STYLES imported from ../lib/colors

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
  const { t } = useTranslation("fold");
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
        a.status === "active" ? "#B0A0DC"
        : a.status === "finished" ? "#81C995"
        : "#8E9099";

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
        ctx.fillStyle = pct === 1 ? "#81C995" : "#B0A0DC";
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
        <span className="hub-topology-dot" style={{ background: "#B0A0DC" }} /> {t("hub.topologyActive")}
        <span className="hub-topology-dot" style={{ background: "#81C995" }} /> {t("hub.topologyDone")}
        <span className="hub-topology-dot" style={{ background: "#8E9099" }} /> {t("hub.topologyIdle")}
        <span style={{ color: "rgba(255,255,255,0.3)", marginLeft: 8, fontSize: 10 }}>{t("hub.topologyDestination")}</span>
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
  const color = SYSTEM_COLORS[system] || "#9DA5C0";
  return (
    <span className="hub-pill" style={{ background: `${color}18`, color }}>
      {system}
    </span>
  );
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  const color = OUTCOME_COLORS[outcome] || "#8E9099";
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
  const { t } = useTranslation("fold");
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
            {pressure === "critical" ? t("hub.ctxCritical") : pressure === "high" ? t("hub.ctxHigh") : t("hub.ctxWarn")}
          </span>
        )}
        {(() => {
          const silenceLevel = getSilenceLevel(state.silenceMin, state.status);
          const silenceColor = SILENCE_COLORS[silenceLevel];
          if (silenceLevel === "ok" || state.silenceMin < 1) return null;
          const silenceText = state.silenceMin < 60
            ? t("hub.silentMin", { count: state.silenceMin })
            : state.silenceMin % 60 > 0
              ? t("hub.silentHour", { h: Math.floor(state.silenceMin / 60), m: state.silenceMin % 60 })
              : t("hub.silentHourExact", { h: Math.floor(state.silenceMin / 60) });
          return (
            <span className="hub-pill" style={{
              background: `${silenceColor}18`,
              color: silenceColor,
            }}>
              {silenceText}
            </span>
          );
        })()}
        <span className="hub-agent-meta">{t("hub.mem", { count: state.opCount })}</span>
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
                  ? "#E8C56A"
                  : state.progress.percent === 100
                    ? "#81C995"
                    : "#B0A0DC",
              }}
            />
          </div>
          <span className="hub-progress-pct">{state.progress.percent}%</span>
          {state.progress.status !== "working" && (
            <span className="hub-pill" style={{
              background: state.progress.status === "blocked" ? "rgba(232, 197, 106, 0.09)" : "rgba(140, 169, 255, 0.09)",
              color: state.progress.status === "blocked" ? "#E8C56A" : "#AAC7FF",
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
          padding: "2px 0", fontSize: 11, color: "#8E9099",
        }}>
          <span className="hub-pill" style={{
            background: state.heartbeat.phase === "compacting" ? "#ef444418" :
              state.heartbeat.phase === "waiting_approval" ? "#eab30818" :
              state.heartbeat.phase === "error" ? "#ef444418" :
              state.heartbeat.phase === "thinking" ? "#8b5cf618" : "#22c55e18",
            color: state.heartbeat.phase === "compacting" ? "#FFB4AB" :
              state.heartbeat.phase === "waiting_approval" ? "#E8C56A" :
              state.heartbeat.phase === "error" ? "#FFB4AB" :
              state.heartbeat.phase === "thinking" ? "#B0A0DC" : "#81C995",
          }}>
            {state.heartbeat.phase}
          </span>
          {state.heartbeat.tokenPercent !== null && (
            <span style={{
              color: state.heartbeat.tokenPercent > 80 ? "#FFB4AB" :
                state.heartbeat.tokenPercent > 60 ? "#E8C56A" : "#8E9099",
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
              color: successRate > 80 ? "#81C995" : successRate > 50 ? "#E8C56A" : "#FFB4AB",
            }}>
              {state.outcomes.failure > 0
                ? t("hub.successFail", { rate: successRate, count: state.outcomes.failure })
                : t("hub.success", { rate: successRate })}
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
            <div className="hub-empty">{t("hub.noOps")}</div>
          )}
        </div>
      )}
    </div>
  );
}

function ActivityRow({ op, showAgent = true }: { op: AgentOp; showAgent?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const meta = (op.event && EVENT_STYLES[op.event]) || null;
  const borderColor = meta?.borderColor || (op.outcome ? OUTCOME_COLORS[op.outcome] || "#3A4155" : "#333");
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
  const { t } = useTranslation("fold");
  return (
    <div className="hub-distress-alert">
      <div className="hub-distress-header">
        <span className="hub-distress-label">{t("hub.distress")}</span>
        <span className="hub-distress-agent" style={{ color: agentColor(signal.agent) }}>
          {signal.agent}
        </span>
        <span className="hub-activity-time">{timeAgo(signal.ts)}</span>
      </div>
      <div className="hub-distress-task">{signal.task}</div>
      <div className="hub-distress-detail">
        <span style={{ color: "#81C995" }}>{t("hub.distressDone")}</span>
        {signal.done.slice(0, 150)}
      </div>
      <div className="hub-distress-detail hub-distress-remaining">
        <span style={{ color: "#FFB4AB" }}>{t("hub.distressRemaining")}</span>
        {signal.remaining.slice(0, 200)}
      </div>
      {signal.filesChanged.length > 0 && (
        <div className="hub-distress-files">
          {t("hub.distressFiles")}{signal.filesChanged.join(", ")}
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
  low: "#81C995",
  medium: "#E8C56A",
  high: "#D4976A",
  critical: "#FFB4AB",
};

function ApprovalCard({ approval, foldId }: { approval: PendingApproval; foldId: string }) {
  const { t } = useTranslation("fold");
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
            response_message: decision === "approved" ? t("hub.approvedFromDashboard") : t("hub.deniedFromDashboard"),
          },
        })
        .eq("id", approval.id);

      // Inject the decision to the agent
      const content = decision === "approved"
        ? `APPROVED: Your request "${approval.action.slice(0, 100)}" has been approved. Proceed.`
        : `DENIED: Your request "${approval.action.slice(0, 100)}" was denied.`;

      await supabase.from("memories").insert({
        fold_id: foldId,
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
        borderLeftColor: resolved === "approved" ? "#81C995" : "#FFB4AB",
        opacity: 0.6,
      }}>
        <span style={{ color: resolved === "approved" ? "#81C995" : "#FFB4AB" }}>
          {resolved === "approved" ? t("hub.approved") : t("hub.denied")}
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
          {t("hub.approve")}
        </button>
        <button
          className="hub-deny-btn"
          onClick={() => handleResolve("denied")}
          disabled={resolving}
        >
          {t("hub.deny")}
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
  const { t } = useTranslation("fold");
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
          style={{ background: isSuccess ? "#81C995" : "#FFB4AB" }}
        />
        <span className="hub-deploy-label">{t("hub.deploys")}</span>
        <span className="hub-deploy-latest">
          {latest.scope} {isSuccess ? t("hub.live") : t("hub.failed")}
        </span>
        <span className="hub-activity-time">{timeAgo(latest.ts)}</span>
        {failCount > 0 && (
          <span className="hub-pill" style={{ background: "#ef444418", color: "#FFB4AB" }}>
            {t("hub.failedCount", { count: failCount })}
          </span>
        )}
        <span className="hub-deploy-count">{t("hub.total", { count: recentCount })}</span>
        <span className="hub-chevron">{expanded ? "\u25B2" : "\u25BC"}</span>
      </div>
      {expanded && (
        <div className="hub-deploy-list">
          {deploys.slice(0, 20).map((d) => {
            const outcomeColor = OUTCOME_COLORS[d.outcome] || "#8E9099";
            const shortAgent = d.agent.split("/")[1] || d.agent;
            return (
              <div key={d.id} className="hub-deploy-row">
                <span
                  className="hub-deploy-dot-sm"
                  style={{ background: d.outcome === "success" ? "#81C995" : "#FFB4AB" }}
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
  const { t } = useTranslation("fold");
  const { fold } = useFoldContext();
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  // Time range
  const [timeRange, setTimeRange] = useState(24);
  const sinceMs = timeRange > 0 ? timeRange * 60 * 60 * 1000 : undefined;

  const { memories, loading, error } = useRealtimeMemories(fold?.id ?? null, 500, sinceMs);

  // Agent card expansion
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());

  // Collapsed groups
  const [showFinished, setShowFinished] = useState(false);
  const [showConnect, setShowConnect] = useState(false);

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
    autoContextError,
  } = useGeminiChat("", fold?.id);
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
      alert(t("hub.speechNotSupported"));
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
    if (!injectContent.trim() || !fold) return;
    setInjectSending(true);
    try {
      await supabase.from("memories").insert({
        fold_id: fold.id,
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
  }, [injectContent, injectTarget, injectPriority, fold]);

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
  const isDemo = fold?.is_demo ?? false;
  const [dismissedOnboarding, setDismissedOnboarding] = useState(false);
  if (!loading && memories.length === 0 && !isDemo && !dismissedOnboarding) {
    return (
      <div className="hub-view">
        <OnboardingOverlay
          slug={slug || ""}
          foldId={fold?.id || ""}
          secret={fold?.secret}
          onDismiss={() => setDismissedOnboarding(true)}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="hub-view">
        <div className="hub-header">
          <h2 className="hub-title">{t("hub.title")}</h2>
        </div>
        <div className="hub-empty">{t("hub.loading")}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="hub-view">
        <div className="hub-header">
          <h2 className="hub-title">{t("hub.title")}</h2>
        </div>
        <div className="hub-empty" style={{ color: "var(--error)" }}>
          {t("hub.loadError", { error })}
        </div>
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
          <span className="hub-stat"><b>{activeAgents.length}</b> {t("hub.active")}</span>
          <span className="hub-stat-sep">&middot;</span>
          <span className="hub-stat"><b>{finishedAgents.length}</b> {t("hub.done")}</span>
          <span className="hub-stat-sep">&middot;</span>
          <span className="hub-stat"><b>{idleCount}</b> {t("hub.idle")}</span>
        </div>
      </div>

      {/* Query error banner */}
      {error && (
        <div className="hub-error-banner">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{t("hub.foldDataError", { error })}</span>
        </div>
      )}

      {/* Destination banner */}
      {editingDest ? (
        <DestinationEditor
          current={destination}
          foldId={fold?.id || ""}
          onClose={() => setEditingDest(false)}
        />
      ) : destination ? (
        <div className="hub-destination">
          <div className="hub-destination-header">
            <span className="hub-destination-label">{t("hub.destination")}</span>
            <button
              className="hub-dest-edit-btn"
              onClick={() => setEditingDest(true)}
              title={t("hub.editDestination")}
            >
              {t("hub.edit")}
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
                          ? "#81C995"
                          : "#AAC7FF",
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
                        if (!fold) return;
                        const newProgress = { ...destination.progress, [m]: !destination.progress[m] };
                        await supabase.from("memories").insert({
                          fold_id: fold.id,
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
          {t("hub.setDest")}
        </button>
      )}

      {/* Deploy health */}
      <DeployHealth deploys={deploys} />

      {/* Network routes (cross-fold intelligence) */}
      {networkRoutes.length > 0 && (
        <div className="hub-network-routes">
          <div className="hub-network-routes-header">
            <span className="hub-network-routes-label">{t("hub.networkRoutes")}</span>
            <span className="hub-network-routes-count">{t("hub.signals", { count: networkRoutes.reduce((a, r) => a + r.insights.length, 0) })}</span>
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
          <div className="hub-section-label">{t("hub.pendingApprovals", { count: pendingApprovals.length })}</div>
          {pendingApprovals.map((a) => (
            <ApprovalCard key={a.id} approval={a} foldId={fold?.id || ""} />
          ))}
        </div>
      )}

      {/* Task queue */}
      <TaskQueue tasks={tasks} />

      {/* Distress alerts */}
      {unresolvedDistress.map((d) => (
        <DistressAlert key={d.id} signal={d} />
      ))}

      {/* Connect agent prompt when no agents are connected */}
      {activeAgents.length === 0 && finishedAgents.length === 0 && idleCount === 0 && (
        <div className="hub-connect-prompt">
          <button
            className="hub-connect-toggle"
            onClick={() => setShowConnect(!showConnect)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            <div className="hub-connect-toggle-text">
              <span className="hub-connect-toggle-title">{t("hub.connectAgent")}</span>
              <span className="hub-connect-toggle-desc">{t("hub.connectAgentDesc")}</span>
            </div>
            <span className="hub-connect-chevron">{showConnect ? "\u25BE" : "\u25B8"}</span>
          </button>
          {showConnect && (
            <div className="hub-connect-body">
              <ConnectAgent slug={slug || ""} secret={fold?.secret} inline />
            </div>
          )}
        </div>
      )}

      {/* Active agents */}
      {activeAgents.length > 0 && (
        <div className="hub-section">
          <div className="hub-section-label">{t("hub.activeAgents")}</div>
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
            {showFinished ? "\u25BE" : "\u25B8"} {t("hub.finished", { count: finishedAgents.length })}
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
        <div className="hub-idle-count">{t("hub.idleAgents", { count: idleCount })}</div>
      )}

      </div>{/* end hub-dashboard */}

      {/* RIGHT: Gemini chat + activity panel */}
      <div className="hub-chat-panel">
        <div className="hub-chat-header">
          <span className="hub-chat-title">{t("hub.gemini")}</span>
          {chatMessages.length > 0 && (
            <button onClick={clearChat} className="hub-chat-clear" title={t("hub.clear")}>{t("hub.clear")}</button>
          )}
        </div>
        <div className="hub-chat-messages">
          {autoContextError && (
            <div className="hub-steering-empty" style={{ color: "var(--color-text-secondary)", fontSize: "0.75rem", opacity: 0.7 }}>
              {t("hub.geminiContextError")}
            </div>
          )}
          {chatMessages.length === 0 && !chatLoading && !autoContextError && (
            <div className="hub-steering-empty">
              {t("hub.geminiEmpty")}
            </div>
          )}
          {chatMessages.map((msg: ChatMessage, i: number) => (
            <div
              key={i}
              className={`hub-steering-msg hub-steering-${msg.role}`}
            >
              <div className="hub-steering-msg-role">
                {msg.role === "user" ? t("hub.you") : t("hub.gemini")}
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
              <div className="hub-steering-msg-role">{t("hub.gemini")}</div>
              <div className="hub-steering-msg-content hub-steering-typing">
                {chatStatus || t("hub.thinking")}
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
            >{t("hub.gemini")}</button>
            <button
              className={`hub-mode-btn ${inputMode === "inject" ? "hub-mode-active" : ""}`}
              onClick={() => setInputMode("inject")}
            >{t("hub.inject")}</button>
            {inputMode === "inject" && (
              <>
                <select
                  className="hub-inject-target"
                  value={injectTarget}
                  onChange={(e) => setInjectTarget(e.target.value)}
                >
                  <option value="all">{t("hub.allAgents")}</option>
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
                ? t("hub.listening")
                : inputMode === "gemini"
                  ? t("hub.askGemini")
                  : t("hub.sendInstructions")
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
                title={isRecording ? t("hub.stopRecording") : t("hub.voiceInput")}
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
          <div className="hub-section-label" style={{ padding: "8px 14px 4px" }}>{t("hub.activity")}</div>
          <div className="hub-activity-stream">
            {activityStream.map((item) => {
              const borderColor =
                (item.event && EVENT_STYLES[item.event]?.borderColor) ||
                (item.outcome ? OUTCOME_COLORS[item.outcome] || "#3A4155" : "#333");
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
              <div className="hub-empty">{t("hub.noActivity")}</div>
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
