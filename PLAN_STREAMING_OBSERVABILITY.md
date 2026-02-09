# Plan: Streaming Observability

## Goal
Replace the flat memory list with a real-time operations dashboard. When a user opens the web dashboard, they should see EXACTLY what each agent is doing RIGHT NOW, with streaming progress.

## Current State
- `useRealtimeMemories` subscribes to INSERT on `memories` table, caps at 50
- `useRealtimeAgents` refetches ALL memories on every INSERT (N^2 problem)
- ThreadTree groups by agent::session_id, shows status/task/duration
- No per-task progress tracking. No streaming. Just flat chronological memories.

## What to Build

### 1. New Component: `OperationsView.tsx`
A real-time operations dashboard that replaces ThreadTree as the primary view.

Shows:
- **Per-agent cards** with: current task, status (active/idle/finished), systems being touched, operation count, duration
- **Live operation stream** per agent: each eywa_log shows as a streaming line item with system:action:outcome badges
- **Progress indicators**: based on operation flow (started -> working -> completed pattern)
- **Expandable**: click agent card to see full operation history for current session

Data source: Same `useRealtimeMemories` hook but rendered differently. Group by agent, show most recent session's operations.

### 2. Upgrade `useRealtimeMemories` hook
- Add incremental agent state updates instead of full refetch
- Track per-agent operation metadata (systems, actions, outcomes) in a Map
- On each INSERT: update only the affected agent's state
- Expose: `agentStates: Map<string, AgentOperationState>`

```typescript
interface AgentOperationState {
  agent: string;
  status: 'active' | 'idle' | 'finished';
  currentTask: string;
  systems: Set<string>;
  actions: Set<string>;
  opCount: number;
  outcomes: { success: number; failure: number; blocked: number };
  lastSeen: string;
  sessionId: string;
  recentOps: Array<{content: string; system?: string; action?: string; outcome?: string; ts: string}>;
}
```

### 3. Real-time Operation Cards in MemoryCard
- Already have system/action/scope/outcome badges (just shipped)
- Need: streaming animation when new operations arrive (slide-in, highlight)
- Need: auto-scroll to latest operation per agent

### 4. Spectacles Tile Updates
- Add operation-aware tiles to SpectaclesView
- Each active agent gets a tile showing: task, system, last operation, outcome
- Tiles update in real-time as operations stream in

## Files to Modify
- `web/src/hooks/useRealtimeMemories.ts` - Add AgentOperationState tracking
- `web/src/components/OperationsView.tsx` - NEW: real-time operations dashboard
- `web/src/components/ThreadTree.tsx` - Add operations tab/toggle
- `web/src/App.tsx` or router - Wire up OperationsView
- `web/src/styles/` - Styles for operation cards

## Definition of Done
- Open dashboard, see per-agent live operation stream
- New eywa_log entries appear instantly with system:action:outcome badges
- Agent cards show current task, systems touched, operation counts
- Expanding an agent shows full session operation history
- Works on mobile
