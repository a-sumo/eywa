# Waveshare 2.13" E-Paper Display Hat V4

Setup guide for the mini Eywa status display.

## Hardware

- **Display**: Waveshare 2.13inch E-Paper Display Hat V4
- **Resolution**: 250x122, black/white
- **Interface**: SPI
- **Form factor**: HAT (plugs directly onto Raspberry Pi GPIO header)

## Wiring

No wiring needed. The HAT plugs onto the 40-pin GPIO header directly.

Pins used internally by the HAT:
- SPI0: MOSI (GPIO10), SCLK (GPIO11), CE0 (GPIO8)
- DC: GPIO25
- RST: GPIO17
- BUSY: GPIO24

## Setup

1. Enable SPI:
   ```
   sudo raspi-config
   # Interface Options -> SPI -> Enable
   ```

2. Install dependencies:
   ```
   pip install spidev RPi.GPIO Pillow requests
   ```

3. Clone Waveshare driver library:
   ```
   git clone https://github.com/waveshare/e-Paper.git
   cd e-Paper/RaspberryPi_JetsonNano/python
   pip install .
   ```

4. Test the display:
   ```
   cd e-Paper/RaspberryPi_JetsonNano/python/examples
   python3 epd_2in13_V4_test.py
   ```

## Running the mini interface

```
# Preview mode (saves PNG, no hardware needed)
python3 epaper_mini.py --room demo --preview

# Live on hardware
python3 epaper_mini.py --room demo

# One-shot render
python3 epaper_mini.py --room demo --once
```

## Refresh strategy

- Full refresh on startup (clears ghosting)
- Partial refresh every 30s (fast, low-flicker)
- Forced full refresh every 10 minutes (prevents ghost buildup)
- Display sleeps between refreshes to save power

## Layout (250x122, landscape)

```
+--------+--------------------------------------+
| Mascot | Room: /demo                          |
| 32x32  | 3 agents: quiet-oak, sunny-wolf, ... |
| static | Last activity: 2m ago                |
+--------+--------------------------------------+
  40px                  210px
```

## Troubleshooting

- **Blank screen**: Check SPI is enabled (`ls /dev/spidev*` should show devices)
- **Ghosting**: Run a full refresh cycle, or power-cycle the display
- **Import error**: Make sure the waveshare e-Paper library is installed in the same Python environment
