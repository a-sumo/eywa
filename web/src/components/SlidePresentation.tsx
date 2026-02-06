import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { slidesData, type Slide } from "./slidesData";
import { EywaLogoStatic } from "./EywaLogo";

import "./SlidePresentation.css";

// -- Diagram renderers --

function ThreeViewsDiagram() {
  const views = [
    {
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="4" y1="10" x2="20" y2="10" />
          <line x1="4" y1="14" x2="20" y2="14" />
          <line x1="4" y1="18" x2="16" y2="18" />
        </svg>
      ),
      title: "Overview",
      color: "var(--color-accent-secondary)",
      body: (
        <>
          Tree of all active threads.
          <br />
          Who's working on what.
          <br />
          <strong className="text-error">Divergence alerts</strong> when threads diverge.
        </>
      ),
    },
    {
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <rect x="4" y="2" width="16" height="20" rx="2" />
          <line x1="8" y1="7" x2="16" y2="7" />
          <line x1="8" y1="11" x2="16" y2="11" />
          <line x1="8" y1="15" x2="13" y2="15" />
        </svg>
      ),
      title: "Thread View",
      color: "var(--success)",
      body: (
        <>
          Full conversation history.
          <br />
          Each memory is a <strong>draggable card</strong>.
          <br />
          Select decisions, code, context. Drag into Eywa.
        </>
      ),
    },
    {
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M6 3v6" />
          <path d="M18 3v6" />
          <path d="M6 9c0 4 6 4 6 8" />
          <path d="M18 9c0 4-6 4-6 8" />
          <path d="M12 17v4" />
        </svg>
      ),
      title: "Workspace",
      color: "var(--color-accent)",
      body: (
        <>
          Browse memories, build context, <strong>chat with Gemini</strong>.
          <br />
          Git-like history: rewind, fork, branch.
          <br />
          Output becomes a new thread.
        </>
      ),
    },
  ];

  return (
    <div className="dia-cards">
      {views.map((v) => (
        <div key={v.title} className="dia-card">
          <div className="dia-card-icon" style={{ color: v.color }}>{v.icon}</div>
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
        Alerts surface on the thread tree before integration conflicts happen.
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
              <div key={a} className="dia-arch-item dia-arch-agent">{a}</div>
            ))}
          </div>
        </div>
        <div className="dia-arch-arrow">{"\u2192"}<br />MCP<br />{"\u2192"}</div>
        <div className="dia-arch-col">
          <div className="dia-arch-label">Cloudflare Worker</div>
          <div className="dia-arch-box dia-arch-worker">
            <div className="dia-arch-box-title">eywa-mcp</div>
            <div className="dia-arch-box-detail">20 MCP tools</div>
            <div className="dia-arch-box-detail">Streamable HTTP + SSE</div>
            <div className="dia-arch-box-detail">Stateless</div>
          </div>
        </div>
        <div className="dia-arch-arrow">{"\u2192"}<br />REST<br />{"\u2192"}</div>
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
            Thread Tree {"\u00b7"} Thread View {"\u00b7"} Workspace + Gemini {"\u00b7"} 3D / XR
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
      // Title slide
      return (
        <div className="slide slide-title">
          <div className="slide-logo"><EywaLogoStatic size={80} /></div>
          <h1 className="slide-h1">{slidesData.title}</h1>
          <p className="slide-subtitle-main">{slidesData.subtitle}</p>
          <div className="slide-summary">
            {slidesData.summary.map((item, i) => (
              <div key={i} className="slide-summary-item">{item}</div>
            ))}
          </div>
        </div>
      );
    }

    if (current === totalSlides - 1) {
      // Closing slide
      return (
        <div className="slide slide-closing">
          <div className="slide-logo"><EywaLogoStatic size={80} /></div>
          <h1 className="slide-h1">{slidesData.closing.title}</h1>
          <p className="slide-subtitle-main">{slidesData.closing.subtitle}</p>
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
