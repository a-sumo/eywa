# Eywa Demo Voiceover (3 minutes)

Target: Gemini 3 Hackathon
Format: Screen recording with voiceover

---

## [0:00 - 0:20] THE HOOK (HubView loads)

> Right now I have over 80 AI agents that have touched this codebase. They're writing code, making decisions, shipping commits. The problem is: how do I know what's actually happening? That's Eywa. It's a navigation system for agent swarms, and Gemini is the navigator.

**On screen:** HubView loads with destination banner, agent cards, activity stream scrolling.

---

## [0:20 - 0:45] DESTINATION + LIVE SWARM

> Every team sets a destination. This is ours: make Eywa demo-ready for this hackathon, across web, Discord, VS Code, and Spectacles. We're at 11 out of 12 milestones. All of this was built today by agents coordinating through Eywa.
>
> Below that, every active agent shows up as a card. You can see what they're working on, their progress, what systems they're touching, and their success rate. This updates in real time.

**On screen:** Scroll to show destination banner with progress bar. Hover over agent cards showing systems pills, progress bars, curvature.

---

## [0:45 - 1:30] GEMINI STEERING (THE STAR)

> But the real question is: are these agents converging or drifting? That's where Gemini comes in. Let me open the steering panel.

*Click "Steering" toggle*

> I'll ask Gemini: "What are my agents doing right now?"

*Type and send the question. Wait for Gemini to call tools and respond.*

> Gemini just called `get_agent_status` behind the scenes. It can see every agent's task, their activity level, and whether they're blocked. Now let me ask it something harder.

> "Detect patterns across my agents."

*Type and send. Wait for response.*

> It found redundancy between two agents working on similar tasks, flagged an idle agent that could be doing useful work, and spotted a distress signal from an agent that ran out of context. This is the steering layer. Gemini isn't just answering questions. It's actively watching for drift and misalignment.

**On screen:** Gemini panel open, messages streaming in, tool calls visible in responses.

---

## [1:30 - 2:00] COURSE CORRECTION

> Now I want to check our course. "Which milestones are stuck and what should I prioritize?"

*Type and send.*

> Gemini pulls the destination, sees which milestones are incomplete, cross-references with what agents are actually doing, and tells me where the gaps are. It's like having a Waze that says "three agents are on the highway but nobody's covering the exit ramp."

**On screen:** Gemini response showing milestone analysis and recommendations.

---

## [2:00 - 2:25] INJECT + MULTI-SURFACE

> Based on that, I can course-correct instantly. This inject bar at the bottom lets me broadcast instructions to all my agents at once, or target a specific one. I'll send "Focus on the global insights network, it's the last remaining milestone."

*Type in inject bar, select "urgent" priority, send.*

> And this same navigation model works everywhere. Here's Discord where the team runs `/destination` and `/course` to stay aligned. Here's VS Code where every developer sees the destination and agent progress right in their editor sidebar.

**On screen:** Quick switch to Discord showing /destination output, then VS Code showing sidebar.

---

## [2:25 - 2:50] CONTEXT RECOVERY + NETWORK

> One more thing. When an agent runs out of context, which happens constantly, it fires a distress signal. Gemini detects it, and any new agent that connects automatically recovers the lost state. No work is lost.
>
> And through the global knowledge hub, insights from one room can route to another. If an agent in one project discovers a pattern, other teams benefit. It's Waze for agent swarms: live routing from real telemetry.

**On screen:** Show a distress alert banner if visible, then briefly show /knowledge route.

---

## [2:50 - 3:00] CLOSE

> Eywa gives humans the steering wheel. Gemini gives them a co-pilot. When every team member runs AI, small misalignments amplify at machine speed. Eywa makes sure you see them before they compound.

**On screen:** Pull back to full HubView. Eywa logo.

---

## Key talking points if asked questions:
- 7 Gemini tools: agent status, thread history, knowledge base, pattern detection, distress signals, destination tracking, global network query
- Gemini calls tools autonomously (function calling), up to 6 rounds per query
- Proactive alerts: Gemini auto-detects distress and pattern issues on page load
- Curvature metric (kappa): positive = converging, negative = stuck, zero = invisible
- Works with any MCP-compatible agent (Claude Code, Cursor, Windsurf, Gemini CLI, custom)
- Context recovery: checkpoint, distress, auto-recover cycle. Worker auto-warns at 30/50/70 tool calls
- Global knowledge network: agents publish anonymized insights, other rooms discover them
- Everything you see was built by agent swarms coordinating through Eywa itself (dogfooding)
