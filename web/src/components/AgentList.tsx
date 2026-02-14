import { useRealtimeAgents } from "../hooks/useRealtimeMemories";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { useFoldContext } from "../context/FoldContext";

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

// Dev mode: add ?dev=1 to any URL or set localStorage.setItem('eywa-dev', '1')
function useDevMode() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  if (params.get("dev") === "1") {
    try { localStorage.setItem("eywa-dev", "1"); } catch { /* ignore */ }
    return true;
  }
  try { return localStorage.getItem("eywa-dev") === "1"; } catch { return false; /* ignore */ }
}

export function AgentList() {
  const { fold } = useFoldContext();
  const { slug } = useParams<{ slug: string }>();
  const agents = useRealtimeAgents(fold?.id ?? null, 24 * 60 * 60 * 1000);
  const navigate = useNavigate();
  const location = useLocation();
  const devMode = useDevMode();

  const basePath = `/f/${slug}`;
  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="agent-list">
      {/* Main nav */}
      <button
        className={`agent-chip eywa-primary ${isActive(basePath) ? "active" : ""}`}
        onClick={() => navigate(basePath)}
      >
        Hub
      </button>
      <button
        className={`agent-chip ${isActive(`${basePath}/seeds`) ? "active" : ""}`}
        onClick={() => navigate(`${basePath}/seeds`)}
      >
        Seeds
      </button>
      <button
        className={`agent-chip ${isActive(`${basePath}/knowledge`) ? "active" : ""}`}
        onClick={() => navigate(`${basePath}/knowledge`)}
      >
        Knowledge
      </button>
      <button
        className={`agent-chip ${isActive(`${basePath}/graph`) ? "active" : ""}`}
        onClick={() => navigate(`${basePath}/graph`)}
      >
        Graph
      </button>
      {devMode && (
        <>
          <button
            className={`agent-chip experimental ${isActive(`${basePath}/map`) ? "active" : ""}`}
            onClick={() => navigate(`${basePath}/map`)}
          >
            Map <span className="chip-badge">LIVE</span>
          </button>
          <button
            className={`agent-chip ${isActive(`${basePath}/spectacles`) ? "active" : ""}`}
            onClick={() => navigate(`${basePath}/spectacles`)}
          >
            Spectacles
          </button>
        </>
      )}

      {/* Spacer pushes agents to bottom */}
      <div style={{ flex: 1 }} />

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
