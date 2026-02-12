/**
 * Seed Monitor: focused view for watching autonomous seed agents work.
 * Filters to seed agents only, shows task queue, live operation feed,
 * and active seed cards. Designed as a control panel, not a team dashboard.
 */
import { useState, useMemo } from "react";
import { useRealtimeMemories } from "../hooks/useRealtimeMemories";
import { useRoomContext } from "../context/RoomContext";
import { agentColor } from "../lib/agentColor";
import type { Memory } from "../lib/supabase";

// --- Types ---

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assignedTo: string | null;
  notes: string | null;
  blockedReason: string | null;
  ts: string;
}

interface SeedOp {
  id: string;
  agent: string;
  content: string;
  system?: string;
  action?: string;
  scope?: string;
  outcome?: string;
  event?: string;
  type: string;
  ts: string;
}

interface SeedState {
  agent: string;
  status: "active" | "idle" | "finished";
  task: string;
  opCount: number;
  outcomes: { success: number; failure: number; blocked: number };
  lastSeen: string;
  firstSeen: string;
  sessions: number;
  recentOps: SeedOp[];
}

// --- Helpers ---

const ACTIVE_THRESHOLD = 30 * 60 * 1000;

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function isSeedAgent(agent: string): boolean {
  return agent.startsWith("autonomous/");
}

const NOISE_EVENTS = new Set(["agent_connected"]);

function isNoise(m: Memory): boolean {
  const meta = (m.metadata ?? {}) as Record<string, unknown>;
  return NOISE_EVENTS.has(meta.event as string);
}

function extractTasks(memories: Memory[]): Task[] {
  const tasks: Task[] = [];
  for (const m of memories) {
    if (m.message_type !== "task") continue;
    const meta = (m.metadata ?? {}) as Record<string, unknown>;
    tasks.push({
      id: m.id,
      title: (meta.title as string) || "",
      description: (meta.description as string) || null,
      status: (meta.status as string) || "open",
      priority: (meta.priority as string) || "normal",
      assignedTo: (meta.assigned_to as string) || null,
      notes: (meta.notes as string) || null,
      blockedReason: (meta.blocked_reason as string) || null,
      ts: m.ts,
    });
  }
  // Sort: urgent first, then high, normal, low
  const order: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
  tasks.sort((a, b) => (order[a.priority] ?? 2) - (order[b.priority] ?? 2));
  return tasks;
}

function extractSeedOp(m: Memory): SeedOp {
  const meta = (m.metadata ?? {}) as Record<string, unknown>;
  return {
    id: m.id,
    agent: m.agent,
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

function buildSeedStates(memories: Memory[]): Map<string, SeedState> {
  const seeds = new Map<string, SeedState>();
  for (const m of memories) {
    if (!isSeedAgent(m.agent) || isNoise(m)) continue;
    const meta = (m.metadata ?? {}) as Record<string, unknown>;
    let state = seeds.get(m.agent);
    if (!state) {
      let status: "active" | "idle" | "finished" = "idle";
      let task = "";
      if (meta.event === "session_start") {
        status = Date.now() - new Date(m.ts).getTime() < ACTIVE_THRESHOLD ? "active" : "idle";
        task = (meta.task as string) || "";
      } else if (meta.event === "session_done" || meta.event === "session_end") {
        status = "finished";
        task = (meta.summary as string) || "";
      } else if (Date.now() - new Date(m.ts).getTime() < ACTIVE_THRESHOLD) {
        status = "active";
      }
      state = {
        agent: m.agent,
        status,
        task: task || (m.content ?? "").slice(0, 100),
        opCount: 0,
        outcomes: { success: 0, failure: 0, blocked: 0 },
        lastSeen: m.ts,
        firstSeen: m.ts,
        sessions: 0,
        recentOps: [],
      };
      seeds.set(m.agent, state);
    }
    if (meta.outcome === "success") state.outcomes.success++;
    else if (meta.outcome === "failure") state.outcomes.failure++;
    else if (meta.outcome === "blocked") state.outcomes.blocked++;
    if (meta.event === "session_start") state.sessions++;
    state.opCount++;
    // Track time span
    if (m.ts < state.firstSeen) state.firstSeen = m.ts;
    if (m.ts > state.lastSeen) state.lastSeen = m.ts;
    if (state.recentOps.length < 20) {
      state.recentOps.push(extractSeedOp(m));
    }
  }
  return seeds;
}

// --- Styling constants ---

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "#ef4444",
  high: "#f97316",
  normal: "#6b8cff",
  low: "#64748b",
};

const STATUS_COLORS: Record<string, string> = {
  open: "#4eeaff",
  claimed: "#a855f7",
  in_progress: "#f97316",
  done: "#4ade80",
  blocked: "#fcd34d",
};

const SYSTEM_COLORS: Record<string, string> = {
  git: "#f97316",
  filesystem: "#64748b",
  ci: "#eab308",
  deploy: "#22c55e",
  database: "#06b6d4",
  api: "#8b5cf6",
  other: "#a78bfa",
};

const OUTCOME_COLORS: Record<string, string> = {
  success: "#6ee7b7",
  failure: "#fca5a5",
  blocked: "#fcd34d",
};

// --- Components ---

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "1px 6px",
        borderRadius: "3px",
        fontSize: "10px",
        fontWeight: 600,
        background: `${color}18`,
        color,
        marginRight: "3px",
      }}
    >
      {label}
    </span>
  );
}

function TaskCard({ task }: { task: Task }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      onClick={() => setExpanded(!expanded)}
      style={{
        border: `1px solid ${task.status === "in_progress" ? "rgba(249, 115, 22, 0.3)" : "rgba(255,255,255,0.06)"}`,
        borderRadius: "6px",
        padding: "8px 10px",
        marginBottom: "4px",
        background: task.status === "in_progress" ? "rgba(249, 115, 22, 0.04)" : "rgba(255,255,255,0.02)",
        cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <Badge label={task.priority} color={PRIORITY_COLORS[task.priority] || "#6b8cff"} />
        <Badge label={task.status} color={STATUS_COLORS[task.status] || "#64748b"} />
        <span style={{ fontSize: "12px", fontWeight: 500, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {task.title}
        </span>
        {task.assignedTo && (
          <span style={{ fontSize: "10px", color: agentColor(task.assignedTo), flexShrink: 0 }}>
            {task.assignedTo}
          </span>
        )}
      </div>
      {expanded && (
        <div style={{ marginTop: "6px", fontSize: "11px", opacity: 0.6, lineHeight: 1.4 }}>
          {task.description && <div>{task.description}</div>}
          {task.blockedReason && <div style={{ color: "#fcd34d", marginTop: "4px" }}>Blocked: {task.blockedReason}</div>}
          {task.notes && <div style={{ marginTop: "4px", opacity: 0.5 }}>{task.notes}</div>}
          <div style={{ marginTop: "4px", opacity: 0.3, fontSize: "10px" }}>ID: {task.id}</div>
        </div>
      )}
    </div>
  );
}

function SeedCard({ state, expanded, onToggle }: {
  state: SeedState;
  expanded: boolean;
  onToggle: () => void;
}) {
  const shortName = state.agent.split("/")[1] || state.agent;
  return (
    <div
      style={{
        border: `1px solid ${state.status === "active" ? "rgba(52, 211, 153, 0.3)" : "rgba(255,255,255,0.06)"}`,
        borderRadius: "6px",
        marginBottom: "4px",
        background: state.status === "active" ? "rgba(52, 211, 153, 0.04)" : "rgba(255,255,255,0.02)",
      }}
    >
      <div
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "8px 10px",
          cursor: "pointer",
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: state.status === "active" ? "#34d399" : state.status === "finished" ? "#64748b" : "#eab308",
            flexShrink: 0,
          }}
        />
        <span style={{ color: agentColor(state.agent), fontWeight: 600, fontSize: "12px" }}>
          {shortName}
        </span>
        <span style={{ opacity: 0.4, fontSize: "11px", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {state.task}
        </span>
        <span style={{ opacity: 0.3, fontSize: "10px", flexShrink: 0 }}>
          {state.opCount} ops
        </span>
        {(() => {
          const total = state.outcomes.success + state.outcomes.failure + state.outcomes.blocked;
          const rate = total > 0 ? state.outcomes.success / total : 0;
          return total > 0 ? (
            <span style={{ opacity: 0.3, fontSize: "10px", flexShrink: 0 }}>
              {Math.round(rate * 100)}%
            </span>
          ) : null;
        })()}
        <span style={{ opacity: 0.3, fontSize: "10px", flexShrink: 0 }}>
          {timeAgo(state.lastSeen)}
        </span>
      </div>
      {expanded && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", maxHeight: "400px", overflow: "auto" }}>
          {state.recentOps.map((op) => (
            <div
              key={op.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "3px 8px",
                fontSize: "11px",
                borderLeft: `2px solid ${op.outcome ? OUTCOME_COLORS[op.outcome] || "#666" : "#333"}`,
              }}
            >
              <span style={{ opacity: 0.3, fontFamily: "monospace", fontSize: "10px", flexShrink: 0 }}>
                {op.ts.slice(11, 19)}
              </span>
              {op.system && <Badge label={op.system} color={SYSTEM_COLORS[op.system] || "#a78bfa"} />}
              {op.action && <Badge label={op.action} color="#67e8f9" />}
              {op.outcome && <Badge label={op.outcome} color={OUTCOME_COLORS[op.outcome] || "#888"} />}
              <span style={{ opacity: 0.6, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {op.content}
              </span>
            </div>
          ))}
          {state.recentOps.length === 0 && (
            <div style={{ padding: "12px", opacity: 0.3, fontSize: "11px", textAlign: "center" }}>
              No operations logged yet
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Main ---

export function SeedMonitor() {
  const { room } = useRoomContext();
  const { memories, loading } = useRealtimeMemories(room?.id ?? null, 500);
  const [expandedSeeds, setExpandedSeeds] = useState<Set<string>>(new Set());

  const tasks = useMemo(() => extractTasks(memories), [memories]);
  const seedStates = useMemo(() => buildSeedStates(memories), [memories]);

  const activeTasks = tasks.filter((t) => t.status !== "done");
  const doneTasks = tasks.filter((t) => t.status === "done");

  const activeSeeds = Array.from(seedStates.values()).filter((s) => s.status === "active");
  const finishedSeeds = Array.from(seedStates.values()).filter((s) => s.status === "finished");

  // Live feed: only seed agent operations with system/action tags (signal, not noise)
  const liveFeed = useMemo(() => {
    return memories
      .filter((m) => {
        if (!isSeedAgent(m.agent) || isNoise(m)) return false;
        const meta = (m.metadata ?? {}) as Record<string, unknown>;
        // Only show operations with system tags (the meaningful ones)
        return !!meta.system || meta.event === "session_start" || meta.event === "session_done" || m.message_type === "task";
      })
      .slice(0, 100);
  }, [memories]);

  if (loading) {
    return (
      <div style={{ padding: "2rem", opacity: 0.4 }}>Loading seed activity...</div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Left panel: tasks + seeds */}
      <div style={{
        width: "340px",
        flexShrink: 0,
        borderRight: "1px solid rgba(255,255,255,0.06)",
        overflow: "auto",
        padding: "12px",
      }}>
        {/* Task queue */}
        <div style={{ marginBottom: "16px" }}>
          <div style={{
            fontSize: "10px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--text-secondary)",
            marginBottom: "8px",
          }}>
            Task Queue ({activeTasks.length})
          </div>
          {activeTasks.length === 0 && (
            <div style={{ fontSize: "11px", opacity: 0.3, padding: "8px 0" }}>
              No open tasks. Seeds will self-direct from ARCHITECTURE.md.
            </div>
          )}
          {activeTasks.map((t) => <TaskCard key={t.id} task={t} />)}
          {doneTasks.length > 0 && (
            <details style={{ marginTop: "8px" }}>
              <summary style={{ fontSize: "10px", opacity: 0.3, cursor: "pointer" }}>
                {doneTasks.length} completed
              </summary>
              <div style={{ marginTop: "4px" }}>
                {doneTasks.map((t) => <TaskCard key={t.id} task={t} />)}
              </div>
            </details>
          )}
        </div>

        {/* Active seeds */}
        <div style={{ marginBottom: "16px" }}>
          <div style={{
            fontSize: "10px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--text-secondary)",
            marginBottom: "8px",
          }}>
            Active Seeds ({activeSeeds.length})
          </div>
          {activeSeeds.length === 0 && (
            <div style={{ fontSize: "11px", opacity: 0.3, padding: "8px 0" }}>
              No seeds running. Launch with <code style={{ fontSize: "10px", background: "rgba(255,255,255,0.06)", padding: "1px 4px", borderRadius: "2px" }}>./scripts/agent-loop.sh</code>
            </div>
          )}
          {activeSeeds.map((s) => (
            <SeedCard
              key={s.agent}
              state={s}
              expanded={expandedSeeds.has(s.agent)}
              onToggle={() => {
                setExpandedSeeds((prev) => {
                  const next = new Set(prev);
                  if (next.has(s.agent)) next.delete(s.agent);
                  else next.add(s.agent);
                  return next;
                });
              }}
            />
          ))}
        </div>

        {/* Finished seeds */}
        {finishedSeeds.length > 0 && (
          <div>
            <div style={{
              fontSize: "10px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--text-secondary)",
              marginBottom: "8px",
            }}>
              Finished ({finishedSeeds.length})
            </div>
            {finishedSeeds.map((s) => (
              <SeedCard
                key={s.agent}
                state={s}
                expanded={expandedSeeds.has(s.agent)}
                onToggle={() => {
                  setExpandedSeeds((prev) => {
                    const next = new Set(prev);
                    if (next.has(s.agent)) next.delete(s.agent);
                    else next.add(s.agent);
                    return next;
                  });
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Right panel: live feed */}
      <div style={{ flex: 1, overflow: "auto", padding: "8px 12px" }}>
        <div style={{
          fontSize: "10px",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--text-secondary)",
          marginBottom: "6px",
        }}>
          Live Feed ({liveFeed.length})
        </div>
        {liveFeed.length === 0 && (
          <div style={{ fontSize: "12px", opacity: 0.3, padding: "2rem 0", textAlign: "center" }}>
            No seed activity yet. Operations will appear here in real time as seeds work.
          </div>
        )}
        {liveFeed.map((m) => {
          const op = extractSeedOp(m);
          const shortAgent = m.agent.split("/")[1] || m.agent;
          return (
            <div
              key={m.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "8px",
                padding: "4px 0",
                fontSize: "11px",
                borderBottom: "1px solid rgba(255,255,255,0.03)",
              }}
            >
              <span style={{ opacity: 0.25, fontFamily: "monospace", fontSize: "10px", flexShrink: 0, paddingTop: "1px" }}>
                {m.ts.slice(11, 19)}
              </span>
              <span style={{ color: agentColor(m.agent), fontWeight: 600, fontSize: "11px", flexShrink: 0, minWidth: "80px" }}>
                {shortAgent}
              </span>
              <div style={{ flex: 1, display: "flex", flexWrap: "wrap", alignItems: "center", gap: "3px" }}>
                {op.system && <Badge label={op.system} color={SYSTEM_COLORS[op.system] || "#a78bfa"} />}
                {op.action && <Badge label={op.action} color="#67e8f9" />}
                {op.outcome && <Badge label={op.outcome} color={OUTCOME_COLORS[op.outcome] || "#888"} />}
                <span style={{ opacity: 0.6, lineHeight: 1.4 }}>
                  {op.content}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
