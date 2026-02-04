import type { PanelLayout } from "../hooks/useLayoutAgent";

// ---- constants ----

export const PANEL_LABELS = ["Browse Memories", "Context", "Gemini Chat"];
export const PANEL_COLORS = ["#ff6688", "#4488ff", "#ffaa44"];
export const PANEL_HEIGHT = 4.2;

export const PANEL_TEXT: string[][] = [
  [
    "Browse Memories",
    "",
    "agent-alpha / session-019",
    "  Analyzed 14 documents and",
    "  extracted key themes from",
    "  the quarterly report...",
    "",
    "agent-beta / session-022",
    "  Cross-referenced findings",
    "  with external data sources",
  ],
  [
    "Context (3 memories)",
    "",
    "[agent-alpha] observation:",
    "  Revenue grew 12% QoQ driven",
    "  by enterprise segment...",
    "",
    "[agent-beta] analysis:",
    "  Market position strengthened",
    "  relative to competitors...",
    "",
  ],
  [
    "Gemini Chat",
    "",
    "You: Summarize the context",
    "",
    "Gemini: Based on 3 memories",
    "  from 2 agents, the key",
    "  finding is 12% QoQ revenue",
    "  growth driven by enterprise.",
    "",
    "",
  ],
];

export const CAMERA = { x: 0, y: 0.8, z: 11, fov: 50 };
export const VIEWPORT = { width: 18, height: 10 };

// ---- vec3 math ----

export type Vec3 = [number, number, number];

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
export function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
export function normalize(v: Vec3): Vec3 {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  if (len < 1e-8) return [0, 0, 1];
  return [v[0] / len, v[1] / len, v[2] / len];
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpLayout(a: PanelLayout[], b: PanelLayout[], t: number): PanelLayout[] {
  return a.map((ap, i) => ({
    position: [
      lerp(ap.position[0], b[i].position[0], t),
      lerp(ap.position[1], b[i].position[1], t),
      lerp(ap.position[2], b[i].position[2], t),
    ] as [number, number, number],
    rotation: [
      lerp(ap.rotation[0], b[i].rotation[0], t),
      lerp(ap.rotation[1], b[i].rotation[1], t),
      lerp(ap.rotation[2], b[i].rotation[2], t),
    ] as [number, number, number],
    width: lerp(ap.width, b[i].width, t),
  }));
}

// ---- hand poses ----

export type HandPose = "idle" | "reach" | "grab" | "pull" | "push";

export interface FingerDef {
  bx: number; by: number;
  tx: number; ty: number;
  cx?: number; cy?: number;
}

export function getFingerDefs(pose: HandPose): FingerDef[] {
  switch (pose) {
    case "idle":
      return [
        { bx: -18, by: -5, tx: -28, ty: -30 },
        { bx: -10, by: -10, tx: -14, ty: -40 },
        { bx: -2, by: -12, tx: -2, ty: -44 },
        { bx: 6, by: -10, tx: 6, ty: -40 },
        { bx: 14, by: -7, tx: 18, ty: -32 },
      ];
    case "reach":
      return [
        { bx: -20, by: -5, tx: -34, ty: -28 },
        { bx: -10, by: -12, tx: -18, ty: -48 },
        { bx: -2, by: -14, tx: -2, ty: -52 },
        { bx: 6, by: -12, tx: 10, ty: -48 },
        { bx: 14, by: -8, tx: 24, ty: -38 },
      ];
    case "grab":
      return [
        { bx: -18, by: -5, tx: -14, ty: -20, cx: -26, cy: -18 },
        { bx: -10, by: -10, tx: -2, ty: -18, cx: -16, cy: -34 },
        { bx: -2, by: -12, tx: 4, ty: -16, cx: -6, cy: -38 },
        { bx: 6, by: -10, tx: 10, ty: -14, cx: 2, cy: -32 },
        { bx: 14, by: -7, tx: 14, ty: -12, cx: 12, cy: -24 },
      ];
    case "pull":
      return [
        { bx: -18, by: -5, tx: -12, ty: -22, cx: -24, cy: -16 },
        { bx: -10, by: -10, tx: 0, ty: -22, cx: -18, cy: -38 },
        { bx: -2, by: -12, tx: 6, ty: -20, cx: -8, cy: -40 },
        { bx: 6, by: -10, tx: 12, ty: -18, cx: 0, cy: -36 },
        { bx: 14, by: -7, tx: 16, ty: -16, cx: 10, cy: -26 },
      ];
    case "push":
      return [
        { bx: -22, by: -4, tx: -38, ty: -24 },
        { bx: -12, by: -14, tx: -22, ty: -52 },
        { bx: -2, by: -16, tx: -2, ty: -56 },
        { bx: 8, by: -14, tx: 14, ty: -52 },
        { bx: 18, by: -8, tx: 30, ty: -36 },
      ];
  }
}

// ---- timeline ----

export interface TimelineStep {
  t: number;
  label: string;
  description: string;
  focus: number;
  handPos: [number, number, number];
  handPose: HandPose;
  grab: boolean;
  grabLabel?: string;
  grabSourcePanel?: number;
  predictedTarget?: number;
  gestureLabel?: string;
  gestureColor?: string;
  gestureArrow?: "pull" | "push";
}

export const TIMELINE: TimelineStep[] = [
  {
    t: 0,
    label: "1. Idle",
    description: "User sees the workspace. Context is centered.",
    focus: 1,
    handPos: [2, -0.5, 3],
    handPose: "idle",
    grab: false,
  },
  {
    t: 0,
    label: "2. Reach left",
    description: "User reaches toward Browse Memories. System detects intent shift.",
    focus: 1,
    handPos: [-3, 0, 2],
    handPose: "reach",
    grab: false,
  },
  {
    t: 0,
    label: "3. Browse → sweet spot",
    description: "Intent confirmed: Browse Memories slides to the sweet spot.",
    focus: 0,
    handPos: [-1, 0.3, 1.5],
    handPose: "reach",
    grab: false,
  },
  {
    t: 0,
    label: "4. Grab memory",
    description: "User grabs a memory card from Browse Memories.",
    focus: 0,
    handPos: [0, 0.5, 1.5],
    handPose: "grab",
    grab: true,
    grabLabel: "agent-alpha memory",
    grabSourcePanel: 0,
    gestureLabel: "GRAB",
    gestureColor: "#ffffff",
  },
  {
    t: 0,
    label: "5. Predict → Context",
    description:
      "Grab detected → agent predicts target is Context. Context slides to sweet spot.",
    focus: 1,
    handPos: [0.5, 0.3, 2],
    handPose: "grab",
    grab: true,
    grabLabel: "agent-alpha memory",
    grabSourcePanel: 0,
    predictedTarget: 1,
    gestureLabel: "GRAB",
    gestureColor: "#ffffff",
  },
  {
    t: 0,
    label: "6. Drop",
    description:
      "Context is now in the sweet spot. User drops the memory with minimal arm travel.",
    focus: 1,
    handPos: [0, 0, 1.5],
    handPose: "idle",
    grab: false,
  },
  {
    t: 0,
    label: "7. Pull → Gemini",
    description: "Pull gesture brings Gemini Chat to the sweet spot.",
    focus: 2,
    handPos: [2, 0, 3],
    handPose: "pull",
    grab: false,
    gestureLabel: "PULL",
    gestureColor: "#44ff88",
    gestureArrow: "pull",
  },
  {
    t: 0,
    label: "8. Push → return",
    description: "Push gesture returns layout. Context slides back to center.",
    focus: 1,
    handPos: [1, 0, 3],
    handPose: "push",
    grab: false,
    gestureLabel: "PUSH",
    gestureColor: "#ff8844",
    gestureArrow: "push",
  },
];

// ---- AR scale ----

export const AR_SCALE = 0.35;
