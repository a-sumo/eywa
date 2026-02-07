#!/usr/bin/env python3
"""
E-Ink Display Test - Run this first to verify your wiring.

Draws a test pattern on the Waveshare 5.65" 7-Color e-Paper.
Shows all 7 colors, text, shapes, and a grid to check for dead pixels.

Without the Waveshare library, saves a preview PNG instead.

Prerequisites:
  - SPI enabled on the Pi
  - Waveshare library installed (see EINK_GUIDE.md)
  - pip install Pillow

Usage:
  python3 test_eink.py              # draw to display (or preview if no hardware)
  python3 test_eink.py --preview    # force PNG output even with hardware present
  python3 test_eink.py --clear      # clear the display to white and exit
"""

import os
import sys
import argparse
import time

from PIL import Image, ImageDraw, ImageFont

# --- Display size ---
# Waveshare 5.65" ACeP is 600x448.
WIDTH = 600
HEIGHT = 448

# The 7 colors this display can actually produce.
# These are the only colors the hardware supports. Any other RGB value
# gets dithered/quantized to the nearest one of these.
COLORS = {
    "black":  (0, 0, 0),
    "white":  (255, 255, 255),
    "red":    (255, 0, 0),
    "green":  (0, 255, 0),
    "blue":   (0, 0, 255),
    "yellow": (255, 255, 0),
    "orange": (255, 128, 0),
}

# Try loading the Waveshare driver
try:
    from waveshare_epd import epd5in65f
    HAS_EPD = True
except ImportError:
    HAS_EPD = False


def load_font(size: int):
    """Load DejaVu font, fall back to Pillow default."""
    try:
        return ImageFont.truetype(
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", size
        )
    except (FileNotFoundError, OSError):
        return ImageFont.load_default()


def render_test_pattern() -> Image.Image:
    """Render a test image that exercises all 7 e-ink colors."""
    img = Image.new("RGB", (WIDTH, HEIGHT), COLORS["white"])
    draw = ImageDraw.Draw(img)

    font_big = load_font(28)
    font_med = load_font(16)
    font_sm = load_font(12)

    # === Header ===
    draw.text((20, 12), "Eywa E-Ink Test", fill=COLORS["black"], font=font_big)
    draw.text((20, 46), f"{WIDTH}x{HEIGHT} - 7-color ACeP", fill=COLORS["black"], font=font_sm)
    draw.line([(20, 68), (WIDTH - 20, 68)], fill=COLORS["black"], width=2)

    # === Color swatches ===
    # A row of labeled color blocks. If any color is wrong or missing,
    # your display or wiring has an issue.
    swatch_y = 82
    swatch_size = 50
    x = 20
    for name, color in COLORS.items():
        # Swatch
        draw.rectangle(
            [x, swatch_y, x + swatch_size, swatch_y + swatch_size],
            fill=color,
            outline=COLORS["black"],
            width=1,
        )
        # Label below
        label_color = COLORS["black"]
        draw.text((x, swatch_y + swatch_size + 4), name, fill=label_color, font=font_sm)
        x += swatch_size + 22

    # === Shapes ===
    shape_y = 175
    draw.text((20, shape_y), "Shape rendering:", fill=COLORS["black"], font=font_med)
    shape_y += 28

    # Filled circles
    draw.ellipse([30, shape_y, 80, shape_y + 50], fill=COLORS["red"])
    draw.ellipse([100, shape_y, 150, shape_y + 50], fill=COLORS["green"])
    draw.ellipse([170, shape_y, 220, shape_y + 50], fill=COLORS["blue"])

    # Outlined rectangles
    draw.rectangle([250, shape_y, 310, shape_y + 50], outline=COLORS["orange"], width=3)
    draw.rectangle([330, shape_y, 390, shape_y + 50], outline=COLORS["yellow"], width=3)

    # Diagonal lines
    draw.line([(420, shape_y), (500, shape_y + 50)], fill=COLORS["black"], width=2)
    draw.line([(420, shape_y + 50), (500, shape_y)], fill=COLORS["red"], width=2)

    # === Text sizes ===
    text_y = 260
    draw.text((20, text_y), "Text rendering:", fill=COLORS["black"], font=font_med)
    text_y += 28

    sizes = [8, 10, 12, 16, 20, 24]
    for size in sizes:
        f = load_font(size)
        draw.text((20, text_y), f"{size}px - The quick brown fox", fill=COLORS["black"], font=f)
        text_y += size + 6

    # === Pixel grid (top-right) ===
    # A checkerboard pattern to check for stuck or dead pixels.
    grid_x, grid_y = WIDTH - 140, 82
    grid_size = 120
    cell = 6
    draw.text((grid_x, grid_y - 16), "Pixel grid:", fill=COLORS["black"], font=font_sm)
    for row in range(grid_size // cell):
        for col in range(grid_size // cell):
            if (row + col) % 2 == 0:
                px = grid_x + col * cell
                py = grid_y + row * cell
                draw.rectangle([px, py, px + cell - 1, py + cell - 1], fill=COLORS["black"])

    # === Gradient bands (bottom) ===
    # These won't look smooth on 7-color e-ink (it'll quantize to bands).
    # That's expected. This shows you what dithering looks like.
    grad_y = HEIGHT - 70
    draw.text((20, grad_y - 18), "Dither test (bands are normal):", fill=COLORS["black"], font=font_sm)
    for x in range(WIDTH - 40):
        gray = int((x / (WIDTH - 40)) * 255)
        draw.line([(x + 20, grad_y), (x + 20, grad_y + 20)], fill=(gray, gray, gray))

    # Color gradient
    for x in range(WIDTH - 40):
        r = int((x / (WIDTH - 40)) * 255)
        b = 255 - r
        draw.line([(x + 20, grad_y + 25), (x + 20, grad_y + 45)], fill=(r, 0, b))

    # === Footer ===
    draw.line([(20, HEIGHT - 22), (WIDTH - 20, HEIGHT - 22)], fill=COLORS["black"], width=1)
    draw.text((20, HEIGHT - 18), "If all colors and shapes look correct, your wiring works.",
              fill=COLORS["black"], font=font_sm)

    return img


def display_to_epd(img: Image.Image):
    """Push image to the physical e-Paper display."""
    print("Initializing display...")
    epd = epd5in65f.EPD()
    epd.init()

    print("Clearing display (this takes ~25s)...")
    epd.Clear()

    print("Drawing test pattern (this takes ~25s)...")
    epd.display(epd.getbuffer(img))

    print("Putting display to sleep.")
    epd.sleep()


def clear_display():
    """Clear the display to white."""
    if not HAS_EPD:
        print("No Waveshare library found. Can't clear physical display.")
        return

    print("Clearing display to white...")
    epd = epd5in65f.EPD()
    epd.init()
    epd.Clear()
    epd.sleep()
    print("Done.")


def main():
    parser = argparse.ArgumentParser(description="E-Ink Display Test")
    parser.add_argument(
        "--preview", action="store_true",
        help="Save PNG preview instead of writing to display"
    )
    parser.add_argument(
        "--clear", action="store_true",
        help="Clear display to white and exit"
    )
    parser.add_argument(
        "--output", default="/tmp/eywa_eink_test.png",
        help="Preview output path (default: /tmp/eywa_eink_test.png)"
    )
    args = parser.parse_args()

    if args.clear:
        clear_display()
        return

    print(f"Rendering test pattern ({WIDTH}x{HEIGHT})...")
    img = render_test_pattern()

    if args.preview or not HAS_EPD:
        img.save(args.output)
        print(f"Preview saved to {args.output}")
        if not HAS_EPD and not args.preview:
            print("(Waveshare library not found, fell back to preview mode)")
        return

    display_to_epd(img)
    print("Test complete. Check your display.")


if __name__ == "__main__":
    main()
