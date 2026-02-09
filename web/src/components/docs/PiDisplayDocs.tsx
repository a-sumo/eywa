export function PiDisplayDocs() {
  return (
    <article className="docs-article">
      <h1>Pi Displays</h1>
      <p className="docs-lead">
        Raspberry Pi scripts for physical Eywa displays. Two hardware options
        serve different roles: the e-ink display acts as an ambient status board
        and AR tracking anchor, while the TFT touch display provides direct
        interaction with agents. If you don't have a Pi, any device with a
        browser works as a fallback.
      </p>

      <h2>Hardware</h2>
      <table>
        <thead>
          <tr>
            <th>Display</th>
            <th>Resolution</th>
            <th>Type</th>
            <th>Script</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Waveshare 5.65" 7-Color ACeP</td>
            <td>600x448</td>
            <td>E-Ink (passive)</td>
            <td><code>eink_display.py</code></td>
          </tr>
          <tr>
            <td>3.5" ILI9341 TFT</td>
            <td>320x480</td>
            <td>LCD (touch)</td>
            <td><code>tft_touch.py</code></td>
          </tr>
        </tbody>
      </table>

      <h2>Display Strategy</h2>

      <h3>E-ink (matte surface) - AR anchor + ambient status</h3>
      <ul>
        <li>
          Matte e-ink has zero reflections, making it reliable for Spectacles
          image tracking
        </li>
        <li>
          A fixed tracking marker in the right side of the display anchors the
          AR UI to the physical display
        </li>
        <li>
          No touch input. Spectacles provide interaction via hand tracking and
          pinch gestures
        </li>
        <li>
          Refreshes every 5 minutes by default (configurable via{" "}
          <code>--interval</code>) with agent status, room info, and tracking
          marker
        </li>
        <li>Low power. Runs for hours on a battery pack.</li>
      </ul>

      <h3>TFT touch (glossy LCD) - interactive control surface</h3>
      <ul>
        <li>
          No tracking marker. Glossy screens cause reflections that break image
          tracking
        </li>
        <li>
          Direct touch interaction: tap agents, send injections, browse memories
        </li>
        <li>Higher refresh rate (30fps) for responsive UI</li>
        <li>Used when you want to interact with agents without Spectacles</li>
      </ul>

      <h2>E-Ink Setup (Waveshare 5.65" ACeP)</h2>

      <h3>1. Enable SPI on Pi</h3>
      <pre className="docs-code"><code>{`sudo raspi-config
# Interface Options -> SPI -> Enable
sudo reboot`}</code></pre>

      <h3>2. Install Waveshare Library</h3>
      <pre className="docs-code"><code>{`git clone https://github.com/waveshare/e-Paper.git
cd e-Paper/RaspberryPi_JetsonNano/python
sudo python3 setup.py install`}</code></pre>

      <h3>3. Install Python Dependencies</h3>
      <pre className="docs-code"><code>{`cd ~/eywa/pi-display
pip install -r requirements.txt`}</code></pre>

      <h3>4. Set Environment</h3>
      <pre className="docs-code"><code>{`export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_KEY="your-anon-key"`}</code></pre>

      <h3>5. Run</h3>
      <pre className="docs-code"><code>{`# Test once (saves preview to /tmp/eywa_eink_preview.png)
python eink_display.py --room demo --once

# Run continuously (default 300s/5min refresh)
python eink_display.py --room demo

# Custom interval (60s)
python eink_display.py --room demo --interval 60`}</code></pre>

      <h3>6. Auto-start on Boot (systemd)</h3>
      <pre className="docs-code"><code>{`sudo nano /etc/systemd/system/eywa-eink.service`}</code></pre>
      <pre className="docs-code"><code>{`[Unit]
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
WantedBy=multi-user.target`}</code></pre>
      <pre className="docs-code"><code>{`sudo systemctl enable eywa-eink
sudo systemctl start eywa-eink`}</code></pre>

      <h2>TFT Touch Setup (ILI9341 3.5")</h2>

      <h3>1. Enable SPI + Install fbcp</h3>
      <pre className="docs-code"><code>{`sudo raspi-config  # Enable SPI
git clone https://github.com/juj/fbcp-ili9341.git
cd fbcp-ili9341
mkdir build && cd build
cmake -DILI9341=ON -DGPIO_TFT_DATA_CONTROL=25 -DGPIO_TFT_RESET_PIN=24 -DSPI_BUS_CLOCK_DIVISOR=6 ..
make -j
sudo ./fbcp-ili9341 &`}</code></pre>

      <h3>2. Run Touch Interface</h3>
      <pre className="docs-code"><code>{`python tft_touch.py --room demo`}</code></pre>

      <h2>Wiring</h2>

      <h3>E-Ink (Waveshare HAT)</h3>
      <p>
        Just plug the HAT onto the Pi GPIO header. No additional wiring needed.
      </p>

      <h3>TFT (ILI9341 SPI)</h3>
      <table>
        <thead>
          <tr>
            <th>TFT Pin</th>
            <th>Pi Pin</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>VCC</td>
            <td>3.3V (Pin 1)</td>
          </tr>
          <tr>
            <td>GND</td>
            <td>GND (Pin 6)</td>
          </tr>
          <tr>
            <td>CS</td>
            <td>CE0 (Pin 24)</td>
          </tr>
          <tr>
            <td>RESET</td>
            <td>GPIO24 (Pin 18)</td>
          </tr>
          <tr>
            <td>DC</td>
            <td>GPIO25 (Pin 22)</td>
          </tr>
          <tr>
            <td>SDI/MOSI</td>
            <td>MOSI (Pin 19)</td>
          </tr>
          <tr>
            <td>SCK</td>
            <td>SCLK (Pin 23)</td>
          </tr>
          <tr>
            <td>LED</td>
            <td>3.3V (Pin 1)</td>
          </tr>
          <tr>
            <td>SDO/MISO</td>
            <td>MISO (Pin 21)</td>
          </tr>
          <tr>
            <td>T_CLK</td>
            <td>SCLK (Pin 23)</td>
          </tr>
          <tr>
            <td>T_CS</td>
            <td>CE1 (Pin 26)</td>
          </tr>
          <tr>
            <td>T_DIN</td>
            <td>MOSI (Pin 19)</td>
          </tr>
          <tr>
            <td>T_DO</td>
            <td>MISO (Pin 21)</td>
          </tr>
          <tr>
            <td>T_IRQ</td>
            <td>GPIO17 (Pin 11)</td>
          </tr>
        </tbody>
      </table>

      <h2>Mini Display Fallback (Phone/Tablet/Web)</h2>
      <p>
        If you don't have a Raspberry Pi, you can use any device with a browser
        as a display. The web dashboard includes display-optimized views.
      </p>

      <h3>MiniEywaEink (ambient mode)</h3>
      <p>
        Navigate to <code>/r/&#123;room-slug&#125;</code> and select the e-ink
        view. Renders a static layout with room name, agent avatars and status,
        activity feed, and a room QR code. Useful for a phone propped on a desk,
        an old tablet mounted on a wall, or a Raspberry Pi running Chromium in
        kiosk mode.
      </p>

      <h3>SpectaclesView (AR streaming)</h3>
      <p>
        Navigate to <code>/r/&#123;room-slug&#125;/spectacles</code> and click
        "Broadcast". This renders tile textures and streams them to connected
        Spectacles via Supabase Realtime.
      </p>

      <h2>Test Scripts</h2>
      <p>
        Run these after wiring to verify hardware before using the full Eywa
        apps.
      </p>
      <table>
        <thead>
          <tr>
            <th>Script</th>
            <th>What It Tests</th>
            <th>Display Needed?</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>test_tft.py</code></td>
            <td>TFT color bars, text rendering, touch input</td>
            <td>TFT (or <code>--window</code> for laptop)</td>
          </tr>
          <tr>
            <td><code>test_eink.py</code></td>
            <td>E-ink 7-color swatches, shapes, pixel grid</td>
            <td>
              E-ink (or <code>--preview</code> for PNG,{" "}
              <code>--clear</code> to wipe display)
            </td>
          </tr>
          <tr>
            <td><code>test_touch.py</code></td>
            <td>Raw touch events, coordinate ranges, device detection</td>
            <td>None (reads kernel input)</td>
          </tr>
        </tbody>
      </table>
    </article>
  );
}
