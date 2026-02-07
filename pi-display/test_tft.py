#!/usr/bin/env python3
"""
TFT Display Test - Run this first to verify your wiring.

Draws colored rectangles, text, and a touch target on the 3.5" ILI9341 TFT.
If you see the test pattern, your wiring is correct.

Prerequisites:
  - fbcp-ili9341 running (mirrors framebuffer to TFT over SPI)
  - pygame installed: sudo apt-get install python3-pygame

Usage:
  python3 test_tft.py          # on Pi with TFT
  python3 test_tft.py --window # on laptop (opens a regular window)
"""

import os
import sys
import time
import argparse

# Configure SDL for the Pi framebuffer BEFORE importing pygame.
# On the Pi, the TFT shows up as /dev/fb1 (fb0 is HDMI).
# The --window flag skips this so you get a normal desktop window.
if "--window" not in sys.argv:
    os.environ.setdefault("SDL_FBDEV", "/dev/fb1")
    os.environ.setdefault("SDL_MOUSEDRV", "TSLIB")
    os.environ.setdefault("SDL_MOUSEDEV", "/dev/input/touchscreen")

import pygame

# --- Display size ---
# The ILI9341 is 320x480 in portrait.
# Change these if your display is different.
WIDTH = 320
HEIGHT = 480


def run_test(windowed: bool):
    pygame.init()

    if windowed:
        screen = pygame.display.set_mode((WIDTH, HEIGHT))
        pygame.display.set_caption("TFT Test")
    else:
        screen = pygame.display.set_mode((WIDTH, HEIGHT))
        pygame.mouse.set_visible(False)

    # Load a font. DejaVu is pre-installed on Raspberry Pi OS.
    try:
        font_big = pygame.font.Font(
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 28
        )
        font = pygame.font.Font(
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 16
        )
        font_small = pygame.font.Font(
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 12
        )
    except FileNotFoundError:
        font_big = pygame.font.Font(None, 32)
        font = pygame.font.Font(None, 20)
        font_small = pygame.font.Font(None, 14)

    clock = pygame.time.Clock()
    touches = []  # store touch points to draw
    running = True
    phase = 0  # which test screen to show
    phase_timer = time.time()

    print("TFT Test running.")
    print("  Phase 0: Color bars (5s)")
    print("  Phase 1: Text rendering (5s)")
    print("  Phase 2: Touch test (tap the screen, Ctrl+C to exit)")

    while running:
        # --- Events ---
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE:
                running = False
            elif event.type == pygame.MOUSEBUTTONDOWN:
                pos = event.pos
                touches.append(pos)
                print(f"  Touch at ({pos[0]}, {pos[1]})")
                # In touch test phase, tapping the green "PASS" box exits
                if phase == 2:
                    pass_rect = pygame.Rect(WIDTH // 2 - 60, HEIGHT - 80, 120, 50)
                    if pass_rect.collidepoint(pos):
                        print("  PASS confirmed. Exiting.")
                        running = False

        # --- Auto-advance phases ---
        elapsed = time.time() - phase_timer
        if phase == 0 and elapsed > 5:
            phase = 1
            phase_timer = time.time()
            print("  Phase 1: Text rendering")
        elif phase == 1 and elapsed > 5:
            phase = 2
            touches.clear()
            print("  Phase 2: Touch test (tap anywhere, tap PASS to exit)")

        # --- Draw ---
        screen.fill((0, 0, 0))

        if phase == 0:
            # Color bars - verifies the display can show distinct colors.
            # If colors look wrong, your wiring or driver config is off.
            colors = [
                ("Red", (255, 0, 0)),
                ("Green", (0, 255, 0)),
                ("Blue", (0, 0, 255)),
                ("Yellow", (255, 255, 0)),
                ("Cyan", (0, 255, 255)),
                ("Magenta", (255, 0, 255)),
                ("White", (255, 255, 255)),
                ("Orange", (255, 128, 0)),
            ]
            bar_h = HEIGHT // len(colors)
            for i, (name, color) in enumerate(colors):
                y = i * bar_h
                pygame.draw.rect(screen, color, (0, y, WIDTH, bar_h))
                # Label each bar with its name (black text with white outline)
                label = font.render(name, True, (0, 0, 0))
                screen.blit(label, (12, y + bar_h // 2 - 8))

            title = font_big.render("Color Test", True, (255, 255, 255))
            # Draw on a dark band at top
            pygame.draw.rect(screen, (0, 0, 0, 180), (0, 0, WIDTH, 40))
            screen.blit(title, (WIDTH // 2 - title.get_width() // 2, 6))

        elif phase == 1:
            # Text rendering - verifies fonts, positioning, and pixel clarity.
            screen.fill((20, 20, 30))

            lines = [
                (font_big, "Eywa TFT Test", (0, 255, 200)),
                (font, f"Resolution: {WIDTH}x{HEIGHT}", (200, 200, 200)),
                (font, f"FPS: {clock.get_fps():.0f}", (200, 200, 200)),
                (font_small, "", (0, 0, 0)),
                (font, "Wiring: OK", (0, 255, 100)),
                (font, "SPI: OK", (0, 255, 100)),
                (font, "Framebuffer: OK", (0, 255, 100)),
                (font_small, "", (0, 0, 0)),
                (font_small, "If you can read this, your display works.", (150, 150, 150)),
            ]

            y = 40
            for f, text, color in lines:
                if text:
                    rendered = f.render(text, True, color)
                    screen.blit(rendered, (20, y))
                y += f.get_height() + 6

            # Draw some shapes to test rendering
            pygame.draw.circle(screen, (230, 73, 128), (WIDTH // 2, 320), 40)
            pygame.draw.circle(screen, (132, 94, 247), (WIDTH // 2 - 60, 320), 25)
            pygame.draw.circle(screen, (20, 184, 166), (WIDTH // 2 + 60, 320), 25)

            # Border
            pygame.draw.rect(screen, (80, 80, 100), (0, 0, WIDTH, HEIGHT), 3)

        elif phase == 2:
            # Touch test - verifies the touchscreen registers taps.
            screen.fill((15, 15, 25))

            title = font_big.render("Touch Test", True, (255, 255, 255))
            screen.blit(title, (WIDTH // 2 - title.get_width() // 2, 20))

            hint = font_small.render("Tap anywhere. Dots appear where you touch.", True, (150, 150, 150))
            screen.blit(hint, (WIDTH // 2 - hint.get_width() // 2, 60))

            # Draw grid lines for reference
            for x in range(0, WIDTH, 40):
                pygame.draw.line(screen, (30, 30, 40), (x, 80), (x, HEIGHT - 100), 1)
            for y in range(80, HEIGHT - 100, 40):
                pygame.draw.line(screen, (30, 30, 40), (0, y), (WIDTH, y), 1)

            # Draw crosshair targets at known positions
            targets = [
                (40, 120), (WIDTH - 40, 120),
                (WIDTH // 2, HEIGHT // 2),
                (40, HEIGHT - 140), (WIDTH - 40, HEIGHT - 140),
            ]
            for tx, ty in targets:
                pygame.draw.line(screen, (60, 60, 80), (tx - 10, ty), (tx + 10, ty), 1)
                pygame.draw.line(screen, (60, 60, 80), (tx, ty - 10), (tx, ty + 10), 1)

            # Draw recorded touch points
            for i, (tx, ty) in enumerate(touches[-50:]):  # keep last 50
                # Fade older touches
                alpha = max(100, 255 - i * 4)
                pygame.draw.circle(screen, (0, alpha, alpha), (tx, ty), 6)

            # Touch count
            count_text = font.render(f"Touches: {len(touches)}", True, (200, 200, 200))
            screen.blit(count_text, (20, HEIGHT - 120))

            # PASS button
            pass_rect = pygame.Rect(WIDTH // 2 - 60, HEIGHT - 80, 120, 50)
            pygame.draw.rect(screen, (0, 180, 80), pass_rect, border_radius=8)
            pass_text = font.render("PASS", True, (255, 255, 255))
            screen.blit(
                pass_text,
                (pass_rect.centerx - pass_text.get_width() // 2,
                 pass_rect.centery - pass_text.get_height() // 2),
            )

        pygame.display.flip()
        clock.tick(30)

    pygame.quit()
    print("Test complete.")


def main():
    parser = argparse.ArgumentParser(description="TFT Display Test")
    parser.add_argument(
        "--window", action="store_true",
        help="Run in a desktop window instead of the Pi framebuffer"
    )
    args = parser.parse_args()
    run_test(windowed=args.window)


if __name__ == "__main__":
    main()
