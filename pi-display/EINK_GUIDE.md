# E-Ink Display Guide

A complete walkthrough for wiring and running the Eywa ambient status display on a Waveshare 5.65" 7-Color e-Paper with a Raspberry Pi 3. No prior electronics experience needed.

## What you're building

A low-power ambient display that shows your Eywa agents, their status, tasks, and memory counts. It refreshes every 60 seconds (or only when content changes). A tracking marker in the top-right corner anchors the Spectacles AR panel to the physical display.

The display is 600x448 pixels and can show 7 colors: black, white, red, green, blue, yellow, and orange. It holds its image with zero power draw. The screen only uses power during a refresh (about 25 seconds per refresh).

E-ink works differently from an LCD. There's no backlight. The "pixels" are tiny capsules of colored particles that physically flip when voltage is applied, then stay put. Think of it as a fancy Etch A Sketch that keeps its image forever until you redraw.

---

## Components

### Raspberry Pi 3

Your computer. It has a 40-pin GPIO header along one edge. The Waveshare e-Paper connects to specific pins on this header for SPI communication and control signals. The Pi runs Linux and executes the Python script that fetches agent data and renders the display image.

### Waveshare 5.65" 7-Color e-Paper Module (F)

The display module. "ACeP" stands for Advanced Color ePaper, Waveshare's 7-color technology. The module has two parts:

- **The e-Paper panel** - the actual screen. A flat, matte, paper-like surface. It's fragile, treat it like a phone screen without a case.
- **The driver board** - a small PCB on the back with a ribbon cable connecting to the panel. This board has the SPI interface pins and the controller chip that translates commands into pixel updates.

The driver board exposes an 8-pin header. Some versions also come as a HAT (Hardware Attached on Top) with a full 40-pin connector that plugs directly onto the Pi. This guide covers both.

### Jumper wires (female-to-female)

If you have the **module version** (8-pin header, not a full HAT), you need 8 jumper wires to connect it to the Pi. "Female-to-female" means both ends have sockets that slide onto pins.

If you have the **HAT version**, you don't need jumper wires. It plugs straight onto the Pi's 40-pin header.

### Power source

The Pi 3 needs 5V / 2.5A via micro-USB. The e-Paper module gets 3.3V from the Pi's GPIO pins.

E-ink is extremely low power. Between refreshes, the display draws essentially nothing. The Pi itself is the main power consumer. A USB power bank works well for portable setups.

---

## HAT version vs Module version

### HAT version

The Waveshare HAT has a full 40-pin female header on the bottom. You align it with the Pi's GPIO pins and press down. Done. No wires needed. The HAT routes the correct pins internally.

Skip to [Raspberry Pi setup](#raspberry-pi-setup) if you have the HAT.

### Module version

The module has an 8-pin header labeled: VCC, GND, DIN, CLK, CS, DC, RST, BUSY. You connect these to the Pi with jumper wires. Read on for the wiring details.

---

## Understanding the pins

### What SPI is

SPI (Serial Peripheral Interface) is how the Pi sends pixel data to the e-Paper controller. It uses a clock line and a data line to transmit bits in sequence. The Pi has a built-in SPI controller on specific GPIO pins.

For a refresher on GPIO numbering (board pin numbers vs BCM/GPIO numbers), see the [TFT Guide](./TFT_GUIDE.md#gpio-numbering). This guide uses **board pin numbers** (physical position on the header).

### Pin layout reference

Looking at the Pi with USB ports facing you, GPIO header is top-left. Pin 1 has a square solder pad.

```
                    3.3V [1]  [2]  5V
            GPIO2 (SDA) [3]  [4]  5V
           GPIO3 (SCL)  [5]  [6]  GND
                 GPIO4   [7]  [8]  GPIO14 (TX)
                   GND   [9]  [10] GPIO15 (RX)
                GPIO17  [11]  [12] GPIO18
                GPIO27  [13]  [14] GND
                GPIO22  [15]  [16] GPIO23
                  3.3V  [17]  [18] GPIO24
       GPIO10 (MOSI)   [19]  [20] GND
        GPIO9 (MISO)   [21]  [22] GPIO25
       GPIO11 (SCLK)   [23]  [24] GPIO8 (CE0)
                   GND  [25]  [26] GPIO7 (CE1)
                         ... (pins 27-40 not used)
```

---

## Wiring (module version only)

The e-Paper module uses SPI plus a few control pins. Unlike the TFT (which has a separate touch controller sharing the bus), the e-Paper is a single SPI device with two extra signal lines: DC and BUSY.

### Connection table

| e-Paper pin | Pi pin | What it does |
|-------------|--------|-------------|
| **VCC** | Pin 1 (3.3V) | Powers the e-Paper driver board. It runs on 3.3V. Never connect to 5V. |
| **GND** | Pin 6 (GND) | Ground. Common reference point for all signals. |
| **DIN** | Pin 19 (MOSI, GPIO10) | Data In. Pixel and command data flows from the Pi to the display through this wire. "MOSI" means Master Out, Slave In. |
| **CLK** | Pin 23 (SCLK, GPIO11) | Clock. The Pi toggles this line to synchronize each bit of data. The display reads DIN on each clock pulse. |
| **CS** | Pin 24 (CE0, GPIO8) | Chip Select. The Pi pulls this low to tell the display "I'm talking to you." When high, the display ignores the SPI bus. |
| **DC** | Pin 22 (GPIO25) | Data/Command. When high, the display interprets incoming bytes as image data. When low, it interprets them as commands (like "start refresh" or "set window"). |
| **RST** | Pin 11 (GPIO17) | Reset. The Pi pulses this low to hardware-reset the display controller. Used during initialization. |
| **BUSY** | Pin 18 (GPIO24) | Busy signal. The display pulls this pin low while it's refreshing (moving the ink particles around). The Pi waits for this to go high before sending new data. A refresh takes about 25 seconds. |

### Why these specific Pi pins?

The Waveshare Python library (`epd5in65f.py`) has these GPIO numbers hardcoded:

- RST = GPIO17 (Pin 11)
- DC = GPIO25 (Pin 22)
- CS = GPIO8/CE0 (Pin 24)
- BUSY = GPIO24 (Pin 18)

MOSI and SCLK are fixed by the Pi's SPI hardware (Pins 19 and 23). You can't move these.

If you wire RST or DC to different pins, you'd need to edit the Waveshare library. Stick with the standard wiring.

### Wiring checklist

```
e-Paper VCC   --> Pi Pin 1  (3.3V)
e-Paper GND   --> Pi Pin 6  (GND)
e-Paper DIN   --> Pi Pin 19 (MOSI)
e-Paper CLK   --> Pi Pin 23 (SCLK)
e-Paper CS    --> Pi Pin 24 (CE0)
e-Paper DC    --> Pi Pin 22 (GPIO25)
e-Paper RST   --> Pi Pin 11 (GPIO17)
e-Paper BUSY  --> Pi Pin 18 (GPIO24)
```

Total wires: **8**. Each goes to a unique Pi pin, no sharing needed.

### Handling the ribbon cable

The e-Paper panel connects to the driver board via a thin flat ribbon cable (FPC). It's pre-attached on most modules. Do not bend it sharply or pull on it. If it comes loose, there's a small plastic latch on the connector. Lift the latch gently, slide the ribbon in with the contacts facing down, then press the latch closed.

---

## Running both displays on one Pi

If you're also using the TFT display (see [TFT Guide](./TFT_GUIDE.md)), you'll notice a conflict: both displays use some of the same Pi pins.

**Conflicting pins:**
- Pin 11 (GPIO17): TFT uses it for T_IRQ, e-Paper uses it for RST
- Pin 18 (GPIO24): TFT uses it for RESET, e-Paper uses it for BUSY
- Pin 22 (GPIO25): both use it for DC
- Pin 24 (CE0): both use it for CS

**To run both on one Pi**, you need to rewire one display to alternate GPIO pins and update the corresponding driver code. The simpler approach: run them on separate Pi boards. A Pi Zero W (~$15) is enough for the e-ink display since it only refreshes once a minute.

If you only have one Pi, connect whichever display you want to use first, and swap wires when switching.

---

## Raspberry Pi setup

### 1. Install Raspberry Pi OS

If your Pi doesn't have an OS yet:

1. Download [Raspberry Pi Imager](https://www.raspberrypi.com/software/) on your computer
2. Insert your microSD card
3. Choose "Raspberry Pi OS (32-bit)" (Lite is fine, no desktop needed)
4. In settings, configure WiFi and enable SSH
5. Write the image, insert the card, power on

### 2. Connect to the Pi

```bash
ssh pi@raspberrypi.local
```

Default password: `raspberry`. Change it:

```bash
passwd
```

### 3. Enable SPI

```bash
sudo raspi-config
```

Navigate: **Interface Options** -> **SPI** -> **Enable** -> **Finish**

```bash
sudo reboot
```

### 4. Verify SPI

```bash
ls /dev/spi*
```

You should see `/dev/spidev0.0` and `/dev/spidev0.1`.

---

## Install the Waveshare library

The Waveshare e-Paper library provides the `epd5in65f` module that knows how to initialize the display, convert images to the 7-color format, and push pixels over SPI.

```bash
sudo apt-get update
sudo apt-get install -y python3-pip python3-pil python3-numpy git
```

Clone and install the library:

```bash
git clone https://github.com/waveshare/e-Paper.git
cd e-Paper/RaspberryPi_JetsonNano/python
sudo python3 setup.py install
```

Verify the install:

```bash
python3 -c "from waveshare_epd import epd5in65f; print('OK')"
```

If it prints "OK", you're good.

### Install Eywa dependencies

```bash
cd ~/eywa/pi-display
pip3 install -r requirements.txt
```

This installs Pillow (image rendering) and requests (HTTP client for Supabase).

---

## Test the display

Run the Eywa test script first. It exercises all 7 colors, text rendering, shapes, and a pixel grid in a single image.

### Eywa test pattern

```bash
cd ~/eywa/pi-display
python3 test_eink.py
```

This renders a test image and pushes it to the display. You'll see:
- **Color swatches** - all 7 colors labeled (black, white, red, green, blue, yellow, orange). If any color is wrong or missing, it's a hardware issue.
- **Shapes** - filled circles, outlined rectangles, diagonal lines. Verifies drawing primitives work.
- **Text at multiple sizes** - 8px through 24px. Checks font rendering and pixel clarity.
- **Checkerboard grid** - alternating black/white squares. Shows stuck or dead pixels.
- **Dither test** - gray and color gradients. These will look banded on 7-color e-ink (that's normal, it only has 7 colors to work with).

Each refresh takes about 25 seconds. The script clears the display first (another 25 seconds), so expect about a minute total.

If nothing happens:
- Check VCC and GND
- Check that SPI is enabled
- Run `dmesg | tail -20` to look for SPI errors
- Double-check CS, DIN, CLK, DC, RST, BUSY connections

### Preview mode (no hardware)

Both test and Eywa scripts work without the display connected. They save a PNG instead:

```bash
# Test pattern preview
python3 test_eink.py --preview
# Saved to /tmp/eywa_eink_test.png

# Eywa display preview
python3 eink_display.py --room demo --once
# Saved to /tmp/eywa_eink_preview.png
```

Copy to your computer to inspect:

```bash
scp pi@raspberrypi.local:/tmp/eywa_eink_test.png .
```

### Clear the display

To reset the display to blank white:

```bash
python3 test_eink.py --clear
```

### Waveshare's own test (alternative)

Waveshare ships example scripts too. These are useful if the Eywa test fails, to isolate wiring from code issues:

```bash
cd ~/e-Paper/RaspberryPi_JetsonNano/python/examples
python3 epd_5in65f_test.py
```

This cycles through solid colors and patterns. Takes a few minutes.

---

## Run the Eywa e-ink display

### Without Supabase (demo mode)

When no credentials are set, the script uses built-in demo data with three agents:

```bash
python3 eink_display.py --room demo --once
```

The `--once` flag renders a single frame and exits. Without it, the script loops forever.

### With Supabase (live data)

```bash
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_KEY="your-anon-key"
python3 eink_display.py --room your-room-slug --interval 60
```

The script:
1. Fetches the last 24 hours of memories from your room
2. Groups them by agent
3. Determines each agent's status (active if seen within 30 minutes)
4. Renders the image with Pillow
5. Hashes the rendered image. If it matches the previous hash, it skips the refresh (saves the display from unnecessary wear)
6. Pushes the image to the e-Paper
7. Puts the display to sleep (zero power draw)
8. Waits 60 seconds, repeats

### Auto-start on boot

```bash
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
ExecStart=/usr/bin/python3 eink_display.py --room your-room-slug --interval 60
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable eywa-eink
sudo systemctl start eywa-eink
```

Check status:

```bash
sudo systemctl status eywa-eink
```

---

## How the code works

The script (`eink_display.py`) has four main parts:

**Data fetching.** Queries Supabase for recent memories, groups by agent, checks who's active. Falls back to demo data when no credentials are set.

**Creature sprites.** Each agent gets a deterministic 8x8 pixel creature (cat, dog, bird, fish, or bunny) based on a hash of their name. The same agent always gets the same creature. Colors are mapped to the 7-color e-ink palette (purple becomes blue, teal becomes green, etc.).

**Image rendering.** Uses Pillow to compose a 600x448 image: header with room name and time, up to 4 agent cards with creature sprites, status dots, task text, memory count bars, and the AR tracking marker in the top-right corner.

**Display output.** Initializes the e-Paper controller over SPI, clears it, pushes the rendered image buffer, then puts the controller to sleep. The `epd.sleep()` call is important. It powers down the controller between refreshes, which prevents damage to the display from prolonged high voltage on the ink particles.

### The smart refresh

E-ink refreshes are slow (~25 seconds) and wear the display slightly each time. The script hashes each rendered image and compares it to the previous one. If nothing changed (same agents, same status), it skips the refresh entirely. This matters when running 24/7.

---

## What the display shows

```
+--------------------------------------------------+
| Eywa                              14:32           |
|--------------------------------------------------|
|                                   +-----------+  |
| * [cat]  armand/quiet-oak         | tracking  |  |
|          implementing links       | marker    |  |
|          23 memories  [======]    | (for AR)  |  |
|                                   +-----------+  |
| * [dog]  web-user/sunny-wolf                     |
|          reviewing PR #42                        |
|          8 memories  [==]                        |
|                                                  |
| * [bird] claude/blue-tree                        |
|          writing tests                           |
|          15 memories  [====]                     |
|                                                  |
|--------------------------------------------------|
| eywa-ai.dev                                      |
+--------------------------------------------------+

* = green (active) or orange (idle) status dot
[cat] = 8x8 pixel creature sprite in agent's color
[====] = colored activity bar (width = memory count)
```

---

## E-ink care and limitations

**Refresh speed.** Each full refresh takes ~25 seconds. This is normal for 7-color ACeP. The ink particles need time to settle into position. There is no partial refresh mode on this display.

**Ghosting.** If you display the same image for many hours, you may see faint remnants of it after switching to a new image. This is temporary. A few full refreshes (especially solid black then solid white) clear it.

**Temperature.** E-ink performs poorly below 0C and above 50C. The refresh may fail or produce wrong colors outside this range. Room temperature is fine.

**Don't leave mid-refresh.** If you kill the script or lose power during a refresh, the display may show a partially updated image. It won't damage anything, but you'll need to run the script again to fix it. The `epd.sleep()` call ensures the controller is in a safe state between refreshes.

**Lifespan.** Waveshare rates these displays for roughly 1,000,000 refresh cycles. At one refresh per minute, that's about 2 years of continuous use. Skipping unchanged frames (which the code does) extends this significantly.

**No backlight.** E-ink is only visible in ambient light, just like paper. In a dark room, you can't see it without a desk lamp or similar.

---

## Troubleshooting

**Nothing appears on the display**
- Check VCC (3.3V) and GND connections
- Verify SPI is enabled: `ls /dev/spi*` should show devices
- Run the Waveshare test script to isolate wiring from software issues
- Check `dmesg | tail` for SPI errors

**Display shows wrong colors or stripes**
- The ribbon cable between panel and driver board may be loose. Reseat it.
- Try the Waveshare test script. If it also shows wrong colors, it's a hardware issue.

**"waveshare_epd not found" error**
- Install the library: `cd ~/e-Paper/RaspberryPi_JetsonNano/python && sudo python3 setup.py install`
- The script will run in preview mode (PNG output) without the library, which is fine for development

**Script hangs during refresh**
- The BUSY pin tells the Pi when the refresh is done. If BUSY is wired wrong, the script waits forever.
- Check BUSY is connected to Pin 18 (GPIO24)
- A refresh can legitimately take 25-35 seconds. Wait at least 40 seconds before assuming it's stuck.

**"Permission denied" on SPI**
- Run with `sudo`, or add your user to the spi group: `sudo usermod -aG spi pi`

**Partial or garbled image**
- Power supply issue. E-ink refreshes draw a brief spike of current. A weak power supply causes glitches.
- Use a 5V / 2.5A supply for the Pi 3.

**Preview image looks fine but display is blank**
- The preview and display paths are separate. Preview works without hardware. If preview is fine but the physical display is blank, it's a wiring or SPI issue.

---

## Next steps

- **Battery operation:** A 10,000mAh USB power bank runs a Pi 3 + e-ink display for about 8-10 hours. Since the display holds its image without power, you could even write a script that renders once, then shuts down the Pi until the next scheduled wake-up (using the Pi's RTC or a timer circuit).
- **Wall mount:** The matte e-ink surface looks great mounted on a wall or desk stand. The tracking marker doubles as an AR anchor for Spectacles.
- **Combine with TFT:** See the note above about pin conflicts. Two Pis (one per display) is the simplest path. A Pi Zero W is enough for the e-ink since it barely uses CPU.
- **Custom layouts:** Edit the `render_display()` function in `eink_display.py` to change what's shown. It's all Pillow drawing calls, straightforward to modify.
