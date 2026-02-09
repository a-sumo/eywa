import { useState, useMemo, useCallback } from "react";
import { useRealtimeMemories } from "../hooks/useRealtimeMemories";
import { useRoomContext } from "../context/RoomContext";
import { useParams } from "react-router-dom";
import { supabase, type Memory } from "../lib/supabase";
import { agentColor } from "../lib/agentColor";
import { getAvatar } from "./avatars";
import { ConnectAgent } from "./ConnectAgent";

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
}

interface AgentState {
  agent: string;
  user: string;
  status: "active" | "idle" | "finished";
  task: string;
  sessionId: string;
  systems: Set<string>;
  opCount: number;
  outcomes: { success: number; failure: number; blocked: number };
  lastSeen: string;
  recentOps: AgentOp[];
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
        opCount: 0,
        outcomes: { success: 0, failure: 0, blocked: 0 },
        lastSeen: m.ts,
        recentOps: [],
      };
      agents.set(m.agent, state);
    }

    if (meta.system) state.systems.add(meta.system as string);
    if (meta.outcome === "success") state.outcomes.success++;
    else if (meta.outcome === "failure") state.outcomes.failure++;
    else if (meta.outcome === "blocked") state.outcomes.blocked++;

    state.opCount++;
    if (state.recentOps.length < 10) {
      state.recentOps.push(extractOp(m));
    }
  }

  return agents;
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
        <span className="hub-agent-meta">{state.opCount} mem</span>
        <span className="hub-agent-meta">{timeAgo(state.lastSeen)}</span>
        <span className="hub-chevron">{expanded ? "\u25B2" : "\u25BC"}</span>
      </div>
      <div className="hub-agent-task">{state.task}</div>
      {systemsList.length > 0 && (
        <div className="hub-agent-systems">
          {systemsList.map((s) => (
            <SystemPill key={s} system={s} />
          ))}
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
