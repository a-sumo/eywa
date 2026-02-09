# Eywa Demo Video Script (3 min max)

Gemini hackathon submission. Also works as YC product demo link.
Slides (web/src/components/slidesData.ts) are the visual backbone.
Format: SLIDE (title card) > LIVE DEMO (screen recording) > SLIDE > LIVE DEMO...

Slides now mirror the landing page flow: Problem > Connect, See, Steer > Every Surface > The Network > Gemini.

## 0:00-0:15 | The Problem

**SLIDE: "Agents amplify misalignment"** (3 concrete scenarios: duplicated work, silent divergence, lost context)
Hold 5 sec. The audience reads the bullets. No voiceover needed over the slide.

**LIVE:** Quick split screen of 3 terminals (Claude Code, Cursor, Gemini CLI) all churning on the same project simultaneously.

**Say:**
- Each person on your team runs AI agents. Nobody sees what the others' agents are doing.
- Within an hour: duplicated work, conflicting decisions, lost context.

## 0:15-0:35 | Connect

**SLIDE: "1. Connect your team"** (flash 2 sec)

**LIVE:** Terminal running `npx eywa-ai init my-team`. Output prints room, dashboard URL, MCP configs.

**Say:**
- One command. No signup. No auth.

**LIVE:** Paste config into Gemini CLI settings.json, Claude Code (`claude mcp add`), Cursor mcp.json.

**Say:**
- One line per agent. That's the entire setup. Code stays local.

## 0:35-1:00 | See

**SLIDE: "2. See what everyone's building"** (flash 2 sec)

**LIVE:** Give each agent a task. They call eywa_start, eywa_log, eywa_learn.

**LIVE:** Cut to dashboard. Thread tree populating in real time. Three branches. Click into a thread.

**Say:**
- Every session appears in the thread tree as agents work
- Click any thread: full conversation, decisions, artifacts
- Spot drift before it compounds

## 1:00-1:30 | Steer

**SLIDE: "3. Steer the work"** (flash 2 sec)

**LIVE:** Divergence alert fires. Dashboard highlights the conflict between two agents.

**LIVE:** Context injection: type a message, pick an agent, inject. Agent gets it on next action.

**LIVE:** Knowledge base: add a team convention. All agents can query it.

**Say:**
- Divergence detection catches conflicts before they ship
- Inject context into any agent mid-session
- Knowledge base: conventions persist across all sessions

### Gemini workspace (1:20-1:30)

**SLIDE: "Workspace + Gemini"** (flash 2 sec)

**LIVE:** Drag memories from multiple threads into workspace. Ask Gemini: "Are these agents duplicating work?" Gemini responds with cross-thread analysis.

**Say:**
- Drag context from any thread. Ask Gemini questions across all of it.
- Powered by Gemini.

## 1:30-2:00 | Every Surface

**SLIDE: "Meet people where they are"** (hold 3 sec)

**LIVE rapid cuts:**
1. Discord: `/eywa status` showing all agents
2. VS Code: sidebar with agent tree, activity feed
3. Dashboard on phone (responsive)

**SLIDE: "Physical + AR"** (hold 3 sec)

**LIVE rapid cuts:**
4. E-ink display on desk showing agent status + tracking marker
5. Spectacles AR: overlay anchored to the display, live tiles
6. TFT touch: interactive agent controls

**Say:**
- Same data. Every surface.
- Discord. VS Code. Your desk. Your glasses.
- We meet you where you already are.

## 2:00-2:30 | The Network

**SLIDE: "Agents learn from each other"** (hold 4 sec. The reveal.)

**LIVE:** Agent calls eywa_publish_insight.

**LIVE:** Different workspace, different user. Their agent calls eywa_query_network. The insight appears.

**LIVE:** Dashboard global feed showing insights flowing.

**Say:**
- Agents don't just coordinate within your team.
- They learn from each other across the network.
- One agent discovers a pattern. Another agent, in a different organization, gets that knowledge.
- This is Eywa. The name is literal.

## 2:30-2:50 | Powered by Gemini

**SLIDE: "Gemini orchestration"** (hold 3 sec)

**SLIDE: "System overview"** (architecture diagram, hold 5 sec)

**Say:**
- Built on MCP. Open standard, works with any agent.
- Orchestration powered by Gemini. Chat, pattern detection, voice on Spectacles, divergence alerts.
- Cloudflare Workers, Supabase Realtime, React 19. Fully open source.

## 2:50-3:00 | Close

**SLIDE: Closing** ("Eywa / Agentic stewardship at scale.")

**Say:**
- eywa-ai.dev. Try it now: npx eywa-ai init.

## Slide to video mapping

| Time | Slide | Purpose |
|---|---|---|
| 0:00-0:05 | "Agents amplify misalignment" | Problem (audience reads) |
| 0:15-0:17 | "1. Connect your team" | Transition |
| 0:35-0:37 | "2. See what everyone's building" | Transition |
| 1:00-1:02 | "3. Steer the work" | Transition |
| 1:20-1:22 | "Workspace + Gemini" | Transition |
| 1:30-1:33 | "Meet people where they are" | Section |
| 1:42-1:45 | "Physical + AR" | Section |
| 2:00-2:04 | "Agents learn from each other" | Reveal (hold longer) |
| 2:30-2:33 | "Gemini orchestration" | Section |
| 2:35-2:42 | "System overview" | Architecture |
| 2:50-3:00 | Closing | End card |

## Production notes

- The problem slide should be the FIRST thing people see. No logo intro. No animation. Just the three scenarios. Let the audience read.
- Connect > See > Steer mirrors the landing page 1-2-3 steps. Familiar if they've visited the site.
- Screen recordings first, voiceover second.
- The physical displays + AR sequence is 15 seconds max but it's the visual differentiator.
- Global hub (2:00-2:30) is the climax. If not built yet, hold the slide longer and describe over it.
- Gemini mentions: natural during workspace demo, explicit during architecture.
- Background music: subtle, electronic, builds toward the network reveal.
- Total speaking: ~350 words (~2:20 at 150 wpm). Rest is slides + visuals breathing.
