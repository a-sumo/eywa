# TFT Touch Display Guide

A complete walkthrough for wiring and running the Eywa touch interface on a 3.5" TFT LCD with a Raspberry Pi 3. No prior electronics experience needed.

## What you're building

A small touchscreen that shows your Eywa agents, their status, and lets you tap to inspect or inject messages. It pulls data from Supabase every 10 seconds and renders at 30fps using pygame on the Pi's framebuffer.

The display is 320x480 pixels, uses SPI to talk to the Pi, and has a resistive touchscreen (XPT2046 controller) layered on top of the LCD (ILI9341 controller).

---

## Components

### Raspberry Pi 3

Your computer. It has a 40-pin GPIO (General Purpose Input/Output) header along one edge. These pins let you connect external hardware. Some pins carry power (3.3V, 5V, ground), others are general-purpose digital pins you can assign to specific functions like SPI.

The Pi runs Linux (Raspberry Pi OS). You'll interact with it over SSH or with a keyboard/monitor plugged in.

### 3.5" ILI9341 TFT LCD with XPT2046 touch

This is actually two devices on one board:

- **ILI9341** - the LCD controller. It receives pixel data over SPI and draws it on screen. Resolution is 320x480. The display refreshes as fast as you can push data to it (realistically 15-30fps over SPI).
- **XPT2046** - the touch controller. It's a separate chip on the same board that reads where your finger presses on the resistive touch layer. It also talks over SPI, but on its own chip-select line so the Pi can talk to the LCD and touch controller independently.

The board has a row of pins along one edge. Each pin is labeled (VCC, GND, CS, RESET, DC, SDI, SCK, LED, SDO, T_CLK, T_CS, T_DIN, T_DO, T_IRQ). The "T_" pins are for the touch controller.

### Jumper wires (female-to-female)

Short wires with plastic connectors on both ends. You plug one end onto a TFT pin and the other onto a Pi GPIO pin. "Female" means the connector has a socket (hole) that slides onto a metal pin.

You need 14 jumper wires for this project. Color doesn't matter electrically, but using different colors helps you trace connections when debugging.

### Power source

The Pi 3 needs 5V / 2.5A via its micro-USB port. A phone charger usually works, but cheap ones may not supply enough current. If the Pi shows a lightning bolt icon on screen, your power supply is too weak.

The TFT gets its power (3.3V) from the Pi's GPIO pins, so it doesn't need its own power source.

---

## Understanding the pins

### GPIO numbering

The Pi's 40 pins are arranged in two rows of 20. There are two ways to refer to them:

- **Board pin number** (physical position): Pin 1 is top-left, Pin 2 is top-right, odds on the left, evens on the right, counting down.
- **BCM/GPIO number** (the chip's internal numbering): GPIO17, GPIO25, etc. These don't follow a simple pattern.

This guide uses **board pin numbers** (the physical position) because that's what you can count on the board. The GPIO numbers are noted in parentheses.

### Pin layout reference

Looking at the Pi with the USB ports facing you, the GPIO header is in the top-left. Pin 1 is marked with a square solder pad (the others are round).

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

### SPI explained

SPI (Serial Peripheral Interface) is a communication protocol. It uses a clock signal and data lines to send bits one at a time, very fast. The Pi has a built-in SPI controller that uses specific pins:

| SPI signal | Pi pin | What it does |
|------------|--------|-------------|
| MOSI | Pin 19 (GPIO10) | Master Out, Slave In. Data from Pi to device. |
| MISO | Pin 21 (GPIO9) | Master In, Slave Out. Data from device to Pi. |
| SCLK | Pin 23 (GPIO11) | Clock. The Pi toggles this to synchronize data transfer. |
| CE0 | Pin 24 (GPIO8) | Chip Enable 0. Pull low to talk to device 0 (the LCD). |
| CE1 | Pin 26 (GPIO7) | Chip Enable 1. Pull low to talk to device 1 (the touch controller). |

The "chip enable" pins are how the Pi selects which device to talk to. When CE0 is low, the LCD listens. When CE1 is low, the touch controller listens. Only one talks at a time.

---

## Wiring

Connect each TFT pin to the corresponding Pi pin using a jumper wire. The table below explains what each connection does.

### Power and ground

| TFT pin | Pi pin | Why |
|---------|--------|-----|
| **VCC** | Pin 1 (3.3V) | Powers the TFT's logic circuits. The ILI9341 and XPT2046 both run on 3.3V. |
| **GND** | Pin 6 (GND) | Shared ground. Every circuit needs a common reference point for voltage. Without this, nothing works. |
| **LED** | Pin 1 (3.3V) | Powers the backlight LEDs behind the LCD panel. Without this, the screen is dark even if it's receiving data. You can share Pin 1 with VCC using a Y-splitter or use Pin 17 (also 3.3V). |

Note: VCC and LED can go to the same 3.3V pin (Pin 1) or different 3.3V pins (Pin 1 and Pin 17). If the backlight flickers, use separate 3.3V pins.

### LCD data (ILI9341)

| TFT pin | Pi pin | Why |
|---------|--------|-----|
| **CS** | Pin 24 (CE0) | Chip Select for the LCD. The Pi pulls this low when sending pixel data to the screen. |
| **SDI/MOSI** | Pin 19 (MOSI) | Data line. Pixel data flows from Pi to LCD through this wire. |
| **SCK** | Pin 23 (SCLK) | Clock. Synchronizes the data transfer. Each clock pulse means one bit of data. |
| **SDO/MISO** | Pin 21 (MISO) | Data from LCD back to Pi. Used for reading display status (rarely needed, but wire it anyway). |
| **DC** | Pin 22 (GPIO25) | Data/Command select. When high, the LCD interprets incoming bytes as pixel data. When low, it interprets them as commands (like "set brightness" or "set drawing area"). |
| **RESET** | Pin 18 (GPIO24) | Hardware reset. The Pi pulses this low to restart the LCD controller. Used during initialization. |

### Touch controller (XPT2046)

| TFT pin | Pi pin | Why |
|---------|--------|-----|
| **T_CS** | Pin 26 (CE1) | Chip Select for touch. The Pi pulls this low when reading touch coordinates. Separate from the LCD's CS so both can share the SPI bus. |
| **T_DIN** | Pin 19 (MOSI) | Data to the touch controller. Shared with the LCD's SDI since only one device is selected at a time (via CS pins). |
| **T_DO** | Pin 21 (MISO) | Touch data back to Pi. Carries X/Y coordinate readings. Shared with LCD's SDO. |
| **T_CLK** | Pin 23 (SCLK) | Clock for touch. Shared with LCD's SCK. |
| **T_IRQ** | Pin 11 (GPIO17) | Touch interrupt. The touch controller pulls this pin low when a finger touches the screen. The Pi monitors this to know when to read coordinates. |

### Shared lines

Notice that MOSI, MISO, and SCLK are shared between the LCD and touch controller. This is normal for SPI. The chip select pins (CS and T_CS) determine which device is active. You run three jumper wires to these shared Pi pins, not six.

In practice, this means you'll have two wires going into Pin 19, two into Pin 21, and two into Pin 23. You can either:
- Carefully push two female jumper connectors onto the same Pi pin (they fit, but it's tight)
- Use a small breadboard to make the connection cleaner
- Solder a Y-splitter

### Wiring checklist

Before powering on, verify each connection:

```
TFT VCC    --> Pi Pin 1  (3.3V)
TFT GND    --> Pi Pin 6  (GND)
TFT CS     --> Pi Pin 24 (CE0)
TFT RESET  --> Pi Pin 18 (GPIO24)
TFT DC     --> Pi Pin 22 (GPIO25)
TFT SDI    --> Pi Pin 19 (MOSI)
TFT SCK    --> Pi Pin 23 (SCLK)
TFT LED    --> Pi Pin 17 (3.3V)
TFT SDO    --> Pi Pin 21 (MISO)
TFT T_CLK  --> Pi Pin 23 (SCLK)  [shared with SCK]
TFT T_CS   --> Pi Pin 26 (CE1)
TFT T_DIN  --> Pi Pin 19 (MOSI)  [shared with SDI]
TFT T_DO   --> Pi Pin 21 (MISO)  [shared with SDO]
TFT T_IRQ  --> Pi Pin 11 (GPIO17)
```

Total unique Pi pins used: **9** (Pins 1, 6, 11, 17, 18, 19, 21, 22, 23, 24, 26).
Total jumper wires needed: **14** (some go to the same Pi pin).

---

## Raspberry Pi setup

### 1. Install Raspberry Pi OS

If your Pi doesn't have an OS yet:

1. Download [Raspberry Pi Imager](https://www.raspberrypi.com/software/) on your computer
2. Insert your microSD card
3. Choose "Raspberry Pi OS (32-bit)" (the Lite version is fine, no desktop needed)
4. In the settings gear icon, set your WiFi credentials and enable SSH
5. Write the image
6. Insert the SD card into the Pi and power it on

### 2. Connect to the Pi

Wait about 60 seconds after powering on, then SSH in from your computer:

```bash
ssh pi@raspberrypi.local
```

Default password is `raspberry`. Change it immediately:

```bash
passwd
```

### 3. Enable SPI

The SPI bus is disabled by default. Enable it:

```bash
sudo raspi-config
```

Navigate: **Interface Options** -> **SPI** -> **Enable** -> **Finish**

Reboot:

```bash
sudo reboot
```

### 4. Verify SPI is working

After reboot, check that the SPI device files exist:

```bash
ls /dev/spi*
```

You should see `/dev/spidev0.0` and `/dev/spidev0.1`. These correspond to CE0 (LCD) and CE1 (touch).

If you see nothing, SPI didn't enable properly. Check `/boot/config.txt` (or `/boot/firmware/config.txt` on newer OS) contains `dtparam=spi=on`.

---

## Display driver setup

The TFT is an SPI device, not HDMI. The Pi doesn't know how to use it as a display by default. You need a driver that copies the Pi's framebuffer (the in-memory image that represents the screen) to the TFT over SPI.

### Option A: fbcp-ili9341 (recommended, faster)

This driver uses DMA (Direct Memory Access) for faster SPI transfers. It can push 30+ fps to the display.

```bash
sudo apt-get update
sudo apt-get install -y cmake git
git clone https://github.com/juj/fbcp-ili9341.git
cd fbcp-ili9341
mkdir build && cd build
cmake -DILI9341=ON \
      -DGPIO_TFT_DATA_CONTROL=25 \
      -DGPIO_TFT_RESET_PIN=24 \
      -DSPI_BUS_CLOCK_DIVISOR=6 \
      ..
make -j$(nproc)
```

The cmake flags match our wiring:
- `DILI9341=ON` - tells the driver we have an ILI9341 LCD
- `DGPIO_TFT_DATA_CONTROL=25` - DC pin is GPIO25 (Pin 22)
- `DGPIO_TFT_RESET_PIN=24` - RESET pin is GPIO24 (Pin 18)
- `DSPI_BUS_CLOCK_DIVISOR=6` - SPI speed. Lower = faster. 6 is aggressive but usually works.

Test the driver:

```bash
sudo ./fbcp-ili9341
```

If your wiring is correct, you should see the Pi's console or desktop mirrored on the TFT. Press Ctrl+C to stop.

If the screen stays white or shows garbage, double-check your wiring, especially DC, RESET, CS, MOSI, and SCLK.

### Option B: LCD-show (simpler, slower)

If fbcp-ili9341 gives you trouble, this is the fallback:

```bash
git clone https://github.com/goodtft/LCD-show.git
cd LCD-show
chmod +x LCD35-show
sudo ./LCD35-show
```

The Pi reboots. The TFT should show the desktop. This method is slower (uses a kernel overlay instead of DMA) but works with more display variants.

To switch back to HDMI later:

```bash
cd ~/LCD-show
sudo ./LCD-hdmi
```

### Making fbcp-ili9341 start at boot

If using Option A, create a systemd service so the driver starts automatically:

```bash
sudo cp ~/fbcp-ili9341/build/fbcp-ili9341 /usr/local/bin/
```

```bash
sudo nano /etc/systemd/system/fbcp.service
```

Paste:

```ini
[Unit]
Description=fbcp-ili9341 TFT driver
After=multi-user.target

[Service]
Type=simple
ExecStart=/usr/local/bin/fbcp-ili9341
Restart=always

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable fbcp
sudo systemctl start fbcp
```

---

## Touch calibration

### Install the touch overlay

Add the touch controller overlay to your boot config:

```bash
sudo nano /boot/config.txt
```

Add at the bottom (or in `/boot/firmware/config.txt` on newer Pi OS):

```ini
dtoverlay=ads7846,cs=1,penirq=17,penirq_pull=2,speed=50000,keep_vref_on=0,swapxy=0,pmax=255,xohms=150,xmin=200,xmax=3900,ymin=200,ymax=3900
```

This tells the kernel about the XPT2046 touch controller:
- `cs=1` - uses CE1 (SPI chip select 1)
- `penirq=17` - IRQ on GPIO17 (Pin 11)
- The x/y min/max values define the coordinate range

Reboot:

```bash
sudo reboot
```

### Verify touch is detected

```bash
ls /dev/input/event*
```

You should see at least one event device. To check which one is the touchscreen:

```bash
cat /proc/bus/input/devices
```

Look for "ADS7846" in the output. Note its event number (e.g., event0).

### Create the touchscreen symlink

The Eywa code expects `/dev/input/touchscreen`. Create a udev rule:

```bash
sudo nano /etc/udev/rules.d/95-touchscreen.rules
```

Paste:

```
SUBSYSTEM=="input", KERNEL=="event[0-9]*", ATTRS{name}=="ADS7846*", SYMLINK+="input/touchscreen"
```

Reload udev:

```bash
sudo udevadm control --reload-rules
sudo udevadm trigger
```

### Calibrate (optional but recommended)

If touches register at wrong positions:

```bash
sudo apt-get install -y xinput-calibrator
DISPLAY=:0.0 xinput_calibrator
```

Tap the four crosshairs that appear. The tool outputs calibration values. Save them:

```bash
sudo mkdir -p /etc/X11/xorg.conf.d
sudo nano /etc/X11/xorg.conf.d/99-calibration.conf
```

Paste the output from the calibrator.

---

## Install Python dependencies

```bash
sudo apt-get install -y python3-pip python3-pygame python3-pil
pip3 install requests
```

If `python3-pygame` isn't available via apt:

```bash
pip3 install pygame
```

---

## Run the Eywa TFT display

### Without Supabase (demo mode)

The script falls back to demo data when no credentials are set:

```bash
cd ~/eywa/pi-display
python3 tft_touch.py --room demo
```

You should see a cream-colored UI with four demo agents. Tap an agent card to see details. Tap "Inject" to send a test message (prints to console in demo mode).

### With Supabase (live data)

Set your credentials:

```bash
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_KEY="your-anon-key"
```

Run with your room slug:

```bash
python3 tft_touch.py --room your-room-slug
```

### Auto-start on boot

```bash
sudo nano /etc/systemd/system/eywa-tft.service
```

```ini
[Unit]
Description=Eywa TFT Touch Display
After=network.target fbcp.service
Wants=fbcp.service

[Service]
Type=simple
User=pi
Environment=SDL_FBDEV=/dev/fb1
Environment=SDL_MOUSEDRV=TSLIB
Environment=SDL_MOUSEDEV=/dev/input/touchscreen
Environment=SUPABASE_URL=https://your-project.supabase.co
Environment=SUPABASE_KEY=your-anon-key
WorkingDirectory=/home/pi/eywa/pi-display
ExecStart=/usr/bin/python3 tft_touch.py --room your-room-slug
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable eywa-tft
sudo systemctl start eywa-tft
```

---

## How the code works

The script (`tft_touch.py`) has three main parts:

**Data fetching.** Every 10 seconds, it queries Supabase for the last 24 hours of memories in your room. It groups them by agent, determines who's active (seen in the last 30 minutes), and extracts their current task from session_start events.

**Rendering.** It uses pygame to draw frames at 30fps. Pygame writes to `/dev/fb1` (the TFT framebuffer). There are two views:
- List view: agent cards with name, task, status dot, memory count, and an "Inject" button
- Detail view: full agent info, recent memories with word-wrapped content, a large inject button

**Touch handling.** Pygame reads touch events from `/dev/input/touchscreen` via the SDL TSLIB driver. On each touch-down event, it checks which button rectangle contains the touch coordinates and dispatches the action (select agent, go back, inject message).

---

## Troubleshooting

**Screen is white/blank**
- Check VCC and GND connections
- Check CS, MOSI, SCLK connections
- Make sure SPI is enabled (`ls /dev/spi*` should show devices)
- Try a lower SPI speed: change `SPI_BUS_CLOCK_DIVISOR` to 12 or 20

**Screen shows image but upside down**
- Add `display_rotate=2` to `/boot/config.txt`
- Or change the fbcp-ili9341 cmake flag: add `-DDISPLAY_ROTATE_180_DEGREES=ON`

**Backlight is off (screen is dark but you can faintly see content in strong light)**
- Check the LED pin connection. It needs 3.3V.

**Touch doesn't work**
- Check T_CS, T_CLK, T_DIN, T_DO, T_IRQ connections
- Verify the touch overlay is in `/boot/config.txt`
- Run `dmesg | grep -i ads` after boot to see if the kernel found the touch controller
- Check `ls /dev/input/event*` for the event device

**Touch coordinates are wrong (tapping one spot registers somewhere else)**
- Run `xinput_calibrator` and save the calibration
- Or adjust the xmin/xmax/ymin/ymax values in the dtoverlay line

**"No module named pygame"**
- Install it: `sudo apt-get install python3-pygame` or `pip3 install pygame`

**Screen flickers or has artifacts**
- Your power supply may be too weak. Use a 5V / 2.5A supply.
- Try increasing `SPI_BUS_CLOCK_DIVISOR` (slower but more stable)

**fbcp-ili9341 crashes on start**
- Check that no other process is using the SPI bus
- Make sure the cmake flags match your wiring (GPIO numbers for DC and RESET)

**No /dev/fb1**
- The TFT framebuffer only appears when the display driver is running
- Start fbcp-ili9341 first, then check `ls /dev/fb*`
- Some setups use fb0. Try `export SDL_FBDEV=/dev/fb0`

---

## Wiring mistakes that won't break anything

If you accidentally connect a data pin to the wrong GPIO, the display just won't work. SPI connections at 3.3V logic won't damage the Pi or the TFT. The dangerous thing would be connecting a 5V pin to a data pin on the TFT (it expects 3.3V), but the Pi's 5V pins (Pin 2 and Pin 4) are only in the top-right corner, far from where you'd normally wire.

The one thing to be careful about: don't connect VCC to 5V. The TFT runs on 3.3V. Some boards have onboard regulators that handle 5V input, but unless your board's documentation explicitly says it accepts 5V, stick with 3.3V (Pin 1 or Pin 17).

---

## Next steps

Once the display is running:

- **Battery power:** A USB power bank works. Plug it into the Pi's micro-USB port. The TFT draws power from the Pi, so one battery powers everything.
- **Case:** A 3D-printed case or even a small cardboard box keeps the wiring safe and the display upright.
- **Multiple rooms:** Run `tft_touch.py --room other-room` to switch which Eywa room you're monitoring.
- **Combine with E-Ink:** The E-Ink display uses the same SPI bus with a different chip select. See the main README for the E-Ink setup. You can run both displays on one Pi.
