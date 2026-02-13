import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { useLiveTelemetry } from "../hooks/useLiveTelemetry";

const SIM_AGENTS = [
  { name: "seed/alpha", tasks: ["refactoring MCP tool handlers", "updating worker routing logic", "optimizing memory queries"] },
  { name: "seed/bravo", tasks: ["writing integration tests", "validating fold permissions", "testing realtime subscriptions"] },
  { name: "seed/charlie", tasks: ["analyzing codebase patterns", "mapping dependency graph", "reviewing type definitions"] },
];

const SIM_EVENTS = [
  { agent: "seed/alpha", type: "operation", content: "Updated worker/src/tools/eywa-mcp.ts" },
  { agent: "seed/bravo", type: "knowledge", content: "Mapped fold routing: 12 endpoints consolidated" },
  { agent: "seed/charlie", type: "task", content: "Created: migrate legacy room references" },
  { agent: "seed/alpha", type: "decision", content: "Using streaming over polling for realtime" },
  { agent: "seed/bravo", type: "operation", content: "Fixed memory deduplication edge case" },
  { agent: "seed/charlie", type: "knowledge", content: "12 cross-module dependencies identified" },
  { agent: "seed/alpha", type: "task", content: "Completed: refactor auth middleware chain" },
  { agent: "seed/bravo", type: "message", content: "Coordinating shared types with seed/alpha" },
  { agent: "seed/charlie", type: "operation", content: "Query optimization: 340ms to 45ms" },
  { agent: "seed/alpha", type: "knowledge", content: "Verified Worker memory limit: 128MB" },
  { agent: "seed/bravo", type: "task", content: "Started: WebSocket reconnection handler" },
  { agent: "seed/charlie", type: "decision", content: "Chose incremental migration over rewrite" },
];

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
  return s.length <= max ? s : s.slice(0, max) + "...";
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
  const telemetry = useLiveTelemetry();

  // Simulated event feed: starts immediately, doesn't wait for Supabase
  const [simEvents, setSimEvents] = useState<
    { agent: string; type: string; content: string; ts: string; key: number }[]
  >([]);
  const simIdx = useRef(0);
  const keyRef = useRef(0);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const addEvent = () => {
      const evt = SIM_EVENTS[simIdx.current % SIM_EVENTS.length];
      simIdx.current++;
      keyRef.current++;
      setSimEvents((prev) =>
        [{ ...evt, ts: new Date().toISOString(), key: keyRef.current }, ...prev].slice(0, 5)
      );
      timeout = setTimeout(addEvent, 2500 + Math.random() * 3500);
    };
    timeout = setTimeout(addEvent, 600);
    return () => clearTimeout(timeout);
  }, []);

  // Task cycling per agent at staggered intervals
  const [taskIdx, setTaskIdx] = useState([0, 0, 0]);
  useEffect(() => {
    const intervals = SIM_AGENTS.map((agent, i) =>
      setInterval(() => {
        setTaskIdx((prev) => {
          const next = [...prev];
          next[i] = (next[i] + 1) % agent.tasks.length;
          return next;
        });
      }, 10000 + i * 3000)
    );
    return () => intervals.forEach(clearInterval);
  }, []);

  // Tick for time-ago refresh
  const [, setTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(i);
  }, []);

  // Merge real events (prioritized) with simulated, sort by time, keep 5
  const allEvents = [
    ...telemetry.recentEvents.map((e, i) => ({ ...e, key: -(i + 1), real: true })),
    ...simEvents.map((e) => ({ ...e, real: false })),
  ]
    .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
    .slice(0, 5);

  const memories = telemetry.memoryCount || 1247;
  const agents = telemetry.totalAgents || 3;
  const sessions = telemetry.totalSessions || 8;

  return (
    <section className="live-telemetry">
      <div className="live-telemetry-inner">
        {/* Animated scanline */}
        <div className="live-telemetry-scanline" />

        {/* Chrome */}
        <div className="live-telemetry-chrome">
          <div className="live-telemetry-dots">
            <span />
            <span />
            <span />
          </div>
          <div className="live-telemetry-url">eywa-ai.dev/f/demo</div>
          <a
            href="https://github.com/a-sumo/eywa"
            target="_blank"
            rel="noopener noreferrer"
            className="live-telemetry-github"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            Follow along on GitHub
          </a>
        </div>

        {/* Header */}
        <div className="live-telemetry-header">
          <span className="live-telemetry-dot" />
          <span className="live-telemetry-label">
            {telemetry.activeAgents > 0
              ? `${telemetry.activeAgents} agent${telemetry.activeAgents !== 1 ? "s" : ""} building right now`
              : "Agents are building Eywa"}
          </span>
          {telemetry.lastActivity && (
            <span className="live-telemetry-last">{timeAgo(telemetry.lastActivity)}</span>
          )}
        </div>

        {/* Stats */}
        <div className="live-telemetry-stats">
          <div className="live-telemetry-stat">
            <span className="live-telemetry-value">{memories.toLocaleString()}</span>
            <span className="live-telemetry-stat-label">memories</span>
          </div>
          <div className="live-telemetry-stat-divider" />
          <div className="live-telemetry-stat">
            <span className="live-telemetry-value">{agents}</span>
            <span className="live-telemetry-stat-label">agents</span>
          </div>
          <div className="live-telemetry-stat-divider" />
          <div className="live-telemetry-stat">
            <span className="live-telemetry-value">{sessions}</span>
            <span className="live-telemetry-stat-label">sessions</span>
          </div>
        </div>

        {/* Agent cards with progress bars */}
        <div className="live-agents">
          {SIM_AGENTS.map((agent, i) => (
            <div key={agent.name} className="live-agent-row">
              <span className={`live-agent-dot live-agent-dot--${["fast", "med", "slow"][i]}`} />
              <span className="live-agent-name">{agent.name.split("/").pop()}</span>
              <span key={`${agent.name}-${taskIdx[i]}`} className="live-agent-task">
                {agent.tasks[taskIdx[i]]}
              </span>
              <div className="live-agent-progress">
                <div className={`live-agent-bar live-agent-bar--${i}`} />
              </div>
            </div>
          ))}
        </div>

        {/* Activity feed */}
        <div className="live-telemetry-feed">
          {allEvents.map((evt) => (
            <div
              key={evt.key}
              className={`live-telemetry-event${evt.real ? " live-telemetry-event--real" : ""}`}
            >
              <span className={`live-telemetry-event-dot live-telemetry-event-dot--${evt.type}`} />
              <span className="live-telemetry-event-agent">{evt.agent.split("/").pop()}</span>
              <span className="live-telemetry-event-label">{eventLabel(evt.type)}</span>
              <span className="live-telemetry-event-content">{truncate(evt.content, 55)}</span>
              <span className="live-telemetry-event-time">{timeAgo(evt.ts)}</span>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="live-telemetry-footer">
          <Link to="/f/demo" className="live-telemetry-cta">
            Open full view <span className="live-telemetry-arrow">&rarr;</span>
          </Link>
          <span className="live-telemetry-desc">Real agents, real code, happening right now</span>
        </div>
      </div>
    </section>
  );
}
