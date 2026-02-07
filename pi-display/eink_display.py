#!/usr/bin/env python3
"""
Eywa E-Ink Display for Waveshare 5.65" 7-Color ACeP
Raspberry Pi ambient display showing agent status.

Hardware: Waveshare 5.65inch e-Paper Module (F) - 600x448, 7-color
Install: pip install Pillow requests waveshare-epd

Usage:
  python eink_display.py --room demo --interval 60
"""

import os
import sys
import time
import argparse
import hashlib
from datetime import datetime, timedelta
from io import BytesIO

import requests
from PIL import Image, ImageDraw, ImageFont

# Waveshare library (install from their repo or pip install waveshare-epd)
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

# 7-color palette (Waveshare ACeP colors)
COLORS = {
    "black": (0, 0, 0),
    "white": (255, 255, 255),
    "red": (255, 0, 0),
    "green": (0, 255, 0),
    "blue": (0, 0, 255),
    "yellow": (255, 255, 0),
    "orange": (255, 128, 0),
}

# Agent colors (map to closest e-ink colors)
AGENT_PALETTE = [
    COLORS["red"],      # pink -> red
    COLORS["blue"],     # purple -> blue
    COLORS["blue"],     # indigo -> blue
    COLORS["blue"],     # blue
    COLORS["green"],    # teal -> green
    COLORS["green"],    # green
    COLORS["yellow"],   # lime -> yellow
    COLORS["orange"],   # orange
]

# Pixel creature sprites (8x8, simplified for e-ink)
CREATURES = {
    "cat": [
        "  X  X  ",
        " XXXXXX ",
        "X.X..X.X",
        "XXXXXXXX",
        "X.XXXX.X",
        "X..XX..X",
        " XXXXXX ",
        "  X  X  ",
    ],
    "dog": [
        "XX    XX",
        "XXXXXXXX",
        "X.X..X.X",
        "XXXXXXXX",
        " XXXXXX ",
        " X XX X ",
        " XXXXXX ",
        "  X  X  ",
    ],
    "bird": [
        "   XX   ",
        "  XXXX  ",
        " X.XX.X ",
        "  XXXX  ",
        "XXXXXXXX",
        "  XXXX  ",
        "  X  X  ",
        "  X  X  ",
    ],
    "fish": [
        "   XXX  ",
        "  XXXXX ",
        "X XXXX X",
        "XX.XXXXX",
        "XX.XXXXX",
        "X XXXX X",
        "  XXXXX ",
        "   XXX  ",
    ],
    "bunny": [
        " X    X ",
        " X    X ",
        " XXXXXX ",
        "X.X..X.X",
        "XXXXXXXX",
        " XX..XX ",
        " XXXXXX ",
        "  X  X  ",
    ],
}


def get_creature(name: str) -> list:
    """Get creature sprite by name or hash."""
    creatures = list(CREATURES.values())
    idx = int(hashlib.md5(name.encode()).hexdigest(), 16) % len(creatures)
    return creatures[idx]


def get_agent_color(name: str) -> tuple:
    """Get color for agent based on name hash."""
    idx = int(hashlib.md5(name.encode()).hexdigest(), 16) % len(AGENT_PALETTE)
    return AGENT_PALETTE[idx]


def fetch_agents(room_slug: str) -> list:
    """Fetch agent status from Supabase."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        # Demo data for testing
        return [
            {"agent": "armand/quiet-oak", "task": "implementing links feature", "status": "active", "memory_count": 23},
            {"agent": "web-user/sunny-wolf", "task": "reviewing PR #42", "status": "active", "memory_count": 8},
            {"agent": "claude/blue-tree", "task": "writing tests", "status": "idle", "memory_count": 15},
        ]

    # Get room ID
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/rooms",
        params={"slug": f"eq.{room_slug}", "select": "id"},
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
        }
    )
    rooms = resp.json()
    if not rooms:
        return []
    room_id = rooms[0]["id"]

    # Get recent memories grouped by agent
    cutoff = (datetime.utcnow() - timedelta(hours=24)).isoformat()
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/memories",
        params={
            "room_id": f"eq.{room_id}",
            "ts": f"gt.{cutoff}",
            "select": "agent,session_id,message_type,content,metadata,ts",
            "order": "ts.desc",
            "limit": "200",
        },
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
        }
    )
    memories = resp.json()

    # Group by agent
    agents = {}
    for m in memories:
        agent = m["agent"]
        if agent not in agents:
            agents[agent] = {
                "agent": agent,
                "task": "",
                "status": "idle",
                "memory_count": 0,
                "last_seen": m["ts"],
            }
        agents[agent]["memory_count"] += 1

        # Check for session start to get task
        meta = m.get("metadata") or {}
        if meta.get("event") == "session_start" and meta.get("task"):
            agents[agent]["task"] = meta["task"]

        # Check if active (seen in last 30 min)
        last_seen = datetime.fromisoformat(agents[agent]["last_seen"].replace("Z", "+00:00"))
        if datetime.now(last_seen.tzinfo) - last_seen < timedelta(minutes=30):
            agents[agent]["status"] = "active"

    return list(agents.values())


def draw_creature(draw: ImageDraw, x: int, y: int, sprite: list, color: tuple, scale: int = 4):
    """Draw a pixel creature at position."""
    for row_idx, row in enumerate(sprite):
        for col_idx, char in enumerate(row):
            if char == "X":
                px = x + col_idx * scale
                py = y + row_idx * scale
                draw.rectangle([px, py, px + scale - 1, py + scale - 1], fill=color)
            elif char == ".":
                # Eyes - white
                px = x + col_idx * scale
                py = y + row_idx * scale
                draw.rectangle([px, py, px + scale - 1, py + scale - 1], fill=COLORS["white"])


def load_tracking_marker(size: int = 120) -> Image.Image:
    """Load the Eywa tracking marker PNG, scaled to the given size.

    Falls back to a simple cross pattern if the PNG is missing.
    """
    marker_paths = [
        os.path.join(os.path.dirname(__file__), "tracking-marker.png"),
        os.path.join(os.path.dirname(__file__), "..", "web", "public", "tracking-marker.png"),
        os.path.join(os.path.dirname(__file__), "..", "eywa-specs", "Assets", "tracking-marker.png"),
    ]

    for path in marker_paths:
        if os.path.exists(path):
            img = Image.open(path).convert("RGB")
            img = img.resize((size, size), Image.LANCZOS)
            return img

    # Fallback: simple cross pattern
    img = Image.new("RGB", (size, size), (255, 255, 255))
    draw = ImageDraw.Draw(img)
    draw.rectangle([0, 0, size - 1, size - 1], outline=(0, 0, 0), width=4)
    mid = size // 2
    draw.rectangle([mid - 4, 8, mid + 4, size - 8], fill=(0, 0, 0))
    draw.rectangle([8, mid - 4, size - 8, mid + 4], fill=(0, 0, 0))
    return img


def render_display(agents: list) -> Image.Image:
    """Render the display image."""
    img = Image.new("RGB", (WIDTH, HEIGHT), COLORS["white"])
    draw = ImageDraw.Draw(img)

    # Try to load a font, fall back to default
    try:
        font_large = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 24)
        font_medium = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 16)
        font_small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 12)
    except:
        font_large = ImageFont.load_default()
        font_medium = ImageFont.load_default()
        font_small = ImageFont.load_default()

    # Header
    draw.text((20, 15), "Eywa", fill=COLORS["black"], font=font_large)

    # Timestamp
    now = datetime.now().strftime("%H:%M")
    draw.text((WIDTH - 60, 18), now, fill=COLORS["black"], font=font_medium)

    # Tracking marker (top right corner, for Spectacles AR anchoring)
    marker = load_tracking_marker(120)
    img.paste(marker, (WIDTH - 140, 55))

    # Divider
    draw.line([(20, 50), (WIDTH - 20, 50)], fill=COLORS["black"], width=2)

    # Agent list
    y = 70
    row_height = 90

    if not agents:
        draw.text((20, y), "No active agents", fill=COLORS["black"], font=font_medium)
    else:
        for i, agent in enumerate(agents[:4]):  # Max 4 agents
            color = get_agent_color(agent["agent"])
            creature = get_creature(agent["agent"])

            # Status indicator
            status_color = COLORS["green"] if agent["status"] == "active" else COLORS["orange"]
            draw.ellipse([20, y + 10, 32, y + 22], fill=status_color)

            # Creature
            draw_creature(draw, 45, y, creature, color, scale=5)

            # Agent name (truncate if needed)
            name = agent["agent"]
            if len(name) > 20:
                name = name[:18] + "..."
            draw.text((95, y), name, fill=COLORS["black"], font=font_medium)

            # Task (truncate)
            task = agent.get("task", "")
            if len(task) > 45:
                task = task[:43] + "..."
            if task:
                draw.text((95, y + 22), task, fill=COLORS["black"], font=font_small)

            # Memory count
            count = agent.get("memory_count", 0)
            draw.text((95, y + 42), f"{count} memories", fill=COLORS["black"], font=font_small)

            # Activity bar (simplified)
            bar_x = 95
            bar_y = y + 60
            bar_width = min(count * 4, 200)
            draw.rectangle([bar_x, bar_y, bar_x + bar_width, bar_y + 8], fill=color)

            y += row_height

    # Footer
    draw.line([(20, HEIGHT - 40), (WIDTH - 20, HEIGHT - 40)], fill=COLORS["black"], width=1)
    draw.text((20, HEIGHT - 30), "eywa-ai.dev", fill=COLORS["black"], font=font_small)

    return img


def display_image(img: Image.Image):
    """Push image to e-paper display."""
    if not HAS_EPD:
        # Preview mode - save to file
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
    parser.add_argument("--interval", type=int, default=60, help="Refresh interval in seconds")
    parser.add_argument("--once", action="store_true", help="Run once and exit")
    args = parser.parse_args()

    print(f"Eywa E-Ink Display - Room: {args.room}")
    print(f"Display: {WIDTH}x{HEIGHT}, 7-color")
    print(f"Refresh interval: {args.interval}s")

    last_hash = None

    while True:
        try:
            print(f"\n[{datetime.now().strftime('%H:%M:%S')}] Fetching agents...")
            agents = fetch_agents(args.room)
            print(f"  Found {len(agents)} agents")

            # Render
            img = render_display(agents)

            # Check if content changed (skip refresh if same)
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
