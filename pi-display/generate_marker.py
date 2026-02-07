#!/usr/bin/env python3
"""
Generate the Eywa tracking marker for Spectacles image tracking.

Creates a high-contrast, asymmetric pattern optimized for reliable detection:
- Dark space background with white tracking cells
- Aurora color accents (cyan, purple, pink, blue) for visual identity
- Asymmetric corner markers (different shape per corner) to prevent ambiguity
- Multi-scale features (grid cells + small dots) for detection at various distances
- Aurora gradient border

The same marker image is used across all rooms. Room identity comes from a
separate QR code, not from the tracking pattern.

Output: tracking-marker.png (512x512)
Also copies to web/public/ and eywa-specs/Assets/ if those directories exist.
"""

import os
import math
import random
from PIL import Image, ImageDraw

# Eywa aurora palette
BG = (13, 15, 20)          # space background #0D0F14
WHITE = (255, 255, 255)
CYAN = (21, 209, 255)      # #15D1FF
PURPLE = (130, 61, 252)    # #823DFC
PINK = (231, 43, 118)      # #E72B76
BLUE = (37, 67, 255)       # #2543FF
GREEN = (52, 211, 153)     # #34D399

ACCENT_COLORS = [CYAN, PURPLE, PINK, BLUE, GREEN]


def generate_marker(size=512, output_path="tracking-marker.png"):
    """Generate the Eywa tracking marker."""
    img = Image.new("RGB", (size, size), BG)
    draw = ImageDraw.Draw(img)

    # Seed for reproducibility
    rng = random.Random(42)

    border = 8
    inner = size - border * 2
    cell_count = 10
    cell_size = inner // cell_count

    # Aurora gradient border (4px)
    for i in range(4):
        t = i / 4
        # Cycle through aurora colors around the border
        for x in range(size):
            for edge in [(x, i), (x, size - 1 - i)]:
                frac = x / size
                r = int(CYAN[0] * (1 - frac) + PURPLE[0] * frac)
                g = int(CYAN[1] * (1 - frac) + PURPLE[1] * frac)
                b = int(CYAN[2] * (1 - frac) + PURPLE[2] * frac)
                img.putpixel(edge, (r, g, b))
        for y in range(size):
            for edge in [(i, y), (size - 1 - i, y)]:
                frac = y / size
                r = int(PINK[0] * (1 - frac) + BLUE[0] * frac)
                g = int(PINK[1] * (1 - frac) + BLUE[1] * frac)
                b = int(PINK[2] * (1 - frac) + BLUE[2] * frac)
                img.putpixel(edge, (r, g, b))

    # Grid of tracking cells (asymmetric pattern)
    # Use a fixed seed pattern that's asymmetric and feature-rich
    pattern = [
        [1,1,0,1,0,1,1,0,1,0],
        [0,0,1,0,1,0,0,1,0,1],
        [1,0,1,1,0,0,1,0,1,0],
        [0,1,0,0,1,1,0,1,0,1],
        [1,0,0,1,0,1,1,0,0,1],
        [0,1,1,0,1,0,0,1,1,0],
        [1,0,1,0,0,1,0,0,1,0],
        [0,1,0,1,1,0,1,0,0,1],
        [1,1,0,0,1,0,0,1,0,1],
        [0,0,1,1,0,1,1,0,1,0],
    ]

    for row in range(cell_count):
        for col in range(cell_count):
            x0 = border + col * cell_size
            y0 = border + row * cell_size
            x1 = x0 + cell_size - 2  # 2px gap between cells
            y1 = y0 + cell_size - 2

            if pattern[row][col] == 1:
                # Most cells are white for high contrast
                color = WHITE
                # ~15% of filled cells get an aurora accent
                if rng.random() < 0.15:
                    color = rng.choice(ACCENT_COLORS)
                draw.rectangle([x0, y0, x1, y1], fill=color)

    # Asymmetric corner markers (different shape per corner)
    corner_size = cell_size * 2
    margin = border + 4

    # Top-left: filled purple square
    draw.rectangle(
        [margin, margin, margin + corner_size, margin + corner_size],
        fill=PURPLE
    )

    # Top-right: cyan circle
    tr_x = size - margin - corner_size
    draw.ellipse(
        [tr_x, margin, tr_x + corner_size, margin + corner_size],
        fill=CYAN
    )

    # Bottom-left: pink triangle
    bl_y = size - margin - corner_size
    draw.polygon(
        [(margin + corner_size // 2, bl_y),
         (margin, bl_y + corner_size),
         (margin + corner_size, bl_y + corner_size)],
        fill=PINK
    )

    # Bottom-right: blue diamond
    br_x = size - margin - corner_size
    br_y = size - margin - corner_size
    mid_x = br_x + corner_size // 2
    mid_y = br_y + corner_size // 2
    draw.polygon(
        [(mid_x, br_y),
         (br_x + corner_size, mid_y),
         (mid_x, br_y + corner_size),
         (br_x, mid_y)],
        fill=BLUE
    )

    # Small feature dots between cells (multi-scale features)
    for _ in range(30):
        dx = rng.randint(border + corner_size + 10, size - border - corner_size - 10)
        dy = rng.randint(border + corner_size + 10, size - border - corner_size - 10)
        radius = rng.randint(2, 4)
        color = rng.choice([WHITE] + ACCENT_COLORS)
        draw.ellipse([dx - radius, dy - radius, dx + radius, dy + radius], fill=color)

    img.save(output_path)
    print(f"Generated {output_path} ({size}x{size}px)")

    # Copy to other locations if they exist
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)

    copy_targets = [
        os.path.join(project_root, "web", "public", "tracking-marker.png"),
        os.path.join(project_root, "eywa-specs", "Assets", "tracking-marker.png"),
    ]

    for target in copy_targets:
        target_dir = os.path.dirname(target)
        if os.path.isdir(target_dir):
            img.save(target)
            print(f"  Copied to {target}")


if __name__ == "__main__":
    generate_marker(512, "tracking-marker.png")
