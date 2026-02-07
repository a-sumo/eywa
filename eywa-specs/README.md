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
- `material` - Unlit material template (drag from Asset Browser)
- `pixelsPerCm` - Scale factor (default 16)
- `showTestQuads` - Toggle colored test quads for pipeline validation

### RealtimeTextureReceiver.ts
Network layer. Connects to Supabase Realtime, subscribes to broadcast channels, handles three protocols:
- **Scene ops** (`scene` event) - forwarded to TilePanel
- **Texture updates** (`tex` event) - base64 JPEG by tile ID
- **Lobby** - device discovery and heartbeat

Also supports legacy modes: single-frame (`frame`) and tile-grid (`tile`).

### RealtimePanel.ts
Fixed-grid mode (legacy). Creates a static NxM quad grid. Each quad has its own material. Simpler than TilePanel but less flexible - tiles can't be created/destroyed dynamically. Includes built-in cursor overlay for interaction feedback.

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

### 4b. Production deployment (auto‑join)
See `DEPLOYMENT.md` for the tracker‑based auto‑join flow. This replaces the manual “Broadcast” step for end users by encoding the room in the display’s tracking marker and anchoring the UI to the marker pose.

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
| `interact` | glasses -> web | `{id, type, timestamp}` (type: tap, hover, hover_exit) |
| `device_connect` | glasses -> lobby | `{deviceId, channelName, timestamp}` |
| `device_heartbeat` | glasses -> lobby | `{deviceId, channelName, timestamp}` |

### Scene ops
- `create` - new quad: `{op:"create", id, x, y, w, h, layer, interactive}`
- `move` - reposition: `{op:"move", id, x, y, s, layer, duration}`
- `destroy` - remove quad: `{op:"destroy", id}`
- `visibility` - show/hide: `{op:"visibility", id, visible}`

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
- Layer Z offsets: 0=0.05cm, 1=0.5cm, 2=1.0cm, 3=2.0cm

## Marker Tracking

The scene uses Extended Marker Tracking to anchor the AR panel to a physical display.

**How it works:**
1. Spectacles camera detects the tracking marker pattern (`tracking-marker.png`) on a physical display
2. The AR panel spawns at the marker position (children start disabled, enabled on detection)
3. A 2-second warmup guard ignores false positives from the first frames
4. With `trackMarkerOnce: true`, the marker is detected once, the panel detaches to world space, and marker tracking is disabled to save performance
5. After detach, Spectacles' IMU handles orientation tracking

**Scene hierarchy:**
```
Extended_Marker_Tracking (root)
  Object 1 [MarkerTrackingComponent]
    RealtimePanel [TilePanel]   <- disabled until marker found
```

**Why a fixed pattern (not a QR code):**
- Lens Studio imgmarker needs a pre-registered texture baked at build time
- A fixed pattern works across all rooms. Room identity comes from a separate QR code.
- The pattern is designed for high contrast and asymmetric features to improve detection reliability

See [`pi-display/`](../pi-display/) for the physical display setup and tracking strategy.

## Dependencies

- Lens Studio (latest)
- SpectaclesInteractionKit.lspkg (hand tracking, pinch, Interactable)
- SupabaseClient.lspkg (Snap's Supabase SDK for Lens Studio)
- Supabase project with Realtime enabled
