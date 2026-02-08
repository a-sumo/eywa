#!/usr/bin/env python3
"""
Eywa Mini E-Paper Display for Waveshare 2.13" V4
Compact status display: mascot + room info on 250x122 black/white.

Hardware: Waveshare 2.13inch E-Paper Display Hat V4, 250x122, B/W, SPI
Install: pip install spidev RPi.GPIO Pillow requests

Usage:
  python3 epaper_mini.py --room demo --preview
  python3 epaper_mini.py --room demo
  python3 epaper_mini.py --room demo --once
"""

import os
import sys
import time
import math
import argparse
import hashlib
from datetime import datetime, timedelta

import requests
from PIL import Image, ImageDraw, ImageFont

try:
    from waveshare_epd import epd2in13_V4
    HAS_EPD = True
except ImportError:
    HAS_EPD = False
    print("Warning: waveshare_epd not found, running in preview mode")

# --- Configuration ---

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")

WIDTH = 250
HEIGHT = 122

BLACK = 0
WHITE = 255


def load_font(path: str, size: int):
    try:
        return ImageFont.truetype(path, size)
    except (FileNotFoundError, OSError):
        return ImageFont.load_default()


# --- Mascot (black/white, 1:1 pixel mapping) ---
# Cross body as (x, dy) pairs relative to body center at (15, 0)

_MASCOT_BODY = [
    (15,-6),(16,-6),
    (15,-5),(16,-5),
    (14,-4),(15,-4),(16,-4),(17,-4),
    (14,-3),(15,-3),(16,-3),(17,-3),
    (12,-2),(13,-2),(14,-2),(15,-2),(16,-2),(17,-2),(18,-2),(19,-2),
    (11,-1),(12,-1),(13,-1),(14,-1),(15,-1),(16,-1),(17,-1),(18,-1),(19,-1),(20,-1),
    (11, 0),(12, 0),(13, 0),(14, 0),(15, 0),(16, 0),(17, 0),(18, 0),(19, 0),(20, 0),
    (12,+1),(13,+1),(14,+1),(15,+1),(16,+1),(17,+1),(18,+1),(19,+1),
    (14,+2),(15,+2),(16,+2),(17,+2),
    (14,+3),(15,+3),(16,+3),(17,+3),
    (15,+4),(16,+4),
    (15,+5),(16,+5),
]

_MASCOT_EYES = [(14, -1), (14, 0), (17, -1), (17, 0)]

# Static tendril arcs at rest pose
_TOTAL_ARC = math.pi * 1.1
_TENDRIL_SEGS = 28
_TENDRIL_SEG_LEN = 0.82
_NUM_TENDRILS = 8


def _compute_static_tendrils():
    positions = []
    rs, hs = [0.0], [0.0]
    r, h = 0.0, 0.0
    for s in range(_TENDRIL_SEGS):
        t = s / (_TENDRIL_SEGS - 1)
        bend = t ** 1.3
        angle = math.pi / 2 - _TOTAL_ARC * bend
        r += math.cos(angle) * _TENDRIL_SEG_LEN
        h += math.sin(angle) * _TENDRIL_SEG_LEN
        rs.append(r)
        hs.append(h)

    bx = 15.5
    for ti in range(_NUM_TENDRILS):
        theta = (ti / _NUM_TENDRILS) * math.pi * 2
        for s in range(_TENDRIL_SEGS):
            sx = round(bx + rs[s + 1] * math.cos(theta))
            sy = round(-hs[s + 1] - 6)  # -6 = tendrilTop offset
            positions.append((sx, sy))
    return positions


_MASCOT_TENDRILS = _compute_static_tendrils()


def draw_mascot_bw(draw, ox: int, oy: int):
    """Draw mascot at 1:1 pixel scale (32x32 grid) in black on white."""
    cy = oy + 18  # body center Y

    # Tendrils (black dots)
    for (tx, ty) in _MASCOT_TENDRILS:
        px = ox + tx
        py = cy + ty
        if 0 <= px < WIDTH and 0 <= py < HEIGHT:
            draw.point((px, py), fill=BLACK)

    # Body (black pixels, overwrite tendrils)
    for (bx, dy) in _MASCOT_BODY:
        px = ox + bx
        py = cy + dy
        if 0 <= px < WIDTH and 0 <= py < HEIGHT:
            draw.point((px, py), fill=BLACK)

    # Eyes are part of body (already black), but clear them as white for contrast
    # Actually, for B/W at this scale eyes blend in. Leave them as black body pixels.


# --- Supabase ---

def fetch_room_info(room_slug: str) -> dict:
    """Fetch room metadata from Supabase."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        return {
            "name": room_slug,
            "slug": room_slug,
            "agent_count": 3,
            "agents": ["quiet-oak", "sunny-wolf", "blue-tree"],
            "last_activity": "2m ago",
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
            return {"name": room_slug, "slug": room_slug, "agent_count": 0, "agents": [], "last_activity": ""}

        room = rooms[0]
        room_id = room["id"]

        cutoff = (datetime.utcnow() - timedelta(hours=24)).isoformat()
        resp2 = requests.get(
            f"{SUPABASE_URL}/rest/v1/memories",
            params={
                "room_id": f"eq.{room_id}",
                "ts": f"gt.{cutoff}",
                "select": "agent,ts",
                "order": "ts.desc",
                "limit": "200",
            },
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
            },
            timeout=10,
        )
        memories = resp2.json()
        agents = list(set(m["agent"] for m in memories)) if memories else []
        agent_names = [a.split("/")[-1] if "/" in a else a for a in agents]

        last_activity = ""
        if memories:
            last_ts = memories[0]["ts"]
            try:
                dt = datetime.fromisoformat(last_ts.replace("Z", "+00:00"))
                diff = datetime.now(dt.tzinfo) - dt
                mins = int(diff.total_seconds() / 60)
                if mins < 1:
                    last_activity = "now"
                elif mins < 60:
                    last_activity = f"{mins}m ago"
                else:
                    last_activity = f"{mins // 60}h ago"
            except Exception:
                last_activity = ""

        return {
            "name": room.get("name") or room_slug,
            "slug": room_slug,
            "agent_count": len(agents),
            "agents": agent_names[:5],
            "last_activity": last_activity,
        }
    except Exception as e:
        print(f"  Fetch error: {e}")
        return {"name": room_slug, "slug": room_slug, "agent_count": 0, "agents": [], "last_activity": ""}


# --- Rendering ---

def render_display(room_info: dict) -> Image.Image:
    """Render the 250x122 mini display.

    Layout:
    +--------+------------------------------------+
    | Mascot | Room: /name                        |
    | 32x32  | N agents: name1, name2, ...        |
    | static | Last activity: Xm ago              |
    +--------+------------------------------------+
      ~40px                 ~210px
    """
    img = Image.new("L", (WIDTH, HEIGHT), WHITE)
    draw = ImageDraw.Draw(img)

    font_title = load_font("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 14)
    font_body = load_font("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 11)
    font_small = load_font("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 9)

    # Left: mascot (32x32 at 1:1, centered vertically in 122px)
    mascot_x = 4
    mascot_y = (HEIGHT - 32) // 2
    draw_mascot_bw(draw, mascot_x, mascot_y)

    # Vertical separator
    sep_x = 42
    draw.line([(sep_x, 8), (sep_x, HEIGHT - 8)], fill=BLACK, width=1)

    # Right: room info
    text_x = 50
    y = 10

    # Room name
    room_name = room_info.get("name", "demo")
    draw.text((text_x, y), f"/{room_name}", fill=BLACK, font=font_title)
    y += 22

    # Agent count + names
    agent_count = room_info.get("agent_count", 0)
    agents_list = room_info.get("agents", [])
    count_text = f"{agent_count} agent{'s' if agent_count != 1 else ''}"
    draw.text((text_x, y), count_text, fill=BLACK, font=font_body)
    y += 16

    if agents_list:
        names_str = ", ".join(agents_list[:4])
        if len(agents_list) > 4:
            names_str += f" +{len(agents_list) - 4}"
        # Truncate if too long for display
        if len(names_str) > 30:
            names_str = names_str[:28] + "..."
        draw.text((text_x, y), names_str, fill=BLACK, font=font_small)
        y += 14

    # Last activity
    last_activity = room_info.get("last_activity", "")
    if last_activity:
        draw.text((text_x, y), f"Last: {last_activity}", fill=BLACK, font=font_small)
        y += 14

    # Footer: eywa-ai.dev
    draw.text((text_x, HEIGHT - 14), "eywa-ai.dev", fill=BLACK, font=font_small)

    return img


# --- Display ---

def display_image(img: Image.Image, epd=None, partial: bool = False):
    """Push image to e-paper display or save preview."""
    if not HAS_EPD or epd is None:
        img.save("/tmp/eywa_epaper_mini_preview.png")
        print("Preview saved to /tmp/eywa_epaper_mini_preview.png")
        return

    if partial:
        epd.displayPartial(epd.getbuffer(img))
    else:
        epd.display(epd.getbuffer(img))


def main():
    parser = argparse.ArgumentParser(description="Eywa Mini E-Paper Display")
    parser.add_argument("--room", default="demo", help="Room slug")
    parser.add_argument("--interval", type=int, default=30, help="Refresh interval in seconds (default 30)")
    parser.add_argument("--once", action="store_true", help="Render once and exit")
    parser.add_argument("--preview", action="store_true", help="Save PNG preview instead of driving hardware")
    args = parser.parse_args()

    print(f"Eywa Mini E-Paper - Room: {args.room}")
    print(f"Display: {WIDTH}x{HEIGHT}")

    epd = None
    if HAS_EPD and not args.preview:
        epd = epd2in13_V4.EPD()
        epd.init()
        epd.Clear()
        print("E-paper initialized")

    last_hash = None
    full_refresh_counter = 0
    FULL_REFRESH_INTERVAL = 20  # full refresh every ~10min at 30s intervals

    while True:
        try:
            print(f"\n[{datetime.now().strftime('%H:%M:%S')}] Fetching room info...")
            room_info = fetch_room_info(args.room)
            print(f"  Room: {room_info['name']}, {room_info['agent_count']} agents")

            img = render_display(room_info)
            img_hash = hashlib.md5(img.tobytes()).hexdigest()

            if img_hash != last_hash:
                print("  Content changed, updating display...")
                full_refresh_counter += 1
                use_partial = last_hash is not None and full_refresh_counter < FULL_REFRESH_INTERVAL

                if not use_partial:
                    full_refresh_counter = 0

                display_image(img, epd, partial=use_partial)
                last_hash = img_hash
            else:
                print("  No change, skipping refresh")

        except Exception as e:
            print(f"  Error: {e}")

        if args.once:
            break

        print(f"  Sleeping {args.interval}s...")
        time.sleep(args.interval)

    if epd is not None:
        epd.sleep()
        print("Display sleeping")


if __name__ == "__main__":
    main()
