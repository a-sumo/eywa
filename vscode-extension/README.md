# Eywa - Agent Memory

See what your team's AI agents are building, right in VS Code.

Eywa gives you a live sidebar showing every agent session in your room - who's active, what they're working on, and a scrolling activity feed. Inject context to steer agents, browse shared knowledge with CodeLens annotations, and open the web dashboard without leaving your editor.

![Eywa](icon.png)

## Quick Start

1. Install the extension from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=armandsumo.eywa-agents)
2. Click the Eywa icon in the activity bar
3. Click **Set Room** and enter your room slug (e.g. `my-project`)

That's it. The extension connects to the hosted Eywa instance by default. If you're self-hosting, run **Eywa: Login** to connect via browser.

### Connect an agent

Run **Eywa: Connect Agent** from the command palette. It generates an MCP URL and copies it to your clipboard. You can also open a terminal with the `claude mcp add` command pre-filled.

## Features

### Live sidebar

The main panel shows agents as avatar chips with status dots (green = active, yellow = idle, grey = finished). Below that, a scrolling activity feed shows recent events across all agents. Avatars match across VS Code, the web dashboard, and hardware displays.

### Context injection

Send instructions or context to any agent, or broadcast to all:

- **Eywa: Inject Context** - pick a target agent, type a message, set priority
- **Cmd+Shift+I** - select code in the editor and inject it with file path context

Priority levels: `normal`, `high`, `urgent`. Urgent injections trigger a native VS Code popup.

### Knowledge base

The Knowledge tree shows entries stored by agents. Entries tagged with file paths appear as CodeLens annotations above relevant code in your editor.

### Terminal tab titles

Toggle **Eywa: Toggle Agent Tab Titles** to show what Claude Code is doing in your terminal tab names ("Editing auth.ts", "Running tests", etc.). Uses a PostToolUse hook with a flag file - no env vars needed.

### Status bar

Click the Eywa status in the bottom-left for a quick-pick menu: switch rooms, inject context, toggle tab titles, connect agents, or open the dashboard.

## Commands

| Command | Keybinding | Description |
|---------|-----------|-------------|
| Eywa: Login | - | Connect to Eywa via browser login |
| Eywa: Switch Room | - | Change the room you're monitoring |
| Eywa: Connect Agent | - | Get an MCP URL for a new agent |
| Eywa: Inject Context | - | Send context/instructions to an agent |
| Eywa: Inject Selection | `Cmd+Shift+I` | Inject selected code to an agent |
| Eywa: Open Dashboard | - | Open the web dashboard |
| Eywa: Refresh Agents | - | Manually refresh the sidebar |
| Eywa: Toggle Agent Tab Titles | - | Show agent actions in terminal tabs |
| Eywa: Show Status | - | Quick-pick menu with common actions |

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `eywa.supabaseUrl` | Hosted instance | Supabase project URL |
| `eywa.supabaseKey` | Hosted instance | Supabase anon key |
| `eywa.room` | (empty) | Room slug to monitor |

The Supabase URL and key default to the hosted Eywa instance. You only need to change these if you're self-hosting.

## Links

- [Eywa Web Dashboard](https://eywa-ai.dev)
- [GitHub](https://github.com/a-sumo/eywa)
