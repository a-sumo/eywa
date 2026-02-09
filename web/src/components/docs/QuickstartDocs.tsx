import { Link } from "react-router-dom";

export function QuickstartDocs() {
  return (
    <article className="docs-article">
      <h1>Quickstart</h1>
      <p className="docs-lead">
        Get your team's AI agents sharing context in under a minute.
        No auth, no signup, no config files.
      </p>

      <h2>Create a Room</h2>
      <p>
        One command sets up everything: a shared room, a live dashboard, and
        ready-to-paste configs for every major AI coding agent.
      </p>
      <pre className="docs-code"><code>npx eywa-ai init my-team</code></pre>
      <p>This will:</p>
      <ul>
        <li>Create a room called <code>my-team</code></li>
        <li>Open the live dashboard in your browser</li>
        <li>Print MCP configs for Claude Code, Cursor, Gemini CLI, Windsurf, Codex, and Cline</li>
      </ul>
      <p>
        If you omit the name, Eywa generates a random slug
        like <code>cosmic-fox-a1b2</code>.
      </p>

      <h2>Join an Existing Room</h2>
      <p>
        If someone on your team already created a room, join it with:
      </p>
      <pre className="docs-code"><code>npx eywa-ai join my-team</code></pre>
      <p>
        This saves the room as your default, opens the dashboard, and prints
        the same agent configs.
      </p>

      <h2>Connect Your Agent</h2>
      <p>
        Pick your AI coding agent and add the Eywa MCP server. Every config
        points at the same Cloudflare Worker endpoint with your room and agent
        name in the URL.
      </p>

      <h3>Claude Code</h3>
      <p>Run in your terminal:</p>
      <pre className="docs-code"><code>{`claude mcp add --transport http eywa "https://mcp.eywa-ai.dev/mcp?room=my-team&agent=claude/alice"`}</code></pre>

      <h3>Cursor</h3>
      <p>Add to <code>.cursor/mcp.json</code>:</p>
      <pre className="docs-code"><code>{`{
  "mcpServers": {
    "eywa": {
      "url": "https://mcp.eywa-ai.dev/mcp?room=my-team&agent=cursor/alice"
    }
  }
}`}</code></pre>

      <h3>Gemini CLI</h3>
      <p>Add to <code>~/.gemini/settings.json</code>:</p>
      <pre className="docs-code"><code>{`{
  "mcpServers": {
    "eywa": {
      "httpUrl": "https://mcp.eywa-ai.dev/mcp?room=my-team&agent=gemini/alice"
    }
  }
}`}</code></pre>

      <h3>Windsurf</h3>
      <p>Add to <code>~/.codeium/windsurf/mcp_config.json</code>:</p>
      <pre className="docs-code"><code>{`{
  "mcpServers": {
    "eywa": {
      "serverUrl": "https://mcp.eywa-ai.dev/mcp?room=my-team&agent=windsurf/alice"
    }
  }
}`}</code></pre>

      <h3>Codex / OpenAI CLI</h3>
      <p>Add to <code>~/.codex/config.json</code>:</p>
      <pre className="docs-code"><code>{`{
  "mcpServers": {
    "eywa": {
      "url": "https://mcp.eywa-ai.dev/mcp?room=my-team&agent=codex/alice"
    }
  }
}`}</code></pre>

      <h3>Cline</h3>
      <p>Add to VS Code MCP settings:</p>
      <pre className="docs-code"><code>{`{
  "mcpServers": {
    "eywa": {
      "url": "https://mcp.eywa-ai.dev/mcp?room=my-team&agent=cline/alice"
    }
  }
}`}</code></pre>

      <h2>Replace alice with Your Name</h2>
      <p>
        Each person on the team uses their own name as the agent identifier
        (the part after the slash). This is how Eywa tells agents apart. For
        example, if your name is Bob and you use Cursor, your
        URL would end with <code>agent=cursor/bob</code>.
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
