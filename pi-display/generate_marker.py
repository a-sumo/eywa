#!/usr/bin/env python3
"""
Generate the tracking marker image for Lens Studio.
Creates a high-resolution PNG of the asymmetric marker pattern.
"""

from PIL import Image, ImageDraw

# Marker pattern (8x8) - same as in MiniEywaEink.tsx
# 1=filled (dark), 0=empty (white)
PATTERN = [
    [1,1,1,1,1,1,1,1],
    [1,0,0,0,0,0,0,1],
    [1,0,1,1,0,1,0,1],
    [1,0,1,0,0,1,0,1],
    [1,0,0,0,1,1,0,1],
    [1,0,1,0,0,0,0,1],
    [1,0,0,1,0,1,0,1],
    [1,1,1,1,1,1,1,1],
]

# Colors (pastel palette to match e-ink)
DARK = (107, 114, 128)   # soft gray #6B7280
LIGHT = (255, 253, 248)  # warm cream #FFFDF8

def generate_marker(size=512, output_path="eywa_tracking_marker.png"):
    """Generate marker at specified size."""
    cell_size = size // 8
    actual_size = cell_size * 8

    img = Image.new("RGB", (actual_size, actual_size), LIGHT)
    draw = ImageDraw.Draw(img)

    for y, row in enumerate(PATTERN):
        for x, cell in enumerate(row):
            if cell == 1:
                x0 = x * cell_size
                y0 = y * cell_size
                x1 = x0 + cell_size
                y1 = y0 + cell_size
                draw.rectangle([x0, y0, x1, y1], fill=DARK)

    # Add corner marker for orientation (2x2 cells at top-left inner)
    cx, cy = cell_size, cell_size
    draw.rectangle([cx, cy, cx + cell_size * 2, cy + cell_size * 2], fill=DARK)

    img.save(output_path)
    print(f"Generated {output_path} ({actual_size}x{actual_size}px)")

    # Also generate a high-contrast version for better tracking
    hc_dark = (0, 0, 0)
    hc_light = (255, 255, 255)

    img_hc = Image.new("RGB", (actual_size, actual_size), hc_light)
    draw_hc = ImageDraw.Draw(img_hc)

    for y, row in enumerate(PATTERN):
        for x, cell in enumerate(row):
            if cell == 1:
                x0 = x * cell_size
                y0 = y * cell_size
                x1 = x0 + cell_size
                y1 = y0 + cell_size
                draw_hc.rectangle([x0, y0, x1, y1], fill=hc_dark)

    draw_hc.rectangle([cx, cy, cx + cell_size * 2, cy + cell_size * 2], fill=hc_dark)

    hc_path = output_path.replace(".png", "_highcontrast.png")
    img_hc.save(hc_path)
    print(f"Generated {hc_path} (high contrast version)")


if __name__ == "__main__":
    generate_marker(512, "eywa_tracking_marker.png")
