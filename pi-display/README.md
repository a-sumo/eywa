# Remix Pi Displays

Raspberry Pi scripts for physical Remix displays.

## Hardware

| Display | Resolution | Type | Script |
|---------|------------|------|--------|
| Waveshare 5.65" 7-Color | 600x448 | E-Ink (passive) | `eink_display.py` |
| 3.5" ILI9341 TFT | 320x480 | LCD (touch) | `tft_touch.py` |

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
cd ~/remix/pi-display
pip install -r requirements.txt
```

### 4. Set environment
```bash
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_KEY="your-anon-key"
```

### 5. Run
```bash
# Test once (saves preview to /tmp/remix_eink_preview.png)
python eink_display.py --room demo --once

# Run continuously (60s refresh)
python eink_display.py --room demo --interval 60
```

### 6. Auto-start on boot
```bash
# Add to /etc/rc.local or create a systemd service
sudo nano /etc/systemd/system/remix-eink.service
```

```ini
[Unit]
Description=Remix E-Ink Display
After=network.target

[Service]
Type=simple
User=pi
Environment=SUPABASE_URL=https://your-project.supabase.co
Environment=SUPABASE_KEY=your-anon-key
WorkingDirectory=/home/pi/remix/pi-display
ExecStart=/usr/bin/python3 eink_display.py --room demo --interval 60
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable remix-eink
sudo systemctl start remix-eink
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

## Spectacles Tracking

The e-ink display includes a tracking marker in the top-right corner. This marker is designed for Snap Spectacles image tracking. When viewed through Spectacles, the RemixPanel AR interface appears anchored to the physical display.

See `remix-specs/` for the Lens Studio project.

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
