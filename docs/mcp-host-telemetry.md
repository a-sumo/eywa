# MCP Host Telemetry

**Status:** Draft proposal
**Author:** Eywa (eywa-ai.dev)
**Date:** 2026-02-10

## Problem

When AI agents run long tasks (10+ minutes), the humans steering them have no visibility into what's happening inside the agent host. Is it thinking? Compacting context? Waiting for API response? Dispatching sub-agents? The agent itself can't report this because the events happen below its tool-calling layer. A stuck agent can't tell you it's stuck.

Current MCP defines tools (agent calls server) and notifications (server pushes to agent). There's no standard for the **host** (Claude Code, Cursor, Windsurf, etc.) to emit lifecycle telemetry to connected MCP servers.

## Proposal

Extend MCP with a set of well-known **client-to-server notifications** that agent hosts SHOULD emit to all connected MCP servers. These are lightweight, fire-and-forget signals. MCP servers that don't care ignore them. Observability servers like Eywa use them to give humans real-time visibility.

This is backwards-compatible. Hosts that don't implement it continue working. Servers that don't handle them continue working. The notifications use the existing MCP client-to-server notification mechanism.

## Notification Types

### `notifications/host.heartbeat`

Periodic signal that the host is alive and working. Recommended interval: every 60 seconds during active work.

```json
{
  "phase": "working | thinking | compacting | waiting_approval | idle | error",
  "tokens_used": 45000,
  "tokens_limit": 200000,
  "tool_calls_total": 23,
  "elapsed_seconds": 482,
  "current_task": "Refactoring auth module"
}
```

Fields:
- `phase` (required): Current host state
  - `working`: Agent is generating output or calling tools
  - `thinking`: Extended thinking / chain-of-thought in progress
  - `compacting`: Context window being compressed or summarized
  - `waiting_approval`: Tool call pending human approval
  - `idle`: Agent finished, waiting for next input
  - `error`: Host encountered an error (API timeout, rate limit, etc.)
- `tokens_used` (optional): Total tokens consumed in this session (input + output)
- `tokens_limit` (optional): Context window limit for the model
- `tool_calls_total` (optional): Number of tool calls made this session
- `elapsed_seconds` (optional): Seconds since session started
- `current_task` (optional): Brief description of current work

### `notifications/host.compacting`

Emitted when the host starts compressing the context window. This is a critical event because the agent loses context and may behave differently after compaction.

```json
{
  "tokens_before": 180000,
  "tokens_after": 45000,
  "messages_dropped": 47,
  "reason": "approaching_limit"
}
```

### `notifications/host.subagent_spawned`

Emitted when the host spawns a sub-agent (e.g., Claude Code's Task tool).

```json
{
  "subagent_id": "task_abc123",
  "subagent_type": "Explore",
  "task": "Search for authentication middleware",
  "model": "haiku"
}
```

### `notifications/host.subagent_completed`

Emitted when a sub-agent finishes.

```json
{
  "subagent_id": "task_abc123",
  "duration_seconds": 12,
  "outcome": "success | error | timeout",
  "tokens_used": 3200
}
```

### `notifications/host.token_pressure`

Emitted when token usage crosses a threshold (e.g., 50%, 75%, 90% of limit).

```json
{
  "tokens_used": 150000,
  "tokens_limit": 200000,
  "percent": 75,
  "threshold": "high"
}
```

### `notifications/host.error`

Emitted on infrastructure-level errors that the agent can't report itself.

```json
{
  "error_type": "api_timeout | rate_limit | connection_lost | auth_failure",
  "message": "API request timed out after 30s",
  "retrying": true,
  "retry_count": 2
}
```

## Pragmatic Fallback: Agent-Side Heartbeat

Until hosts implement these notifications natively, agents can approximate some of this via a tool call. Eywa provides `eywa_heartbeat` for this purpose. Agents should call it periodically during long tasks.

```
eywa_heartbeat({
  phase: "working",
  tokens_used: 45000,
  detail: "Writing auth middleware, 3 files modified"
})
```

This is less precise than host-level telemetry (the agent can't report compaction or sub-agent dispatch because those happen outside its control), but it provides a baseline liveness signal.

## Implementation for MCP Servers

Servers that want to receive host telemetry should register notification handlers:

```typescript
server.setNotificationHandler("notifications/host.heartbeat", (params) => {
  // Store/surface the heartbeat data
});

server.setNotificationHandler("notifications/host.compacting", (params) => {
  // Alert: agent is losing context
});
```

## Implementation for Agent Hosts

Hosts that want to emit telemetry should send client-to-server notifications to all connected MCP servers:

```typescript
// Periodic heartbeat
mcpClient.sendNotification("notifications/host.heartbeat", {
  phase: "working",
  tokens_used: getCurrentTokenCount(),
  tokens_limit: getModelLimit(),
  tool_calls_total: getToolCallCount(),
  elapsed_seconds: getElapsedSeconds(),
});

// On context compaction
mcpClient.sendNotification("notifications/host.compacting", {
  tokens_before: beforeCount,
  tokens_after: afterCount,
  messages_dropped: dropped,
  reason: "approaching_limit",
});
```

## Why This Matters

A team running 5 agents across 3 coding tools has zero cross-tool visibility. Each tool shows its own status bar, in its own window, with its own format. The human has to mentally track all of them. With host telemetry flowing to a shared MCP server, one dashboard shows the real-time state of every agent regardless of which tool runs it.

This turns agent hosts from black boxes into observable systems.

## Design Principles

1. **Fire and forget.** Notifications don't expect responses. Hosts should never block on telemetry delivery.
2. **All fields optional except phase.** Hosts emit what they can. Partial data is better than no data.
3. **No authentication required.** Telemetry flows over the existing MCP connection. No extra auth.
4. **Backwards compatible.** Hosts that don't emit and servers that don't listen continue working exactly as before.
5. **Low overhead.** Heartbeats at 60-second intervals add negligible traffic.
