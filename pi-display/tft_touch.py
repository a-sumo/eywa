#!/usr/bin/env python3
"""
Eywa TFT Touch Display for ILI9341 3.5" LCD
Raspberry Pi interactive display with touch support.

Hardware: 3.5" ILI9341 TFT LCD with XPT2046 touch controller
Resolution: 320x480
Install: pip install pygame requests

Usage:
  python tft_touch.py --room demo
"""

import os
import sys
import time
import argparse
import hashlib
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any

import requests

# Set SDL to use framebuffer before importing pygame
os.environ["SDL_FBDEV"] = "/dev/fb1"
os.environ["SDL_MOUSEDRV"] = "TSLIB"
os.environ["SDL_MOUSEDEV"] = "/dev/input/touchscreen"

import pygame
from pygame.locals import *

# --- Configuration ---

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")

WIDTH = 320
HEIGHT = 480

# Colors (RGB)
COLORS = {
    "bg": (255, 252, 245),        # Cream background
    "text": (30, 30, 30),          # Dark text
    "text_light": (100, 100, 100), # Light text
    "accent": (230, 73, 128),      # Pink accent
    "border": (220, 215, 205),     # Light border
    "active": (34, 197, 94),       # Green for active
    "idle": (251, 146, 60),        # Orange for idle
    "white": (255, 255, 255),
    "black": (0, 0, 0),
}

AGENT_PALETTE = [
    (230, 73, 128),   # pink
    (204, 93, 232),   # purple
    (132, 94, 247),   # indigo
    (92, 124, 250),   # blue
    (20, 184, 166),   # teal
    (34, 197, 94),    # green
    (163, 230, 53),   # lime
    (251, 146, 60),   # orange
]


def get_agent_color(name: str) -> tuple:
    """Get color for agent based on name hash."""
    idx = int(hashlib.md5(name.encode()).hexdigest(), 16) % len(AGENT_PALETTE)
    return AGENT_PALETTE[idx]


class EywaTouchApp:
    def __init__(self, room: str):
        self.room = room
        self.room_id: Optional[str] = None
        self.agents: List[Dict[str, Any]] = []
        self.selected_agent: Optional[str] = None
        self.scroll_offset = 0
        self.last_fetch = 0
        self.fetch_interval = 10  # seconds

        # Initialize pygame
        pygame.init()
        pygame.mouse.set_visible(False)

        # Set up display
        self.screen = pygame.display.set_mode((WIDTH, HEIGHT))
        pygame.display.set_caption("Eywa")

        # Fonts
        try:
            self.font_large = pygame.font.Font("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 20)
            self.font_medium = pygame.font.Font("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 14)
            self.font_small = pygame.font.Font("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 11)
        except:
            self.font_large = pygame.font.Font(None, 24)
            self.font_medium = pygame.font.Font(None, 18)
            self.font_small = pygame.font.Font(None, 14)

        # UI state
        self.view = "list"  # "list" or "detail"
        self.buttons: List[Dict] = []

    def fetch_room_id(self):
        """Get room ID from slug."""
        if not SUPABASE_URL or not SUPABASE_KEY:
            return None

        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/rooms",
            params={"slug": f"eq.{self.room}", "select": "id"},
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
            },
            timeout=10,
        )
        rooms = resp.json()
        return rooms[0]["id"] if rooms else None

    def fetch_agents(self) -> List[Dict]:
        """Fetch agent status from Supabase."""
        if not SUPABASE_URL or not SUPABASE_KEY:
            # Demo data
            return [
                {"agent": "armand/quiet-oak", "task": "implementing links feature", "status": "active", "memory_count": 23},
                {"agent": "web-user/sunny-wolf", "task": "reviewing PR #42", "status": "active", "memory_count": 8},
                {"agent": "claude/blue-tree", "task": "writing unit tests", "status": "idle", "memory_count": 15},
                {"agent": "cursor/red-moon", "task": "refactoring auth", "status": "idle", "memory_count": 5},
            ]

        if not self.room_id:
            self.room_id = self.fetch_room_id()
            if not self.room_id:
                return []

        cutoff = (datetime.utcnow() - timedelta(hours=24)).isoformat()
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/memories",
            params={
                "room_id": f"eq.{self.room_id}",
                "ts": f"gt.{cutoff}",
                "select": "agent,session_id,message_type,content,metadata,ts",
                "order": "ts.desc",
                "limit": "200",
            },
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
            },
            timeout=10,
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
                    "memories": [],
                }
            agents[agent]["memory_count"] += 1
            agents[agent]["memories"].append(m)

            meta = m.get("metadata") or {}
            if meta.get("event") == "session_start" and meta.get("task"):
                agents[agent]["task"] = meta["task"]

            last_seen = datetime.fromisoformat(agents[agent]["last_seen"].replace("Z", "+00:00"))
            if datetime.now(last_seen.tzinfo) - last_seen < timedelta(minutes=30):
                agents[agent]["status"] = "active"

        return list(agents.values())

    def inject_to_agent(self, target: str, message: str):
        """Send an injection to an agent."""
        if not SUPABASE_URL or not SUPABASE_KEY or not self.room_id:
            print(f"Would inject to {target}: {message}")
            return

        requests.post(
            f"{SUPABASE_URL}/rest/v1/memories",
            json={
                "room_id": self.room_id,
                "agent": "pi-display",
                "session_id": f"tft-{int(time.time())}",
                "message_type": "injection",
                "content": f"[INJECT → {target}]: {message}",
                "metadata": {
                    "event": "context_injection",
                    "from_agent": "pi-display",
                    "target_agent": target,
                    "priority": "normal",
                },
            },
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type": "application/json",
                "Prefer": "return=minimal",
            },
            timeout=10,
        )
        print(f"Injected to {target}: {message}")

    def draw_header(self):
        """Draw the header bar."""
        # Background
        pygame.draw.rect(self.screen, COLORS["accent"], (0, 0, WIDTH, 44))

        # Title
        title = self.font_large.render("Eywa", True, COLORS["white"])
        self.screen.blit(title, (12, 10))

        # Room name
        room_text = self.font_small.render(f"/{self.room}", True, COLORS["white"])
        self.screen.blit(room_text, (80, 16))

        # Time
        now = datetime.now().strftime("%H:%M")
        time_text = self.font_medium.render(now, True, COLORS["white"])
        self.screen.blit(time_text, (WIDTH - 50, 12))

    def draw_agent_list(self):
        """Draw the agent list view."""
        self.buttons = []
        y = 54

        # Agent count
        count_text = self.font_small.render(f"{len(self.agents)} agents", True, COLORS["text_light"])
        self.screen.blit(count_text, (12, y))
        y += 24

        # Agent cards
        card_height = 80
        for i, agent in enumerate(self.agents):
            if y > HEIGHT - 60:
                break

            # Card background
            card_rect = pygame.Rect(8, y, WIDTH - 16, card_height)
            pygame.draw.rect(self.screen, COLORS["white"], card_rect, border_radius=8)
            pygame.draw.rect(self.screen, COLORS["border"], card_rect, width=1, border_radius=8)

            # Status dot
            status_color = COLORS["active"] if agent["status"] == "active" else COLORS["idle"]
            pygame.draw.circle(self.screen, status_color, (24, y + 20), 6)

            # Agent color bar
            agent_color = get_agent_color(agent["agent"])
            pygame.draw.rect(self.screen, agent_color, (8, y, 4, card_height), border_radius=2)

            # Agent name
            name = agent["agent"]
            if len(name) > 25:
                name = name[:23] + "..."
            name_text = self.font_medium.render(name, True, COLORS["text"])
            self.screen.blit(name_text, (40, y + 8))

            # Task
            task = agent.get("task", "")[:35]
            if len(agent.get("task", "")) > 35:
                task += "..."
            if task:
                task_text = self.font_small.render(task, True, COLORS["text_light"])
                self.screen.blit(task_text, (40, y + 28))

            # Memory count
            mem_text = self.font_small.render(f"{agent['memory_count']} memories", True, COLORS["text_light"])
            self.screen.blit(mem_text, (40, y + 48))

            # Inject button
            btn_rect = pygame.Rect(WIDTH - 70, y + 25, 50, 30)
            pygame.draw.rect(self.screen, COLORS["accent"], btn_rect, border_radius=4)
            btn_text = self.font_small.render("Inject", True, COLORS["white"])
            self.screen.blit(btn_text, (WIDTH - 62, y + 32))
            self.buttons.append({"rect": btn_rect, "action": "inject", "agent": agent["agent"]})

            # Card tap area
            self.buttons.append({"rect": card_rect, "action": "select", "agent": agent["agent"]})

            y += card_height + 8

    def draw_detail_view(self):
        """Draw agent detail view."""
        self.buttons = []

        agent = next((a for a in self.agents if a["agent"] == self.selected_agent), None)
        if not agent:
            self.view = "list"
            return

        y = 54

        # Back button
        back_rect = pygame.Rect(8, y, 60, 30)
        pygame.draw.rect(self.screen, COLORS["border"], back_rect, border_radius=4)
        back_text = self.font_small.render("← Back", True, COLORS["text"])
        self.screen.blit(back_text, (16, y + 8))
        self.buttons.append({"rect": back_rect, "action": "back"})

        y += 44

        # Agent header
        agent_color = get_agent_color(agent["agent"])
        pygame.draw.rect(self.screen, agent_color, (8, y, WIDTH - 16, 4))

        name_text = self.font_large.render(agent["agent"], True, COLORS["text"])
        self.screen.blit(name_text, (12, y + 12))

        status_color = COLORS["active"] if agent["status"] == "active" else COLORS["idle"]
        status_label = "Active" if agent["status"] == "active" else "Idle"
        pygame.draw.circle(self.screen, status_color, (WIDTH - 50, y + 22), 6)
        status_text = self.font_small.render(status_label, True, COLORS["text_light"])
        self.screen.blit(status_text, (WIDTH - 40, y + 16))

        y += 50

        # Task
        if agent.get("task"):
            task_label = self.font_small.render("Task:", True, COLORS["text_light"])
            self.screen.blit(task_label, (12, y))
            y += 16
            task_text = self.font_medium.render(agent["task"][:40], True, COLORS["text"])
            self.screen.blit(task_text, (12, y))
            y += 28

        # Stats
        stats_text = self.font_small.render(f"{agent['memory_count']} memories", True, COLORS["text_light"])
        self.screen.blit(stats_text, (12, y))
        y += 32

        # Inject button (large)
        btn_rect = pygame.Rect(12, y, WIDTH - 24, 40)
        pygame.draw.rect(self.screen, COLORS["accent"], btn_rect, border_radius=6)
        btn_text = self.font_medium.render("Send Injection", True, COLORS["white"])
        text_rect = btn_text.get_rect(center=btn_rect.center)
        self.screen.blit(btn_text, text_rect)
        self.buttons.append({"rect": btn_rect, "action": "inject", "agent": agent["agent"]})

        y += 56

        # Recent memories with full content
        mem_label = self.font_small.render("Recent activity:", True, COLORS["text_light"])
        self.screen.blit(mem_label, (12, y))
        y += 20

        memories = agent.get("memories", [])[:6]
        for mem in memories:
            if y > HEIGHT - 40:
                break

            # Memory type badge
            msg_type = mem.get("message_type", "")[:8]
            type_text = self.font_small.render(msg_type, True, COLORS["text_light"])
            self.screen.blit(type_text, (12, y))

            # Timestamp
            ts = mem.get("ts", "")
            if ts:
                try:
                    ts_short = ts.split("T")[1][:5] if "T" in ts else ts[:5]
                except:
                    ts_short = ""
                ts_text = self.font_small.render(ts_short, True, COLORS["text_light"])
                self.screen.blit(ts_text, (WIDTH - 50, y))
            y += 14

            # Full content with word wrap
            content = mem.get("content") or ""
            max_chars_per_line = 38
            lines = []
            words = content.split()
            current_line = ""
            for word in words:
                if len(current_line) + len(word) + 1 <= max_chars_per_line:
                    current_line = f"{current_line} {word}".strip()
                else:
                    if current_line:
                        lines.append(current_line)
                    current_line = word
                if len(lines) >= 3:  # Max 3 lines per memory
                    break
            if current_line and len(lines) < 3:
                lines.append(current_line)
            if len(content) > max_chars_per_line * 3:
                lines[-1] = lines[-1][:max_chars_per_line-3] + "..."

            for line in lines:
                if y > HEIGHT - 20:
                    break
                line_text = self.font_small.render(line, True, COLORS["text"])
                self.screen.blit(line_text, (12, y))
                y += 13

            y += 8  # Gap between memories

    def draw(self):
        """Draw the current view."""
        self.screen.fill(COLORS["bg"])
        self.draw_header()

        if self.view == "list":
            self.draw_agent_list()
        elif self.view == "detail":
            self.draw_detail_view()

        pygame.display.flip()

    def handle_touch(self, pos):
        """Handle touch event."""
        for btn in self.buttons:
            if btn["rect"].collidepoint(pos):
                action = btn["action"]

                if action == "select":
                    self.selected_agent = btn["agent"]
                    self.view = "detail"
                elif action == "back":
                    self.view = "list"
                    self.selected_agent = None
                elif action == "inject":
                    # For now, send a simple ping
                    self.inject_to_agent(btn["agent"], "Ping from Pi display!")

                return True
        return False

    def run(self):
        """Main loop."""
        clock = pygame.time.Clock()
        running = True

        print(f"Eywa TFT Touch - Room: {self.room}")
        print(f"Display: {WIDTH}x{HEIGHT}")
        print("Touch to interact, Ctrl+C to exit")

        while running:
            # Handle events
            for event in pygame.event.get():
                if event.type == QUIT:
                    running = False
                elif event.type == KEYDOWN:
                    if event.key == K_ESCAPE:
                        running = False
                elif event.type == MOUSEBUTTONDOWN:
                    self.handle_touch(event.pos)

            # Fetch data periodically
            now = time.time()
            if now - self.last_fetch > self.fetch_interval:
                try:
                    self.agents = self.fetch_agents()
                    self.last_fetch = now
                except Exception as e:
                    print(f"Fetch error: {e}")

            # Draw
            self.draw()
            clock.tick(30)

        pygame.quit()


def main():
    parser = argparse.ArgumentParser(description="Eywa TFT Touch Display")
    parser.add_argument("--room", default="demo", help="Room slug")
    args = parser.parse_args()

    app = EywaTouchApp(args.room)
    app.run()


if __name__ == "__main__":
    main()
