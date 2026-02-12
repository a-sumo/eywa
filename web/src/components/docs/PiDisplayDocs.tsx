import { useTranslation } from "react-i18next";
import { WavesharePinout } from "./WavesharePinout";
import { ILI9341Pinout } from "./ILI9341Pinout";

export function PiDisplayDocs() {
  const { t } = useTranslation("docs");
  return (
    <article className="docs-article">
      <h1>{t("pi.title")}</h1>
      <p className="docs-lead" dangerouslySetInnerHTML={{ __html: t("pi.lead") }} />

      <h2>{t("pi.hardware.heading")}</h2>
      <table>
        <thead>
          <tr>
            <th>{t("pi.hardware.table.display")}</th>
            <th>{t("pi.hardware.table.resolution")}</th>
            <th>{t("pi.hardware.table.type")}</th>
            <th>{t("pi.hardware.table.script")}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{t("pi.hardware.table.waveshare.name")}</td>
            <td>600x448</td>
            <td>{t("pi.hardware.table.waveshare.type")}</td>
            <td><code>eink_display.py</code></td>
          </tr>
          <tr>
            <td>{t("pi.hardware.table.tft.name")}</td>
            <td>320x480</td>
            <td>{t("pi.hardware.table.tft.type")}</td>
            <td><code>tft_touch.py</code></td>
          </tr>
        </tbody>
      </table>

      <h2>{t("pi.displayStrategy.heading")}</h2>

      <h3>{t("pi.displayStrategy.eink.heading")}</h3>
      <ul>
        <li>{t("pi.displayStrategy.eink.matteTracking")}</li>
        <li>{t("pi.displayStrategy.eink.fixedMarker")}</li>
        <li>{t("pi.displayStrategy.eink.noTouch")}</li>
        <li dangerouslySetInnerHTML={{ __html: t("pi.displayStrategy.eink.refresh") }} />
        <li>{t("pi.displayStrategy.eink.lowPower")}</li>
      </ul>

      <h3>{t("pi.displayStrategy.tft.heading")}</h3>
      <ul>
        <li>{t("pi.displayStrategy.tft.noTracking")}</li>
        <li>{t("pi.displayStrategy.tft.directTouch")}</li>
        <li>{t("pi.displayStrategy.tft.refreshRate")}</li>
        <li>{t("pi.displayStrategy.tft.useCase")}</li>
      </ul>

      <h2>{t("pi.wiring.heading")}</h2>

      <h3>{t("pi.wiring.eink.heading")}</h3>
      <p>{t("pi.wiring.eink.description")}</p>

      <h4>{t("pi.wiring.eink.moduleHeading")}</h4>
      <p style={{ fontSize: "13px", color: "#94a3b8" }}>
        {t("pi.wiring.eink.moduleHint")}
      </p>
      <WavesharePinout />

      <h3>{t("pi.wiring.tft.heading")}</h3>
      <p>{t("pi.wiring.tft.description")}</p>
      <ILI9341Pinout />

      <h2>{t("pi.einkSetup.heading")}</h2>

      <h3>{t("pi.einkSetup.step1.heading")}</h3>
      <pre className="docs-code"><code>{`sudo raspi-config
# Interface Options -> SPI -> Enable
sudo reboot`}</code></pre>

      <h3>{t("pi.einkSetup.step2.heading")}</h3>
      <pre className="docs-code"><code>{`git clone https://github.com/waveshare/e-Paper.git
cd e-Paper/RaspberryPi_JetsonNano/python
sudo python3 setup.py install`}</code></pre>

      <h3>{t("pi.einkSetup.step3.heading")}</h3>
      <pre className="docs-code"><code>{`cd ~/eywa/pi-display
pip install -r requirements.txt`}</code></pre>

      <h3>{t("pi.einkSetup.step4.heading")}</h3>
      <pre className="docs-code"><code>{`export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_KEY="your-anon-key"`}</code></pre>

      <h3>{t("pi.einkSetup.step5.heading")}</h3>
      <pre className="docs-code"><code>{`# Test once (saves preview to /tmp/eywa_eink_preview.png)
python eink_display.py --room demo --once

# Run continuously (default 300s/5min refresh)
python eink_display.py --room demo

# Custom interval (60s)
python eink_display.py --room demo --interval 60`}</code></pre>

      <h3>{t("pi.einkSetup.step6.heading")}</h3>
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

      <h2>{t("pi.tftSetup.heading")}</h2>

      <h3>{t("pi.tftSetup.step1.heading")}</h3>
      <pre className="docs-code"><code>{`sudo raspi-config  # Enable SPI
git clone https://github.com/juj/fbcp-ili9341.git
cd fbcp-ili9341
mkdir build && cd build
cmake -DILI9341=ON -DGPIO_TFT_DATA_CONTROL=25 -DGPIO_TFT_RESET_PIN=24 -DSPI_BUS_CLOCK_DIVISOR=6 ..
make -j
sudo ./fbcp-ili9341 &`}</code></pre>

      <h3>{t("pi.tftSetup.step2.heading")}</h3>
      <pre className="docs-code"><code>{`python tft_touch.py --room demo`}</code></pre>

      <h2>{t("pi.fallback.heading")}</h2>
      <p>{t("pi.fallback.intro")}</p>

      <h3>{t("pi.fallback.eink.heading")}</h3>
      <p dangerouslySetInnerHTML={{ __html: t("pi.fallback.eink.description") }} />

      <h3>{t("pi.fallback.spectacles.heading")}</h3>
      <p dangerouslySetInnerHTML={{ __html: t("pi.fallback.spectacles.description") }} />

      <h2>{t("pi.testScripts.heading")}</h2>
      <p>{t("pi.testScripts.intro")}</p>
      <table>
        <thead>
          <tr>
            <th>{t("pi.testScripts.table.script")}</th>
            <th>{t("pi.testScripts.table.whatItTests")}</th>
            <th>{t("pi.testScripts.table.displayNeeded")}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>test_tft.py</code></td>
            <td>{t("pi.testScripts.table.tft.tests")}</td>
            <td dangerouslySetInnerHTML={{ __html: t("pi.testScripts.table.tft.display") }} />
          </tr>
          <tr>
            <td><code>test_eink.py</code></td>
            <td>{t("pi.testScripts.table.eink.tests")}</td>
            <td dangerouslySetInnerHTML={{ __html: t("pi.testScripts.table.eink.display") }} />
          </tr>
          <tr>
            <td><code>test_touch.py</code></td>
            <td>{t("pi.testScripts.table.touch.tests")}</td>
            <td>{t("pi.testScripts.table.touch.display")}</td>
          </tr>
        </tbody>
      </table>
    </article>
  );
}
