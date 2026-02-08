#!/usr/bin/env python3
"""
Eywa E-Ink Display for Waveshare 5.65" 7-Color ACeP
Static branding display with large tracking marker for Spectacles AR.

Hardware: Waveshare 5.65inch e-Paper Module (F) - 600x448, 7-color
Install: pip install Pillow requests

Usage:
  python3 eink_display.py --room demo --once
  python3 eink_display.py --room demo --interval 300
"""

import os
import sys
import time
import math
import argparse
import hashlib
from datetime import datetime

import requests
from PIL import Image, ImageDraw, ImageFont

try:
    from waveshare_epd import epd5in65f
    HAS_EPD = True
except ImportError:
    HAS_EPD = False
    print("Warning: waveshare_epd not found, running in preview mode")

# --- Configuration ---

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")

WIDTH = 600
HEIGHT = 448

# Restrained palette. The ACeP display dithers badly with many colors.
# Black + white + one accent gives the cleanest result.
BLACK = (0, 0, 0)
WHITE = (255, 255, 255)
BLUE = (0, 0, 255)


def load_font(path: str, size: int) -> ImageFont.FreeTypeFont:
    try:
        return ImageFont.truetype(path, size)
    except (FileNotFoundError, OSError):
        return ImageFont.load_default()


# --- Mascot: cross body + static tendrils ---
# Each tuple: (x, dy_from_center, grayscale 0-255)
# Mapped from aurora colors: purple/blue/pink -> dark, cyan -> medium, core -> white, eyes -> black
MASCOT_BODY = [
    # top nub (cyan -> medium gray)
    (15,-6,160),(16,-6,160),
    # up arm (purple -> dark)
    (15,-5,80),(16,-5,80),
    (14,-4,80),(15,-4,80),(16,-4,80),(17,-4,80),
    (14,-3,80),(15,-3,80),(16,-3,80),(17,-3,80),
    # cross bar top (pink, core, cyan)
    (12,-2,70),(13,-2,70),(14,-2,240),(15,-2,240),(16,-2,240),(17,-2,240),(18,-2,160),(19,-2,160),
    # cross bar wide
    (11,-1,70),(12,-1,70),(13,-1,70),(14,-1,240),(15,-1,240),(16,-1,240),(17,-1,240),(18,-1,160),(19,-1,160),(20,-1,160),
    (11, 0,70),(12, 0,70),(13, 0,70),(14, 0,240),(15, 0,240),(16, 0,240),(17, 0,240),(18, 0,160),(19, 0,160),(20, 0,160),
    # cross bar bottom
    (12,+1,70),(13,+1,70),(14,+1,240),(15,+1,240),(16,+1,240),(17,+1,240),(18,+1,160),(19,+1,160),
    # down arm (indigo -> dark)
    (14,+2,60),(15,+2,60),(16,+2,60),(17,+2,60),
    (14,+3,60),(15,+3,60),(16,+3,60),(17,+3,60),
    (15,+4,60),(16,+4,60),
    # bottom nub
    (15,+5,160),(16,+5,160),
]

# Static tendril arcs at rest pose (phase=0.75, no wave, no contraction)
import math as _math
_TOTAL_ARC = _math.pi * 1.1
_TENDRIL_SEGS = 28
_TENDRIL_SEG_LEN = 0.82
_NUM_TENDRILS = 8

def _compute_static_tendrils():
    """Pre-compute static tendril pixel positions for rest pose."""
    arc = _TOTAL_ARC
    positions = []
    # Build profile
    rs, hs = [0.0], [0.0]
    r, h = 0.0, 0.0
    for s in range(_TENDRIL_SEGS):
        t = s / (_TENDRIL_SEGS - 1)
        bend = t ** 1.3
        angle = _math.pi / 2 - arc * bend
        r += _math.cos(angle) * _TENDRIL_SEG_LEN
        h += _math.sin(angle) * _TENDRIL_SEG_LEN
        rs.append(r)
        hs.append(h)

    # Project 8 tendrils around Y axis
    bx, by_offset = 15.5, -6  # tendrilTop relative to body center
    for ti in range(_NUM_TENDRILS):
        theta = (ti / _NUM_TENDRILS) * _math.pi * 2
        for s in range(_TENDRIL_SEGS):
            sx = bx + rs[s + 1] * _math.cos(theta)
            sy = -hs[s + 1]  # relative to tendrilTop
            positions.append((round(sx), round(sy + by_offset)))
    return positions

MASCOT_TENDRILS = _compute_static_tendrils()

# Eyes: two pixels at (14, -1) and (17, -1) relative to body center
MASCOT_EYES = [(14, -1), (17, -1)]


def draw_mascot(draw, ox: int, oy: int, cell_size: int = 4):
    """Draw the Eywa mascot at (ox, oy) on a Pillow ImageDraw.

    The mascot occupies roughly 32x32 grid cells, so total size is 32*cell_size.
    ox, oy is the top-left corner of the bounding box.
    """
    # Body center in the 32x32 grid is at (15.5, 18)
    cx = ox + 15 * cell_size
    cy = oy + 18 * cell_size

    # Tendrils (gray dots)
    tendril_gray = 180
    for (tx, ty) in MASCOT_TENDRILS:
        px = ox + tx * cell_size
        py = cy + ty * cell_size
        if px >= ox and py >= oy:
            draw.rectangle(
                [px, py, px + cell_size - 1, py + cell_size - 1],
                fill=(tendril_gray, tendril_gray, tendril_gray),
            )

    # Body pixels
    for (bx, dy, gray) in MASCOT_BODY:
        px = ox + bx * cell_size
        py = cy + dy * cell_size
        draw.rectangle(
            [px, py, px + cell_size - 1, py + cell_size - 1],
            fill=(gray, gray, gray),
        )

    # Eyes (black)
    for (ex, ey) in MASCOT_EYES:
        px = ox + ex * cell_size
        py = cy + ey * cell_size
        draw.rectangle(
            [px, py, px + cell_size - 1, py + cell_size - 1],
            fill=BLACK,
        )


def load_logo(size: int = 160) -> Image.Image:
    """Load the Eywa logo PNG, scaled to fit within size x size."""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    logo_paths = [
        os.path.join(script_dir, "eywalogo.png"),
        os.path.join(script_dir, "..", "eywalogo.png"),
        os.path.join(script_dir, "..", "web", "public", "logo-512.png"),
    ]

    for path in logo_paths:
        if os.path.exists(path):
            img = Image.open(path).convert("RGBA")
            img.thumbnail((size, size), Image.LANCZOS)
            return img

    # Fallback: draw a simple star shape
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    cx, cy = size // 2, size // 2
    r = size // 2 - 4
    points = []
    for i in range(4):
        angle = math.radians(i * 90 - 90)
        points.append((cx + int(r * math.cos(angle)), cy + int(r * math.sin(angle))))
        angle2 = math.radians(i * 90 - 45)
        points.append((cx + int(r * 0.4 * math.cos(angle2)), cy + int(r * 0.4 * math.sin(angle2))))
    draw.polygon(points, fill=(100, 60, 255, 255))
    return img


def load_tracking_marker(size: int = 200) -> Image.Image:
    """Load the tracking marker PNG."""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    marker_paths = [
        os.path.join(script_dir, "tracking-marker.png"),
        os.path.join(script_dir, "..", "web", "public", "tracking-marker.png"),
        os.path.join(script_dir, "..", "eywa-specs", "Assets", "tracking-marker.png"),
    ]

    for path in marker_paths:
        if os.path.exists(path):
            img = Image.open(path).convert("RGB")
            img = img.resize((size, size), Image.LANCZOS)
            return img

    # Fallback: generate a simple high-contrast pattern
    img = Image.new("RGB", (size, size), WHITE)
    draw = ImageDraw.Draw(img)
    draw.rectangle([0, 0, size - 1, size - 1], outline=BLACK, width=6)
    cell = size // 8
    for r in range(8):
        for c in range(8):
            if (r + c) % 2 == 0:
                draw.rectangle(
                    [c * cell + 2, r * cell + 2, (c + 1) * cell - 2, (r + 1) * cell - 2],
                    fill=BLACK,
                )
    return img


def fetch_room_info(room_slug: str) -> dict:
    """Fetch room metadata from Supabase."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        return {
            "name": room_slug,
            "slug": room_slug,
            "agent_count": 3,
        }

    try:
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/rooms",
            params={"slug": f"eq.{room_slug}", "select": "id,slug,name,metadata"},
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
            },
            timeout=10,
        )
        rooms = resp.json()
        if not rooms:
            return {"name": room_slug, "slug": room_slug, "agent_count": 0}

        room = rooms[0]
        room_id = room["id"]

        # Count distinct agents in last 24h
        from datetime import timedelta
        cutoff = (datetime.utcnow() - timedelta(hours=24)).isoformat()
        resp2 = requests.get(
            f"{SUPABASE_URL}/rest/v1/memories",
            params={
                "room_id": f"eq.{room_id}",
                "ts": f"gt.{cutoff}",
                "select": "agent",
                "limit": "500",
            },
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
            },
            timeout=10,
        )
        memories = resp2.json()
        agents = set(m["agent"] for m in memories) if memories else set()

        return {
            "name": room.get("name") or room_slug,
            "slug": room_slug,
            "agent_count": len(agents),
        }
    except Exception as e:
        print(f"  Fetch error: {e}")
        return {"name": room_slug, "slug": room_slug, "agent_count": 0}


def render_display(room_info: dict) -> Image.Image:
    """Render the e-ink display image.

    Layout (600x448):
    +---------------------------+-----------------+
    |                           |                 |
    |  [Logo]                   |   [Tracking     |
    |                           |    Marker]      |
    |  EYWA                     |                 |
    |                           |   ~220x220      |
    |  room / agent-count       |                 |
    |                           |                 |
    |  eywa-ai.dev              |                 |
    |  by Armand Sumo           |                 |
    |                           |                 |
    +---------------------------+-----------------+
    """
    img = Image.new("RGB", (WIDTH, HEIGHT), WHITE)
    draw = ImageDraw.Draw(img)

    # Fonts
    font_title = load_font("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 48)
    font_subtitle = load_font("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 18)
    font_small = load_font("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 14)
    font_tiny = load_font("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 11)

    # --- Left side: branding ---
    left_w = WIDTH - 240  # 360px for branding, 240px for marker

    # Logo (centered in left column, upper area)
    logo = load_logo(120)
    logo_x = (left_w - logo.width) // 2
    logo_y = 30
    if logo.mode == "RGBA":
        # Composite onto white background
        logo_bg = Image.new("RGB", logo.size, WHITE)
        logo_bg.paste(logo, mask=logo.split()[3])
        img.paste(logo_bg, (logo_x, logo_y))
    else:
        img.paste(logo, (logo_x, logo_y))

    # "Eywa" title
    title_y = logo_y + logo.height + 16
    title_bbox = font_title.getbbox("Eywa")
    title_w = title_bbox[2] - title_bbox[0]
    draw.text(((left_w - title_w) // 2, title_y), "Eywa", fill=BLACK, font=font_title)

    # Thin line under title
    line_y = title_y + 56
    line_margin = 60
    draw.line([(line_margin, line_y), (left_w - line_margin, line_y)], fill=BLACK, width=1)

    # Room info
    info_y = line_y + 16
    room_name = room_info.get("name", "demo")
    room_text = f"/{room_name}"
    room_bbox = font_subtitle.getbbox(room_text)
    room_w = room_bbox[2] - room_bbox[0]
    draw.text(((left_w - room_w) // 2, info_y), room_text, fill=BLACK, font=font_subtitle)

    agent_count = room_info.get("agent_count", 0)
    if agent_count > 0:
        agents_text = f"{agent_count} agent{'s' if agent_count != 1 else ''} active"
        agents_bbox = font_small.getbbox(agents_text)
        agents_w = agents_bbox[2] - agents_bbox[0]
        draw.text(
            ((left_w - agents_w) // 2, info_y + 28),
            agents_text, fill=BLACK, font=font_small,
        )

    # Footer: URL and author
    footer_y = HEIGHT - 60
    url_text = "eywa-ai.dev"
    url_bbox = font_small.getbbox(url_text)
    url_w = url_bbox[2] - url_bbox[0]
    draw.text(((left_w - url_w) // 2, footer_y), url_text, fill=BLACK, font=font_small)

    author_text = "by Armand Sumo"
    author_bbox = font_tiny.getbbox(author_text)
    author_w = author_bbox[2] - author_bbox[0]
    draw.text(
        ((left_w - author_w) // 2, footer_y + 22),
        author_text, fill=BLACK, font=font_tiny,
    )

    # --- Mascot in header area (next to logo, right side of left column) ---
    mascot_cell = 3
    mascot_x = left_w - 32 * mascot_cell - 20  # right-align in left column
    mascot_y = 24
    draw_mascot(draw, mascot_x, mascot_y, mascot_cell)

    # --- Right side: tracking marker ---
    marker_size = 220
    marker = load_tracking_marker(marker_size)
    marker_x = WIDTH - marker_size - 10
    marker_y = (HEIGHT - marker_size) // 2
    img.paste(marker, (marker_x, marker_y))

    # Thin vertical separator
    sep_x = left_w - 4
    draw.line([(sep_x, 20), (sep_x, HEIGHT - 20)], fill=BLACK, width=1)

    return img


def display_image(img: Image.Image):
    """Push image to e-paper display."""
    if not HAS_EPD:
        img.save("/tmp/eywa_eink_preview.png")
        print("Preview saved to /tmp/eywa_eink_preview.png")
        return

    epd = epd5in65f.EPD()
    epd.init()
    epd.Clear()
    epd.display(epd.getbuffer(img))
    epd.sleep()


def main():
    parser = argparse.ArgumentParser(description="Eywa E-Ink Display")
    parser.add_argument("--room", default="demo", help="Room slug")
    parser.add_argument("--interval", type=int, default=300, help="Refresh interval in seconds (default 5min)")
    parser.add_argument("--once", action="store_true", help="Render once and exit")
    args = parser.parse_args()

    print(f"Eywa E-Ink Display - Room: {args.room}")
    print(f"Display: {WIDTH}x{HEIGHT}")
    if not args.once:
        print(f"Refresh interval: {args.interval}s")

    last_hash = None

    while True:
        try:
            print(f"\n[{datetime.now().strftime('%H:%M:%S')}] Fetching room info...")
            room_info = fetch_room_info(args.room)
            print(f"  Room: {room_info['name']}, {room_info['agent_count']} agents")

            img = render_display(room_info)

            img_hash = hashlib.md5(img.tobytes()).hexdigest()
            if img_hash != last_hash:
                print("  Content changed, updating display...")
                display_image(img)
                last_hash = img_hash
            else:
                print("  No change, skipping refresh")

        except Exception as e:
            print(f"  Error: {e}")

        if args.once:
            break

        print(f"  Sleeping {args.interval}s...")
        time.sleep(args.interval)


if __name__ == "__main__":
    main()
