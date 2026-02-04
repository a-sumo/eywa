import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  useLayoutAgent,
  computeFocusLayout,
  type PanelLayout,
} from "../hooks/useLayoutAgent";
import {
  useGestureAgent,
  type GestureAgentResult,
} from "../hooks/useGestureAgent";

// ---- constants ----

const PANEL_LABELS = ["Browse Memories", "Context", "Gemini Chat"];
const PANEL_COLORS = ["#ff6688", "#4488ff", "#ffaa44"];
const PANEL_HEIGHT = 4.2;

const PANEL_TEXT: string[][] = [
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

// ---- timeline: the user journey ----

type HandPose = "idle" | "reach" | "grab" | "pull" | "push";

interface TimelineStep {
  t: number;
  label: string;
  description: string;
  focus: number;
  handPos: [number, number, number]; // 3D world position of hand
  handPose: HandPose;
  grab: boolean;
  grabLabel?: string;
  grabSourcePanel?: number;
  predictedTarget?: number;
  gestureLabel?: string;
  gestureColor?: string;
  gestureArrow?: "pull" | "push";
}

const CAMERA = { x: 0, y: 0.8, z: 11, fov: 50 };
const VIEWPORT = { width: 18, height: 10 };

const TIMELINE: TimelineStep[] = [
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

// ---- vec3 math ----

type Vec3 = [number, number, number];

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
function normalize(v: Vec3): Vec3 {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  if (len < 1e-8) return [0, 0, 1];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpLayout(a: PanelLayout[], b: PanelLayout[], t: number): PanelLayout[] {
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

// ---- projection ----

function projectPoint(
  point: Vec3,
  camPos: Vec3,
  fov: number,
  W: number,
  H: number,
): [number, number, number] | null {
  const forward = normalize(sub([0, 0, 0], camPos));
  const right = normalize(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const rel = sub(point, camPos);
  const x = dot(rel, right);
  const y = dot(rel, up);
  const z = dot(rel, forward);
  if (z <= 0.1) return null;
  const tanHalf = Math.tan((fov * Math.PI) / 360);
  const aspect = W / H;
  return [
    (x / (z * tanHalf * aspect) * 0.5 + 0.5) * W,
    (-y / (z * tanHalf) * 0.5 + 0.5) * H,
    z,
  ];
}

// ---- panel geometry ----

function getPanelCorners(p: PanelLayout): Vec3[] {
  const [px, py, pz] = p.position;
  const rotY = p.rotation[1];
  const hw = p.width / 2;
  const hh = PANEL_HEIGHT / 2;
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  return [
    [px - hw * c, py + hh, pz + hw * s],
    [px + hw * c, py + hh, pz - hw * s],
    [px + hw * c, py - hh, pz - hw * s],
    [px - hw * c, py - hh, pz + hw * s],
  ];
}

function getPanelNormal(p: PanelLayout): Vec3 {
  const rotY = p.rotation[1];
  return [Math.sin(rotY), 0, Math.cos(rotY)];
}

function panelSurfacePoint(p: PanelLayout, u: number, v: number): Vec3 {
  const [px, py, pz] = p.position;
  const rotY = p.rotation[1];
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  return [px + u * (p.width / 2) * c, py + v * (PANEL_HEIGHT / 2), pz - u * (p.width / 2) * s];
}

function computeFacing(p: PanelLayout, camPos: Vec3): number {
  const normal = getPanelNormal(p);
  const viewDir = normalize(sub(p.position as Vec3, camPos));
  const cosAngle = -dot(normal, viewDir);
  return Math.acos(Math.max(-1, Math.min(1, cosAngle))) * (180 / Math.PI);
}

// ---- 3D hand rendering ----

interface FingerDef {
  bx: number; by: number;
  tx: number; ty: number;
  cx?: number; cy?: number;
}

function getFingerDefs(pose: HandPose): FingerDef[] {
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

function drawHand(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  scale: number,
  pose: HandPose,
) {
  ctx.save();
  ctx.translate(sx, sy);
  ctx.scale(scale, scale);

  const fingers = getFingerDefs(pose);

  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(3, 5, 20, 14, 0.1, 0, Math.PI * 2);
  ctx.fill();

  const palmGrad = ctx.createRadialGradient(-4, -2, 2, 0, 0, 22);
  palmGrad.addColorStop(0, "#e0be9e");
  palmGrad.addColorStop(0.7, "#d4aa88");
  palmGrad.addColorStop(1, "#c49a78");
  ctx.fillStyle = palmGrad;
  ctx.beginPath();
  ctx.ellipse(0, 0, 20, 14, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#b08868";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(0, 0, 20, 14, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "#d4aa88";
  ctx.lineWidth = 5.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const f of fingers) {
    ctx.beginPath();
    ctx.moveTo(f.bx, f.by);
    if (f.cx !== undefined && f.cy !== undefined) {
      ctx.quadraticCurveTo(f.cx, f.cy, f.tx, f.ty);
    } else {
      ctx.lineTo(f.tx, f.ty);
    }
    ctx.stroke();

    ctx.fillStyle = "#e8cbb0";
    ctx.beginPath();
    ctx.arc(f.tx, f.ty, 2.8, 0, Math.PI * 2);
    ctx.fill();
  }

  if (pose === "grab" || pose === "pull") {
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    for (const f of fingers) {
      if (f.cx !== undefined && f.cy !== undefined) {
        const knX = (f.bx + f.cx) / 2;
        const knY = (f.by + f.cy) / 2;
        ctx.beginPath();
        ctx.arc(knX, knY, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  ctx.strokeStyle = "#c49a78";
  ctx.lineWidth = 12;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-10, 14);
  ctx.lineTo(10, 14);
  ctx.stroke();

  ctx.strokeStyle = "#b08868";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-16, 13);
  ctx.lineTo(16, 13);
  ctx.stroke();

  ctx.restore();
}

// ---- renderer ----

interface AIHud {
  active: boolean;
  loading: boolean;
  paused: boolean;
  result: GestureAgentResult | null;
  correctedPanels: Set<number>;
  correctionFlash: number;
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  panels: PanelLayout[],
  step: TimelineStep,
  stepIdx: number,
  animT: number,
  aiHud?: AIHud,
) {
  const camPos: Vec3 = [CAMERA.x, CAMERA.y, CAMERA.z];

  ctx.fillStyle = "#0e0e1a";
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "#1a1a30";
  ctx.lineWidth = 1;
  for (let gx = -12; gx <= 12; gx++) {
    const p1 = projectPoint([gx, -2.1, -6], camPos, CAMERA.fov, W, H);
    const p2 = projectPoint([gx, -2.1, 4], camPos, CAMERA.fov, W, H);
    if (p1 && p2) { ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke(); }
  }
  for (let gz = -6; gz <= 4; gz++) {
    const p1 = projectPoint([-12, -2.1, gz], camPos, CAMERA.fov, W, H);
    const p2 = projectPoint([12, -2.1, gz], camPos, CAMERA.fov, W, H);
    if (p1 && p2) { ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke(); }
  }

  const grad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.22);
  grad.addColorStop(0, "rgba(80, 255, 160, 0.07)");
  grad.addColorStop(1, "rgba(80, 255, 160, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(80, 255, 160, 0.18)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 6]);
  ctx.beginPath();
  ctx.ellipse(W / 2, H / 2, W * 0.2, H * 0.28, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(80,255,160,0.3)";
  ctx.font = "9px monospace";
  ctx.textAlign = "center";
  ctx.fillText("sweet spot", W / 2, H / 2 - H * 0.28 - 5);

  const indices = [0, 1, 2];
  indices.sort((a, b) => {
    const dA = sub(panels[a].position as Vec3, camPos);
    const dB = sub(panels[b].position as Vec3, camPos);
    return dot(dB, dB) - dot(dA, dA);
  });

  for (const i of indices) {
    const panel = panels[i];
    const facing = computeFacing(panel, camPos);
    const corners3D = getPanelCorners(panel);
    const projected = corners3D.map((c) => projectPoint(c, camPos, CAMERA.fov, W, H));
    if (projected.some((p) => p === null)) continue;
    const pts = projected as [number, number, number][];

    const isFocus = i === step.focus;
    const isPredictedTarget = step.predictedTarget === i;
    const facingAway = facing > 90;
    const color = PANEL_COLORS[i];

    ctx.save();

    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let j = 1; j < 4; j++) ctx.lineTo(pts[j][0], pts[j][1]);
    ctx.closePath();

    if (facingAway) {
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = "#333";
      ctx.fill();
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = "#555";
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.globalAlpha = isFocus ? 0.22 : 0.12;
      ctx.fillStyle = color;
      ctx.fill();
      ctx.globalAlpha = 0.04;
      ctx.fillStyle = "#fff";
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    ctx.strokeStyle = facingAway ? "#444" : color;
    ctx.lineWidth = isFocus ? 3 : 1.5;
    ctx.stroke();

    if (isPredictedTarget && step.grab) {
      const pulse = 0.5 + 0.5 * Math.sin(animT * 6);
      ctx.strokeStyle = `rgba(68, 255, 136, ${0.4 + pulse * 0.4})`;
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (isFocus && !facingAway) {
      ctx.strokeStyle = "rgba(68, 255, 170, 0.35)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (!facingAway) {
      const lines = PANEL_TEXT[i];
      const readAlpha = facing < 30 ? 1 : facing < 55 ? 0.55 : 0.25;
      for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        if (!line) continue;
        const v = 0.85 - (li / lines.length) * 1.7;
        const sStart = projectPoint(panelSurfacePoint(panel, -0.85, v), camPos, CAMERA.fov, W, H);
        const sEnd = projectPoint(panelSurfacePoint(panel, 0.85, v), camPos, CAMERA.fov, W, H);
        if (!sStart || !sEnd) continue;
        const projW = Math.hypot(sEnd[0] - sStart[0], sEnd[1] - sStart[1]);
        const fontSize = Math.max(5, Math.min(13, projW / 18));
        const angle = Math.atan2(sEnd[1] - sStart[1], sEnd[0] - sStart[0]);
        ctx.save();
        ctx.translate(sStart[0], sStart[1]);
        ctx.rotate(angle);
        const isTitle = li === 0;
        ctx.font = `${isTitle ? "bold " : ""}${fontSize}px monospace`;
        ctx.globalAlpha = (isTitle ? 0.95 : 0.65) * readAlpha;
        ctx.fillStyle = isTitle ? "#fff" : "#b8c0dd";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(line, 0, 0);
        ctx.restore();
      }
    } else {
      const cx2 = (pts[0][0] + pts[2][0]) / 2;
      const cy2 = (pts[0][1] + pts[2][1]) / 2;
      ctx.fillStyle = "#ff4444";
      ctx.globalAlpha = 0.6;
      ctx.font = "bold 10px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("BACK", cx2, cy2);
    }

    if (!facingAway) {
      const bp = projectPoint(panelSurfacePoint(panel, 0.85, 0.85), camPos, CAMERA.fov, W, H);
      if (bp) {
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = facing < 30 ? "#44ff88" : facing < 55 ? "#ffaa44" : "#ff4444";
        ctx.font = "bold 8px monospace";
        ctx.textAlign = "right";
        ctx.fillText(`${facing.toFixed(0)}°`, bp[0], bp[1]);
      }
    }

    ctx.restore();
  }

  // ---- 3D Hand ----
  const handScreen = projectPoint(step.handPos, camPos, CAMERA.fov, W, H);
  if (handScreen) {
    const hx = handScreen[0];
    const hy = handScreen[1];
    const depth = handScreen[2];
    const handScale = Math.max(0.2, Math.min(1.5, 12 / depth)) * 0.4;

    if (step.grab && step.grabLabel) {
      ctx.save();

      if (step.grabSourcePanel !== undefined) {
        const srcPanel = panels[step.grabSourcePanel];
        const srcScreen = projectPoint(srcPanel.position as Vec3, camPos, CAMERA.fov, W, H);
        if (srcScreen) {
          ctx.strokeStyle = `rgba(${step.grabSourcePanel === 0 ? "255,102,136" : "68,136,255"},0.3)`;
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(hx, hy - 30 * handScale);
          ctx.lineTo(srcScreen[0], srcScreen[1]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      const cardW = 60 * handScale;
      const cardH = 36 * handScale;
      const cardX = hx - cardW / 2;
      const cardY = hy - 30 * handScale - cardH;
      const sourceColor = step.grabSourcePanel !== undefined ? PANEL_COLORS[step.grabSourcePanel] : "#ffaa44";
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = sourceColor;
      ctx.beginPath();
      ctx.roundRect(cardX, cardY, cardW, cardH, 4);
      ctx.fill();
      ctx.strokeStyle = sourceColor;
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.globalAlpha = 1;
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${Math.max(7, 9 * handScale)}px monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(step.grabLabel, hx, cardY + cardH / 2);

      ctx.restore();
    }

    if (step.gestureArrow) {
      ctx.save();
      const pulseAlpha = 0.3 + 0.3 * Math.sin(animT * 4);

      if (step.gestureArrow === "pull") {
        const focusPanel = panels[step.focus];
        const focusScreen = projectPoint(focusPanel.position as Vec3, camPos, CAMERA.fov, W, H);
        if (focusScreen) {
          ctx.strokeStyle = `rgba(68, 255, 136, ${pulseAlpha})`;
          ctx.lineWidth = 2.5;
          ctx.setLineDash([8, 6]);
          ctx.beginPath();
          ctx.moveTo(focusScreen[0], focusScreen[1]);
          const midX = (focusScreen[0] + hx) / 2;
          const midY = Math.min(focusScreen[1], hy) - 40;
          ctx.quadraticCurveTo(midX, midY, hx, hy);
          ctx.stroke();
          ctx.setLineDash([]);

          const aLen = 12;
          const aAng = Math.atan2(hy - midY, hx - midX);
          ctx.fillStyle = `rgba(68, 255, 136, ${pulseAlpha + 0.2})`;
          ctx.beginPath();
          ctx.moveTo(hx, hy);
          ctx.lineTo(hx - aLen * Math.cos(aAng - 0.4), hy - aLen * Math.sin(aAng - 0.4));
          ctx.lineTo(hx - aLen * Math.cos(aAng + 0.4), hy - aLen * Math.sin(aAng + 0.4));
          ctx.closePath();
          ctx.fill();
        }
      } else {
        ctx.strokeStyle = `rgba(255, 136, 68, ${pulseAlpha})`;
        ctx.lineWidth = 2.5;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        const targetX = W / 2;
        const targetY = H / 2;
        const midX2 = (hx + targetX) / 2;
        const midY2 = Math.min(hy, targetY) - 30;
        ctx.quadraticCurveTo(midX2, midY2, targetX, targetY);
        ctx.stroke();
        ctx.setLineDash([]);

        const aLen = 12;
        const aAng = Math.atan2(targetY - midY2, targetX - midX2);
        ctx.fillStyle = `rgba(255, 136, 68, ${pulseAlpha + 0.2})`;
        ctx.beginPath();
        ctx.moveTo(targetX, targetY);
        ctx.lineTo(targetX - aLen * Math.cos(aAng - 0.4), targetY - aLen * Math.sin(aAng - 0.4));
        ctx.lineTo(targetX - aLen * Math.cos(aAng + 0.4), targetY - aLen * Math.sin(aAng + 0.4));
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    drawHand(ctx, hx, hy, handScale, step.handPose);

    if (step.gestureLabel && step.gestureColor) {
      ctx.save();
      ctx.globalAlpha = 0.7 + 0.3 * Math.sin(animT * 3);
      ctx.fillStyle = step.gestureColor;
      ctx.font = `bold ${Math.max(10, 13 * handScale)}px monospace`;
      ctx.textAlign = "center";
      ctx.fillText(step.gestureLabel, hx, hy + 30 * handScale);
      ctx.restore();
    }
  }

  // ---- HUD ----
  ctx.save();
  ctx.globalAlpha = 1;

  ctx.fillStyle = "#fff";
  ctx.font = "bold 14px monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(step.label, 10, 10);
  ctx.font = "11px monospace";
  ctx.fillStyle = "#aaa";
  ctx.fillText(step.description, 10, 28);

  if (step.predictedTarget !== undefined) {
    const bannerY = 48;
    ctx.fillStyle = "rgba(68, 255, 136, 0.12)";
    ctx.fillRect(6, bannerY - 2, 340, 18);
    ctx.fillStyle = "#44ff88";
    ctx.font = "bold 11px monospace";
    ctx.fillText(
      `PREDICTED: drop → ${PANEL_LABELS[step.predictedTarget]} → moving to sweet spot`,
      10,
      bannerY + 10,
    );
  }

  ctx.fillStyle = "#555";
  ctx.font = "9px monospace";
  ctx.textAlign = "right";
  ctx.fillText(`step ${stepIdx + 1}/${TIMELINE.length}`, W - 8, 14);

  ctx.strokeStyle = "#333";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);

  // ---- AI Mode HUD overlay ----
  if (aiHud?.active) {
    ctx.save();
    ctx.globalAlpha = 1;

    if (aiHud.paused) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
      ctx.fillRect(W / 2 - 120, H / 2 - 14, 240, 28);
      ctx.fillStyle = "#886600";
      ctx.font = "bold 12px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("PAUSED — move mouse to resume", W / 2, H / 2);
    }

    if (aiHud.loading && !aiHud.paused) {
      const pulse = 0.4 + 0.6 * Math.abs(Math.sin(animT * 3));
      ctx.fillStyle = `rgba(100, 180, 255, ${pulse})`;
      ctx.beginPath();
      ctx.arc(W - 24, 14, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#6bb4ff";
      ctx.font = "bold 10px monospace";
      ctx.textAlign = "right";
      ctx.fillText("AI analyzing...", W - 36, 18);
    }

    if (aiHud.result) {
      const r = aiHud.result;
      const panelName = PANEL_LABELS[r.focusPanel];
      const statusY = aiHud.loading ? 36 : 14;

      ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
      ctx.fillRect(W - 440, statusY - 10, 432, 20);

      ctx.fillStyle = "#44ff88";
      ctx.font = "bold 10px monospace";
      ctx.textAlign = "right";
      ctx.fillText(
        `AI: ${r.gesture} detected → focusing ${panelName} (${r.confidence.toFixed(2)})`,
        W - 14,
        statusY + 4,
      );

      if (r.reasoning) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
        ctx.fillRect(8, H - 30, Math.min(W - 16, 600), 22);
        ctx.fillStyle = "#aac";
        ctx.font = "10px monospace";
        ctx.textAlign = "left";
        const displayText =
          r.reasoning.length > 90
            ? r.reasoning.slice(0, 87) + "..."
            : r.reasoning;
        ctx.fillText(displayText, 14, H - 15);
      }
    }

    if (aiHud.correctionFlash > 0 && aiHud.correctedPanels.size > 0) {
      const flashAlpha = aiHud.correctionFlash;
      for (const pi of aiHud.correctedPanels) {
        const panel = panels[pi];
        const corners3D = getPanelCorners(panel);
        const projected = corners3D.map((c) =>
          projectPoint(c, camPos, CAMERA.fov, W, H),
        );
        if (projected.some((p) => p === null)) continue;
        const pts = projected as [number, number, number][];

        ctx.save();
        ctx.globalAlpha = flashAlpha * 0.8;
        ctx.strokeStyle = "#ffaa00";
        ctx.lineWidth = 3;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let j = 1; j < 4; j++) ctx.lineTo(pts[j][0], pts[j][1]);
        ctx.closePath();
        ctx.stroke();

        const cx2 = (pts[0][0] + pts[2][0]) / 2;
        const cy2 = (pts[0][1] + pts[2][1]) / 2;
        ctx.fillStyle = "#ffaa00";
        ctx.globalAlpha = flashAlpha;
        ctx.font = "bold 12px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("CORRECTED", cx2, cy2 - 20);
        ctx.restore();
      }
    }

    ctx.restore();
  }

  ctx.restore();
}

// ---- component ----

type DemoMode = "scripted" | "ai";

export function LayoutAgentDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [animT, setAnimT] = useState(0);
  const animRef = useRef(0);
  const prevLayoutRef = useRef<PanelLayout[] | null>(null);

  const [mode, setMode] = useState<DemoMode>("scripted");

  const INACTIVITY_MS = 30_000;
  const [aiPaused, setAiPaused] = useState(false);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityRef = useRef(Date.now());

  const resetInactivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    setAiPaused(false);
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    inactivityTimerRef.current = setTimeout(() => {
      setAiPaused(true);
    }, INACTIVITY_MS);
  }, []);

  useEffect(() => {
    if (mode !== "ai") return;
    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"] as const;
    const handler = () => resetInactivity();
    for (const ev of events) window.addEventListener(ev, handler, { passive: true });
    resetInactivity();
    return () => {
      for (const ev of events) window.removeEventListener(ev, handler);
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    };
  }, [mode, resetInactivity]);

  const [aiFocus, setAiFocus] = useState(1);
  const [correctedPanels, setCorrectedPanels] = useState<Set<number>>(new Set());
  const [correctionFlash, setCorrectionFlash] = useState(0);
  const correctionTimerRef = useRef(0);
  const logRef = useRef<HTMLDivElement>(null);

  const step = TIMELINE[stepIdx];
  const effectiveFocus = mode === "ai" ? aiFocus : step.focus;

  const targetLayout = useMemo(
    () => computeFocusLayout(VIEWPORT.width, effectiveFocus),
    [effectiveFocus],
  );

  const [displayLayout, setDisplayLayout] = useState(targetLayout);

  const [aiCorrectionLayout, setAiCorrectionLayout] = useState<PanelLayout[] | null>(null);

  const finalTarget = aiCorrectionLayout ?? targetLayout;

  useEffect(() => {
    if (!prevLayoutRef.current) {
      prevLayoutRef.current = finalTarget;
      setDisplayLayout(finalTarget);
      return;
    }
    const from = prevLayoutRef.current;
    const to = finalTarget;
    let t = 0;
    const tick = () => {
      t = Math.min(1, t + 0.04);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayLayout(lerpLayout(from, to, eased));
      if (t < 1) {
        animRef.current = requestAnimationFrame(tick);
      } else {
        prevLayoutRef.current = to;
      }
    };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [finalTarget]);

  useEffect(() => {
    setAiCorrectionLayout(null);
  }, [effectiveFocus]);

  const agent = useLayoutAgent(mode === "scripted", targetLayout, step.focus, VIEWPORT, CAMERA);

  const gestureAgent = useGestureAgent(mode === "ai", VIEWPORT);

  useEffect(() => {
    if (mode !== "ai" || !gestureAgent.result) return;
    const r = gestureAgent.result;

    setAiFocus(r.focusPanel);

    if (r.layoutCorrections) {
      setAiCorrectionLayout(r.layoutCorrections);
      const mathLayout = computeFocusLayout(VIEWPORT.width, r.focusPanel);
      const changed = new Set<number>();
      for (let i = 0; i < 3; i++) {
        const mp = mathLayout[i];
        const cp = r.layoutCorrections[i];
        const dx = Math.abs(mp.position[0] - cp.position[0]);
        const dz = Math.abs(mp.position[2] - cp.position[2]);
        const dr = Math.abs(mp.rotation[1] - cp.rotation[1]);
        if (dx > 0.1 || dz > 0.1 || dr > 0.02) changed.add(i);
      }
      setCorrectedPanels(changed);
      setCorrectionFlash(1);
      cancelAnimationFrame(correctionTimerRef.current);
      let flash = 1;
      const fadeFlash = () => {
        flash -= 0.02;
        if (flash <= 0) {
          setCorrectionFlash(0);
          setCorrectedPanels(new Set());
          return;
        }
        setCorrectionFlash(flash);
        correctionTimerRef.current = requestAnimationFrame(fadeFlash);
      };
      correctionTimerRef.current = requestAnimationFrame(fadeFlash);
    } else {
      setAiCorrectionLayout(null);
    }
  }, [gestureAgent.result, mode]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [gestureAgent.history.length]);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      setAnimT((prev) => prev + 0.016);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const aiHud: AIHud = useMemo(
    () => ({
      active: mode === "ai",
      loading: gestureAgent.loading,
      paused: aiPaused,
      result: gestureAgent.result,
      correctedPanels,
      correctionFlash,
    }),
    [mode, gestureAgent.loading, aiPaused, gestureAgent.result, correctedPanels, correctionFlash],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawFrame(ctx, canvas.width, canvas.height, displayLayout, step, stepIdx, animT, aiHud);
  }, [displayLayout, step, stepIdx, animT, aiHud]);

  useEffect(() => {
    if (!playing || mode === "ai") return;
    const timer = setInterval(() => {
      setStepIdx((prev) => {
        const next = prev + 1;
        if (next >= TIMELINE.length) {
          setPlaying(false);
          return prev;
        }
        return next;
      });
    }, 2200);
    return () => clearInterval(timer);
  }, [playing, mode]);

  const aiCycleRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const aiInitializedRef = useRef(false);
  useEffect(() => {
    if (mode !== "ai" || aiPaused) {
      if (aiCycleRef.current) {
        clearInterval(aiCycleRef.current);
        aiCycleRef.current = null;
      }
      return;
    }

    if (!aiInitializedRef.current) {
      setStepIdx(0);
      setAiFocus(1);
      setAiCorrectionLayout(null);
      aiInitializedRef.current = true;

      setTimeout(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
        const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, "");
        gestureAgent.analyze(base64);
      }, 500);
    }

    const cycle = () => {
      setStepIdx((prev) => {
        const next = (prev + 1) % TIMELINE.length;
        setTimeout(() => {
          const canvas = canvasRef.current;
          if (!canvas) return;
          const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
          const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, "");
          gestureAgent.analyze(base64);
        }, 200);
        return next;
      });
    };

    aiCycleRef.current = setInterval(cycle, 4000);
    return () => {
      if (aiCycleRef.current) {
        clearInterval(aiCycleRef.current);
        aiCycleRef.current = null;
      }
    };
  }, [mode, aiPaused]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (mode !== "ai") aiInitializedRef.current = false;
  }, [mode]);

  const handleValidate = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
    const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, "");
    await agent.call(base64);
  }, [agent]);

  const canvasCb = useCallback(
    (node: HTMLCanvasElement | null) => {
      if (node) {
        (canvasRef as React.MutableRefObject<HTMLCanvasElement>).current = node;
      }
    },
    [],
  );

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>Layout Agent — Gesture-Driven Intent Prediction</h2>
        <p style={styles.subtitle}>
          The UI anticipates your intent. Reach, grab, pull, push — the system predicts
          your target and slides it to the sweet spot. Zero arm travel.
        </p>
      </div>

      <div style={styles.main}>
        <div style={styles.timelineBar}>
          <div style={styles.modeToggle}>
            <button
              onClick={() => setMode("scripted")}
              style={{
                ...styles.modeBtn,
                ...(mode === "scripted" ? styles.modeBtnActive : {}),
              }}
            >
              Scripted
            </button>
            <button
              onClick={() => setMode("ai")}
              style={{
                ...styles.modeBtn,
                ...(mode === "ai" ? styles.modeBtnActiveAI : {}),
              }}
            >
              AI
            </button>
          </div>

          <div style={{ width: 1, height: 20, background: "#333", margin: "0 0.25rem" }} />

          {mode === "scripted" && (
            <>
              <button
                onClick={() => { setPlaying(!playing); if (!playing && stepIdx >= TIMELINE.length - 1) setStepIdx(0); }}
                style={{ ...styles.btn, ...styles.btnPrimary }}
              >
                {playing ? "Pause" : stepIdx >= TIMELINE.length - 1 ? "Replay" : "Play"}
              </button>
              {TIMELINE.map((s, i) => (
                <button
                  key={i}
                  onClick={() => { setStepIdx(i); setPlaying(false); }}
                  style={{
                    ...styles.stepBtn,
                    background: i === stepIdx ? "#334" : i < stepIdx ? "#222" : "transparent",
                    color: i === stepIdx ? "#fff" : i < stepIdx ? "#666" : "#555",
                    borderColor: i === stepIdx ? "#556" : "#2a2a3e",
                  }}
                >
                  {s.label.split(".")[0]}
                </button>
              ))}
            </>
          )}

          {mode === "ai" && (
            <span style={{ fontSize: "0.75rem", color: aiPaused ? "#886600" : "#6bb4ff" }}>
              {aiPaused
                ? "Paused — inactive. Move mouse to resume."
                : "Auto-cycling — Gemini recognizes gestures and directs layout"}
            </span>
          )}
        </div>

        <div style={styles.progressBar}>
          <div
            style={{
              ...styles.progressFill,
              width: `${((stepIdx + 1) / TIMELINE.length) * 100}%`,
              background: mode === "ai"
                ? "linear-gradient(90deg, #6bb4ff, #aa66ff)"
                : "linear-gradient(90deg, #4488ff, #44ff88)",
            }}
          />
        </div>

        <div style={styles.canvasWrap}>
          <canvas ref={canvasCb} width={900} height={520} style={styles.canvas} />
        </div>

        <div style={styles.controls}>
          {mode === "scripted" && (
            <>
              <button
                onClick={() => setStepIdx(Math.max(0, stepIdx - 1))}
                disabled={stepIdx === 0}
                style={{ ...styles.btn, ...(stepIdx === 0 ? styles.btnDisabled : styles.btnMuted) }}
              >
                ← Prev
              </button>
              <button
                onClick={() => setStepIdx(Math.min(TIMELINE.length - 1, stepIdx + 1))}
                disabled={stepIdx >= TIMELINE.length - 1}
                style={{ ...styles.btn, ...(stepIdx >= TIMELINE.length - 1 ? styles.btnDisabled : styles.btnMuted) }}
              >
                Next →
              </button>
              <div style={{ flex: 1 }} />
              <button
                onClick={handleValidate}
                disabled={agent.loading}
                style={{ ...styles.btn, ...(agent.loading ? styles.btnDisabled : styles.btnAccent) }}
              >
                {agent.loading ? "Validating..." : "Validate with Gemini"}
              </button>
              {agent.error && <span style={{ color: "#ff6666", fontSize: "0.8rem" }}>{agent.error}</span>}
              {agent.layout && !agent.error && (
                <span style={{ color: "#44ff88", fontSize: "0.8rem" }}>Agent validated</span>
              )}
            </>
          )}
          {mode === "ai" && (
            <>
              <span style={{ fontSize: "0.75rem", color: "#888" }}>
                Step {stepIdx + 1}/{TIMELINE.length}: {step.label}
              </span>
              <div style={{ flex: 1 }} />
              {gestureAgent.loading && (
                <span style={{ fontSize: "0.75rem", color: "#6bb4ff" }}>Analyzing...</span>
              )}
              {gestureAgent.error && (
                <span style={{ color: "#ff6666", fontSize: "0.75rem" }}>{gestureAgent.error}</span>
              )}
              {gestureAgent.result && !gestureAgent.loading && (
                <span style={{ fontSize: "0.75rem", color: "#44ff88" }}>
                  {gestureAgent.result.gesture} → {PANEL_LABELS[gestureAgent.result.focusPanel]} ({gestureAgent.result.confidence.toFixed(2)})
                </span>
              )}
            </>
          )}
        </div>

        <div style={styles.explainer}>
          <div style={styles.explainerCol}>
            <h3 style={styles.sectionTitle}>How it works</h3>
            <div style={styles.explainerText}>
              <strong>Math layer (&lt;1ms)</strong> — Detects gaze/grab/gesture → predicts drop target →
              reflows panels instantly. The focus panel slides to the sweet spot.
              <br /><br />
              <strong>Gestures</strong> — Reach to browse, grab to pick up, pull to bring a panel
              closer, push to return layout. Each gesture triggers predictive layout.
              <br /><br />
              <strong>Agent layer (1-3s)</strong> — Screenshots the viewport → Gemini validates
              text readability, occlusion, comfort → corrects if needed. Non-blocking.
              {mode === "ai" && (
                <>
                  <br /><br />
                  <strong style={{ color: "#aa88ff" }}>AI Mode active</strong> — Gemini sees the canvas,
                  recognizes hand gestures, and decides which panel to focus. Layout is emergent, not scripted.
                </>
              )}
            </div>
          </div>
          <div style={styles.explainerCol}>
            {mode === "scripted" ? (
              <>
                <h3 style={styles.sectionTitle}>Current step: {step.label}</h3>
                <pre style={styles.json}>
                  {JSON.stringify(
                    {
                      focus: PANEL_LABELS[step.focus],
                      handPose: step.handPose,
                      grab: step.grab,
                      gesture: step.gestureArrow ?? null,
                      predictedTarget: step.predictedTarget !== undefined
                        ? PANEL_LABELS[step.predictedTarget]
                        : null,
                      layout: targetLayout.map((p, i) => ({
                        panel: PANEL_LABELS[i],
                        x: +p.position[0].toFixed(2),
                        z: +p.position[2].toFixed(2),
                        rotY: +p.rotation[1].toFixed(3),
                      })),
                    },
                    null,
                    2,
                  )}
                </pre>
              </>
            ) : (
              <>
                <h3 style={styles.sectionTitle}>AI Decision Log</h3>
                <div ref={logRef} style={styles.decisionLog}>
                  {gestureAgent.history.length === 0 && (
                    <div style={{ color: "#555", fontSize: "0.7rem", padding: "0.5rem" }}>
                      Waiting for first analysis...
                    </div>
                  )}
                  {gestureAgent.history.map((entry, i) => (
                    <div key={i} style={styles.logEntry}>
                      <div style={styles.logHeader}>
                        <span style={styles.logGesture}>{entry.gesture}</span>
                        <span style={styles.logTarget}>
                          → {PANEL_LABELS[entry.focusPanel]}
                        </span>
                        <span style={styles.logConfidence}>
                          {(entry.confidence * 100).toFixed(0)}%
                        </span>
                        {entry.layoutCorrections && (
                          <span style={styles.logCorrected}>CORRECTED</span>
                        )}
                      </div>
                      <div style={styles.logReasoning}>{entry.reasoning}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {mode === "scripted" && agent.lastResponse && (
          <div>
            <h3 style={styles.sectionTitle}>Agent response</h3>
            <pre style={styles.jsonSmall}>{agent.lastResponse}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    background: "#0d0d1a",
    color: "#e0e0f0",
    fontFamily: "'Inter', system-ui, sans-serif",
    padding: "1.5rem",
  },
  header: { marginBottom: "1rem" },
  title: { margin: 0, fontSize: "1.5rem", color: "#fff" },
  subtitle: { margin: "0.25rem 0 0", fontSize: "0.85rem", color: "#888" },
  main: { maxWidth: 960 },
  modeToggle: {
    display: "flex",
    borderRadius: 6,
    overflow: "hidden",
    border: "1px solid #333",
    flexShrink: 0,
  },
  modeBtn: {
    padding: "0.25rem 0.65rem",
    fontSize: "0.72rem",
    fontWeight: 700,
    border: "none",
    cursor: "pointer",
    background: "transparent",
    color: "#666",
    transition: "all 0.15s",
  },
  modeBtnActive: {
    background: "#2a3a5a",
    color: "#4488ff",
  },
  modeBtnActiveAI: {
    background: "#3a2a5a",
    color: "#aa88ff",
  },
  timelineBar: {
    display: "flex",
    gap: "0.35rem",
    alignItems: "center",
    marginBottom: "0.5rem",
    flexWrap: "wrap" as const,
  },
  stepBtn: {
    padding: "0.25rem 0.5rem",
    borderRadius: 4,
    border: "1px solid #2a2a3e",
    fontSize: "0.7rem",
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.15s",
  },
  progressBar: {
    height: 3,
    background: "#222",
    borderRadius: 2,
    marginBottom: "0.6rem",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    background: "linear-gradient(90deg, #4488ff, #44ff88)",
    borderRadius: 2,
    transition: "width 0.3s ease",
  },
  canvasWrap: {
    border: "1px solid #333",
    borderRadius: 8,
    overflow: "hidden",
    marginBottom: "0.6rem",
  },
  canvas: { display: "block", width: "100%", height: "auto" },
  controls: {
    display: "flex",
    gap: "0.5rem",
    alignItems: "center",
    marginBottom: "1rem",
  },
  btn: {
    padding: "0.4rem 0.8rem",
    borderRadius: 6,
    border: "none",
    fontSize: "0.8rem",
    fontWeight: 600,
    cursor: "pointer",
    flexShrink: 0,
  },
  btnPrimary: { background: "#4488ff", color: "#fff" },
  btnAccent: { background: "#2a5a4a", color: "#44ff88" },
  btnMuted: { background: "#252535", color: "#aaa" },
  btnDisabled: { background: "#1a1a24", color: "#444", cursor: "not-allowed" },
  explainer: { display: "flex", gap: "1rem", marginBottom: "1rem" },
  explainerCol: { flex: 1, minWidth: 0 },
  explainerText: {
    fontSize: "0.82rem",
    color: "#99a",
    lineHeight: 1.6,
  },
  sectionTitle: { fontSize: "0.8rem", color: "#888", margin: "0 0 0.4rem" },
  json: {
    background: "#111",
    border: "1px solid #2a2a3e",
    borderRadius: 6,
    padding: "0.6rem",
    fontSize: "0.68rem",
    color: "#aaddff",
    overflow: "auto",
    maxHeight: 220,
    margin: 0,
  },
  jsonSmall: {
    background: "#111",
    border: "1px solid #2a2a3e",
    borderRadius: 6,
    padding: "0.6rem",
    fontSize: "0.68rem",
    color: "#aaffaa",
    overflow: "auto",
    maxHeight: 100,
    margin: 0,
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-all" as const,
  },
  decisionLog: {
    background: "#111",
    border: "1px solid #2a2a3e",
    borderRadius: 6,
    padding: "0.4rem",
    maxHeight: 220,
    overflow: "auto",
    margin: 0,
  },
  logEntry: {
    padding: "0.35rem 0.4rem",
    borderBottom: "1px solid #1a1a2e",
  },
  logHeader: {
    display: "flex",
    gap: "0.4rem",
    alignItems: "center",
    fontSize: "0.7rem",
    fontWeight: 600,
  },
  logGesture: {
    color: "#aa88ff",
    textTransform: "uppercase" as const,
  },
  logTarget: {
    color: "#6bb4ff",
  },
  logConfidence: {
    color: "#44ff88",
    fontSize: "0.65rem",
    marginLeft: "auto",
  },
  logCorrected: {
    color: "#ffaa00",
    fontSize: "0.6rem",
    fontWeight: 700,
    padding: "0 0.3rem",
    border: "1px solid #ffaa00",
    borderRadius: 3,
  },
  logReasoning: {
    fontSize: "0.65rem",
    color: "#777",
    marginTop: "0.15rem",
    lineHeight: 1.4,
  },
};
