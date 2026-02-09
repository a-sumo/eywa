# Eywa

Observability and coordination layer for human + AI teams. Each person on a team directs AI agents that code, decide, and ship autonomously. Eywa gives the team visibility across every agent session so the humans stay aligned.

## Positioning and Copy

- **Eywa is for humans, not agents.** The product helps people coordinate when everyone on the team runs AI. The agents are the amplifier, humans are the steerers.
- **Always lead with the solution, never the problem.** Say what Eywa does. Two sentences, plain language. No cleverness, no negativity, no rhetorical questions. Be 80% accurate and 100% clear. (YC principle: "Socialcam is a mobile app that makes it easy to take videos and share them." No problem setup needed.)
- **No marketing speak.** No superlatives (fastest, first, best). No vague abstractions ("gap in intent"). Describe the product in words a teammate would use.
- **The core insight:** when every team member controls AI agents, small misalignments between people get amplified at machine speed. Eywa makes all agent work visible so humans know what to sync on.

## Project Structure

- `worker/` - Cloudflare Worker MCP server (Streamable HTTP). Supabase PostgREST wrapper, tool registration.
- `web/` - React/Vite web dashboard. Supabase JS SDK, realtime subscriptions.
- `discord-bot/` - Discord bot (discord.js + direct Supabase). 12 slash commands for team observability from chat.
- `eywa-specs/` - Lens Studio project for Snap Spectacles AR panel.
- `vscode-extension/` - VS Code extension: agent tree sidebar, activity feed, context injection, knowledge lens.
- `cli/` - `npx eywa-ai` CLI for zero-auth room setup and agent management.
- `pi-display/` - Raspberry Pi display scripts (e-ink, TFT touch).
- `schema.sql` - Supabase schema (rooms, memories, messages tables).

## Style

- **No em dashes.** Use hyphens, commas, or periods instead. Everywhere: code, comments, user-facing text, docs.
- Write naturally. No corporate/formal AI speak. No filler words, no "leverage", no "streamline", no "ensure".
- Keep it short. Say what you mean.

## Visual Design

See `DESIGN.md` for the full visual design system ("Nightly Aurora" theme).

Key rules for any UI work:
- **Never constant speed.** Always `ease-in-out` or multi-keyframe curves. Things accelerate and decelerate.
- **Each element dances independently.** Different durations (2-7s), different phases. No global sync. Life comes from interplay.
- **Deform, don't just move.** Combine `skewX/Y`, `rotate`, `scale` with `translate`. Lines bend, shapes warp.
- **Layer animations.** Flowing dashes + swaying transform on the same element, different periods.
- **Icons**: Inline SVGs, CSS keyframes, `stroke-dasharray`/`stroke-dashoffset` (ease-in-out, not linear), aurora colors, 2.5px strokes.
- **Fonts**: Plus Jakarta Sans for display/headings (`--font-display`), Inter for body (`--font-sans`).
- **Colors**: Aurora palette (purple/pink/cyan/blue/green) on dark space background. Use CSS vars from `web/src/styles/theme.css`.
- **Landing vs Dashboard**: Landing page is fluid/dancing/alive. Dashboard is interactive/minimal animation.

## Discord Bot

- Lives in `discord-bot/`. Run with `npm start`, deploy commands with `npm run deploy -- <guild_id>`.
- Uses direct Supabase queries, not MCP. Messages from Discord show as `discord/<username>`.
- Slash commands: help, room, status, agents, context, search, recall, inject, inbox, knowledge, learn, msg, destination, course.

## Worker (MCP Server)

- Deployed on Cloudflare Workers. Entry: `worker/src/index.ts`.
- Thin fetch wrapper for Supabase PostgREST (no SDK, just HTTP).
- Agent identity: `{base_name}/{adjective}-{noun}` (e.g. `armand/quiet-oak`).
- Tools: session lifecycle, memory logging, file storage, context queries, collaboration, injection, knowledge base, timeline (git-like), network.
- **Operation tagging**: `eywa_log` accepts optional `system`, `action`, `scope`, `outcome` fields. These propagate to `eywa_context`, `eywa_status`, `eywa_recall`, `eywa_pull`, `eywa_sync`, `eywa_compare`, `eywa_history`.
- **Auto-context**: `eywa_start` returns a room snapshot (active agents, systems, recent activity, injection/knowledge counts).
- **eywa_summary**: Token-efficient compressed room view. Per-agent task, systems, outcomes.
- **Tool annotations**: All tools have `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint` so agent hosts can auto-approve safe reads.
- **Injection piggyback**: Pending injections are appended to every tool response automatically.
- **Context recovery**: Three tools for surviving context exhaustion. `eywa_checkpoint` saves periodic state dumps (task, done, remaining, context, files_changed). `eywa_distress` fires an SOS when context is nearly full, saving state and broadcasting an urgent injection to the room. `eywa_recover` manually checks for unresolved distress signals or checkpoints. `eywa_start` auto-detects distress signals and recent checkpoints (last 2 hours) from the same user, injecting recovery state into the new session.
- **Zero-friction auto-context**: Room context (agents, activity, injections, knowledge, recovery state) is pushed via MCP `instructions` at connection time. Agents get full situational awareness before any tool call, no approval needed.
- **Baton passing**: Hand off work between agents. URL param `?baton=armand/quiet-oak` loads that agent's recent session into the MCP instructions at connection time. Mid-session handoff via `eywa_start({ continue_from: "armand/quiet-oak" })`. The baton agent's last 20 memories are included chronologically.
- **Destination tracking**: `eywa_destination` sets/updates/views the room's target state (point B). Supports milestones with completion tracking. Destination is surfaced in `eywa_start` auto-context, MCP instructions, Gemini steering, HubView banner, OperationsView banner, VS Code LiveView sidebar, and Discord `/destination` + `/course` commands.
- **Progress reporting**: `eywa_progress` lets agents report task completion percentage and current phase (working/blocked/reviewing/testing/deploying). Progress bars display in HubView and OperationsView agent cards. Designed for frequent calls during long tasks.

## Agent Operational Protocol (MUST FOLLOW)

Every agent session must follow this cycle. Completing a task is not the end. Shipping is the beginning.

1. **COMMIT** changes immediately after work is done. Don't accumulate uncommitted files.
2. **LOG** to Eywa via `eywa_log` with `system`, `action`, `scope`, `outcome` fields. Every significant action: file creates, modifications, decisions, errors. If you're not logging, you're invisible.
3. **NOTIFY** other agents via `eywa_inject` (target: `all`). Broadcast what shipped, what changed, what others need to know. Include file paths and route changes.
4. **SCAN** for what needs to be done next. Check `eywa_status`, `eywa_context`, destination milestones via `eywa_destination`. Don't stop after one task.
5. **IDENTIFY PATTERNS** across the room: redundant work (two agents doing the same thing), divergent goals, idle capacity, completion gaps. Flag these via `eywa_log` or `eywa_inject`.
6. **CHECK VISION ALIGNMENT** against `VISION.md`. Is your work converging on the destination? Which milestones moved? Which are stuck? If a milestone completed, update the destination via `eywa_destination`.
7. **UPDATE DOCS** if needed. If vision gaps closed, milestones shifted, or new patterns emerged, update `VISION.md` and `CLAUDE.md`. The docs are live navigation instruments, not static artifacts.

The cost of doing this cycle is 30 seconds. The cost of not doing it is invisible agents, duplicate work, and drift from the destination.

## Supabase

- URL and key in `worker/wrangler.toml` (vars) and `discord-bot/.env`.
- Three tables: `rooms`, `memories`, `messages`.
- `memories.metadata` JSONB stores event type, tags, injection targets, operation metadata (system, action, scope, outcome).
- `memories.message_type`: resource, user, assistant, tool_call, tool_result, injection, knowledge.
- MCP tool names use `eywa_*` prefix (e.g. `eywa_log`, `eywa_start`, `eywa_context`).
- Operation metadata fields: `system` (git, database, api, deploy, filesystem, communication, browser, infra, ci, cloud, terminal, editor), `action` (read, write, create, delete, deploy, test, review, debug, configure, monitor), `scope` (free text), `outcome` (success, failure, blocked, in_progress).
