# eywa-specs

Snap Spectacles AR client for Eywa. Renders agent memory, context, and chat as floating quads in world space, streamed from a web renderer via Supabase Realtime.

## How It Works

The Spectacles don't run a full browser. Instead, a web app renders each UI element (memory cards, agent dots, buttons, chat bubbles) as tiny JPEG textures on OffscreenCanvases. These get broadcast over Supabase Realtime to the glasses, which decode them and paint them onto 3D quads.

```
Web (SpectaclesView.tsx)
  computeLayout() -> TileDescriptor[]
  TileScene.reconcile() -> create/destroy/move ops
  TileScene.renderDirty() -> OffscreenCanvas -> base64 JPEG
  channel.send("scene", ops)     <- JSON, batched at 10fps
  channel.send("tex", {id, image})  <- JPEG per tile, 4/frame max
        |
        | Supabase Realtime broadcast
        v
Spectacles (TilePanel.ts)
  RealtimeTextureReceiver -> subscribe to channel
  onScene -> create/move/destroy quads
  onTex -> Base64.decodeTextureAsync -> material.mainPass.baseTex
  Quad renders in world space
```

Each tile is its own quad with its own cloned material. Only dirty tiles re-render and re-broadcast - most tiles broadcast exactly once.

## Scripts

### TilePanel.ts
The "DOM" for Spectacles. Manages a tree of quads inside a container. Receives scene ops (create/move/destroy) and texture events from the web renderer, creates/destroys quads dynamically, handles interaction via SIK Interactable, and sends tap/hover events back.

**Inspector inputs:**
- `snapCloudRequirements` - SnapCloudRequirements reference
- `channelName` - Room slug (e.g. "demo")
- `deviceId` - Leave empty to auto-generate, "editor" for preview
- `positionOffset` - Position offset from parent (center of panel)
- `material` - Unlit material template (drag from Asset Browser)
- `pixelsPerCm` - Scale factor (default 16)
- `cameraObject` - Optional camera SceneObject override (for pose broadcasts)
- `showStatus` - Show debug status text
- `showTestQuads` - Toggle colored test quads for pipeline validation

### RealtimeTextureReceiver.ts
Network layer. Connects to Supabase Realtime, subscribes to broadcast channels, handles three protocols:
- **Scene ops** (`scene` event) - forwarded to TilePanel
- **Texture updates** (`tex` event) - base64 JPEG by tile ID
- **Lobby** - device discovery and heartbeat

Also supports legacy modes: single-frame (`frame`) and tile-grid (`tile`).

### RealtimePanel.ts
Fixed-grid mode (legacy). Creates a static NxM quad grid. Each quad has its own material. Simpler than TilePanel but less flexible - tiles can't be created/destroyed dynamically. Includes built-in cursor overlay for interaction feedback.

### GestureLayoutController.ts
Hand gesture recognition for spatial layout control. Uses SpectaclesInteractionKit hand tracking to detect three gestures:
- **Clap** (hands together then apart) - expands layout zones outward
- **Peace sign** (index + middle up, ring + pinky folded) - focuses the hovered group, pulling it closer
- **Snap** (thumb + middle together then apart) - resets layout to default

Sends `layout` events back to the web via RealtimeTextureReceiver with action types: `shift-zone`, `focus-group`, `reset-layout`.

### SnapCloudRequirements.ts
Config bridge. Reads Supabase URL and anon key from the SupabaseProject asset (created via the Supabase Lens Studio plugin). Other scripts reference this instead of configuring Supabase directly.

## Setup

### 1. Lens Studio project
Open `eywa-specs.esproj` in Lens Studio.

### 2. Supabase plugin
Window > Supabase > Login > Import Credentials. This creates a SupabaseProject asset.

### 3. Scene hierarchy
```
CloudManager          <- SnapCloudRequirements script, assign SupabaseProject
Camera
EywaPanel             <- TilePanel script
  material: Unlit     <- assign the Unlit material from Assets
  channelName: demo   <- your room slug
  deviceId: editor    <- or leave empty for auto-ID
```

### 4. Web broadcaster
Navigate to `/r/{room-slug}/spectacles` in the Eywa web app. Click "Broadcast". The page renders tiles and streams them to any connected Spectacles device.

### 4b. Production deployment (auto-join)
See `DEPLOYMENT.md` for the tracker-based auto-join flow. This replaces the manual "Broadcast" step for end users by encoding the room in the display's tracking marker and anchoring the UI to the marker pose.

### 5. Test in editor
Push to device or use Lens Studio preview. Check the Logger panel for:
```
[TilePanel] Initializing, device: editor
[RealtimeTextureReceiver] Subscribing to: spectacles:demo:editor
[RealtimeTextureReceiver] SUCCESS: Subscribed to spectacles:demo:editor
[TilePanel] onScene: {"op":"create","id":"header","x":0,"y":10,...}
[TilePanel] onTex: id=header imgLen=8234
[TilePanel] + header at (0.0,10.0,0.05) 25.0x7.5cm
```

## Protocol

### Channels
| Channel | Purpose |
|---------|---------|
| `spectacles:{room}:lobby` | Device discovery (heartbeat, connect, disconnect) |
| `spectacles:{room}:{deviceId}` | Tile streaming (scene ops + textures) |
| `spectacles:{room}` | Default channel when no device ID |

### Events
| Event | Direction | Payload |
|-------|-----------|---------|
| `scene` | web -> glasses | `{op, id, x, y, w, h, ...}` or `{ops: [...]}` |
| `tex` | web -> glasses | `{id, image}` (image is raw base64 JPEG) |
| `interact` | glasses -> web | `{id, type, x, y, u, v, timestamp}` (type: tap, hover, hover_move, hover_exit) |
| `device_connect` | glasses -> lobby | `{deviceId, channelName, timestamp}` |
| `device_heartbeat` | glasses -> lobby | `{deviceId, channelName, timestamp}` |
| `camera` | glasses -> web | `{x, y, z, wx, wy, wz, ts}` (local + world position) |
| `layout` | glasses -> web | `{actions: [...], timestamp}` (gesture-driven layout changes) |
| `sync_request` | glasses -> web | `{deviceId, timestamp}` (request full tile resync) |

### Scene ops
- `create` - new quad: `{op:"create", id, x, y, z, w, h, layer, group, interactive, s}`
- `destroy` - remove quad: `{op:"destroy", id}`
- `visibility` - show/hide: `{op:"visibility", id, visible}`
- `group` - create/position a group container: `{op:"group", id, x, y, z, visible}`
- `group-destroy` - remove a group and all its children: `{op:"group-destroy", id}`
- `move` / `group-move` - currently ignored (static layout after creation)

## Ergonomics

See `SPECTACLES_ERGONOMICS.md` for the full spatial design spec.

Key numbers:
- Comfort distance: 65 cm
- Comfort rectangle: ~47 x 28 cm
- Default tile: 14 cm with 1.5 cm gap
- Body text: 0.5 cm height minimum
- Tap target: 2.0 x 2.0 cm minimum

## Troubleshooting

**"SnapCloudRequirements not configured"**
Assign the SupabaseProject asset in the Inspector.

**Channel subscribes but no events arrive**
- Check channel names match: web sends on `spectacles:{slug}:{deviceId}`, Spectacles subscribes to the same
- Open browser console on the web side - verify "SUBSCRIBED" status
- Default deviceId is "editor" on both sides

**Test quads appear but no streamed tiles**
- Enable `showTestQuads` in Inspector to verify the mesh/material pipeline
- Check Logger for "scene event" or "tex event" messages
- If no events, the channel subscription might be failing - check for auth or network errors

**Textures fail to decode**
- Base64 string might be too large. Check JPEG quality settings in tileRenderers.ts
- Supabase Realtime has a ~1MB message limit. Individual tile textures are typically 5-15KB

**Quads visible but wrong size or position**
- `pixelsPerCm` controls scaling: width_cm = pixel_width / pixelsPerCm
- Positions are in cm, centered at the panel origin
- Layer Z offsets: 0=0.05cm, 1=1.5cm, 2=2.5cm, 3=3.5cm

## Marker Tracking (Optional)

The scene uses Extended Marker Tracking to optionally anchor the AR panel to a physical display. **A marker is not required.** The panel appears at a default position automatically.

**Default mode (no marker):**
1. On launch, a 2-second warmup guard ignores false positive detections from the first frames
2. After 3 seconds with no marker detected, the panel auto-detaches to a default position: 65cm forward, 3cm below eye level
3. If a marker is detected later, the panel repositions to the marker location
4. Spectacles' IMU handles orientation tracking after placement

**Marker mode:**
1. Spectacles camera detects the tracking marker pattern (`tracking-marker.png`) on a physical display
2. The AR panel spawns at the marker position (children start disabled, enabled on detection)
3. With `trackMarkerOnce: true`, the marker is detected once, the panel detaches to world space, and marker tracking is disabled to save performance

**Scene hierarchy:**
```
Extended_Marker_Tracking (root)
  Object 1 [MarkerTrackingComponent]
    RealtimePanel [TilePanel]   <- auto-places after 3s or on marker detection
```

**Why a fixed pattern (not a QR code):**
- Lens Studio imgmarker needs a pre-registered texture baked at build time
- A fixed pattern works across all rooms. Room identity comes from a separate QR code.
- The pattern is designed for high contrast and asymmetric features to improve detection reliability

See [`pi-display/`](../pi-display/) for the physical display setup and tracking strategy.

## Web Broadcast

The web dashboard at `/r/{room-slug}/spectacles` serves as the broadcaster. It maintains a Supabase Realtime channel and streams room activity, Gemini chat, and destination progress to Spectacles devices.

1. Open the Eywa lens on Spectacles
2. Navigate to `/r/{room-slug}/spectacles` in a browser
3. Click "Start Broadcast"
4. The AR panel appears automatically (or at a marker if one is visible)

Channel format: `spectacles:{room}:{deviceId}` (default deviceId: "editor").

## Voice Interface (EywaGeminiLive)

Spectacles have a bidirectional voice interface powered by Gemini Live. The user speaks, Gemini responds with audio, and transcriptions relay to the web dashboard in real time. Gemini can also inject messages to the room, letting users steer the agent swarm by voice.

**How it works:**
1. On init, `EywaGeminiLive.ts` fetches recent memories and the destination from Supabase
2. That context becomes Gemini's system instructions ("You are Eywa, a voice assistant for navigating an agent swarm")
3. Mic audio streams to Gemini Live via Snap's WebSocket proxy (no API key needed)
4. Gemini responds with audio (played on the glasses) and text transcription
5. Transcriptions relay to the web via the broadcast channel (`voice_input`, `voice_response`, `voice_inject` events)
6. Gemini has an `inject_message` tool that writes directly to the Supabase memories table, making the message visible to all agents in the room

**Lens Studio setup:**

The scene already has the required dependencies: `MicrophoneRecorder`, `DynamicAudioOutput`, `SnapCloudRequirements`, `Websocket requirements`, and `RealtimeTextureReceiver` (on the TilePanel). You just need to add EywaGeminiLive and wire them together.

1. Create a new SceneObject (right-click scene hierarchy, Add Empty)
2. Name it "EywaVoice"
3. Add `EywaGeminiLive` as a script component (Add Component, Script, select `Assets/EywaGeminiLive.ts`)
4. Wire inputs in the inspector:
   - `websocketRequirementsObj` - drag the "Websocket requirements" SceneObject from the scene hierarchy
   - `dynamicAudioOutput` - drag one of the existing `DynamicAudioOutput` objects
   - `microphoneRecorder` - drag one of the existing `MicrophoneRecorder` objects
   - `textDisplay` - drag a Text component (create one under EywaVoice if needed, or use an existing `TextOutput`)
   - `realtimeReceiver` - drag the `RealtimeTextureReceiver` component from the `TilePanel` object
   - `snapCloudRequirements` - drag the `SnapCloudRequirements` object from the scene
5. Set `voice` to a Gemini voice (Kore, Puck, Aoede, or Zephyr)

The room slug is derived automatically from the `RealtimeTextureReceiver`'s channel name (defaults to "demo"), so there is no separate room slug to configure.

**Testing without Spectacles:**

Run the web app and open the Spectacles broadcast page:

```bash
cd web && npm run dev
# Open http://localhost:5173/r/demo/spectacles
```

Simulate voice events from the browser console. First, import Supabase and create a channel:

```js
const {supabase} = await import('/src/lib/supabase.ts')
const ch = supabase.channel('spectacles:demo:editor', {config:{broadcast:{self:true}}})
ch.subscribe(s => console.log('channel:', s))
```

Once the channel prints "SUBSCRIBED", send test events:

```js
// Simulate user speaking through Spectacles
ch.send({type:'broadcast', event:'voice_input', payload:{text:'What are the agents working on?', timestamp:Date.now()}})

// Simulate Gemini responding
ch.send({type:'broadcast', event:'voice_response', payload:{text:'12 active agents, mostly working on demo polish and VS Code extensions.', timestamp:Date.now()}})

// Simulate a voice-triggered injection to the room
ch.send({type:'broadcast', event:'voice_inject', payload:{message:'Focus on the Spectacles milestone', timestamp:Date.now()}})
```

The voice feed should appear in the chat panel with color-coded entries: purple for user speech, white for Gemini responses, yellow for injections.

**Broadcast channel events (Spectacles to Web):**

| Event | Direction | Payload | Description |
|---|---|---|---|
| `voice_input` | glasses -> web | `{text, timestamp}` | User speech transcription |
| `voice_response` | glasses -> web | `{text, timestamp}` | Gemini response transcription |
| `voice_inject` | glasses -> web | `{message, priority, timestamp}` | Message injected to room |
| `interact` | glasses -> web | `{id, type, x, y, u, v, timestamp}` | Tap/hover on AR panel |
| `scene` | web -> glasses | `{ops: [...]}` | Quad create/move/destroy |
| `tex` | web -> glasses | `{id, image}` | JPEG base64 texture update |
| `cursor` | web -> glasses | `{col, row, u, v}` | Mouse position from web |

## Dependencies

- Lens Studio (latest)
- SpectaclesInteractionKit.lspkg (hand tracking, pinch, Interactable)
- SupabaseClient.lspkg (Snap's Supabase SDK for Lens Studio)
- Supabase project with Realtime enabled
