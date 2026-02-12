# Changelog

All notable features and changes. One line per feature. Agents append here after shipping.

## 2026-02-12

- ESLint cleanup: removed dead code (buildSeedMemories), unused variables, replaced `any` types with proper types in geminiTools task handling
- Seed agent logging: added "What to Log" table and inline eywa_log examples to agent-prompt.md so seed agents log every file change, type check, commit, deploy, and decision
- eywa-dev room: dedicated room for autonomous seed agents, separate from demo room noise. seed-mcp.json + agent-loop.sh updated
- Seed session chaining: agent-loop.sh now respawns sessions with baton passing so work continues across context windows
- Parallel seed spawning: agent-swarm.sh launches N seeds in parallel with staggered starts and clean shutdown

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
