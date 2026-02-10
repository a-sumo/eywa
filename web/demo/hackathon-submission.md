## Elevator Pitch

Eywa shows your whole team what every AI agent is doing, so people stay aligned when work moves at machine speed.

## About the Project

(copy everything below this line into the field)

## Inspiration

When every person on a team runs AI agents, small misalignments between people get amplified at machine speed. One person's agent refactors a module while another's agent is building on it. Nobody finds out until both context windows are spent and the code conflicts. We built Eywa because we kept losing hours of agent work to collisions that a shared view would have caught in seconds.

## What it does

Eywa is an observability layer for human + AI teams. It connects to any AI agent through MCP (Model Context Protocol) and gives the whole team a live view of what every agent is doing, what systems they're touching, and whether they're converging on the same goal.

Gemini acts as the steering layer. It watches the swarm in real time, detects patterns (redundant work, diverging directions, stuck agents), tracks progress toward a team destination, and surfaces what matters through a chat panel on the web dashboard.

The system spans five surfaces: a web dashboard with a live agent topology map, a VS Code extension showing nearby agent activity inline, a Discord bot for team coordination from chat, a CLI for zero-auth setup, and Snap Spectacles AR glasses with live tile streaming from the dashboard.

## How we built it

The core is a Cloudflare Worker running 45 MCP tools over Streamable HTTP, backed by Supabase (PostgREST + Realtime). Every agent that connects gets auto-context at connection time: active agents, recent activity, pending messages, the team destination, and active work claims. No setup, no approval prompts.

Gemini 3 Flash powers the web steering panel with 7 tools: agent status, thread history, knowledge base, pattern detection (LLM-based semantic analysis via Gemini 2.5 Flash), distress signals, destination tracking, and global network queries. It auto-fetches room context on mount and proactively alerts when it spots problems.

Gemini 2.0 Flash Live powers the Spectacles voice interface with bidirectional audio streaming. It fetches room context from Supabase on init, takes voice input at 16kHz, and responds with spoken summaries at 24kHz. It can also inject messages into the room on voice command.

The Spectacles display uses tile streaming: the web dashboard renders agent cards to an OffscreenCanvas, encodes them as JPEGs, and broadcasts them over Supabase Realtime. The Spectacles app subscribes, decodes, and applies the textures to AR quads in your field of view.

## Challenges we ran into

Agent context windows dying mid-task was the biggest one. An agent would be 70% through a complex change, run out of context, and all that work state would vanish. We built a three-layer recovery system: periodic checkpoints, distress signals that broadcast to the room when context runs low, and baton passing so a new session can pick up exactly where the old one left off.

Work duplication was the second big challenge. With multiple agents running in parallel, two would often start the same task independently. We added a claim system where agents declare their scope and files before starting, and every new agent sees active claims at connection time.

On the Spectacles side, Lens Studio's scripting environment has its own constraints. The SupabaseClient package needs specific auth handling, and getting stable bidirectional audio through Gemini Live on-device required careful buffer management.

## Accomplishments that we're proud of

We dogfooded Eywa to build Eywa. The project was built by swarms of AI agents coordinating through the system itself, often 10+ agents running in parallel across the codebase. The commit history shows agents detecting conflicts, injecting context to each other, and course-correcting in real time. The destination milestone tracker went from 0% to 88% in a few days of swarmed development.

The zero-friction onboarding is real. `npx eywa-ai` creates a room and gives you an MCP config to paste into Claude Code. No accounts, no API keys, no setup. Agents start logging within seconds.

Getting Gemini Live voice working on Spectacles with live room context is something we're genuinely excited about. You put on AR glasses and have a spoken conversation about what your agent swarm is doing while the dashboard tiles float in your field of view.

## What we learned

Observability alone is insufficient. Agents need a shared destination (point B) and real-time progress measurement against it. Without that, you get high activity but low convergence. Adding destination tracking and a curvature metric (are agents converging or diverging?) changed the swarm's behavior dramatically.

The network effect compounds fast. When agents share anonymized learnings across rooms, new agents in new projects get routing recommendations based on what worked elsewhere. 

Context is the most precious resource in agent systems. Every tool call, every file read, every decision consumes context window. The infrastructure needs to be ruthlessly efficient about what gets loaded and when. Auto-context at connection time, injection piggyback on tool responses, and compressed summaries all exist because raw context is expensive.

## What's next for Eywa

The Spectacles 2D navigation map. Right now we stream dashboard tiles to AR, but the vision is a spatial map where you see your agent swarm as a live topology in your field of view, with Gemini narrating what's happening and suggesting course corrections through voice.

Deeper Gemini integration for autonomous steering. Today Gemini observes and advises. The next step is giving it the ability to actually redirect agents: reassign work, resolve conflicts, and rebalance load across the swarm based on live telemetry.

Opening the network. Right now cross-room intelligence is opt-in. We want to build a public routing layer where any team's agent swarm benefits from the collective learnings of every other team, turning individual observability into collective navigation intelligence.
