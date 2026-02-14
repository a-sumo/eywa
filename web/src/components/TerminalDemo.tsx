import { useEffect, useRef, useState } from "react";

/**
 * Animated terminal that replays the `npx eywa-ai init` onboarding flow.
 * Pure CSS animations + React state. No external deps.
 */

interface TermLine {
  text: string;
  color?: string;
  delay?: number; // ms before this line appears
  typing?: boolean; // animate character by character
  indent?: number;
}

const LINES: TermLine[] = [
  { text: "$ npx eywa-ai init", color: "var(--aurora-cyan)", typing: true, delay: 400 },
  { text: "", delay: 600 },
  { text: "  Detecting AI agents...", color: "var(--text-tertiary)", delay: 300 },
  { text: "", delay: 800 },
  { text: "  Found 3 agents:", color: "var(--text-secondary)", delay: 200 },
  { text: "    Claude Code    ~/.claude/settings.json", color: "var(--aurora-green)", delay: 150, indent: 2 },
  { text: "    Cursor         ~/.cursor/mcp.json", color: "var(--aurora-green)", delay: 150, indent: 2 },
  { text: "    Gemini CLI     ~/.gemini/settings.json", color: "var(--aurora-green)", delay: 150, indent: 2 },
  { text: "", delay: 400 },
  { text: "  Creating space: acme-eng", color: "var(--text-secondary)", delay: 300 },
  { text: "  Space created.", color: "var(--aurora-green)", delay: 600 },
  { text: "", delay: 200 },
  { text: "  Configuring MCP server for all 3 agents...", color: "var(--text-secondary)", delay: 400 },
  { text: "  Done. All agents now log to eywa-ai.dev/s/acme-eng", color: "var(--aurora-green)", delay: 800 },
  { text: "", delay: 300 },
  { text: "  Share with your team:", color: "var(--text-secondary)", delay: 200 },
  { text: "    npx eywa-ai join acme-eng", color: "var(--aurora-cyan)", delay: 200 },
  { text: "", delay: 400 },
  { text: "  Dashboard: https://eywa-ai.dev/s/acme-eng", color: "var(--aurora-purple)", delay: 200 },
];

const TOTAL_DURATION_ESTIMATE = LINES.reduce((sum, l) => sum + (l.delay || 0), 0) + 2000; // rough estimate

export function TerminalDemo() {
  const [visibleLines, setVisibleLines] = useState<{ text: string; color?: string }[]>([]);
  const [typingLine, setTypingLine] = useState<{ text: string; color?: string; progress: number } | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Intersection observer to start animation when visible
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasPlayed) {
          setIsVisible(true);
          setHasPlayed(true);
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasPlayed]);

  // Play the animation
  useEffect(() => {
    if (!isVisible) return;

    let cancelled = false;
    const timeoutIds: ReturnType<typeof setTimeout>[] = [];

    async function play() {
      let cumulativeDelay = 600; // initial pause

      for (const line of LINES) {
        if (cancelled) return;
        cumulativeDelay += line.delay || 100;

        if (line.typing) {
          // Type character by character
          const chars = line.text;
          const charDelay = 45;

          await new Promise<void>((resolve) => {
            const tid = setTimeout(() => {
              if (cancelled) return resolve();

              let charIdx = 0;
              const typeInterval = setInterval(() => {
                if (cancelled) { clearInterval(typeInterval); return resolve(); }
                charIdx++;
                setTypingLine({ text: chars.slice(0, charIdx), color: line.color, progress: charIdx });

                if (charIdx >= chars.length) {
                  clearInterval(typeInterval);
                  setTypingLine(null);
                  setVisibleLines(prev => [...prev, { text: chars, color: line.color }]);
                  resolve();
                }
              }, charDelay);
            }, cumulativeDelay);
            timeoutIds.push(tid);
          });

          cumulativeDelay = 0; // reset after async typing
        } else {
          await new Promise<void>((resolve) => {
            const tid = setTimeout(() => {
              if (cancelled) return resolve();
              setVisibleLines(prev => [...prev, { text: line.text, color: line.color }]);
              resolve();
            }, cumulativeDelay);
            timeoutIds.push(tid);
          });
          cumulativeDelay = 0;
        }
      }

      // Restart after a pause
      if (!cancelled) {
        const restartId = setTimeout(() => {
          if (!cancelled) {
            setVisibleLines([]);
            setTypingLine(null);
            setIsVisible(false);
            setTimeout(() => {
              if (!cancelled) {
                setHasPlayed(false);
              }
            }, 100);
          }
        }, TOTAL_DURATION_ESTIMATE + 4000);
        timeoutIds.push(restartId);
      }
    }

    play();

    return () => {
      cancelled = true;
      timeoutIds.forEach(clearTimeout);
    };
  }, [isVisible]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [visibleLines, typingLine]);

  return (
    <div ref={containerRef} style={styles.wrapper}>
      {/* Window chrome */}
      <div style={styles.chrome}>
        <div style={styles.dots}>
          <span style={{ ...styles.dot, background: "#ff5f57" }} />
          <span style={{ ...styles.dot, background: "#febc2e" }} />
          <span style={{ ...styles.dot, background: "#28c840" }} />
        </div>
        <div style={styles.title}>Terminal</div>
        <div style={styles.spacer} />
      </div>

      {/* Terminal body */}
      <div ref={scrollRef} style={styles.body}>
        {visibleLines.map((line, i) => (
          <div key={i} style={{ ...styles.line, color: line.color || "var(--text-secondary)" }}>
            {line.text || "\u00A0"}
          </div>
        ))}
        {typingLine && (
          <div style={{ ...styles.line, color: typingLine.color || "var(--text-secondary)" }}>
            {typingLine.text}
            <span style={styles.cursor} />
          </div>
        )}
        {visibleLines.length === 0 && !typingLine && (
          <div style={{ ...styles.line, color: "var(--text-muted)" }}>
            <span style={styles.cursor} />
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    maxWidth: 600,
    margin: "2rem auto 0",
    borderRadius: "var(--radius-xl)",
    overflow: "hidden",
    border: "1px solid var(--border-default)",
    background: "var(--bg-base)",
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.04)",
  },
  chrome: {
    display: "flex",
    alignItems: "center",
    padding: "10px 14px",
    background: "var(--bg-elevated)",
    borderBottom: "1px solid var(--border-subtle)",
  },
  dots: {
    display: "flex",
    gap: "6px",
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: "50%",
    display: "inline-block",
  },
  title: {
    flex: 1,
    textAlign: "center" as const,
    fontSize: "var(--text-xs)",
    color: "var(--text-muted)",
    fontFamily: "var(--font-sans)",
  },
  spacer: {
    width: 54, // balance the dots
  },
  body: {
    padding: "16px 18px",
    minHeight: 280,
    maxHeight: 360,
    overflowY: "auto" as const,
    fontFamily: "var(--font-mono)",
    fontSize: "13px",
    lineHeight: 1.7,
  },
  line: {
    whiteSpace: "pre" as const,
    minHeight: "1.7em",
  },
  cursor: {
    display: "inline-block",
    width: 8,
    height: "1.1em",
    background: "var(--aurora-cyan)",
    marginLeft: 1,
    verticalAlign: "text-bottom",
    animation: "terminal-blink 1s step-end infinite",
  },
};

// Inject keyframes for cursor blink
if (typeof document !== "undefined") {
  const styleId = "terminal-demo-keyframes";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      @keyframes terminal-blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }
}
