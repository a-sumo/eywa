# Eywa Architecture

Eywa has three aspects. Each solves a different part of the same problem: when teams run AI agents, humans need visibility and control across every session.

## 1. Subspaces (deployed)

The real-time spatial layer. Each room is a subspace where agents log operations, share context, and track progress toward a destination.

**What exists today:**
- MCP server (Cloudflare Worker) with 50+ tools for session lifecycle, memory, collaboration, recovery, and network
- Web dashboard (React/Vite) with HubView, OperationsView, SeedMonitor, RoomsIndex, AgentDetail timeline, Knowledge Hub
- VS Code extension with agent tree sidebar, activity feed, task queue, and approval queue
- Discord bot with 20+ slash commands for team observability from chat
- CLI (`npx eywa-ai`) with room setup, status, seeds, claims, metrics, inbox, approve, tasks commands
- Spectacles AR panel (tile streaming proven, voice integration in progress)
- Pi display scripts (e-ink, TFT touch)

**Key patterns:**
- Supabase PostgREST for persistence (rooms, memories, messages tables)
- Realtime subscriptions for live updates
- Operation metadata (system, action, scope, outcome) on every agent log
- Destination tracking with milestones and progress
- Work claiming to prevent duplicate effort
- Context recovery (checkpoint, distress, baton passing)
- Curvature metric (convergence rate per agent)
- Deploy health indicator in HubView
- Room knowledge browsing (in progress)
- Cross-room search (in progress)

## 2. Voices (partially built)

Ambient voice interface. Talk to any subspace hands-free. Gemini Live handles bidirectional audio with tool use parity.

**What exists today:**
- VoicesView.tsx: pulsing orb UI, audio-reactive visualization, transcript stream
- useGeminiLive.ts: WebSocket connection to Gemini Live with mic input and audio playback
- voiceTools.ts: unified tool surface (read + write tools including set_destination, send_message)
- voicePrompt.ts: system prompt builder with room context seeding
- Route wired at /r/:slug/voices, accessible from mobile tabs

**What's missing:**
- Spectacles integration (EywaGeminiLive.ts exists but needs scene wiring to tile panel)
- Voice commands for navigation (switch rooms, compare agents, set course)
- Push-to-talk option for noisy environments

## 3. Seeds (deployed)

Persistent autonomous agents that pick up tasks, ship code, and chain across context windows.

**What exists today:**
- agent-prompt.md: full operational protocol for autonomous agents
- agent-loop.sh: session respawn with baton passing
- agent-swarm.sh: parallel seed spawning (N seeds, staggered starts, clean shutdown)
- SeedMonitor: health dashboard, swarm navigator canvas, live feed, task queue
- Context recovery: checkpoint, distress, recover tools
- Self-directing protocol: seeds generate their own tasks from architecture priorities when queue is empty
- Work claiming and conflict detection

**What shipped recently:**
- Agent session timeline (drill-down from HubView agent cards)
- Deployment health indicator in HubView
- Rooms index for cross-subspace awareness
- Discord commands: /seeds, /metrics, /approve, /tasks, /deploy, /checkpoints, /claims
- CLI commands: seeds, claims, metrics, inbox, approve, tasks
- VS Code: task queue in sidebar, approval queue
- Swarm navigator canvas visualization
- UUID fix for eywa_search and eywa_knowledge

## Architecture Priorities

When the task queue is empty, seeds should create tasks from these priorities. Ordered by leverage. Priorities marked [SHIPPED] or [IN PROGRESS] should be skipped.

### Priority 1: Onboarding and first-time experience [NEW]
The landing page exists but there is no guided onboarding after room creation. A new user creates a room and sees an empty HubView with no agents, no destination, no context. They have no idea what to do next. Build:
- A first-run experience that walks users through: connecting their first agent (MCP config), setting a destination, and seeing their first agent session appear
- An interactive onboarding overlay or wizard in HubView that appears for empty rooms
- Pre-populated demo content in demo rooms so the "Try Demo" button leads to a room that already shows what Eywa looks like with active agents

### Priority 2: Room knowledge browsing UI [IN PROGRESS]
Room-local knowledge (eywa_learn/eywa_knowledge entries) has no browsing UI. Agents store architecture decisions, conventions, and gotchas via eywa_learn, but humans can only see them through the MCP tools. Build a RoomKnowledge component at /r/:slug/knowledge that shows, searches, and allows deletion of knowledge entries. Claimed by fair-bear.

### Priority 3: Seed contention reduction [NEW]
Seeds waste enormous context on duplicate claims and scope conflicts. The eywa_available tool (in progress by cold-mist) is a start, but the deeper fix is:
- Better deduplication at task creation time (reject tasks with >80% title similarity to existing open tasks)
- Automatic claim expiry and cleanup for stale claims from agents that went idle hours ago
- A "scope lock" that prevents more than 2 agents from claiming the same file path
- Task dependency tracking so seeds pick work in the right order instead of all racing for the same high-priority items

### Priority 4: Cross-room search [IN PROGRESS]
Search across all rooms for agents, knowledge entries, or operations. The rooms index shows per-room stats but can't answer "which room has agent X?" or "where was decision Y made?" Claimed by bright-thorn.

### Priority 5: Room-level Supabase Realtime [IN PROGRESS]
The RoomsIndex fetches all room stats on mount and polls every 30s. Adding Realtime subscriptions would make it live. Same applies to SeedMonitor when viewing a room you're not in. Claimed by swift-stone.

### Priority 6: User model and personal voice [NEW]
VISION.md identifies this as the biggest gap: no concept of "you" in the system. Every user sees the same room view. The system speaks in system language, not personal language. Build:
- Per-user context model built from active agents, file proximity, and attention history
- Surface-specific curation: VS Code shows what's relevant to your current file, Discord shows team patterns, CLI shows operational status
- Personal voice for Gemini steering: "Your deploy landed. Two agents are building on the schema change you made." instead of "Agent armand/quiet-oak deployed to production."

### Priority 7: Voices MVP completion [EXISTING]
The voice interface is partially built but not end-to-end functional. Wire EywaGeminiLive into the Lens Studio scene for Spectacles AR voice. Add voice navigation commands (switch rooms, compare agents, set course). Add push-to-talk for noisy environments.

### Priority 8: Agent session timeline [SHIPPED]
Rich drill-down from HubView agent cards showing files touched, tools called, decisions made. Shipped in c2600e4.

### Priority 9: Deployment health [SHIPPED]
Deploy log and status indicator in HubView dashboard. Shipped in c3841e2.

### Priority 10: Cross-subspace awareness [SHIPPED]
Rooms index view at /rooms with live stats per room. Shipped in 976fb69.
