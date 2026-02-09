export function VSCodeDocs() {
  return (
    <article className="docs-article">
      <h1>VS Code Extension</h1>
      <p className="docs-lead">
        Eywa's VS Code extension gives you a live sidebar showing every agent session in your room,
        an attention system that surfaces agents needing your input, inline editor decorations for
        active agent scopes, and context injection from your editor. It connects to the same room
        your agents report to, so you see what they see.
      </p>

      <h2>Installation</h2>
      <p>
        Install from the{" "}
        <a
          href="https://marketplace.visualstudio.com/items?itemName=curvilinear.eywa-agents"
          target="_blank"
          rel="noopener noreferrer"
        >
          VS Code Marketplace
        </a>
        . Search for "Eywa" in the Extensions panel, or run this from the command palette:
      </p>
      <pre className="docs-code">
        <code>ext install curvilinear.eywa-agents</code>
      </pre>

      <h2>Quick Start</h2>
      <ol>
        <li>Click the Eywa icon in the activity bar</li>
        <li>Click <strong>Set Room</strong> and enter your room slug (e.g. <code>my-project</code>)</li>
        <li>
          Run <strong>Eywa: Connect Agent</strong> from the command palette to generate an MCP URL
          and copy it to your clipboard
        </li>
      </ol>
      <p>
        The extension connects to the hosted Eywa instance by default. If you're self-hosting,
        run <strong>Eywa: Login</strong> to connect via browser.
      </p>

      <h2>Features</h2>

      <h3>Live Sidebar</h3>
      <p>
        The main panel shows agents as avatar chips with status dots (green = active, yellow = idle,
        grey = finished). Click any agent chip to expand a detail panel showing their current task,
        progress bar, memory count, and last seen time. The detail panel has buttons to inject context
        directly to that agent or open the web dashboard.
      </p>
      <p>
        Below the agent strip, a scrolling activity feed shows recent events across all agents with
        operation tags (system, action, outcome). Click any feed item to expand its full text. Avatars
        match across VS Code, the web dashboard, and hardware displays.
      </p>
      <p>
        The sidebar also shows a destination banner when the room has an active destination. It
        displays milestone progress with a completion bar, individual milestone chips (checked off
        when done), and optional course notes.
      </p>

      <h3>Attention System</h3>
      <p>
        When agents need your input, the sidebar shows a "Needs You" section at the top. Each
        attention item shows the agent's avatar, the reason (distress, blocked, stopped, or
        checkpoint), a summary of what they need, and an inline reply field. Type a response and
        hit Enter to send context directly to that agent. You can also dismiss items you don't
        need to act on.
      </p>
      <p>
        Attention items are prioritized by urgency: distress signals (red, pulsing) come first,
        then blocked agents (yellow), stopped sessions (grey), and checkpoints (blue). The status
        bar updates to show how many agents need you, and the sidebar badge shows the count.
        Distress and blocked agents also trigger native VS Code warning popups.
      </p>

      <h3>Agents Panel</h3>
      <p>
        The bottom panel (next to your terminal tabs) shows live agent cards in a horizontal strip.
        Each card displays the agent's name, status dot, current task, progress bar, last action
        with scope, and system tags. Cards are sorted with active agents first. This panel gives
        you a quick glance at agent activity while you're working in the terminal.
      </p>

      <h3>Agent Decorations</h3>
      <p>
        When agents log operations with scope metadata that references files you have open, the
        extension shows inline decorations: colored gutter dots, after-text annotations showing the
        agent name, action, scope, and time ago, and overview ruler marks. Hover over a decorated
        line to see full details including the agent's scope, system, and a link to open the Eywa
        sidebar. Decorations auto-expire after 30 minutes.
      </p>

      <h3>Context Injection</h3>
      <p>Send instructions or context to any agent, or broadcast to all:</p>
      <ul>
        <li>
          <strong>Eywa: Inject Context</strong> - pick a target agent, type a message, set priority
        </li>
        <li>
          <strong>Cmd+Shift+I</strong> (Mac) / <strong>Ctrl+Shift+I</strong> (Win/Linux) - select
          code in the editor and inject it with file path and line range context
        </li>
        <li>
          <strong>Right-click menu</strong> - when you have text selected, "Eywa: Inject Selection
          to Agent" appears in the editor context menu
        </li>
      </ul>
      <p>
        Priority levels: <code>normal</code>, <code>high</code>, <code>urgent</code>. Urgent
        injections trigger a native VS Code popup.
      </p>

      <h3>Terminal Tab Titles</h3>
      <p>
        Toggle <strong>Eywa: Toggle Agent Tab Titles</strong> to show what Claude Code is doing in
        your terminal tab names ("Editing auth.ts", "Running tests", etc.). Uses a PostToolUse hook
        with a flag file at <code>~/.config/eywa/tab-title</code>, no env vars needed.
      </p>

      <h3>Tag Terminals</h3>
      <p>
        Use <strong>Eywa: Tag Terminal with Agent</strong> to associate the active terminal with a
        specific agent. Pick from the list of known agents or enter a custom name. Tagged terminals
        are tracked so you know which terminal belongs to which agent.
      </p>

      <h3>Status Bar</h3>
      <p>
        Click the Eywa status in the bottom-left for a quick-pick menu: switch rooms, see active
        agents, inject context, toggle tab titles, connect agents, log in, or open the dashboard.
        The status bar shows the current room name and updates to show attention count when agents
        need you.
      </p>

      <h2>Commands</h2>
      <table>
        <thead>
          <tr>
            <th>Command</th>
            <th>Keybinding</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Eywa: Login</td>
            <td>-</td>
            <td>Connect to Eywa via browser login</td>
          </tr>
          <tr>
            <td>Eywa: Switch Room</td>
            <td>-</td>
            <td>Change the room you're monitoring</td>
          </tr>
          <tr>
            <td>Eywa: Connect Agent</td>
            <td>-</td>
            <td>Get an MCP URL for a new agent</td>
          </tr>
          <tr>
            <td>Eywa: Inject Context</td>
            <td>-</td>
            <td>Send context/instructions to an agent</td>
          </tr>
          <tr>
            <td>Eywa: Inject Selection</td>
            <td>
              <code>Cmd+Shift+I</code> / <code>Ctrl+Shift+I</code>
            </td>
            <td>Inject selected code to an agent</td>
          </tr>
          <tr>
            <td>Eywa: Open Dashboard</td>
            <td>-</td>
            <td>Open the web dashboard</td>
          </tr>
          <tr>
            <td>Eywa: Refresh Agents</td>
            <td>-</td>
            <td>Manually refresh the sidebar</td>
          </tr>
          <tr>
            <td>Eywa: Toggle Agent Tab Titles</td>
            <td>-</td>
            <td>Show agent actions in terminal tabs</td>
          </tr>
          <tr>
            <td>Eywa: Tag Terminal with Agent</td>
            <td>-</td>
            <td>Associate active terminal with an agent</td>
          </tr>
          <tr>
            <td>Eywa: Show Status</td>
            <td>-</td>
            <td>Quick-pick menu with common actions</td>
          </tr>
        </tbody>
      </table>

      <h2>Settings</h2>
      <table>
        <thead>
          <tr>
            <th>Setting</th>
            <th>Default</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>eywa.supabaseUrl</code></td>
            <td>Hosted instance</td>
            <td>Supabase project URL</td>
          </tr>
          <tr>
            <td><code>eywa.supabaseKey</code></td>
            <td>Hosted instance</td>
            <td>Supabase anon key</td>
          </tr>
          <tr>
            <td><code>eywa.room</code></td>
            <td>(empty)</td>
            <td>Room slug to monitor</td>
          </tr>
          <tr>
            <td><code>eywa.logLevel</code></td>
            <td><code>all</code></td>
            <td>
              Activity feed filter: <code>all</code>, <code>important</code> (sessions +
              knowledge + injections), or <code>sessions</code> only
            </td>
          </tr>
          <tr>
            <td><code>eywa.historyHours</code></td>
            <td><code>24</code></td>
            <td>How many hours of history to load (1, 6, 24, or 72)</td>
          </tr>
        </tbody>
      </table>
      <p>
        The Supabase URL and key default to the hosted Eywa instance. You only need to change
        these if you're self-hosting.
      </p>

      <h2>Links</h2>
      <ul>
        <li>
          <a
            href="https://marketplace.visualstudio.com/items?itemName=curvilinear.eywa-agents"
            target="_blank"
            rel="noopener noreferrer"
          >
            VS Code Marketplace
          </a>
        </li>
        <li>
          <a href="https://eywa-ai.dev" target="_blank" rel="noopener noreferrer">
            Eywa Web Dashboard
          </a>
        </li>
        <li>
          <a href="https://github.com/a-sumo/eywa" target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
        </li>
      </ul>
    </article>
  );
}
