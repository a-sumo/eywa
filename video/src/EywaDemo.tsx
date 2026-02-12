import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  interpolate,
  spring,
  useVideoConfig,
} from "remotion";

const BG = "#0a0a0f";
const PURPLE = "#7c3aed";
const PINK = "#ec4899";
const CYAN = "#06b6d4";

const FadeIn: React.FC<{
  children: React.ReactNode;
  delay?: number;
}> = ({ children, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const opacity = spring({
    frame: frame - delay,
    fps,
    config: { damping: 20 },
  });

  return <div style={{ opacity }}>{children}</div>;
};

const SectionTitle: React.FC<{ children: string; color?: string }> = ({
  children,
  color = CYAN,
}) => (
  <div
    style={{
      fontSize: 20,
      fontWeight: 600,
      color,
      textTransform: "uppercase",
      letterSpacing: 3,
      fontFamily: "SF Mono, monospace",
      marginBottom: 16,
    }}
  >
    {children}
  </div>
);

const BigText: React.FC<{
  children: string;
  size?: number;
  color?: string;
}> = ({ children, size = 56, color = "#fff" }) => (
  <div
    style={{
      fontSize: size,
      fontWeight: 700,
      color,
      fontFamily: "SF Pro Display, system-ui, sans-serif",
      lineHeight: 1.2,
      textShadow: `0 0 60px ${color}22`,
    }}
  >
    {children}
  </div>
);

// Hook: 0-5s (frames 0-150)
const Hook: React.FC = () => (
  <AbsoluteFill
    style={{ background: BG, justifyContent: "center", padding: 80 }}
  >
    <FadeIn>
      <BigText size={52} color={PINK}>
        Six coding agents.
      </BigText>
    </FadeIn>
    <div style={{ height: 20 }} />
    <FadeIn delay={15}>
      <BigText size={52}>Same codebase.</BigText>
    </FadeIn>
    <div style={{ height: 20 }} />
    <FadeIn delay={30}>
      <BigText size={52} color={CYAN}>
        Zero coordination.
      </BigText>
    </FadeIn>
  </AbsoluteFill>
);

// Context: 5-25s (frames 150-750)
const Context: React.FC = () => (
  <AbsoluteFill
    style={{ background: BG, justifyContent: "center", padding: 80 }}
  >
    <FadeIn>
      <SectionTitle>The problem</SectionTitle>
    </FadeIn>
    <FadeIn delay={10}>
      <BigText size={44}>
        Agents can't see what other agents are doing.
      </BigText>
    </FadeIn>
    <div style={{ height: 40 }} />
    <FadeIn delay={30}>
      <div
        style={{
          fontSize: 28,
          color: "#ffffff88",
          fontFamily: "SF Pro Display, system-ui, sans-serif",
          lineHeight: 1.6,
          maxWidth: 900,
        }}
      >
        They override each other's work. One refactors while another is
        mid-feature. No shared context. The moment you scale past 3 or 4
        agents, you spend more time managing them than building.
      </div>
    </FadeIn>
  </AbsoluteFill>
);

// Build: 25-55s (frames 750-1650)
const Build: React.FC = () => {
  const frame = useCurrentFrame();

  const features = [
    {
      title: "MCP Tools",
      desc: "Agents broadcast what they're working on through a standard protocol",
      color: PURPLE,
    },
    {
      title: "Shared Memory",
      desc: "Every agent sees who's editing what, what's claimed, where conflicts exist",
      color: CYAN,
    },
    {
      title: "Destinations",
      desc: "Agents declare intent before acting. Warnings when paths overlap.",
      color: PINK,
    },
  ];

  return (
    <AbsoluteFill
      style={{ background: BG, justifyContent: "center", padding: 80 }}
    >
      <FadeIn>
        <SectionTitle color={PURPLE}>How Eywa works</SectionTitle>
      </FadeIn>
      <div style={{ height: 20 }} />
      {features.map((f, i) => (
        <FadeIn key={i} delay={20 + i * 40}>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 24,
              marginBottom: 36,
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: `${f.color}22`,
                border: `2px solid ${f.color}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 24,
                fontWeight: 800,
                color: f.color,
                fontFamily: "SF Mono, monospace",
                flexShrink: 0,
              }}
            >
              {i + 1}
            </div>
            <div>
              <div
                style={{
                  fontSize: 32,
                  fontWeight: 700,
                  color: f.color,
                  fontFamily: "SF Pro Display, system-ui, sans-serif",
                }}
              >
                {f.title}
              </div>
              <div
                style={{
                  fontSize: 22,
                  color: "#ffffff88",
                  marginTop: 4,
                  fontFamily: "SF Pro Display, system-ui, sans-serif",
                }}
              >
                {f.desc}
              </div>
            </div>
          </div>
        </FadeIn>
      ))}
    </AbsoluteFill>
  );
};

// Proof: 55-85s (frames 1650-2550)
const ProofSection: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const stats = [
    { value: 87, label: "agents coordinated", color: CYAN },
    { value: 7, label: "days of development", color: PURPLE },
    { value: 1, label: "product built itself", color: PINK },
  ];

  return (
    <AbsoluteFill
      style={{
        background: BG,
        justifyContent: "center",
        alignItems: "center",
        padding: 80,
      }}
    >
      <FadeIn>
        <SectionTitle>The proof</SectionTitle>
      </FadeIn>
      <div style={{ height: 20 }} />
      <FadeIn delay={10}>
        <BigText size={40}>
          Eywa built itself using itself.
        </BigText>
      </FadeIn>
      <div style={{ height: 60 }} />
      <div style={{ display: "flex", gap: 80 }}>
        {stats.map((s, i) => {
          const progress = spring({
            frame: frame - 30 - i * 15,
            fps,
            config: { damping: 30, stiffness: 80 },
          });
          return (
            <div key={i} style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: 72,
                  fontWeight: 800,
                  color: s.color,
                  fontFamily: "SF Mono, monospace",
                  textShadow: `0 0 30px ${s.color}44`,
                }}
              >
                {Math.round(s.value * progress)}
              </div>
              <div
                style={{
                  fontSize: 20,
                  color: "#ffffff66",
                  fontFamily: "SF Pro Display, system-ui, sans-serif",
                  marginTop: 8,
                }}
              >
                {s.label}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// CTA: 85-105s (frames 2550-3150)
const CTASection: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scale = spring({ frame, fps, config: { damping: 12 } });

  return (
    <AbsoluteFill
      style={{
        background: BG,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div style={{ transform: `scale(${scale})`, textAlign: "center" }}>
        <BigText size={48}>Open source.</BigText>
        <div style={{ height: 20 }} />
        <div
          style={{
            fontSize: 44,
            fontWeight: 800,
            color: CYAN,
            fontFamily: "SF Mono, monospace",
            textShadow: `0 0 40px ${CYAN}44`,
          }}
        >
          eywa-ai.dev
        </div>
        <div style={{ height: 24 }} />
        <div
          style={{
            fontSize: 24,
            color: "#ffffff66",
            fontFamily: "SF Pro Display, system-ui, sans-serif",
          }}
        >
          Run it with your agents.
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const EywaDemo: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: BG }}>
      <Sequence from={0} durationInFrames={150}>
        <Hook />
      </Sequence>
      <Sequence from={150} durationInFrames={600}>
        <Context />
      </Sequence>
      <Sequence from={750} durationInFrames={900}>
        <Build />
      </Sequence>
      <Sequence from={1650} durationInFrames={900}>
        <ProofSection />
      </Sequence>
      <Sequence from={2550} durationInFrames={600}>
        <CTASection />
      </Sequence>
    </AbsoluteFill>
  );
};
