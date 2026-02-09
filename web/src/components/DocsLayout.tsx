import { Link, Outlet, useLocation } from "react-router-dom";

const integrations = [
  { id: "claude-code", name: "Claude Code", tag: "CLI" },
  { id: "cursor", name: "Cursor", tag: "IDE" },
  { id: "windsurf", name: "Windsurf", tag: "IDE" },
  { id: "gemini-cli", name: "Gemini CLI", tag: "CLI" },
  { id: "codex", name: "Codex", tag: "CLI" },
  { id: "cline", name: "Cline", tag: "VS Code" },
  { id: "mistral", name: "Mistral", tag: "API" },
  { id: "cohere", name: "Cohere", tag: "API" },
];

export function DocsLayout() {
  const location = useLocation();

  return (
    <div className="docs-layout">
      <div className="docs-container">
        <aside className="docs-sidebar">
          <div className="docs-sidebar-section">
            <h3>Getting Started</h3>
            <Link to="/docs" className={location.pathname === "/docs" ? "active" : ""}>
              Overview
            </Link>
            <Link to="/docs/quickstart" className={location.pathname === "/docs/quickstart" ? "active" : ""}>
              Quickstart
            </Link>
          </div>

          <div className="docs-sidebar-section">
            <h3>Integrations</h3>
            {integrations.map((item) => (
              <Link
                key={item.id}
                to={`/docs/integrations/${item.id}`}
                className={location.pathname === `/docs/integrations/${item.id}` ? "active" : ""}
              >
                {item.name}
                <span className="docs-sidebar-tag">{item.tag}</span>
              </Link>
            ))}
          </div>

          <div className="docs-sidebar-section">
            <h3>Surfaces</h3>
            <Link to="/docs/cli" className={location.pathname === "/docs/cli" ? "active" : ""}>
              CLI
            </Link>
            <Link to="/docs/vscode" className={location.pathname === "/docs/vscode" ? "active" : ""}>
              VS Code Extension
            </Link>
            <Link to="/docs/discord" className={location.pathname === "/docs/discord" ? "active" : ""}>
              Discord Bot
            </Link>
            <Link to="/docs/spectacles" className={location.pathname === "/docs/spectacles" ? "active" : ""}>
              Spectacles AR
            </Link>
            <Link to="/docs/pi-displays" className={location.pathname === "/docs/pi-displays" ? "active" : ""}>
              Pi Displays
            </Link>
          </div>

          <div className="docs-sidebar-section">
            <h3>Reference</h3>
            <Link to="/docs/architecture" className={location.pathname === "/docs/architecture" ? "active" : ""}>
              Architecture
            </Link>
            <Link to="/docs/self-hosting" className={location.pathname === "/docs/self-hosting" ? "active" : ""}>
              Self-Hosting
            </Link>
          </div>

          <div className="docs-sidebar-section">
            <h3>Resources</h3>
            <a href="/llms.txt" target="_blank" rel="noopener noreferrer">
              LLM Docs (llms.txt)
            </a>
            <a href="https://github.com/a-sumo/eywa" target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
            <a href="https://discord.gg/TyEUUnNm" target="_blank" rel="noopener noreferrer">
              Discord
            </a>
          </div>
        </aside>

        <main className="docs-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function DocsOverview() {
  return (
    <article className="docs-article">
      <h1>Eywa Documentation</h1>
      <p className="docs-lead">
        Eywa is an observability and coordination layer for human + AI teams. Each person on your
        team directs AI agents that code, decide, and ship autonomously. Eywa makes all of that
        work visible so the humans stay aligned.
      </p>

      <h2>What is Eywa?</h2>
      <p>
        Eywa is an MCP server that gives your team shared visibility across every AI agent session.
        When everyone runs AI, small misalignments between people compound at machine speed. Eywa
        gives one shared view of what all agents are building so you know what to sync on.
        It works with any agent that supports the Model Context Protocol: Claude Code, Cursor,
        Windsurf, Gemini CLI, Codex, Cline, and more.
      </p>

      <h2>Core Features</h2>

      <h3>Destination & Progress</h3>
      <p>
        Set a target state for your team, define milestones, and track completion as agents ship.
        Agents report progress with percentage and status. The destination is visible on every
        surface: web dashboard, VS Code sidebar, Discord, and MCP auto-context.
      </p>

      <h3>Live Agent Map</h3>
      <p>
        See what every agent across your team is working on in real time. Each agent's status,
        task, systems touched, and progress are visible on the HubView dashboard. Active agents
        are highlighted, with operation metadata (system, action, scope, outcome) for full observability.
      </p>

      <h3>Context Injection</h3>
      <p>
        Push decisions or corrections into any agent mid-session. Agents see injections on their
        next tool call through automatic piggyback delivery. Supports normal, high, and urgent
        priority levels.
      </p>

      <h3>Team Knowledge</h3>
      <p>
        Persistent memory that survives across all sessions. Store architecture decisions, API
        conventions, gotchas, and patterns with <code>eywa_learn</code>. Knowledge is searchable
        by tags and content, and surfaces in agent auto-context at session start.
      </p>

      <h3>Timeline & Branching</h3>
      <p>
        Git-like version control for agent work. Rewind to any point with <code>eywa_rewind</code>,
        fork alternate timelines with <code>eywa_fork</code>, cherry-pick moments across branches
        with <code>eywa_pick</code>, and merge back with <code>eywa_merge</code>. Bookmark
        important decisions for easy navigation.
      </p>

      <h3>Global Insights Network</h3>
      <p>
        Publish anonymized patterns from your room with <code>eywa_publish_insight</code>.
        Query cross-room intelligence with <code>eywa_query_network</code> so your agents
        learn from what worked in other teams. Lane recommendations suggest relevant insights
        based on your current task.
      </p>

      <h3>Context Recovery</h3>
      <p>
        Agents checkpoint their progress with <code>eywa_checkpoint</code> and send distress
        signals with <code>eywa_distress</code> when context runs low. New sessions auto-recover
        where the last one left off. Baton passing lets agents hand off work mid-session.
      </p>

      <h3>Work Claiming</h3>
      <p>
        Agents declare what they're working on with <code>eywa_claim</code> to prevent duplicate
        effort. Active claims are visible in session snapshots and MCP instructions. Claims
        auto-release when sessions end.
      </p>

      <h3>Gemini Steering</h3>
      <p>
        Built-in Gemini chat panel with 6 tools for querying agent status, detecting patterns,
        analyzing distress signals, and steering the team. Proactively alerts on detected issues
        and agent distress.
      </p>

      <h2>Interaction Surfaces</h2>
      <p>
        The same navigation model (destination, course, steering) works on every surface:
      </p>
      <ul>
        <li><strong>Web Dashboard</strong> - HubView with agent map, destination banner, Gemini chat, activity stream, and inject bar</li>
        <li><strong>VS Code Extension</strong> - Sidebar with agent avatars, activity feed, attention notifications, and agent detail panel next to terminals</li>
        <li><strong>Discord Bot</strong> - 15 slash commands for team steering: <code>/destination</code>, <code>/course</code>, <code>/status</code>, <code>/inject</code>, and more</li>
        <li><strong>CLI</strong> - <code>npx eywa-ai init</code> for zero-auth room setup, plus status, inject, and log commands</li>
        <li><strong>Spectacles AR</strong> - Activity log, Gemini chat, and destination progress as floating AR panels via Supabase Realtime</li>
      </ul>

      <h2>Usage Limits</h2>
      <p>
        Eywa is hosted for free at eywa-ai.dev. To keep the service reliable, the hosted
        version has usage limits. Self-hosting removes all limits.
      </p>
      <table className="docs-table">
        <thead>
          <tr><th></th><th>Free</th><th>Pro</th><th>Enterprise</th></tr>
        </thead>
        <tbody>
          <tr><td>Team members</td><td>5</td><td>Unlimited</td><td>Unlimited</td></tr>
          <tr><td>History</td><td>7 days</td><td>90 days</td><td>Custom</td></tr>
          <tr><td>Memories per room</td><td>10,000</td><td>100,000</td><td>Unlimited</td></tr>
          <tr><td>Integrations</td><td>All</td><td>All</td><td>All + custom</td></tr>
          <tr><td>Knowledge base</td><td>Read-only</td><td>Full</td><td>Full</td></tr>
          <tr><td>Timeline branching</td><td>View only</td><td>Full</td><td>Full</td></tr>
          <tr><td>Price</td><td>$0</td><td>$5/seat/month</td><td>Contact us</td></tr>
        </tbody>
      </table>
      <p>
        Demo rooms are copies of sample data that expire after 24 hours. Create your own
        room with <code>npx eywa-ai init</code> for persistent use.
      </p>

      <h2>LLM Documentation</h2>
      <p>
        For AI agents that need to understand Eywa's full API surface, point them
        at <a href="/llms.txt" target="_blank" rel="noopener noreferrer"><code>llms.txt</code></a> which
        describes all available tools, integration guides, and common workflows.
      </p>

      <h2>Getting Started</h2>
      <p>
        Choose your AI coding agent from the sidebar to see specific setup instructions.
        Most integrations take less than 2 minutes to configure.
      </p>

      <div className="docs-cta-grid">
        <Link to="/docs/integrations/claude-code" className="docs-cta-card">
          <h3>Claude Code</h3>
          <p>Anthropic's CLI agent</p>
        </Link>
        <Link to="/docs/integrations/cursor" className="docs-cta-card">
          <h3>Cursor</h3>
          <p>AI-first code editor</p>
        </Link>
        <Link to="/docs/integrations/windsurf" className="docs-cta-card">
          <h3>Windsurf</h3>
          <p>AI-powered IDE</p>
        </Link>
      </div>
    </article>
  );
}
