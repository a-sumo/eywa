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

const LCD_CONNECTIONS = [
  { wsLabel: "VCC", piPin: 1, color: "#ef4444", desc: "3.3V Power", group: "lcd" },
  { wsLabel: "GND", piPin: 6, color: "#737373", desc: "Ground", group: "lcd" },
  { wsLabel: "CS", piPin: 24, color: "#10b981", desc: "LCD Chip Select → GPIO 8 (CE0)", group: "lcd" },
  { wsLabel: "RESET", piPin: 22, color: "#ec4899", desc: "LCD Reset → GPIO 25", group: "lcd" },
  { wsLabel: "DC/RS", piPin: 18, color: "#8b5cf6", desc: "Data/Command → GPIO 24", group: "lcd" },
  { wsLabel: "SDI/MOSI", piPin: 19, color: "#3b82f6", desc: "SPI Data In → GPIO 10 (MOSI)", group: "lcd" },
  { wsLabel: "SCK", piPin: 23, color: "#f59e0b", desc: "SPI Clock → GPIO 11 (SCLK)", group: "lcd" },
  { wsLabel: "LED", piPin: 17, color: "#f97316", desc: "Backlight → 3.3V", group: "lcd" },
  { wsLabel: "SDO/MISO", piPin: 21, color: "#06b6d4", desc: "SPI Data Out → GPIO 9 (MISO)", group: "lcd" },
];

const TOUCH_CONNECTIONS = [
  { wsLabel: "T_CLK", piPin: 23, color: "#facc15", desc: "Touch Clock → GPIO 11 (shared SCK)", group: "touch" },
  { wsLabel: "T_CS", piPin: 26, color: "#a3e635", desc: "Touch Chip Select → GPIO 7 (CE1)", group: "touch" },
  { wsLabel: "T_DIN", piPin: 19, color: "#60a5fa", desc: "Touch Data In → GPIO 10 (shared MOSI)", group: "touch" },
  { wsLabel: "T_DO", piPin: 21, color: "#22d3ee", desc: "Touch Data Out → GPIO 9 (shared MISO)", group: "touch" },
  { wsLabel: "T_IRQ", piPin: 11, color: "#c084fc", desc: "Touch Interrupt → GPIO 17", group: "touch" },
];

const typeColors = {
  power5v: { bg: "#dc2626", text: "#fff", border: "#991b1b" },
  power3v3: { bg: "#ea580c", text: "#fff", border: "#9a3412" },
  gnd: { bg: "#262626", text: "#a3a3a3", border: "#525252" },
  gpio: { bg: "#166534", text: "#bbf7d0", border: "#15803d" },
  special: { bg: "#4338ca", text: "#c7d2fe", border: "#3730a3" },
};

export default function App() {
  const [showLcd, setShowLcd] = useState(true);
  const [showTouch, setShowTouch] = useState(true);
  const [hovered, setHovered] = useState(null);
  const containerRef = useRef(null);
  const [positions, setPositions] = useState({ piPins: {}, wsPins: {} });
  const piPinRefs = useRef({});
  const wsPinRefs = useRef({});

  const activeConns = [
    ...(showLcd ? LCD_CONNECTIONS : []),
    ...(showTouch ? TOUCH_CONNECTIONS : []),
  ];

  const highlightSet = new Set(activeConns.map((c) => c.piPin));
  const colorMap = {};
  activeConns.forEach((c) => { colorMap[c.piPin] = c.color; });

  const recalc = useCallback(() => {
    if (!containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const pi = {};
    Object.entries(piPinRefs.current).forEach(([num, el]) => {
      if (el) {
        const r = el.getBoundingClientRect();
        pi[num] = { x: r.left + r.width / 2 - containerRect.left, y: r.top + r.height / 2 - containerRect.top };
      }
    });
    const ws = {};
    Object.entries(wsPinRefs.current).forEach(([idx, el]) => {
      if (el) {
        const r = el.getBoundingClientRect();
        ws[idx] = { x: r.left + r.width / 2 - containerRect.left, y: r.top + r.height / 2 - containerRect.top };
      }
    });
    setPositions({ piPins: pi, wsPins: ws });
  }, []);

  useEffect(() => {
    const t = setTimeout(recalc, 80);
    window.addEventListener("resize", recalc);
    return () => { clearTimeout(t); window.removeEventListener("resize", recalc); };
  }, [showLcd, showTouch, recalc]);

  const lines = activeConns.map((conn, i) => {
    const from = positions.wsPins[i];
    const to = positions.piPins[conn.piPin];
    if (!from || !to) return null;
    return { from, to, color: conn.color, piPin: conn.piPin, idx: i, group: conn.group };
  }).filter(Boolean);

  const renderPin = (pin, side) => {
    const isConn = highlightSet.has(pin.num);
    const isHov = hovered === pin.num;
    const anyHov = hovered !== null;
    const c = typeColors[pin.type];
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "4px", width: "175px", justifyContent: side === "left" ? "flex-end" : "flex-start", flexDirection: side === "left" ? "row" : "row" }}
        onMouseEnter={() => isConn && setHovered(pin.num)}
        onMouseLeave={() => setHovered(null)}>
        {side === "left" && (
          <span style={{
            fontFamily: "'IBM Plex Mono', monospace", fontSize: "9px",
            color: isHov ? (colorMap[pin.num] || "#f0f0f0") : anyHov && !isHov ? "#333" : "#666",
            fontWeight: isHov ? 700 : 400, transition: "all .2s", textAlign: "right", flex: 1, whiteSpace: "nowrap", overflow: "hidden",
          }}>
            {pin.alt && <span style={{ color: isHov ? colorMap[pin.num] + "aa" : "#444", marginRight: "3px", fontSize: "8px" }}>{pin.alt}</span>}
            {pin.label}
          </span>
        )}
        <div ref={(el) => { piPinRefs.current[pin.num] = el; }}
          style={{
            width: "26px", height: "26px", borderRadius: "50%", flexShrink: 0,
            background: isConn && isHov ? `radial-gradient(circle at 40% 35%, ${colorMap[pin.num]}, ${c.bg})` : `radial-gradient(circle at 40% 35%, ${c.bg}dd, ${c.bg})`,
            border: `2px solid ${isHov ? (colorMap[pin.num] || "#fff") : isConn ? colorMap[pin.num] + "88" : c.border}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "8px", fontWeight: 700, color: c.text, fontFamily: "'IBM Plex Mono', monospace",
            boxShadow: isHov ? `0 0 12px ${colorMap[pin.num] || c.bg}66` : "0 1px 3px #00000033",
            opacity: anyHov && !isHov && !isConn ? 0.25 : anyHov && !isHov ? 0.45 : 1,
            transition: "all .2s ease", cursor: isConn ? "pointer" : "default",
          }}>
          {pin.num}
        </div>
        {side === "right" && (
          <span style={{
            fontFamily: "'IBM Plex Mono', monospace", fontSize: "9px",
            color: isHov ? (colorMap[pin.num] || "#f0f0f0") : anyHov && !isHov ? "#333" : "#666",
            fontWeight: isHov ? 700 : 400, transition: "all .2s", whiteSpace: "nowrap", overflow: "hidden",
          }}>
            {pin.label}
            {pin.alt && <span style={{ color: isHov ? colorMap[pin.num] + "aa" : "#444", marginLeft: "3px", fontSize: "8px" }}>{pin.alt}</span>}
          </span>
        )}
      </div>
    );
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(160deg, #0a0a12 0%, #0e1520 40%, #080c14 100%)",
      color: "#e2e8f0", fontFamily: "system-ui, sans-serif", padding: "20px 12px 40px",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&family=Sora:wght@400;600;700;800&display=swap" rel="stylesheet" />

      <h1 style={{
        fontFamily: "'Sora', sans-serif", fontSize: "24px", fontWeight: 800,
        textAlign: "center", margin: "0 0 2px",
        background: "linear-gradient(90deg, #f97316, #ef4444, #ec4899)",
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
      }}>
        Raspberry Pi ↔ ILI9341 LCD + Touch
      </h1>
      <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "11px", color: "#475569", textAlign: "center", margin: "0 0 16px" }}>
        3.5" 320×480 TFT + XPT2046 Touchscreen — SPI Wiring
      </p>

      {/* Toggle buttons */}
      <div style={{ display: "flex", gap: "8px", justifyContent: "center", marginBottom: "20px" }}>
        <button onClick={() => { setShowLcd(!showLcd); setHovered(null); }}
          style={{
            padding: "8px 14px", borderRadius: "8px", cursor: "pointer",
            border: showLcd ? "2px solid #f97316" : "1px solid #1e293b",
            background: showLcd ? "linear-gradient(135deg, #7c2d12, #431407)" : "#111827",
            color: showLcd ? "#fed7aa" : "#64748b",
            fontFamily: "'IBM Plex Mono', monospace", fontSize: "11px", fontWeight: showLcd ? 700 : 400,
          }}>
          🖥 LCD Display ({showLcd ? "ON" : "OFF"})
        </button>
        <button onClick={() => { setShowTouch(!showTouch); setHovered(null); }}
          style={{
            padding: "8px 14px", borderRadius: "8px", cursor: "pointer",
            border: showTouch ? "2px solid #a3e635" : "1px solid #1e293b",
            background: showTouch ? "linear-gradient(135deg, #365314, #1a2e05)" : "#111827",
            color: showTouch ? "#d9f99d" : "#64748b",
            fontFamily: "'IBM Plex Mono', monospace", fontSize: "11px", fontWeight: showTouch ? 700 : 400,
          }}>
          👆 Touch (XPT2046) ({showTouch ? "ON" : "OFF"})
        </button>
      </div>

      {/* Main wiring area */}
      <div ref={containerRef} style={{ position: "relative", display: "flex", justifyContent: "center", gap: "0px", alignItems: "flex-start", maxWidth: "920px", margin: "0 auto" }}>

        {/* SVG wires */}
        <svg style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 10 }}>
          {lines.map((l, i) => {
            const isHov = hovered === l.piPin;
            const anyHov = hovered !== null;
            const dimmed = anyHov && !isHov;
            const dx = l.to.x - l.from.x;
            const cp1x = l.from.x + dx * 0.4;
            const cp2x = l.from.x + dx * 0.6;
            const path = `M ${l.from.x} ${l.from.y} C ${cp1x} ${l.from.y}, ${cp2x} ${l.to.y}, ${l.to.x} ${l.to.y}`;
            const isDashed = l.group === "touch";
            return (
              <g key={i}>
                {isHov && <path d={path} fill="none" stroke={l.color} strokeWidth="8" opacity="0.25" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 6px ${l.color})` }} />}
                <path d={path} fill="none" stroke={dimmed ? "#1e293b" : l.color}
                  strokeWidth={isHov ? 3.5 : 2} opacity={dimmed ? 0.12 : isHov ? 1 : 0.7}
                  strokeLinecap="round" strokeDasharray={isDashed ? "6 4" : "none"}
                  style={{ transition: "all .25s ease" }} />
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

        {/* LCD Module (left side) */}
        <div style={{
          background: "linear-gradient(180deg, #111827 0%, #0f172a 100%)",
          borderRadius: "14px", padding: "16px 14px", minWidth: "150px",
          border: "1px solid #1e293b", zIndex: 3, marginTop: "10px",
          boxShadow: "0 4px 24px #00000055",
        }}>
          <div style={{
            fontFamily: "'Sora', sans-serif", fontSize: "13px", fontWeight: 700,
            color: "#f97316", textAlign: "center", marginBottom: "2px",
          }}>
            🖥 ILI9341 LCD
          </div>
          <div style={{
            fontFamily: "'IBM Plex Mono', monospace", fontSize: "9px",
            color: "#475569", textAlign: "center", marginBottom: "12px",
            borderBottom: "1px solid #1e293b", paddingBottom: "10px",
          }}>
            3.5" 320×480 + XPT2046 Touch
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {/* LCD section header */}
            {showLcd && (
              <>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "9px", color: "#f97316", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "2px", marginTop: "4px" }}>
                  Display
                </div>
                {LCD_CONNECTIONS.map((conn, i) => {
                  const globalIdx = i;
                  const isHov = hovered === conn.piPin;
                  const anyHov = hovered !== null;
                  return (
                    <div key={`lcd-${i}`} ref={(el) => { wsPinRefs.current[globalIdx] = el; }}
                      onMouseEnter={() => setHovered(conn.piPin)}
                      onMouseLeave={() => setHovered(null)}
                      style={{
                        display: "flex", alignItems: "center", gap: "8px",
                        padding: "4px 8px", borderRadius: "6px", cursor: "pointer",
                        background: isHov ? `${conn.color}20` : "transparent",
                        border: `1px solid ${isHov ? conn.color + "55" : "transparent"}`,
                        opacity: anyHov && !isHov ? 0.3 : 1, transition: "all .2s ease",
                      }}>
                      <div style={{
                        width: "20px", height: "20px", borderRadius: "50%",
                        background: conn.color, flexShrink: 0,
                        boxShadow: isHov ? `0 0 10px ${conn.color}66` : `0 1px 3px #00000044`,
                      }} />
                      <div>
                        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "11px", fontWeight: 700, color: isHov ? conn.color : "#cbd5e1" }}>
                          {conn.wsLabel}
                        </div>
                        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "8px", color: "#475569" }}>
                          → Pin {conn.piPin}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
            {/* Touch section header */}
            {showTouch && (
              <>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "9px", color: "#a3e635", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "2px", marginTop: "8px" }}>
                  Touch (XPT2046)
                </div>
                {TOUCH_CONNECTIONS.map((conn, i) => {
                  const globalIdx = (showLcd ? LCD_CONNECTIONS.length : 0) + i;
                  const isHov = hovered === conn.piPin;
                  const anyHov = hovered !== null;
                  const isShared = conn.wsLabel === "T_CLK" || conn.wsLabel === "T_DIN" || conn.wsLabel === "T_DO";
                  return (
                    <div key={`touch-${i}`} ref={(el) => { wsPinRefs.current[globalIdx] = el; }}
                      onMouseEnter={() => setHovered(conn.piPin)}
                      onMouseLeave={() => setHovered(null)}
                      style={{
                        display: "flex", alignItems: "center", gap: "8px",
                        padding: "4px 8px", borderRadius: "6px", cursor: "pointer",
                        background: isHov ? `${conn.color}20` : "transparent",
                        border: `1px solid ${isHov ? conn.color + "55" : "transparent"}`,
                        opacity: anyHov && !isHov ? 0.3 : 1, transition: "all .2s ease",
                      }}>
                      <div style={{
                        width: "20px", height: "20px", borderRadius: "50%",
                        background: conn.color, flexShrink: 0,
                        border: isShared ? "2px dashed #fff4" : "none",
                        boxShadow: isHov ? `0 0 10px ${conn.color}66` : `0 1px 3px #00000044`,
                      }} />
                      <div>
                        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "11px", fontWeight: 700, color: isHov ? conn.color : "#cbd5e1" }}>
                          {conn.wsLabel}
                          {isShared && <span style={{ fontSize: "8px", color: "#94a3b8", marginLeft: "4px" }}>shared</span>}
                        </div>
                        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "8px", color: "#475569" }}>
                          → Pin {conn.piPin}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>

        {/* Wire spacer */}
        <div style={{ minWidth: "70px", flexShrink: 1 }} />

        {/* Raspberry Pi GPIO header */}
        <div style={{
          background: "linear-gradient(180deg, #111827 0%, #0f172a 100%)",
          borderRadius: "14px", padding: "14px 10px",
          border: "1px solid #1e293b", zIndex: 3, boxShadow: "0 4px 24px #00000055",
        }}>
          <div style={{ textAlign: "center", fontFamily: "'IBM Plex Mono', monospace", fontSize: "9px", color: "#475569", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            ▲ USB end
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            {PI_PINS.map((row, ri) => (
              <div key={ri} style={{ display: "flex", alignItems: "center", gap: "0px" }}>
                {renderPin(row[0], "left")}
                <div style={{ width: "4px", height: "20px", background: "#0a0e1a", borderRadius: "1px", margin: "0 2px", border: "1px solid #1a1f2e" }} />
                {renderPin(row[1], "right")}
              </div>
            ))}
          </div>
          <div style={{ textAlign: "center", fontFamily: "'IBM Plex Mono', monospace", fontSize: "9px", color: "#475569", marginTop: "8px", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            ▼ SD card end
          </div>
        </div>
      </div>

      {/* Legend */}
      <div style={{ maxWidth: "650px", margin: "20px auto 0", padding: "14px", borderRadius: "10px", background: "#0f172a", border: "1px solid #1e293b" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "14px", justifyContent: "center", marginBottom: "10px" }}>
          {[
            { label: "5V", ...typeColors.power5v },
            { label: "3.3V", ...typeColors.power3v3 },
            { label: "GND", ...typeColors.gnd },
            { label: "GPIO", ...typeColors.gpio },
            { label: "EEPROM", ...typeColors.special },
          ].map((item) => (
            <div key={item.label} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: item.bg, border: `1px solid ${item.border}` }} />
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "9px", color: "#64748b" }}>{item.label}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: "16px", justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{ width: "20px", height: "2px", background: "#94a3b8" }} />
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "9px", color: "#64748b" }}>LCD wire</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{ width: "20px", height: "2px", background: "#94a3b8", borderTop: "2px dashed #94a3b8" }} />
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "9px", color: "#64748b" }}>Touch wire (dashed)</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: "#475569", border: "2px dashed #fff4" }} />
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "9px", color: "#64748b" }}>Shared SPI pin</span>
          </div>
        </div>
      </div>
      <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "9px", color: "#334155", textAlign: "center", marginTop: "10px" }}>
        Hover any connection to trace the wire · Toggle LCD/Touch layers independently · Dashed lines = shared SPI bus
      </p>
    </div>
  );
}
