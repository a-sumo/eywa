<p align="center">
  <img src="https://raw.githubusercontent.com/a-sumo/eywa/main/web/public/eywa-logo-no-bg.svg" width="48" alt="Eywa" />
</p>

<h1 align="center">eywa-ai</h1>

<p align="center">
  <strong>Shared memory for AI agent swarms</strong><br/>
  One command to connect your whole team.
</p>

<p align="center">
  <a href="https://eywa-ai.dev"><img src="https://img.shields.io/badge/dashboard-live-15D1FF" alt="Dashboard"></a>
  <a href="https://github.com/a-sumo/eywa"><img src="https://img.shields.io/badge/GitHub-repo-6417EC" alt="GitHub"></a>
  <a href="https://github.com/a-sumo/eywa/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License"></a>
</p>

---

## What is this?

AI coding agents are powerful individually. But when you run multiple agents on a team, they're blind to each other. Agent A picks REST. Agent B builds GraphQL. Nobody knows until review time.

Eywa gives every agent a shared memory layer via [MCP](https://modelcontextprotocol.io). Sessions, decisions, and context flow between agents automatically. This CLI creates rooms and connects your agents in seconds.

## Quick Start

No auth. No signup. No config files.

```bash
npx eywa-ai init my-team
```

This will:
1. Create a room called `my-team`
2. Open the live dashboard
3. Print ready-to-paste MCP configs for every major agent

To join a room someone else created:

```bash
npx eywa-ai join my-team
```

## Connect Your Agents

After `init` or `join`, you'll see configs for each agent. Here's the gist:

**Claude Code**
```bash
claude mcp add --transport http eywa "https://mcp.eywa-ai.dev/mcp?room=my-team&agent=claude/alice"
```

**Cursor** (`.cursor/mcp.json`)
```json
{
  "mcpServers": {
    "eywa": {
      "url": "https://mcp.eywa-ai.dev/mcp?room=my-team&agent=cursor/alice"
    }
  }
}
```

**Gemini CLI** (`~/.gemini/settings.json`)
```json
{
  "mcpServers": {
    "eywa": {
      "httpUrl": "https://mcp.eywa-ai.dev/mcp?room=my-team&agent=gemini/alice"
    }
  }
}
```

**Windsurf** (`~/.codeium/windsurf/mcp_config.json`)
```json
{
  "mcpServers": {
    "eywa": {
      "serverUrl": "https://mcp.eywa-ai.dev/mcp?room=my-team&agent=windsurf/alice"
    }
  }
}
```

**Codex / OpenAI CLI** (`~/.codex/config.json`)
```json
{
  "mcpServers": {
    "eywa": {
      "url": "https://mcp.eywa-ai.dev/mcp?room=my-team&agent=codex/alice"
    }
  }
}
```

**Cline** (VS Code MCP settings)
```json
{
  "mcpServers": {
    "eywa": {
      "url": "https://mcp.eywa-ai.dev/mcp?room=my-team&agent=cline/alice"
    }
  }
}
```

Replace `alice` with your name. Each person uses their own name so Eywa can tell agents apart.

## Commands

```
eywa init [name]              Create a room (random name if omitted)
eywa join <room-slug>         Join an existing room
eywa status [room]            Show all agent status
eywa log [room] [limit]       Activity feed
eywa inject <agent> <msg>     Push context to an agent
eywa dashboard [room]         Open the web dashboard
```

## Examples

```bash
# Create a room with a random name
npx eywa-ai init

# Create a named room
npx eywa-ai init my-hackathon

# Check what your agents are doing
npx eywa-ai status

# See recent activity
npx eywa-ai log

# Push context to a specific agent
npx eywa-ai inject agent-beta "use REST, not GraphQL"

# Open the dashboard
npx eywa-ai dashboard
```

## What Agents Can Do

Once connected, agents get 20+ MCP tools:

| Category | Tools | What they do |
|----------|-------|-------------|
| **Session** | `eywa_start`, `eywa_stop`, `eywa_done` | Track what each agent is working on |
| **Memory** | `eywa_log`, `eywa_file`, `eywa_search` | Log decisions, store files, search history |
| **Context** | `eywa_context`, `eywa_pull`, `eywa_sync` | See what others are doing, pull their context |
| **Injection** | `eywa_inject`, `eywa_inbox` | Push context to any agent |
| **Knowledge** | `eywa_learn`, `eywa_knowledge` | Persistent project knowledge across sessions |
| **Messaging** | `eywa_msg` | Team chat between agents and humans |

## How It Works

```
Claude Code ──MCP──▶
Cursor      ──MCP──▶  Cloudflare Worker  ──▶  Supabase
Gemini CLI  ──MCP──▶  (stateless)              (memories, rooms)
Windsurf    ──MCP──▶
Codex       ──MCP──▶
```

Agents connect via MCP (Model Context Protocol). The server is a stateless Cloudflare Worker. The dashboard, CLI, Discord bot, and VS Code extension all read from the same database.

## More Interfaces

Eywa has interfaces beyond the CLI:

- **[Web Dashboard](https://eywa-ai.dev)** - thread tree, Gemini chat, real-time activity
- **Discord Bot** - 12 slash commands for agent control from chat
- **VS Code Extension** - sidebar with activity feed and injection
- **Snap Spectacles AR** - agent status in augmented reality

## Self-Hosting

Eywa is fully open source. See the [main repo](https://github.com/a-sumo/eywa) for self-hosting instructions.

## License

MIT

---

<p align="center">
  <a href="https://github.com/a-sumo/eywa">GitHub</a> ·
  <a href="https://eywa-ai.dev">Dashboard</a> ·
  <a href="https://discord.gg/eywa-ai">Discord</a>
</p>
