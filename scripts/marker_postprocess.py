#!/usr/bin/env python3
"""
Post-process a dark-background marker capture into ACeP 7-color.

Extracts particles via brightness threshold, maps colors using HSV hue
so the logo's 4 aurora arms each get a distinct ACeP color:
  Cyan (170-210 deg)   -> Green
  Blue (210-250 deg)   -> Blue
  Purple (250-310 deg) -> Orange
  Pink/Red (310+, <30) -> Red
  Low saturation/value -> Black

Usage: python3 marker_postprocess.py <input_dark.png> <output.png>
"""

import sys
import numpy as np
from PIL import Image

PALETTE = np.array([
    [255, 255, 255],  # 0: White
    [0, 0, 0],        # 1: Black
    [255, 0, 0],      # 2: Red
    [0, 180, 0],      # 3: Green
    [0, 0, 255],      # 4: Blue
    [255, 255, 0],    # 5: Yellow
    [255, 128, 0],    # 6: Orange
], dtype=np.uint8)

WHITE, BLACK, RED, GREEN, BLUE, YELLOW, ORANGE = range(7)


def rgb_to_hsv_arrays(img):
    """Vectorized RGB to HSV. Returns hue (0-360), sat (0-1), val (0-1)."""
    r, g, b = img[:, :, 0] / 255.0, img[:, :, 1] / 255.0, img[:, :, 2] / 255.0
    maxc = np.maximum(np.maximum(r, g), b)
    minc = np.minimum(np.minimum(r, g), b)
    diff = maxc - minc

    val = maxc
    sat = np.where(maxc > 0, diff / maxc, 0)

    hue = np.zeros_like(maxc)
    mask_r = (maxc == r) & (diff > 0)
    mask_g = (maxc == g) & (diff > 0)
    mask_b = (maxc == b) & (diff > 0)

    hue[mask_r] = 60 * (((g[mask_r] - b[mask_r]) / diff[mask_r]) % 6)
    hue[mask_g] = 60 * (((b[mask_g] - r[mask_g]) / diff[mask_g]) + 2)
    hue[mask_b] = 60 * (((r[mask_b] - g[mask_b]) / diff[mask_b]) + 4)

    hue = hue % 360
    return hue, sat, val


def map_to_acep(dark_path, out_path, size=512):
    img = np.array(Image.open(dark_path).convert("RGB"), dtype=np.float64)
    h, w, _ = img.shape

    # Background is ~(8, 10, 18). Particles are brighter.
    brightness = np.max(img, axis=2)
    is_particle = brightness > 30

    hue, sat, val = rgb_to_hsv_arrays(img)

    # Start with white background
    indices = np.full((h, w), WHITE, dtype=np.int32)

    # Apply hue-based mapping only to particle pixels
    p = is_particle

    # Low saturation or low value -> black (outlines, dark areas)
    low = p & ((val < 0.15) | (sat < 0.15))
    indices[low] = BLACK

    # Chromatic particles: map by hue
    chromatic = p & ~low

    # Cyan arm (170-210) -> Green
    m = chromatic & (hue >= 170) & (hue < 210)
    indices[m] = GREEN

    # Blue arm (210-250) -> Blue
    m = chromatic & (hue >= 210) & (hue < 250)
    indices[m] = BLUE

    # Purple arm (250-310) -> Orange
    m = chromatic & (hue >= 250) & (hue < 310)
    indices[m] = ORANGE

    # Pink/Red (310+ or <30) -> Red
    m = chromatic & ((hue >= 310) | (hue < 30))
    indices[m] = RED

    # Yellow (30-80) -> Yellow
    m = chromatic & (hue >= 30) & (hue < 80)
    indices[m] = YELLOW

    # Green-ish (80-170) -> Green
    m = chromatic & (hue >= 80) & (hue < 170)
    indices[m] = GREEN

    result = PALETTE[indices]

    # Resize with Lanczos for smooth shapes
    result_img = Image.fromarray(result)
    result_img = result_img.resize((size, size), Image.LANCZOS)

    # Re-quantize: Lanczos creates anti-aliased intermediate colors
    final = np.array(result_img, dtype=np.float64).reshape(-1, 3)
    pal = PALETTE.astype(np.float64)
    dists = np.array([np.sum((final - c) ** 2, axis=1) for c in pal]).T
    nearest = np.argmin(dists, axis=1)
    clean = pal[nearest].reshape(size, size, 3).astype(np.uint8)

    Image.fromarray(clean).save(out_path)
    print(f"  ACeP 7-color marker: {out_path} ({size}x{size})")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python3 marker_postprocess.py <input_dark.png> <output.png>")
        sys.exit(1)
    map_to_acep(sys.argv[1], sys.argv[2])
