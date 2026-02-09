# Agent-Centric Visibility Implementation Plan

## Problem
Eywa's MCP server treats agent tool responses as formatted text blobs. Agents land blind on connection, can't distinguish reads from writes, and have no structured way to report what systems they're operating on. The data model supports rich metadata via JSONB, but the tools don't ask for it, so agents don't provide it, and nothing downstream can surface it.

## Changes

### 1. Operation-type fields on eywa_log (memory.ts)
Add optional structured fields so agents can tag what they're doing:
- `system`: git, database, api, deploy, filesystem, communication, browser, infra, ci, cloud, terminal, editor
- `action`: read, write, create, delete, deploy, test, review, debug, configure, monitor
- `scope`: free text ("users table", "auth service", "main branch")
- `outcome`: success, failure, blocked, in_progress

Stored in `metadata` JSONB. No schema migration needed.

### 2. Auto-context on eywa_start (session.ts)
When an agent calls eywa_start, return a room snapshot:
- Active agents with current tasks
- Recent activity (last 5 items, compressed)
- Pending injection count
- Knowledge entry count

Agent lands with full situational awareness instead of blind.

### 3. MCP tool annotations (all tool files)
Add `readOnlyHint`, `destructiveHint`, `idempotentHint` to every tool.
Agent hosts (Claude Code, Cursor, etc) use these to auto-approve safe reads.

### 4. Enriched eywa_status (collaboration.ts)
Show per agent:
- Systems being touched (from operation metadata)
- Recent action types
- Session duration
- Operation count

### 5. Operation metadata in eywa_context (context.ts)
Context lines include operation tags when present:
```
[armand/quiet-oak] assistant: Fixed auth bug  [git:write:success]
```

### 6. New eywa_summary tool (collaboration.ts)
Token-efficient compressed room view:
- Per-agent summaries (task, systems, outcomes)
- Knowledge count
- Unresolved injection count
- Designed for agents with limited context windows

## Files Modified
- `worker/src/tools/memory.ts` - operation fields on eywa_log
- `worker/src/tools/session.ts` - auto-context on eywa_start
- `worker/src/tools/context.ts` - operation metadata in eywa_context
- `worker/src/tools/collaboration.ts` - enriched eywa_status + eywa_summary
- `worker/src/tools/inject.ts` - tool annotations
- `worker/src/tools/knowledge.ts` - tool annotations
- `worker/src/tools/link.ts` - tool annotations
- `worker/src/tools/timeline.ts` - tool annotations
- `worker/src/tools/network.ts` - tool annotations

## No DB changes needed
All operation metadata goes into the existing `metadata` JSONB column on the `memories` table.
