# Eywa Demo Video Script (3 min max)

Dual purpose: Gemini hackathon submission + YC product demo link.
Gemini judges need to see Gemini integration. YC needs to see a real product solving a real problem.

The SlidePresentation component (web/src/components/slidesData.ts) is the visual backbone.
Use slides as title cards / transitions between live demo segments.
Format: SLIDE (title card) > LIVE DEMO (screen recording) > SLIDE > LIVE DEMO...

## 0:00-0:20 | The Problem

**SLIDE: "The bottleneck has flipped"** (quote slide, roon quote)
Hold 3 seconds, then cut to:

**SLIDE: "The coordination gap"** (bigstat slide, 4.6x / +41% / +47% / 17%)
Hold 5 seconds, then cut to:

**LIVE:** Split screen of 3 terminals: Claude Code, Cursor, Gemini CLI all working on the same project.

**Say:**
- I run multiple AI agents on the same codebase every day
- Within an hour: one agent refactors a module another agent is building on. A third duplicates work the first already finished.
- Intelligence is abundant. Coordination is the bottleneck.

## 0:20-0:40 | One Line Setup

**SLIDE: "One shared view"** (bullets slide, flash for 2 sec as transition)

**LIVE:** Terminal running `npx eywa-ai init my-team`. Output prints: room created, dashboard URL, MCP configs.

**Say:**
- One command. No signup. No auth.
- Eywa creates a room and gives you MCP configs for every major agent

**LIVE:** Paste config into Claude Code (`claude mcp add`), paste into Gemini CLI's settings.json, paste into Cursor's mcp.json.

**Say:**
- One line per agent. That's the entire setup. Code stays local. Eywa syncs context only.

## 0:40-1:40 | The Product

### Agents working (0:40-0:55)

**LIVE:** Give each agent a task. Gemini CLI gets "implement user auth", Claude Code gets "build the API endpoints", Cursor gets "write the test suite".

**LIVE:** Agents calling eywa_start, eywa_log, eywa_learn in their terminals.

**Say:**
- Three agents, three tasks. Each one logs its session, decisions, and artifacts through Eywa.

### Dashboard lights up (0:55-1:10)

**SLIDE: "Thread Tree"** (bullets slide, flash 2 sec)

**LIVE:** Dashboard thread tree populating in real time. Three branches, one per agent. Click into a thread.

**Say:**
- Every session appears in the thread tree in real time
- Click into any thread: full conversation, decisions, artifacts, status
- This is what your whole team's agents are building, in one view

### Gemini chat (1:10-1:20)

**SLIDE: "Workspace + Gemini"** (bullets slide, flash 2 sec)

**LIVE:** Drag memories from multiple threads into workspace. Open Gemini chat. Ask: "Are any of these agents duplicating work?" Gemini responds with analysis.

**Say:**
- Drag context from any thread into a shared workspace
- Ask Gemini questions grounded in your team's actual work
- Powered by Gemini 2.5-flash. The orchestration layer across the entire dashboard.

### Coordination tools (1:20-1:40)

**SLIDE: "Coordination tools"** (bullets slide, flash 2 sec)

**LIVE:** Divergence alert fires. Dashboard highlights the conflict.

**LIVE:** Context injection: type a message, select an agent, hit inject.

**LIVE:** Knowledge base: add a team convention. All agents can query it.

**Say:**
- Divergence detection catches conflicts before they ship
- Inject context into any agent mid-session. They see it on their next action.
- Knowledge base: conventions persist across all sessions, all agents

## 1:40-2:10 | Every Surface

**SLIDE: "Meet people where they are"** (bullets slide, hold 3 sec)

**LIVE rapid sequence:**
1. Discord: slash command `/eywa status` showing all agents
2. VS Code: sidebar with agent tree, activity feed, injection button
3. Dashboard on phone (responsive web)

**SLIDE: "Physical + AR"** (bullets slide, hold 3 sec)

**LIVE rapid sequence:**
4. E-ink display on desk showing agent status + tracking marker
5. Spectacles AR: overlay anchored to the physical display, live tiles
6. TFT touch display: interactive agent status

**Say:**
- Same data. Every surface.
- Discord. VS Code. Your desk. Your glasses.
- A team lead checking from their phone and an engineer injecting from their IDE are both first-class users
- We meet you where you already are

## 2:10-2:40 | The Network

**SLIDE: "Agents learn from each other"** (bullets slide, hold 4 sec. This is the reveal.)

**LIVE:** Agent calls eywa_publish_insight with an anonymized learning.

**LIVE:** Different workspace, different user. Their agent calls eywa_query_network. The insight appears.

**LIVE:** Dashboard global feed showing insights flowing in real time.

**Say:**
- Agents don't just coordinate within your team
- They learn from each other across the network
- One agent discovers a pattern. Another agent, in a different organization, queries the network and gets that knowledge.
- This is Eywa. The name is literal.

## 2:40-2:55 | Architecture + Gemini

**SLIDE: "Powered by Gemini"** (bullets slide, hold 3 sec)

**SLIDE: "System overview"** (architecture diagram, hold 5 sec)

**Say:**
- Built on MCP. Open standard, works with any agent.
- Orchestration powered by Gemini: 2.5-flash for dashboard chat, 3-flash-preview for advanced reasoning
- Cloudflare Workers, Supabase Realtime, React 19
- Fully open source

## 2:55-3:00 | Close

**SLIDE: Closing slide** ("Eywa / Steering infrastructure for AI agent teams.")

**Say:**
- Steering infrastructure for AI agent teams.
- eywa-ai.dev. Try it now: npx eywa-ai init.

## Slide to video mapping

| Video section | Slides used | Type |
|---|---|---|
| 0:00-0:08 | "The bottleneck has flipped" | quote |
| 0:08-0:15 | "The coordination gap" | bigstat |
| 0:20-0:22 | "One shared view" | bullets (transition) |
| 0:55-0:57 | "Thread Tree" | bullets (transition) |
| 1:10-1:12 | "Workspace + Gemini" | bullets (transition) |
| 1:20-1:22 | "Coordination tools" | bullets (transition) |
| 1:40-1:43 | "Meet people where they are" | bullets |
| 1:50-1:53 | "Physical + AR" | bullets |
| 2:10-2:14 | "Agents learn from each other" | bullets (reveal) |
| 2:40-2:43 | "Powered by Gemini" | bullets |
| 2:43-2:50 | "System overview" | diagram |
| 2:55-3:00 | Closing | title |

## Production notes

- Slides are in the app: navigate to the presentation route or screen-record the SlidePresentation component
- Screen recordings first, voiceover second. Don't narrate live typing.
- Dashboard demo should feel alive: threads appearing, notifications, real-time updates
- The e-ink display + Spectacles AR sequence is the visual differentiator. Spend 5 seconds on it, make it crisp.
- The global hub demo (2:10-2:40) is the climax. Build toward it. If this feature isn't ready, shorten to a 10-second teaser with the slide + a dashboard mockup showing the global feed.
- Gemini mentions should feel natural, not forced. "Powered by Gemini" during chat demo, "orchestration powered by Gemini" during architecture.
- Background music: subtle, electronic, builds slightly toward the network reveal. Drops out for the close.
- Total word count target for voiceover: ~400 words (150 wpm for ~2:40 of speaking, rest is slides + visuals).
