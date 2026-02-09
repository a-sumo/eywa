# Eywa Pi Displays

Raspberry Pi scripts for physical Eywa displays.

## Hardware

| Display | Resolution | Type | Script |
|---------|------------|------|--------|
| Waveshare 5.65" 7-Color | 600x448 | E-Ink (passive) | `eink_display.py` |
| 3.5" ILI9341 TFT | 320x480 | LCD (touch) | `tft_touch.py` |

## Beginner Guides

New to electronics? Start here:

- **[TFT_GUIDE.md](./TFT_GUIDE.md)** - Complete walkthrough for the 3.5" TFT touch display. Covers every component, pin-by-pin wiring with explanations, driver setup, touch calibration, and troubleshooting.
- **[EINK_GUIDE.md](./EINK_GUIDE.md)** - Complete walkthrough for the Waveshare 5.65" e-ink display. Covers HAT vs module wiring, the Waveshare library, refresh behavior, display care, and troubleshooting.

## Test Scripts

Run these after wiring to verify hardware before using the full Eywa apps:

| Script | What it tests | Display needed? |
|--------|--------------|----------------|
| `test_tft.py` | TFT color bars, text rendering, touch input | TFT (or `--window` for laptop) |
| `test_eink.py` | E-ink 7-color swatches, shapes, pixel grid | E-ink (or `--preview` for PNG, `--clear` to wipe display) |
| `test_touch.py` | Raw touch events, coordinate ranges, device detection | None (reads kernel input) |

## E-Ink Setup (Waveshare 5.65" ACeP)

### 1. Enable SPI on Pi
```bash
sudo raspi-config
# Interface Options → SPI → Enable
sudo reboot
```

### 2. Install Waveshare library
```bash
git clone https://github.com/waveshare/e-Paper.git
cd e-Paper/RaspberryPi_JetsonNano/python
sudo python3 setup.py install
```

### 3. Install Python deps
```bash
cd ~/eywa/pi-display
pip install -r requirements.txt
```

### 4. Set environment
```bash
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_KEY="your-anon-key"
```

### 5. Run
```bash
# Test once (saves preview to /tmp/eywa_eink_preview.png)
python eink_display.py --room demo --once

# Run continuously (default 300s/5min refresh)
python eink_display.py --room demo

# Custom interval (60s)
python eink_display.py --room demo --interval 60
```

### 6. Auto-start on boot
```bash
# Add to /etc/rc.local or create a systemd service
sudo nano /etc/systemd/system/eywa-eink.service
```

```ini
[Unit]
Description=Eywa E-Ink Display
After=network.target

[Service]
Type=simple
User=pi
Environment=SUPABASE_URL=https://your-project.supabase.co
Environment=SUPABASE_KEY=your-anon-key
WorkingDirectory=/home/pi/eywa/pi-display
ExecStart=/usr/bin/python3 eink_display.py --room demo
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable eywa-eink
sudo systemctl start eywa-eink
```

## TFT Touch Setup (ILI9341 3.5")

### 1. Enable SPI + install fbcp
```bash
sudo raspi-config  # Enable SPI
git clone https://github.com/juj/fbcp-ili9341.git
cd fbcp-ili9341
mkdir build && cd build
cmake -DILI9341=ON -DGPIO_TFT_DATA_CONTROL=25 -DGPIO_TFT_RESET_PIN=24 -DSPI_BUS_CLOCK_DIVISOR=6 ..
make -j
sudo ./fbcp-ili9341 &
```

### 2. Run touch interface
```bash
python tft_touch.py --room demo
```

## Display Strategy

The two displays serve different roles:

**E-ink (matte surface) - AR anchor + ambient status**
- Matte e-ink has zero reflections, making it reliable for Spectacles image tracking
- A fixed tracking marker in the top-right corner anchors the AR UI to the physical display
- No touch input. Spectacles provide interaction via hand tracking and pinch gestures
- Refreshes every 5 minutes by default (configurable via `--interval`) with agent status, room info, and tracking marker
- Low power. Runs for hours on a battery pack.

**TFT touch (glossy LCD) - interactive control surface**
- No tracking marker. Glossy screens cause reflections that break image tracking
- Direct touch interaction: tap agents, send injections, browse memories
- Higher refresh rate (30fps) for responsive UI
- Used when you want to interact with agents without Spectacles

The marker handles positioning. Spectacles' IMU handles orientation. Extended Marker Tracking detects the marker once, detaches the AR panel to world space, then disables marker tracking to save performance.

See [`eywa-specs/`](../eywa-specs/) for the Lens Studio project and [`eywa-specs/README.md`](../eywa-specs/README.md) for the streaming protocol.

## Mini Display (Phone/Tablet/Web)

If you don't have a Raspberry Pi, you can use any device with a browser as a display. The web dashboard includes two display-optimized views:

### MiniEywaEink (ambient mode)
Navigate to `/r/{room-slug}` and select the e-ink view. Renders a static layout with:
- Room name and agent count
- Agent avatars and status
- Activity feed
- Room QR code (for joining from another device)

Useful for: phone propped on desk, old tablet mounted on wall, Raspberry Pi with Chromium in kiosk mode.

### SpectaclesView (AR streaming)
Navigate to `/r/{room-slug}/spectacles` and click "Broadcast". This renders tile textures and streams them to connected Spectacles via Supabase Realtime. See [`eywa-specs/README.md`](../eywa-specs/README.md) for the full protocol.

## Wiring

### E-Ink (Waveshare HAT)
Just plug the HAT onto the Pi GPIO header.

### TFT (ILI9341 SPI)
| TFT Pin | Pi Pin |
|---------|--------|
| VCC | 3.3V (Pin 1) |
| GND | GND (Pin 6) |
| CS | CE0 (Pin 24) |
| RESET | GPIO24 (Pin 18) |
| DC | GPIO25 (Pin 22) |
| SDI/MOSI | MOSI (Pin 19) |
| SCK | SCLK (Pin 23) |
| LED | 3.3V (Pin 1) |
| SDO/MISO | MISO (Pin 21) |
| T_CLK | SCLK (Pin 23) |
| T_CS | CE1 (Pin 26) |
| T_DIN | MOSI (Pin 19) |
| T_DO | MISO (Pin 21) |
| T_IRQ | GPIO17 (Pin 11) |
