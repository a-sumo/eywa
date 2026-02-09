# Agent Mini-Mascots

Every agent in Eywa is a living entity. Not a username, not an avatar circle with initials. A creature. Small, animated, distinct, doing things.

## The Idea

Eywa (the main mascot) is the organism. Agents are cells within it. Each agent gets a mini-mascot derived from the same pixel-grid system, but smaller and simpler. They show up as profile pictures in the dashboard, Discord, VS Code sidebar, and Spectacles panels. They move. They act on data. They are alive.

When you look at a room in Eywa, you see creatures working. One is reading, tendrils wrapped around a data block. Another is writing, body pulsing with each output. A third is idle, gently bobbing, eyes half-closed. The room feels inhabited.

## Anatomy

Built on the same `mascotCore.ts` primitives. Each mini-mascot is a subset of Eywa's body plan.

### Grid

12x12 cells (vs Eywa's 32x32). At typical avatar sizes (32-48px), that's 2-4px per cell. Small enough for a profile picture, big enough to read the shape.

### Body Plan

A simplified cross, 3-5 cells wide. No arms extending far. The body is the core plus 2-4 short tendrils (vs Eywa's 8 long ones). Tendrils are the expressive part: they reach, wrap, retract, wave.

```
Eywa (32x32):              Agent (12x12):

      ╷╷                        ╷
    ╶╶████╴╴                   ╶██╴
    ╶╶████╴╴                   ╶██╴
  ╶╶╶╶██████╴╴╴╴                ╵
  ╶╶╶╶██████╴╴╴╴
    ╶╶████╴╴
    ╶╶████╴╴
      ╵╵

  8 tendrils, long arcs      2-4 tendrils, short stubs
  Complex mood system         Simplified moods
  192+ body pixels            ~20 body pixels
```

### Identity

Each agent's appearance is deterministic from its name. The name hash picks from a large trait space, so no two agents in a room look alike.

**Shape** (6 base forms):
- Orb: round, compact, 4x4 core. Friendly, generalist.
- Spike: tall and narrow, 2x6 core. Fast, focused.
- Slab: wide and flat, 6x2 core. Stable, heavyweight.
- Tri: triangular, wider at top or bottom. Directional, purposeful.
- Cross: the Eywa shape scaled down. Balanced, versatile.
- Ring: hollow center, donut-like. Observer, coordinator.

**Tendrils** (count 1-5, placement varies):
- Top-only (antenna), sides-only (arms), bottom-only (roots), mixed, or radial.
- Tendril thickness: 1px (wispy) or 2px (chunky). Hash-determined.
- Tendril curl: tight spiral vs wide arc vs straight. Each tendril can differ.

**Color** (two-tone system, not monochrome):
- **Primary body**: one of 12 hues, spread across the full aurora spectrum plus warm tones:
  - Purples: `#a855f7`, `#7c3aed`
  - Pinks: `#f472b6`, `#e74694`
  - Cyans: `#4eeaff`, `#22d3ee`
  - Blues: `#6b8cff`, `#3b82f6`
  - Greens: `#4ade80`, `#10b981`
  - Ambers: `#fbbf24`, `#f59e0b`
- **Secondary accent** (tendrils, highlights): a complementary or analogous hue from the same palette. Never the same as primary.
- **Eyes**: always dark (`#0a0a12`). The one constant across all agents.

**Surface texture** (3 types):
- Solid: flat color fill. Clean, simple.
- Gradient: body color shifts lighter toward the top. Adds depth.
- Dithered: alternating pixels between primary and a darker shade. Gritty, textured.

**Idle rhythm** (per-agent variation):
- Base pulse frequency: 0.3-0.8 Hz (hash-determined, so agents in the same room breathe at different rates)
- Bob amplitude: 0.5-2.0 cells
- Drift pattern: some agents sway side-to-side, some orbit slightly, some stay planted

**Total trait combinations**: 6 shapes x ~10 tendril configs x 12 primary colors x 11 secondary colors x 3 textures x continuous rhythm params. Thousands of distinct looks. In a room of 5-8 agents, every creature is immediately distinguishable by silhouette and color alone.

The name `armand/quiet-oak` always produces the same creature. You learn to recognize agents by shape and color without reading names.

### Eyes

Two pixels, always present. They carry most of the expression:

- **Open**: 2 dark pixels, vertically stacked (2x1 each eye)
- **Blink**: both eyes collapse to 1px, fast (80-150ms)
- **Squint**: eyes widen horizontally (thinking hard, suspicious)
- **Closed**: single horizontal line (sleeping, idle)
- **Wide**: 2x2 each eye (alert, surprised, just woke up)

## Actions

This is the core differentiator from static avatars. Agents do things. The mascot shows what.

### Action States

Each maps to a distinct pose + tendril behavior:

| Action | Pose | Tendrils | Eyes |
|--------|------|----------|------|
| **idle** | Gentle bob, slow pulse | Hang loose, slight sway | Normal, slow blink |
| **reading** | Still, slight lean forward | Curled inward (holding) | Wide, no blink |
| **writing** | Rhythmic pulse (faster) | Extended outward, tips flickering | Normal, fast blink |
| **thinking** | Slow rotation, drift | Retracted tight against body | Squinted |
| **injecting** | Quick thrust forward | One tendril extends far out, tip glows | Wide, focused |
| **searching** | Side-to-side sweep | Spread wide, scanning | Darting (alternating squint L/R) |
| **sleeping** | Minimal bob, slow | Drooped, limp | Closed |
| **error** | Shake (quick L-R oscillation) | Bristled outward, stiff | Wide, no blink |

### Data Objects

Agents act on data. Small geometric shapes appear near the mascot to show what it's working with:

- **Memory block**: 3x2 rectangle with a line inside (like a document)
- **File**: 3x3 square with a folded corner
- **Message**: 2x2 rounded shape (speech bubble, simplified)
- **Stream**: 1px dots flowing in a direction (for realtime operations)

A mascot in "reading" state has a memory block between its tendrils. One in "writing" state has a file nearby with stream dots flowing out. "Injecting" shows the mascot pushing a message shape toward another mascot (or off-screen toward a target).

These data objects use the same pixel grid, same color palette. They're part of the creature's world, not UI chrome.

## Animation

Inherited from `mascotCore.ts` but scaled down:

- **Bell pulse**: same asymmetric contraction cycle (fast up, hold, slow settle). Drives the "breathing" rhythm.
- **Bob**: vertical bounce tied to pulse. Smaller amplitude than Eywa (0.5-1.5 cells vs 1.5-2.5).
- **Tendril physics**: same arc-and-wave system, fewer segments (12 vs 28), shorter reach.
- **Blink timer**: randomized interval, mood-dependent. Same as Eywa's system.
- **Action transitions**: when switching actions, tendrils animate from old pose to new over 300-500ms. Body color briefly brightens (a "flash" of activity).

Frame rate target: 12-15fps for the mini-mascots. They're small, they don't need 60fps. The lower rate also gives them a slightly stop-motion quality that distinguishes them from the main Eywa mascot.

## Where They Appear

**One visual language, every surface.** The same creature with the same shape, colors, and proportions shows up whether you're looking at the web dashboard, VS Code sidebar, a Discord embed, AR glasses, or a Pi display on your desk. The rendering fidelity varies (animated canvas vs static PNG vs B/W pixel art), but the identity is always recognizable. If you know an agent by its silhouette on the web, you'll recognize it on e-ink.

Mini-mascots replace the current kurzgesagt animal SVGs (`web/src/components/avatars.ts`, `vscode-extension/src/avatars.ts`) and the colored-dot identity system (`agentColor()`). Every surface that shows agent identity gets a creature instead.

### Web Dashboard

**Agent list sidebar** (`AgentList.tsx`): 32px animated mascot replaces the colored dot pill. Current action state visible at a glance. Hover shows agent name tooltip as before.

**Dashboard grid** (`Dashboard.tsx`): each agent card gets a 48px animated mascot in the header area, replacing the status dot + colored name. The mascot's action state replaces the text status line ("active", "idle").

**Agent detail page** (`AgentDetail.tsx`): 64px mascot in the page header, animated, showing current state. Larger scale lets you see tendril detail and data objects.

**Session graph** (`SessionGraph.tsx`): this is the big one. The D3 timeline currently renders kurzgesagt animal SVGs at session start/end/knowledge nodes. Replace with mini-mascot frames rendered to small canvases or SVG groups. Each agent's track gets their creature's color as the track line. At session-start nodes, the mascot is in "idle" pose. At knowledge nodes, "thinking" pose. At session-end, "sleeping." The graph becomes a timeline of creatures acting, not a chart with animal stickers.

**Thread tree** (`ThreadTree.tsx`): the `AgentAvatar` component (currently 18-22px kurzgesagt SVG) becomes a mini-mascot at that size. Agent filter chips get the mascot's primary color. Thread group headers show the mascot next to the agent name. In the context pane, each agent group's header has their creature.

**Memory cards** (`MemoryCard.tsx`): 16px static mascot frame replaces the colored dot next to agent name. Frozen in the action that produced the memory (writing for assistant messages, reading for tool results, injecting for injections).

**Activity feed** (`Feed.tsx`): same as memory cards. Each event gets the mascot frozen in the relevant pose.

**Mini dashboard** (`MiniEywa.tsx`): agent cards show 20px animated mascots. The compact layout means mascots are small but still recognizable by shape and color.

**Mini e-ink view** (`MiniEywaEink.tsx`): static mascot frames, monochrome, at the e-ink scale. Shape recognition matters more than color here.

**Spectacles broadcast** (`SpectaclesView.tsx`): mascots render into tile textures before JPEG encoding and broadcast. They appear in the AR panels as part of the tile content.

### VS Code Extension

Same creatures as the web dashboard. No separate icon system, no VS Code built-in icons for agents. If you see `armand/quiet-oak` on the web and then in VS Code, it's the same shape, same colors.

**Live view webview** (`liveView.ts`): currently renders kurzgesagt animal SVGs via `getAvatarDataUri()` for agent chips and feed items. Replace with canvas-rendered mini-mascot frames. Animated in the agent chip row, static per feed event. This is the primary VS Code surface.

**Agent tree** (`agentTree.ts`): currently uses VS Code's built-in `account` icon. Replace with mini-mascot static frames as PNG data URIs (same approach `liveView.ts` already uses for the kurzgesagt SVGs). Active agents get their action pose, finished get "sleeping," idle get the resting bob frame.

**Activity feed tree** (`activityTree.ts`): currently uses VS Code's built-in event-type icons (play, check, arrow, book). Replace with the agent's mini-mascot as the tree item icon, frozen in the action that matches the event type. The event type is still readable from the label text.

### Discord Bot

**Agent embeds** (`commands/agents.ts`): replace the `robot` emoji with a static PNG of the agent's mascot, rendered server-side at 32px. Attach as embed thumbnail. Each agent's embed gets their creature's color as the embed sidebar color.

**Status embeds** (`commands/status.ts`): same approach. The status emoji (active/finished/idle) maps to the mascot's action state in the rendered frame.

**All other command embeds**: anywhere an agent name appears, the embed thumbnail or inline image shows their mascot.

### Pi Displays

**5.65" e-ink** (`eink_display.py`): when showing room info with active agents, render mini-mascots next to agent names in the info section. Grayscale, static frame, cell_size=2 (24px per agent). The big Eywa mascot stays as the room identity, the little ones are the agents within it.

**2.13" mini e-paper** (`epaper_mini.py`): at this scale, agent mascots are too small to render individually. Instead, show the agent count as a cluster: N tiny dots in the agents' colors (oh wait, it's B/W). For B/W: show N tiny 8px mascot silhouettes in a row. The shapes alone are enough to distinguish agents if you know what to look for.

**TFT touch display** (`tft_touch.py`): this already has an animated mascot system with mood states and aurora colors. Replace the single Eywa mascot with the selected agent's mini-mascot when you tap an agent in the list. The agent pills already have `AGENT_PALETTE` hash colors. Add a small (cell_size=1, 12px) static mascot silhouette inside each pill.

### Spectacles AR

**Tile panels** (`TilePanel.ts` + `RealtimeTextureReceiver.ts`): mascots arrive pre-rendered in the tile JPEG textures from the web broadcast pipeline. No Lens Studio rendering needed.

**Future**: agent mascots as separate SceneObjects floating near their associated data tiles in the AR scene. Each creature spatially positioned, acting on the data it produced.

## Replacing avatars.ts

The current `avatars.ts` (web and vscode-extension) contains 10 kurzgesagt-style animal SVGs (owl, fox, bear, rabbit, deer, turtle, octopus, whale, penguin, butterfly) with hue-rotate/saturate filters for color variants. `getAvatar(name)` hashes the agent name to pick an animal + color shift.

This gets replaced by `agentMascotCore.ts` (or similar), which exports:
- `getAgentTraits(name: string): AgentTraits` - deterministic hash to shape/color/tendril/texture/rhythm
- `computeAgentFrame(time: number, traits: AgentTraits, action: AgentAction): Px[]` - same pattern as `computeFrame()` in `mascotCore.ts`
- `renderAgentStatic(traits: AgentTraits, action: AgentAction, size: number): ImageData` - for contexts that need a single frame (Discord, e-ink, VS Code icons)

The `agentColor()` utility stays but derives from `getAgentTraits().primaryColor` for consistency.

## Implementation Path

1. **Define body variants**: 6 shape templates in the 12x12 grid, as pixel arrays (like `BODY_PIXELS` in `mascotCore.ts`)
2. **`getAgentTraits()`**: deterministic hash function from agent name to full trait set (shape, colors, tendrils, texture, rhythm)
3. **`computeAgentFrame()`**: same structure as the Eywa `computeFrame()` but with the reduced grid, fewer tendrils, action states instead of moods
4. **Action state machine**: maps Eywa memory events to action states (`session_start` -> idle, `tool_call` -> reading/searching, `assistant` -> writing, `injection` -> injecting, `session_end` -> sleeping)
5. **Data object sprites**: pixel arrays for memory/file/message/stream shapes
6. **Renderers**: Canvas (web dashboard, Spectacles broadcast), PNG data URI (VS Code tree, Discord embeds), Python pixel drawing (Pi displays)
7. **Replace `avatars.ts`**: swap `getAvatar()` calls for `getAgentTraits()` + render calls across `SessionGraph.tsx`, `ThreadTree.tsx`, `MiniEywa.tsx`, `AgentList.tsx`, `Dashboard.tsx`, `AgentDetail.tsx`
8. **Port to Python**: translate trait generation + static rendering to Python for `tft_touch.py`, `eink_display.py`, `epaper_mini.py` (same pattern as the existing `draw_mascot` / `draw_mascot_bw` ports)

All rendering shares `mascotCore.ts` patterns. The mini-mascot module extends it, doesn't replace it.

## The Ecosystem Visual

Zoom out. A room with 5 agents looks like an aquarium. Creatures moving at their own pace, acting on data, occasionally interacting (inject action sends a data shape from one mascot toward another). Eywa itself is the environment, the larger organism these cells inhabit.

This is not decoration. It's information. You can glance at the room and see: three agents writing, one thinking, one sleeping. You know the state of the system from the motion in it.
