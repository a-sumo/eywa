# Raspberry Pi 3B+ → Ulegqin 3.5" ILI9341 LCD + XPT2046 Touch Setup Guide

> **Display**: Ulegqin 3.5 Inch LCD TFT Touch Display, 320×480, ILI9341 driver, XPT2046 touch controller, 4-wire SPI
> **Board**: Raspberry Pi 3B+
> **OS**: Raspberry Pi OS (32-bit)

---

## Table of Contents

1. [Hardware Overview](#hardware-overview)
2. [GPIO Wiring — LCD Display](#gpio-wiring--lcd-display)
3. [GPIO Wiring — Touch (XPT2046)](#gpio-wiring--touch-xpt2046)
4. [Shared SPI Bus Notes](#shared-spi-bus-notes)
5. [Interactive Wiring Diagram](#interactive-wiring-diagram)
6. [OS Setup (Headless)](#os-setup-headless)
7. [Software Installation](#software-installation)
8. [Display Driver Setup](#display-driver-setup)
9. [Touch Calibration](#touch-calibration)
10. [Python Test Script](#python-test-script)
11. [Troubleshooting](#troubleshooting)

---

## Hardware Overview

The Ulegqin 3.5" LCD uses:
- **ILI9341** — TFT LCD controller, 320×480 resolution, 65K colors, SPI interface
- **XPT2046** — Resistive touchscreen controller, shares the SPI bus with the display
- **4-wire SPI** — Requires MOSI, MISO, SCLK, plus separate CS pins for display and touch

The display module typically has **14 pins** — 9 for the LCD and 5 for the touch controller.

---

## GPIO Wiring — LCD Display

| LCD Pin     | Pi Pin # | Pi GPIO / Function | Description                    |
|-------------|----------|--------------------|--------------------------------|
| **VCC**     | 1        | 3.3V               | Power supply                   |
| **GND**     | 6        | GND                | Ground                         |
| **CS**      | 24       | GPIO 8 (CE0)       | LCD chip select (active low)   |
| **RESET**   | 22       | GPIO 25            | LCD reset                      |
| **DC/RS**   | 18       | GPIO 24            | Data/Command select            |
| **SDI/MOSI**| 19       | GPIO 10 (MOSI)     | SPI data in (Master Out)       |
| **SCK**     | 23       | GPIO 11 (SCLK)     | SPI clock                      |
| **LED**     | 17       | 3.3V               | Backlight (always on)          |
| **SDO/MISO**| 21       | GPIO 9 (MISO)      | SPI data out (Master In)       |

---

## GPIO Wiring — Touch (XPT2046)

| Touch Pin   | Pi Pin # | Pi GPIO / Function | Description                    |
|-------------|----------|--------------------|--------------------------------|
| **T_CLK**   | 23       | GPIO 11 (SCLK)     | ⚡ Shared with LCD SCK         |
| **T_CS**    | 26       | GPIO 7 (CE1)       | Touch chip select (separate!)  |
| **T_DIN**   | 19       | GPIO 10 (MOSI)     | ⚡ Shared with LCD SDI/MOSI    |
| **T_DO**    | 21       | GPIO 9 (MISO)      | ⚡ Shared with LCD SDO/MISO    |
| **T_IRQ**   | 11       | GPIO 17            | Touch interrupt (pen down)     |

---

## Shared SPI Bus Notes

The LCD and touch controller **share the same SPI bus** (SPI0). This means:

- **Pi Pin 19 (MOSI)** has TWO wires: LCD SDI + Touch T_DIN
- **Pi Pin 21 (MISO)** has TWO wires: LCD SDO + Touch T_DO
- **Pi Pin 23 (SCLK)** has TWO wires: LCD SCK + Touch T_CLK

The devices are distinguished by their **separate chip select (CS) pins**:
- LCD uses **CE0** (Pin 24 / GPIO 8)
- Touch uses **CE1** (Pin 26 / GPIO 7)

Only one device communicates at a time — the active CS pin goes LOW to select it.

> **Tip**: When wiring shared pins, twist or solder two wires together before connecting to the single Pi pin, or use a breadboard to split the connection.

---

## Interactive Wiring Diagram

An interactive React-based wiring diagram is included as `ili9341-pinout.jsx`. Open it in your browser to:
- Hover over connections to trace individual wires
- Toggle LCD and Touch layers independently
- See shared SPI pins highlighted with dashed borders
- Identify exact pin numbers on both the display and Pi header

---

## OS Setup (Headless)

If you already followed the Waveshare e-Paper setup, your Pi is ready. If starting fresh:

### Flash the SD Card (Raspberry Pi Imager v2.0.6)

1. Device: **Raspberry Pi 3**
2. OS: **Raspberry Pi OS (32-bit)**
3. Customisation:
   - Hostname: `raspberrypi`
   - SSH: **Enabled** (password authentication)
   - Username/Password: your choice
   - Wi-Fi: your SSID and password
4. Flash and insert into Pi

### Connect via SSH

```bash
ssh yourusername@raspberrypi.local
```

### Fix Locale Warnings (if present)

```bash
sudo apt-get install -y locales-all
sudo touch /var/lib/cloud/instance/locale-check.skip
```

### Enable SPI

```bash
sudo raspi-config nonint do_spi 0
```

Verify SPI is active:

```bash
ls /dev/spidev*
# Should show: /dev/spidev0.0  /dev/spidev0.1
```

---

## Software Installation

### Update System

```bash
sudo apt update && sudo apt upgrade -y
```

### Install Python Dependencies

```bash
sudo apt install -y python3-pip python3-pil python3-numpy python3-spidev python3-rpi.gpio python3-dev
```

### Install Display Libraries

#### Option A: Python SPI Driver (Adafruit — recommended for custom apps)

```bash
pip3 install adafruit-circuitpython-rgb-display --break-system-packages
sudo apt install -y python3-pil
```

#### Option B: Kernel Framebuffer Driver (for full desktop on the LCD)

```bash
git clone https://github.com/waveshare/LCD-show.git
cd LCD-show/
```

> **Note**: Running the LCD-show scripts will reconfigure your Pi's display output to the SPI LCD. Only do this if you want the LCD as your primary display.

---

## Display Driver Setup

### Method 1: Python Direct SPI (Best for custom apps / headless)

This approach draws to the LCD directly from Python without touching the framebuffer. Best for dashboards, status displays, and custom UIs.

Create a test file:

```python
#!/usr/bin/env python3
"""ILI9341 Direct SPI Test — draws color blocks and text."""

import digitalio
import board
from PIL import Image, ImageDraw, ImageFont
import adafruit_rgb_display.ili9341 as ili9341

# Pin configuration matching our wiring
cs_pin = digitalio.DigitalInOut(board.CE0)      # GPIO 8, Pin 24
dc_pin = digitalio.DigitalInOut(board.D24)       # GPIO 24, Pin 18
reset_pin = digitalio.DigitalInOut(board.D25)    # GPIO 25, Pin 22

# SPI setup
spi = board.SPI()  # Uses GPIO 10 (MOSI), GPIO 9 (MISO), GPIO 11 (SCLK)

# Create display
disp = ili9341.ILI9341(
    spi,
    cs=cs_pin,
    dc=dc_pin,
    rst=reset_pin,
    baudrate=32000000,
    width=320,
    height=480,
)

# Create image and draw
image = Image.new("RGB", (disp.width, disp.height), "#000000")
draw = ImageDraw.Draw(image)

# Draw color blocks
colors = ["#ef4444", "#f97316", "#facc15", "#22c55e", "#3b82f6", "#8b5cf6"]
block_h = disp.height // len(colors)
for i, color in enumerate(colors):
    draw.rectangle([0, i * block_h, disp.width, (i + 1) * block_h], fill=color)

# Draw text
font = ImageFont.load_default()
draw.text((10, 10), "ILI9341 Test", fill="#ffffff", font=font)
draw.text((10, 30), f"{disp.width}x{disp.height}", fill="#ffffff", font=font)
draw.text((10, 50), "SPI OK!", fill="#ffffff", font=font)

# Display
disp.image(image)
print("Display test complete!")
```

Run it:

```bash
python3 ili9341_test.py
```

### Method 2: Kernel Framebuffer (DRM/KMS — for desktop output)

Add to `/boot/firmware/config.txt`:

```ini
dtoverlay=mipi-dbi-spi,speed=32000000
dtparam=compatible=ilitek,ili9341
dtparam=width=320,height=480
dtparam=reset-gpio=25,dc-gpio=24,backlight-gpio=18
```

Then reboot:

```bash
sudo reboot
```

Check if a framebuffer device appeared:

```bash
ls /dev/fb*
```

### Method 3: fbcp-ili9341 (High Performance — HDMI Mirror)

> **Note**: fbcp-ili9341 is deprecated for Pi 5+ but works on Pi 3B+.

```bash
sudo apt install -y cmake
git clone https://github.com/juj/fbcp-ili9341.git
cd fbcp-ili9341
mkdir build && cd build
cmake -DILI9341=ON \
      -DGPIO_TFT_DATA_CONTROL=24 \
      -DGPIO_TFT_RESET_PIN=25 \
      -DGPIO_TFT_BACKLIGHT=18 \
      -DSPI_BUS_CLOCK_DIVISOR=6 \
      -DSTATISTICS=0 \
      ..
make -j$(nproc)
sudo ./fbcp-ili9341
```

To run on boot, add to `/etc/rc.local` before `exit 0`:

```bash
/home/yourusername/fbcp-ili9341/build/fbcp-ili9341 &
```

---

## Touch Calibration

### Enable XPT2046 Touch Driver

Add to `/boot/firmware/config.txt`:

```ini
dtoverlay=ads7846,cs=1,penirq=17,penirq_pull=2,speed=50000,keep_vref_on=0,swapxy=0,pmax=255,xohms=150,xmin=200,xmax=3900,ymin=200,ymax=3900
```

- `cs=1` → uses CE1 (GPIO 7, Pin 26) for touch
- `penirq=17` → GPIO 17 (Pin 11) for touch interrupt

Reboot:

```bash
sudo reboot
```

Verify touch is detected:

```bash
dmesg | grep ads7846
# Should show: ads7846 spi0.1: touchscreen, irq XXX
```

### Calibrate

```bash
sudo apt install -y xinput-calibrator
DISPLAY=:0 xinput_calibrator
```

Follow the on-screen instructions to tap the crosshairs. Save the calibration data it outputs.

### Python Touch Reading (without kernel driver)

```python
#!/usr/bin/env python3
"""Read XPT2046 touch coordinates over SPI."""

import spidev
import RPi.GPIO as GPIO
import time

T_IRQ = 17  # GPIO 17, Pin 11

GPIO.setmode(GPIO.BCM)
GPIO.setup(T_IRQ, GPIO.IN, pull_up_down=GPIO.PUD_UP)

spi = spidev.SpiDev()
spi.open(0, 1)  # SPI bus 0, CE1 (GPIO 7)
spi.max_speed_hz = 1000000
spi.mode = 0

def read_touch():
    """Read X and Y from XPT2046."""
    # Read X (command 0xD0)
    x_raw = spi.xfer2([0xD0, 0x00, 0x00])
    x = ((x_raw[1] << 8) | x_raw[2]) >> 3

    # Read Y (command 0x90)
    y_raw = spi.xfer2([0x90, 0x00, 0x00])
    y = ((y_raw[1] << 8) | y_raw[2]) >> 3

    return x, y

print("Touch the screen (Ctrl+C to stop)...")
try:
    while True:
        if GPIO.input(T_IRQ) == 0:  # Touch detected (active low)
            x, y = read_touch()
            print(f"Touch: X={x:4d}  Y={y:4d}")
            time.sleep(0.1)
        time.sleep(0.01)
except KeyboardInterrupt:
    GPIO.cleanup()
    spi.close()
    print("\nDone.")
```

---

## Python Test Script

Here's a combined display + touch demo:

```python
#!/usr/bin/env python3
"""Combined ILI9341 display + XPT2046 touch demo."""

import spidev
import RPi.GPIO as GPIO
from PIL import Image, ImageDraw, ImageFont
import time

# --- LCD ILI9341 via spidev ---
LCD_CS   = 8    # GPIO 8  (CE0)
LCD_DC   = 24   # GPIO 24
LCD_RST  = 25   # GPIO 25
LCD_BL   = 18   # GPIO 18 (optional, or wire LED to 3.3V)

# --- Touch XPT2046 ---
T_IRQ    = 17   # GPIO 17
T_CS     = 7    # GPIO 7 (CE1)

WIDTH  = 320
HEIGHT = 480

GPIO.setmode(GPIO.BCM)
GPIO.setup(LCD_DC, GPIO.OUT)
GPIO.setup(LCD_RST, GPIO.OUT)
GPIO.setup(T_IRQ, GPIO.IN, pull_up_down=GPIO.PUD_UP)

# Initialize LCD SPI
lcd_spi = spidev.SpiDev()
lcd_spi.open(0, 0)  # Bus 0, CE0
lcd_spi.max_speed_hz = 32000000
lcd_spi.mode = 0

# Initialize Touch SPI
touch_spi = spidev.SpiDev()
touch_spi.open(0, 1)  # Bus 0, CE1
touch_spi.max_speed_hz = 1000000
touch_spi.mode = 0

def lcd_command(cmd):
    GPIO.output(LCD_DC, 0)
    lcd_spi.writebytes([cmd])

def lcd_data(data):
    GPIO.output(LCD_DC, 1)
    lcd_spi.writebytes(data if isinstance(data, list) else [data])

def lcd_reset():
    GPIO.output(LCD_RST, 1)
    time.sleep(0.01)
    GPIO.output(LCD_RST, 0)
    time.sleep(0.01)
    GPIO.output(LCD_RST, 1)
    time.sleep(0.12)

def lcd_init():
    lcd_reset()
    lcd_command(0x01)  # Software reset
    time.sleep(0.15)
    lcd_command(0x11)  # Sleep out
    time.sleep(0.15)
    lcd_command(0x29)  # Display on
    lcd_command(0x36)  # Memory access control
    lcd_data(0x48)     # Row/col exchange for 320x480
    lcd_command(0x3A)  # Pixel format
    lcd_data(0x55)     # 16-bit color

def read_touch():
    x_raw = touch_spi.xfer2([0xD0, 0x00, 0x00])
    x = ((x_raw[1] << 8) | x_raw[2]) >> 3
    y_raw = touch_spi.xfer2([0x90, 0x00, 0x00])
    y = ((y_raw[1] << 8) | y_raw[2]) >> 3
    return x, y

# Run
lcd_init()
print("ILI9341 initialized. Touch the screen...")

try:
    while True:
        if GPIO.input(T_IRQ) == 0:
            x, y = read_touch()
            print(f"Touch: X={x:4d}  Y={y:4d}")
            time.sleep(0.1)
        time.sleep(0.01)
except KeyboardInterrupt:
    GPIO.cleanup()
    lcd_spi.close()
    touch_spi.close()
    print("\nCleanup done.")
```

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| **Blank screen, no backlight** | Check LED pin is wired to 3.3V (Pin 17). If using GPIO for backlight, set it HIGH. |
| **Backlight on but no image** | Verify CS, DC, RESET, MOSI, SCK wiring. Check SPI is enabled (`ls /dev/spidev*`). |
| **Garbled/shifted image** | Wrong width/height in config. ILI9341 is 240×320 natively — for 3.5" 480×320, check if your display uses ILI9486/ILI9488 instead. |
| **Colors inverted** | Add color inversion command: `lcd_command(0x21)` after init. |
| **Touch not responding** | Check T_CS (Pin 26), T_IRQ (Pin 11). Verify `dmesg | grep ads7846` shows the device. |
| **Touch coordinates wrong** | Run calibration. Try swapping X/Y: set `swapxy=1` in dtoverlay config. |
| **SPI device not found** | Run `sudo raspi-config nonint do_spi 0` and reboot. |
| **Display works, touch doesn't** | Touch and display share MOSI/MISO/SCLK — check all 3 shared wires are connected to both devices. |
| **SSH drops during use** | Power issue — use a proper 5V/2.5A power supply, not a battery. |

---

## Important Notes

- **3.3V ONLY** — The ILI9341 and XPT2046 are 3.3V devices. Do NOT connect to 5V pins.
- **SPI Speed** — LCD works well at 32MHz. Touch controller needs slower speed (~1MHz). They use separate CE pins so different speeds are handled automatically.
- **Display Variant** — Some "3.5 inch ILI9341" displays are actually **ILI9486** or **ILI9488** (480×320). If the ILI9341 driver gives wrong colors/resolution, try ILI9486 instead.
- **Backlight** — Wiring LED to 3.3V means always on. For brightness control, wire to a GPIO pin and use PWM.
- **Always shut down safely**: `sudo shutdown -h now`

---

## Key File Paths

```
/boot/firmware/config.txt          # Display/touch overlay config
/dev/spidev0.0                     # SPI bus 0, CE0 (LCD)
/dev/spidev0.1                     # SPI bus 0, CE1 (Touch)
/lib/firmware/                     # Custom display firmware .bin files
```

---

## Quick Reference: Complete Pin List

```
LCD Pin       →  Pi Pin  →  GPIO/Function
─────────────────────────────────────────
VCC           →  Pin 1   →  3.3V
GND           →  Pin 6   →  GND
CS            →  Pin 24  →  GPIO 8  (CE0)
RESET         →  Pin 22  →  GPIO 25
DC/RS         →  Pin 18  →  GPIO 24
SDI (MOSI)    →  Pin 19  →  GPIO 10 (MOSI)  ⚡ shared
SCK           →  Pin 23  →  GPIO 11 (SCLK)  ⚡ shared
LED           →  Pin 17  →  3.3V
SDO (MISO)    →  Pin 21  →  GPIO 9  (MISO)  ⚡ shared

Touch Pin     →  Pi Pin  →  GPIO/Function
─────────────────────────────────────────
T_CLK         →  Pin 23  →  GPIO 11 (SCLK)  ⚡ shared
T_CS          →  Pin 26  →  GPIO 7  (CE1)
T_DIN         →  Pin 19  →  GPIO 10 (MOSI)  ⚡ shared
T_DO          →  Pin 21  →  GPIO 9  (MISO)  ⚡ shared
T_IRQ         →  Pin 11  →  GPIO 17
```
