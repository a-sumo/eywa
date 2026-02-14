/**
 * Seed Monitor: focused view for watching autonomous seed agents work.
 * Filters to seed agents only, shows task queue, live operation feed,
 * and active seed cards. Designed as a control panel, not a team dashboard.
 */
import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useRealtimeMemories } from "../hooks/useRealtimeMemories";
import { useFoldContext } from "../context/FoldContext";
import { agentColor } from "../lib/agentColor";
import { PRIORITY_COLORS, STATUS_COLORS, SYSTEM_COLORS, OUTCOME_COLORS } from "../lib/colors";
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

// --- Helpers ---

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
  const { t } = useTranslation("fold");
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      onClick={() => setExpanded(!expanded)}
      style={{
        border: `1px solid ${task.status === "in_progress" ? "rgba(232, 197, 106, 0.25)" : "var(--border-subtle, rgba(68,71,78,1))"}`,
        borderRadius: "6px",
        padding: "8px 10px",
        marginBottom: "4px",
        background: task.status === "in_progress" ? "rgba(232, 197, 106, 0.04)" : "var(--bg-surface, rgba(29,32,40,1))",
        cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <Badge label={task.priority} color={PRIORITY_COLORS[task.priority] || "#8CA9FF"} />
        <Badge label={task.status} color={STATUS_COLORS[task.status] || "#8E9099"} />
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
          {task.blockedReason && <div style={{ color: "#E8C56A", marginTop: "4px" }}>{t("seeds.blocked")}{task.blockedReason}</div>}
          {task.notes && <div style={{ marginTop: "4px", opacity: 0.5 }}>{task.notes}</div>}
          <div style={{ marginTop: "4px", opacity: 0.3, fontSize: "10px" }}>ID: {task.id}</div>
        </div>
      )}
    </div>
  );
}

// --- Main ---

export function SeedMonitor() {
  const { t } = useTranslation("fold");
  const { fold } = useFoldContext();
  const { memories, loading } = useRealtimeMemories(fold?.id ?? null, 500);
  const tasks = useMemo(() => extractTasks(memories), [memories]);

  const activeTasks = tasks.filter((tk) => tk.status !== "done");
  const doneTasks = tasks.filter((tk) => tk.status === "done");

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
      <div style={{ padding: "2rem", opacity: 0.4 }}>{t("seeds.loading")}</div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Left panel: task queue only */}
      <div style={{
        width: "340px",
        flexShrink: 0,
        borderRight: "1px solid var(--border-subtle)",
        overflow: "auto",
        padding: "12px",
      }}>
        <div>
          <div style={{
            fontSize: "10px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--text-secondary)",
            marginBottom: "8px",
          }}>
            {t("seeds.taskQueue", { count: activeTasks.length })}
          </div>
          {activeTasks.length === 0 && (
            <div style={{ fontSize: "11px", opacity: 0.3, padding: "8px 0" }}>
              {t("seeds.noTasks")}
            </div>
          )}
          {activeTasks.map((tk) => <TaskCard key={tk.id} task={tk} />)}
          {doneTasks.length > 0 && (
            <details style={{ marginTop: "8px" }}>
              <summary style={{ fontSize: "10px", opacity: 0.3, cursor: "pointer" }}>
                {t("seeds.completed", { count: doneTasks.length })}
              </summary>
              <div style={{ marginTop: "4px" }}>
                {doneTasks.map((tk) => <TaskCard key={tk.id} task={tk} />)}
              </div>
            </details>
          )}
        </div>
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
          {t("seeds.liveFeed", { count: liveFeed.length })}
        </div>
        {liveFeed.length === 0 && (
          <div style={{ fontSize: "12px", opacity: 0.3, padding: "2rem 0", textAlign: "center" }}>
            {t("seeds.noFeed")}
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
                borderBottom: "1px solid var(--border-subtle, rgba(68,71,78,1))",
              }}
            >
              <span style={{ opacity: 0.25, fontFamily: "monospace", fontSize: "10px", flexShrink: 0, paddingTop: "1px" }}>
                {m.ts.slice(11, 19)}
              </span>
              <span style={{ color: agentColor(m.agent), fontWeight: 600, fontSize: "11px", flexShrink: 0, minWidth: "80px" }}>
                {shortAgent}
              </span>
              <div style={{ flex: 1, display: "flex", flexWrap: "wrap", alignItems: "center", gap: "3px" }}>
                {op.system && <Badge label={op.system} color={SYSTEM_COLORS[op.system] || "#9DA5C0"} />}
                {op.action && <Badge label={op.action} color="#8CA9FF" />}
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
