import { useRealtimeAgents, useRealtimeMemories } from "../hooks/useRealtimeMemories";
import { useNavigate, useParams } from "react-router-dom";
import { useFoldContext } from "../context/FoldContext";
import { EmptyState } from "./EmptyState";

function agentColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 60%)`;
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function Dashboard() {
  const { fold } = useFoldContext();
  const { slug } = useParams<{ slug: string }>();
  const agents = useRealtimeAgents(fold?.id ?? null);
  const { memories } = useRealtimeMemories(fold?.id ?? null, 200);
  const navigate = useNavigate();

  const agentSummaries = agents.map((a) => {
    const agentMemories = memories.filter((m) => m.agent === a.name);
    const lastTask = agentMemories.find(
      (m) => m.metadata?.event === "session_start"
    );
    const summary = agentMemories.find(
      (m) => m.metadata?.event === "session_end"
    );
    return {
      ...a,
      currentTask: lastTask?.metadata?.task as string | undefined,
      lastSummary: summary?.metadata?.summary as string | undefined,
      recentCount: agentMemories.length,
    };
  });

  return (
    <div className="dashboard">
      <h2 className="section-title">Agents</h2>
      {agentSummaries.length === 0 && <EmptyState type="agents" />}
      <div className="agent-grid">
        {agentSummaries.map((a) => (
          <div
            key={a.name}
            className="agent-card"
            onClick={() => navigate(`/s/${slug}/agent/${encodeURIComponent(a.name)}`)}
          >
            <div className="agent-card-header">
              <span
                className="agent-dot"
                style={{
                  background: a.isActive ? "#10b981" : "#6b7280",
                  boxShadow: a.isActive ? "0 0 8px #10b981" : "none",
                }}
              />
              <span className="agent-card-name" style={{ color: agentColor(a.name) }}>
                {a.name}
              </span>
              <span className="agent-card-time">{timeAgo(a.lastSeen)}</span>
            </div>
            {a.currentTask && (
              <p className="agent-card-task">{a.currentTask}</p>
            )}
            {a.lastSummary && (
              <p className="agent-card-summary">
                {a.lastSummary.slice(0, 120)}
                {a.lastSummary.length > 120 ? "..." : ""}
              </p>
            )}
            <div className="agent-card-footer">
              <span>{a.sessionCount} session{a.sessionCount !== 1 ? "s" : ""}</span>
              <span>{a.recentCount} memories</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
