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
