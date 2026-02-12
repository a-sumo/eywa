import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  interpolate,
  spring,
  useVideoConfig,
  staticFile,
  Video,
  Img,
} from "remotion";

const AURORA_BG = "#0a0a0f";
const AURORA_PURPLE = "#7c3aed";
const AURORA_PINK = "#ec4899";
const AURORA_CYAN = "#06b6d4";

const GlowText: React.FC<{
  children: string;
  fontSize?: number;
  color?: string;
  delay?: number;
}> = ({ children, fontSize = 64, color = "#fff", delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const opacity = spring({ frame: frame - delay, fps, config: { damping: 20 } });
  const y = interpolate(frame - delay, [0, 15], [30, 0], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  return (
    <div
      style={{
        fontSize,
        fontWeight: 700,
        color,
        opacity,
        transform: `translateY(${y}px)`,
        textShadow: `0 0 40px ${color}44, 0 0 80px ${color}22`,
        fontFamily: "SF Pro Display, system-ui, sans-serif",
        lineHeight: 1.2,
      }}
    >
      {children}
    </div>
  );
};

const StatCounter: React.FC<{
  value: number;
  label: string;
  delay?: number;
}> = ({ value, label, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 30, stiffness: 80 },
  });

  const displayValue = Math.round(value * progress);

  return (
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          fontSize: 96,
          fontWeight: 800,
          color: AURORA_CYAN,
          fontFamily: "SF Mono, monospace",
          textShadow: `0 0 30px ${AURORA_CYAN}66`,
        }}
      >
        {displayValue}
      </div>
      <div
        style={{
          fontSize: 28,
          color: "#ffffff88",
          fontFamily: "SF Pro Display, system-ui, sans-serif",
          marginTop: 8,
        }}
      >
        {label}
      </div>
    </div>
  );
};

// Section 1: Hook (0-3s, frames 0-90)
const Hook: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      style={{
        background: AURORA_BG,
        justifyContent: "center",
        alignItems: "center",
        padding: 60,
      }}
    >
      <GlowText fontSize={52} color={AURORA_PINK}>
        12 Claude tabs open.
      </GlowText>
      <div style={{ height: 40 }} />
      <GlowText fontSize={48} color="#fff" delay={20}>
        Now 87 agents build my startup.
      </GlowText>
    </AbsoluteFill>
  );
};

// Section 2: Problem (3-13s, frames 90-390)
const Problem: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const problems = [
    "Agents forget context between tabs",
    "They duplicate each other's work",
    "Git conflicts everywhere",
    "You're managing them, not building",
  ];

  return (
    <AbsoluteFill
      style={{
        background: AURORA_BG,
        justifyContent: "center",
        padding: 60,
      }}
    >
      <div style={{ marginBottom: 40 }}>
        <GlowText fontSize={40} color={AURORA_PINK}>
          What broke:
        </GlowText>
      </div>
      {problems.map((problem, i) => {
        const delay = i * 20;
        const opacity = spring({
          frame: frame - delay,
          fps,
          config: { damping: 20 },
        });
        return (
          <div
            key={i}
            style={{
              fontSize: 36,
              color: "#fff",
              opacity,
              padding: "12px 0",
              fontFamily: "SF Pro Display, system-ui, sans-serif",
              borderLeft: `3px solid ${AURORA_PURPLE}`,
              paddingLeft: 20,
              marginBottom: 12,
            }}
          >
            {problem}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// Section 3: Solution (13-28s, frames 390-840)
const Solution: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const features = [
    { title: "Shared Memory", desc: "Every agent sees what others built", color: AURORA_CYAN },
    { title: "Conflict Detection", desc: "Warnings before collisions happen", color: AURORA_PURPLE },
    { title: "Destinations", desc: "Agents know what needs doing", color: AURORA_PINK },
  ];

  return (
    <AbsoluteFill
      style={{
        background: AURORA_BG,
        justifyContent: "center",
        padding: 60,
      }}
    >
      <GlowText fontSize={44} color="#fff">
        Eywa gives them:
      </GlowText>
      <div style={{ height: 40 }} />
      {features.map((f, i) => {
        const delay = 20 + i * 30;
        const opacity = spring({
          frame: frame - delay,
          fps,
          config: { damping: 20 },
        });
        return (
          <div
            key={i}
            style={{
              opacity,
              marginBottom: 32,
              padding: 24,
              borderRadius: 16,
              background: `${f.color}11`,
              border: `1px solid ${f.color}33`,
            }}
          >
            <div
              style={{
                fontSize: 36,
                fontWeight: 700,
                color: f.color,
                fontFamily: "SF Pro Display, system-ui, sans-serif",
              }}
            >
              {f.title}
            </div>
            <div
              style={{
                fontSize: 24,
                color: "#ffffff88",
                marginTop: 8,
                fontFamily: "SF Pro Display, system-ui, sans-serif",
              }}
            >
              {f.desc}
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// Section 4: Proof (28-38s, frames 840-1140)
const Proof: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        background: AURORA_BG,
        justifyContent: "center",
        alignItems: "center",
        padding: 60,
      }}
    >
      <GlowText fontSize={36} color="#ffffff88">
        Recursive dogfooding:
      </GlowText>
      <div style={{ height: 40 }} />
      <div style={{ display: "flex", gap: 60 }}>
        <StatCounter value={87} label="agents" delay={10} />
        <StatCounter value={7} label="days" delay={20} />
      </div>
      <div style={{ height: 40 }} />
      <GlowText fontSize={32} color={AURORA_CYAN} delay={40}>
        Eywa built itself using itself.
      </GlowText>
    </AbsoluteFill>
  );
};

// Section 5: CTA (38-42s, frames 1140-1260)
const CTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({ frame, fps, config: { damping: 12 } });

  return (
    <AbsoluteFill
      style={{
        background: AURORA_BG,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div style={{ transform: `scale(${scale})` }}>
        <div
          style={{
            fontSize: 56,
            fontWeight: 800,
            color: "#fff",
            fontFamily: "SF Mono, monospace",
            textShadow: `0 0 40px ${AURORA_PURPLE}66, 0 0 80px ${AURORA_CYAN}33`,
            textAlign: "center",
          }}
        >
          eywa-ai.dev
        </div>
        <div
          style={{
            fontSize: 28,
            color: "#ffffff66",
            textAlign: "center",
            marginTop: 16,
            fontFamily: "SF Pro Display, system-ui, sans-serif",
          }}
        >
          Open source. Run it now.
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const EywaShort: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: AURORA_BG }}>
      <Sequence from={0} durationInFrames={90}>
        <Hook />
      </Sequence>
      <Sequence from={90} durationInFrames={300}>
        <Problem />
      </Sequence>
      <Sequence from={390} durationInFrames={450}>
        <Solution />
      </Sequence>
      <Sequence from={840} durationInFrames={300}>
        <Proof />
      </Sequence>
      <Sequence from={1140} durationInFrames={270}>
        <CTA />
      </Sequence>
    </AbsoluteFill>
  );
};
