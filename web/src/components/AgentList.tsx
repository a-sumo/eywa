import { useRealtimeAgents } from "../hooks/useRealtimeMemories";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { useRoomContext } from "../context/RoomContext";

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function agentColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 45%)`;
}

export function AgentList() {
  const { room } = useRoomContext();
  const { slug } = useParams<{ slug: string }>();
  const agents = useRealtimeAgents(room?.id ?? null);
  const navigate = useNavigate();
  const location = useLocation();

  const basePath = `/r/${slug}`;

  return (
    <div className="agent-list">
      <h2>Agents</h2>
      <button
        className={`agent-chip ${location.pathname === basePath ? "active" : ""}`}
        onClick={() => navigate(basePath)}
      >
        Threads
      </button>
      <button
        className={`agent-chip ${location.pathname === `${basePath}/remix/new` ? "active" : ""}`}
        onClick={() => navigate(`${basePath}/remix/new`)}
      >
        + Remix
      </button>
      <button
        className={`agent-chip ${location.pathname === `${basePath}/remix3d` ? "active" : ""}`}
        onClick={() => navigate(`${basePath}/remix3d`)}
      >
        Remix 3D
      </button>
      <button
        className={`agent-chip ${location.pathname === `${basePath}/chat` ? "active" : ""}`}
        onClick={() => navigate(`${basePath}/chat`)}
      >
        Team Chat
      </button>
      <div className="agent-list-divider" />
      {agents.map((a) => (
        <button
          key={a.name}
          className={`agent-chip ${
            location.pathname === `${basePath}/agent/${a.name}` ? "active" : ""
          }`}
          onClick={() => navigate(`${basePath}/agent/${encodeURIComponent(a.name)}`)}
        >
          <span
            className="agent-dot"
            style={{
              background: a.isActive ? "#10b981" : agentColor(a.name),
              boxShadow: a.isActive ? "0 0 6px #10b981" : "none",
            }}
          />
          <span className="agent-name">{a.name}</span>
          <span className="agent-meta">
            {a.sessionCount}s &middot; {timeAgo(a.lastSeen)}
          </span>
        </button>
      ))}
      {agents.length === 0 && (
        <p className="empty">No agents yet.</p>
      )}
    </div>
  );
}
