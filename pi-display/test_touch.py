#!/usr/bin/env python3
"""
Touch Input Test - Diagnose touchscreen issues.

Reads raw touch events from the Linux input subsystem and prints coordinates.
No pygame, no SDL, no display driver needed. This talks directly to the
kernel's input device, so it works even if the display isn't set up yet.

Use this to:
  - Confirm the XPT2046 touch controller is detected
  - Check if coordinates map correctly to the screen
  - Diagnose calibration issues (coordinates inverted, swapped axes, etc.)

Prerequisites:
  - Touch overlay in /boot/config.txt (see TFT_GUIDE.md)
  - pip install evdev

Usage:
  python3 test_touch.py                   # auto-detect touch device
  python3 test_touch.py /dev/input/event0 # specify device path
  python3 test_touch.py --list            # list all input devices
"""

import sys
import os

try:
    import evdev
except ImportError:
    print("Missing dependency: evdev")
    print("Install it: pip3 install evdev")
    print()
    print("If pip fails, try: sudo apt-get install python3-evdev")
    sys.exit(1)


def list_devices():
    """List all input devices."""
    devices = [evdev.InputDevice(path) for path in evdev.list_devices()]
    if not devices:
        print("No input devices found.")
        print()
        print("Possible causes:")
        print("  - Touch overlay not configured in /boot/config.txt")
        print("  - SPI not enabled (run sudo raspi-config)")
        print("  - T_CS, T_CLK, T_DIN, T_DO wiring is wrong")
        print("  - Need to run as root: sudo python3 test_touch.py --list")
        return

    print(f"Found {len(devices)} input device(s):\n")
    for dev in devices:
        caps = dev.capabilities(verbose=True)
        has_abs = any("ABS" in str(k) for k in caps.keys())
        marker = " <-- likely touchscreen" if has_abs else ""
        print(f"  {dev.path}")
        print(f"    Name: {dev.name}{marker}")
        print(f"    Phys: {dev.phys}")
        print()


def find_touch_device() -> str:
    """Auto-detect the touchscreen device."""
    # Check the symlink first (created by udev rule in TFT_GUIDE.md)
    if os.path.exists("/dev/input/touchscreen"):
        return "/dev/input/touchscreen"

    # Scan for ADS7846 (the kernel name for XPT2046-compatible touch controllers)
    for path in evdev.list_devices():
        dev = evdev.InputDevice(path)
        if "ADS7846" in dev.name or "touch" in dev.name.lower():
            return path

    # Fall back to first device with absolute axes (likely a touchscreen)
    for path in evdev.list_devices():
        dev = evdev.InputDevice(path)
        caps = dev.capabilities()
        if evdev.ecodes.EV_ABS in caps:
            return path

    return ""


def read_touch(device_path: str):
    """Read and print touch events."""
    try:
        dev = evdev.InputDevice(device_path)
    except PermissionError:
        print(f"Permission denied: {device_path}")
        print("Run with sudo: sudo python3 test_touch.py")
        sys.exit(1)
    except FileNotFoundError:
        print(f"Device not found: {device_path}")
        print("Run with --list to see available devices.")
        sys.exit(1)

    print(f"Reading touch events from: {dev.path}")
    print(f"Device name: {dev.name}")
    print()

    # Print the coordinate ranges (useful for calibration)
    caps = dev.capabilities(verbose=False)
    if evdev.ecodes.EV_ABS in caps:
        for code, absinfo in caps[evdev.ecodes.EV_ABS]:
            if code == evdev.ecodes.ABS_X:
                print(f"X range: {absinfo.min} to {absinfo.max}")
            elif code == evdev.ecodes.ABS_Y:
                print(f"Y range: {absinfo.min} to {absinfo.max}")
            elif code == evdev.ecodes.ABS_PRESSURE:
                print(f"Pressure range: {absinfo.min} to {absinfo.max}")

    print()
    print("Touch the screen. Events will print below.")
    print("Press Ctrl+C to stop.")
    print("-" * 50)

    x, y, pressure = 0, 0, 0
    touching = False

    try:
        for event in dev.read_loop():
            if event.type == evdev.ecodes.EV_ABS:
                if event.code == evdev.ecodes.ABS_X:
                    x = event.value
                elif event.code == evdev.ecodes.ABS_Y:
                    y = event.value
                elif event.code == evdev.ecodes.ABS_PRESSURE:
                    pressure = event.value

            elif event.type == evdev.ecodes.EV_KEY:
                if event.code == evdev.ecodes.BTN_TOUCH:
                    if event.value == 1:
                        touching = True
                        print(f"TOUCH DOWN  x={x:5d}  y={y:5d}  pressure={pressure}")
                    else:
                        touching = False
                        print(f"TOUCH UP    x={x:5d}  y={y:5d}")
                        print()

            elif event.type == evdev.ecodes.EV_SYN and touching:
                # SYN events fire on every coordinate update while touching.
                # Print them but not too often (only when x/y actually changed).
                pass

    except KeyboardInterrupt:
        print("\nStopped.")


def main():
    if "--list" in sys.argv:
        list_devices()
        return

    # Check for explicit device path argument
    device_path = ""
    for arg in sys.argv[1:]:
        if arg.startswith("/dev/"):
            device_path = arg
            break

    if not device_path:
        print("Auto-detecting touchscreen...")
        device_path = find_touch_device()
        if not device_path:
            print("No touchscreen found.")
            print()
            print("Run with --list to see all input devices.")
            print()
            print("If no devices appear at all:")
            print("  1. Check your wiring (T_CS, T_CLK, T_DIN, T_DO, T_IRQ)")
            print("  2. Verify the touch overlay is in /boot/config.txt:")
            print('     dtoverlay=ads7846,cs=1,penirq=17,penirq_pull=2,...')
            print("  3. Reboot after changing config.txt")
            print("  4. Try running with sudo")
            sys.exit(1)
        print(f"Found: {device_path}")
        print()

    read_touch(device_path)


if __name__ == "__main__":
    main()
