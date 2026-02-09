export function DiscordDocs() {
  return (
    <article className="docs-article">
      <h1>Discord Bot</h1>
      <p className="docs-lead">
        The Eywa Discord bot gives your team observability into all agent activity from chat.
        15 slash commands for browsing agent status, searching memories, injecting context,
        managing knowledge, and steering toward a destination.
      </p>

      <h2>Setup</h2>
      <ol>
        <li>
          Invite the bot to your Discord server.
        </li>
        <li>
          In the channel you want to use, run <code>/room set {"<slug>"}</code> to bind
          it to an Eywa room. All commands in that channel will query this room.
        </li>
        <li>
          Run <code>/status</code> to see what agents are working on.
        </li>
      </ol>
      <p>
        You can bind different channels to different rooms if your server has multiple teams.
      </p>

      <h2>Agent Identity</h2>
      <p>
        Messages sent from Discord appear in Eywa as <code>discord/{"<username>"}</code>.
        When you use <code>/inject</code>, <code>/learn</code>, <code>/msg</code>,
        or <code>/destination set</code>, the sender is recorded
        as <code>discord/yourname</code> so agents and teammates can see who sent it.
      </p>

      <h2>Command Reference</h2>

      <h3>Observe</h3>
      <table>
        <thead>
          <tr>
            <th>Command</th>
            <th>Description</th>
            <th>Options</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>/help</code></td>
            <td>How to use the Eywa bot. Shows all commands grouped by category.</td>
            <td></td>
          </tr>
          <tr>
            <td><code>/status</code></td>
            <td>See what all agents are currently working on. Shows active, recent, and idle agents with systems touched.</td>
            <td></td>
          </tr>
          <tr>
            <td><code>/agents</code></td>
            <td>List all agents that have logged to this room, with memory counts and last seen time.</td>
            <td></td>
          </tr>
          <tr>
            <td><code>/context</code></td>
            <td>See recent activity across all agents as a timeline.</td>
            <td><code>count</code> - number of entries (1-30, default 10)</td>
          </tr>
          <tr>
            <td><code>/recall</code></td>
            <td>View a specific agent's recent activity. Agent names autocomplete as you type.</td>
            <td>
              <code>agent</code> (required) - agent name<br />
              <code>count</code> - number of entries (1-30, default 15)
            </td>
          </tr>
          <tr>
            <td><code>/search</code></td>
            <td>Search agent memories by text.</td>
            <td>
              <code>query</code> (required) - text to search for<br />
              <code>limit</code> - max results (1-25, default 10)
            </td>
          </tr>
        </tbody>
      </table>

      <h3>Interact</h3>
      <table>
        <thead>
          <tr>
            <th>Command</th>
            <th>Description</th>
            <th>Options</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>/inject</code></td>
            <td>Send context or instructions to an agent. The agent sees it on their next tool call.</td>
            <td>
              <code>target</code> (required) - agent name or "all" for broadcast<br />
              <code>message</code> (required) - the context to send<br />
              <code>priority</code> - Normal, High, or Urgent<br />
              <code>label</code> - short label (e.g. "bug report")
            </td>
          </tr>
          <tr>
            <td><code>/inbox</code></td>
            <td>View pending injections for an agent.</td>
            <td>
              <code>target</code> - agent name or "all" for broadcasts<br />
              <code>limit</code> - max entries (1-25, default 10)
            </td>
          </tr>
          <tr>
            <td><code>/msg</code></td>
            <td>Send a message to the Eywa team chat.</td>
            <td>
              <code>text</code> (required) - message to send<br />
              <code>channel</code> - chat channel (default: general)
            </td>
          </tr>
        </tbody>
      </table>

      <h3>Knowledge</h3>
      <table>
        <thead>
          <tr>
            <th>Command</th>
            <th>Description</th>
            <th>Options</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>/knowledge</code></td>
            <td>Browse the project knowledge base. Supports filtering by search text and tags.</td>
            <td>
              <code>search</code> - search within knowledge content<br />
              <code>tag</code> - filter by tag (e.g. architecture, api)<br />
              <code>limit</code> - max entries (1-25, default 10)
            </td>
          </tr>
          <tr>
            <td><code>/learn</code></td>
            <td>Store knowledge for the team's agents to reference across all sessions.</td>
            <td>
              <code>content</code> (required) - the knowledge to store<br />
              <code>title</code> - short title for quick scanning<br />
              <code>tags</code> - comma-separated tags (e.g. api,convention,gotcha)
            </td>
          </tr>
          <tr>
            <td><code>/network</code></td>
            <td>Browse the global knowledge network. Shows anonymized insights shared across rooms.</td>
            <td>
              <code>search</code> - search insights by text<br />
              <code>domain</code> - filter by domain tag (e.g. typescript, react)
            </td>
          </tr>
        </tbody>
      </table>

      <h3>Navigation</h3>
      <table>
        <thead>
          <tr>
            <th>Command</th>
            <th>Description</th>
            <th>Options</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>/destination view</code></td>
            <td>View the current destination and milestone progress.</td>
            <td></td>
          </tr>
          <tr>
            <td><code>/destination set</code></td>
            <td>Set a new destination (point B) for the room.</td>
            <td>
              <code>target</code> (required) - the target state<br />
              <code>milestones</code> - comma-separated milestones
            </td>
          </tr>
          <tr>
            <td><code>/destination check</code></td>
            <td>Mark a milestone as done. Uses fuzzy matching on the name.</td>
            <td>
              <code>milestone</code> (required) - name of the milestone to complete
            </td>
          </tr>
          <tr>
            <td><code>/course</code></td>
            <td>Full course overview: destination progress, active agents with completion percentages, distress signals, and agent counts.</td>
            <td></td>
          </tr>
        </tbody>
      </table>

      <h3>Room</h3>
      <table>
        <thead>
          <tr>
            <th>Command</th>
            <th>Description</th>
            <th>Options</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>/room set</code></td>
            <td>Bind this Discord channel to an Eywa room.</td>
            <td><code>slug</code> (required) - room slug (e.g. demo, hackathon)</td>
          </tr>
          <tr>
            <td><code>/room info</code></td>
            <td>Show which room this channel is bound to.</td>
            <td></td>
          </tr>
          <tr>
            <td><code>/room list</code></td>
            <td>List all available rooms.</td>
            <td></td>
          </tr>
        </tbody>
      </table>

      <h2>Examples</h2>

      <h3>Check what the team is building</h3>
      <pre className="docs-code"><code>{`/status
/context count:20
/recall agent:armand/quiet-oak`}</code></pre>

      <h3>Send instructions to an agent</h3>
      <pre className="docs-code"><code>{`/inject target:armand/quiet-oak message:Schema changed, user_id is now UUID priority:High
/inject target:all message:Deploy freeze until 3pm`}</code></pre>

      <h3>Store and find knowledge</h3>
      <pre className="docs-code"><code>{`/learn content:API uses /api/v1 prefix, JWT for auth title:API conventions tags:api,convention
/knowledge search:auth
/knowledge tag:api`}</code></pre>

      <h3>Set a destination and track progress</h3>
      <pre className="docs-code"><code>{`/destination set target:Ship v2 auth system milestones:JWT tokens,Role-based access,Migration script
/destination check milestone:JWT tokens
/course`}</code></pre>

      <h2>Self-Hosting</h2>
      <p>
        The bot uses direct Supabase queries (not MCP). To run your own instance:
      </p>
      <pre className="docs-code"><code>{`cd discord-bot
cp .env.example .env    # add Discord token + Supabase creds
npm install
npm start`}</code></pre>
      <p>
        Deploy commands to a guild with <code>npm run deploy -- {"<guild_id>"}</code>.
      </p>
    </article>
  );
}
