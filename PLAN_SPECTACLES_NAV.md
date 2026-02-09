# Plan: Spectacles Navigation View (2D Map + Voice)

## Goal
Replace the text tile grid with a 2D spatial map of agent activity. Lean into Curvilinear's navigation DNA. Add voice interaction if Spectacles API supports it.

## Current State
- SpectaclesView renders micro-tiles (text cards) to OffscreenCanvas
- Broadcasts base64 JPEG textures via Supabase Realtime
- Spectacles TilePanel.ts receives ops + textures, builds quads
- Layout is a flat grid of agent dots + memory cards + chat bubbles
- No spatial metaphor. No map. No voice.

## Curvilinear DNA (from repo analysis)
- **WarpGrid**: Canvas 2D, Alcubierre metric displacement, flowing dashes, time compression
- **Spanning tree**: New nodes connect to nearest existing node (natural branching)
- **Time coordinates**: Labels compress/expand based on warp strength
- **Key insight**: Make invisible structure visible without choosing the path for humans

## What to Build

### 1. Agent Map Canvas (`AgentMapRenderer`)
Replace tile grid with a 2D canvas map:

- **Center**: User's destination/goal (if set)
- **Nodes**: Active agents as positioned dots with status colors
- **Edges**: Task dependencies, injection links, shared knowledge
- **Flow**: Animated particles along edges showing activity direction
- **Proximity**: Agents working on similar tasks cluster together
- **Time axis**: Recent operations pulse, old ones fade

Layout algorithm: Force-directed graph with:
- Agents repel each other (spread)
- Shared systems attract (cluster by system)
- Injection links create edges
- Active agents are larger/brighter

This renders to a single large canvas tile (or 2x2 grid of tiles) for Spectacles broadcast.

### 2. Operation Stream Overlay
On top of the map:
- Streaming text feed of operations (small font, scrolling)
- Highlighted operations that Gemini flagged as important
- Pattern badges: "REDUNDANT", "DIVERGING", "IDLE"

### 3. Voice Interface (Stretch)
Check if Spectacles/Lens Studio supports:
- Microphone input / speech recognition
- Text-to-speech output
- If yes: pipe voice to Gemini, speak responses back
- If no: use text prompts via hand tracking tap

### 4. Simplified Tile Set
Instead of many small tiles, use fewer larger tiles:
- **Map tile** (large, center): Agent spatial map
- **Status bar** (top): Room name, active count, destination
- **Gemini response** (bottom): Latest steering insight
- **Control buttons**: Refresh, speak, zoom

## Files to Modify
- `web/src/lib/tileRenderers.ts` - Add `renderAgentMap` renderer
- `web/src/lib/tileLayout.ts` - New layout mode for map view
- `web/src/components/SpectaclesView.tsx` - Switch to map layout
- `web/src/lib/tileScene.ts` - Support larger tile sizes
- `eywa-specs/Assets/Scripts/TilePanel.ts` - Handle larger textures

## Definition of Done
- Spectacles shows a 2D map of agent activity instead of text grid
- Agents are spatially positioned (clustered by system/task similarity)
- Active operations animate along edges
- Map updates in real-time as agents work
- (Stretch) Voice queries to Gemini
