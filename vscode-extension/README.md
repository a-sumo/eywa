# Eywa - Agent Monitor

See what your team's AI agents are building, right in VS Code.

Eywa gives you a live sidebar showing every agent session in your fold, who's active, what they're working on, and a scrolling activity feed. When agents need your attention (distress signals, blocked progress, stopped sessions), the sidebar lights up with inline reply. You can inject context to steer agents, tag terminals to specific agents, and open the web dashboard without leaving your editor.

![Eywa](icon.png)

## Quick Start

1. Run `npx eywa-ai init` in your terminal to create a fold and auto-configure all your agents
2. Install the extension from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=curvilinear.eywa-agents)
3. Click the Eywa icon in the activity bar
4. Click **Set Fold** and enter the fold slug from step 1

That's it. Your agents are already configured and the extension connects to the hosted Eywa instance by default. If you're self-hosting, run **Eywa: Login** to connect via browser.

## Features

### Live sidebar

The main panel shows agents as avatar chips with status dots (green = active, yellow = idle, grey = finished). Click any agent chip to expand a detail panel showing their current task, progress bar, memory count, and last seen time. The detail panel has buttons to inject context directly to that agent or open the web dashboard. Below the agent strip, a scrolling activity feed shows recent events across all agents with operation tags (system, action, outcome). Click any feed item to expand its full text. Avatars match across VS Code, the web dashboard, and hardware displays.

The sidebar also shows a destination banner when the fold has an active destination. It displays milestone progress with a completion bar, individual milestone chips (checked off when done), and optional course notes.

### Attention system

When agents need your input, the sidebar shows a "Needs You" section at the top. Each attention item shows the agent's avatar, the reason (distress, blocked, stopped, or checkpoint), a summary of what they need, and an inline reply field. Type a response and hit Enter to send context directly to that agent. You can also dismiss items you don't need to act on.

Attention items are prioritized by urgency: distress signals (red, pulsing) come first, then blocked agents (yellow), stopped sessions (grey), and checkpoints (blue). The status bar updates to show how many agents need you, and the sidebar badge shows the count. Distress and blocked agents also trigger native VS Code warning popups.

### Agents panel

The bottom panel (next to your terminal tabs) shows live agent cards in a horizontal strip. Each card displays the agent's name, status dot, current task, progress bar, last action with scope, and system tags. Cards are sorted with active agents first. This panel gives you a quick glance at agent activity while you're working in the terminal.

### Agent decorations

When agents log operations with scope metadata that references files you have open, the extension shows inline decorations: colored gutter dots, after-text annotations showing the agent name, action, scope, and time ago, and overview ruler marks. Hover over a decorated line to see full details including the agent's scope, system, and a link to open the Eywa sidebar. Decorations auto-expire after 30 minutes.

### Context injection

Send instructions or context to any agent, or broadcast to all:

- **Eywa: Inject Context** - pick a target agent, type a message, set priority
- **Cmd+Shift+I** (Mac) / **Ctrl+Shift+I** (Win/Linux) - select code in the editor and inject it with file path and line range context
- **Right-click menu** - when you have text selected, "Eywa: Inject Selection to Agent" appears in the editor context menu

Priority levels: `normal`, `high`, `urgent`. Urgent injections trigger a native VS Code popup.

### Terminal tab titles

Toggle **Eywa: Toggle Agent Tab Titles** to show what Claude Code is doing in your terminal tab names ("Editing auth.ts", "Running tests", etc.). Uses a PostToolUse hook with a flag file at `~/.config/eywa/tab-title`, no env vars needed.

### Tag terminals

Use **Eywa: Tag Terminal with Agent** to associate the active terminal with a specific agent. Pick from the list of known agents or enter a custom name. Tagged terminals are tracked so you know which terminal belongs to which agent.

### Status bar

Click the Eywa status in the bottom-left for a quick-pick menu: switch folds, see active agents, inject context, toggle tab titles, connect agents, log in, or open the dashboard. The status bar shows the current fold name, and updates to show attention count when agents need you.

## Commands

| Command | Keybinding | Description |
|---------|-----------|-------------|
| Eywa: Login | - | Connect to Eywa via browser login |
| Eywa: Switch Fold | - | Change the fold you're monitoring |
| Eywa: Connect Agent | - | Get an MCP URL for a new agent |
| Eywa: Inject Context | - | Send context/instructions to an agent |
| Eywa: Inject Selection | `Cmd+Shift+I` / `Ctrl+Shift+I` | Inject selected code to an agent |
| Eywa: Open Dashboard | - | Open the web dashboard |
| Eywa: Refresh Agents | - | Manually refresh the sidebar |
| Eywa: Toggle Agent Tab Titles | - | Show agent actions in terminal tabs |
| Eywa: Tag Terminal with Agent | - | Associate active terminal with an agent |
| Eywa: Show Status | - | Quick-pick menu with common actions |

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `eywa.supabaseUrl` | Hosted instance | Supabase project URL |
| `eywa.supabaseKey` | Hosted instance | Supabase anon key |
| `eywa.fold` | (empty) | Fold slug to monitor |
| `eywa.logLevel` | `all` | Activity feed filter: `all`, `important` (sessions + knowledge + injections), or `sessions` only |
| `eywa.historyHours` | `24` | How many hours of history to load (1, 6, 24, or 72) |

The Supabase URL and key default to the hosted Eywa instance. You only need to change these if you're self-hosting.

## Links

- [Eywa Web Dashboard](https://eywa-ai.dev)
- [Documentation](https://eywa-ai.dev/docs/vscode)
- [GitHub](https://github.com/a-sumo/eywa)
