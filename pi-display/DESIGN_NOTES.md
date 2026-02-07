# E-Ink Display Design Notes

## Display constraints (Waveshare 5.65" 7-Color ACeP)

- 600x448 pixels, 7 colors (black, white, red, green, blue, yellow, orange)
- Every refresh takes 15-30 seconds with full-screen flicker. No partial refresh.
- Sending only B/W does not speed up the refresh. The controller runs the full 7-color cycle regardless.
- Large black areas show visible dot patterns from ACeP dithering. Avoid large solid black fills.
- Fine detail (small squares, thin lines, small text) gets lost in the dithering. Use bold shapes.
- Best results with 2-3 colors. More colors = more visible dithering artifacts.

## Design direction

The e-ink display is a **poster**, not a monitor. It renders once and holds the image indefinitely.

### Content (static, rarely refreshes)
- Large Eywa logo (the 4-arm star in brand colors)
- "Eywa" title text, large
- Room name and agent count
- URL and author credit
- Large tracking marker for Spectacles AR anchoring (~half display height)

### Tracking marker redesign
- Current marker: 10x10 grid of small squares on dark background. Too many fine features, dark BG shows ACeP dots.
- New direction: **fluid, organic shapes on white background**. Fewer but larger features.
- Use 2-3 colors max (black + white + one accent, or black + white only for maximum contrast).
- Asymmetric design (needed for tracking to determine orientation).
- Larger corner markers, organic curves instead of grid squares.
- Should look good as a design element, not just a functional tracking target.
- Must remain reliably detectable by Spectacles image tracking at the printed/displayed size.

### Color strategy
- White background (clean on e-ink, no dithering)
- Black for text, lines, marker features (highest contrast)
- Logo keeps its original colors (cyan, purple, pink, blue) since it's a small element and the color adds life
- Marker: black on white for max tracking contrast, accent color only in corner markers

### What goes on the TFT instead
- Agent list with status, tasks, memory counts
- Touch interaction (inject messages, browse agents)
- Anything that updates frequently
- No tracking marker (glossy LCD = reflections = bad for image tracking)
