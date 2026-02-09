import { useState, useRef, useEffect, useCallback } from "react";

const PI_PINS = [
  [{ num: 1, label: "3.3V", type: "power3v3" }, { num: 2, label: "5V", type: "power5v" }],
  [{ num: 3, label: "GPIO 2", type: "gpio", gpio: 2, alt: "SDA1" }, { num: 4, label: "5V", type: "power5v" }],
  [{ num: 5, label: "GPIO 3", type: "gpio", gpio: 3, alt: "SCL1" }, { num: 6, label: "GND", type: "gnd" }],
  [{ num: 7, label: "GPIO 4", type: "gpio", gpio: 4 }, { num: 8, label: "GPIO 14", type: "gpio", gpio: 14, alt: "TXD" }],
  [{ num: 9, label: "GND", type: "gnd" }, { num: 10, label: "GPIO 15", type: "gpio", gpio: 15, alt: "RXD" }],
  [{ num: 11, label: "GPIO 17", type: "gpio", gpio: 17 }, { num: 12, label: "GPIO 18", type: "gpio", gpio: 18, alt: "PCM_CLK" }],
  [{ num: 13, label: "GPIO 27", type: "gpio", gpio: 27 }, { num: 14, label: "GND", type: "gnd" }],
  [{ num: 15, label: "GPIO 22", type: "gpio", gpio: 22 }, { num: 16, label: "GPIO 23", type: "gpio", gpio: 23 }],
  [{ num: 17, label: "3.3V", type: "power3v3" }, { num: 18, label: "GPIO 24", type: "gpio", gpio: 24 }],
  [{ num: 19, label: "GPIO 10", type: "gpio", gpio: 10, alt: "MOSI" }, { num: 20, label: "GND", type: "gnd" }],
  [{ num: 21, label: "GPIO 9", type: "gpio", gpio: 9, alt: "MISO" }, { num: 22, label: "GPIO 25", type: "gpio", gpio: 25 }],
  [{ num: 23, label: "GPIO 11", type: "gpio", gpio: 11, alt: "SCLK" }, { num: 24, label: "GPIO 8", type: "gpio", gpio: 8, alt: "CE0" }],
  [{ num: 25, label: "GND", type: "gnd" }, { num: 26, label: "GPIO 7", type: "gpio", gpio: 7, alt: "CE1" }],
  [{ num: 27, label: "ID_SD", type: "special" }, { num: 28, label: "ID_SC", type: "special" }],
  [{ num: 29, label: "GPIO 5", type: "gpio", gpio: 5 }, { num: 30, label: "GND", type: "gnd" }],
  [{ num: 31, label: "GPIO 6", type: "gpio", gpio: 6 }, { num: 32, label: "GPIO 12", type: "gpio", gpio: 12, alt: "PWM0" }],
  [{ num: 33, label: "GPIO 13", type: "gpio", gpio: 13, alt: "PWM1" }, { num: 34, label: "GND", type: "gnd" }],
  [{ num: 35, label: "GPIO 19", type: "gpio", gpio: 19 }, { num: 36, label: "GPIO 16", type: "gpio", gpio: 16 }],
  [{ num: 37, label: "GPIO 26", type: "gpio", gpio: 26 }, { num: 38, label: "GPIO 20", type: "gpio", gpio: 20 }],
  [{ num: 39, label: "GND", type: "gnd" }, { num: 40, label: "GPIO 21", type: "gpio", gpio: 21 }],
];

const WAVESHARE_DEVICES = {
  epaper: {
    name: "e-Paper Display (SPI)",
    connections: [
      { wsLabel: "VCC", piPin: 1, color: "#ef4444", desc: "3.3V Power" },
      { wsLabel: "GND", piPin: 6, color: "#737373", desc: "Ground" },
      { wsLabel: "DIN", piPin: 19, color: "#3b82f6", desc: "SPI MOSI → GPIO 10" },
      { wsLabel: "CLK", piPin: 23, color: "#f59e0b", desc: "SPI SCLK → GPIO 11" },
      { wsLabel: "CS", piPin: 24, color: "#10b981", desc: "SPI CE0 → GPIO 8" },
      { wsLabel: "DC", piPin: 22, color: "#8b5cf6", desc: "Data/Cmd → GPIO 25" },
      { wsLabel: "RST", piPin: 11, color: "#ec4899", desc: "Reset → GPIO 17" },
      { wsLabel: "BUSY", piPin: 18, color: "#06b6d4", desc: "Busy → GPIO 24" },
    ],
  },
  lcd_spi: {
    name: "LCD Display (SPI)",
    connections: [
      { wsLabel: "VCC", piPin: 1, color: "#ef4444", desc: "3.3V Power" },
      { wsLabel: "GND", piPin: 6, color: "#737373", desc: "Ground" },
      { wsLabel: "DIN", piPin: 19, color: "#3b82f6", desc: "SPI MOSI → GPIO 10" },
      { wsLabel: "CLK", piPin: 23, color: "#f59e0b", desc: "SPI SCLK → GPIO 11" },
      { wsLabel: "CS", piPin: 24, color: "#10b981", desc: "SPI CE0 → GPIO 8" },
      { wsLabel: "DC", piPin: 22, color: "#8b5cf6", desc: "Data/Cmd → GPIO 25" },
      { wsLabel: "RST", piPin: 11, color: "#ec4899", desc: "Reset → GPIO 17" },
      { wsLabel: "BL", piPin: 12, color: "#f97316", desc: "Backlight → GPIO 18" },
    ],
  },
  oled_i2c: {
    name: "OLED Display (I2C)",
    connections: [
      { wsLabel: "VCC", piPin: 1, color: "#ef4444", desc: "3.3V Power" },
      { wsLabel: "GND", piPin: 6, color: "#737373", desc: "Ground" },
      { wsLabel: "SDA", piPin: 3, color: "#3b82f6", desc: "I2C Data → GPIO 2" },
      { wsLabel: "SCL", piPin: 5, color: "#f59e0b", desc: "I2C Clock → GPIO 3" },
    ],
  },
  game_hat: {
    name: "Game HAT / Joystick",
    connections: [
      { wsLabel: "VCC", piPin: 1, color: "#ef4444", desc: "3.3V Power" },
      { wsLabel: "GND", piPin: 6, color: "#737373", desc: "Ground" },
      { wsLabel: "DIN", piPin: 19, color: "#3b82f6", desc: "SPI MOSI → GPIO 10" },
      { wsLabel: "CLK", piPin: 23, color: "#f59e0b", desc: "SPI SCLK → GPIO 11" },
      { wsLabel: "CS", piPin: 24, color: "#10b981", desc: "SPI CE0 → GPIO 8" },
      { wsLabel: "DC", piPin: 22, color: "#8b5cf6", desc: "Data/Cmd → GPIO 25" },
      { wsLabel: "RST", piPin: 11, color: "#ec4899", desc: "Reset → GPIO 17" },
      { wsLabel: "BL", piPin: 12, color: "#f97316", desc: "Backlight → GPIO 18" },
      { wsLabel: "UP", piPin: 31, color: "#a3e635", desc: "Up → GPIO 6" },
      { wsLabel: "DOWN", piPin: 37, color: "#34d399", desc: "Down → GPIO 26" },
      { wsLabel: "LEFT", piPin: 33, color: "#67e8f9", desc: "Left → GPIO 13" },
      { wsLabel: "RIGHT", piPin: 35, color: "#c084fc", desc: "Right → GPIO 19" },
      { wsLabel: "BTN_A", piPin: 29, color: "#fbbf24", desc: "A Button → GPIO 5" },
      { wsLabel: "BTN_B", piPin: 15, color: "#fb923c", desc: "B Button → GPIO 22" },
    ],
  },
  servo: {
    name: "Servo Driver HAT (I2C)",
    connections: [
      { wsLabel: "VCC", piPin: 2, color: "#ef4444", desc: "5V Power" },
      { wsLabel: "GND", piPin: 6, color: "#737373", desc: "Ground" },
      { wsLabel: "SDA", piPin: 3, color: "#3b82f6", desc: "I2C Data → GPIO 2" },
      { wsLabel: "SCL", piPin: 5, color: "#f59e0b", desc: "I2C Clock → GPIO 3" },
    ],
  },
};

const typeColors = {
  power5v: { bg: "#dc2626", text: "#fff", border: "#991b1b" },
  power3v3: { bg: "#ea580c", text: "#fff", border: "#9a3412" },
  gnd: { bg: "#262626", text: "#a3a3a3", border: "#525252" },
  gpio: { bg: "#166534", text: "#bbf7d0", border: "#15803d" },
  special: { bg: "#4338ca", text: "#c7d2fe", border: "#3730a3" },
};

const PIN_ROW_H = 34;
const PIN_R = 14;
const HEADER_PAD_TOP = 48;

export default function App() {
  const [device, setDevice] = useState("epaper");
  const [hovered, setHovered] = useState(null);
  const containerRef = useRef(null);
  const [positions, setPositions] = useState({ piPins: {}, wsPins: {} });
  const piPinRefs = useRef({});
  const wsPinRefs = useRef({});

  const dev = WAVESHARE_DEVICES[device];
  const highlightSet = new Set(dev.connections.map((c) => c.piPin));
  const colorMap = {};
  dev.connections.forEach((c) => { colorMap[c.piPin] = c.color; });

  const recalc = useCallback(() => {
    if (!containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const pi = {};
    Object.entries(piPinRefs.current).forEach(([num, el]) => {
      if (el) {
        const r = el.getBoundingClientRect();
        pi[num] = {
          x: r.left + r.width / 2 - containerRect.left,
          y: r.top + r.height / 2 - containerRect.top,
        };
      }
    });
    const ws = {};
    Object.entries(wsPinRefs.current).forEach(([idx, el]) => {
      if (el) {
        const r = el.getBoundingClientRect();
        ws[idx] = {
          x: r.left + r.width / 2 - containerRect.left,
          y: r.top + r.height / 2 - containerRect.top,
        };
      }
    });
    setPositions({ piPins: pi, wsPins: ws });
  }, []);

  useEffect(() => {
    const t = setTimeout(recalc, 80);
    window.addEventListener("resize", recalc);
    return () => { clearTimeout(t); window.removeEventListener("resize", recalc); };
  }, [device, recalc]);

  const lines = dev.connections.map((conn, i) => {
    const from = positions.wsPins[i];
    const to = positions.piPins[conn.piPin];
    if (!from || !to) return null;
    return { from, to, color: conn.color, piPin: conn.piPin, idx: i };
  }).filter(Boolean);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(160deg, #050510 0%, #0c1222 40%, #0a0e1a 100%)",
        color: "#e2e8f0",
        fontFamily: "system-ui, sans-serif",
        padding: "20px 12px 40px",
      }}
    >
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Outfit:wght@400;600;700;800&display=swap" rel="stylesheet" />

      <h1 style={{
        fontFamily: "'Outfit', sans-serif", fontSize: "26px", fontWeight: 800,
        textAlign: "center", margin: "0 0 2px",
        background: "linear-gradient(90deg, #22d3ee, #a78bfa, #f472b6)",
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
      }}>
        Raspberry Pi ↔ Waveshare Wiring
      </h1>
      <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", color: "#475569", textAlign: "center", margin: "0 0 16px" }}>
        Interactive GPIO Connection Diagram
      </p>

      {/* Device selector */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", justifyContent: "center", marginBottom: "20px" }}>
        {Object.entries(WAVESHARE_DEVICES).map(([k, d]) => (
          <button key={k} onClick={() => { setDevice(k); setHovered(null); }}
            style={{
              padding: "7px 12px", borderRadius: "8px", cursor: "pointer",
              border: k === device ? "2px solid #818cf8" : "1px solid #1e293b",
              background: k === device ? "linear-gradient(135deg,#312e81,#1e1b4b)" : "#111827",
              color: k === device ? "#c7d2fe" : "#64748b",
              fontFamily: "'JetBrains Mono', monospace", fontSize: "10px", fontWeight: k === device ? 700 : 400,
              transition: "all .2s",
            }}>
            {d.name}
          </button>
        ))}
      </div>

      {/* Main wiring area */}
      <div ref={containerRef} style={{ position: "relative", display: "flex", justifyContent: "center", gap: "0px", alignItems: "flex-start", maxWidth: "900px", margin: "0 auto" }}>

        {/* SVG overlay for wires */}
        <svg style={{
          position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
          pointerEvents: "none", zIndex: 10,
        }}>
          <defs>
            {lines.map((l, i) => (
              <linearGradient key={`g${i}`} id={`grad-${i}`} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor={l.color} stopOpacity="0.9" />
                <stop offset="100%" stopColor={l.color} stopOpacity="0.9" />
              </linearGradient>
            ))}
          </defs>
          {lines.map((l, i) => {
            const isHov = hovered === l.piPin;
            const anyHov = hovered !== null;
            const dimmed = anyHov && !isHov;

            const dx = l.to.x - l.from.x;
            const cp1x = l.from.x + dx * 0.4;
            const cp2x = l.from.x + dx * 0.6;
            const path = `M ${l.from.x} ${l.from.y} C ${cp1x} ${l.from.y}, ${cp2x} ${l.to.y}, ${l.to.x} ${l.to.y}`;

            return (
              <g key={i}>
                {/* Glow */}
                {isHov && (
                  <path d={path} fill="none" stroke={l.color} strokeWidth="8"
                    opacity="0.25" strokeLinecap="round"
                    style={{ filter: `drop-shadow(0 0 6px ${l.color})` }} />
                )}
                {/* Wire */}
                <path d={path} fill="none"
                  stroke={dimmed ? "#1e293b" : l.color}
                  strokeWidth={isHov ? 3.5 : 2}
                  opacity={dimmed ? 0.15 : isHov ? 1 : 0.7}
                  strokeLinecap="round"
                  style={{ transition: "all .25s ease" }}
                />
                {/* Endpoints */}
                {!dimmed && (
                  <>
                    <circle cx={l.from.x} cy={l.from.y} r={isHov ? 5 : 3.5} fill={l.color} opacity={isHov ? 1 : 0.8} />
                    <circle cx={l.to.x} cy={l.to.y} r={isHov ? 5 : 3.5} fill={l.color} opacity={isHov ? 1 : 0.8} />
                  </>
                )}
              </g>
            );
          })}
        </svg>

        {/* Waveshare module (left side) */}
        <div style={{
          background: "linear-gradient(180deg, #111827 0%, #0f172a 100%)",
          borderRadius: "14px", padding: "16px 14px", minWidth: "140px",
          border: "1px solid #1e293b", zIndex: 3, marginTop: "30px",
          boxShadow: "0 4px 24px #00000055",
        }}>
          <div style={{
            fontFamily: "'Outfit', sans-serif", fontSize: "13px", fontWeight: 700,
            color: "#94a3b8", textAlign: "center", marginBottom: "14px",
            borderBottom: "1px solid #1e293b", paddingBottom: "10px",
          }}>
            🔌 Waveshare<br />
            <span style={{ fontSize: "10px", fontWeight: 400, color: "#475569" }}>{dev.name}</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {dev.connections.map((conn, i) => {
              const isHov = hovered === conn.piPin;
              const anyHov = hovered !== null;
              return (
                <div key={i}
                  ref={(el) => { wsPinRefs.current[i] = el; }}
                  onMouseEnter={() => setHovered(conn.piPin)}
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    display: "flex", alignItems: "center", gap: "8px",
                    padding: "5px 8px", borderRadius: "6px", cursor: "pointer",
                    background: isHov ? `${conn.color}20` : "transparent",
                    border: `1px solid ${isHov ? conn.color + "55" : "transparent"}`,
                    opacity: anyHov && !isHov ? 0.3 : 1,
                    transition: "all .2s ease",
                  }}>
                  <div style={{
                    width: "22px", height: "22px", borderRadius: "50%",
                    background: conn.color, display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "8px", fontWeight: 700, color: "#fff",
                    fontFamily: "'JetBrains Mono', monospace",
                    boxShadow: isHov ? `0 0 10px ${conn.color}66` : `0 1px 3px #00000044`,
                    flexShrink: 0,
                  }} />
                  <div>
                    <div style={{
                      fontFamily: "'JetBrains Mono', monospace", fontSize: "11px",
                      fontWeight: 700, color: isHov ? conn.color : "#cbd5e1",
                    }}>
                      {conn.wsLabel}
                    </div>
                    <div style={{
                      fontFamily: "'JetBrains Mono', monospace", fontSize: "8px",
                      color: "#475569",
                    }}>
                      → Pin {conn.piPin}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Spacer for wires */}
        <div style={{ minWidth: "80px", flexShrink: 1 }} />

        {/* Raspberry Pi GPIO header (right side) */}
        <div style={{
          background: "linear-gradient(180deg, #111827 0%, #0f172a 100%)",
          borderRadius: "14px", padding: "14px 10px",
          border: "1px solid #1e293b", zIndex: 3,
          boxShadow: "0 4px 24px #00000055",
        }}>
          <div style={{
            textAlign: "center", fontFamily: "'JetBrains Mono', monospace",
            fontSize: "9px", color: "#475569", marginBottom: "8px",
            textTransform: "uppercase", letterSpacing: "0.1em",
          }}>
            ▲ USB end
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            {PI_PINS.map((row, ri) => (
              <div key={ri} style={{ display: "flex", alignItems: "center", gap: "0px" }}>
                {/* Left pin */}
                {(() => {
                  const pin = row[0];
                  const isConn = highlightSet.has(pin.num);
                  const isHov = hovered === pin.num;
                  const anyHov = hovered !== null;
                  const c = typeColors[pin.type];
                  return (
                    <div style={{ display: "flex", alignItems: "center", gap: "4px", width: "175px", justifyContent: "flex-end" }}
                      onMouseEnter={() => isConn && setHovered(pin.num)}
                      onMouseLeave={() => setHovered(null)}>
                      <span style={{
                        fontFamily: "'JetBrains Mono', monospace", fontSize: "9px",
                        color: isHov ? (colorMap[pin.num] || "#f0f0f0") : anyHov && !isHov ? "#333" : "#666",
                        fontWeight: isHov ? 700 : 400, transition: "all .2s",
                        textAlign: "right", flex: 1, whiteSpace: "nowrap", overflow: "hidden",
                      }}>
                        {pin.alt && <span style={{ color: isHov ? colorMap[pin.num] + "aa" : "#444", marginRight: "3px", fontSize: "8px" }}>{pin.alt}</span>}
                        {pin.label}
                      </span>
                      <div
                        ref={(el) => { piPinRefs.current[pin.num] = el; }}
                        style={{
                          width: "26px", height: "26px", borderRadius: "50%", flexShrink: 0,
                          background: isConn && isHov
                            ? `radial-gradient(circle at 40% 35%, ${colorMap[pin.num]}, ${c.bg})`
                            : `radial-gradient(circle at 40% 35%, ${c.bg}dd, ${c.bg})`,
                          border: `2px solid ${isHov ? (colorMap[pin.num] || "#fff") : isConn ? colorMap[pin.num] + "88" : c.border}`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: "8px", fontWeight: 700, color: c.text,
                          fontFamily: "'JetBrains Mono', monospace",
                          boxShadow: isHov ? `0 0 12px ${colorMap[pin.num] || c.bg}66` : "0 1px 3px #00000033",
                          opacity: anyHov && !isHov && !isConn ? 0.25 : anyHov && !isHov ? 0.45 : 1,
                          transition: "all .2s ease", cursor: isConn ? "pointer" : "default",
                        }}>
                        {pin.num}
                      </div>
                    </div>
                  );
                })()}

                {/* Center divider */}
                <div style={{ width: "4px", height: "20px", background: "#0a0e1a", borderRadius: "1px", margin: "0 2px", border: "1px solid #1a1f2e" }} />

                {/* Right pin */}
                {(() => {
                  const pin = row[1];
                  const isConn = highlightSet.has(pin.num);
                  const isHov = hovered === pin.num;
                  const anyHov = hovered !== null;
                  const c = typeColors[pin.type];
                  return (
                    <div style={{ display: "flex", alignItems: "center", gap: "4px", width: "175px" }}
                      onMouseEnter={() => isConn && setHovered(pin.num)}
                      onMouseLeave={() => setHovered(null)}>
                      <div
                        ref={(el) => { piPinRefs.current[pin.num] = el; }}
                        style={{
                          width: "26px", height: "26px", borderRadius: "50%", flexShrink: 0,
                          background: isConn && isHov
                            ? `radial-gradient(circle at 40% 35%, ${colorMap[pin.num]}, ${c.bg})`
                            : `radial-gradient(circle at 40% 35%, ${c.bg}dd, ${c.bg})`,
                          border: `2px solid ${isHov ? (colorMap[pin.num] || "#fff") : isConn ? colorMap[pin.num] + "88" : c.border}`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: "8px", fontWeight: 700, color: c.text,
                          fontFamily: "'JetBrains Mono', monospace",
                          boxShadow: isHov ? `0 0 12px ${colorMap[pin.num] || c.bg}66` : "0 1px 3px #00000033",
                          opacity: anyHov && !isHov && !isConn ? 0.25 : anyHov && !isHov ? 0.45 : 1,
                          transition: "all .2s ease", cursor: isConn ? "pointer" : "default",
                        }}>
                        {pin.num}
                      </div>
                      <span style={{
                        fontFamily: "'JetBrains Mono', monospace", fontSize: "9px",
                        color: isHov ? (colorMap[pin.num] || "#f0f0f0") : anyHov && !isHov ? "#333" : "#666",
                        fontWeight: isHov ? 700 : 400, transition: "all .2s",
                        whiteSpace: "nowrap", overflow: "hidden",
                      }}>
                        {pin.label}
                        {pin.alt && <span style={{ color: isHov ? colorMap[pin.num] + "aa" : "#444", marginLeft: "3px", fontSize: "8px" }}>{pin.alt}</span>}
                      </span>
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>

          <div style={{
            textAlign: "center", fontFamily: "'JetBrains Mono', monospace",
            fontSize: "9px", color: "#475569", marginTop: "8px",
            textTransform: "uppercase", letterSpacing: "0.1em",
          }}>
            ▼ SD card end
          </div>
        </div>
      </div>

      {/* Legend */}
      <div style={{
        maxWidth: "600px", margin: "24px auto 0", display: "flex", flexWrap: "wrap",
        gap: "12px", justifyContent: "center",
      }}>
        {[
          { label: "5V", ...typeColors.power5v },
          { label: "3.3V", ...typeColors.power3v3 },
          { label: "GND", ...typeColors.gnd },
          { label: "GPIO", ...typeColors.gpio },
          { label: "EEPROM", ...typeColors.special },
        ].map((item) => (
          <div key={item.label} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: item.bg, border: `1px solid ${item.border}` }} />
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px", color: "#64748b" }}>{item.label}</span>
          </div>
        ))}
      </div>
      <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px", color: "#334155", textAlign: "center", marginTop: "10px" }}>
        Hover over any connection to highlight the wire path
      </p>
    </div>
  );
}
