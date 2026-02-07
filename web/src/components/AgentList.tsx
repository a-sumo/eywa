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

import { agentColor } from "../lib/agentColor";

export function AgentList() {
  const { room } = useRoomContext();
  const { slug } = useParams<{ slug: string }>();
  const agents = useRealtimeAgents(room?.id ?? null, 24 * 60 * 60 * 1000);
  const navigate = useNavigate();
  const location = useLocation();
  const [showViews, setShowLabs] = useState(false);

  const basePath = `/r/${slug}`;
  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="agent-list">
      {/* Main nav */}
      <button
        className={`agent-chip eywa-primary ${isActive(`${basePath}/workspace`) ? "active" : ""}`}
        onClick={() => navigate(`${basePath}/workspace`)}
      >
        + New Session
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

      {/* Views */}
      <button
        className="nav-labs-toggle"
        onClick={() => setShowLabs(!showViews)}
      >
        {showViews ? "▾" : "▸"} Views
      </button>
      {showViews && (
        <div className="nav-labs">
          {[
            { path: "graph", label: "Session Graph", icon: "◉" },
            { path: "score", label: "Score", icon: "♪" },
            { path: "mini", label: "Mini", icon: "▪" },
            { path: "eink", label: "E-Ink", icon: "▫" },
            { path: "spectacles", label: "Spectacles", icon: "◎" },
          ].map(({ path, label, icon }) => (
            <button
              key={path}
              className={`nav-lab-item ${isActive(`${basePath}/${path}`) ? "active" : ""}`}
              onClick={() => navigate(`${basePath}/${path}`)}
            >
              <span className="nav-lab-icon">{icon}</span> {label}
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
                    background: agentColor(a.name),
                    boxShadow: a.isActive ? `0 0 6px ${agentColor(a.name)}` : "none",
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
