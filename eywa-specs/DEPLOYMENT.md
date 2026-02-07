# Spectacles Deployment & Tracker-Based Auto-Join

This document describes the end‑user flow and the “tracker trick” that makes the UI appear without manually opening the web broadcaster.

## Goal

End users put on Spectacles and immediately see the Eywa panel anchored to the e‑ink display. No manual “Broadcast” button.

## Key Idea: Tracker Marker Encodes the Room

The physical display (e‑ink or dynamic) shows a **tracking marker texture**. That marker serves two purposes:

1. **Visual anchor**: Spectacles image tracking provides a stable world pose for the display surface.
2. **Room encoding**: The marker encodes the room slug (or ID), so the glasses can auto‑join the correct Supabase channel.

This makes the marker the **dynamic root** of the entire UI.

## End‑User Flow

1. User puts on Spectacles.
2. The display shows the tracking marker.
3. Spectacles recognizes the marker and:
   - Decodes the room slug from the marker.
   - Sets the panel root transform to the marker pose.
4. The glasses subscribe to `spectacles:{room}:{deviceId}`.
5. The UI appears anchored to the display in 3D space.

## System Flow (Detailed)

### 1) Marker on the Display

The e‑ink/dynamic display renders a marker image that:
- contains the **room slug** (or room ID) encoded in a payload region
- includes tracking features for Spectacles’ image tracking

### 2) Marker Detection on Spectacles

Spectacles image tracking returns:
- **Pose**: 3D transform of the marker
- **Payload**: decoded room slug

### 3) Root Anchoring

The Spectacles client uses the marker pose as the root of the Eywa panel:

```
Marker Pose (world)
  └── MicroTilePanel root (local space)
       └── group nodes (headers, cards, chat)
            └── atomic quads (text, bg, icons)
```

### 4) Auto‑Join Room

With the room slug from the marker:
- Construct the Supabase channel: `spectacles:{room}:{deviceId}`
- Subscribe immediately (no web UI required)

### 5) UI Render Pipeline

Once subscribed, the existing pipeline renders the UI:

```
Web: computeLayout → TileScene → scene/tex ops
Supabase Realtime broadcast
Spectacles: MicroTilePanel applies ops + textures
```

## Why This Works Well

- **Zero‑friction UX**: no app UI or manual pairing
- **Stable anchor**: marker provides precise world alignment
- **Dynamic room routing**: change the room by changing the marker

## Marker Encoding (Recommended)

Define a robust, forward‑compatible encoding scheme:

```
version: 1
room:    {slug}
ts:      {optional timestamp}
sig:     {optional checksum}
```

This can be encoded as:
- QR‑style glyphs inside the marker
- A tiny base‑n payload strip in a reserved region

The exact encoding is up to you; the important property is:
**“image tracking payload → room slug”**

## Failure Modes & Fallbacks

| Issue | Behavior |
|------|----------|
| Marker lost | Hold last pose; fade UI; attempt re‑acquire |
| Marker unreadable | Show “scan display” prompt or hide UI |
| Room invalid | Join `spectacles:demo` or a “lobby” channel |

## Implementation Notes

### Spectacles

- Image tracking provides marker pose.
- Marker decode returns room slug.
- `MicroTilePanel` root moves to the marker pose.
- Subscribes to Supabase room channel immediately.

### Web

- Broadcast continues as normal.
- No need for manual “Broadcast” in end‑user flow.
- Optional: a “Presenter” web view can still broadcast for dev.

## Dev Workflow vs Production

**Dev (today):**
1. Open `/r/{room}/spectacles`
2. Click “Broadcast”
3. Glasses subscribe and render

**Production (target):**
1. User sees marker
2. Glasses auto‑join room
3. UI renders without manual web action

## Next Steps (Engineering)

1. Implement marker payload decode for room slug.
2. Attach panel root to marker pose.
3. Auto‑join the decoded room channel.
4. Add fallback UI when marker not found.
