import { useState, useEffect, useRef, useCallback } from "react";
import {
  validateAndClamp,
  type PanelLayout,
  type AgentPanelResponse,
} from "./useLayoutAgent";

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string;
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

const COOLDOWN_MS = 3_000;
const REQUEST_TIMEOUT_MS = 10_000;

// ---- types ----

export type GestureType = "idle" | "reach" | "grab" | "pull" | "push";

export interface GestureAgentResult {
  gesture: GestureType;
  targetPanel: number | null;
  focusPanel: number;
  layoutCorrections: PanelLayout[] | null;
  confidence: number;
  reasoning: string;
}

export interface GestureAgentState {
  result: GestureAgentResult | null;
  loading: boolean;
  error: string | null;
  history: GestureAgentResult[];
  analyze: (imageBase64: string) => Promise<void>;
}

// ---- prompt ----

function buildGesturePrompt(viewportW: number, viewportH: number): string {
  return `You are an AI gesture recognition and spatial layout agent. You see a screenshot of a 3D workspace with 3 glass panels and a hand.

Viewport: ${viewportW.toFixed(1)} x ${viewportH.toFixed(1)} world units.
Panels (left-to-right logical order): 0 "Browse Memories", 1 "Context", 2 "Gemini Chat".

TASK 1 — GESTURE RECOGNITION:
Identify the hand pose from these options:
- "idle": hand resting, fingers relaxed
- "reach": hand extended with fingers spread, reaching toward a panel
- "grab": hand with fingers curled inward, gripping gesture
- "pull": fingers curled in a beckoning motion, pulling toward self
- "push": hand open with fingers spread wide, pushing away

Identify which panel (0, 1, or 2) the hand is nearest to or pointing at. Return null if the hand is not clearly targeting any panel.

TASK 2 — FOCUS DECISION:
Based on the gesture, decide which panel should be in the center "sweet spot":
- "reach" near panel X → focus that panel (user wants to interact with it)
- "grab" near panel X → focus the likely DROP target (usually the next panel in workflow)
- "pull" → focus the panel being pulled closer (usually the one the hand faces)
- "push" → return to default layout (focus panel 1 "Context")
- "idle" → keep current focus (panel 1 "Context" if no prior context)

TASK 3 — LAYOUT QUALITY:
Look at the actual panel positions in the screenshot. Check:
- Is the focus panel centered and readable (< 30° angle to camera)?
- Are side panels on a concave arc, angled inward?
- Any overlapping or clipped panels?
- Is text readable on all visible panels?

If the layout looks correct, set "layoutCorrections" to null.
If something is wrong, return corrected positions as an array of 3 objects with { x, y, z, rotY, width }.

Return ONLY this JSON structure:
{
  "gesture": "idle"|"reach"|"grab"|"pull"|"push",
  "targetPanel": 0|1|2|null,
  "focusPanel": 0|1|2,
  "layoutCorrections": null | [{"x":_,"y":_,"z":_,"rotY":_,"width":_}, ...],
  "confidence": 0.0-1.0,
  "reasoning": "one sentence explaining the decision"
}`;
}

// ---- response parsing ----

interface RawGestureResponse {
  gesture?: string;
  targetPanel?: number | null;
  focusPanel?: number;
  layoutCorrections?: AgentPanelResponse[] | null;
  confidence?: number;
  reasoning?: string;
}

const VALID_GESTURES = new Set(["idle", "reach", "grab", "pull", "push"]);

function parseResponse(
  text: string,
  viewportW: number,
): GestureAgentResult | null {
  let parsed: RawGestureResponse;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;

  const gesture = parsed.gesture;
  if (!gesture || !VALID_GESTURES.has(gesture)) return null;

  const focusPanel = parsed.focusPanel;
  if (typeof focusPanel !== "number" || focusPanel < 0 || focusPanel > 2)
    return null;

  const targetPanel =
    parsed.targetPanel === null || parsed.targetPanel === undefined
      ? null
      : typeof parsed.targetPanel === "number" &&
          parsed.targetPanel >= 0 &&
          parsed.targetPanel <= 2
        ? parsed.targetPanel
        : null;

  const confidence =
    typeof parsed.confidence === "number"
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.5;

  const reasoning =
    typeof parsed.reasoning === "string" ? parsed.reasoning : "";

  let layoutCorrections: PanelLayout[] | null = null;
  if (Array.isArray(parsed.layoutCorrections)) {
    layoutCorrections = validateAndClamp(parsed.layoutCorrections, viewportW);
  }

  return {
    gesture: gesture as GestureType,
    targetPanel,
    focusPanel,
    layoutCorrections,
    confidence,
    reasoning,
  };
}

// ---- hook ----

export function useGestureAgent(
  enabled: boolean,
  viewport: { width: number; height: number },
): GestureAgentState {
  const [result, setResult] = useState<GestureAgentResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<GestureAgentResult[]>([]);
  const lastCallRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const analyze = useCallback(
    async (imageBase64: string) => {
      if (!GEMINI_API_KEY || !enabled) {
        setError(enabled ? "Missing VITE_GEMINI_API_KEY" : "AI mode disabled");
        return;
      }

      const now = Date.now();
      if (now - lastCallRef.current < COOLDOWN_MS) {
        return; // silently skip during cooldown
      }
      lastCallRef.current = now;

      abortRef.current?.abort();
      abortRef.current = new AbortController();

      // Auto-abort if the request takes too long
      const timeoutId = setTimeout(() => {
        abortRef.current?.abort();
      }, REQUEST_TIMEOUT_MS);

      setLoading(true);
      setError(null);

      try {
        const prompt = buildGesturePrompt(viewport.width, viewport.height);

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
                    text: "Analyze the hand gesture and panel layout in this screenshot. Return the JSON response.",
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

        const parsed = parseResponse(text, viewport.width);
        if (!parsed) {
          throw new Error(`Invalid gesture response: ${text.slice(0, 200)}`);
        }

        setResult(parsed);
        setHistory((prev) => [...prev, parsed]);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          // Distinguish user-abort from timeout-abort
          if (Date.now() - now >= REQUEST_TIMEOUT_MS - 500) {
            setError("Analysis timed out");
            console.warn("[GestureAgent] Request timed out");
          }
          return;
        }
        const msg =
          err instanceof Error ? err.message : "Failed to call Gemini";
        setError(msg);
        console.warn("[GestureAgent]", msg);
      } finally {
        clearTimeout(timeoutId);
        setLoading(false);
        abortRef.current = null;
      }
    },
    [enabled, viewport.width, viewport.height],
  );

  return { result, loading, error, history, analyze };
}
