# Remix

Multi-agent shared memory. When multiple coding agents (Claude Code, Cursor, Gemini CLI, etc.) work on the same project, Remix lets them see what each other are doing, pull context across sessions, and detect when threads diverge.

```
                         ┌─────────────────────────┐
  [Claude Code] ──MCP──▶ │                         │
  [Cursor]      ──MCP──▶ │   Cloudflare Worker     │──REST──▶ [Supabase]
  [Gemini CLI]  ──MCP──▶ │   eywa-mcp.workers.dev  │              ▲
                         └─────────────────────────┘              │
                                                        ┌────────┴────────┐
                                                        │  Web Dashboard  │
                                                        │  Thread Tree    │
                                                        │  Remix Studio   │
                                                        │  Gemini Chat    │
                                                        └─────────────────┘
```

---

## Architecture

There are three pieces:

### 1. MCP Server (Cloudflare Worker)
**`worker/`** - A hosted server that any AI agent connects to over HTTP. No local install needed.

- Lives at `https://remix-mcp.<account>.workers.dev/mcp`
- Speaks the MCP protocol (Streamable HTTP + SSE)
- Room + agent identity come from URL params (`?room=demo&agent=alpha`)
- Stateless - all data stored in Supabase
- Built with `@modelcontextprotocol/sdk` + Cloudflare `agents` package

### 2. Supabase (Database)
**`schema.sql`** - Three tables:

| Table | Purpose |
|-------|---------|
| `rooms` | Isolated workspaces (each room has a slug like `demo`) |
| `memories` | Everything agents log - session starts/stops, messages, file snapshots |
| `messages` | Team chat between humans and agents |

Realtime subscriptions enabled so the web dashboard updates live.

### 3. Web Dashboard (React)
**`web/`** - Shows all agent activity, team chat, remix studio, and Gemini-powered analysis in real time.

- Reads directly from Supabase (same database the worker writes to)
- Vite + React + TypeScript
- Light theme with Mulish font, cream cards, periwinkle accent

Key views:

| View | Route | What it does |
|------|-------|-------------|
| **Thread Tree** | `/r/:slug` | All agent sessions as expandable threads with divergence indicators |
| **Thread View** | `/r/:slug/thread/:agent/:session` | Single thread timeline with memory cards |
| **Remix Studio** | `/r/:slug/remix/new` | 3-panel workspace: browse → context → Gemini chat |
| **Team Chat** | `/r/:slug/chat` | Real-time messaging between humans and agents |
| **Agent List** | `/r/:slug` (sidebar) | Active/idle agents with last-seen timestamps |

### Legacy: Local MCP Server (Python)
**`eywa_mcp.py`** - The original stdio-based server. Still works for local/offline use, but the Cloudflare Worker is the primary way to connect now.

---

## Quick Start

### 1. Supabase (one-time)

1. Create a project at [supabase.com](https://supabase.com)
2. SQL Editor → paste and run `schema.sql`
3. Database → Replication → enable Realtime for `memories` and `messages`
4. Copy Project URL and service role key from Settings → API

### 2. Connect an AI agent

**Claude Code** (one command):
```bash
claude mcp add neuralmesh --url "https://remix-mcp.<account>.workers.dev/mcp?room=demo&agent=alpha"
```

**Cursor / Windsurf** (add to MCP config):
```json
{ "mcpServers": { "neuralmesh": { "url": "https://remix-mcp.<account>.workers.dev/mcp?room=demo&agent=alpha" } } }
```

**Gemini CLI** (uses `httpUrl`):
```json
{ "mcpServers": { "neuralmesh": { "httpUrl": "https://remix-mcp.<account>.workers.dev/mcp?room=demo&agent=alpha" } } }
```

**Older stdio-only clients** (mcp-remote bridge):
```json
{ "mcpServers": { "neuralmesh": { "command": "npx", "args": ["mcp-remote", "https://remix-mcp.<account>.workers.dev/mcp?room=demo&agent=alpha"] } } }
```

Change `?room=` and `?agent=` to match your workspace and agent name.

### 3. Web Dashboard

```bash
cd web
cp .env.example .env   # add your Supabase URL + anon key + Gemini API key
npm install
npm run dev            # opens localhost:5173
```

Environment variables:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_GEMINI_API_KEY=your-gemini-api-key   # for Remix Studio chat
```

### 4. Deploy the Worker (if self-hosting)

```bash
cd worker
npm install
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_KEY
npx wrangler deploy
```

### 5. Presentation

```bash
cd presentation
# Open index.html in a browser - uses reveal.js CDN
# Or serve locally:
npx serve .
```

Hosted at: [neural-mesh-public.vercel.app](https://neural-mesh-public.vercel.app)

---

## How to use it

### The minimum flow

**Start of session** - tell the system what you're working on:
```
eywa_start("Implementing user authentication with JWT")
```

**End of session** - summarize:
```
eywa_stop("Added JWT middleware, login/register endpoints, token refresh")
```

Between those, optionally log key moments with `eywa_log()`.

### See what other agents are doing (the main feature)

```
neuralmesh_status()
```
```
=== Remix Agent Status ===
  alpha [active] - Implementing user authentication with JWT
    Last seen: 2025-01-15T14:32:00Z
  beta [active] - Setting up database migrations
    Last seen: 2025-01-15T14:30:00Z
```

### Pull another agent's context into your session

```
neuralmesh_pull("alpha")
```
Returns their recent activity so you can see what they did and continue from there.

```
neuralmesh_sync("alpha")
```
Returns the full timeline of their current session.

### Team chat

```
neuralmesh_msg("Auth system is done, beta can start on protected routes now")
```

---

## Web Dashboard Features

### Thread Tree
The main view groups all memories by agent and session. Each thread shows the agent name, task description, memory count, and time range. Threads are expandable - click to see the full memory timeline, or click through to the dedicated thread view.

### Thread Divergence Detection
When multiple agents work on related tasks, threads can diverge - one agent heads in a different direction from others. The dashboard detects this automatically using **Jaccard similarity** on tokenized thread content:

1. Each thread's content is tokenized (lowercased, split into words)
2. Pairwise comparison across different agents using set intersection/union
3. Divergence = 1 - similarity
4. Classified as: **low** (<40%), **medium** (40–70%), **high** (>70%)

Threads with >30% cross-agent divergence show a colored indicator bar:
- Green bar = low divergence (threads still aligned)
- Amber bar = medium divergence (starting to bifurcate)
- Red bar = high divergence (significantly different directions)

This helps teams catch when an agent has gone off-track before the gap becomes too large.

### Remix Studio
A 3-panel workspace for curating and analyzing memories across threads:

```
┌──────────────┬──────────────┬──────────────────────┐
│  Browse      │  Context     │  Gemini Terminal     │
│  Memories    │  (drop zone) │                      │
│              │              │  Ask questions about │
│  Search...   │  Drag here   │  the assembled       │
│              │              │  context              │
│  ▶ alpha     │  alpha (3)   │                      │
│    mem 1  +  │    mem 1  ×  │  > What patterns do  │
│    mem 2  +  │    mem 2  ×  │    you see?          │
│    mem 3  +  │    mem 3  ×  │                      │
│  ▶ beta      │              │  The threads show... │
│              │  History     │                      │
│              │  v0 - Start  │  [input] [Send]      │
│              │  v1 - +3 mem │                      │
└──────────────┴──────────────┴──────────────────────┘
```

- **Left panel**: Browse all memories organized by thread. Search, expand threads, drag individual memories or click "+" to add, or "Add entire thread" to pull a whole conversation.
- **Middle panel**: The assembled context. Drop zone accepts dragged memories/threads. Shows memories grouped by agent with remove buttons. Version history lets you rewind to any previous state.
- **Right panel**: Gemini 2.0 Flash chat terminal. The assembled context is injected as a system prompt. Ask questions, compare threads, get summaries - Gemini sees everything in the context panel.

### Team Chat
Real-time messaging powered by Supabase Realtime subscriptions. Messages from agents (via `neuralmesh_msg`) and humans appear in the same stream.

---

## Tool Reference

### Session
| Tool | What it does |
|------|-------------|
| `eywa_whoami()` | Check your agent name, session, and room |
| `eywa_start(task)` | Start a session - others see your current task |
| `eywa_stop(summary)` | End session with what you accomplished |

### Logging
| Tool | What it does |
|------|-------------|
| `eywa_log(role, content)` | Log a key moment (role: user/assistant/resource/tool_call/tool_result) |
| `eywa_file(path, content, desc)` | Store a file snapshot - returns a reference ID |
| `eywa_get_file(file_id)` | Retrieve a stored file |
| `eywa_search(query, limit)` | Search all messages by content |

### Context
| Tool | What it does |
|------|-------------|
| `neuralmesh_status()` | All agents, what they're working on, active/idle |
| `neuralmesh_pull(agent, limit)` | Another agent's recent memories |
| `neuralmesh_sync(agent)` | Full timeline of another agent's current session |
| `eywa_context(limit)` | Raw feed of all recent activity |
| `eywa_recall(agent, limit)` | Messages from a specific agent |
| `eywa_agents()` | List all agents and when last active |

### Messaging
| Tool | What it does |
|------|-------------|
| `neuralmesh_msg(content, channel)` | Send a message to team chat |

---

## Data Model

### `rooms`
```sql
id          uuid PRIMARY KEY
slug        text UNIQUE         -- human-readable name ("demo", "project-x")
created_at  timestamptz
```

### `memories`
```sql
id           uuid PRIMARY KEY
room_id      uuid → rooms(id)
agent        text              -- agent name ("alpha", "cursor-1")
session_id   text              -- groups memories into sessions
message_type text              -- session_start, session_end, user, assistant, tool_call, tool_result, resource, file
content      text              -- the actual content
metadata     jsonb             -- flexible: file paths, descriptions, IDs
ts           timestamptz       -- when it happened
```

### `messages`
```sql
id         uuid PRIMARY KEY
room_id    uuid → rooms(id)
sender     text              -- agent name or "human"
content    text
channel    text DEFAULT 'general'
ts         timestamptz
```

---

## File Structure

```
eywa/
├── README.md
├── schema.sql                  # Supabase schema (rooms, memories, messages)
├── eywa_mcp.py                 # Legacy local MCP server (stdio)
│
├── worker/                     # Cloudflare Worker - hosted MCP server
│   ├── wrangler.toml
│   ├── package.json
│   └── src/
│       ├── index.ts            # Entry: routing, room lookup, MCP handler
│       ├── lib/
│       │   ├── supabase.ts     # PostgREST fetch wrapper
│       │   └── types.ts        # TypeScript interfaces
│       └── tools/
│           ├── session.ts      # whoami, start, stop
│           ├── memory.ts       # log, file, get_file, search
│           ├── context.ts      # context, agents, recall
│           └── neuralmesh.ts   # status, pull, sync, msg
│
├── web/                        # React dashboard
│   ├── .env                    # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_GEMINI_API_KEY
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── main.tsx            # Entry point
│       ├── App.tsx             # Router setup
│       ├── App.css             # All component styles (light theme)
│       ├── index.css           # Base styles, CSS variables, Mulish font
│       ├── components/
│       │   ├── RoomLayout.tsx  # Layout shell with nav tabs
│       │   ├── ThreadTree.tsx  # Thread list with divergence indicators
│       │   ├── ThreadView.tsx  # Single thread timeline
│       │   ├── RemixView.tsx   # 3-panel remix studio with Gemini chat
│       │   ├── MemoryCard.tsx  # Individual memory display (compact/expanded)
│       │   ├── AgentList.tsx   # Sidebar agent roster
│       │   └── ChatPanel.tsx   # Team chat interface
│       ├── hooks/
│       │   ├── useRealtimeMemories.ts  # Supabase realtime subscription for memories
│       │   ├── useRealtimeMessages.ts  # Supabase realtime subscription for messages
│       │   └── useGeminiChat.ts        # Gemini 2.0 Flash REST API chat hook
│       ├── context/
│       │   └── RoomContext.tsx          # Room state provider
│       └── lib/
│           ├── supabase.ts             # Supabase client + types
│           └── threadSimilarity.ts     # Jaccard-based divergence detection
│
├── presentation/               # Reveal.js slides
│   ├── index.html              # Slide deck shell
│   ├── data.js                 # Slide content (JS objects with HTML diagrams)
│   └── render.js               # Data → reveal.js section renderer
│
└── Spectacles Observer/        # AR visualization (Snap Spectacles, optional)
```

## Data Flow

```
1. Agent connects      MCP Client → POST /mcp?room=demo&agent=alpha → Worker
2. Worker resolves     Room slug "demo" → room_id via Supabase lookup
3. Tool calls          eywa_start("task") → Worker inserts into memories table
4. Dashboard reads     Web app subscribes to Supabase Realtime → shows activity live
5. Cross-agent sync    neuralmesh_pull("alpha") → Worker queries memories → returns context
6. Remix analysis      User drags memories into context → Gemini analyzes combined threads
7. Divergence check    Dashboard computes Jaccard similarity → shows colored indicators
```

Every query is scoped to the room, so different teams/projects stay isolated.

## Thread Similarity Algorithm

The divergence detection in `web/src/lib/threadSimilarity.ts` works as follows:

```
tokenize(text)
  → lowercase, split on non-alphanumeric, filter short words
  → Set<string> of unique tokens

jaccard(setA, setB)
  → |A ∩ B| / |A ∪ B|
  → 1.0 = identical, 0.0 = completely different

threadSimilarity(threadA, threadB)
  → concatenate all memory content per thread
  → tokenize each → jaccard

divergenceLevel(score)
  → < 0.4  = "low"    (green)
  → 0.4–0.7 = "medium" (amber)
  → > 0.7  = "high"   (red)

findDivergentThreads(allThreads, threshold=0.3)
  → pairwise comparison across different agents only
  → returns pairs exceeding threshold
```

## Technology Stack

| Component | Technology |
|-----------|-----------|
| MCP Server | Cloudflare Workers, `@modelcontextprotocol/sdk`, `agents` |
| Database | Supabase (PostgreSQL + Realtime + PostgREST) |
| Web Dashboard | React 18, TypeScript, Vite, React Router |
| AI Chat | Gemini 2.0 Flash (REST API) |
| Presentation | Reveal.js |
| Styling | Custom CSS, Mulish font, light theme |
| AR (optional) | Snap Spectacles / Lens Studio |
