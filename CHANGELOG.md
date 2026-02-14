# Changelog

All notable changes to Eywa are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-02-14

### Added
- **ROI dollar costs**: Landing page value props section now shows weekly dollar costs ($690 without vs $45 with Eywa) and a monthly savings banner ($2,580/month) to make ROI concrete for budget-holders.
- **Task dependencies**: `depends_on` field on `eywa_task` enables DAG-aware scheduling. `eywa_pick_task` rejects claims when dependencies are unmet. `eywa_available` shows blocked vs ready tasks.
- **eywa_available tool**: Pre-flight check cross-references open tasks against active claims. Returns ready, contested, and blocked counts so agents pick uncontested work.
- **Fuzzy task deduplication**: Jaccard word similarity (threshold: 0.5) rejects near-duplicate task titles at creation time.
- **Scope lock**: Files with 2+ active claimants reject new claims via `eywa_claim`.
- **Stale claim expiry**: Claims auto-expire after 30 minutes of agent inactivity.
- **Webhook bridge**: `POST /webhook` accepts inbound events from external systems (GitHub, Slack) and creates tasks in the target fold.

### Changed
- **Bundle splitting**: Lazy-load Landing page and split vendor deps (react, supabase, i18n, d3) into separate chunks. Main bundle reduced from 1172KB to 832KB (29%). Landing page only loads when visiting `/`.
- **Removed unused three.js dependencies**: Dropped `three`, `@react-three/fiber`, `@react-three/drei`, `@react-three/xr`, and `@types/three` (95 packages, never imported).
- **Bounded all unbounded queries**: `eywa_status` (24h window, 500 rows, filters stale idle agents), `eywa_agents` (24h window, 500 rows, active/recent split), `eywa_sync` (100 row cap). Previously these scanned all memories with no limit.
- **Compressed eywa_start snapshot**: Agent list filtered to last 1h (was all-time, 184 stale agents). Tasks capped at top 5 by priority with overflow count. Claims only shown on conflict, not listed in full.
- **Knowledge deduplication**: `eywa_learn` checks existing entries for exact content match, same title, or prefix similarity before inserting. Duplicates update the existing entry instead of creating new rows.
- **Description truncation**: `eywa_status` truncates agent descriptions to 120 chars.
- **Similarity dedup**: Extracted duplicated `extractWords`/`wordSimilarity` from task.ts and claim.ts into shared `lib/similarity.ts`.

### Fixed
- VS Code: useRef type error in OnboardingOverlay.
- Worker: `buildInstructions` now uses `Promise.allSettled` so one failing query degrades gracefully instead of voiding all agent context.
- DemoBanner: "Create your fold" button now uses the shared `useFold` hook, which stores the fold secret in localStorage. Previously the secret was lost, breaking share URLs and agent auth.

## [0.3.0] - 2026-02-12

### Added
- **VS Code extension**: Task tree sidebar with status groups and priority sorting. Approval queue view. Inline agent decorations showing who's working where.
- **Discord bot**: `/seeds`, `/metrics`, `/deploy`, `/checkpoints`, `/approve`, `/tasks`, `/claims` commands for team observability from chat.
- **CLI commands**: `eywa seeds`, `metrics`, `inbox`, `approve`, `tasks`, `claims` for terminal workflows.
- **Onboarding wizard**: Three-step overlay for new folds (connect agent, set destination, wait for first session).
- **ConnectAgent**: Supports 6 clients with correct config formats and paths (Claude Code, Cursor, Gemini CLI, Windsurf, Codex, Cline). CLI Codex init fixed to use TOML instead of JSON.
- **Web error handling**: 404 catch-all route, Supabase query error states in all hooks, Gemini API fallback with Promise.allSettled, network failure recovery in ThreadTree/OperationsView/Feed/Chat.
- **Landing page**: Visual proof section (animated dashboard mockup), social proof stats strip with live GitHub stars, trust and security section, memory persistence narrative, animated terminal demo, quick-start section.
- **DemoBanner**: Conversion CTA with "Create Your Room" button and aurora-themed styling.
- **Destination editor**: Inline editing in HubView for destinations, milestones, and notes.
- **Deploy health indicator**: Last deploy time, outcome, and recent deploy log in HubView.

### Changed
- **Code splitting**: Lazy-loaded routes reduced landing page initial bundle from 985KB to 472KB (52%).
- **Hero copy**: Solution-first framing ("Coordinate your AI agents. Shared memory across the team.").
- **Features grid**: Consolidated from 10 cards to 6 pillars (removed Timeline, Network, Telemetry; added Agent Resilience and Works Everywhere).
- **Mobile responsive header**: Hamburger menu for narrow viewports, Ops tab added to mobile nav.
- **README**: CLI section expanded from 7 commands to all 18, organized by category.

### Fixed
- Integration guide: Codex shows correct TOML config, Cline points to correct settings file, Cursor shows both config paths.
- Worker: 10 silent catch blocks replaced with console.error logging. UUID validation added to link and approval tools.
- Auto-reload on stale chunk load after deploy.
- Gitignore .mcp.json to prevent leaking fold secrets.
- Duplicate setAutoContextError call in useGeminiChat.
- eywa_search returns full UUIDs instead of truncated 8-char IDs.

## [0.2.0] - 2026-02-10

### Added
- **Seed agents**: `agent-loop.sh` (respawning loop with baton handoff) and `agent-swarm.sh` (parallel seed launcher). Self-directing protocol so seeds generate tasks when the queue is empty.
- **Destinations**: `eywa_destination` sets target state with milestones and tracks completion. All agents see the same goal.
- **Approval queue**: `eywa_request_approval` for risky operations. Humans approve from dashboard, Discord, CLI, or VS Code.
- **Work claims**: `eywa_claim` declares scope and files. Conflict detection warns on overlap at session start.
- **Heartbeat and silence detection**: `eywa_heartbeat` reports phase and token usage. HubView shows silence duration (10m warn, 30m high, 60m critical).
- **Context injection**: `eywa_inject` pushes decisions into any agent session with priority levels (normal, high, urgent).
- **Checkpoints and distress**: `eywa_checkpoint` saves state. `eywa_distress` broadcasts when context runs low. New sessions auto-recover.
- **Curvature metric**: Weighted score (momentum - drag) * signal measuring how operations bend toward the destination.
- **Gemini steering**: Chat panel in HubView with 6 tools for real-time agent oversight and pattern detection.
- **Knowledge base**: `eywa_learn` / `eywa_knowledge` / `eywa_forget` for persistent cross-session memory.
- **Global insights**: `eywa_publish_insight` / `eywa_query_network` for cross-fold anonymized learnings.
- **Privacy model**: Tools classified as coordination (always shared), context (explicit), or code (explicit). CLI consent flow.
- **Seed health dashboard**: Aggregate stats, per-seed success rate bars, and swarm navigator canvas in SeedMonitor.
- **MCP Host Telemetry spec**: Proposed extension for agent hosts to emit lifecycle notifications.

### Changed
- License switched from MIT to Apache 2.0.
- CLI published to npm as `eywa-ai@0.3.1`.
- HubView is now the default route.

## [0.1.0] - 2026-02-05

### Added
- **MCP server**: Cloudflare Workers with 40+ tools for agent coordination.
- **Web dashboard**: React/Vite with real-time Supabase subscriptions.
- **Folds**: Isolated workspaces with shared memory. `npx eywa-ai init` creates a fold and configures all agents.
- **Session tools**: `eywa_start`, `eywa_stop`, `eywa_done`, `eywa_log` for structured logging with operation metadata.
- **Context tools**: `eywa_context`, `eywa_recall`, `eywa_pull`, `eywa_sync` for cross-agent awareness.
- **Timeline**: `eywa_history`, `eywa_rewind`, `eywa_fork`, `eywa_merge`, `eywa_bookmark`, `eywa_compare` for git-like session management.
- **Live agent map**: Real-time visualization of agent activity, operations, and thread overview.
- **i18n**: 7 languages (EN, FR, ES, DE, ZH, JA, PT).
- **Landing page**: "Nightly Aurora" design system with live agent activity from the eywa-dev fold.
- **CLI**: `npx eywa-ai init` for zero-config onboarding. `eywa join`, `eywa share` for team setup.
- **VS Code extension**: Agent tree sidebar, session timeline, activity feed.
- **Discord bot**: 15 slash commands for team observability.
- **Spectacles AR**: Spatial interface with tile streaming, voice integration, and navigator map.
- **Readable agent names**: `armand/quiet-oak` format (user/adjective-noun).
- **Connect Agent**: Copy-paste MCP config onboarding for new folds.

[0.4.0]: https://github.com/a-sumo/eywa/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/a-sumo/eywa/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/a-sumo/eywa/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/a-sumo/eywa/releases/tag/v0.1.0
