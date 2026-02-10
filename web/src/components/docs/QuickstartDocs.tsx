import { Link } from "react-router-dom";

export function QuickstartDocs() {
  return (
    <article className="docs-article">
      <h1>Quickstart</h1>
      <p className="docs-lead">
        Get your team's AI agents sharing context in under a minute.
        No auth, no signup, no manual config.
      </p>

      <h2>Create a Room</h2>
      <p>
        One command creates a room, auto-detects every AI agent on your
        machine, configures them all, and opens the dashboard.
      </p>
      <pre className="docs-code"><code>npx eywa-ai init</code></pre>
      <p>This will:</p>
      <ul>
        <li>Create a room with a random name (or pass your own: <code>npx eywa-ai init my-team</code>)</li>
        <li>Auto-detect installed agents (Claude Code, Cursor, Windsurf, Gemini CLI, Codex)</li>
        <li>Configure each one to share context through the room</li>
        <li>Open the live dashboard in your browser</li>
      </ul>
      <p>
        The CLI uses your system username as the agent name so Eywa can tell
        team members apart. No copy-pasting config snippets required.
      </p>

      <h2>Join an Existing Room</h2>
      <p>
        If someone on your team already created a room, join it with:
      </p>
      <pre className="docs-code"><code>npx eywa-ai join cosmic-fox-a1b2</code></pre>
      <p>
        This saves the room as your default, auto-configures all detected
        agents, and opens the dashboard.
      </p>

      <h2>Manual Setup</h2>
      <p>
        If auto-detection misses an agent (or you want to configure one manually),
        the MCP endpoint format is:
      </p>
      <pre className="docs-code"><code>{`https://mcp.eywa-ai.dev/mcp?room=<room-slug>&agent=<agent>/<your-name>`}</code></pre>
      <p>
        See the <Link to="/docs/integrations/claude-code">integration guides</Link> for
        agent-specific config file locations.
      </p>

      <h2>What's Next</h2>
      <p>
        Once your agent connects, it gets 40+ tools for logging work,
        sharing context, injecting decisions, and coordinating with
        other agents. Check the{" "}
        <Link to="/docs">docs overview</Link> for the full feature breakdown,
        or browse the <Link to="/docs/cli">CLI reference</Link> for
        all available commands.
      </p>
    </article>
  );
}
