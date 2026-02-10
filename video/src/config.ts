/**
 * Eywa Demo Video Configuration
 *
 * Edit this file to change timing, layout, and transitions.
 * All times are in seconds, converted to frames internally.
 *
 * Three segment types:
 * - FOUNDER: Full-screen founder talking (no background)
 * - DEMO: Product demo full screen, founder in PIP corner
 * - LANDING: Landing page scroll full screen, founder in PIP corner
 *
 * The founder video audio is ALWAYS playing (it's the voiceover).
 * Demo and landing videos are muted.
 *
 * PIP emphasis controls founder PIP size during demo/landing segments:
 * - "small"  = 240x135 (background is the star, founder is ambient)
 * - "medium" = 380x214 (balanced)
 * - "large"  = 520x293 (founder making a key point, demand attention)
 */

export type PipEmphasis = "small" | "medium" | "large";
export type PipPosition =
  | "bottom-right"
  | "bottom-left"
  | "top-right"
  | "top-left";

export type Segment = {
  type: "founder" | "demo" | "landing";
  start: number;
  end: number;
  /** Where to start in the demo video (seconds). Only for type "demo". */
  demoStart?: number;
  /** Where to start in the landing video (seconds). Only for type "landing". */
  landingStart?: number;
  /** PIP size. Ignored for founder segments. */
  emphasis?: PipEmphasis;
};

export const DEMO_CONFIG = {
  fps: 24,

  // Source videos (relative to public/)
  founderVideo: "FounderVideo-trimmed.mp4",
  demoVideo: "eywa-demo-web-hq.mp4",
  landingVideo: "eywa-landing-hero.mp4",
  // Duration of the hero clip in seconds (loops during landing segments)
  landingVideoDuration: 5,

  // PIP settings per emphasis level
  pip: {
    small:  { width: 240, height: 135 },
    medium: { width: 380, height: 214 },
    large:  { width: 520, height: 293 },
    margin: 24,
    borderRadius: 12,
    position: "bottom-right" as PipPosition,
  },

  // Transition duration in seconds (layout changes)
  transitionDuration: 0.6,

  // Emphasis transition duration in seconds (PIP size changes)
  emphasisTransitionDuration: 0.8,

  // Aurora glow on PIP border (Nightly Aurora theme)
  glow: {
    enabled: true,
    period: 3,
    colors: [
      "rgba(100, 23, 236, 0.6)",   // purple
      "rgba(21, 209, 255, 0.6)",    // cyan
      "rgba(236, 72, 153, 0.6)",    // pink
      "rgba(52, 211, 153, 0.5)",    // green
    ],
  },

  segments: [
    // Intro: you talking to camera
    { type: "founder", start: 0, end: 10 },

    // Landing page eye candy while you explain "Eywa lets teams coordinate..."
    { type: "landing", start: 10, end: 20, landingStart: 0, emphasis: "medium" },

    // Hub demo: "one command, full visibility"
    { type: "demo", start: 20, end: 35, demoStart: 0, emphasis: "small" },

    // "inject context, ping an agent" - features, you grow
    { type: "demo", start: 35, end: 45, demoStart: 15, emphasis: "large" },

    // Back to you for personal story
    { type: "founder", start: 45, end: 60 },

    // Demo: agents coordinating, you're ambient
    { type: "demo", start: 60, end: 75, demoStart: 30, emphasis: "small" },

    // "we really need a way" - key pitch, grow
    { type: "demo", start: 75, end: 85, demoStart: 45, emphasis: "large" },

    // Landing page again for the close (visual polish under your pitch)
    { type: "landing", start: 85, end: 95, landingStart: 15, emphasis: "medium" },

    // Final: full screen you, cofounder call
    { type: "founder", start: 95, end: 101 },
  ] as Segment[],

  totalFrames: 0,
};

// Derived
DEMO_CONFIG.totalFrames = Math.ceil(
  DEMO_CONFIG.segments[DEMO_CONFIG.segments.length - 1].end * DEMO_CONFIG.fps
);
