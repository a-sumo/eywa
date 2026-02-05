import { useState } from "react";
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
  const [showLabs, setShowLabs] = useState(false);

  const basePath = `/r/${slug}`;
  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="agent-list">
      {/* Main nav */}
      <button
        className={`agent-chip remix-primary ${isActive(`${basePath}/remix/new`) ? "active" : ""}`}
        onClick={() => navigate(`${basePath}/remix/new`)}
      >
        + New Remix
      </button>
      <button
        className={`agent-chip ${isActive(`${basePath}/chat`) ? "active" : ""}`}
        onClick={() => navigate(`${basePath}/chat`)}
      >
        Team Chat
      </button>
      <button
        className={`agent-chip ${isActive(basePath) ? "active" : ""}`}
        onClick={() => navigate(basePath)}
      >
        Threads
      </button>

      {/* Spacer pushes labs + agents to bottom */}
      <div style={{ flex: 1 }} />

      {/* Labs */}
      <button
        className="nav-labs-toggle"
        onClick={() => setShowLabs(!showLabs)}
      >
        {showLabs ? "▾" : "▸"} Labs
      </button>
      {showLabs && (
        <div className="nav-labs">
          {[
            { path: "mini", label: "Mini Dashboard" },
            { path: "remix3d", label: "Remix 3D" },
            { path: "layout-agent", label: "Layout Agent" },
            { path: "layout-xr", label: "Layout XR" },
            { path: "xr-test", label: "XR Test" },
          ].map(({ path, label }) => (
            <button
              key={path}
              className={`nav-lab-item ${isActive(`${basePath}/${path}`) ? "active" : ""}`}
              onClick={() => navigate(`${basePath}/${path}`)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Agents — compact, at the very bottom */}
      {agents.length > 0 && (
        <>
          <div className="agent-list-divider" />
          <div className="nav-agents-footer">
            {agents.map((a) => (
              <button
                key={a.name}
                className={`nav-agent-pill ${
                  isActive(`${basePath}/agent/${a.name}`) ? "active" : ""
                }`}
                onClick={() => navigate(`${basePath}/agent/${encodeURIComponent(a.name)}`)}
                title={`${a.sessionCount} sessions · ${timeAgo(a.lastSeen)}`}
              >
                <span
                  className="agent-dot"
                  style={{
                    background: a.isActive ? "#10b981" : agentColor(a.name),
                    boxShadow: a.isActive ? "0 0 6px #10b981" : "none",
                  }}
                />
                {a.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
