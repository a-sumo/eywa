import { useState, useMemo, useCallback, useRef, useEffect } from "react";

// 4 colors used in the logo
const COLORS = {
  cyan:   "#15D1FF",
  blue:   "#2543FF",
  purple: "#823DFC",
  pink:   "#E72B76",
} as const;

const PATHS: { d: string; color: keyof typeof COLORS; tag: "path" | "rect"; attrs?: string }[] = [
  { tag: "path", color: "cyan",   d: `d="M116 124.524C116 110.47 128.165 99.5067 142.143 100.963L224.55 109.547C232.478 110.373 238.5 117.055 238.5 125.025C238.5 133.067 232.372 139.785 224.364 140.522L141.858 148.112C127.977 149.389 116 138.463 116 124.524Z"` },
  { tag: "path", color: "blue",   d: `d="M120.76 120.274C134.535 120.001 145.285 132.097 143.399 145.748L131.891 229.05C131.094 234.817 126.162 239.114 120.341 239.114C114.442 239.114 109.478 234.703 108.785 228.845L98.9089 145.354C97.351 132.184 107.5 120.536 120.76 120.274Z"` },
  { tag: "path", color: "purple", d: `d="M122.125 5.51834C128.648 5.51832 134.171 10.3232 135.072 16.7832L147.586 106.471C149.482 120.063 139.072 132.267 125.35 132.538C111.847 132.805 101.061 121.382 102.1 107.915L109.067 17.6089C109.593 10.7878 115.284 5.51835 122.125 5.51834Z"` },
  { tag: "path", color: "pink",   d: `d="M12 126.211C12 117.753 18.3277 110.632 26.7274 109.638L95.0607 101.547C109.929 99.787 123 111.402 123 126.374V128.506C123 143.834 109.333 155.552 94.1845 153.213L26.1425 142.706C18.005 141.449 12 134.445 12 126.211Z"` },
  { tag: "rect", color: "cyan",   d: `width="69.0908" height="37.6259" rx="18.813"`, attrs: `transform="matrix(-0.682103 -0.731256 0.714523 -0.699611 165.127 184.307)"` },
  { tag: "rect", color: "purple", d: `width="69.0901" height="37.4677" rx="18.7339"`, attrs: `transform="matrix(-0.682386 0.730992 -0.714252 -0.699889 182.38 88.9044)"` },
  { tag: "rect", color: "pink",   d: `width="75.2802" height="37.978" rx="18.989"`, attrs: `transform="matrix(0.679222 0.733933 -0.717276 0.696789 95.8679 64.4296)"` },
  { tag: "rect", color: "blue",   d: `width="71.2152" height="41.6372" rx="20.8186"`, attrs: `transform="matrix(0.798895 -0.60147 0.582827 0.812597 55 149.834)"` },
];

// --- Color math (HSL-based to preserve saturation) ---

function hexToHSL(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  if (s === 0) {
    const v = Math.round(l * 255);
    return "#" + [v, v, v].map(c => c.toString(16).padStart(2, "0")).join("");
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = Math.round(hue2rgb(p, q, h + 1/3) * 255);
  const g = Math.round(hue2rgb(p, q, h) * 255);
  const b = Math.round(hue2rgb(p, q, h - 1/3) * 255);
  return "#" + [r, g, b].map(c => Math.max(0, Math.min(255, c)).toString(16).padStart(2, "0")).join("");
}

function lighten(hex: string, amount: number, maxL = 0.82): string {
  const [h, s, l] = hexToHSL(hex);
  const newL = l + (maxL - l) * amount;
  const newS = Math.min(1, s + amount * 0.1);
  return hslToHex(h, newS, newL);
}

function lerpColor(a: string, b: string, t: number): string {
  const [ah, as, al] = hexToHSL(a);
  const [bh, bs, bl] = hexToHSL(b);
  let h: number;
  if (as < 0.01) h = bh;
  else if (bs < 0.01) h = ah;
  else {
    let dh = bh - ah;
    if (dh > 0.5) dh -= 1;
    if (dh < -0.5) dh += 1;
    h = ((ah + dh * t) % 1 + 1) % 1;
  }
  const s = as + (bs - as) * t;
  const l = al + (bl - al) * t;
  return hslToHex(h, s, l);
}

// RGB lerp - no hue artifacts for distant colors
function lerpRGB(a: string, b: string, t: number): string {
  const ar = parseInt(a.slice(1, 3), 16), ag = parseInt(a.slice(3, 5), 16), ab = parseInt(a.slice(5, 7), 16);
  const br = parseInt(b.slice(1, 3), 16), bg = parseInt(b.slice(3, 5), 16), bb = parseInt(b.slice(5, 7), 16);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return "#" + [r, g, bl].map(c => Math.max(0, Math.min(255, c)).toString(16).padStart(2, "0")).join("");
}

// --- Cubic bezier for curve editor ---
// P0=(0,1) bright center, P1=(cx1,cy1), P2=(cx2,cy2), P3=(1,0) base at edge

function cubicBez(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const mt = 1 - t;
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
}

function cubicBezDeriv(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const mt = 1 - t;
  return 3 * mt * mt * (p1 - p0) + 6 * mt * t * (p2 - p1) + 3 * t * t * (p3 - p2);
}

// Newton-Raphson: find parametric t for a given x value
function solveBezierX(cx1: number, cx2: number, targetX: number): number {
  let t = targetX;
  for (let i = 0; i < 12; i++) {
    const x = cubicBez(0, cx1, cx2, 1, t);
    const dx = cubicBezDeriv(0, cx1, cx2, 1, t);
    if (Math.abs(dx) < 1e-8) break;
    t -= (x - targetX) / dx;
    t = Math.max(0, Math.min(1, t));
  }
  return t;
}

// Evaluate brightness (0-1) at a given radius fraction x (0-1)
function evalCurve(cx1: number, cy1: number, cx2: number, cy2: number, x: number): number {
  if (x <= 0) return 1;
  if (x >= 1) return 0;
  const t = solveBezierX(cx1, cx2, x);
  return Math.max(0, Math.min(1, cubicBez(1, cy1, cy2, 0, t)));
}

// --- Params ---

interface GlowParams {
  // Per-arm base colors
  armCyan: string;
  armBlue: string;
  armPurple: string;
  armPink: string;

  innerBright: number;
  maxL: number;
  gradRadius: number;
  // Bezier curve control points for brightness falloff
  cx1: number; cy1: number;  // inner handle
  cx2: number; cy2: number;  // outer handle

  glowTint: string;       // hex color to tint the glow toward
  tintStrength: number;   // 0 = pure lighten, 1 = fully tinted

  shapeBlur: number;
  shapeOpacity: number;

  discRadius: number;
  discOpacity: number;
  discR: number;
  discG: number;
  discB: number;

  frontBlur: number;
  frontOpacity: number;
}

const DEFAULTS: GlowParams = {
  armCyan: "#69e6ff",
  armBlue: "#393cf5",
  armPurple: "#7946ff",
  armPink: COLORS.pink,

  innerBright: 1.00,
  maxL: 0.95,
  gradRadius: 107,
  cx1: 0.69, cy1: 1.00,
  cx2: 0.65, cy2: 0.00,

  glowTint: "#15D1FF",
  tintStrength: 0.16,

  shapeBlur: 15,
  shapeOpacity: 0.00,

  discRadius: 100,
  discOpacity: 0.00,
  discR: 0.08,
  discG: 0.72,
  discB: 0.95,

  frontBlur: 5,
  frontOpacity: 0.18,
};

// --- Settings serialization ---

function paramsToHash(p: GlowParams): string {
  return btoa(JSON.stringify(p));
}

function hashToParams(hash: string): GlowParams | null {
  try {
    const raw = hash.startsWith("#") ? hash.slice(1) : hash;
    if (!raw) return null;
    const parsed = JSON.parse(atob(raw));
    // Validate it has the expected shape (merge with defaults for missing keys)
    return { ...DEFAULTS, ...parsed };
  } catch {
    return null;
  }
}

// --- SVG generation ---

const COLOR_KEYS = Object.keys(COLORS) as (keyof typeof COLORS)[];

// Render each shape individually to preserve the original z-order.
// The flat version renders shapes in PATHS order (arms first, then pills).
// Grouping by color loses this ordering (e.g. the blue pill ends up behind pink).
function renderPerShape(uid: string): string {
  return PATHS.map((p, i) =>
    `<rect x="0" y="0" width="250" height="250" fill="url(#rg-${p.color}-${uid})" clip-path="url(#clip-s${i}-${uid})"/>`
  ).join("\n");
}

function renderFlatShapes(): string {
  return PATHS.map(p => {
    const extra = p.attrs ? ` ${p.attrs}` : "";
    return `<${p.tag} ${p.d}${extra} fill="${COLORS[p.color]}"/>`;
  }).join("\n");
}

const GRAD_STEPS = [0, 0.04, 0.08, 0.13, 0.19, 0.26, 0.34, 0.42, 0.52, 0.62, 0.73, 0.84, 0.92, 1.0];

function buildGlowSVG(p: GlowParams, size: number, uid = "g"): string {
  const shapeMargin = Math.ceil((p.shapeBlur * 4 / 250) * 100);
  const frontMargin = Math.ceil((p.frontBlur * 4 / 250) * 100);

  const clips = PATHS.map((p, i) => {
    const extra = p.attrs ? ` ${p.attrs}` : "";
    return `<clipPath id="clip-s${i}-${uid}">
      <${p.tag} ${p.d}${extra}/>
    </clipPath>`;
  }).join("\n  ");

  const armColors: Record<keyof typeof COLORS, string> = {
    cyan: p.armCyan, blue: p.armBlue, purple: p.armPurple, pink: p.armPink,
  };

  const gradients = COLOR_KEYS.map(key => {
    const base = armColors[key];
    const stops = GRAD_STEPS.map(x => {
      const brightness = evalCurve(p.cx1, p.cy1, p.cx2, p.cy2, x);
      // Lighten proportionally to brightness (HSL, preserves hue)
      let color = lighten(base, brightness * p.innerBright, p.maxL);
      // Tint in RGB space proportionally (no hue-crossing artifacts)
      if (p.tintStrength > 0 && brightness > 0) {
        color = lerpRGB(color, p.glowTint, brightness * p.tintStrength);
      }
      return `    <stop offset="${Math.round(x * 100)}%" stop-color="${color}"/>`;
    }).join("\n");
    return `<radialGradient id="rg-${key}-${uid}" cx="125" cy="125" r="${p.gradRadius}" gradientUnits="userSpaceOnUse">
${stops}
  </radialGradient>`;
  }).join("\n  ");

  return `<svg width="${size}" height="${size}" viewBox="0 0 250 250" fill="none" xmlns="http://www.w3.org/2000/svg">
<defs>
  ${clips}
  ${gradients}
  <filter id="shape-glow-${uid}" x="-${shapeMargin}%" y="-${shapeMargin}%" width="${100 + shapeMargin * 2}%" height="${100 + shapeMargin * 2}%">
    <feGaussianBlur in="SourceGraphic" stdDeviation="${p.shapeBlur}"/>
    <feComponentTransfer>
      <feFuncA type="linear" slope="${p.shapeOpacity.toFixed(3)}"/>
    </feComponentTransfer>
  </filter>
  <filter id="front-haze-${uid}" x="-${frontMargin}%" y="-${frontMargin}%" width="${100 + frontMargin * 2}%" height="${100 + frontMargin * 2}%">
    <feGaussianBlur in="SourceGraphic" stdDeviation="${p.frontBlur}"/>
    <feComponentTransfer>
      <feFuncA type="linear" slope="${p.frontOpacity.toFixed(3)}"/>
    </feComponentTransfer>
  </filter>
  <radialGradient id="disc-glow-${uid}" cx="125" cy="125" r="${p.discRadius}" gradientUnits="userSpaceOnUse">
    <stop offset="0%" stop-color="rgb(${Math.round(p.discR * 255)},${Math.round(p.discG * 255)},${Math.round(p.discB * 255)})" stop-opacity="${p.discOpacity.toFixed(3)}"/>
    <stop offset="100%" stop-color="rgb(${Math.round(p.discR * 255)},${Math.round(p.discG * 255)},${Math.round(p.discB * 255)})" stop-opacity="0"/>
  </radialGradient>
</defs>
<circle cx="125" cy="125" r="${p.discRadius}" fill="url(#disc-glow-${uid})"/>
<g filter="url(#shape-glow-${uid})">
${renderPerShape(uid)}
</g>
<g>
${renderPerShape(uid)}
</g>
<g filter="url(#front-haze-${uid})">
${renderPerShape(uid)}
</g>
</svg>`;
}

// ===================== CURVE EDITOR =====================

const CE_W = 280;
const CE_H = 180;
const CE_PAD = 20;

function CurveEditor({ cx1, cy1, cx2, cy2, onChange }: {
  cx1: number; cy1: number; cx2: number; cy2: number;
  onChange: (cx1: number, cy1: number, cx2: number, cy2: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dragging, setDragging] = useState<1 | 2 | null>(null);

  const toCanvas = useCallback((nx: number, ny: number): [number, number] => {
    return [CE_PAD + nx * (CE_W - 2 * CE_PAD), CE_PAD + (1 - ny) * (CE_H - 2 * CE_PAD)];
  }, []);

  const fromCanvas = useCallback((px: number, py: number): [number, number] => {
    return [
      Math.max(0, Math.min(1, (px - CE_PAD) / (CE_W - 2 * CE_PAD))),
      Math.max(0, Math.min(1, 1 - (py - CE_PAD) / (CE_H - 2 * CE_PAD))),
    ];
  }, []);

  // Draw the curve
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, CE_W, CE_H);

    // Background
    ctx.fillStyle = "#0c0e16";
    ctx.beginPath();
    ctx.roundRect(0, 0, CE_W, CE_H, 8);
    ctx.fill();

    // Grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const [gx] = toCanvas(i / 4, 0);
      const [, gy] = toCanvas(0, i / 4);
      ctx.beginPath(); ctx.moveTo(gx, CE_PAD); ctx.lineTo(gx, CE_H - CE_PAD); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(CE_PAD, gy); ctx.lineTo(CE_W - CE_PAD, gy); ctx.stroke();
    }

    // Linear reference (diagonal)
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.setLineDash([3, 3]);
    const [lx0, ly0] = toCanvas(0, 1);
    const [lx1, ly1] = toCanvas(1, 0);
    ctx.beginPath(); ctx.moveTo(lx0, ly0); ctx.lineTo(lx1, ly1); ctx.stroke();
    ctx.setLineDash([]);

    // Axis labels
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.font = "9px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("radius", CE_W / 2, CE_H - 3);
    ctx.save();
    ctx.translate(8, CE_H / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("bright", 0, 0);
    ctx.restore();

    // Points
    const [p0x, p0y] = toCanvas(0, 1);
    const [p1x, p1y] = toCanvas(cx1, cy1);
    const [p2x, p2y] = toCanvas(cx2, cy2);
    const [p3x, p3y] = toCanvas(1, 0);

    // Tangent lines
    ctx.strokeStyle = "rgba(21,209,255,0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(p0x, p0y); ctx.lineTo(p1x, p1y); ctx.stroke();
    ctx.strokeStyle = "rgba(231,43,118,0.25)";
    ctx.beginPath(); ctx.moveTo(p3x, p3y); ctx.lineTo(p2x, p2y); ctx.stroke();

    // Bezier curve - sample many points for smooth render
    ctx.strokeStyle = "#15D1FF";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p0x, p0y);
    for (let i = 1; i <= 80; i++) {
      const t = i / 80;
      const x = cubicBez(0, cx1, cx2, 1, t);
      const y = cubicBez(1, cy1, cy2, 0, t);
      const [px, py] = toCanvas(x, y);
      ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Filled area under curve
    ctx.fillStyle = "rgba(21,209,255,0.06)";
    ctx.beginPath();
    ctx.moveTo(...toCanvas(0, 0));
    ctx.lineTo(p0x, p0y);
    for (let i = 1; i <= 80; i++) {
      const t = i / 80;
      const x = cubicBez(0, cx1, cx2, 1, t);
      const y = cubicBez(1, cy1, cy2, 0, t);
      ctx.lineTo(...toCanvas(x, y));
    }
    ctx.lineTo(...toCanvas(1, 0));
    ctx.closePath();
    ctx.fill();

    // End points (fixed)
    for (const [px, py] of [[p0x, p0y], [p3x, p3y]]) {
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill();
    }

    // Control handles
    // Inner handle (cyan)
    ctx.fillStyle = "#15D1FF";
    ctx.beginPath(); ctx.arc(p1x, p1y, 6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Outer handle (pink)
    ctx.fillStyle = "#E72B76";
    ctx.beginPath(); ctx.arc(p2x, p2y, 6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }, [cx1, cy1, cx2, cy2, toCanvas]);

  const getPos = useCallback((e: React.MouseEvent): [number, number] => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return [
      (e.clientX - rect.left) * (CE_W / rect.width),
      (e.clientY - rect.top) * (CE_H / rect.height),
    ];
  }, []);

  const handleDown = useCallback((e: React.MouseEvent) => {
    const [mx, my] = getPos(e);
    const [p1x, p1y] = toCanvas(cx1, cy1);
    const [p2x, p2y] = toCanvas(cx2, cy2);
    const d1 = Math.hypot(mx - p1x, my - p1y);
    const d2 = Math.hypot(mx - p2x, my - p2y);
    if (d1 < 18 && d1 <= d2) setDragging(1);
    else if (d2 < 18) setDragging(2);
  }, [cx1, cy1, cx2, cy2, getPos, toCanvas]);

  const handleMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    const [mx, my] = getPos(e);
    const [nx, ny] = fromCanvas(mx, my);
    if (dragging === 1) onChange(nx, ny, cx2, cy2);
    else onChange(cx1, cy1, nx, ny);
  }, [dragging, cx1, cy1, cx2, cy2, getPos, fromCanvas, onChange]);

  const handleUp = useCallback(() => setDragging(null), []);

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={CE_W}
        height={CE_H}
        onMouseDown={handleDown}
        onMouseMove={handleMove}
        onMouseUp={handleUp}
        onMouseLeave={handleUp}
        style={{
          cursor: dragging ? "grabbing" : "grab",
          borderRadius: 8,
          width: "100%",
          height: "auto",
        }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: "0.65rem", color: "var(--text-muted)" }}>
        <span><span style={{ color: "#15D1FF" }}>*</span> inner ({cx1.toFixed(2)}, {cy1.toFixed(2)})</span>
        <span><span style={{ color: "#E72B76" }}>*</span> outer ({cx2.toFixed(2)}, {cy2.toFixed(2)})</span>
      </div>
    </div>
  );
}

// ===================== UI =====================

function Slider({ label, value, onChange, min, max, step }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
}) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: 100, fontSize: "0.8rem", color: "var(--text-secondary)", flexShrink: 0 }}>{label}</span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ flex: 1, accentColor: "#15D1FF" }}
      />
      <span style={{ width: 48, fontSize: "0.75rem", color: "var(--text-tertiary)", textAlign: "right", fontFamily: "var(--font-mono)" }}>
        {value.toFixed(step < 1 ? 2 : 0)}
      </span>
    </label>
  );
}

function ColorDot({ r, g, b }: { r: number; g: number; b: number }) {
  return (
    <div style={{
      width: 14, height: 14, borderRadius: 3, flexShrink: 0,
      background: `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`,
      border: "1px solid var(--border-default)",
    }} />
  );
}

const panelStyle: React.CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-xl)",
  padding: "1.25rem",
};

const headingStyle: React.CSSProperties = {
  fontSize: "var(--text-sm)",
  fontWeight: 600,
  marginBottom: "0.75rem",
  display: "flex",
  alignItems: "center",
  gap: 8,
};

export function LogoGlowTuner() {
  const [params, setParams] = useState<GlowParams>(() => {
    const fromHash = hashToParams(window.location.hash);
    return fromHash ?? DEFAULTS;
  });
  const [copied, setCopied] = useState<"svg" | "settings" | "link" | false>(false);

  // Sync params to URL hash
  useEffect(() => {
    const hash = paramsToHash(params);
    window.history.replaceState(null, "", "#" + hash);
  }, [params]);

  const set = useCallback(<K extends keyof GlowParams>(key: K, val: GlowParams[K]) => {
    setParams(p => ({ ...p, [key]: val }));
  }, []);

  const setCurve = useCallback((cx1: number, cy1: number, cx2: number, cy2: number) => {
    setParams(p => ({ ...p, cx1, cy1, cx2, cy2 }));
  }, []);

  const glowSVG = useMemo(() => buildGlowSVG(params, 250, "preview"), [params]);
  const exportSVG = useMemo(() => buildGlowSVG(params, 250, "g"), [params]);

  const flash = useCallback((kind: "svg" | "settings" | "link") => {
    setCopied(kind);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  const handleCopySVG = useCallback(() => {
    navigator.clipboard.writeText(exportSVG).then(() => flash("svg"));
  }, [exportSVG, flash]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([exportSVG], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "eywa-logo-glow.svg";
    a.click();
    URL.revokeObjectURL(url);
  }, [exportSVG]);

  const handleCopySettings = useCallback(() => {
    navigator.clipboard.writeText(JSON.stringify(params, null, 2)).then(() => flash("settings"));
  }, [params, flash]);

  const handleCopyLink = useCallback(() => {
    navigator.clipboard.writeText(window.location.href).then(() => flash("link"));
  }, []);

  const handleLoadSettings = useCallback(() => {
    const text = prompt("Paste settings JSON:");
    if (!text) return;
    try {
      const parsed = JSON.parse(text);
      setParams({ ...DEFAULTS, ...parsed });
    } catch {
      alert("Invalid JSON");
    }
  }, []);

  const handleReset = useCallback(() => setParams(DEFAULTS), []);

  const originalSVG = `<svg width="250" height="250" viewBox="0 0 250 250" fill="none" xmlns="http://www.w3.org/2000/svg">\n${renderFlatShapes()}\n</svg>`;

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--bg-base)",
      color: "var(--text-primary)",
      fontFamily: "var(--font-sans)",
      padding: "2rem",
    }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <h1 style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--text-2xl)",
          fontWeight: 700,
          marginBottom: "0.25rem",
        }}>
          Logo Glow Tuner
        </h1>
        <p style={{ color: "var(--text-tertiary)", fontSize: "var(--text-sm)", marginBottom: "2rem" }}>
          Drag the curve handles to shape the brightness falloff. Export when done.
        </p>

        {/* Before / After */}
        <div style={{
          display: "flex",
          gap: "2rem",
          justifyContent: "center",
          alignItems: "center",
          marginBottom: "1.5rem",
          flexWrap: "wrap",
        }}>
          <PreviewBox label="Before" svg={originalSVG} />
          <PreviewBox label="After" svg={glowSVG} />
        </div>

        {/* Small previews */}
        <div style={{
          display: "flex", gap: 12, justifyContent: "center", marginBottom: "2rem", flexWrap: "wrap",
        }}>
          {["#000000", "#08090f", "#10121c", "#1a1e2e", "#ffffff"].map((bg, i) => (
            <div key={bg} style={{
              background: bg, border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)",
              padding: 12, width: 80, height: 80,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <div
                dangerouslySetInnerHTML={{ __html: buildGlowSVG(params, 56, `sm${i}`) }}
                style={{ width: 56, height: 56 }}
              />
            </div>
          ))}
        </div>

        {/* Arm Colors */}
        <div style={{ ...panelStyle, marginBottom: "1.25rem", display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          <h3 style={{ ...headingStyle, marginBottom: 0 }}>Arm Colors</h3>
          {([
            ["armCyan", "Right", params.armCyan],
            ["armBlue", "Bottom", params.armBlue],
            ["armPurple", "Top", params.armPurple],
            ["armPink", "Left", params.armPink],
          ] as const).map(([key, label, val]) => (
            <label key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="color"
                value={val}
                onChange={e => set(key as keyof GlowParams, e.target.value as any)}
                style={{
                  width: 28, height: 22, border: "1px solid var(--border-default)",
                  borderRadius: 4, background: "transparent", cursor: "pointer", padding: 0,
                }}
              />
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{label}</span>
              <span style={{ fontSize: "0.65rem", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{val}</span>
            </label>
          ))}
        </div>

        {/* Controls */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: "1.25rem",
          marginBottom: "2rem",
        }}>
          {/* Shape Gradient + Curve */}
          <div style={panelStyle}>
            <h3 style={headingStyle}>Shape Gradient</h3>
            <CurveEditor
              cx1={params.cx1} cy1={params.cy1}
              cx2={params.cx2} cy2={params.cy2}
              onChange={setCurve}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
              <Slider label="Brightness" value={params.innerBright} onChange={v => set("innerBright", v)} min={0} max={1} step={0.01} />
              <Slider label="Max Light" value={params.maxL} onChange={v => set("maxL", v)} min={0.5} max={0.95} step={0.01} />
              <Slider label="Radius" value={params.gradRadius} onChange={v => set("gradRadius", v)} min={30} max={200} step={1} />
              <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 10, marginTop: 4 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 100, fontSize: "0.8rem", color: "var(--text-secondary)", flexShrink: 0 }}>Glow Tint</span>
                  <input
                    type="color"
                    value={params.glowTint}
                    onChange={e => set("glowTint", e.target.value)}
                    style={{
                      width: 32, height: 24, border: "1px solid var(--border-default)",
                      borderRadius: 4, background: "transparent", cursor: "pointer", padding: 0,
                    }}
                  />
                  <span style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                    {params.glowTint}
                  </span>
                </label>
              </div>
              <Slider label="Tint Strength" value={params.tintStrength} onChange={v => set("tintStrength", v)} min={0} max={1} step={0.01} />
            </div>
          </div>

          {/* Shape Glow + Front Haze */}
          <div style={panelStyle}>
            <h3 style={headingStyle}>Shape Glow</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Slider label="Blur" value={params.shapeBlur} onChange={v => set("shapeBlur", v)} min={0} max={50} step={1} />
              <Slider label="Opacity" value={params.shapeOpacity} onChange={v => set("shapeOpacity", v)} min={0} max={1} step={0.01} />
            </div>
            <div style={{ marginTop: 16 }}>
              <h3 style={headingStyle}>Front Haze</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <Slider label="Blur" value={params.frontBlur} onChange={v => set("frontBlur", v)} min={0} max={30} step={1} />
                <Slider label="Opacity" value={params.frontOpacity} onChange={v => set("frontOpacity", v)} min={0} max={1} step={0.01} />
              </div>
            </div>
          </div>

          {/* Radial Disc */}
          <div style={panelStyle}>
            <h3 style={headingStyle}>
              Radial Disc
              <ColorDot r={params.discR} g={params.discG} b={params.discB} />
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Slider label="Radius" value={params.discRadius} onChange={v => set("discRadius", v)} min={30} max={200} step={1} />
              <Slider label="Opacity" value={params.discOpacity} onChange={v => set("discOpacity", v)} min={0} max={1} step={0.01} />
              <Slider label="Red" value={params.discR} onChange={v => set("discR", v)} min={0} max={1} step={0.01} />
              <Slider label="Green" value={params.discG} onChange={v => set("discG", v)} min={0} max={1} step={0.01} />
              <Slider label="Blue" value={params.discB} onChange={v => set("discB", v)} min={0} max={1} step={0.01} />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: "2rem", flexWrap: "wrap" }}>
          <button onClick={handleCopySVG} style={btnStyle}>{copied === "svg" ? "Copied" : "Copy SVG"}</button>
          <button onClick={handleDownload} style={btnStyle}>Download SVG</button>
          <button onClick={handleCopySettings} style={btnStyle}>{copied === "settings" ? "Copied" : "Copy Settings"}</button>
          <button onClick={handleCopyLink} style={btnStyle}>{copied === "link" ? "Copied" : "Copy Link"}</button>
          <button onClick={handleLoadSettings} style={{ ...btnStyle, borderColor: "var(--border-default)", color: "var(--text-secondary)" }}>Import</button>
          <button onClick={handleReset} style={{ ...btnStyle, borderColor: "var(--border-default)", color: "var(--text-secondary)" }}>Reset</button>
        </div>

        {/* Source */}
        <details style={{
          background: "var(--bg-surface)", border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-lg)", padding: "1rem",
        }}>
          <summary style={{ cursor: "pointer", fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>SVG source</summary>
          <pre style={{
            marginTop: "0.75rem", fontSize: "0.7rem", color: "var(--text-tertiary)",
            overflow: "auto", maxHeight: 300, whiteSpace: "pre-wrap", wordBreak: "break-all",
          }}>
            {exportSVG}
          </pre>
        </details>
      </div>
    </div>
  );
}

function PreviewBox({ label, svg }: { label: string; svg: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{
        background: "var(--bg-base)", border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-xl)", padding: 32,
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 300, height: 300,
      }}>
        <div dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
      <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: 8, display: "block" }}>
        {label}
      </span>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "0.5rem 1.25rem",
  background: "rgba(21, 209, 255, 0.1)",
  color: "#15D1FF",
  border: "1px solid #10a8cc",
  borderRadius: "var(--radius-md)",
  cursor: "pointer",
  fontSize: "var(--text-sm)",
  fontWeight: 500,
};
