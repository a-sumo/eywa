import {
  AbsoluteFill,
  OffthreadVideo,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from "remotion";
import { DEMO_CONFIG, type Segment, type PipEmphasis } from "./config";

const { fps, segments, pip, transitionDuration, emphasisTransitionDuration, glow, landingVideoDuration } =
  DEMO_CONFIG;
const transFrames = Math.round(transitionDuration * fps);
const emphTransFrames = Math.round(emphasisTransitionDuration * fps);

function getPipSize(emphasis: PipEmphasis) {
  return pip[emphasis] || pip.medium;
}

/** Find the active segment and its index for a given frame. */
function getSegment(frame: number): { seg: Segment; idx: number } {
  const sec = frame / fps;
  for (let i = 0; i < segments.length; i++) {
    if (sec >= segments[i].start && sec < segments[i].end) {
      return { seg: segments[i], idx: i };
    }
  }
  return { seg: segments[segments.length - 1], idx: segments.length - 1 };
}

/**
 * "pip mix": 0 = founder full screen, 1 = founder in PIP (demo or landing behind).
 * Smoothly transitions at segment boundaries.
 */
function getPipMix(frame: number): number {
  const { seg, idx } = getSegment(frame);
  const target = seg.type === "founder" ? 0 : 1;
  const segStartFrame = Math.round(seg.start * fps);
  const frameInSeg = frame - segStartFrame;

  if (frameInSeg >= transFrames || idx === 0) return target;

  const prev = segments[idx - 1];
  const prevTarget = prev.type === "founder" ? 0 : 1;

  return interpolate(frameInSeg, [0, transFrames], [prevTarget, target], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

/** Get PIP dimensions, interpolating between emphasis levels at segment boundaries. */
function getPipDimensions(frame: number): { w: number; h: number } {
  const { seg, idx } = getSegment(frame);
  const emph = seg.type !== "founder" ? seg.emphasis || "medium" : "medium";
  const target = getPipSize(emph);
  const segStartFrame = Math.round(seg.start * fps);
  const frameInSeg = frame - segStartFrame;

  if (idx === 0 || frameInSeg >= emphTransFrames) {
    return { w: target.width, h: target.height };
  }

  const prev = segments[idx - 1];
  const prevEmph = prev.type !== "founder" ? prev.emphasis || "medium" : "medium";
  const prevSize = getPipSize(prevEmph);

  return {
    w: interpolate(frameInSeg, [0, emphTransFrames], [prevSize.width, target.width], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
    h: interpolate(frameInSeg, [0, emphTransFrames], [prevSize.height, target.height], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  };
}

/**
 * Background video opacities. Returns how visible each background video should be.
 * During transitions between demo and landing, one fades out while the other fades in.
 */
function getBackgroundOpacities(frame: number): { demo: number; landing: number } {
  const { seg, idx } = getSegment(frame);
  const segStartFrame = Math.round(seg.start * fps);
  const frameInSeg = frame - segStartFrame;
  const isTransitioning = idx > 0 && frameInSeg < transFrames;

  // Current targets
  let demoTarget = seg.type === "demo" ? 1 : 0;
  let landingTarget = seg.type === "landing" ? 1 : 0;

  if (!isTransitioning) {
    return { demo: demoTarget, landing: landingTarget };
  }

  // Previous targets
  const prev = segments[idx - 1];
  const demoPrev = prev.type === "demo" ? 1 : 0;
  const landingPrev = prev.type === "landing" ? 1 : 0;

  return {
    demo: interpolate(frameInSeg, [0, transFrames], [demoPrev, demoTarget], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
    landing: interpolate(frameInSeg, [0, transFrames], [landingPrev, landingTarget], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  };
}

/** Get demo video startFrom for current or most recent demo segment. */
function getDemoStartFrom(frame: number): number {
  const sec = frame / fps;
  for (let i = segments.length - 1; i >= 0; i--) {
    if (sec >= segments[i].start && segments[i].type === "demo") {
      return Math.round((segments[i].demoStart || 0) * fps);
    }
  }
  return 0;
}

/**
 * Get landing video startFrom, looping the hero clip.
 * The hero clip is short (5s), so we loop it by using modulo on elapsed time.
 */
function getLandingStartFrom(frame: number): number {
  const sec = frame / fps;
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (sec >= seg.start && seg.type === "landing") {
      const elapsed = sec - seg.start;
      const loopedTime = elapsed % landingVideoDuration;
      return Math.round(loopedTime * fps);
    }
  }
  return 0;
}

/** Aurora glow color, cycling through the palette. */
function getGlowColor(frame: number): string {
  if (!glow.enabled) return "transparent";

  const sec = frame / fps;
  const cycle = (sec % glow.period) / glow.period;
  const colorCount = glow.colors.length;
  const ci = cycle * colorCount;
  const i = Math.floor(ci) % colorCount;
  const next = (i + 1) % colorCount;
  const t = ci - Math.floor(ci);

  const parse = (c: string) => {
    const m = c.match(/[\d.]+/g);
    return m ? m.map(Number) : [0, 0, 0, 0];
  };

  const c1 = parse(glow.colors[i]);
  const c2 = parse(glow.colors[next]);

  return `rgba(${Math.round(c1[0] + (c2[0] - c1[0]) * t)},${Math.round(
    c1[1] + (c2[1] - c1[1]) * t
  )},${Math.round(c1[2] + (c2[2] - c1[2]) * t)},${(
    c1[3] +
    (c2[3] - c1[3]) * t
  ).toFixed(2)})`;
}

export const EywaDemo: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const mix = getPipMix(frame);
  const { w: pipW, h: pipH } = getPipDimensions(frame);
  const { demo: demoOpacity, landing: landingOpacity } = getBackgroundOpacities(frame);
  const demoStartFrom = getDemoStartFrom(frame);
  const landingStartFrom = getLandingStartFrom(frame);
  const glowColor = getGlowColor(frame);

  // Founder layout: full screen (mix=0) to PIP corner (mix=1)
  const founderWidth = interpolate(mix, [0, 1], [width, pipW]);
  const founderHeight = interpolate(mix, [0, 1], [height, pipH]);
  const founderBorderRadius = interpolate(mix, [0, 1], [0, pip.borderRadius]);

  const pipX =
    pip.position === "bottom-right" || pip.position === "top-right"
      ? width - pipW - pip.margin
      : pip.margin;
  const pipY =
    pip.position === "bottom-right" || pip.position === "bottom-left"
      ? height - pipH - pip.margin
      : pip.margin;

  const founderX = interpolate(mix, [0, 1], [0, pipX]);
  const founderY = interpolate(mix, [0, 1], [0, pipY]);

  // Glow + shadow only in PIP mode
  const glowIntensity = interpolate(mix, [0.5, 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const shadowOpacity = interpolate(mix, [0.5, 1], [0, 0.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const darkShadow = `0 4px 24px rgba(0,0,0,${shadowOpacity})`;
  const auroraShadow =
    glowIntensity > 0
      ? `, 0 0 ${20 * glowIntensity}px ${glowColor}, 0 0 ${40 * glowIntensity}px ${glowColor}`
      : "";

  const borderColor =
    glowIntensity > 0
      ? glowColor.replace(/[\d.]+\)$/, `${(0.3 * glowIntensity).toFixed(2)})`)
      : "rgba(255,255,255,0)";

  return (
    <AbsoluteFill style={{ backgroundColor: "#0a0a0f" }}>
      {/* Landing page video: always mounted, opacity controlled */}
      <AbsoluteFill style={{ opacity: landingOpacity }}>
        <OffthreadVideo
          src={staticFile(DEMO_CONFIG.landingVideo)}
          startFrom={landingStartFrom}
          muted
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </AbsoluteFill>

      {/* Demo video: always mounted, opacity controlled */}
      <AbsoluteFill style={{ opacity: demoOpacity }}>
        <OffthreadVideo
          src={staticFile(DEMO_CONFIG.demoVideo)}
          startFrom={demoStartFrom}
          muted
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </AbsoluteFill>

      {/* Founder video: always mounted, animates size + position */}
      <div
        style={{
          position: "absolute",
          left: founderX,
          top: founderY,
          width: founderWidth,
          height: founderHeight,
          borderRadius: founderBorderRadius,
          overflow: "hidden",
          boxShadow: darkShadow + auroraShadow,
          border: `2px solid ${borderColor}`,
          zIndex: 10,
        }}
      >
        <OffthreadVideo
          src={staticFile(DEMO_CONFIG.founderVideo)}
          volume={1}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>
    </AbsoluteFill>
  );
};
