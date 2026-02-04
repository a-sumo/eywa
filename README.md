# Remix

Multi-agent shared memory. When multiple coding agents (Claude Code, Cursor, Gemini CLI, etc.) work on the same project, Remix lets them see what each other are doing, pull context across sessions, and detect when threads diverge.

```
                         ┌─────────────────────────┐
  [Claude Code] ──MCP──▶ │                         │
  [Cursor]      ──MCP──▶ │   Cloudflare Worker     │──REST──▶ [Supabase]
  [Gemini CLI]  ──MCP──▶ │   remix-mcp.workers.dev  │              ▲
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
| **Remix 3D** | `/r/:slug/remix3d` | Spatial workspace using React Three Fiber with glass panels |
| **Mini Remix** | `/r/:slug/mini` | Compact 320x480 view with pixel creatures, session blocks, drag-to-context |
| **Team Chat** | `/r/:slug/chat` | Real-time messaging between humans and agents |
| **Layout Agent** | `/r/:slug/layout-agent` | Interactive demo with Gemini-powered layout + gesture recognition |
| **Agent List** | `/r/:slug` (sidebar) | Active/idle agents with last-seen timestamps |
| **Notifications** | (header bell) | Real-time alerts for session completions, injections, connections, knowledge |

### Legacy: Local MCP Server (Python)
**`remix_mcp.py`** - The original stdio-based server. Still works for local/offline use, but the Cloudflare Worker is the primary way to connect now.

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
claude mcp add remix --url "https://remix-mcp.<account>.workers.dev/mcp?room=demo&agent=alpha"
```

**Cursor / Windsurf** (add to MCP config):
```json
{ "mcpServers": { "remix": { "url": "https://remix-mcp.<account>.workers.dev/mcp?room=demo&agent=alpha" } } }
```

**Gemini CLI** (uses `httpUrl`):
```json
{ "mcpServers": { "remix": { "httpUrl": "https://remix-mcp.<account>.workers.dev/mcp?room=demo&agent=alpha" } } }
```

**Older stdio-only clients** (mcp-remote bridge):
```json
{ "mcpServers": { "remix": { "command": "npx", "args": ["mcp-remote", "https://remix-mcp.<account>.workers.dev/mcp?room=demo&agent=alpha"] } } }
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

### 6. Web Dashboard (hosted)

Live demo: [remix-memory.vercel.app](https://remix-memory.vercel.app)

---

## How to use it

### The minimum flow

**Start of session** - tell the system what you're working on:
```
remix_start("Implementing user authentication with JWT")
```

**End of session** - structured completion with status, artifacts, tags, and next steps:
```
remix_done("Added JWT middleware, login/register endpoints, token refresh",
           status="completed",
           artifacts=["src/middleware/auth.ts", "src/routes/login.ts"],
           tags=["feature", "auth"],
           next_steps="Add token refresh endpoint and rate limiting")
```

Or simple stop: `remix_stop("summary")`.

Between those, optionally log key moments with `remix_log()`.

### See what other agents are doing (the main feature)

```
remix_status()
```
```
=== Remix Agent Status ===
  alpha [active] - Implementing user authentication with JWT
    Last seen: 2025-01-15T14:32:00Z
  beta [completed] - Setting up database migrations
    Last seen: 2025-01-15T14:30:00Z
```

### Pull another agent's context into your session

```
remix_pull("alpha")
```
Returns their recent activity so you can see what they did and continue from there.

```
remix_sync("alpha")
```
Returns the full timeline of their current session.

### Push context to another agent

```
remix_inject(target="beta", content="The auth schema changed — use UUID for user_id, not integer", priority="high", label="schema change")
```

The target agent sees it when they check:
```
remix_inbox()
```
```
Inbox (1 injection):
From alpha [HIGH] (schema change):
  The auth schema changed — use UUID for user_id, not integer
```

### Store project knowledge (persists across sessions)

```
remix_learn("API routes use /api/v1 prefix. Auth middleware is applied via app.use(), not per-route.",
            title="API conventions",
            tags=["architecture", "api"])
```

Any agent in any session can query:
```
remix_knowledge(tag="api")
```
```
Knowledge base (1 entry):
**API conventions**
API routes use /api/v1 prefix. Auth middleware is applied via app.use()... {architecture, api}
  — alpha, 2025-01-15T14:32:00Z
```

### Team chat

```
remix_msg("Auth system is done, beta can start on protected routes now")
```

### CLI (terminal access)

```bash
remix status my-project          # see all agent status
remix pull my-project alpha 10   # pull agent context
remix log my-project             # activity feed
remix inject my-project user beta "Focus on the auth module"
remix knowledge my-project       # browse knowledge base
remix learn my-project user "We use camelCase" --title "Naming" --tags convention
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
Real-time messaging powered by Supabase Realtime subscriptions. Messages from agents (via `remix_msg`) and humans appear in the same stream.

---

## Tool Reference

### Session Lifecycle
| Tool | What it does |
|------|-------------|
| `remix_whoami()` | Check your agent name, session, and room |
| `remix_start(task)` | Start a session — others see your current task |
| `remix_stop(summary)` | End session with a summary |
| `remix_done(summary, status, artifacts?, tags?, next_steps?)` | **Structured completion** — status: completed/blocked/failed/partial, with artifacts, tags, and follow-up suggestions |

### Memory & Logging
| Tool | What it does |
|------|-------------|
| `remix_log(role, content)` | Log a key moment (role: user/assistant/resource/tool_call/tool_result) |
| `remix_file(path, content, desc)` | Store a file snapshot — returns a reference ID |
| `remix_get_file(file_id)` | Retrieve a stored file |
| `remix_import(messages, task?)` | Bulk-import a conversation transcript |
| `remix_search(query, limit)` | Search all messages by content |

### Context & Collaboration
| Tool | What it does |
|------|-------------|
| `remix_status()` | All agents, what they're working on, active/idle |
| `remix_pull(agent, limit)` | Another agent's recent memories |
| `remix_sync(agent)` | Full timeline of another agent's current session |
| `remix_context(limit)` | Raw feed of all recent activity |
| `remix_recall(agent, limit)` | Messages from a specific agent |
| `remix_agents()` | List all agents and when last active |

### Context Injection (Push-back)
| Tool | What it does |
|------|-------------|
| `remix_inject(target, content, priority?, label?)` | Push context/instructions to another agent (target: name or "all", priority: normal/high/urgent) |
| `remix_inbox(limit?)` | Check for injections sent to you — call periodically to stay in sync |

### Project Knowledge (Persistent)
| Tool | What it does |
|------|-------------|
| `remix_learn(content, tags?, title?)` | Store persistent knowledge that survives across sessions |
| `remix_knowledge(tag?, search?, limit?)` | Query the knowledge base — filter by tag, search by content |
| `remix_forget(knowledge_id)` | Remove an outdated knowledge entry |

### Messaging
| Tool | What it does |
|------|-------------|
| `remix_msg(content, channel)` | Send a message to team chat |

## CLI Reference

```
remix status <room>                              Show agent status
remix pull <room> <agent> [limit]                Pull agent context
remix log <room> [limit]                         Recent activity feed
remix inject <room> <from> <target> <message>    Inject context to another agent
remix knowledge <room> [search]                  Browse knowledge base
remix learn <room> <agent> <content> [--title T] [--tags t1,t2]
```

**Setup:**
```bash
cd cli && npm install
export REMIX_SUPABASE_URL="https://your-project.supabase.co"
export REMIX_SUPABASE_KEY="your-key"
node bin/remix.mjs status my-room
```

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
message_type text              -- user, assistant, tool_call, tool_result, resource, injection, knowledge
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
remix/
├── README.md
├── schema.sql                  # Supabase schema (rooms, memories, messages)
│
├── worker/                     # Cloudflare Worker — hosted MCP server
│   ├── wrangler.toml
│   ├── package.json
│   └── src/
│       ├── index.ts            # Entry: routing, room lookup, MCP handler
│       ├── lib/
│       │   ├── supabase.ts     # PostgREST fetch wrapper (select, insert, delete)
│       │   └── types.ts        # TypeScript interfaces
│       └── tools/
│           ├── session.ts      # whoami, start, stop, done
│           ├── memory.ts       # log, file, get_file, import, search
│           ├── context.ts      # context, agents, recall
│           ├── collaboration.ts # status, pull, sync, msg
│           ├── inject.ts       # inject, inbox
│           └── knowledge.ts    # learn, knowledge, forget
│
├── web/                        # React dashboard
│   ├── .env                    # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_GEMINI_API_KEY
│   ├── package.json
│   ├── vercel.json
│   └── src/
│       ├── main.tsx            # Entry point
│       ├── App.tsx             # Router setup
│       ├── App.css             # All component styles (light theme)
│       ├── index.css           # Base styles, CSS variables
│       ├── components/
│       │   ├── RoomLayout.tsx      # Layout shell with sidebar
│       │   ├── RoomHeader.tsx      # Room name, connect agent, notifications
│       │   ├── NotificationBell.tsx # Bell icon with real-time dropdown
│       │   ├── ThreadTree.tsx      # Thread list with divergence indicators
│       │   ├── ThreadView.tsx      # Single thread timeline
│       │   ├── RemixView.tsx       # 3-panel remix studio with Gemini chat
│       │   ├── RemixView3D.tsx     # Spatial 3D workspace (React Three Fiber)
│       │   ├── SpatialScene.tsx    # R3F scene with glass panels on arc
│       │   ├── GlassPanel3D.tsx    # Glass-material 3D panel (drei)
│       │   ├── MiniRemix.tsx       # 320x480 compact view with pixel creatures
│       │   ├── MemoryCard.tsx      # Individual memory display
│       │   ├── AgentList.tsx       # Sidebar agent roster + nav
│       │   ├── AgentDetail.tsx     # Agent history deep dive
│       │   ├── Chat.tsx            # Team chat interface
│       │   ├── ConnectAgent.tsx    # MCP connection onboarding
│       │   ├── LayoutAgentDemo.tsx # Gemini layout + gesture demo
│       │   └── Landing.tsx         # Home page
│       ├── hooks/
│       │   ├── useRealtimeMemories.ts  # Realtime subscription for memories
│       │   ├── useNotifications.ts     # Realtime notification events
│       │   ├── useLayoutAgent.ts       # Gemini layout validation
│       │   └── useGestureAgent.ts      # Gemini gesture recognition
│       ├── context/
│       │   └── RoomContext.tsx
│       └── lib/
│           └── supabase.ts             # Supabase client + types
│
├── cli/                        # Terminal CLI
│   ├── package.json
│   └── bin/
│       └── remix.mjs           # status, pull, log, inject, knowledge, learn
│
└── presentation/               # Reveal.js slides (optional)
```

## Data Flow

```
1. Agent connects      MCP Client → POST /mcp?room=demo&agent=alpha → Worker
2. Worker resolves     Room slug "demo" → room_id via Supabase lookup
3. Tool calls          remix_start("task") → Worker inserts into memories table
4. Dashboard reads     Web app subscribes to Supabase Realtime → shows activity live
5. Notifications       session_done/injection/connection events → bell icon updates
6. Cross-agent sync    remix_pull("alpha") → Worker queries memories → returns context
7. Context injection   remix_inject("beta", "use UUID") → beta sees it via remix_inbox()
8. Knowledge           remix_learn("pattern") → persists across sessions → remix_knowledge()
9. Remix analysis      User drags memories into context → Gemini analyzes combined threads
10. CLI access         remix status demo → Supabase query → terminal output
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
