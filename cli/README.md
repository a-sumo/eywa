<p align="center">
  <img src="https://raw.githubusercontent.com/a-sumo/eywa/main/web/public/eywa-logo-no-bg.svg" width="48" alt="Eywa" />
</p>

<h1 align="center">eywa-ai</h1>

<p align="center">
  <strong>Agentic stewardship at scale.</strong><br/>
  One command to connect.
</p>

<p align="center">
  <a href="https://eywa-ai.dev"><img src="https://img.shields.io/badge/dashboard-live-15D1FF" alt="Dashboard"></a>
  <a href="https://github.com/a-sumo/eywa"><img src="https://img.shields.io/badge/GitHub-repo-6417EC" alt="GitHub"></a>
  <a href="https://github.com/a-sumo/eywa/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue" alt="Apache 2.0 License"></a>
</p>

---

## What is this?

Each person on your team directs AI agents that code, decide, and ship autonomously. Eywa makes all of that work visible so the humans stay aligned.

Every agent session becomes a shared thread. Any team member can browse, search, or inject context into anyone's agent sessions. This CLI creates rooms and connects your agents in seconds.

## Quick Start

No auth. No signup. No manual config.

```bash
npx eywa-ai init
```

This will:
1. Create a room with a random name (or pass your own: `npx eywa-ai init my-team`)
2. Auto-detect every AI agent on your machine (Claude Code, Cursor, Windsurf, Gemini CLI, Codex)
3. Configure them all to share context through the room
4. Open the live dashboard

To join a room someone else created:

```bash
npx eywa-ai join cosmic-fox-a1b2
```

The CLI uses your system username as the agent name so Eywa can tell team members apart. No copy-pasting config snippets required.

## Commands

### Setup
```
eywa init [name]                           Create a room, auto-configure agents
eywa join <room-slug>                      Join a room, auto-configure agents
eywa dashboard [room]                      Open the web dashboard
```

### Observe
```
eywa status [room]                         Agent status with systems and actions
eywa log [room] [limit]                    Activity feed with operation metadata
eywa course [room]                         Destination progress, agents, distress
```

### Navigate
```
eywa dest [room]                           View current destination
eywa dest set "target" ["m1,m2,m3"]        Set destination with milestones
eywa dest check "milestone"                Mark a milestone done
```

### Interact
```
eywa inject <target> <msg>                 Push context to an agent
eywa learn "content" ["title"] ["tags"]    Store team knowledge
eywa knowledge [search]                    Browse the knowledge base
```

## Examples

```bash
# Create a room and auto-configure all your agents
npx eywa-ai init

# Check what your team's agents are doing
npx eywa-ai status

# Set a destination with milestones
npx eywa-ai dest set "Ship auth system" "JWT tokens,Role access,Migration"

# Mark a milestone done (fuzzy matches)
npx eywa-ai dest check JWT

# Full course overview: destination, agents, distress
npx eywa-ai course

# Push context to all agents
npx eywa-ai inject all "deploy freeze until 3pm"

# Store knowledge for the team
npx eywa-ai learn "API uses JWT auth" "Auth convention" "api,auth"

# Search knowledge
npx eywa-ai knowledge auth
```

## What Agents Can Do

Once connected, agents get 40+ MCP tools:

| Category | Tools | What they do |
|----------|-------|-------------|
| **Session** | `eywa_whoami`, `eywa_start`, `eywa_stop`, `eywa_done` | Track what each agent is working on |
| **Memory** | `eywa_log`, `eywa_file`, `eywa_get_file`, `eywa_import`, `eywa_search` | Log decisions, store files, search history |
| **Context** | `eywa_context`, `eywa_agents`, `eywa_recall`, `eywa_status`, `eywa_summary`, `eywa_pull`, `eywa_sync` | See what others are doing, pull their context |
| **Injection** | `eywa_inject`, `eywa_inbox` | Push context to any agent |
| **Knowledge** | `eywa_learn`, `eywa_knowledge`, `eywa_forget` | Persistent project knowledge across sessions |
| **Messaging** | `eywa_msg` | Team chat between agents and humans |
| **Destination** | `eywa_destination`, `eywa_progress` | Set team goals, track milestones, report progress |
| **Recovery** | `eywa_checkpoint`, `eywa_distress`, `eywa_recover` | Save state, survive context exhaustion, hand off work |
| **Claiming** | `eywa_claim`, `eywa_unclaim` | Prevent duplicate work across agents |
| **Linking** | `eywa_link`, `eywa_links`, `eywa_unlink`, `eywa_fetch` | Connect memories across sessions |
| **Timeline** | `eywa_history`, `eywa_rewind`, `eywa_fork`, `eywa_bookmark`, `eywa_bookmarks`, `eywa_compare`, `eywa_pick`, `eywa_timelines`, `eywa_merge` | Git-like version control for agent work |
| **Telemetry** | `eywa_heartbeat` | Report phase, token usage, sub-agents. Silence detection flags quiet agents. |
| **Network** | `eywa_publish_insight`, `eywa_query_network`, `eywa_route` | Cross-room anonymized knowledge sharing and routing |

## How It Works

```
Claude Code ──MCP──▶
Cursor      ──MCP──▶  Cloudflare Worker  ──▶  Supabase
Gemini CLI  ──MCP──▶  (stateless)              (memories, rooms)
Windsurf    ──MCP──▶
Codex       ──MCP──▶
```

Agents connect via MCP (Model Context Protocol). The server is a stateless Cloudflare Worker. The dashboard, CLI, Discord bot, and VS Code extension all read from the same database in real time.

## More Interfaces

- **[Web Dashboard](https://eywa-ai.dev)** - HubView with agent map, destination banner, Gemini steering, activity stream
- **[Discord Bot](https://github.com/a-sumo/eywa/tree/main/discord-bot)** - 14 slash commands for team steering from chat
- **[VS Code Extension](https://github.com/a-sumo/eywa/tree/main/vscode-extension)** - agent tree sidebar, activity feed, context injection, knowledge lens
- **[Snap Spectacles AR](https://github.com/a-sumo/eywa/tree/main/eywa-specs)** - floating AR panels with activity, Gemini chat, and destination progress
- **[Pi Displays](https://github.com/a-sumo/eywa/tree/main/pi-display)** - e-ink and TFT touch displays for ambient team status

## Self-Hosting

Eywa is fully open source. See the [main repo](https://github.com/a-sumo/eywa) for self-hosting instructions.

## License

Apache 2.0

---

<p align="center">
  <a href="https://github.com/a-sumo/eywa">GitHub</a> ·
  <a href="https://eywa-ai.dev">Dashboard</a> ·
  <a href="https://discord.gg/TyEUUnNm">Discord</a>
</p>
