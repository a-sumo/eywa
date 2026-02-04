import { useState, useEffect, useRef, useCallback } from "react";

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string;
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

const COOLDOWN_MS = 15_000;

export interface PanelLayout {
  position: [number, number, number];
  rotation: [number, number, number];
  width: number;
}

export interface AgentPanelResponse {
  x: number;
  y: number;
  z: number;
  rotY: number;
  width: number;
}

// ---------- math-based focus layout ----------

const PANEL_WIDTHS = [3.6, 3.6, 3.2];
const CURVATURE = 0.07;
const FOCAL_DIST = 14;

/**
 * Pure math layout: compute positions for 3 panels on a concave arc.
 * `focusIndex` determines which panel sits at center (x=0, z=0).
 * The others keep their original left-to-right order on the sides.
 */
export function computeFocusLayout(
  viewportWidth: number,
  focusIndex: number,
): PanelLayout[] {
  const widths = [...PANEL_WIDTHS];
  const usable = viewportWidth * 0.8;

  // Build ordering: panels left of focus, then focus, then panels right of focus
  const leftIndices: number[] = [];
  const rightIndices: number[] = [];
  for (let i = 0; i < 3; i++) {
    if (i < focusIndex) leftIndices.push(i);
    else if (i > focusIndex) rightIndices.push(i);
  }

  const totalSide =
    leftIndices.reduce((s, i) => s + widths[i], 0) +
    rightIndices.reduce((s, i) => s + widths[i], 0);
  const gap = Math.max(0.4, (usable - widths[focusIndex] - totalSide) / 2);

  const result: PanelLayout[] = new Array(3);

  // Focus panel: center, forward
  result[focusIndex] = {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    width: widths[focusIndex],
  };

  // Left-side panels (stack outward from center)
  let xCursor = -(widths[focusIndex] / 2 + gap);
  for (let li = leftIndices.length - 1; li >= 0; li--) {
    const idx = leftIndices[li];
    const x = xCursor - widths[idx] / 2;
    xCursor = x - widths[idx] / 2 - gap;
    const z = -CURVATURE * x * x;
    result[idx] = {
      position: [x, 0, z],
      rotation: [0, Math.atan2(x, FOCAL_DIST), 0],
      width: widths[idx],
    };
  }

  // Right-side panels (stack outward from center)
  xCursor = widths[focusIndex] / 2 + gap;
  for (const idx of rightIndices) {
    const x = xCursor + widths[idx] / 2;
    xCursor = x + widths[idx] / 2 + gap;
    const z = -CURVATURE * x * x;
    result[idx] = {
      position: [x, 0, z],
      rotation: [0, Math.atan2(x, FOCAL_DIST), 0],
      width: widths[idx],
    };
  }

  return result;
}

// ---------- agent prompt ----------

const PANEL_LABELS = ["Browse Memories", "Context", "Gemini Chat"];

function buildPrompt(
  viewportW: number,
  viewportH: number,
  camera: { x: number; y: number; z: number; fov: number },
  panels: PanelLayout[],
  focusIndex: number,
): string {
  const panelLines = panels
    .map(
      (p, i) =>
        `  ${i} "${PANEL_LABELS[i]}"${i === focusIndex ? " [FOCUS]" : ""} (w=${p.width}): pos=[${p.position.map((v) => v.toFixed(2)).join(",")}] rot=[${p.rotation.map((v) => v.toFixed(3)).join(",")}]`,
    )
    .join("\n");

  return `You are a spatial UI layout agent. You see a screenshot of 3 glass panels in a 3D workspace rendered from a perspective camera. Each panel displays text content that users need to read.

Viewport: ${viewportW.toFixed(1)} × ${viewportH.toFixed(1)} world units at z=0
Camera: position=[${camera.x.toFixed(2)},${camera.y.toFixed(2)},${camera.z.toFixed(2)}], fov=${camera.fov}°
Focus panel: index ${focusIndex} ("${PANEL_LABELS[focusIndex]}")
Panels (index → label → current):
${panelLines}
Panel height is always 4.2 units.

The screenshot shows a green dashed "sweet spot" oval at screen center — this is the optimal reading zone.

The math engine has already positioned the panels. Your job is to VALIDATE and CORRECT for readability and comfort:

SWEET SPOT (priority for the focus panel):
- The focus panel's text must be readable: panel should face the camera (< 30° angle)
- The focus panel should fill 30-60% of screen width (not too small, not too large)
- The focus panel center should be near screen center (inside or close to the sweet spot oval)

READABILITY:
- All panel text should be readable — panels must face the camera, not face away
- If a panel faces away (you see its back), rotate it to face the camera
- Panels at steep angles (> 50°) have unreadable text — reduce the angle
- The screenshot shows angle badges (e.g. "15°") on each panel — lower is better

LAYOUT:
- No overlapping panels — minimum 0.3 unit gap between edges
- No clipping — all panels should be within the viewport
- Side panels on a concave arc, angled inward toward the camera
- Panels vertically centered (y ≈ 0)

If the layout looks correct and text is readable, return the SAME positions.
If something is wrong (text unreadable, panel off-screen, occlusion), return corrected positions.

Return JSON: { "panels": [ { "x":_, "y":_, "z":_, "rotY":_, "width":_ }, ... ] }`;
}

// ---------- validation ----------

function clampValue(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function validateAndClamp(
  panels: AgentPanelResponse[],
  viewportW: number,
): PanelLayout[] | null {
  if (!Array.isArray(panels) || panels.length !== 3) return null;

  const halfW = viewportW / 2;
  const result: PanelLayout[] = [];

  for (const p of panels) {
    if (
      typeof p.x !== "number" ||
      typeof p.y !== "number" ||
      typeof p.z !== "number" ||
      typeof p.rotY !== "number" ||
      typeof p.width !== "number"
    ) {
      return null;
    }

    result.push({
      position: [
        clampValue(p.x, -halfW, halfW),
        clampValue(p.y, -3, 3),
        clampValue(p.z, -5, 2),
      ],
      rotation: [0, clampValue(p.rotY, -Math.PI / 3, Math.PI / 3), 0],
      width: clampValue(p.width, 1.5, 6),
    });
  }

  return result;
}

// ---------- hook ----------

export interface LayoutAgentState {
  layout: PanelLayout[] | null;
  loading: boolean;
  error: string | null;
  lastResponse: string | null;
  call: (imageBase64: string) => Promise<void>;
}

export function useLayoutAgent(
  enabled: boolean,
  currentLayout: PanelLayout[],
  focusIndex: number,
  viewport: { width: number; height: number },
  camera: { x: number; y: number; z: number; fov: number },
): LayoutAgentState {
  const [layout, setLayout] = useState<PanelLayout[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResponse, setLastResponse] = useState<string | null>(null);
  const lastCallRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Clear agent layout when focus changes so math takes over instantly
  useEffect(() => {
    setLayout(null);
    setLastResponse(null);
    setError(null);
  }, [focusIndex]);

  const call = useCallback(
    async (imageBase64: string) => {
      if (!GEMINI_API_KEY || !enabled) {
        setError(enabled ? "Missing VITE_GEMINI_API_KEY" : "Agent disabled");
        return;
      }

      const now = Date.now();
      if (now - lastCallRef.current < COOLDOWN_MS) {
        setError(
          `Cooldown: wait ${Math.ceil((COOLDOWN_MS - (now - lastCallRef.current)) / 1000)}s`,
        );
        return;
      }
      lastCallRef.current = now;

      abortRef.current?.abort();
      abortRef.current = new AbortController();

      setLoading(true);
      setError(null);

      try {
        const prompt = buildPrompt(
          viewport.width,
          viewport.height,
          camera,
          currentLayout,
          focusIndex,
        );

        const response = await fetch(GEMINI_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: abortRef.current.signal,
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  {
                    inlineData: {
                      mimeType: "image/jpeg",
                      data: imageBase64,
                    },
                  },
                  {
                    text: "Analyze the screenshot. Is the focus panel clearly visible and unoccluded? Are all panels within bounds? Return corrected JSON layout.",
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 2048,
              responseMimeType: "application/json",
              thinkingConfig: { thinkingBudget: 0 },
            },
          }),
        });

        if (!response.ok) {
          const errBody = await response.text();
          throw new Error(`Gemini API error ${response.status}: ${errBody}`);
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error("Empty response from Gemini");

        setLastResponse(text);

        const parsed = JSON.parse(text);
        const agentPanels: AgentPanelResponse[] = parsed.panels;
        const validated = validateAndClamp(agentPanels, viewport.width);

        if (!validated) {
          throw new Error(`Invalid response structure: ${text}`);
        }

        setLayout(validated);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;
        const msg =
          err instanceof Error ? err.message : "Failed to call Gemini";
        setError(msg);
        console.warn("[LayoutAgent]", msg);
      } finally {
        setLoading(false);
        abortRef.current = null;
      }
    },
    [enabled, currentLayout, focusIndex, viewport, camera],
  );

  return { layout, loading, error, lastResponse, call };
}
