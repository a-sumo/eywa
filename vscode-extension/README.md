# Eywa - Agent Memory

VS Code extension for monitoring and steering AI agents sharing context through [Eywa](https://eywa-ai.dev).

See your agents working in real time, inject context, browse shared knowledge, and open the web dashboard - all from your editor sidebar.

![Eywa](icon.png)

## Features

### Agent Monitoring
Live sidebar showing all connected agents in your room. See who's active, what they're working on, session history, and memory counts. Tree auto-refreshes via Supabase realtime.

### Context Injection
Send instructions or context to any agent (or broadcast to all) directly from VS Code. Two ways:

- **Manual injection** (`Eywa: Inject Context`) - type a message, pick a target agent and priority
- **Selection injection** (`Cmd+Shift+I`) - select code in the editor and inject it with a file path reference

Priority levels: `normal`, `high`, `urgent` (urgent shows a native popup).

### Activity Feed
Live feed of agent events: session starts/stops, context injections, knowledge updates, and general memory logs. Shows the last 50 events, newest first.

### Knowledge Base
Browse all knowledge entries stored by agents. Entries tagged with file paths appear as CodeLens annotations above relevant files in your editor.

### Agent Connection
`Eywa: Connect Agent` generates an MCP URL and copies it to your clipboard. Optionally opens a terminal with the `claude mcp add` command pre-filled.

### Status Bar
Bottom-left status showing your room and active agent count. Click for a quick-pick menu: inject context, open dashboard, or connect a new agent.

## Setup

1. Install the extension
2. Open VS Code Settings and configure:
   - `eywa.supabaseUrl` - your Supabase project URL
   - `eywa.supabaseKey` - your Supabase anon key
   - `eywa.room` - room slug to monitor (e.g. `my-project`)
3. The sidebar appears in the activity bar (Eywa icon). Open it to see agents, activity, and knowledge.

You can also run `Eywa: Connect Agent` from the command palette to set the room interactively and get an MCP URL for your agents.

## Commands

| Command | Keybinding | Description |
|---------|-----------|-------------|
| `Eywa: Connect Agent` | - | Set room, get MCP URL for agents |
| `Eywa: Inject Context` | - | Send context/instructions to an agent |
| `Eywa: Inject Selection` | `Cmd+Shift+I` | Inject selected code to an agent |
| `Eywa: Open Dashboard` | - | Open the web dashboard for your room |
| `Eywa: Refresh Agents` | - | Manually refresh all tree views |
| `Eywa: Show Status` | - | Quick-pick menu with common actions |
| `Eywa: Show Knowledge for File` | - | Browse knowledge entries for the current file |

## Settings

| Setting | Description |
|---------|-------------|
| `eywa.supabaseUrl` | Supabase project URL |
| `eywa.supabaseKey` | Supabase anon key |
| `eywa.room` | Room slug to monitor |

## How It Works

The extension connects directly to your Supabase backend using the JS SDK. It subscribes to realtime changes on the `memories` table, so agent events (session starts, context injections, knowledge updates) appear instantly in the sidebar.

Injections are written as `memories` rows with `message_type: 'injection'` and metadata targeting a specific agent. Agents pick these up on their next context poll.

## Links

- [Eywa Web Dashboard](https://eywa-ai.dev)
- [GitHub](https://github.com/a-sumo/eywa)
