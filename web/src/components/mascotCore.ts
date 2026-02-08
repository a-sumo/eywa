/**
 * mascotCore.ts - Platform-agnostic mascot data, colors, and frame computation.
 * Shared by web (EywaMascot.tsx), VS Code extension, and referenced by Python ports.
 */

/* ── Types ── */

export type Mood = "happy" | "okay" | "sad" | "thinking" | "sleeping";

export interface MoodParams {
  pulseFreq: number;
  contractDepth: number;
  bobAmp: number;
  waveAmp: number;
  driftSpeed: number;
  driftAmp: number;
  blinkMin: number;
  blinkMax: number;
  blinkDur: number;
  eyeSquint: number;
  yRotSpeed: number;
  arcMult: number;
  slouch: number;
}

/* ── Grid ── */

export const GW = 32;
export const GH = 32;

/* ── Colors (matching Eywa logo aurora palette) ── */

export const C_CORE = "#eef0ff";
export const C_ARM_UP = "#7946FF";
export const C_ARM_DOWN = "#393CF5";
export const C_ARM_LEFT = "#E72B76";
export const C_ARM_RIGHT = "#15D1FF";
export const C_NUB = "#15D1FF";
export const C_TENDRIL = "#5ec8e6";
export const C_EYE = "#0a0a12";

/* ── Mood parameters ── */

export const MOODS: Record<Mood, MoodParams> = {
  okay: {
    pulseFreq: 0.5, contractDepth: 0.3, bobAmp: 1.5,
    waveAmp: 3.0,
    driftSpeed: 0.12, driftAmp: 0.6,
    blinkMin: 3000, blinkMax: 5000, blinkDur: 150,
    eyeSquint: 0, yRotSpeed: 0, arcMult: 1.0, slouch: 0,
  },
  happy: {
    pulseFreq: 0.8, contractDepth: 0.4, bobAmp: 2.5,
    waveAmp: 4.5,
    driftSpeed: 0.25, driftAmp: 1.0,
    blinkMin: 1200, blinkMax: 2500, blinkDur: 80,
    eyeSquint: 0, yRotSpeed: 0.6, arcMult: 0.9, slouch: 0,
  },
  sad: {
    pulseFreq: 0.25, contractDepth: 0.15, bobAmp: 0.8,
    waveAmp: 1.5,
    driftSpeed: 0.08, driftAmp: 0.3,
    blinkMin: 5000, blinkMax: 9000, blinkDur: 350,
    eyeSquint: 0.4, yRotSpeed: 0, arcMult: 1.35, slouch: 3.0,
  },
  thinking: {
    pulseFreq: 0.4, contractDepth: 0.2, bobAmp: 1.2,
    waveAmp: 2.0,
    driftSpeed: 0, driftAmp: 0,
    blinkMin: 4000, blinkMax: 7000, blinkDur: 200,
    eyeSquint: 0, yRotSpeed: 0, arcMult: 1.0, slouch: 0,
  },
  sleeping: {
    pulseFreq: 0.15, contractDepth: 0.1, bobAmp: 0.4,
    waveAmp: 1.0,
    driftSpeed: 0.06, driftAmp: 0.4,
    blinkMin: 0, blinkMax: 0, blinkDur: 0,
    eyeSquint: 1, yRotSpeed: 0, arcMult: 1.1, slouch: 0,
  },
};

/* ── Bell pulse (asymmetric contraction cycle) ──
   Fast contraction (~25%), hold (~10%), drop + settle (~65%).
   Returns 0..1 where 1 = peak contraction. */

export const DUTY_UP = 0.25;
export const DUTY_HOLD = 0.10;
export const DUTY_DROP = 0.30;

export function bellPulse(time: number, freq: number): number {
  const phase = ((time * freq) % 1 + 1) % 1;
  if (phase < DUTY_UP) {
    const u = phase / DUTY_UP;
    return Math.sin(u * Math.PI * 0.5);
  }
  if (phase < DUTY_UP + DUTY_HOLD) {
    return 1;
  }
  const dropStart = DUTY_UP + DUTY_HOLD;
  if (phase < dropStart + DUTY_DROP) {
    const u = (phase - dropStart) / DUTY_DROP;
    return 1 - u * u;
  }
  return 0;
}

export function bellPhase(time: number, freq: number): number {
  return ((time * freq) % 1 + 1) % 1;
}

/* ── Tendril constants ── */

export const TOTAL_ARC = Math.PI * 1.1;
export const TENDRIL_SEGS = 28;
export const TENDRIL_SEG_LEN = 0.82;
export const NUM_TENDRILS = 8;

/* ── Pixel buffer ── */

export interface Px { x: number; y: number; color: string }

export class PixelBuf {
  private map = new Map<number, Px>();
  set(x: number, y: number, color: string) {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || ix >= GW || iy < 0 || iy >= GH) return;
    this.map.set(iy * GW + ix, { x: ix, y: iy, color });
  }
  toArray(): Px[] { return Array.from(this.map.values()); }

  ellipse(cx: number, cy: number, rx: number, ry: number, color: string) {
    const x0 = Math.floor(cx - rx);
    const x1 = Math.ceil(cx + rx);
    const y0 = Math.floor(cy - ry);
    const y1 = Math.ceil(cy + ry);
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const lx = (px + 0.5 - cx) / rx;
        const ly = (py + 0.5 - cy) / ry;
        if (lx * lx + ly * ly <= 1) this.set(px, py, color);
      }
    }
  }

  bead(cx: number, cy: number, r: number, color: string) {
    const ir = Math.max(0, Math.ceil(r));
    const rcx = Math.round(cx);
    const rcy = Math.round(cy);
    for (let dy = -ir; dy <= ir; dy++) {
      for (let dx = -ir; dx <= ir; dx++) {
        if (dx * dx + dy * dy <= r * r + 0.5) {
          this.set(rcx + dx, rcy + dy, color);
        }
      }
    }
  }
}

/* ── Body pixel array ──
   [x-offset-from-15, dy-from-center, color]
   The body is a tapered cross matching the Eywa logo. */

const U = C_ARM_UP, D = C_ARM_DOWN, L = C_ARM_LEFT, R = C_ARM_RIGHT;
const O = C_CORE, N = C_NUB;

export const BODY_PIXELS: [number, number, string][] = [
  // top nub
  [15,-6,N],[16,-6,N],
  // up arm tip (2px)
  [15,-5,U],[16,-5,U],
  // up arm base (4px)
  [14,-4,U],[15,-4,U],[16,-4,U],[17,-4,U],
  [14,-3,U],[15,-3,U],[16,-3,U],[17,-3,U],
  // cross bar top (narrow: 2+4+2)
  [12,-2,L],[13,-2,L],[14,-2,O],[15,-2,O],[16,-2,O],[17,-2,O],[18,-2,R],[19,-2,R],
  // cross bar wide (3+4+3)
  [11,-1,L],[12,-1,L],[13,-1,L],[14,-1,O],[15,-1,O],[16,-1,O],[17,-1,O],[18,-1,R],[19,-1,R],[20,-1,R],
  [11, 0,L],[12, 0,L],[13, 0,L],[14, 0,O],[15, 0,O],[16, 0,O],[17, 0,O],[18, 0,R],[19, 0,R],[20, 0,R],
  // cross bar bottom (narrow: 2+4+2)
  [12,+1,L],[13,+1,L],[14,+1,O],[15,+1,O],[16,+1,O],[17,+1,O],[18,+1,R],[19,+1,R],
  // down arm base (4px)
  [14,+2,D],[15,+2,D],[16,+2,D],[17,+2,D],
  [14,+3,D],[15,+3,D],[16,+3,D],[17,+3,D],
  // down arm tip (2px)
  [15,+4,D],[16,+4,D],
  // bottom nub
  [15,+5,N],[16,+5,N],
];

/* ── Compute one frame ──
   3D model: one arc profile rotated around Y axis, projected to 2D.
   Wave is propulsive (in the profile plane), all tendrils in sync. */

export function computeFrame(time: number, mood: Mood, blinking: boolean): Px[] {
  const p = MOODS[mood];
  const buf = new PixelBuf();

  const phase = bellPhase(time, p.pulseFreq);
  const contract = bellPulse(time, p.pulseFreq);
  const bob = contract * p.bobAmp;
  const drift = Math.sin(time * p.driftSpeed * Math.PI * 2) * p.driftAmp;

  const bx = 15.5;
  const by = 18 - bob + drift;

  const waveT = phase * Math.PI * 2;
  const tendrilTop = by - 6;

  // Build tendril profile in (r, h) with propulsive wave
  const arc = TOTAL_ARC * p.arcMult;
  const waveR: number[] = [0];
  const waveH: number[] = [0];

  {
    let r = 0, h = 0;
    for (let s = 0; s < TENDRIL_SEGS; s++) {
      const t = s / (TENDRIL_SEGS - 1);
      const bend = Math.pow(t, 1.3);
      const arcAngle = Math.PI / 2 - arc * bend;
      const contractPush = contract * 0.15 * t;
      const angle = arcAngle - contractPush;

      r += Math.cos(angle) * TENDRIL_SEG_LEN;
      h += Math.sin(angle) * TENDRIL_SEG_LEN;

      const flex = t * t * t;
      const wave = Math.sin(waveT - 2.5 * Math.PI * t) * p.waveAmp * flex;

      const perpR = -Math.sin(angle);
      const perpH = Math.cos(angle);

      waveR.push(r + wave * perpR);
      waveH.push(h + wave * perpH);
    }
  }

  // Project tendrils to 2D
  const yRot = time * p.yRotSpeed;
  for (let ti = 0; ti < NUM_TENDRILS; ti++) {
    const theta = (ti / NUM_TENDRILS) * Math.PI * 2 + yRot;

    for (let s = 0; s < TENDRIL_SEGS; s++) {
      const screenX = bx + waveR[s + 1] * Math.cos(theta);
      let screenY = tendrilTop - waveH[s + 1];

      if (p.slouch > 0) {
        const sagT = (s + 1) / TENDRIL_SEGS;
        screenY += p.slouch * Math.abs(Math.sin(theta)) * sagT * sagT;
      }

      buf.set(Math.round(screenX), Math.round(screenY), C_TENDRIL);
    }
  }

  // Body
  const byR = Math.round(by);
  for (const [x, dy, color] of BODY_PIXELS) buf.set(x, byR + dy, color);

  // Eyes
  if (mood === "sleeping") {
    buf.set(14, byR - 1, C_EYE);
    buf.set(17, byR - 1, C_EYE);
  } else if (!blinking) {
    if (p.eyeSquint > 0.3) {
      buf.set(14, byR - 1, C_EYE); buf.set(13, byR - 1, C_EYE);
      buf.set(17, byR - 1, C_EYE); buf.set(18, byR - 1, C_EYE);
    } else {
      buf.set(14, byR - 1, C_EYE); buf.set(14, byR, C_EYE);
      buf.set(17, byR - 1, C_EYE); buf.set(17, byR, C_EYE);
    }
  }

  // Thinking bubble
  if (mood === "thinking") {
    const bobble = Math.sin(time * 2.0) * 0.4;
    buf.set(20, byR - 5, N);
    buf.set(21, Math.round(byR - 7 + bobble), N);
    buf.set(22, Math.round(byR - 7 + bobble), N);
    const cy = Math.round(byR - 10 + bobble);
    buf.set(22, cy, N); buf.set(23, cy, N); buf.set(24, cy, N);
    buf.set(22, cy-1, N); buf.set(23, cy-1, N); buf.set(24, cy-1, N);
    buf.set(23, cy-2, N);
  }

  return buf.toArray();
}
