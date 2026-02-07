# Raspberry Pi 3B+ → Waveshare 5.65" 7-Color e-Paper Setup Guide

## Hardware

- **Board**: Raspberry Pi 3B+ (FCC ID: 2ABCB-RPI3BP)
- **Display**: Waveshare 5.65inch ACeP 7-Color e-Paper Module (F) — 600×448 pixels
- **OS**: Raspberry Pi OS (32-bit) — flashed via Raspberry Pi Imager v2.0.6
- **SD Card**: SanDisk 32GB microSD

---

## GPIO Pin Connections (Waveshare → Pi)

| Waveshare Pin | Pi Pin # | Pi GPIO    | Function      | Wire Color |
|---------------|----------|------------|---------------|------------|
| VCC           | 1        | 3.3V       | Power         | Red        |
| GND           | 6        | GND        | Ground        | Grey/Black |
| DIN           | 19       | GPIO 10    | SPI MOSI      | Blue       |
| CLK           | 23       | GPIO 11    | SPI SCLK      | Yellow     |
| CS            | 24       | GPIO 8     | SPI CE0       | Green      |
| DC            | 22       | GPIO 25    | Data/Command  | Purple     |
| RST           | 11       | GPIO 17    | Reset         | Pink       |
| BUSY          | 18       | GPIO 24    | Busy Signal   | Cyan       |

---

## OS Setup (Headless — No Monitor)

### Flashing the SD Card

1. Open **Raspberry Pi Imager v2.0.6**
2. Device: **Raspberry Pi 3**
3. OS: **Raspberry Pi OS (32-bit)** ← important for Pi 3B+
4. Storage: select your microSD card
5. Customisation settings:
   - **Hostname**: `raspberrypi`
   - **SSH**: Enabled (password authentication)
   - **Username**: `armandsumo`
   - **Password**: (your password)
   - **Wi-Fi**: configured with your network SSID and password
   - **Raspberry Pi Connect**: optional (enable if you got a token)
6. Flash the card

### SD Card Insertion

- Slot is on the **underside** of the Pi board, opposite the USB/Ethernet ports
- Insert with **gold contacts facing up** toward the board
- Push until you feel a **click**
- Card will stick out slightly on Pi 3B+

### First Boot

1. Insert SD card into Pi
2. Plug in power (micro-USB, 5V/2.5A)
3. Wait ~90 seconds for boot
4. Verify: **red LED** = power, **green LED blinking** = reading SD card / booting

### SSH Connection (from Mac)

```bash
ssh armandsumo@raspberrypi.local
```

If `raspberrypi.local` doesn't resolve:
- Check router admin page for Pi's IP address
- Use `arp -a` to scan network
- Connect via IP: `ssh armandsumo@192.168.x.x`

---

## Software Setup

### Fix Locale Warnings

```bash
sudo apt-get install -y locales-all
sudo touch /var/lib/cloud/instance/locale-check.skip
```

### Enable SPI

```bash
sudo raspi-config nonint do_spi 0
```

### Install Dependencies

```bash
sudo apt update
sudo apt install -y python3-pip python3-pil python3-numpy python3-spidev python3-rpi.gpio
```

### Clone Waveshare e-Paper Library

```bash
git clone https://github.com/waveshare/e-Paper.git
```

### Run Test Script

```bash
cd e-Paper/RaspberryPi_JetsonNano/python/examples
python3 epd_5in65f_test.py
```

- 7-color display takes **15-30 seconds per refresh**
- Screen will flash and show test patterns

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Red LED only, no green LED | SD card not seated — push until click, re-power |
| `ping raspberrypi.local` fails | Pi not on Wi-Fi — double-check SSID/password, re-flash |
| SSH hangs | Pi still booting — wait 2-3 minutes on first boot |
| `Connection reset by peer` | Power glitch — just reconnect via SSH |
| Imager shows SD card as "Read-only" | Unlock the physical switch on SD adapter, or run `sudo diskutil unmountDisk force /dev/diskN` |
| Imager doesn't show SD card | Run `diskutil list` to confirm Mac sees it, eject and reinsert |

---

## Important Warnings

- **Do NOT power the Pi from a small LiPo battery** (e.g. 3.7V 400mAh) — the Pi 3B+ needs 5V/2.5A. Use wall power or a proper 5V 3A power bank.
- **Pi 3B+ runs best on 32-bit OS** — 64-bit support is flaky on this model.
- **Always shut down properly** before unplugging power: `sudo shutdown -h now`

---

## Key File Paths on the Pi

```
~/e-Paper/                                         # Waveshare library root
~/e-Paper/RaspberryPi_JetsonNano/python/lib/       # Python driver modules
~/e-Paper/RaspberryPi_JetsonNano/python/examples/  # Test scripts
```

## Useful Commands

```bash
# Reconnect via SSH
ssh armandsumo@raspberrypi.local

# Check SPI is enabled
ls /dev/spidev*    # should show spidev0.0 and spidev0.1

# Check GPIO pin state
gpio readall

# Safe shutdown
sudo shutdown -h now

# Reboot
sudo reboot
```

---

## Making the Waveshare Library Importable

The Waveshare `setup.py install` fails on Pi OS with Python 3.13 because it tries to pull in Jetson.GPIO (an Nvidia dependency we don't need). Skip it and symlink instead:

```bash
sudo ln -s ~/e-Paper/RaspberryPi_JetsonNano/python/lib/waveshare_epd /usr/lib/python3/dist-packages/waveshare_epd
```

Verify:

```bash
python3 -c "from waveshare_epd import epd5in65f; print('OK')"
```

---

## Running the Eywa E-Ink Display

### Install deps

```bash
pip3 install Pillow requests --break-system-packages
```

### Copy files from your Mac

On your Mac (not the Pi):

```bash
scp -r ~/Documents/eywa/pi-display armandsumo@raspberrypi.local:~/
```

### Run in demo mode

```bash
cd ~/pi-display
python3 eink_display.py --room demo --once
```

The display will flicker for ~25 seconds (clearing), then another ~25 seconds (drawing). This is normal. See "Display Limitations" below.

### Run with live data

```bash
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_KEY="your-anon-key"
python3 eink_display.py --room your-room --once
```

---

## Display Limitations

This is a 7-color ACeP (Advanced Color ePaper) display. It works differently from a Kindle or other black-and-white e-ink:

- **Every refresh takes 15-30 seconds.** The controller cycles voltage patterns to position 7 different pigment types. There is no fast mode.
- **No partial refresh.** Even if only one pixel changes, the entire screen redraws with a full flash. Black-and-white e-ink panels support partial refresh (sub-second, no flash), but ACeP does not.
- **Sending only B/W pixels does not help.** The controller runs the same 7-color cycle regardless of what colors you use. The refresh time is a hardware constraint of the panel, not the content.
- **Black areas show visible dot patterns.** The ACeP dithering process leaves faint texture in large solid regions, especially black. Use bold shapes and avoid fine detail.
- **Best used as a static display.** Render once (or rarely) with content that doesn't change often: room identity, branding, tracking marker. Interactive/frequently-updating content belongs on the TFT touch display instead.

### What this means for Eywa

The e-ink display is a **poster**, not a monitor. It shows:
- The Eywa logo and room name (branding)
- A large tracking marker for Spectacles AR anchoring
- Room metadata (author, URL)

Agent status, activity feeds, and interactive controls go on the TFT touch display, which runs at 30fps with instant response.
