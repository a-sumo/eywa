import { useState, useCallback, useRef, useEffect, type DragEvent } from "react";
import { DEFAULT_JELLY, JELLY_PALETTE, ALL_PARTS, PART_COLORS } from "./jellyData";
import type { JellyData, JellyPart, JellyPixel } from "./jellyData";

const CELL = 20; // editor cell size in px
const GRID_W = 24;
const GRID_H = 32;

/* ── Reference Images Panel ── */

interface RefImage {
  id: string;
  url: string;
  name: string;
}

function ReferenceImages({
  onSetUnderlay,
}: {
  onSetUnderlay: (url: string) => void;
}) {
  const [images, setImages] = useState<RefImage[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((files: FileList | File[]) => {
    const fileArr = Array.from(files);
    for (const file of fileArr) {
      if (!file.type.startsWith("image/")) continue;
      const reader = new FileReader();
      reader.onload = (e) => {
        const url = e.target?.result as string;
        setImages((prev) => [...prev, { id: `${Date.now()}-${Math.random()}`, url, name: file.name }]);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }, [addFiles]);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = "";
  }, [addFiles]);

  const removeImage = useCallback((id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setImages([]);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: "0.7rem", color: "var(--text-tertiary)" }}>REFERENCE</div>
        {images.length > 0 && (
          <button onClick={clearAll} style={{
            fontSize: "0.6rem", color: "var(--text-muted)", background: "none",
            border: "none", cursor: "pointer", padding: 0,
          }}>
            clear all
          </button>
        )}
      </div>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${isDragOver ? "var(--aurora-cyan)" : "var(--border-default)"}`,
          borderRadius: 6,
          padding: images.length === 0 ? "1.5rem 1rem" : "0.5rem",
          background: isDragOver ? "var(--aurora-cyan-glow)" : "var(--bg-surface)",
          cursor: "pointer",
          transition: "all 150ms ease",
          minHeight: images.length === 0 ? undefined : "auto",
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileInput}
          style={{ display: "none" }}
        />

        {images.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.7rem" }}>
            Drop images here or click to browse
          </div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
            gap: "0.5rem",
          }}>
            {images.map((img) => (
              <div key={img.id} style={{ position: "relative", borderRadius: 4, overflow: "hidden" }}>
                <img
                  src={img.url}
                  alt={img.name}
                  style={{
                    width: "100%",
                    height: "auto",
                    display: "block",
                    borderRadius: 4,
                    border: "1px solid var(--border-subtle)",
                  }}
                />
                {/* Overlay buttons */}
                <div style={{
                  position: "absolute", top: 3, right: 3,
                  display: "flex", gap: 3,
                }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); onSetUnderlay(img.url); }}
                    title="Use as canvas underlay"
                    style={{
                      width: 18, height: 18,
                      borderRadius: "50%",
                      border: "none",
                      background: "rgba(21, 209, 255, 0.8)",
                      color: "#fff",
                      fontSize: "0.6rem",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      lineHeight: 1,
                    }}
                  >
                    bg
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeImage(img.id); }}
                    style={{
                      width: 18, height: 18,
                      borderRadius: "50%",
                      border: "none",
                      background: "rgba(0,0,0,0.7)",
                      color: "var(--text-secondary)",
                      fontSize: "0.65rem",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      lineHeight: 1,
                    }}
                  >
                    x
                  </button>
                </div>
                <div style={{
                  fontSize: "0.55rem",
                  color: "var(--text-muted)",
                  padding: "2px 4px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {img.name}
                </div>
              </div>
            ))}

            {/* Add more placeholder */}
            <div
              style={{
                border: "1px dashed var(--border-default)",
                borderRadius: 4,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: 60,
                color: "var(--text-muted)",
                fontSize: "1.2rem",
              }}
            >
              +
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Underlay Transform Controls ── */

interface UnderlayState {
  url: string;
  opacity: number;
  scale: number;
  x: number;
  y: number;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
}

const DEFAULT_UNDERLAY: UnderlayState = {
  url: "",
  opacity: 0.3,
  scale: 1,
  x: 0,
  y: 0,
  rotation: 0,
  flipX: false,
  flipY: false,
};

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: "0.6rem", color: "var(--text-muted)", width: 44, flexShrink: 0 }}>
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ flex: 1, accentColor: "var(--aurora-cyan)", height: 4 }}
      />
      <span style={{ fontSize: "0.6rem", color: "var(--text-tertiary)", width: 36, textAlign: "right", flexShrink: 0 }}>
        {format ? format(value) : value}
      </span>
    </div>
  );
}

function UnderlayControls({
  state,
  onChange,
  onClear,
}: {
  state: UnderlayState;
  onChange: (s: UnderlayState) => void;
  onClear: () => void;
}) {
  const set = (patch: Partial<UnderlayState>) => onChange({ ...state, ...patch });

  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 4,
      background: "var(--bg-surface)", border: "1px solid var(--border-default)",
      borderRadius: 6, padding: "8px 10px",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: "0.7rem", color: "var(--aurora-cyan)" }}>Underlay</span>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={() => onChange({ ...DEFAULT_UNDERLAY, url: state.url })}
            style={{ fontSize: "0.6rem", color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            reset
          </button>
          <button
            onClick={onClear}
            style={{ fontSize: "0.6rem", color: "var(--aurora-pink)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            remove
          </button>
        </div>
      </div>

      <SliderRow label="Opacity" value={state.opacity} min={0} max={1} step={0.05}
        onChange={(v) => set({ opacity: v })} format={(v) => `${Math.round(v * 100)}%`} />
      <SliderRow label="Scale" value={state.scale} min={0.1} max={4} step={0.05}
        onChange={(v) => set({ scale: v })} format={(v) => `${v.toFixed(2)}x`} />
      <SliderRow label="X" value={state.x} min={-300} max={300} step={1}
        onChange={(v) => set({ x: v })} format={(v) => `${v}px`} />
      <SliderRow label="Y" value={state.y} min={-400} max={400} step={1}
        onChange={(v) => set({ y: v })} format={(v) => `${v}px`} />
      <SliderRow label="Rotate" value={state.rotation} min={-180} max={180} step={1}
        onChange={(v) => set({ rotation: v })} format={(v) => `${v}\u00b0`} />

      <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
        <button
          onClick={() => set({ flipX: !state.flipX })}
          style={{
            ...smallToggleStyle,
            borderColor: state.flipX ? "var(--aurora-cyan)" : "var(--border-default)",
            color: state.flipX ? "var(--aurora-cyan)" : "var(--text-muted)",
          }}
        >
          Flip H
        </button>
        <button
          onClick={() => set({ flipY: !state.flipY })}
          style={{
            ...smallToggleStyle,
            borderColor: state.flipY ? "var(--aurora-cyan)" : "var(--border-default)",
            color: state.flipY ? "var(--aurora-cyan)" : "var(--text-muted)",
          }}
        >
          Flip V
        </button>
      </div>
    </div>
  );
}

const smallToggleStyle: React.CSSProperties = {
  padding: "2px 8px",
  fontSize: "0.6rem",
  borderRadius: 3,
  border: "1px solid var(--border-default)",
  background: "var(--bg-elevated)",
  cursor: "pointer",
};

/* ── Helpers ── */

function pkey(x: number, y: number) {
  return `${x},${y}`;
}

function buildMap(pixels: JellyPixel[]): Map<string, JellyPixel> {
  const m = new Map<string, JellyPixel>();
  for (const p of pixels) m.set(pkey(p.x, p.y), p);
  return m;
}

/* Mirror a part name across the Y axis (left <-> right) */
const MIRROR_PART: Partial<Record<JellyPart, JellyPart>> = {
  "eye-left": "eye-right",
  "eye-right": "eye-left",
  "tentacle-0": "tentacle-4",
  "tentacle-4": "tentacle-0",
  "tentacle-1": "tentacle-3",
  "tentacle-3": "tentacle-1",
};

function mirrorPart(part: JellyPart): JellyPart {
  return MIRROR_PART[part] ?? part;
}

/* ── Main Editor ── */

export function JellyEditor() {
  const [pixels, setPixels] = useState<Map<string, JellyPixel>>(
    () => buildMap(DEFAULT_JELLY.pixels)
  );
  const [activePart, setActivePart] = useState<JellyPart>("bell");
  const [activeColor, setActiveColor] = useState<string>(PART_COLORS.bell);
  const [tool, setTool] = useState<"draw" | "erase">("draw");
  const [mood, setMood] = useState<PreviewMood>("okay");
  const [isPainting, setIsPainting] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [copied, setCopied] = useState(false);
  const [underlay, setUnderlay] = useState<UnderlayState>(DEFAULT_UNDERLAY);
  const [mirrorY, setMirrorY] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  const hasUnderlay = underlay.url !== "";

  const handleSetUnderlay = useCallback((url: string) => {
    setUnderlay({ ...DEFAULT_UNDERLAY, url });
  }, []);

  const handleClearUnderlay = useCallback(() => {
    setUnderlay(DEFAULT_UNDERLAY);
  }, []);

  // When part changes, default to that part's color
  const handlePartChange = useCallback((part: JellyPart) => {
    setActivePart(part);
    setActiveColor(PART_COLORS[part]);
  }, []);

  // Paint a pixel (+ mirrored twin when mirrorY is on)
  const paint = useCallback((x: number, y: number) => {
    if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) return;
    const key = pkey(x, y);
    const mx = GRID_W - 1 - x;
    const mkey = pkey(mx, y);

    setPixels((prev) => {
      const next = new Map(prev);
      if (tool === "erase") {
        next.delete(key);
        if (mirrorY) next.delete(mkey);
      } else {
        next.set(key, { x, y, color: activeColor, part: activePart });
        if (mirrorY) {
          next.set(mkey, { x: mx, y, color: activeColor, part: mirrorPart(activePart) });
        }
      }
      return next;
    });
  }, [tool, activeColor, activePart, mirrorY]);

  // Get cell coords from mouse/touch event
  const getCellFromEvent = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    const x = Math.floor((clientX - rect.left) / CELL);
    const y = Math.floor((clientY - rect.top) / CELL);
    return { x, y };
  }, []);

  const handlePointerDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 2) {
      const cell = getCellFromEvent(e);
      if (cell) {
        setPixels((prev) => {
          const next = new Map(prev);
          next.delete(pkey(cell.x, cell.y));
          if (mirrorY) next.delete(pkey(GRID_W - 1 - cell.x, cell.y));
          return next;
        });
      }
      return;
    }
    setIsPainting(true);
    const cell = getCellFromEvent(e);
    if (cell) paint(cell.x, cell.y);
  }, [getCellFromEvent, paint, mirrorY]);

  const handlePointerMove = useCallback((e: React.MouseEvent) => {
    if (!isPainting) return;
    const cell = getCellFromEvent(e);
    if (cell) paint(cell.x, cell.y);
  }, [isPainting, getCellFromEvent, paint]);

  const handlePointerUp = useCallback(() => {
    setIsPainting(false);
  }, []);

  useEffect(() => {
    const up = () => setIsPainting(false);
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  // Build JellyData for preview
  const jellyData: JellyData = {
    width: GRID_W,
    height: GRID_H,
    pixels: Array.from(pixels.values()),
  };

  const exportJSON = useCallback(() => {
    const json = JSON.stringify(jellyData, null, 2);
    navigator.clipboard.writeText(json).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [jellyData]);

  const importJSON = useCallback(() => {
    const input = prompt("Paste JellyData JSON:");
    if (!input) return;
    try {
      const data = JSON.parse(input) as JellyData;
      setPixels(buildMap(data.pixels));
    } catch {
      alert("Invalid JSON");
    }
  }, []);

  const clearAll = useCallback(() => {
    if (confirm("Clear all pixels?")) setPixels(new Map());
  }, []);

  const resetDefault = useCallback(() => {
    setPixels(buildMap(DEFAULT_JELLY.pixels));
  }, []);

  type PreviewMood = "happy" | "okay" | "sad" | "thinking" | "sleeping";
  const moods: PreviewMood[] = ["happy", "okay", "sad", "thinking", "sleeping"];

  // Build underlay CSS transform
  const underlayTransform = [
    `translate(${underlay.x}px, ${underlay.y}px)`,
    `scale(${underlay.flipX ? -underlay.scale : underlay.scale}, ${underlay.flipY ? -underlay.scale : underlay.scale})`,
    `rotate(${underlay.rotation}deg)`,
  ].join(" ");

  return (
    <div style={{
      display: "flex",
      gap: "2rem",
      padding: "1.5rem",
      background: "var(--bg-base)",
      color: "var(--text-primary)",
      minHeight: "100vh",
      fontFamily: "var(--font-sans)",
      overflow: "auto",
    }}>
      {/* Left: controls + grid */}
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem", flexShrink: 0 }}>
        <h2 style={{ margin: 0, fontSize: "1.25rem", fontFamily: "var(--font-display)" }}>
          Jelly Editor
        </h2>

        {/* Reference images */}
        <ReferenceImages onSetUnderlay={handleSetUnderlay} />

        {/* Underlay controls (only when an image is set) */}
        {hasUnderlay && (
          <UnderlayControls
            state={underlay}
            onChange={setUnderlay}
            onClear={handleClearUnderlay}
          />
        )}

        {/* Part selector */}
        <div>
          <div style={{ fontSize: "0.7rem", color: "var(--text-tertiary)", marginBottom: "0.25rem" }}>
            PART
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
            {ALL_PARTS.map((part) => (
              <button
                key={part}
                onClick={() => handlePartChange(part)}
                style={{
                  padding: "3px 8px",
                  fontSize: "0.7rem",
                  borderRadius: "4px",
                  border: activePart === part ? "1px solid var(--aurora-cyan)" : "1px solid var(--border-default)",
                  background: activePart === part ? "var(--aurora-cyan-glow)" : "var(--bg-surface)",
                  color: activePart === part ? "var(--aurora-cyan)" : "var(--text-secondary)",
                  cursor: "pointer",
                }}
              >
                <span style={{
                  display: "inline-block",
                  width: 8, height: 8,
                  borderRadius: 2,
                  background: PART_COLORS[part],
                  marginRight: 4,
                  verticalAlign: "middle",
                }} />
                {part}
              </button>
            ))}
          </div>
        </div>

        {/* Color palette */}
        <div>
          <div style={{ fontSize: "0.7rem", color: "var(--text-tertiary)", marginBottom: "0.25rem" }}>
            COLOR
          </div>
          <div style={{ display: "flex", gap: "3px", flexWrap: "wrap" }}>
            {JELLY_PALETTE.map((c) => (
              <button
                key={c}
                onClick={() => setActiveColor(c)}
                style={{
                  width: 24, height: 24,
                  borderRadius: 3,
                  background: c,
                  border: activeColor === c ? "2px solid var(--aurora-cyan)" : "2px solid transparent",
                  cursor: "pointer",
                  boxShadow: activeColor === c ? "0 0 6px var(--aurora-cyan-glow)" : "none",
                }}
              />
            ))}
          </div>
        </div>

        {/* Tool */}
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <button
            onClick={() => setTool("draw")}
            style={{
              padding: "4px 12px", fontSize: "0.75rem", borderRadius: 4, cursor: "pointer",
              border: tool === "draw" ? "1px solid var(--aurora-cyan)" : "1px solid var(--border-default)",
              background: tool === "draw" ? "var(--aurora-cyan-glow)" : "var(--bg-surface)",
              color: tool === "draw" ? "var(--aurora-cyan)" : "var(--text-secondary)",
            }}
          >
            Draw
          </button>
          <button
            onClick={() => setTool("erase")}
            style={{
              padding: "4px 12px", fontSize: "0.75rem", borderRadius: 4, cursor: "pointer",
              border: tool === "erase" ? "1px solid var(--aurora-pink)" : "1px solid var(--border-default)",
              background: tool === "erase" ? "var(--aurora-pink-glow)" : "var(--bg-surface)",
              color: tool === "erase" ? "var(--aurora-pink)" : "var(--text-secondary)",
            }}
          >
            Erase
          </button>
          <label style={{ fontSize: "0.7rem", color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: 4 }}>
            <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
            Grid
          </label>
          <label style={{
            fontSize: "0.7rem",
            color: mirrorY ? "var(--aurora-cyan)" : "var(--text-tertiary)",
            display: "flex", alignItems: "center", gap: 4,
          }}>
            <input type="checkbox" checked={mirrorY} onChange={(e) => {
              const on = e.target.checked;
              if (on) {
                const mid = GRID_W / 2;
                const rightCount = Array.from(pixels.values()).filter((p) => p.x >= mid).length;
                if (rightCount > 0 && !confirm(`Overwrite ${rightCount} pixels on the right side with mirrored left?`)) return;
                setPixels((prev) => {
                  const next = new Map<string, JellyPixel>();
                  // Keep left side, mirror it to right
                  for (const p of prev.values()) {
                    if (p.x < mid) {
                      next.set(pkey(p.x, p.y), p);
                      const mx = GRID_W - 1 - p.x;
                      next.set(pkey(mx, p.y), { x: mx, y: p.y, color: p.color, part: mirrorPart(p.part) });
                    }
                  }
                  // Keep center column pixels as-is
                  if (GRID_W % 2 === 0) {
                    // even width: no true center pixel
                  } else {
                    for (const p of prev.values()) {
                      if (p.x === Math.floor(mid)) next.set(pkey(p.x, p.y), p);
                    }
                  }
                  return next;
                });
              }
              setMirrorY(on);
            }} />
            Mirror Y
          </label>
        </div>

        {/* Pixel grid */}
        <div
          ref={canvasRef}
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onContextMenu={handleContextMenu}
          style={{
            width: GRID_W * CELL,
            height: GRID_H * CELL,
            background: "#08090f",
            border: "1px solid var(--border-default)",
            borderRadius: 6,
            position: "relative",
            cursor: tool === "erase" ? "crosshair" : "cell",
            userSelect: "none",
            imageRendering: "pixelated",
            overflow: "hidden",
          }}
        >
          {/* Underlay image (behind everything) */}
          {hasUnderlay && (
            <img
              src={underlay.url}
              alt="underlay"
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: `translate(-50%, -50%) ${underlayTransform}`,
                opacity: underlay.opacity,
                pointerEvents: "none",
                maxWidth: "none",
                transformOrigin: "center center",
              }}
            />
          )}

          {/* Grid lines */}
          {showGrid && (
            <svg
              width={GRID_W * CELL}
              height={GRID_H * CELL}
              style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
            >
              {Array.from({ length: GRID_W + 1 }, (_, i) => (
                <line key={`v${i}`} x1={i * CELL} y1={0} x2={i * CELL} y2={GRID_H * CELL}
                  stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
              ))}
              {Array.from({ length: GRID_H + 1 }, (_, i) => (
                <line key={`h${i}`} x1={0} y1={i * CELL} x2={GRID_W * CELL} y2={i * CELL}
                  stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
              ))}
            </svg>
          )}

          {/* Mirror axis line */}
          {mirrorY && (
            <div style={{
              position: "absolute",
              left: (GRID_W / 2) * CELL - 1,
              top: 0,
              width: 0,
              height: GRID_H * CELL,
              borderLeft: "2px dashed var(--aurora-cyan)",
              opacity: 0.4,
              pointerEvents: "none",
              zIndex: 1,
            }} />
          )}

          {/* Pixels */}
          {Array.from(pixels.values()).map((p) => (
            <div
              key={pkey(p.x, p.y)}
              style={{
                position: "absolute",
                left: p.x * CELL,
                top: p.y * CELL,
                width: CELL,
                height: CELL,
                background: p.color,
                pointerEvents: "none",
              }}
            />
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button onClick={exportJSON} style={actionBtnStyle}>
            {copied ? "Copied!" : "Export JSON"}
          </button>
          <button onClick={importJSON} style={actionBtnStyle}>
            Import JSON
          </button>
          <button onClick={resetDefault} style={actionBtnStyle}>
            Reset Default
          </button>
          <button onClick={clearAll} style={{ ...actionBtnStyle, borderColor: "var(--error)" }}>
            Clear All
          </button>
        </div>

        <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", maxWidth: GRID_W * CELL }}>
          Left-click to draw, right-click to erase. Pick a part, pick a color, paint.
          Export JSON when done, paste it to update the default data.
        </div>
      </div>

      {/* Right: live preview */}
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem", alignItems: "center" }}>
        <h3 style={{ margin: 0, fontSize: "1rem", fontFamily: "var(--font-display)" }}>
          Live Preview
        </h3>

        {/* Mood switcher */}
        <div style={{ display: "flex", gap: "0.4rem" }}>
          {moods.map((m) => (
            <button
              key={m}
              onClick={() => setMood(m)}
              style={{
                padding: "3px 10px",
                fontSize: "0.7rem",
                borderRadius: "9999px",
                border: mood === m ? "1px solid var(--aurora-cyan)" : "1px solid var(--border-default)",
                background: mood === m ? "var(--aurora-cyan-glow)" : "var(--bg-surface)",
                color: mood === m ? "var(--aurora-cyan)" : "var(--text-secondary)",
                cursor: "pointer",
              }}
            >
              {m}
            </button>
          ))}
        </div>

        {/* Preview at different scales */}
        {/* Static pixel preview at different scales */}
        <div style={{
          background: "var(--bg-elevated)",
          borderRadius: 10,
          padding: "2rem",
          border: "1px solid var(--border-subtle)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "1.5rem",
        }}>
          <div style={{ display: "flex", gap: "2rem", alignItems: "flex-end" }}>
            {[1, 2, 3].map((s) => {
              const cs = 6 * s;
              return (
                <div key={s} style={{ textAlign: "center" }}>
                  <svg
                    width={GRID_W * cs}
                    height={GRID_H * cs}
                    viewBox={`0 0 ${GRID_W * cs} ${GRID_H * cs}`}
                    shapeRendering="crispEdges"
                    style={{ background: "#08090f", borderRadius: 4 }}
                  >
                    {Array.from(pixels.values()).map((p) => (
                      <rect
                        key={pkey(p.x, p.y)}
                        x={p.x * cs}
                        y={p.y * cs}
                        width={cs}
                        height={cs}
                        fill={p.color}
                      />
                    ))}
                  </svg>
                  <div style={{ fontSize: "0.6rem", color: "var(--text-muted)", marginTop: 4 }}>{s}x</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Pixel count */}
        <div style={{ fontSize: "0.7rem", color: "var(--text-tertiary)" }}>
          {pixels.size} pixels, {new Set(Array.from(pixels.values()).map((p) => p.part)).size} parts
        </div>

        {/* Part breakdown */}
        <div style={{
          fontSize: "0.65rem",
          color: "var(--text-muted)",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "2px 12px",
        }}>
          {ALL_PARTS.map((part) => {
            const count = Array.from(pixels.values()).filter((p) => p.part === part).length;
            if (count === 0) return null;
            return (
              <div key={part}>
                <span style={{
                  display: "inline-block",
                  width: 6, height: 6,
                  borderRadius: 1,
                  background: PART_COLORS[part],
                  marginRight: 4,
                  verticalAlign: "middle",
                }} />
                {part}: {count}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const actionBtnStyle: React.CSSProperties = {
  padding: "4px 12px",
  fontSize: "0.7rem",
  borderRadius: 4,
  border: "1px solid var(--border-default)",
  background: "var(--bg-surface)",
  color: "var(--text-secondary)",
  cursor: "pointer",
};
