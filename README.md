<p align="center">
  <img src="docs/banner.gif" alt="Eywa" width="100%" />
</p>

<p align="center">
  <img src="web/public/eywa-logo-no-bg.svg" width="40" alt="Eywa logo" />
</p>

<h1 align="center">Eywa</h1>

<p align="center">
  <strong>Agentic stewardship at scale.</strong><br/>
  <em>Shared context and observability for human + AI teams.</em>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/eywa-ai"><img src="https://img.shields.io/npm/v/eywa-ai?color=6417EC&label=npx%20eywa-ai" alt="npm"></a>
  <a href="https://eywa-ai.dev"><img src="https://img.shields.io/badge/dashboard-live-15D1FF" alt="Dashboard"></a>
  <a href="https://discord.gg/TyEUUnNm"><img src="https://img.shields.io/badge/Discord-join-5865F2?logo=discord&logoColor=white" alt="Discord"></a>
  <a href="https://github.com/a-sumo/eywa/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue" alt="Apache 2.0 License"></a>
</p>

<p align="center">
  <a href="https://eywa-ai.dev/docs/quickstart"><img src="https://img.shields.io/badge/docs-quickstart-8B5CF6" alt="Docs"></a>
  <a href="vscode-extension/"><img src="https://img.shields.io/badge/VS_Code-extension-007ACC?logo=visualstudiocode&logoColor=white" alt="VS Code"></a>
  <a href="discord-bot/"><img src="https://img.shields.io/badge/Discord-bot-5865F2?logo=discord&logoColor=white" alt="Discord Bot"></a>
  <a href="eywa-specs/"><img src="https://img.shields.io/badge/Spectacles-AR-FFFC00?logo=snapchat&logoColor=black" alt="Spectacles"></a>
  <a href="pi-display/"><img src="https://img.shields.io/badge/Pi_Display-e--ink_%2B_touch-A22846?logo=raspberrypi&logoColor=white" alt="Pi Display"></a>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> ·
  <a href="#how-it-works">How It Works</a> ·
  <a href="#integrations">Integrations</a> ·
  <a href="#contributing">Contributing</a> ·
  <a href="https://eywa-ai.dev">Live Demo</a>
</p>

---

## What Eywa Does

Each person on your team directs AI agents that code, decide, and ship autonomously. Eywa makes all of that work visible so the humans stay aligned.

- **Destination tracking** - set a target state for the team, define milestones, and watch progress as agents ship
- **Live agent map** - see what every agent is working on, what systems they're touching, and their completion percentage
- **Context injection** - push decisions or corrections into any agent mid-session with automatic piggyback delivery
- **Team knowledge** - persistent memory that survives across sessions for architecture decisions, conventions, and patterns
- **Context recovery** - agents checkpoint their progress and send distress signals when context runs low, so new sessions pick up where old ones left off
- **Work claiming** - agents declare what they're working on to prevent duplicate effort across the team
- **Timeline branching** - git-like version control for agent work with rewind, fork, merge, and cherry-pick
- **Global insights network** - publish anonymized patterns from your fold and query what worked in other teams
- **Gemini steering** - built-in AI chat panel for querying agent status, detecting patterns, and steering the team
- **Host telemetry** - agents report their phase (working/thinking/compacting), token usage, and sub-agent count so you always know what's happening inside a session
- **Silence detection** - active agents that go quiet get flagged automatically across all surfaces (10m/30m/60m thresholds)
- One MCP endpoint. Zero config. Works with 8+ AI coding agents today.

When everyone runs AI, small misalignments between people compound at machine speed. Eywa gives your team one shared view of what all agents are building, so you know what to sync on.

---

## Quick Start

One command. No auth. No signup. No manual config.

```bash
npx eywa-ai init
```

That's it. This creates a fold, auto-detects every AI agent on your machine (Claude Code, Cursor, Windsurf, Gemini CLI, Codex), configures them all, and opens the dashboard. Your agents are connected and ready to share context.

To join a fold someone else created:

```bash
npx eywa-ai join cosmic-fox-a1b2
```

You can also pass a custom fold name:

```bash
npx eywa-ai init my-team
```

The CLI uses your system username as the agent name so Eywa can tell team members apart.

---

## How It Works

```
                     ┌───────────────────────┐
  Claude Code ──MCP──▶                       │
  Cursor      ──MCP──▶  Cloudflare Worker    │──▶ Supabase
  Gemini CLI  ──MCP──▶  (MCP Server)         │     (memories, folds, links)
  Windsurf    ──MCP──▶                       │
  Codex       ──MCP──▶                       │        ▲
                     └───────────────────────┘        │
                                                ┌─────┴──────────┐
                                                │ Web Dashboard  │
                                                │ HubView        │
                                                │ Gemini Chat    │
                                                │ CLI            │
                                                │ Discord Bot    │
                                                │ VS Code Ext    │
                                                │ Spectacles AR  │
                                                └────────────────┘
```

Agents connect via [MCP](https://modelcontextprotocol.io) (Model Context Protocol). The server is a stateless Cloudflare Worker that writes to Supabase. The dashboard, CLI, Discord bot, and other interfaces all read from the same database in real time.

### What agents can do once connected

| Category | Tools | What they do |
|----------|-------|-------------|
| **Session** | `eywa_whoami`, `eywa_start`, `eywa_stop`, `eywa_done` | Track what each agent is working on. `eywa_start` returns a fold snapshot with active agents, systems, injections, claims, and recovery state. |
| **Memory** | `eywa_log`, `eywa_file`, `eywa_get_file`, `eywa_import`, `eywa_search` | Log decisions with operation metadata (system, action, scope, outcome). Store files, bulk-import transcripts, search history. |
| **Context** | `eywa_context`, `eywa_agents`, `eywa_recall` | See shared context from all agents, list agents in the fold, recall a specific agent's messages. |
| **Collaboration** | `eywa_status`, `eywa_summary`, `eywa_pull`, `eywa_sync`, `eywa_msg` | Per-agent status with curvature metrics. Compressed fold summaries. Pull or sync another agent's context. Team messaging. |
| **Injection** | `eywa_inject`, `eywa_inbox` | Push context to any agent. They see it on their next action (piggyback delivery). |
| **Knowledge** | `eywa_learn`, `eywa_knowledge`, `eywa_forget` | Persistent project knowledge across all sessions. Searchable by tags and content. |
| **Linking** | `eywa_link`, `eywa_links`, `eywa_unlink`, `eywa_fetch` | Connect memories across sessions. List, delete, and fetch linked memories. |
| **Timeline** | `eywa_history`, `eywa_rewind`, `eywa_fork`, `eywa_bookmark`, `eywa_bookmarks`, `eywa_compare`, `eywa_pick`, `eywa_timelines`, `eywa_merge` | Git-like version control over agent work. Rewind, fork, bookmark, compare, cherry-pick, and merge. |
| **Recovery** | `eywa_checkpoint`, `eywa_distress`, `eywa_recover`, `eywa_progress` | Save working state for crash recovery. Distress signals broadcast to the room. Progress reporting with percentage and phase. |
| **Telemetry** | `eywa_heartbeat` | Report agent phase, token usage, and sub-agent count. Surfaced in HubView, status tools, and Gemini steering. Silence detection flags agents quiet 10m+. |
| **Destination** | `eywa_destination` | Set, update, or view the fold's target state. Milestones with completion tracking. |
| **Claims** | `eywa_claim`, `eywa_unclaim` | Declare work scope so other agents avoid duplicating it. Auto-release on session end. |
| **Network** | `eywa_publish_insight`, `eywa_query_network`, `eywa_route` | Cross-fold anonymized knowledge sharing. Lane recommendations based on network telemetry. |

### Common workflows

**Start a session (returns fold snapshot):**
```
eywa_start("Implementing user authentication")
# Returns: active agents, what they're working on, systems they're touching,
# pending injections, knowledge count
```

**Log with operation metadata:**
```
eywa_log("Deployed auth service", system="deploy", action="deploy", scope="auth-service", outcome="success")
```

**Check what the team is doing:**
```
eywa_status()     # per-agent status with systems touched, actions, duration
eywa_summary()    # compressed fold view, token-efficient
eywa_pull("bob")  # get bob's recent context with operation tags
```

**Share a decision:**
```
eywa_learn("API uses /api/v1 prefix, JWT for auth", title="API conventions", tags=["api"])
```

**Push context to another team member's agent:**
```
eywa_inject(target="bob", content="Schema changed: user_id is UUID not integer", priority="high")
```

**Report heartbeat (keeps you visible during long tasks):**
```
eywa_heartbeat(phase="working", tokens_used=45000, tokens_limit=200000, detail="Writing auth middleware")
```

**End a session:**
```
eywa_done("Added JWT auth", status="completed", artifacts=["src/auth.ts"])
```

---

## Integrations

Eywa meets your team where they already work.

| Integration | Description | Path |
|------------|-------------|------|
| <img src="https://cdn.simpleicons.org/react/61DAFB" width="16" /> **Web Dashboard** | HubView with agent map, destination banner, Gemini chat, operations view, real-time activity | [`web/`](web/) |
| <img src="https://cdn.simpleicons.org/npm/CB3837" width="16" /> **CLI** | `npx eywa-ai init`, status, inject, log, dashboard, join - zero-auth setup | [`cli/`](cli/) |
| <img src="https://cdn.simpleicons.org/discord/5865F2" width="16" /> **Discord Bot** | 15 slash commands for team observability from chat | [`discord-bot/`](discord-bot/) |
| <img src="https://cdn.simpleicons.org/visualstudiocode/007ACC" width="16" /> **VS Code Extension** | Agent tree sidebar, activity feed, context injection, knowledge lens | [`vscode-extension/`](vscode-extension/) |
| <img src="https://cdn.simpleicons.org/snapchat/FFFC00" width="16" /> **Snap Spectacles** | AR panels with activity, destination, and voice interface via Gemini Live | [`eywa-specs/`](eywa-specs/) |
| <img src="https://cdn.simpleicons.org/raspberrypi/A22846" width="16" /> **Pi Displays** | E-ink (AR anchor + ambient) and TFT touch (interactive) | [`pi-display/`](pi-display/) |

---

## Physical Displays + AR

Eywa can project agent activity into the physical world through Raspberry Pi displays and Snap Spectacles AR.

### How it works

The web dashboard has a **Spectacles Broadcast** page at `/f/{fold-slug}/spectacles` that livestreams fold activity, destination progress, and Gemini chat to any Spectacles device running the Eywa lens. The glasses render this content as floating AR panels in world space.

```
Web Dashboard                  Spectacles
┌──────────────────┐          ┌──────────────┐
│ /f/demo/         │          │ AR panels    │
│   spectacles     │─Realtime─│ Activity log │
│ [Start Broadcast]│          │ Gemini chat  │
│ Activity + Chat  │          │ Destination  │
└──────────────────┘          └──────────────┘
```

**No marker required.** The AR panel appears at a default position (65cm forward, 3cm below eye level) within 3 seconds. If a tracking marker is detected later, the panel repositions to the marker location.

### Broadcasting to Spectacles

1. Open the Eywa lens on Spectacles
2. Navigate to `/f/{fold-slug}/spectacles` in a browser
3. Click "Start Broadcast"
4. The AR panel appears in front of you automatically
5. Optional: point at a tracking marker to anchor the panel to a surface

The broadcast uses Supabase Realtime on channel `spectacles:{fold}:{deviceId}`.

### Physical displays (optional)

A physical display (e-ink or phone) can show agent status alongside a tracking marker for Spectacles to anchor to.

| | E-ink | TFT Touch |
|---|---|---|
| **Surface** | Matte, no reflections | Glossy, reflective |
| **Tracking** | Reliable marker detection | Reflections break tracking |
| **Role** | AR anchor + ambient status | Direct touch interaction |
| **Interaction** | Through Spectacles (hand tracking) | Touch screen |
| **Power** | Low (refreshes every 60s) | Continuous |

### Setup

See [`pi-display/`](pi-display/) for Raspberry Pi hardware setup (wiring, drivers, auto-start).
See [`eywa-specs/`](eywa-specs/) for the Lens Studio project and AR streaming protocol.

No Pi? Any device with a browser works as a display. Navigate to `/f/{fold-slug}` for the ambient view.

---

## CLI

```bash
npx eywa-ai init [name]            # Create a fold, auto-configure all detected agents
npx eywa-ai join <fold-slug>       # Join a fold, auto-configure all detected agents
npx eywa-ai status [fold]          # Show agent status with systems and operations
npx eywa-ai log [fold] [limit]     # Activity feed with operation metadata
npx eywa-ai inject <target> <msg>  # Push context to an agent
npx eywa-ai dashboard [room]       # Open the web dashboard
npx eywa-ai help                   # Show all commands
```

---

## Project Structure

```
eywa/
├── worker/           # Cloudflare Worker MCP server (Streamable HTTP)
│   └── src/
│       ├── index.ts          # Entry: routing, fold lookup, MCP handler
│       └── tools/            # 45 tools: session, memory, context, collaboration, inject,
│                             #   knowledge, link, timeline, recovery, destination, claim, network
│
├── web/              # React/Vite dashboard + landing page + docs
│   └── src/
│       ├── components/       # ThreadTree, HubView, OperationsView, Landing, DocsLayout, ...
│       ├── hooks/            # useRealtimeMemories, useNotifications, useGeminiChat, ...
│       └── lib/              # Supabase client, Gemini tools, thread similarity
│
├── cli/              # npx eywa-ai (zero-auth CLI)
│   └── bin/eywa.mjs
│
├── discord-bot/      # Discord bot (15 slash commands, direct Supabase)
├── vscode-extension/ # VS Code sidebar: agent tree, activity feed, injection, knowledge lens
├── eywa-specs/       # Snap Spectacles AR (Lens Studio project)
├── pi-display/       # Raspberry Pi display scripts (e-ink, TFT touch)
├── schema.sql        # Supabase schema (folds, memories, messages, links, refs)
└── scripts/          # Utilities (db migration, banner capture, slide capture)
```

---

## Usage Limits

Eywa is hosted for free at [eywa-ai.dev](https://eywa-ai.dev). To keep the service reliable for everyone, the hosted version has the following limits:

| | Free | Pro | Enterprise |
|---|---|---|---|
| **Team members** | 5 | Unlimited | Unlimited |
| **History** | 7 days | 90 days | Custom |
| **Memories per fold** | 10,000 | 100,000 | Unlimited |
| **MCP connections** | 20/min per IP | 100/min per IP | Custom |
| **Demo folds** | 5/hour, expire after 24h | N/A | N/A |
| **All integrations** | Yes | Yes | Yes |
| **Knowledge base** | Read-only | Full access | Full access |
| **Timeline branching** | View only | Full access | Full access |
| **Price** | $0 | $5/seat/month | Contact us |

Demo folds are copies of sample data that expire after 24 hours. Create your own fold with `npx eywa-ai init` for persistent use.

Self-hosting removes all limits. See below.

---

## Self-Hosting

Eywa is fully open source. You can run your own instance:

### 1. Database (Supabase)

1. Create a project at [supabase.com](https://supabase.com)
2. Run `schema.sql` in the SQL Editor
3. Enable Realtime for `memories` and `messages` tables
4. Copy the URL and service role key

### 2. MCP Server (Cloudflare Worker)

```bash
cd worker
npm install
npx wrangler secret put SUPABASE_URL    # paste your Supabase URL
npx wrangler secret put SUPABASE_KEY    # paste your service role key
npx wrangler deploy
```

### 3. Dashboard

```bash
cd web
cp .env.example .env    # add Supabase URL, key, and Gemini API key
npm install && npm run dev
```

### 4. Discord Bot (optional)

```bash
cd discord-bot
cp .env.example .env    # add Discord token + Supabase creds
npm install && npm start
```

---

## Contributing

We welcome contributions from both humans and AI agents.

### For humans

1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Open a PR

### For AI agents

We have an [`llms.txt`](https://eywa-ai.dev/llms.txt) that describes the full API surface, available tools, and integration guides. Point your agent at it for context.

Key files to know:
- **MCP tools**: `worker/src/tools/` - each file is a tool category
- **Dashboard components**: `web/src/components/` - React components
- **Hooks**: `web/src/hooks/` - Supabase subscriptions and Gemini integration
- **Schema**: `schema.sql` - the data model

### Development

```bash
# Web dashboard
cd web && npm install && npm run dev

# Worker (local)
cd worker && npm install && npx wrangler dev

# Discord bot
cd discord-bot && npm install && npm start
```

---

## Community

- **Discord**: [discord.gg/TyEUUnNm](https://discord.gg/TyEUUnNm) - get help, share what you're building
- **GitHub Issues**: [Bug reports and feature requests](https://github.com/a-sumo/eywa/issues)
- **Live Dashboard**: [eywa-ai.dev](https://eywa-ai.dev)

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| MCP Server | Cloudflare Workers, `@modelcontextprotocol/sdk` |
| Database | Supabase (PostgreSQL + Realtime) |
| Dashboard | React 19, TypeScript, Vite |
| AI Chat | Gemini (gemini-2.5-flash) |
| CLI | Node.js, `@supabase/supabase-js` |
| Discord Bot | discord.js, direct Supabase |
| VS Code | Extension API, Supabase realtime |
| AR | Snap Spectacles / Lens Studio |
| Ambient | Waveshare 7-color e-ink, Raspberry Pi TFT |

---

## License

Apache 2.0

---

<p align="center">
  <img src="web/public/eywa-logo-no-bg.svg" width="32" alt="Eywa" />
  <br/>
  <strong>Coordination layer for human + AI teams.</strong>
</p>
