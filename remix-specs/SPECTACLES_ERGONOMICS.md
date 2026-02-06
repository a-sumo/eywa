# Spectacles Spatial Ergonomics Spec

Reference for positioning AR content on Snap Spectacles. All units are centimeters (1 unit = 1 cm in Lens Studio). This spec defines the "sweet spot" - where content is comfortable, readable, and interactive.

## Viewing Distance

| Zone | Distance from eyes | Use case |
|------|-------------------|----------|
| Near | 30-50 cm | Tooltips, quick notifications. Brief glances only. |
| Comfort | 50-80 cm | Primary UI panels. Extended reading and interaction. |
| Mid | 80-120 cm | Secondary info, ambient status. Glanceable. |
| Far | 120-200 cm | World-anchored labels, spatial markers. |

**Default panel distance: 65 cm** (center of comfort zone)

## Field of View

Spectacles FOV is approximately 46 degrees diagonal. Practical content area:

| Axis | Comfortable range | Max before clipping |
|------|-------------------|---------------------|
| Horizontal | -20 to +20 degrees from center | -23 degrees |
| Vertical | -12 to +12 degrees from center | -15 to +10 degrees (slightly lower is better) |

At 65 cm distance, this translates to:

| Axis | Comfortable width/height |
|------|--------------------------|
| Horizontal | ~47 cm total (-23.5 to +23.5) |
| Vertical | ~28 cm total (-14 to +14) |

**Center bias**: Content should cluster slightly below eye center (about 3-5 cm below gaze neutral). People naturally look slightly down.

## Tile Sizing

For a 3x2 tile grid at 65 cm:

| Config | Tile size | Gap | Grid total | Fits comfort zone? |
|--------|-----------|-----|------------|---------------------|
| Compact | 12 cm | 1 cm | 38 x 25 cm | Yes, snug |
| Default | 14 cm | 1.5 cm | 45 x 29.5 cm | Yes, fills it |
| Large | 16 cm | 1 cm | 50 x 33 cm | Tight, edges may clip |

**Recommended: 14 cm tiles, 1.5 cm gap.** Fills the comfort zone without clipping.

## Readable Text

At 65 cm viewing distance:

| Purpose | Min height (cm) | Recommended height (cm) | Approx font in 256px tile |
|---------|-----------------|--------------------------|----------------------------|
| Body text | 0.4 | 0.5-0.6 | 9-11px |
| Labels/captions | 0.3 | 0.4 | 7-9px |
| Headers | 0.6 | 0.8-1.0 | 14-18px |
| Large display | 1.0 | 1.2-1.5 | 22-28px |

**Rule of thumb**: 1 cm text height at 65 cm = roughly 20/40 vision threshold. Keep body text above 0.5 cm.

Characters per line in a 14 cm tile at body text size: ~25-30 characters.

## Interactive Elements

| Element | Min size (cm) | Recommended (cm) | Notes |
|---------|---------------|-------------------|-------|
| Tap target | 1.5 x 1.5 | 2.0 x 2.0 | Pinch is less precise than touch |
| Button | 2.0 x 1.5 | 3.0 x 2.0 | Include padding for miss tolerance |
| List item row | full width x 1.5 | full width x 2.0 | Clear row separation |
| Scroll indicator | 1.0 x 1.0 | 1.5 x 1.5 | Arrows, page dots |

**Pinch precision**: Spectacles pinch gesture has roughly 1-2 cm hit uncertainty at arm's length. Design targets accordingly. Use generous padding and visual hover feedback.

## Tile Placement Zones

The comfort rectangle at 65 cm (~47 x 28 cm) can be divided into zones:

```
        ┌─────────────────────────────────┐
        │         HEADER ZONE             │  Top 4 cm
        │  Status, title, ambient info     │
        ├─────────┬───────────┬───────────┤
        │         │           │           │
        │ LEFT    │  CENTER   │  RIGHT    │  Main 20 cm
        │ NAV     │  FOCUS    │  DETAIL   │
        │         │           │           │
        ├─────────┴───────────┴───────────┤
        │         ACTION ZONE             │  Bottom 4 cm
        │  Buttons, prompts, controls      │
        └─────────────────────────────────┘
```

- **Focus content** (what the user reads most) goes in center.
- **Navigation** (agent list, memory list) goes left, people scan left-to-right.
- **Detail/output** (chat responses, expanded content) goes right.
- **Actions** (prompts, quick actions) go bottom, easy to reach.

## Depth Layering

Tiles don't have to be coplanar. Use Z-offset for emphasis:

| Layer | Z offset from base | Use |
|-------|-------------------|-----|
| Background | 0 cm | Inactive tiles, ambient info |
| Active | 1-2 cm (toward user) | Currently interacted tile |
| Focus | 3-5 cm (toward user) | Expanded/detailed view |
| Overlay | 5-10 cm (toward user) | Modal dialogs, tooltips |

Tiles can animate between layers. Pull a tile forward when the user focuses on it, push it back when done.

## Motion Guidelines

- **Panel follow**: Soft billboard follow, not rigid head-lock. 0.3-0.5s smoothing.
- **Tile transitions**: 200-400ms ease-in-out for position changes.
- **Focus pull**: When Gemini moves a tile forward, 300ms ease with slight overshoot.
- **Hover feedback**: 100ms scale pulse (1.0 to 1.03) on the hovered tile.

## Layout Agent Integration

The Gemini layout agent can use these values to:

1. **Position the grid** at the user's sweet spot (65 cm forward, 3 cm below eye center).
2. **Detach a tile** and move it closer for focus (e.g., "show me the chat" pulls chat tile to 45 cm).
3. **Resize a tile** by scaling its quad (2x scale = 2x tile size in world space).
4. **Rearrange tiles** based on current task (e.g., expand chat to 2 columns during conversation).
5. **Validate placement** against the comfort zone bounds before committing.

The panel's `moveTile(col, row, localPos)` method accepts positions relative to the grid center. The agent should keep tiles within the comfort rectangle.

## Constants for Code

```typescript
// Distances (cm)
const COMFORT_DISTANCE = 65;
const NEAR_DISTANCE = 40;
const FOCUS_PULL_DISTANCE = 50;

// Comfort rectangle at COMFORT_DISTANCE
const COMFORT_WIDTH = 47;
const COMFORT_HEIGHT = 28;
const VERTICAL_OFFSET = -3; // below eye center

// Tile defaults
const DEFAULT_TILE_SIZE = 14;
const DEFAULT_TILE_GAP = 1.5;

// Interactive minimums
const MIN_TAP_TARGET = 2.0;
const PINCH_UNCERTAINTY = 1.5;

// Text heights (cm, at COMFORT_DISTANCE)
const TEXT_BODY = 0.5;
const TEXT_HEADER = 0.8;
const TEXT_CAPTION = 0.4;

// Animation
const TILE_TRANSITION_MS = 300;
const HOVER_SCALE = 1.03;
const FOLLOW_SMOOTHING = 0.4;
```
