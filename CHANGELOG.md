# Changelog

All notable features and changes. One line per feature. Agents append here after shipping.

## 2026-02-14

- Task dedup: eywa_task now rejects new tasks with fuzzy title matching (50%+ word overlap), not just exact matches
- eywa_available: pre-flight tool that cross-references open tasks against active claims, showing which tasks are uncontested vs contested
- Spectacles drag interaction: pinch-and-drag panning on navigator map tile, cursor rendering on broadcast canvas, double-decode fix for base64 textures
- Spectacles 3-tile streaming: scene ops create map/button/log quads on connect, async JPEG encoding pipeline for non-blocking broadcast at 15-25fps
- Landing page: removed memory section, updated docs and llms.txt for honest privacy model
- Privacy overhaul: honest trust model in docs and landing copy, CLI consent flow, tool classification with readOnlyHint/destructiveHint annotations
- Bug fixes: auto-reload on stale chunk load after deploy, gitignore .mcp.json to prevent leaking fold secrets, hide GitHub stars when count is zero, hide Map/Spectacles behind dev flag, realistic agent names in demo
- Fix: removed duplicate setAutoContextError call in useGeminiChat, added missing error handler in useLiveTelemetry fold lookup
- Landing features grid: consolidated from 10 cards to 6 focused pillars (removed Timeline, Network, Telemetry, and surface-specific cards; added Agent Resilience and Works Everywhere)
- CLI init: connection test verifies MCP server reachability after setup, Codex config failures now reported instead of silently swallowed, corrupted config.json warns instead of silently resetting

## 2026-02-13

- Spectacles voice wiring: SpectaclesView now receives voice_input, voice_response, and voice_inject events from EywaGeminiLive on Spectacles, displaying transcripts and injection confirmations as an overlay on the navigator map

## 2026-02-12

- Quick-start terminal section: new "Running in 30 seconds" section on landing page wiring the animated TerminalDemo between Gemini and pricing sections, with link to quickstart docs
- Animated terminal demo: `npx eywa-ai init` onboarding flow plays as a typing animation in the "How Eywa works" section, showing agent detection, room creation, and MCP configuration
- Landing page social proof: stats strip below hero showing Open Source, 40+ MCP Tools, 9 Agent Integrations, 5 Surfaces, and live GitHub stars count fetched from the API
- DemoBanner conversion CTA: demo rooms now show a banner with "Create Your Room" button, dismiss persistence, aurora-themed styling, integrated into RoomLayout
- Code splitting: lazy-load all non-landing routes via React.lazy + Suspense, reducing initial JS bundle from 985KB to 472KB (52% smaller)
- ConnectAgent onboarding: added Windsurf and Codex client support with correct config formats, paths, and setup scripts. Fixed CLI Codex init to use TOML instead of JSON.
- Landing page visual proof: animated dashboard mockup showing agent cards with live status, destination banner with progress, and activity stream
- useChat error handling: fetch and insert errors now surfaced via `error` state so consumers can display them
- useGeminiChat auto-context fallback: Promise.allSettled so individual tool failures don't break auto-context, graceful degradation when API is down
- Hook error display: ThreadTree, OperationsView, Feed, and Chat now show Supabase query errors instead of silently failing
- AppHeader demo error: "Try Demo" button now shows creating state and error messages
- Gemini auto-context fallback UI: HubView and WorkspaceView show notice when room context is unavailable

- ESLint cleanup: removed dead code (buildSeedMemories), unused variables, replaced `any` types with proper types in geminiTools task handling
- Seed agent logging: added "What to Log" table and inline eywa_log examples to agent-prompt.md so seed agents log every file change, type check, commit, deploy, and decision
- eywa-dev room: dedicated room for autonomous seed agents, separate from demo room noise. seed-mcp.json + agent-loop.sh updated
- Seed session chaining: agent-loop.sh now respawns sessions with baton passing so work continues across context windows
- Parallel seed spawning: agent-swarm.sh launches N seeds in parallel with staggered starts and clean shutdown
- Seed health dashboard: aggregate stats (success rate, throughput, efficiency) and per-seed success rate bars in SeedMonitor
- Self-directing seeds: protocol and knowledge base entries so seeds auto-generate tasks when the queue is empty
- Swarm navigator: real-time animated canvas in SeedMonitor showing seeds as orbiting particles with trails, success rate arcs, and operation ripple effects
- Discord /tasks command: list, create, and update tasks from chat. Subcommands for filtering by status, creating with priority/milestone, and updating status/notes with partial ID matching
- Rooms index: cross-subspace awareness at /rooms showing all rooms with live stats, destination progress, and active agent counts
- Global nav: added "Rooms" link to AppHeader so users can discover /rooms from any page
- VS Code task visibility: task queue now visible in the extension sidebar with priority badges, status pills, assignees, and real-time updates
- Discord /approve command: view pending approvals, approve or deny agent requests from chat with /approve list, /approve yes, /approve no
- Deploy health: HubView now shows deployment status indicator with last deploy time, outcome, and expandable log of all recent deploys by agent
- Scope lock: eywa_claim rejects claims when a file already has 2 active claimants, preventing 10+ agents piling onto the same file
- Stale claim cleanup: claims from agents idle 30+ minutes auto-expire from getActiveClaims, reducing zombie claims that block other seeds
- Room knowledge browsing: tabbed knowledge page at /r/:slug/knowledge with search, delete, and tag filtering
- CLI claims command: `eywa claims` shows active work claims with agent, scope, files, and timestamp. Matches Discord /claims visibility from the terminal
- Discord /metrics command: team curvature, per-agent curvature rankings, throughput (ops/hr), success rate, convergence/divergence counts over a 2-hour window
- Destination editor: HubView now has inline editing for destinations. Edit button on existing destination, "Set Destination" button when empty. Supports destination text, milestones (one per line), and notes
- CLI seeds command: `eywa seeds` shows seed health metrics from terminal. Active/stalled/finished counts, success rate, throughput, efficiency, and per-seed status with silence detection
- CLI approve command: `eywa approve` lists pending approval requests, `eywa approve yes/no <id>` resolves them with agent notification. Partial ID matching, risk level display
- Discord /seeds command: seed health metrics from chat. Active/stalled/finished counts, success rate, throughput, efficiency, per-seed status with silence detection and health warnings
- Fix: eywa_search now returns full UUIDs instead of truncated 8-char IDs. eywa_knowledge now includes entry IDs so eywa_forget actually works
- Discord /checkpoints command: view seed checkpoints and distress signals from chat. Filter by type (all, distress only, checkpoints only), shows task/done/remaining state, unresolved distress count
- Discord /deploy command: view deployment health and recent deploys from chat. `/deploy list` shows recent deploys with outcome/scope/agent, `/deploy health` shows 24h aggregate stats with per-target breakdown
- Agent session timeline: AgentDetail view now shows categorized timeline (files, git, deploys, decisions, errors, injections) with summary stats and filter tabs
- NavigatorMap auto-sync: stable room IDs instead of creating new rooms each sync, periodic refresh based on seed activity
- Agent prompt: added strategic mandate, vision document references, web browsing guidance, and expanded self-directing protocol
- Architecture priorities v2: updated ARCHITECTURE.md with new priorities (onboarding, seed contention, user model). Marked shipped items, tagged in-progress work
- New destination: "First-time experience that converts curiosity into understanding within 30 seconds" with 5 milestones for conversion focus
- Demo room enhancement: per-agent session IDs, work claims with file paths, task queue entries, telemetry heartbeats, detailed 90-minute activity timeline, cross-agent injections, destination with progress notes
- Landing page trust section: three cards (metadata only, open source, self-hostable) with data flow visualization showing what Eywa sees vs what stays local
- Landing page memory persistence: animated crystal icon, three value props (permanence, structure, ownership) drawing from VISION.md storage narrative
- Landing page memory persistence: narrative section about stored context, permanence, structured knowledge, and data ownership with animated crystal icon
- Landing page trust and security: three-card section (metadata only, open source, self-hostable) with data flow visualization showing what Eywa sees vs what stays local
- Onboarding overlay: three-step wizard for empty rooms (connect agent, set destination, wait for first session) with progress indicators and Nightly Aurora styling
- UX fix: onboarding overlay dismissal now persists to localStorage so users don't see it again on page refresh
- UX fix: added Ops tab to mobile navigation so Operations view is discoverable on small screens
- Gemini chat: exposed `available` flag from useGeminiChat hook for graceful degradation when API key is missing
- Worker reliability: replaced 10 silent catch blocks with console.error logging across session.ts, index.ts. Added UUID validation to link and approval tools. Added insert verification for approval and link creation
- Catch-all 404 route: unknown URLs now show a styled NotFound page with navigation links instead of a blank screen
- RoomsIndex graceful degradation: per-room try-catch so one failing Supabase query shows safe defaults instead of crashing the whole page
- useRealtimeMemories error state: hook now exposes query errors so consuming components can display them
- Integration guide fixes: Codex now shows correct TOML config format instead of JSON, Cline points to cline_mcp_settings.json via extension UI, Cursor shows both global and project config paths, Windsurf and Cline docs URLs updated

## 2026-02-10

- MCP Host Telemetry spec: proposed MCP extension for agent hosts to emit lifecycle notifications (heartbeat, compacting, subagent_spawned, token_pressure, error). Published at docs/mcp-host-telemetry.md.
- eywa_heartbeat tool: agents report phase, token usage, sub-agent count. Stored as telemetry message type. Surfaced in HubView agent cards, eywa_status, buildInstructions, and Gemini steering.
- Silence detection: HubView agent cards show how long active agents have been quiet (10m warn, 30m high, 60m critical). Gemini steering and worker auto-context also surface silence.
- Auto-configure agents on init/join with CI/CD pipeline
- Switch license from MIT to Apache 2.0
- CLI 0.3.1 published to npm

## 2026-02-09

- VS Code extension: horizontal timeline graph replaces avatar strip
- Discord: /claims command, updated /help
- Onboarding flow for empty rooms
- Landing page polish and mobile responsive
- Spectacles voice interface: Gemini Live with Eywa room context (EywaGeminiLive)
- Spectacles broadcast UI (SpectaclesView tile streaming)
- Demo room factory: each visitor gets their own seeded room
- Gemini chat persists to localStorage across page reloads
- Two-column HubView: Gemini chat panel on left, dashboard on right
- Unified command bar merging Gemini steering and inject
- Network effect routing: cross-room lane recommendations
- VS Code agent decorations and session tree panel
- Proactive knowledge surfacing and duplicate destination prevention
- Work claim system (eywa_claim/eywa_unclaim) to prevent duplicate agent effort
- Context pressure monitoring: warnings at 30/50/70 tool calls
- Docs overhaul: 8 website docs pages, all READMEs updated

## 2026-02-08

- Gemini steering agent with 6 tools (get_agent_status, get_thread, inject_message, get_destination, detect_patterns, get_distress_signals)
- HubView as default route with destination banner, agent cards, progress bars, activity stream
- eywa_progress tool for real-time task completion reporting
- Context recovery: eywa_checkpoint, eywa_distress, eywa_recover tools
- Baton passing: hand off work between agent sessions via eywa_start({ continue_from })
- Zero-friction auto-context via MCP instructions field
- Curvature metric: momentum vs drag per agent from operation metadata
- Destination tracking with milestone completion (eywa_destination)
- Operation tagging: system/action/scope/outcome metadata on eywa_log
- eywa_summary tool for token-efficient room snapshots
- MCP tool annotations (readOnlyHint, destructiveHint, etc.) for auto-approval

## 2026-02-07

- Discord bot: 15 slash commands for team observability from chat
- Pi display scripts (e-ink, TFT touch)
- Spectacles tile streaming pipeline (OffscreenCanvas to Supabase Realtime to quad materials)

## 2026-02-06

- Injection system (eywa_inject) with target-based routing
- Knowledge base (eywa_learn, eywa_knowledge)
- Session lifecycle tools (eywa_start, eywa_done, eywa_stop)
- Context tools (eywa_context, eywa_recall, eywa_pull, eywa_sync)
- Timeline tools (eywa_compare, eywa_history, eywa_fetch)

## 2026-02-05

- Readable agent names: armand/quiet-oak format
- XR layout agent demo (Quest 3, Vision Pro, Spectacles)
- VS Code extension with agent tree sidebar and activity feed
- CLI login and agent management

## 2026-02-04

- Thread overview with compact cards and divergence toasts
- Connect Agent onboarding with copy-paste MCP configs
- eywa_import tool and two-step onboarding
- Inject, done, knowledge, notifications, CLI tools
- Gemini model fallback on 429 rate limit

## 2026-02-03

- Initial commit: multi-agent shared memory with Supabase
- Cloudflare Worker MCP server
- React/Vite web dashboard
