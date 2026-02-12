/**
 * Real-time operations dashboard. Shows per-agent live operation streams
 * with system/action/scope/outcome tags. Built for scale: incremental
 * state updates, no full refetch, handles thousands of agents.
 */
import { useState, useMemo, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useRealtimeMemories } from "../hooks/useRealtimeMemories";
import { useFoldContext } from "../context/FoldContext";
import { agentColor } from "../lib/agentColor";
import { getAvatar } from "./avatars";
import type { Memory } from "../lib/supabase";

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
  isNew?: boolean;
}

interface AgentProgress {
  percent: number;
  task: string;
  status: string;
  detail: string | null;
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
}

// --- Helpers ---

const ACTIVE_THRESHOLD = 30 * 60 * 1000; // 30 min

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function extractOp(m: Memory): AgentOp {
  const meta = (m.metadata ?? {}) as Record<string, unknown>;
  return {
    id: m.id,
    content: (m.content ?? "").slice(0, 200),
    system: meta.system as string | undefined,
    action: meta.action as string | undefined,
    scope: meta.scope as string | undefined,
    outcome: meta.outcome as string | undefined,
    event: meta.event as string | undefined,
    type: m.message_type,
    ts: m.ts,
  };
}

// Skip noise events that add no signal
const NOISE_EVENTS = new Set(["agent_connected"]);

function isNoise(m: Memory): boolean {
  const meta = (m.metadata ?? {}) as Record<string, unknown>;
  return NOISE_EVENTS.has(meta.event as string);
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

  // Process newest first (memories come sorted desc), skip noise
  for (const m of memories) {
    if (isNoise(m)) continue;

    const meta = (m.metadata ?? {}) as Record<string, unknown>;
    const user = (meta.user as string) ?? m.agent.split("/")[0];

    let state = agents.get(m.agent);
    if (!state) {
      // First (most recent) memory for this agent
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
        task: task || (m.content ?? "").slice(0, 100),
        sessionId: m.session_id,
        systems: new Set(),
        actions: new Set(),
        opCount: 0,
        outcomes: { success: 0, failure: 0, blocked: 0 },
        lastSeen: m.ts,
        recentOps: [],
        progress: null,
      };
      agents.set(m.agent, state);
    }

    // Accumulate operation metadata
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

    // Keep last 10 ops for this agent
    if (state.recentOps.length < 10) {
      state.recentOps.push(extractOp(m));
    }
  }

  return agents;
}

function AgentAvatar({ name, size = 24 }: { name: string; size?: number }) {
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

const OUTCOME_COLORS: Record<string, string> = {
  success: "#6ee7b7",
  failure: "#fca5a5",
  blocked: "#fcd34d",
};

const SYSTEM_COLORS: Record<string, string> = {
  git: "#f97316",
  database: "#06b6d4",
  api: "#8b5cf6",
  deploy: "#22c55e",
  infra: "#ec4899",
  browser: "#3b82f6",
  test: "#eab308",
  build: "#a855f7",
  file: "#64748b",
};

// --- Components ---

function OpBadge({ label, color }: { label: string; color: string }) {
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

function OpLine({ op }: { op: AgentOp }) {
  const time = op.ts.slice(11, 19);
  return (
    <div
      className={`op-line ${op.isNew ? "op-line-new" : ""}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "3px 8px",
        fontSize: "11px",
        borderLeft: `2px solid ${op.outcome ? OUTCOME_COLORS[op.outcome] || "#666" : "#333"}`,
        animation: op.isNew ? "op-slide-in 0.3s ease-out" : undefined,
      }}
    >
      <span style={{ opacity: 0.3, fontFamily: "monospace", fontSize: "10px", flexShrink: 0 }}>
        {time}
      </span>
      {op.system && (
        <OpBadge label={op.system} color={SYSTEM_COLORS[op.system] || "#a78bfa"} />
      )}
      {op.action && (
        <OpBadge label={op.action} color="#67e8f9" />
      )}
      {op.outcome && (
        <OpBadge label={op.outcome} color={OUTCOME_COLORS[op.outcome] || "#888"} />
      )}
      {op.scope && (
        <span style={{ opacity: 0.4, fontSize: "10px" }}>({op.scope})</span>
      )}
      <span style={{ opacity: 0.6, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {op.content}
      </span>
    </div>
  );
}

function AgentCard({ state, expanded, onToggle }: {
  state: AgentState;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation("fold");
  const systemsList = Array.from(state.systems);
  const totalOutcomes = state.outcomes.success + state.outcomes.failure + state.outcomes.blocked;
  const successRate = totalOutcomes > 0 ? Math.round((state.outcomes.success / totalOutcomes) * 100) : null;

  return (
    <div
      className={`agent-ops-card agent-ops-${state.status}`}
      style={{
        border: `1px solid ${state.status === "active" ? "rgba(52, 211, 153, 0.3)" : "rgba(255,255,255,0.06)"}`,
        borderRadius: "6px",
        marginBottom: "6px",
        background: state.status === "active" ? "rgba(52, 211, 153, 0.04)" : "rgba(255,255,255,0.02)",
      }}
    >
      {/* Header */}
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
        <AgentAvatar name={state.user} size={20} />
        <span style={{ color: agentColor(state.agent), fontWeight: 600, fontSize: "12px" }}>
          {state.agent}
        </span>
        <span style={{ opacity: 0.4, fontSize: "10px", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {state.task}
        </span>
        <span style={{ opacity: 0.3, fontSize: "10px", flexShrink: 0 }}>
          {t("ops.ops", { count: state.opCount })}
        </span>
        <span style={{ opacity: 0.3, fontSize: "10px", flexShrink: 0 }}>
          {timeAgo(state.lastSeen)}
        </span>
        <span style={{ fontSize: "10px", opacity: 0.3 }}>
          {expanded ? "\u25B2" : "\u25BC"}
        </span>
      </div>

      {/* Progress bar */}
      {state.progress && (
        <div style={{ padding: "0 10px 4px", display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{
            flex: 1,
            height: "3px",
            background: "rgba(255,255,255,0.06)",
            borderRadius: "2px",
            overflow: "hidden",
          }}>
            <div style={{
              width: `${state.progress.percent}%`,
              height: "100%",
              background: state.progress.status === "blocked"
                ? "#fcd34d"
                : state.progress.percent === 100
                  ? "#34d399"
                  : "#8b5cf6",
              borderRadius: "2px",
              transition: "width 0.5s ease-in-out",
            }} />
          </div>
          <span style={{ fontSize: "10px", fontWeight: 600, color: "#a78bfa", flexShrink: 0 }}>
            {state.progress.percent}%
          </span>
          {state.progress.status !== "working" && (
            <OpBadge
              label={state.progress.status}
              color={state.progress.status === "blocked" ? "#fcd34d" : state.progress.status === "testing" ? "#22c55e" : "#67e8f9"}
            />
          )}
          {state.progress.detail && (
            <span style={{ fontSize: "10px", opacity: 0.4, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {state.progress.detail}
            </span>
          )}
        </div>
      )}

      {/* Systems + outcomes bar */}
      <div style={{ display: "flex", gap: "4px", padding: "0 10px 6px", flexWrap: "wrap", alignItems: "center" }}>
        {systemsList.map((s) => (
          <OpBadge key={s} label={s} color={SYSTEM_COLORS[s] || "#a78bfa"} />
        ))}
        {successRate !== null && (
          <span style={{
            fontSize: "10px",
            marginLeft: "auto",
            color: successRate > 80 ? "#6ee7b7" : successRate > 50 ? "#fcd34d" : "#fca5a5",
          }}>
            {t("ops.success", { rate: successRate })}
            {state.outcomes.failure > 0 && ` ${t("ops.successFail", { count: state.outcomes.failure })}`}
            {state.outcomes.blocked > 0 && ` ${t("ops.successBlocked", { count: state.outcomes.blocked })}`}
          </span>
        )}
      </div>

      {/* Expanded: recent operations */}
      {expanded && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", maxHeight: "300px", overflow: "auto" }}>
          {state.recentOps.map((op) => (
            <OpLine key={op.id} op={op} />
          ))}
          {state.recentOps.length === 0 && (
            <div style={{ padding: "12px", opacity: 0.3, fontSize: "11px", textAlign: "center" }}>
              {t("ops.noOps")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Main ---

export function OperationsView() {
  const { t } = useTranslation("fold");
  const { fold } = useFoldContext();
  const { memories, loading, error } = useRealtimeMemories(fold?.id ?? null, 500);
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());
  const [showIdle, setShowIdle] = useState(false);
  const prevCountRef = useRef(0);

  const agentStates = useMemo(() => buildAgentStates(memories), [memories]);
  const distressSignals = useMemo(() => extractDistress(memories), [memories]);
  const unresolvedDistress = distressSignals.filter((d) => !d.resolved);
  const destination = useMemo(() => extractDestination(memories), [memories]);

  // Mark new operations when count increases
  useEffect(() => {
    if (memories.length > prevCountRef.current && prevCountRef.current > 0) {
      // New memory arrived - it's already at index 0
    }
    prevCountRef.current = memories.length;
  }, [memories.length]);

  // Auto-expand active agents
  useEffect(() => {
    const active = new Set<string>();
    for (const [agent, state] of agentStates) {
      if (state.status === "active") active.add(agent);
    }
    setExpandedAgents((prev) => new Set([...prev, ...active]));
  }, [agentStates]);

  // Sort: active first, then by recency
  const sortedAgents = useMemo(() => {
    const arr = Array.from(agentStates.values());
    arr.sort((a, b) => {
      const order = { active: 0, idle: 1, finished: 2 };
      const diff = order[a.status] - order[b.status];
      if (diff !== 0) return diff;
      return new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime();
    });
    return arr;
  }, [agentStates]);

  const activeAgents = sortedAgents.filter((a) => a.status === "active");
  const recentAgents = sortedAgents.filter((a) => a.status !== "active" && (showIdle || Date.now() - new Date(a.lastSeen).getTime() < 2 * 60 * 60 * 1000));
  const idleCount = sortedAgents.length - activeAgents.length - recentAgents.length;

  // Global stats
  const totalOps = sortedAgents.reduce((sum, a) => sum + a.opCount, 0);
  const allSystems = new Set<string>();
  const globalOutcomes = { success: 0, failure: 0, blocked: 0 };
  for (const a of sortedAgents) {
    for (const s of a.systems) allSystems.add(s);
    globalOutcomes.success += a.outcomes.success;
    globalOutcomes.failure += a.outcomes.failure;
    globalOutcomes.blocked += a.outcomes.blocked;
  }
  const checkpointCount = memories.filter((m) => {
    const meta = (m.metadata ?? {}) as Record<string, unknown>;
    return meta.event === "checkpoint";
  }).length;
  const finishedAgents = sortedAgents.filter((a) => a.status === "finished");

  if (loading) {
    return <div className="ops-view" style={{ padding: "2rem", opacity: 0.4 }}>{t("ops.loading")}</div>;
  }

  if (error) {
    return <div className="ops-view" style={{ padding: "2rem", color: "var(--error)" }}>{t("ops.loadError", { error })}</div>;
  }

  return (
    <div className="ops-view" style={{ padding: "0 12px" }}>
      <style>{`
        @keyframes op-slide-in {
          from { opacity: 0; transform: translateX(-8px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .ops-header {
          display: flex; align-items: center; gap: 12px;
          padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.06);
          margin-bottom: 8px; flex-wrap: wrap;
        }
        .ops-stat { font-size: 11px; opacity: 0.5; }
        .ops-stat b { color: #34d399; opacity: 1; }
        .ops-section-label {
          font-size: 10px; font-weight: 600; text-transform: uppercase;
          letter-spacing: 0.5px; opacity: 0.3; padding: 8px 0 4px;
        }
        .ops-global-feed {
          border-top: 1px solid rgba(255,255,255,0.06);
          margin-top: 12px; padding-top: 8px;
          max-height: 400px; overflow-y: auto;
        }
        .ops-feed-item {
          display: flex; align-items: center; gap: 6px;
          padding: 2px 0; font-size: 11px;
        }
        .ops-feed-agent {
          font-weight: 600; font-size: 10px; flex-shrink: 0;
          max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .ops-feed-content {
          opacity: 0.5; flex: 1; overflow: hidden;
          text-overflow: ellipsis; white-space: nowrap;
        }
        .ops-feed-time { opacity: 0.25; font-size: 10px; flex-shrink: 0; font-family: monospace; }
      `}</style>

      {/* Course status */}
      <div className="ops-header" style={{ flexDirection: "column", alignItems: "stretch", gap: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: "16px" }}>{t("ops.title")}</h2>
          <span className="ops-stat"><b style={{ color: "#34d399" }}>{activeAgents.length}</b> {t("ops.active")}</span>
          <span className="ops-stat"><b>{finishedAgents.length}</b> {t("ops.done")}</span>
          <span className="ops-stat">{t("ops.ops", { count: totalOps })}</span>
          {unresolvedDistress.length > 0 && (
            <span className="ops-stat" style={{ color: "#ef4444" }}>{t("ops.distress", { count: unresolvedDistress.length })}</span>
          )}
          {globalOutcomes.failure > 0 && (
            <span className="ops-stat" style={{ color: "#fca5a5" }}>{t("ops.failures", { count: globalOutcomes.failure })}</span>
          )}
          {globalOutcomes.blocked > 0 && (
            <span className="ops-stat" style={{ color: "#fcd34d" }}>{t("ops.blocked", { count: globalOutcomes.blocked })}</span>
          )}
          {checkpointCount > 0 && (
            <span className="ops-stat">{t("ops.checkpoints", { count: checkpointCount })}</span>
          )}
        </div>
        {allSystems.size > 0 && (
          <div style={{ display: "flex", gap: "3px", flexWrap: "wrap" }}>
            {Array.from(allSystems).map((s) => (
              <OpBadge key={s} label={s} color={SYSTEM_COLORS[s] || "#a78bfa"} />
            ))}
          </div>
        )}
      </div>

      {/* Destination banner */}
      {destination && (
        <div
          style={{
            background: "rgba(139, 92, 246, 0.06)",
            border: "1px solid rgba(139, 92, 246, 0.25)",
            borderRadius: "6px",
            padding: "10px 12px",
            marginBottom: "8px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
            <span style={{
              color: "#a78bfa",
              fontWeight: 700,
              fontSize: "10px",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}>
              {t("ops.destination")}
            </span>
            <span style={{ opacity: 0.3, fontSize: "10px", marginLeft: "auto" }}>
              {timeAgo(destination.ts)}
            </span>
          </div>
          <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px" }}>
            {destination.destination}
          </div>
          {destination.milestones.length > 0 && (() => {
            const done = destination.milestones.filter((m) => destination.progress[m]).length;
            const total = destination.milestones.length;
            const pct = Math.round((done / total) * 100);
            return (
              <>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "6px",
                }}>
                  <div style={{
                    flex: 1,
                    height: "4px",
                    background: "rgba(255,255,255,0.08)",
                    borderRadius: "2px",
                    overflow: "hidden",
                  }}>
                    <div style={{
                      width: `${pct}%`,
                      height: "100%",
                      background: pct === 100
                        ? "#34d399"
                        : "linear-gradient(90deg, #8b5cf6, #06b6d4)",
                      borderRadius: "2px",
                      transition: "width 0.5s ease-in-out",
                    }} />
                  </div>
                  <span style={{ fontSize: "11px", color: "#a78bfa", fontWeight: 600, flexShrink: 0 }}>
                    {done}/{total} ({pct}%)
                  </span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                  {destination.milestones.map((m) => (
                    <span
                      key={m}
                      style={{
                        fontSize: "10px",
                        padding: "2px 6px",
                        borderRadius: "3px",
                        background: destination.progress[m]
                          ? "rgba(52, 211, 153, 0.15)"
                          : "rgba(255,255,255,0.04)",
                        color: destination.progress[m] ? "#6ee7b7" : "rgba(255,255,255,0.4)",
                        textDecoration: destination.progress[m] ? "line-through" : "none",
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
            <div style={{ fontSize: "11px", opacity: 0.5, marginTop: "6px" }}>
              {destination.notes}
            </div>
          )}
        </div>
      )}

      {/* Distress alerts */}
      {unresolvedDistress.length > 0 && unresolvedDistress.map((d) => (
        <div
          key={d.id}
          style={{
            background: "rgba(239, 68, 68, 0.08)",
            border: "1px solid rgba(239, 68, 68, 0.4)",
            borderRadius: "6px",
            padding: "10px 12px",
            marginBottom: "8px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
            <span style={{ color: "#ef4444", fontWeight: 700, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              {t("ops.distressLabel")}
            </span>
            <span style={{ color: agentColor(d.agent), fontWeight: 600, fontSize: "12px" }}>{d.agent}</span>
            <span style={{ opacity: 0.4, fontSize: "10px", marginLeft: "auto" }}>{timeAgo(d.ts)}</span>
          </div>
          <div style={{ fontSize: "12px", marginBottom: "4px" }}>{d.task}</div>
          <div style={{ fontSize: "11px", opacity: 0.6 }}>
            <span style={{ color: "#6ee7b7" }}>{t("ops.distressDone")}</span>{d.done.slice(0, 150)}
          </div>
          <div style={{ fontSize: "11px", opacity: 0.8 }}>
            <span style={{ color: "#fca5a5" }}>{t("ops.distressRemaining")}</span>{d.remaining.slice(0, 200)}
          </div>
          {d.filesChanged.length > 0 && (
            <div style={{ fontSize: "10px", opacity: 0.4, marginTop: "4px" }}>
              {t("ops.distressFiles")}{d.filesChanged.join(", ")}
            </div>
          )}
        </div>
      ))}

      {/* Active agents */}
      {activeAgents.length > 0 && (
        <>
          <div className="ops-section-label">{t("ops.activeSection", { count: activeAgents.length })}</div>
          {activeAgents.map((a) => (
            <AgentCard
              key={a.agent}
              state={a}
              expanded={expandedAgents.has(a.agent)}
              onToggle={() => {
                setExpandedAgents((prev) => {
                  const next = new Set(prev);
                  if (next.has(a.agent)) next.delete(a.agent);
                  else next.add(a.agent);
                  return next;
                });
              }}
            />
          ))}
        </>
      )}

      {/* Recent agents */}
      {recentAgents.length > 0 && (
        <>
          <div className="ops-section-label">{t("ops.recentSection", { count: recentAgents.length })}</div>
          {recentAgents.map((a) => (
            <AgentCard
              key={a.agent}
              state={a}
              expanded={expandedAgents.has(a.agent)}
              onToggle={() => {
                setExpandedAgents((prev) => {
                  const next = new Set(prev);
                  if (next.has(a.agent)) next.delete(a.agent);
                  else next.add(a.agent);
                  return next;
                });
              }}
            />
          ))}
        </>
      )}

      {/* Idle count */}
      {idleCount > 0 && !showIdle && (
        <button
          onClick={() => setShowIdle(true)}
          style={{
            background: "none",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "rgba(255,255,255,0.4)",
            padding: "6px 12px",
            borderRadius: "4px",
            fontSize: "11px",
            cursor: "pointer",
            marginTop: "8px",
          }}
        >
          {t("ops.idleAgents", { count: idleCount })}
        </button>
      )}

      {/* Global live feed */}
      <div className="ops-global-feed">
        <div className="ops-section-label">{t("ops.liveFeed")}</div>
        {memories.filter((m) => !isNoise(m)).slice(0, 50).map((m) => {
          const op = extractOp(m);
          return (
            <div key={m.id} className="ops-feed-item">
              <span className="ops-feed-time">{m.ts.slice(11, 19)}</span>
              <span
                className="ops-feed-agent"
                style={{ color: agentColor(m.agent) }}
              >
                {m.agent.split("/")[1] || m.agent}
              </span>
              {op.system && <OpBadge label={op.system} color={SYSTEM_COLORS[op.system] || "#a78bfa"} />}
              {op.action && <OpBadge label={op.action} color="#67e8f9" />}
              {op.outcome && <OpBadge label={op.outcome} color={OUTCOME_COLORS[op.outcome] || "#888"} />}
              <span className="ops-feed-content">{op.content}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
