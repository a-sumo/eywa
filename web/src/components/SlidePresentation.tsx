import { useState, useEffect, useCallback, useRef } from "react";
import { slidesData, type Slide } from "./slidesData";
import { EywaLogoStatic } from "./EywaLogo";
import { FlowBackground } from "./FlowBackground";

import "./SlidePresentation.css";

// -- Animated icons (same visual language as landing page) --

const SlideIconThreads = () => (
  <svg className="anim-icon" width="32" height="32" viewBox="0 0 32 32" fill="none">
    <path className="anim-stream s1" d="M4 8c6-3 18 3 24 0" strokeWidth="2.5" strokeLinecap="round"/>
    <path className="anim-stream s2" d="M4 16c6-3 18 3 24 0" strokeWidth="2.5" strokeLinecap="round"/>
    <path className="anim-stream s3" d="M4 24c4-2 12 2 18 0" strokeWidth="2.5" strokeLinecap="round"/>
    <circle className="anim-node" cx="26" cy="24" r="3"/>
  </svg>
);

const SlideIconChat = () => (
  <svg className="anim-icon" width="32" height="32" viewBox="0 0 32 32" fill="none">
    <path className="anim-bubble" d="M27 20.5a2.5 2.5 0 0 1-2.5 2.5H9.5L5 27.5V7.5A2.5 2.5 0 0 1 7.5 5h17A2.5 2.5 0 0 1 27 7.5z" strokeWidth="2.5" strokeLinejoin="round"/>
    <circle className="anim-typing d1" cx="11" cy="14" r="1.8"/>
    <circle className="anim-typing d2" cx="16" cy="14" r="1.8"/>
    <circle className="anim-typing d3" cx="21" cy="14" r="1.8"/>
  </svg>
);

const SlideIconBrain = () => (
  <svg className="anim-icon" width="32" height="32" viewBox="0 0 32 32" fill="none">
    <line className="anim-synapse sy1" x1="16" y1="9" x2="9" y2="14" strokeWidth="2"/>
    <line className="anim-synapse sy2" x1="16" y1="9" x2="23" y2="14" strokeWidth="2"/>
    <line className="anim-synapse sy3" x1="9" y1="19" x2="16" y2="24" strokeWidth="2"/>
    <line className="anim-synapse sy4" x1="23" y1="19" x2="16" y2="24" strokeWidth="2"/>
    <circle className="anim-neuron n1" cx="16" cy="6" r="3" strokeWidth="2"/>
    <circle className="anim-neuron n2" cx="7" cy="16" r="3" strokeWidth="2"/>
    <circle className="anim-neuron n3" cx="25" cy="16" r="3" strokeWidth="2"/>
    <circle className="anim-neuron n4" cx="16" cy="26" r="3" strokeWidth="2"/>
  </svg>
);

const SlideIconInject = () => (
  <svg className="anim-icon" width="32" height="32" viewBox="0 0 32 32" fill="none">
    <line className="anim-drop-shaft" x1="16" y1="4" x2="16" y2="22" strokeWidth="2.5" strokeLinecap="round"/>
    <polyline className="anim-drop-head" points="10,18 16,24 22,18" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    <circle className="anim-ripple" cx="16" cy="28" r="2" strokeWidth="1.5"/>
  </svg>
);

const SlideIconLink = () => (
  <svg className="anim-icon" width="32" height="32" viewBox="0 0 32 32" fill="none">
    <path className="anim-arc a1" d="M13.5 18.5a6.5 6.5 0 0 0 9.2.6l3.5-3.5a6.5 6.5 0 0 0-9.2-9.2l-2 2" strokeWidth="2.5" strokeLinecap="round"/>
    <path className="anim-arc a2" d="M18.5 13.5a6.5 6.5 0 0 0-9.2-.6l-3.5 3.5a6.5 6.5 0 0 0 9.2 9.2l2-2" strokeWidth="2.5" strokeLinecap="round"/>
  </svg>
);

const SlideIconCode = () => (
  <svg className="anim-icon" width="32" height="32" viewBox="0 0 32 32" fill="none">
    <polyline className="anim-bracket bl" points="13,6 5,16 13,26" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    <polyline className="anim-bracket br" points="19,6 27,16 19,26" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    <line className="anim-cursor-line" x1="16" y1="10" x2="16" y2="22" strokeWidth="2.5" strokeLinecap="round"/>
  </svg>
);

// -- Diagram renderers --

function ThreeViewsDiagram() {
  const views = [
    {
      icon: <SlideIconThreads />,
      title: "Hub",
      color: "var(--color-accent-secondary)",
      body: (
        <>
          Live agent map with progress bars.
          <br />
          Destination banner and milestones.
          <br />
          <strong className="text-error">Pattern detection</strong> across the swarm.
        </>
      ),
    },
    {
      icon: <SlideIconChat />,
      title: "Agent Detail",
      color: "var(--success)",
      body: (
        <>
          Full session history and artifacts.
          <br />
          Systems touched, operations, outcomes.
          <br />
          Inject context mid-session.
        </>
      ),
    },
    {
      icon: <SlideIconBrain />,
      title: "Gemini Chat",
      color: "var(--color-accent)",
      body: (
        <>
          Ask Gemini about the swarm.
          <br />
          Cross-session analysis and steering.
          <br />
          Proactive alerts on drift and conflicts.
        </>
      ),
    },
  ];

  return (
    <div className="dia-cards">
      {views.map((v) => (
        <div key={v.title} className="dia-card">
          <div className="dia-card-icon">{v.icon}</div>
          <div className="dia-card-title" style={{ color: v.color }}>
            {v.title}
          </div>
          <div className="dia-card-body">{v.body}</div>
        </div>
      ))}
    </div>
  );
}

function DivergenceDiagram() {
  return (
    <div className="dia-divergence">
      <div className="dia-divergence-threads">
        <div className="dia-thread-card">
          <div className="dia-thread-header">
            <span className="dia-dot" style={{ background: "var(--color-accent-secondary)" }} />
            <strong style={{ color: "var(--color-accent-secondary)" }}>Sarah's Thread</strong>
          </div>
          <div className="dia-thread-body">
            Exploring <strong>wrist anchoring</strong> for hand tracking.
            <br />
            MediaPipe {"\u2192"} custom pipeline.
          </div>
        </div>
        <div className="dia-thread-card">
          <div className="dia-thread-header">
            <span className="dia-dot" style={{ background: "var(--warning)" }} />
            <strong style={{ color: "var(--warning)" }}>Priya's Thread</strong>
          </div>
          <div className="dia-thread-body">
            Still using <strong>bounding box</strong> overlay.
            <br />
            CSS absolute positioning.
          </div>
        </div>
      </div>
      <div className="dia-divergence-alert">
        <div className="dia-divergence-track">
          <div className="dia-divergence-fill" style={{ width: "72%" }} />
        </div>
        <span className="dia-divergence-label">72% diverged</span>
      </div>
      <div className="dia-divergence-legend">
        <strong>Jaccard similarity</strong> on thread content tokens.
        <br />
        <span style={{ color: "var(--success)" }}>Low (&lt;40%)</span>
        {" \u00b7 "}
        <span style={{ color: "var(--warning)" }}>Medium (40-70%)</span>
        {" \u00b7 "}
        <span style={{ color: "var(--error)" }}>High (&gt;70%)</span>
        <br />
        Alerts surface on the hub before integration conflicts happen.
      </div>
    </div>
  );
}

function ArchitectureDiagram() {
  return (
    <div className="dia-arch">
      <div className="dia-arch-row">
        <div className="dia-arch-col">
          <div className="dia-arch-label">AI Agents</div>
          <div className="dia-arch-stack">
            {["Claude Code", "Gemini CLI", "Cursor / Copilot"].map((a) => (
              <div key={a} className="dia-arch-item dia-arch-agent">
                <span className="dia-arch-agent-icon"><SlideIconCode /></span>
                {a}
              </div>
            ))}
          </div>
        </div>
        <div className="dia-arch-arrow">
          <SlideIconLink />
          <span>MCP</span>
        </div>
        <div className="dia-arch-col">
          <div className="dia-arch-label">Cloudflare Worker</div>
          <div className="dia-arch-box dia-arch-worker">
            <div className="dia-arch-box-title">eywa-mcp</div>
            <div className="dia-arch-box-detail">45 MCP tools</div>
            <div className="dia-arch-box-detail">Streamable HTTP + SSE</div>
            <div className="dia-arch-box-detail">Stateless</div>
          </div>
        </div>
        <div className="dia-arch-arrow">
          <SlideIconInject />
          <span>REST</span>
        </div>
        <div className="dia-arch-col">
          <div className="dia-arch-label dia-arch-label-green">Supabase</div>
          <div className="dia-arch-box dia-arch-db">
            <div className="dia-arch-box-title">PostgreSQL</div>
            <div className="dia-arch-box-detail">rooms</div>
            <div className="dia-arch-box-detail">memories</div>
            <div className="dia-arch-box-detail">messages</div>
            <div className="dia-arch-box-detail">knowledge</div>
            <div className="dia-arch-box-detail" style={{ marginTop: 6 }}>
              Realtime subscriptions
            </div>
          </div>
        </div>
      </div>
      <div className="dia-arch-footer">
        <span>{"\u2191"} Realtime (postgres_changes) {"\u2191"}</span>
        <div className="dia-arch-dashboard">
          <div className="dia-arch-box-title">React Dashboard</div>
          <div className="dia-arch-box-detail">
            Hub {"\u00b7"} Agent Detail {"\u00b7"} Gemini Chat {"\u00b7"} Spectacles AR
          </div>
        </div>
        <div className="dia-arch-dashboard" style={{ marginTop: 8 }}>
          <div className="dia-arch-box-title">VS Code Extension</div>
          <div className="dia-arch-box-detail">
            Agent Tree {"\u00b7"} Activity Feed {"\u00b7"} Code Inject {"\u00b7"} Knowledge Lens
          </div>
        </div>
      </div>
    </div>
  );
}

const diagrams: Record<string, React.FC> = {
  "three-views": ThreeViewsDiagram,
  divergence: DivergenceDiagram,
  architecture: ArchitectureDiagram,
};

// -- Slide renderer --

function renderSlideBody(slide: Slide, active: boolean) {
  switch (slide.type) {
    case "bullets":
      return (
        <ul className="slide-bullets">
          {slide.items.map((item, i) => (
            <li key={i} dangerouslySetInnerHTML={{ __html: item }} />
          ))}
        </ul>
      );

    case "bars": {
      const maxVal = Math.max(...slide.items.map((i) => i.value));
      return (
        <>
          <div className="slide-bars">
            {slide.items.map((item, i) => {
              const pct = Math.min((item.value / maxVal) * 100, 100);
              return (
                <div key={i} className="slide-bar-row">
                  <div className="slide-bar-label">{item.label}</div>
                  <div className="slide-bar-track">
                    <div
                      className="slide-bar-fill"
                      style={{
                        width: active ? `${pct}%` : "0%",
                        background: item.color,
                      }}
                    />
                    <span className="slide-bar-value">{item.display}</span>
                  </div>
                </div>
              );
            })}
          </div>
          {slide.source && <p className="slide-bar-source">{slide.source}</p>}
        </>
      );
    }

    case "diagram": {
      const Renderer = diagrams[slide.diagramKey];
      return Renderer ? (
        <div className="slide-diagram"><Renderer /></div>
      ) : (
        <p className="text-muted">Unknown diagram: {slide.diagramKey}</p>
      );
    }

    case "bigstat":
      return (
        <>
          <div className="slide-bigstat-grid">
            {slide.stats.map((s, i) => (
              <div key={i} className="slide-bigstat-card">
                <div className="slide-bigstat-value">{s.value}</div>
                <div className="slide-bigstat-label">{s.label}</div>
              </div>
            ))}
          </div>
          {slide.footnote && <p className="slide-bigstat-footnote">{slide.footnote}</p>}
        </>
      );

    case "logogrid":
      return (
        <div className="slide-logo-grid">
          {slide.items.map((item, i) => (
            <div key={i} className="slide-logo-card">
              <div className="slide-logo-name">{item.name}</div>
              <div className="slide-logo-stat">{item.stat}</div>
              <div className="slide-logo-detail">{item.detail}</div>
            </div>
          ))}
        </div>
      );

    case "timeline":
      return (
        <div className="slide-timeline">
          {slide.items.map((item, i) => (
            <div key={i} className="slide-timeline-item">
              <div className="slide-timeline-marker">{item.marker}</div>
              <div className="slide-timeline-content">
                <div className="slide-timeline-title">{item.title}</div>
                <div className="slide-timeline-desc">{item.description}</div>
              </div>
            </div>
          ))}
        </div>
      );

    case "quote":
      return (
        <div className="slide-quote">
          <blockquote>{slide.quote}</blockquote>
          <div className="slide-quote-attr">{"\u2014"} {slide.attribution}</div>
        </div>
      );

    case "image":
      return (
        <div className="slide-image">
          <img src={slide.src} alt={slide.title} />
          {slide.caption && <p className="slide-image-caption">{slide.caption}</p>}
        </div>
      );
  }
}

// -- Section helper --

function getSection(slideTitle: string): string {
  for (const [section, titles] of Object.entries(slidesData.sections)) {
    if (titles.includes(slideTitle)) return section;
  }
  return "";
}

function buildChapters() {
  const chapters: { name: string; slideIndex: number }[] = [
    { name: "Start", slideIndex: 0 },
  ];
  let idx = 1;
  for (const [name, titles] of Object.entries(slidesData.sections)) {
    chapters.push({ name, slideIndex: idx });
    idx += titles.length;
  }
  return chapters;
}

// -- Main component --

export function SlidePresentation() {
  const totalSlides = slidesData.slides.length + 2; // title + content + closing
  const [current, setCurrent] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [direction, setDirection] = useState<"next" | "prev">("next");
  const touchStartX = useRef(0);
  const chapters = buildChapters();

  const goTo = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(index, totalSlides - 1));
      if (clamped !== current) {
        setDirection(clamped > current ? "next" : "prev");
        setCurrent(clamped);
      }
    },
    [current, totalSlides]
  );

  const next = useCallback(() => goTo(current + 1), [current, goTo]);
  const prev = useCallback(() => goTo(current - 1), [current, goTo]);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") {
        next();
        e.preventDefault();
      }
      if (e.key === "ArrowLeft") {
        prev();
        e.preventDefault();
      }
      if (e.key === "Escape") setMenuOpen(false);
      if (e.key === "Home") {
        goTo(0);
        e.preventDefault();
      }
      if (e.key === "End") {
        goTo(totalSlides - 1);
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, goTo, totalSlides]);

  // Touch swipe
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 50) {
      dx < 0 ? next() : prev();
    }
  };

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = () => setMenuOpen(false);
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, [menuOpen]);

  // Render the current slide content
  const renderCurrentSlide = () => {
    if (current === 0) {
      // Title slide with particle animation backdrop
      return (
        <div className="slide slide-title">
          <div className="slide-flow-backdrop" aria-hidden="true">
            <FlowBackground />
          </div>
          <div className="slide-title-content">
            <h1 className="slide-h1">{slidesData.title}</h1>
            <p className="slide-subtitle-main">{slidesData.subtitle}</p>
            <div className="slide-summary">
              {slidesData.summary.map((item, i) => (
                <div key={i} className="slide-summary-item">{item}</div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    if (current === totalSlides - 1) {
      // Closing slide with particle animation backdrop
      return (
        <div className="slide slide-closing">
          <div className="slide-flow-backdrop" aria-hidden="true">
            <FlowBackground />
          </div>
          <div className="slide-title-content">
            <h1 className="slide-h1">{slidesData.closing.title}</h1>
            <p className="slide-subtitle-main">{slidesData.closing.subtitle}</p>
            <div className="slide-closing-links">
              <a href="https://github.com/a-sumo/eywa" target="_blank" rel="noopener noreferrer" className="slide-closing-link">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                github.com/a-sumo/eywa
              </a>
              <a href="https://discord.gg/TyEUUnNm" target="_blank" rel="noopener noreferrer" className="slide-closing-link">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>
                discord.gg/TyEUUnNm
              </a>
              <a href="https://eywa-ai.dev" target="_blank" rel="noopener noreferrer" className="slide-closing-link">
                eywa-ai.dev
              </a>
            </div>
          </div>
        </div>
      );
    }

    // Content slide
    const slide = slidesData.slides[current - 1];
    const section = getSection(slide.title);

    return (
      <div className="slide slide-content">
        <h2 className="slide-h2">{slide.title}</h2>
        {slide.subtitle && <p className="slide-subtitle">{slide.subtitle}</p>}
        {renderSlideBody(slide, true)}
        {section && <div className="slide-section-indicator">{section}</div>}
      </div>
    );
  };

  return (
    <div
      className="slides-app"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Aurora gradient background */}
      <div className="slides-aurora-bg" aria-hidden="true" />
      {/* Noise texture overlay */}
      <svg className="slides-noise" aria-hidden="true">
        <filter id="slideNoise">
          <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#slideNoise)" />
      </svg>
      <div className={`slides-viewport slides-dir-${direction}`} key={current}>
        {renderCurrentSlide()}
      </div>

      {/* Navigation controls */}
      <div className="slides-nav">
        <button
          className="slides-nav-btn"
          onClick={() => goTo(0)}
          title="Go to start"
        >
          <EywaLogoStatic size={20} />
        </button>
        <button
          className="slides-nav-btn"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen(!menuOpen);
          }}
          title="Chapters"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="4" y1="12" x2="16" y2="12" />
            <line x1="4" y1="18" x2="12" y2="18" />
          </svg>
        </button>
      </div>

      {/* Slide counter + progress */}
      <div className="slides-counter">
        <div className="slides-progress">
          <div
            className="slides-progress-fill"
            style={{ width: `${((current + 1) / totalSlides) * 100}%` }}
          />
        </div>
        <span>{current + 1} / {totalSlides}</span>
      </div>

      {/* Left/right arrows */}
      <button
        className="slides-arrow slides-arrow-left"
        onClick={prev}
        disabled={current === 0}
        aria-label="Previous slide"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <button
        className="slides-arrow slides-arrow-right"
        onClick={next}
        disabled={current === totalSlides - 1}
        aria-label="Next slide"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 6 15 12 9 18" />
        </svg>
      </button>

      {/* Chapter menu */}
      {menuOpen && (
        <div className="slides-menu" onClick={(e) => e.stopPropagation()}>
          {chapters.map((ch) => (
            <div
              key={ch.name}
              className={`slides-menu-item ${
                current >= ch.slideIndex ? "slides-menu-item-active" : ""
              }`}
              onClick={() => {
                goTo(ch.slideIndex);
                setMenuOpen(false);
              }}
            >
              {ch.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
