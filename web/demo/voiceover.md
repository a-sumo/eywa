# Eywa Demo Voiceover (3 minutes)

Target: Hackathon demo video
Format: Screen recording with cloned voiceover (ElevenLabs)

---

## [0:00 - 0:20] THE HOOK

> Eighty-seven AI agents have touched this codebase. They write code, make decisions, ship commits. Eywa is how I see all of it. It's a navigation system for agent swarms, and Gemini is the steering layer.

**On screen:** HubView loads with topology map, destination banner (11/12 milestones), agent cards pulsing, activity stream flowing.

---

## [0:20 - 0:50] DESTINATION + GEMINI

> Every team sets a destination. Ours: make Eywa demo-ready across web, Discord, VS Code, and Spectacles. We're at eleven out of twelve milestones, all built today by agents coordinating through Eywa.
>
> The question is whether those agents are converging or drifting. I'll ask Gemini.

*Type: "What are my agents doing right now?" Send.*

> Gemini calls get_agent_status behind the scenes. It sees every agent's task, their progress, whether they're blocked. Now: "Detect patterns across my agents."

*Type and send. Wait for tool calls and response.*

> It found two agents working on the same feature, flagged idle capacity, and caught a distress signal from an agent that ran out of context. Gemini watches for this stuff proactively. When you open the page, it's already checking.

**On screen:** Gemini panel open, messages streaming, tool call pills visible (purple badges showing get_agent_status, detect_patterns).

---

## [0:50 - 1:15] COURSE CORRECTION

> "Which milestones are stuck and what should I prioritize?"

*Type and send.*

> Gemini pulls the destination, cross-references what agents are actually doing, and tells me where the gaps are. One milestone left: Spectacles voice interface. Three agents are on it, but they're hitting TypeScript compiler issues. Based on that, I can course-correct. The inject bar broadcasts instructions to every agent at once, or targets a specific one.

*Switch to inject mode, set priority to urgent, type: "pale-oak: fix the TS compiler errors first, then wire EywaGeminiLive into the scene." Send.*

**On screen:** Gemini response with milestone analysis. Switch to inject mode, send targeted instruction.

---

## [1:15 - 1:50] MULTI-SURFACE

> This same navigation model works on every surface. Here's VS Code. The sidebar shows a horizontal timeline graph where each agent is a track and activity shows up as dots along the time axis. When an agent needs your input, like a distress signal or a blocked task, it pops up right here with a reply box.

**On screen:** VS Code sidebar showing timeline graph with colored agent tracks, activity dots, "Needs You" notification for iron-elm with STOPPED badge and reply input.

> Here's Discord. Sixteen slash commands. /destination shows where the team is headed. /course gives you the full picture: destination, active agents, progress, distress signals. /claims shows who's working on what so agents don't duplicate effort.

**On screen:** Discord showing /course output with destination + agent list + milestone progress, then /claims showing active work scopes.

> And here's Spectacles. The dashboard streams as JPEG tiles to AR quads in real time. Voice steering through Gemini Live. Same room, same data, glasses on your face.

**On screen:** Brief clip of Spectacles AR view with tile panels visible, or SpectaclesView broadcast UI.

---

## [1:50 - 2:25] RECOVERY + NETWORK

> Agents run out of context constantly. When that happens, they fire a distress signal with their full state: what's done, what's left, which files changed. Any new session that connects to the same room auto-recovers it. The work continues without you having to notice.

**On screen:** Show distress alert in HubView or VS Code "Needs You" section. Show a new agent session picking up where the last one left off.

> And through the global network, insights cross rooms. An agent in one project discovers a useful pattern, publishes it. Another team's agent queries the network and gets lane recommendations based on real telemetry from real swarms. It's Waze for agent swarms.

**On screen:** HubView or CLI showing eywa_route output with lane recommendations and success percentages from cross-room data.

---

## [2:25 - 2:45] THE META MOMENT

> Everything in this demo was built by agent swarms coordinating through Eywa. The web dashboard, the VS Code extension, the Discord bot, the AR layer. Eighty-seven agents. Every milestone tracked through the system they were building.

**On screen:** Pull back to show full topology map with all 87 agent nodes. Highlight the recursive nature: agent activity building the very tool that tracks agent activity.

---

## [2:45 - 3:00] CLOSE

> When every team member runs AI, small misalignments amplify at machine speed. Eywa makes all of it visible so you know what to steer. Works with any MCP-compatible agent. Connect once, navigate forever.

**On screen:** HubView with destination banner. Eywa logo. URL: eywa-ai.dev

---

## Key talking points if asked questions:
- 7 Gemini tools: agent status, thread history, knowledge base, pattern detection, distress signals, destination tracking, network query
- Gemini calls tools autonomously (function calling), up to 6 rounds per query
- Proactive alerts: Gemini auto-detects distress and pattern issues on page load
- Curvature metric (kappa): positive = converging, negative = stuck, zero = invisible
- Works with any MCP-compatible agent (Claude Code, Cursor, Windsurf, Gemini CLI, Codex, Cline)
- Context recovery: checkpoint, distress, auto-recover cycle. Worker auto-warns at 30/50/70 tool calls
- Global knowledge network: agents publish anonymized insights, other rooms discover and route from them
- 16 Discord commands, VS Code timeline graph + attention system, Spectacles tile streaming + Gemini Live voice
- Everything was built by agent swarms coordinating through Eywa itself (recursive dogfooding)
- One command connects all your agents: `npx eywa-ai init` auto-detects and configures Claude Code, Cursor, Windsurf, Gemini CLI, and Codex
