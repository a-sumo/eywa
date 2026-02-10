# Video

Programmatic video composition using [Remotion](https://www.remotion.dev/). Composites founder video, product demo, and landing page recordings into a single output with animated PIP transitions and aurora glow effects.

## Setup

```bash
cd video
npm install
```

Place source videos in `public/` (gitignored):
- `FounderVideo-trimmed.mp4` - founder talking to camera
- `eywa-demo-web-hq.mp4` - product demo (from `web/demo/recordings/`)
- `eywa-landing-hero.mp4` - landing page hero (particle sim loop)

## Usage

```bash
# Preview in browser with timeline scrubbing
npm run studio

# Render final MP4
npm run render
```

## Configuration

Edit `src/config.ts` to change:
- **Segments**: timing, order, which video shows when
- **PIP emphasis**: `"small"` / `"medium"` / `"large"` per segment
- **PIP position**: corner placement
- **Aurora glow**: colors, cycle speed
- **Transition duration**: crossfade timing

## How it works

Three video layers, all always mounted (no glitches at transitions):
1. **Landing page** - looping hero clip, opacity-controlled
2. **Demo** - product walkthrough, opacity-controlled
3. **Founder** - animates between full-screen and PIP corner

Founder audio plays continuously as the voiceover. Demo and landing are muted.
