#!/usr/bin/env python3
"""
Generate the Eywa tracking marker for Spectacles image tracking.

White background, Eywa logo at center, scattered aurora particles,
elegant corner accents. Designed to look good on e-ink and be
reliably detectable by image tracking.

Output: tracking-marker.png (512x512)
Also copies to web/public/ and eywa-specs/Assets/ if those directories exist.
"""

import os
import math
import random
from PIL import Image, ImageDraw

# Eywa aurora palette
BG = (255, 255, 255)
BLACK = (0, 0, 0)
CYAN = (21, 209, 255)
PURPLE = (130, 61, 252)
PINK = (231, 43, 118)
BLUE = (37, 67, 255)
GREEN = (52, 211, 153)

AURORA = [CYAN, PURPLE, PINK, BLUE, GREEN]


def load_logo(size: int) -> Image.Image:
    """Load the Eywa logo PNG."""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    paths = [
        os.path.join(script_dir, "eywalogo.png"),
        os.path.join(script_dir, "..", "eywalogo.png"),
        os.path.join(script_dir, "..", "web", "public", "logo-512.png"),
    ]
    for p in paths:
        if os.path.exists(p):
            img = Image.open(p).convert("RGBA")
            img.thumbnail((size, size), Image.LANCZOS)
            return img
    return None


def draw_arc(draw, cx, cy, r, start_deg, end_deg, color, width=3):
    """Draw an arc (portion of ellipse outline)."""
    bbox = [cx - r, cy - r, cx + r, cy + r]
    draw.arc(bbox, start_deg, end_deg, fill=color, width=width)


def generate_marker(size=512, output_path="tracking-marker.png"):
    """Generate the Eywa tracking marker."""
    img = Image.new("RGB", (size, size), BG)
    draw = ImageDraw.Draw(img)
    rng = random.Random(42)

    margin = 20
    center = size // 2

    # --- Bold outer border ---
    draw.rectangle([margin, margin, size - margin, size - margin], outline=BLACK, width=5)

    # --- Corner accents: curved arcs in aurora colors ---
    # Each corner gets a different arc configuration for asymmetry.
    # Thick lines so they survive e-ink speckle/dithering.
    corner_inset = 55
    arc_r = 50

    # Top-left: two nested cyan arcs (quarter circle, opening toward center)
    draw_arc(draw, margin + corner_inset, margin + corner_inset, arc_r, 0, 90, CYAN, 8)
    draw_arc(draw, margin + corner_inset, margin + corner_inset, arc_r - 16, 0, 90, CYAN, 6)

    # Top-right: single purple arc + dot
    draw_arc(draw, size - margin - corner_inset, margin + corner_inset, arc_r, 90, 180, PURPLE, 8)
    draw.ellipse([
        size - margin - corner_inset - 10, margin + corner_inset - 10,
        size - margin - corner_inset + 10, margin + corner_inset + 10,
    ], fill=PURPLE)

    # Bottom-left: pink arc, larger sweep
    draw_arc(draw, margin + corner_inset, size - margin - corner_inset, arc_r, 270, 360, PINK, 8)
    draw_arc(draw, margin + corner_inset, size - margin - corner_inset, arc_r + 14, 300, 350, PINK, 6)

    # Bottom-right: blue arc pair, offset
    draw_arc(draw, size - margin - corner_inset, size - margin - corner_inset, arc_r, 180, 270, BLUE, 8)
    draw_arc(draw, size - margin - corner_inset + 10, size - margin - corner_inset - 10, arc_r - 12, 200, 260, BLUE, 6)

    # --- Particles: scattered aurora dots of varying sizes ---
    # These give multi-scale features for tracking detection.
    # Distributed in a ring around the center, avoiding the logo area.
    particles = []
    logo_radius = 80  # keep clear for logo
    border_keep = margin + 60  # keep clear of corners

    for _ in range(300):
        angle = rng.uniform(0, 2 * math.pi)
        dist = rng.uniform(logo_radius + 20, center - border_keep)
        x = center + dist * math.cos(angle)
        y = center + dist * math.sin(angle)
        r = rng.uniform(5, 16)

        # Check bounds
        if x - r < margin + 30 or x + r > size - margin - 30:
            continue
        if y - r < margin + 30 or y + r > size - margin - 30:
            continue

        # Check overlap with existing particles
        overlap = False
        for px, py, pr in particles:
            if math.sqrt((x - px) ** 2 + (y - py) ** 2) < r + pr + 4:
                overlap = True
                break
        if overlap:
            continue

        particles.append((x, y, r))
        if len(particles) >= 30:
            break

    # Draw particles. Mostly black for contrast, some in aurora colors.
    for i, (x, y, r) in enumerate(particles):
        if rng.random() < 0.25:
            color = rng.choice(AURORA)
        else:
            color = BLACK
        draw.ellipse([x - r, y - r, x + r, y + r], fill=color)

    # --- A few larger accent circles for visual rhythm ---
    accents = [
        (center - 120, center - 100, 7, CYAN),
        (center + 140, center - 80, 6, PURPLE),
        (center - 90, center + 130, 6, PINK),
        (center + 110, center + 110, 8, BLUE),
        (center + 30, center - 150, 5, GREEN),
        (center - 150, center + 40, 5, GREEN),
    ]
    for ax, ay, ar, color in accents:
        if margin + 30 < ax < size - margin - 30 and margin + 30 < ay < size - margin - 30:
            # Ring instead of filled, adds lightness. Thick stroke.
            draw.ellipse([ax - ar * 3, ay - ar * 3, ax + ar * 3, ay + ar * 3], outline=color, width=4)

    # --- Center: Eywa logo ---
    logo_size = 160
    logo = load_logo(logo_size)
    if logo:
        # Composite onto white background
        logo_bg = Image.new("RGB", logo.size, BG)
        logo_bg.paste(logo, mask=logo.split()[3])
        lx = center - logo.width // 2
        ly = center - logo.height // 2
        img.paste(logo_bg, (lx, ly))
    else:
        # Fallback: draw a simple cross
        draw.line([(center - 40, center), (center + 40, center)], fill=BLACK, width=8)
        draw.line([(center, center - 40), (center, center + 40)], fill=BLACK, width=8)

    img.save(output_path)
    print(f"Generated {output_path} ({size}x{size}px)")

    # Copy to other locations
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)

    for target in [
        os.path.join(project_root, "web", "public", "tracking-marker.png"),
        os.path.join(project_root, "eywa-specs", "Assets", "tracking-marker.png"),
    ]:
        if os.path.isdir(os.path.dirname(target)):
            img.save(target)
            print(f"  Copied to {target}")


if __name__ == "__main__":
    generate_marker(512, "tracking-marker.png")
