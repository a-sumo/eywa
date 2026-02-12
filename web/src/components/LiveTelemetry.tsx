import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useLiveTelemetry } from "../hooks/useLiveTelemetry";

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 10) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + "...";
}

function eventLabel(type: string): string {
  switch (type) {
    case "telemetry": return "checked in";
    case "task": return "updated a task";
    case "knowledge": return "learned something";
    case "operation": return "made a change";
    case "message": return "said something";
    case "decision": return "made a decision";
    default: return "logged activity";
  }
}

export function LiveTelemetry() {
  const { memoryCount, activeAgents, totalAgents, totalSessions, lastActivity, recentEvents, loading } = useLiveTelemetry();

  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return null;

  const hasActivity = memoryCount > 0;

  return (
    <section className="live-telemetry">
      <div className="live-telemetry-inner">
        <div className="live-telemetry-chrome">
          <div className="live-telemetry-dots">
            <span /><span /><span />
          </div>
          <div className="live-telemetry-url">eywa-ai.dev/r/eywa-dev</div>
          <a
            href="https://github.com/a-sumo/eywa"
            target="_blank"
            rel="noopener noreferrer"
            className="live-telemetry-github"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            Follow along on GitHub
          </a>
        </div>

        <div className="live-telemetry-header">
          <span className="live-telemetry-dot" />
          <span className="live-telemetry-label">
            {activeAgents > 0
              ? `${activeAgents} agent${activeAgents !== 1 ? "s" : ""} building right now`
              : "Agents are building Eywa"}
          </span>
          {lastActivity && (
            <span className="live-telemetry-last">{timeAgo(lastActivity)}</span>
          )}
        </div>

        {hasActivity ? (
          <>
            <div className="live-telemetry-stats">
              <div className="live-telemetry-stat">
                <span className="live-telemetry-value">{memoryCount.toLocaleString()}</span>
                <span className="live-telemetry-stat-label">memories</span>
              </div>
              <div className="live-telemetry-stat-divider" />
              <div className="live-telemetry-stat">
                <span className="live-telemetry-value">{totalAgents}</span>
                <span className="live-telemetry-stat-label">agents</span>
              </div>
              <div className="live-telemetry-stat-divider" />
              <div className="live-telemetry-stat">
                <span className="live-telemetry-value">{totalSessions}</span>
                <span className="live-telemetry-stat-label">sessions</span>
              </div>
            </div>

            {recentEvents.length > 0 && (
              <div className="live-telemetry-feed">
                {recentEvents.map((evt, i) => (
                  <div key={`${evt.ts}-${i}`} className="live-telemetry-event">
                    <span className="live-telemetry-event-dot" />
                    <span className="live-telemetry-event-agent">{evt.agent.split("/").pop()}</span>
                    <span className="live-telemetry-event-label">{eventLabel(evt.type)}</span>
                    <span className="live-telemetry-event-content">{truncate(evt.content, 60)}</span>
                    <span className="live-telemetry-event-time">{timeAgo(evt.ts)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="live-telemetry-footer">
              <Link to="/r/eywa-dev" className="live-telemetry-cta">
                Open full view <span className="live-telemetry-arrow">&rarr;</span>
              </Link>
              <span className="live-telemetry-desc">
                Real agents, real code, happening right now
              </span>
            </div>
          </>
        ) : (
          <div className="live-telemetry-empty">
            <p>Agents are spinning up. This is where you'll see them work.</p>
            <Link to="/r/eywa-dev" className="live-telemetry-cta">
              Open the live view <span className="live-telemetry-arrow">&rarr;</span>
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
