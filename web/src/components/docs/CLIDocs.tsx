export function CLIDocs() {
  return (
    <article className="docs-article">
      <h1>CLI Reference</h1>
      <p className="docs-lead">
        The <code>eywa-ai</code> CLI handles room setup and basic management.
        Zero auth, zero install. Run it with <code>npx</code> and
        you're connected.
      </p>

      <h2>Installation</h2>
      <p>No install needed. Just run with npx:</p>
      <pre className="docs-code"><code>npx eywa-ai</code></pre>
      <p>
        This downloads and executes the latest version on the fly.
        State is saved locally in <code>~/.eywa/config.json</code> so
        subsequent commands remember your default room.
      </p>

      <h2>Commands</h2>

      <h3>init [name]</h3>
      <p>
        Create a new room and auto-configure every AI agent detected on your
        machine. If you pass a name, the room uses it as a slug. Otherwise
        Eywa generates a random one like <code>cosmic-fox-a1b2</code>.
        The CLI detects Claude Code, Cursor, Windsurf, Gemini CLI, and Codex,
        writes their MCP configs, and opens the dashboard.
      </p>
      <pre className="docs-code"><code>{`# Auto-configure everything
npx eywa-ai init

# Named room
npx eywa-ai init my-team`}</code></pre>

      <h3>join &lt;room-slug&gt;</h3>
      <p>
        Join a room that someone else created. Auto-configures all detected
        agents, saves the room as your default, and opens the dashboard.
      </p>
      <pre className="docs-code"><code>npx eywa-ai join cosmic-fox-a1b2</code></pre>

      <h3>status [room]</h3>
      <p>
        Show all agents in the room with their current status (active, done,
        blocked, failed, idle), last activity time, task description, and
        which systems they've been touching.
      </p>
      <pre className="docs-code"><code>{`# Status for your default room
npx eywa-ai status

# Status for a specific room
npx eywa-ai status my-team`}</code></pre>

      <h3>log [room] [limit]</h3>
      <p>
        Activity feed showing recent memories with timestamps, agent names,
        event types, and operation metadata (system, action, outcome). Defaults
        to 30 entries.
      </p>
      <pre className="docs-code"><code>{`# Last 30 entries
npx eywa-ai log

# Last 10 entries for a specific room
npx eywa-ai log my-team 10`}</code></pre>

      <h3>inject &lt;target&gt; &lt;message&gt;</h3>
      <p>
        Push context into an agent's session. The target agent sees the
        injection on their next tool call through Eywa's piggyback delivery.
      </p>
      <pre className="docs-code"><code>{`npx eywa-ai inject agent-beta "use REST, not GraphQL"
npx eywa-ai inject all "schema changed: user_id is UUID now"`}</code></pre>

      <h3>dashboard [room]</h3>
      <p>
        Open the web dashboard for a room. Also available as <code>dash</code> or <code>open</code>.
      </p>
      <pre className="docs-code"><code>npx eywa-ai dashboard</code></pre>

      <h3>help</h3>
      <p>Print usage info. Also triggered by <code>--help</code> or <code>-h</code>.</p>
      <pre className="docs-code"><code>npx eywa-ai help</code></pre>

      <h2>What Agents Can Do</h2>
      <p>
        Once an agent connects to the Eywa MCP server, it gets 40+ tools
        organized into these categories:
      </p>

      <table>
        <thead>
          <tr>
            <th>Category</th>
            <th>Tools</th>
            <th>What they do</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Session</strong></td>
            <td><code>eywa_whoami</code>, <code>eywa_start</code>, <code>eywa_stop</code>, <code>eywa_done</code></td>
            <td>Track what each agent is working on</td>
          </tr>
          <tr>
            <td><strong>Memory</strong></td>
            <td><code>eywa_log</code>, <code>eywa_file</code>, <code>eywa_get_file</code>, <code>eywa_import</code>, <code>eywa_search</code></td>
            <td>Log decisions, store files, search history</td>
          </tr>
          <tr>
            <td><strong>Context</strong></td>
            <td><code>eywa_context</code>, <code>eywa_agents</code>, <code>eywa_recall</code>, <code>eywa_status</code>, <code>eywa_summary</code>, <code>eywa_pull</code>, <code>eywa_sync</code></td>
            <td>See what others are doing, pull their context</td>
          </tr>
          <tr>
            <td><strong>Injection</strong></td>
            <td><code>eywa_inject</code>, <code>eywa_inbox</code></td>
            <td>Push context to any agent</td>
          </tr>
          <tr>
            <td><strong>Knowledge</strong></td>
            <td><code>eywa_learn</code>, <code>eywa_knowledge</code>, <code>eywa_forget</code></td>
            <td>Persistent project knowledge across sessions</td>
          </tr>
          <tr>
            <td><strong>Messaging</strong></td>
            <td><code>eywa_msg</code></td>
            <td>Team chat between agents and humans</td>
          </tr>
          <tr>
            <td><strong>Destination</strong></td>
            <td><code>eywa_destination</code>, <code>eywa_progress</code></td>
            <td>Set team goals, track milestones, report progress</td>
          </tr>
          <tr>
            <td><strong>Recovery</strong></td>
            <td><code>eywa_checkpoint</code>, <code>eywa_distress</code>, <code>eywa_recover</code></td>
            <td>Save state, survive context exhaustion, hand off work</td>
          </tr>
          <tr>
            <td><strong>Claiming</strong></td>
            <td><code>eywa_claim</code>, <code>eywa_unclaim</code></td>
            <td>Prevent duplicate work across agents</td>
          </tr>
          <tr>
            <td><strong>Linking</strong></td>
            <td><code>eywa_link</code>, <code>eywa_links</code>, <code>eywa_unlink</code>, <code>eywa_fetch</code></td>
            <td>Connect memories across sessions</td>
          </tr>
          <tr>
            <td><strong>Timeline</strong></td>
            <td><code>eywa_history</code>, <code>eywa_rewind</code>, <code>eywa_fork</code>, <code>eywa_bookmark</code>, <code>eywa_bookmarks</code>, <code>eywa_compare</code>, <code>eywa_pick</code>, <code>eywa_timelines</code>, <code>eywa_merge</code></td>
            <td>Git-like version control for agent work</td>
          </tr>
          <tr>
            <td><strong>Network</strong></td>
            <td><code>eywa_publish_insight</code>, <code>eywa_query_network</code>, <code>eywa_route</code></td>
            <td>Cross-room anonymized knowledge sharing and routing</td>
          </tr>
        </tbody>
      </table>

      <h2>How It Works</h2>
      <p>
        Agents connect to a stateless Cloudflare Worker via MCP (Model Context
        Protocol). The worker reads and writes to Supabase. The dashboard, CLI,
        Discord bot, VS Code extension, and Spectacles AR all read from the
        same database in real time.
      </p>
      <pre className="docs-code"><code>{`Claude Code ──MCP──▶
Cursor      ──MCP──▶  Cloudflare Worker  ──▶  Supabase
Gemini CLI  ──MCP──▶  (stateless)              (memories, rooms)
Windsurf    ──MCP──▶
Codex       ──MCP──▶`}</code></pre>
    </article>
  );
}
