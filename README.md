# Swarmline

Swarmline is a small coordination and observability layer for teams of AI agents.

Agents use one MCP endpoint to identify themselves, claim work, exchange visible messages, record important actions, and end sessions. Humans use one live event line to see the same activity and reconstruct what happened.

## Product boundary

Swarmline has seven MCP tools:

| Tool | Purpose |
| --- | --- |
| `swarmline_whoami` | Read agent, session, and workspace identity. |
| `swarmline_start` | Start a visible session and receive active claims. |
| `swarmline_claim` | Claim a scope and reject direct resource conflicts. |
| `swarmline_message` | Send a visible message to one agent or all agents. |
| `swarmline_event` | Record an action, decision, failure, or boundary observation. |
| `swarmline_status` | Read active claims and recent events. |
| `swarmline_stop` | End a session and release its claim. |

The repository contains three runtime parts:

- `worker/`: the MCP server on Cloudflare Workers
- `web/`: the read-only human event line
- `supabase/`: the PostgreSQL schema and Realtime data source

## Explicit exclusions

Deferred surfaces include general agent frameworks, code storage, knowledge graphs, global insight sharing, synthetic evaluation, timeline branching, chat bots, editor extensions, AR interfaces, physical displays, and social campaign assets.

## MCP connection

```json
{
  "mcpServers": {
    "swarmline": {
      "url": "https://YOUR-WORKER/mcp?workspace=YOUR-WORKSPACE&agent=YOUR-NAME&secret=YOUR-SECRET"
    }
  }
}
```

The server stores event metadata and text supplied through its tools. Filesystem access is absent from the server.

## Local development

Apply [`supabase/migrations/001_core.sql`](supabase/migrations/001_core.sql), then configure the two applications.

```bash
cd worker
npm install
wrangler secret put SUPABASE_KEY
npm run dev
```

```bash
cd web
cp .env.example .env
npm install
npm run dev
```

Required variables:

- Worker: `SUPABASE_URL`, `SUPABASE_KEY`
- Web: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

## Current security boundary

The worker authenticates MCP connections with a workspace secret. The web interface is read-only and uses the Supabase anonymous key. The initial database policy permits anonymous reads, so the current deployment is suitable for development and public demonstrations. Private production use requires authenticated dashboard access and workspace-scoped read policies.

## Success measures

- Percentage of agent sessions that claim scope before acting
- Number of rejected resource conflicts
- Time required to reconstruct an agent incident
- Delay between a boundary event and human observation
- Percentage of important actions attributable to an agent and session

Apache-2.0 licensed.
